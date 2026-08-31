import { projectConstraints, summarizeConstraintProjection } from "../domain/constraints.ts";
import { createWarehousePatch, planReviewedPatch } from "../domain/patches.ts";
import type {
  AppState,
  AuditEntry,
  BeliefStance,
  GameConstraint,
  MemorySourceType,
  SearchFilters,
} from "../domain/types.ts";
import { selectActorClaimTrace } from "../selectors/provenance.ts";
import { searchBeliefs, selectWorldAggregates } from "../selectors/search.ts";
import { CanonLedgerStore, type CommandRoute } from "./store.ts";

export interface CommandReply<T> {
  ok: boolean;
  code: string;
  summary: string;
  data: T;
  pageState: {
    worldRevision: number;
    focusedPanel: string;
    patchId: string | null;
    patchRevision: number | null;
    pendingDecisions: number;
    selectedActorId: string | null;
    selectedClaimId: string | null;
  };
  audit: Pick<AuditEntry, "id" | "source" | "action" | "effect" | "code"> | null;
}

export interface SearchCommandInput {
  query?: string;
  actorId?: string | null;
  claimId?: string | null;
  stance?: BeliefStance | null;
  sourceType?: MemorySourceType | null;
  conditionKind?: GameConstraint["kind"] | null;
  cursor?: string | null;
  limit?: number;
}

export interface SuggestCommandInput {
  incidentId: string;
  resolution: { relationId: string; confirmClaimId: string };
  expectedWorldRevision: number;
  memoryPolicy: "preserve" | "review_archive";
  repairRegisteredWrongLayer: boolean;
}

export type ConsistencyView = "current" | "proposal" | "selected_operation" | "reviewed";

function currentPageState(state: AppState): CommandReply<unknown>["pageState"] {
  const patch = state.stagedPatch;
  const fingerprints = new Set(state.reviewDecisions.map((decision) =>
    `${decision.patchId}:${decision.patchRevision}:${decision.operationId}:${decision.operationFingerprint}`
  ));
  const pendingDecisions = patch === null
    ? 0
    : patch.operations.filter((operation) =>
        !state.reviewDecisions.some((decision) =>
          decision.patchId === patch.id &&
          decision.patchRevision === patch.patchRevision &&
          decision.operationId === operation.id &&
          fingerprints.has(`${decision.patchId}:${decision.patchRevision}:${decision.operationId}:${decision.operationFingerprint}`)
        )
      ).length;
  return {
    worldRevision: state.world.revision,
    focusedPanel: state.viewState.focusedPanel,
    patchId: patch?.id ?? null,
    patchRevision: patch?.patchRevision ?? null,
    pendingDecisions,
    selectedActorId: state.viewState.selectedActorId,
    selectedClaimId: state.viewState.selectedClaimId,
  };
}

function replyAudit(entry: AuditEntry | null | undefined): CommandReply<unknown>["audit"] {
  if (!entry) return null;
  return {
    id: entry.id,
    source: entry.source,
    action: entry.action,
    effect: entry.effect,
    code: entry.code,
  };
}

function nextPatchId(state: AppState, incidentId: string): string {
  const stem = `patch-${incidentId}-r${state.world.revision + 1}`;
  let attempt = 1;
  const receiptKeys = Object.keys(state.receipts);
  while (receiptKeys.some((key) => key.startsWith(`${stem}-a${attempt}@`))) attempt += 1;
  return `${stem}-a${attempt}`;
}

export class ApplicationCommands {
  private readonly now: () => string;

  constructor(private readonly store: CanonLedgerStore, now?: () => string) {
    this.now = now ?? (() => new Date().toISOString());
  }

  private reply<T>(
    ok: boolean,
    code: string,
    summary: string,
    data: T,
    audit: AuditEntry | null | undefined,
  ): CommandReply<T> {
    const state = this.store.getState();
    return { ok, code, summary, data, pageState: currentPageState(state), audit: replyAudit(audit) };
  }

  private async refuse<T>(
    route: CommandRoute,
    action: string,
    code: string,
    summary: string,
    data: T,
  ): Promise<CommandReply<T>> {
    const recorded = await this.store.recordCommandAttempt(route, action, code, summary);
    if (!recorded.ok) {
      return this.reply(false, recorded.code, "The attempt could not be recorded safely.", data, recorded.audit);
    }
    return this.reply(false, code, summary, data, recorded.audit);
  }

