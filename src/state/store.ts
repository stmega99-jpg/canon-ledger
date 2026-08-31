import { canonicalDigest } from "../domain/canonical.ts";
import {
  createReviewDecision,
  planReviewedPatch,
  preflightReviewedApply,
  validatePatchShape,
  type ReviewedPatchPlan,
} from "../domain/patches.ts";
import type {
  AppState,
  ApplyReceipt,
  AuditEntry,
  Patch,
  ReviewDecision,
  WorldSnapshot,
} from "../domain/types.ts";
import { validateWorldSnapshot } from "../domain/validate.ts";
import {
  loadPersistedState,
  parseAppState,
  persistVerifiedState,
  STORAGE_KEY,
  type StorageLike,
} from "./persistence.ts";

export type CommandRoute = "page-ui" | "site-tool";

export interface StoreResult {
  ok: boolean;
  code: string;
  plan?: ReviewedPatchPlan;
  receipt?: ApplyReceipt;
  audit?: AuditEntry;
}

export interface StoreOptions {
  fixture: WorldSnapshot;
  storage: StorageLike;
  now?: () => string;
  storageKey?: string;
}

type Listener = (state: AppState) => void;

const receiptKey = (patchId: string, patchRevision: number): string => `${patchId}@${patchRevision}`;

function initialFilters(defaultClaimId: string): AppState["viewState"]["filters"] {
  return {
    query: "",
    actorId: null,
    claimId: defaultClaimId,
    stance: null,
    sourceType: null,
    conditionKind: null,
  };
}

export function createInitialAppState(fixture: WorldSnapshot): AppState {
  const world = validateWorldSnapshot(structuredClone(fixture));
  const incident = Object.values(world.incidents).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!incident) throw new Error("Fixture needs an incident");
  return parseAppState({
    appSchemaVersion: 1,
    writeState: "enabled",
    world,
    stagedPatch: null,
    reviewDecisions: [],
    reviewedPreviewDigest: null,
    receipts: {},
    audit: [],
    viewState: {
      selectedIncidentId: incident.id,
      selectedActorId: null,
      selectedClaimId: incident.defaultClaimId,
      focusedPanel: "beliefs",
      filters: initialFilters(incident.defaultClaimId),
      cursor: null,
      previewMode: "current",
      selectedOperationId: null,
    },
  });
}

function appendBoundedAudit(entries: readonly AuditEntry[], entry: AuditEntry): AuditEntry[] {
  const next = [...entries, entry];
  while (next.length > 200) {
    const disposable = next.findIndex((candidate) => candidate.effect === "view" || candidate.effect === "none");
    next.splice(disposable >= 0 ? disposable : 0, 1);
  }
  return next;
}

export class CanonLedgerStore {
  private state: AppState;
  private readonly fixture: WorldSnapshot;
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  private readonly now: () => string;
  private readonly listeners = new Set<Listener>();
  private auditSequence = 0;
  private transitionTail: Promise<void> = Promise.resolve();

  private constructor(options: StoreOptions, state: AppState) {
    this.fixture = validateWorldSnapshot(structuredClone(options.fixture));
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? STORAGE_KEY;
    this.now = options.now ?? (() => new Date().toISOString());
    this.state = state;
    this.auditSequence = state.audit.length;
  }

