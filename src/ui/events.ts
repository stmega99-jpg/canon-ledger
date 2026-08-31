import type { ApplicationCommands, ConsistencyView, SearchCommandInput } from "../state/commands.ts";
import type { CanonLedgerStore } from "../state/store.ts";
import type { BeliefStance, GameConstraint, MemorySourceType } from "../domain/types.ts";
import type { RenderStatus, StatusTone } from "./render.ts";

export interface UiController {
  destroy(): void;
}

const nullable = (value: FormDataEntryValue | null): string | null => {
  const text = typeof value === "string" ? value : "";
  return text.length === 0 ? null : text;
};

export function wireApplicationEvents(
  root: HTMLElement,
  store: CanonLedgerStore,
  commands: ApplicationCommands,
  updateStatus: (status: RenderStatus) => void,
  rerender: () => Promise<void>,
): UiController {
  const report = async (message: string, tone: StatusTone = "neutral") => {
    updateStatus({ message, tone });
    await rerender();
  };

  const run = async (work: () => Promise<{ ok: boolean; code: string; summary: string }>) => {
    try {
      const result = await work();
      await report(`${result.code}: ${result.summary}`, result.ok ? "success" : result.code.includes("pending") ? "warning" : "danger");
    } catch (error) {
      await report(`unexpected_error: ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  };

  const submit = (event: SubmitEvent) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset["action"] !== "search") return;
    event.preventDefault();
    const data = new FormData(form);
    const input: SearchCommandInput = {
      query: String(data.get("query") ?? ""),
      actorId: nullable(data.get("actorId")),
      claimId: nullable(data.get("claimId")),
      stance: nullable(data.get("stance")) as BeliefStance | null,
      sourceType: nullable(data.get("sourceType")) as MemorySourceType | null,
      conditionKind: nullable(data.get("conditionKind")) as GameConstraint["kind"] | null,
      cursor: null,
      limit: 10,
    };
    void run(() => commands.search(input, "page-ui"));
  };

  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
    if (!target || !root.contains(target)) return;
    const action = target.dataset["action"];
    if (!action) return;
    if (target instanceof HTMLButtonElement) event.preventDefault();

    if (action === "reset-filters") {
      void run(() => commands.search({
        query: "", actorId: null, claimId: "sc-stole", stance: null,
        sourceType: null, conditionKind: null, cursor: null, limit: 10,
      }, "page-ui"));
    } else if (action === "next-page") {
      void run(() => commands.search({ cursor: target.dataset["cursor"] ?? null, limit: 10 }, "page-ui"));
    } else if (action === "first-page") {
      void run(() => commands.search({ cursor: null, limit: 10 }, "page-ui"));
    } else if (action === "trace-row") {
      void run(() => commands.trace({
        actorId: target.dataset["actorId"] ?? "",
        claimId: target.dataset["claimId"] ?? "",
        maxHops: 12,
      }, "page-ui"));
    } else if (action === "stage-demo") {
      const state = store.getState();
      void run(() => commands.suggest({
        incidentId: "warehouse",
        resolution: { relationId: "rel-warehouse-accounts", confirmClaimId: "sc-repaired" },
        expectedWorldRevision: state.world.revision,
        memoryPolicy: "review_archive",
        repairRegisteredWrongLayer: true,
      }, "page-ui"));
    } else if (action === "inspect-operation") {
      void run(() => commands.check({
        view: "selected_operation",
        operationId: target.dataset["operationId"] ?? "",
      }, "page-ui"));
    } else if (action === "condition-view") {
      void run(() => commands.check({ view: target.dataset["view"] as ConsistencyView }, "page-ui"));
    } else if (action === "review-operation") {
      const state = store.getState();
      const patch = state.stagedPatch;
      if (!patch) {
        void report("stale_patch: no active page-owned patch exists.", "danger");
        return;
      }
      const decision = target.dataset["decision"];
      if (decision !== "approved" && decision !== "rejected") {
        void report("invalid_input: decision is unsupported.", "danger");
        return;
      }
      void (async () => {
        const result = await store.recordDecision(
          patch.id,
          patch.patchRevision,
          target.dataset["operationId"] ?? "",
          decision,
        );
        await report(
          `${result.code}: ${decision} recorded via page-ui; ${result.plan?.pendingCount ?? "?"} pending.`,
          result.ok ? "success" : "danger",
        );
      })();
    } else if (action === "apply-patch") {
      const patch = store.getState().stagedPatch;
      if (!patch) {
        void report("invalid_input: no active patch exists.", "danger");
        return;
      }
      void run(() => commands.apply({ patchId: patch.id, patchRevision: patch.patchRevision }, "page-ui"));
    } else if (action === "reset-fixture") {
      if (!event.isTrusted) {
        void report("confirmation_required: reset requires a trusted page event.", "danger");
        return;
      }
      if (!window.confirm("Reset Canon Ledger to the checked-in warehouse fixture?")) {
        void report("confirmation_required: reset cancelled.", "neutral");
        return;
      }
      void (async () => {
        const result = await store.reset(true);
        await report(result.ok ? "ok: checked-in fixture restored." : `${result.code}: reset failed.`, result.ok ? "success" : "danger");
      })();
    }
  };

  root.addEventListener("submit", submit as EventListener);
  root.addEventListener("click", click);
  return {
    destroy() {
      root.removeEventListener("submit", submit as EventListener);
      root.removeEventListener("click", click);
    },
  };
}