  async search(input: SearchCommandInput, route: CommandRoute): Promise<CommandReply<Awaited<ReturnType<typeof searchBeliefs>>>> {
    const state = this.store.getState();
    const current = state.viewState.filters;
    const filters: SearchFilters = {
      query: input.query ?? current.query,
      actorId: input.actorId === undefined ? current.actorId : input.actorId,
      claimId: input.claimId === undefined ? current.claimId : input.claimId,
      stance: input.stance === undefined ? current.stance : input.stance,
      sourceType: input.sourceType === undefined ? current.sourceType : input.sourceType,
      conditionKind: input.conditionKind === undefined ? current.conditionKind : input.conditionKind,
    };
    const result = await searchBeliefs(
      state.world,
      state.viewState.selectedIncidentId,
      filters,
      input.cursor ?? null,
      input.limit ?? 10,
    );
    if (result.code !== "ok") {
      return this.refuse(route, "search_world", result.code, "Search input or cursor was rejected.", result);
    }
    const saved = await this.store.replaceViewState({
      ...state.viewState,
      selectedActorId: filters.actorId,
      selectedClaimId: filters.claimId,
      focusedPanel: "beliefs",
      filters: result.filters,
      cursor: input.cursor ?? null,
    }, route, "search_world");
    if (!saved.ok) return this.reply(false, saved.code, "Search results were computed but page state could not be saved.", result, saved.audit);
    return this.reply(true, "ok", `Found ${result.total} belief rows; showing ${result.rows.length}.`, result, saved.audit);
  }

  async trace(
    input: { actorId: string; claimId: string; maxHops?: number },
    route: CommandRoute,
  ): Promise<CommandReply<ReturnType<typeof selectActorClaimTrace>>> {
    const state = this.store.getState();
    const result = selectActorClaimTrace(state.world, input.actorId, input.claimId, input.maxHops ?? 12);
    if (result.code !== "ok") {
      return this.refuse(route, "trace_claim_provenance", result.code, "Actor, claim, or belief was not found.", result);
    }
    const saved = await this.store.replaceViewState({
      ...state.viewState,
      selectedActorId: input.actorId,
      selectedClaimId: input.claimId,
      focusedPanel: "trace",
      filters: { ...state.viewState.filters, actorId: input.actorId, claimId: input.claimId },
      cursor: null,
    }, route, "trace_claim_provenance");
    if (!saved.ok) return this.reply(false, saved.code, "Trace was computed but page state could not be saved.", result, saved.audit);
    return this.reply(
      true,
      "ok",
      `Traced ${result.acceptedHops.length} accepted memories and ${result.rejectedAttempts.length} rejected attempts.`,
      result,
      saved.audit,
    );
  }

  async check(
    input: { view?: ConsistencyView; operationId?: string },
    route: CommandRoute,
  ): Promise<CommandReply<unknown>> {
    const state = this.store.getState();
    const view = input.view ?? "current";
    let authority: "current" | "provisional" | "final_reviewed" = "current";
    let pendingCount = 0;
    let rows = projectConstraints(state.world, state.world);
    const patch = state.stagedPatch;
    if (view !== "current") {
      if (!patch) return this.refuse(route, "check_world_consistency", "invalid_input", "No page-owned staged patch exists.", null);
      const plan = await planReviewedPatch(state.world, patch, state.reviewDecisions);
      pendingCount = plan.pendingCount;
      if (view === "proposal") {
        authority = "provisional";
        rows = plan.proposal.constraints;
      } else if (view === "selected_operation") {
        if (!input.operationId || !Object.hasOwn(plan.selected, input.operationId)) {
          return this.refuse(route, "check_world_consistency", "invalid_input", "Selected operation is not in the staged patch.", null);
        }
        authority = "provisional";
        rows = plan.selected[input.operationId]!.constraints;
      } else {
        if (plan.pendingCount !== 0 || !plan.reviewed || state.reviewedPreviewDigest !== plan.planDigest) {
          return this.refuse(route, "check_world_consistency", "review_preview_required", "A complete current page review is required.", null);
        }
        authority = "final_reviewed";
        rows = plan.reviewed.constraints;
      }
    }
    const summary = summarizeConstraintProjection(rows);
    const data = {
      authority,
      registeredOnly: true,
      patchId: patch?.id ?? null,
      patchRevision: patch?.patchRevision ?? null,
      pendingCount,
      summary,
      rows: rows.slice(0, 20).map((row) => {
        const id = row.valid ? row.before.constraintId : row.constraintId;
        const constraint = state.world.constraints[id];
        return row.valid
          ? {
              id,
              label: constraint?.label ?? id,
              kind: constraint?.kind ?? null,
              layer: constraint?.dependency.layer ?? null,
              transition: row.transition,
              beforeVerdict: row.beforeVerdict,
              afterVerdict: row.afterVerdict,
              definitionChanged: row.definitionChanged,
              causallyAffected: row.causallyAffected,
            }
          : {
              id,
              label: constraint?.label ?? id,
              kind: constraint?.kind ?? null,
              layer: constraint?.dependency.layer ?? null,
              transition: "unresolved",
              beforeVerdict: row.before.verdict,
              afterVerdict: row.after.verdict,
              definitionChanged: row.definitionChanged,
              causallyAffected: row.causallyAffected,
            };
      }),
    };
    const saved = await this.store.replaceViewState({
      ...state.viewState,
      focusedPanel: "conditions",
      previewMode: view === "selected_operation" ? "selected_operation" : view,
      selectedOperationId: view === "selected_operation" ? input.operationId ?? null : null,
    }, route, "check_world_consistency");
    if (!saved.ok) return this.reply(false, saved.code, "Condition view could not be saved.", data, saved.audit);
    return this.reply(true, "ok", `Evaluated ${summary.evaluated} registered conditions; violations ${summary.violatedBefore} → ${summary.violatedAfter}.`, data, saved.audit);
  }