  static async create(options: StoreOptions): Promise<CanonLedgerStore> {
    const loaded = loadPersistedState(options.storage, options.storageKey ?? STORAGE_KEY);
    const fallback = createInitialAppState(options.fixture);
    const state = loaded.state ?? fallback;
    return new CanonLedgerStore(options, state);
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private enqueue<T>(transition: () => Promise<T>): Promise<T> {
    const result = this.transitionTail.then(transition, transition);
    this.transitionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private audit(
    state: AppState,
    route: AuditEntry["source"],
    action: string,
    effect: AuditEntry["effect"],
    code: string,
    summary: string,
    beforeRevision: number,
    afterRevision: number,
    patch: Patch | null = null,
  ): AuditEntry[] {
    const at = this.now();
    const base: AuditEntry = {
      id: `audit-${String(++this.auditSequence).padStart(4, "0")}-${at}`,
      at,
      source: route,
      action,
      effect,
      code,
      worldRevisionBefore: beforeRevision,
      worldRevisionAfter: afterRevision,
      summary,
    };
    const entry = patch
      ? { ...base, patchId: patch.id, patchRevision: patch.patchRevision }
      : base;
    return appendBoundedAudit(state.audit, entry);
  }

  private async save(next: AppState, expectedWorldDigest: string | null = null): Promise<StoreResult> {
    if (this.state.writeState === "writes_disabled") return { ok: false, code: "writes_disabled" };
    const persisted = await persistVerifiedState(
      this.storage,
      next,
      this.storageKey,
      expectedWorldDigest,
    );
    if (!persisted.ok || !persisted.state) {
      if (!persisted.rollbackVerified) {
        this.state = {
          ...this.state,
          writeState: "writes_disabled",
          audit: this.audit(
            this.state,
            "system",
            "persistence_recovery",
            "none",
            "writes_disabled",
            "Rollback could not be verified; further writes are disabled.",
            this.state.world.revision,
            this.state.world.revision,
          ),
        };
        this.notify();
        return { ok: false, code: "writes_disabled" };
      }
      return { ok: false, code: persisted.code };
    }
    this.state = persisted.state;
    this.notify();
    return { ok: true, code: "ok" };
  }

  private async recordAuditEntry(
    route: AuditEntry["source"],
    action: string,
    effect: AuditEntry["effect"],
    code: string,
    summary: string,
    patch: Patch | null = this.state.stagedPatch,
  ): Promise<StoreResult> {
    const audit = this.audit(
      this.state,
      route,
      action,
      effect,
      code,
      summary,
      this.state.world.revision,
      this.state.world.revision,
      patch,
    );
    const entry = audit.at(-1)!;
    const next = { ...this.state, audit };
    if (this.state.writeState === "writes_disabled") {
      this.state = next;
      this.notify();
      return { ok: true, code: "ok", audit: entry };
    }
    const saved = await this.save(next);
    return saved.ok ? { ...saved, audit: entry } : saved;
  }

  private async recordRefusal(
    route: CommandRoute,
    action: string,
    code: string,
    summary: string,
    patch: Patch | null,
  ): Promise<StoreResult> {
    const recorded = await this.recordAuditEntry(route, action, "none", code, summary, patch);
    return recorded.ok ? { ok: false, code, audit: recorded.audit! } : recorded;
  }

  async recordCommandAttempt(
    route: CommandRoute,
    action: string,
    code: string,
    summary: string,
  ): Promise<StoreResult> {
    return this.enqueue(() => this.recordAuditEntry(route, action, "none", code, summary));
  }

  async stagePatch(patch: Patch, route: CommandRoute): Promise<StoreResult> {
    return this.enqueue(async () => {
    if (this.state.writeState === "writes_disabled") {
      return this.recordRefusal(route, "stage_patch", "writes_disabled", "Writes are disabled after an unverified rollback.", patch);
    }
    if (this.state.stagedPatch) {
      return this.recordRefusal(route, "stage_patch", "patch_already_open", "An existing patch is still open.", this.state.stagedPatch);
    }
    const shape = validatePatchShape(patch);
    if (!shape.ok || patch.worldId !== this.state.world.worldId || patch.baseWorldRevision !== this.state.world.revision) {
      return this.recordRefusal(route, "stage_patch", "invalid_patch", "The proposed patch is malformed or stale.", patch);
    }
    const plan = await planReviewedPatch(this.state.world, patch, []);
    if (plan.code !== "ok") {
      return this.recordRefusal(route, "stage_patch", plan.code, "The proposed patch did not pass operation validation.", patch);
    }
    const next: AppState = {
      ...this.state,
      stagedPatch: structuredClone(patch),
      reviewDecisions: [],
      reviewedPreviewDigest: null,
      viewState: {
        ...this.state.viewState,
        focusedPanel: "suggestions",
        previewMode: "proposal",
        selectedOperationId: null,
      },
      audit: this.audit(
        this.state,
        route,
        "stage_patch",
        "workflow",
        "ok",
        `Staged ${patch.operations.length} operations for page review.`,
        this.state.world.revision,
        this.state.world.revision,
        patch,
      ),
    };
    const saved = await this.save(next);
    return saved.ok ? { ...saved, plan, audit: next.audit.at(-1)! } : saved;
    });
  }

  async recordDecision(
    patchId: string,
    patchRevision: number,
    operationId: string,
    decision: ReviewDecision["decision"],
  ): Promise<StoreResult> {
    return this.enqueue(async () => {
    const patch = this.state.stagedPatch;
    if (!patch || patch.id !== patchId || patch.patchRevision !== patchRevision) {
      return this.recordRefusal("page-ui", "review_operation", "stale_patch", "The page review no longer names the active patch.", patch);
    }
    const operation = patch.operations.find((candidate) => candidate.id === operationId);
    if (!operation || (decision !== "approved" && decision !== "rejected")) {
      return this.recordRefusal("page-ui", "review_operation", "invalid_input", "The operation or decision is invalid.", patch);
    }
    const bound = await createReviewDecision(patch, operationId, decision, this.now());
    const decisions = [
      ...this.state.reviewDecisions.filter((current) =>
        !(current.patchId === patch.id && current.patchRevision === patch.patchRevision && current.operationId === operationId)
      ),
      bound,
    ];
    const plan = await planReviewedPatch(this.state.world, patch, decisions);
    const reviewedPreviewDigest = plan.pendingCount === 0 ? plan.planDigest : null;
    const next: AppState = {
      ...this.state,
      reviewDecisions: decisions,
      reviewedPreviewDigest,
      viewState: {
        ...this.state.viewState,
        focusedPanel: "suggestions",
        previewMode: plan.pendingCount === 0 ? "reviewed" : "proposal",
        selectedOperationId: operationId,
      },
      audit: this.audit(
        this.state,
        "page-ui",
        "review_operation",
        "workflow",
        "ok",
        `${decision === "approved" ? "Approved" : "Rejected"} ${operationId}; ${plan.pendingCount} pending.`,
        this.state.world.revision,
        this.state.world.revision,
        patch,
      ),
    };
    const saved = await this.save(next);
    return saved.ok ? { ...saved, plan, audit: next.audit.at(-1)! } : saved;
    });
  }

  async apply(patchId: string, patchRevision: number, route: CommandRoute): Promise<StoreResult> {
    return this.enqueue(async () => {
    if (this.state.writeState === "writes_disabled") {
      return this.recordRefusal(route, "apply_patch", "writes_disabled", "Writes are disabled after an unverified rollback.", this.state.stagedPatch);
    }
    const key = receiptKey(patchId, patchRevision);
    const existing = this.state.receipts[key];
    const patch = this.state.stagedPatch;
    if (!patch) {
      if (existing) {
        const recorded = await this.recordAuditEntry(
          route,
          "apply_patch",
          "none",
          "already_applied",
          "Returned the existing immutable receipt without changing the world.",
          null,
        );
        return recorded.ok
          ? { ok: true, code: "already_applied", receipt: existing, audit: recorded.audit! }
          : recorded;
      }
      return this.recordRefusal(route, "apply_patch", "invalid_input", "No matching staged patch exists.", null);
    }
    if (patch.id !== patchId || patch.patchRevision !== patchRevision) {
      return this.recordRefusal(route, "apply_patch", "stale_patch", "The requested patch is not the active revision.", patch);
    }
    const preflight = await preflightReviewedApply(
      this.state.world,
      patch,
      this.state.reviewDecisions,
      this.state.reviewedPreviewDigest,
      existing ?? null,
    );
    if (preflight.code === "already_applied" && preflight.receipt) {
      const recorded = await this.recordAuditEntry(
        route,
        "apply_patch",
        "none",
        "already_applied",
        "Returned the existing immutable receipt without changing the world.",
        patch,
      );
      return recorded.ok
        ? { ok: true, code: preflight.code, receipt: preflight.receipt, audit: recorded.audit! }
        : recorded;
    }
    if (preflight.code !== "ready" && preflight.code !== "closed_noop") {
      return this.recordRefusal(route, "apply_patch", preflight.code, "Apply committed no world data.", patch);
    }
    const plan = preflight.plan;
    if (!plan?.reviewed) return this.recordRefusal(route, "apply_patch", "review_preview_required", "Final preview is unavailable.", patch);
    const nextWorld = preflight.code === "ready" ? plan.reviewed.world : this.state.world;
    const receipt: ApplyReceipt = {
      status: preflight.code === "ready" ? "applied" : "closed_noop",
      worldId: patch.worldId,
      patchId: patch.id,
      patchRevision: patch.patchRevision,
      patchFingerprint: plan.patchFingerprint,
      baseWorldRevision: patch.baseWorldRevision,
      committedWorldRevision: nextWorld.revision,
      planDigest: plan.planDigest,
      appliedOperationIds: plan.approvedOperationIds,
      rejectedOperationIds: plan.rejectedOperationIds,
      committedAt: this.now(),
    };
    const next: AppState = {
      ...this.state,
      world: nextWorld,
      stagedPatch: null,
      reviewDecisions: [],
      reviewedPreviewDigest: null,
      receipts: { ...this.state.receipts, [key]: receipt },
      viewState: {
        ...this.state.viewState,
        focusedPanel: "conditions",
        previewMode: "current",
        selectedOperationId: null,
      },
      audit: this.audit(
        this.state,
        route,
        "apply_patch",
        preflight.code === "ready" ? "world" : "workflow",
        preflight.code === "ready" ? "ok" : "closed_noop",
        preflight.code === "ready"
          ? `Committed ${receipt.appliedOperationIds.length} reviewed operations.`
          : "Closed an all-rejected patch without changing the world.",
        this.state.world.revision,
        nextWorld.revision,
        patch,
      ),
    };
    const expectedWorldDigest = await canonicalDigest(nextWorld);
    const saved = await this.save(next, expectedWorldDigest);
    return saved.ok
      ? {
          ok: true,
          code: preflight.code === "ready" ? "ok" : "closed_noop",
          receipt,
          plan,
          audit: next.audit.at(-1)!,
        }
      : saved;
    });
  }

  async reset(confirmed: boolean): Promise<StoreResult> {
    return this.enqueue(async () => {
    if (!confirmed) return { ok: false, code: "confirmation_required" };
    if (this.state.writeState === "writes_disabled") {
      return this.recordRefusal("page-ui", "reset_fixture", "writes_disabled", "Writes are disabled after an unverified rollback.", null);
    }
    const initial = createInitialAppState(this.fixture);
    const next: AppState = {
      ...initial,
      audit: this.audit(
        initial,
        "page-ui",
        "reset_fixture",
        "world",
        "ok",
        "Restored the checked-in fixture and cleared workflow state.",
        this.state.world.revision,
        initial.world.revision,
      ),
    };
    const saved = await this.save(next, await canonicalDigest(initial.world));
    return saved.ok ? { ...saved, audit: next.audit.at(-1)! } : saved;
    });
  }

  async replaceViewState(viewState: AppState["viewState"], route: CommandRoute, action: string): Promise<StoreResult> {
    return this.enqueue(async () => {
    const next: AppState = {
      ...this.state,
      viewState,
      audit: this.audit(
        this.state,
        route,
        action,
        "view",
        "ok",
        "Updated the bounded page view.",
        this.state.world.revision,
        this.state.world.revision,
        this.state.stagedPatch,
      ),
    };
    if (this.state.writeState === "writes_disabled") {
      this.state = next;
      this.notify();
      return { ok: true, code: "ok", audit: next.audit.at(-1)! };
    }
    const saved = await this.save(next);
    return saved.ok ? { ...saved, audit: next.audit.at(-1)! } : saved;
    });
  }
}