  async suggest(input: SuggestCommandInput, route: CommandRoute): Promise<CommandReply<unknown>> {
    const state = this.store.getState();
    if (state.stagedPatch) {
      return this.refuse(route, "suggest_world_edit", "patch_already_open", "The existing page-owned patch must be reviewed or reset first.", null);
    }
    if (input.expectedWorldRevision !== state.world.revision) {
      return this.refuse(route, "suggest_world_edit", "stale_request", "Expected world revision is stale.", null);
    }
    const incident = state.world.incidents[input.incidentId];
    const relation = state.world.claimRelations[input.resolution.relationId];
    if (
      !incident || !relation ||
      !incident.claimIds.includes(input.resolution.confirmClaimId) ||
      !relation.claimIds.includes(input.resolution.confirmClaimId) ||
      (input.memoryPolicy !== "preserve" && input.memoryPolicy !== "review_archive") ||
      typeof input.repairRegisteredWrongLayer !== "boolean"
    ) return this.refuse(route, "suggest_world_edit", "invalid_input", "Suggestion must name the selected incident relation and safe policy.", null);
    const patch = createWarehousePatch(state.world, {
      id: nextPatchId(state, input.incidentId),
      patchRevision: 1,
      createdAt: this.now(),
      createdVia: route,
      repairRegisteredWrongLayer: input.repairRegisteredWrongLayer,
      memoryPolicy: input.memoryPolicy,
      relationId: relation.id,
      confirmClaimId: input.resolution.confirmClaimId,
    });
    const staged = await this.store.stagePatch(patch, route);
    if (!staged.ok) {
      const code = staged.code === "open_patch_exists" ? "patch_already_open" : staged.code;
      return this.reply(false, code, "Suggestion was not staged.", null, staged.audit);
    }
    return this.reply(true, "ok", `Staged ${patch.operations.length} independently reviewable operations.`, {
      patchId: patch.id,
      patchRevision: patch.patchRevision,
      baseWorldRevision: patch.baseWorldRevision,
      pendingCount: patch.operations.length,
      operations: patch.operations.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        reasonCode: operation.reasonCode,
        evidenceCount: operation.evidenceRefs.length,
      })),
    }, staged.audit);
  }

  async apply(
    input: { patchId: string; patchRevision: number },
    route: CommandRoute,
  ): Promise<CommandReply<unknown>> {
    const result = await this.store.apply(input.patchId, input.patchRevision, route);
    const ok = result.ok;
    return this.reply(ok, result.code, ok
      ? result.code === "already_applied" ? "Returned the existing immutable receipt." : "Applied only the reviewed operations."
      : "Apply committed no world data.", result.receipt ?? null, result.audit);
  }

  aggregates() {
    const state = this.store.getState();
    return selectWorldAggregates(state.world, state.viewState.selectedIncidentId);
  }
}
