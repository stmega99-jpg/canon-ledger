import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "../src/domain/types.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";
import { type StorageLike } from "../src/state/persistence.ts";
import { ApplicationCommands } from "../src/state/commands.ts";
import { CanonLedgerStore } from "../src/state/store.ts";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const fixture = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));
const clock = () => {
  let tick = 0;
  return () => `2026-08-31T01:${String(tick++).padStart(2, "0")}:00.000Z`;
};

async function setup() {
  const now = clock();
  const store = await CanonLedgerStore.create({ fixture: fixture(), storage: new MemoryStorage(), now });
  return { store, commands: new ApplicationCommands(store, now) };
}

describe("shared UI/tool application commands", () => {
  it("runs search, trace, 1→1→0 review, refusal, and reviewed-only Apply", async () => {
    const { store, commands } = await setup();
    const search = await commands.search({ query: "Hana", limit: 10 }, "site-tool");
    expect(search).toMatchObject({ ok: true, code: "ok", data: { total: 2 } });
    expect(store.getState().viewState.focusedPanel).toBe("beliefs");
    expect(search.audit).toMatchObject({ source: "site-tool", action: "search_world", effect: "view" });

    const trace = await commands.trace({ actorId: "nori", claimId: "sc-stole" }, "page-ui");
    expect(trace).toMatchObject({ ok: true, data: { acceptedDepth: 3, rootMemoryIds: ["mem-stole-gen-root"] } });
    expect(trace.data.rejectedAttempts).toHaveLength(1);

    const current = await commands.check({ view: "current" }, "page-ui");
    expect(current).toMatchObject({ ok: true, data: { authority: "current", summary: { violatedBefore: 1, violatedAfter: 1 } } });
    const suggestion = await commands.suggest({
      incidentId: "warehouse",
      resolution: { relationId: "rel-warehouse-accounts", confirmClaimId: "sc-repaired" },
      expectedWorldRevision: 0,
      memoryPolicy: "review_archive",
      repairRegisteredWrongLayer: true,
    }, "site-tool");
    expect(suggestion).toMatchObject({ ok: true, data: { patchRevision: 1, pendingCount: 3 } });
    expect(store.getState().stagedPatch?.createdVia).toBe("site-tool");

    const selected = await commands.check({ view: "selected_operation", operationId: "resolve-warehouse-canon" }, "site-tool");
    expect(selected).toMatchObject({
      ok: true,
      data: { authority: "provisional", summary: { violatedBefore: 1, violatedAfter: 1 } },
    });
    const selectedRows = (selected.data as { rows: Array<{ id: string; afterVerdict: string }> }).rows;
    expect(selectedRows.find((row) => row.id === "traveller_can_stay")?.afterVerdict).toBe("satisfied");
    expect(selectedRows.find((row) => row.id === "warehouse_dispute")?.afterVerdict).toBe("violated");

    const stagedPatch = store.getState().stagedPatch!;
    expect(await commands.apply({ patchId: stagedPatch.id, patchRevision: 1 }, "site-tool")).toMatchObject({
      ok: false,
      code: "pending_page_review",
    });
    expect(store.getState().world.revision).toBe(0);
    await store.recordDecision(stagedPatch.id, 1, "resolve-warehouse-canon", "approved");
    await store.recordDecision(stagedPatch.id, 1, "repair-warehouse-dispute-layer", "approved");
    await store.recordDecision(stagedPatch.id, 1, "archive-gen-root-memory", "rejected");
    const reviewed = await commands.check({ view: "reviewed" }, "page-ui");
    expect(reviewed).toMatchObject({
      ok: true,
      data: { authority: "final_reviewed", pendingCount: 0, summary: { violatedBefore: 1, violatedAfter: 0 } },
    });
    const applied = await commands.apply({ patchId: stagedPatch.id, patchRevision: 1 }, "site-tool");
    expect(applied).toMatchObject({ ok: true, code: "ok", data: { committedWorldRevision: 1 } });
    expect(store.getState().world.revision).toBe(1);
    expect(store.getState().world.beliefs["gen::sc-stole"]?.stance).toBe("believed");
    expect(store.getState().world.memories["mem-stole-gen-root"]?.beliefEligibility).toBe("active");
    expect((await commands.check({ view: "current" }, "page-ui")).data).toMatchObject({
      summary: { violatedBefore: 0, violatedAfter: 0 },
    });
  });

  it("does not overwrite an open patch and defaults normal suggestions to preserve", async () => {
    const { store, commands } = await setup();
    const input = {
      incidentId: "warehouse",
      resolution: { relationId: "rel-warehouse-accounts", confirmClaimId: "sc-repaired" },
      expectedWorldRevision: 0,
      memoryPolicy: "preserve" as const,
      repairRegisteredWrongLayer: true,
    };
    expect(await commands.suggest({ ...input, expectedWorldRevision: 9 }, "site-tool")).toMatchObject({ ok: false, code: "stale_request" });
    expect(await commands.suggest(input, "page-ui")).toMatchObject({ ok: true, data: { pendingCount: 2 } });
    const exactPatch = structuredClone(store.getState().stagedPatch);
    expect(exactPatch?.operations.map((operation) => operation.kind)).toEqual([
      "resolve_canon_relation", "replace_constraint_dependency",
    ]);
    expect(await commands.suggest(input, "site-tool")).toMatchObject({ ok: false, code: "patch_already_open" });
    expect(store.getState().stagedPatch).toEqual(exactPatch);
  });

  it("keeps normal shared command replies under 12 KiB", async () => {
    const { commands } = await setup();
    const replies = [
      await commands.search({ limit: 10 }, "page-ui"),
      await commands.trace({ actorId: "hana", claimId: "sc-stole", maxHops: 12 }, "page-ui"),
      await commands.check({ view: "current" }, "page-ui"),
    ];
    for (const reply of replies) {
      expect(new TextEncoder().encode(JSON.stringify(reply)).byteLength).toBeLessThanOrEqual(12 * 1024);
    }
  });

  it("serializes concurrent suggestions and preserves the first open patch", async () => {
    const { store, commands } = await setup();
    const base = {
      incidentId: "warehouse",
      resolution: { relationId: "rel-warehouse-accounts", confirmClaimId: "sc-repaired" },
      expectedWorldRevision: 0,
      repairRegisteredWrongLayer: true,
    };
    const [first, second] = await Promise.all([
      commands.suggest({ ...base, memoryPolicy: "preserve" }, "site-tool"),
      commands.suggest({ ...base, memoryPolicy: "review_archive" }, "site-tool"),
    ]);

    expect([first.code, second.code].sort()).toEqual(["ok", "patch_already_open"]);
    expect(store.getState().stagedPatch?.operations).toHaveLength(first.ok ? 2 : 3);
    expect(store.getState().audit.slice(-2).map((entry) => entry.code).sort()).toEqual([
      "ok",
      "patch_already_open",
    ]);
  });

  it("uses a fresh patch identity after an all-rejected no-op", async () => {
    const { store, commands } = await setup();
    const input = {
      incidentId: "warehouse",
      resolution: { relationId: "rel-warehouse-accounts", confirmClaimId: "sc-repaired" },
      expectedWorldRevision: 0,
      memoryPolicy: "preserve" as const,
      repairRegisteredWrongLayer: true,
    };
    expect(await commands.suggest(input, "site-tool")).toMatchObject({ ok: true, code: "ok" });
    const first = store.getState().stagedPatch!;
    for (const operation of first.operations) {
      expect(await store.recordDecision(first.id, first.patchRevision, operation.id, "rejected")).toMatchObject({ ok: true });
    }
    expect(await commands.apply({ patchId: first.id, patchRevision: first.patchRevision }, "site-tool")).toMatchObject({
      ok: true,
      code: "closed_noop",
    });
    expect(store.getState().world.revision).toBe(0);

    expect(await commands.suggest(input, "site-tool")).toMatchObject({ ok: true, code: "ok" });
    const second = store.getState().stagedPatch!;
    expect(second.id).not.toBe(first.id);
    for (const operation of second.operations) {
      expect(await store.recordDecision(second.id, second.patchRevision, operation.id, "approved")).toMatchObject({ ok: true });
    }
    expect(await commands.apply({ patchId: second.id, patchRevision: second.patchRevision }, "site-tool")).toMatchObject({
      ok: true,
      code: "ok",
    });
    expect(store.getState().world.revision).toBe(1);
  });

  it("binds duplicate Apply to a fresh no-change audit entry", async () => {
    const { store, commands } = await setup();
    await commands.suggest({
      incidentId: "warehouse",
      resolution: { relationId: "rel-warehouse-accounts", confirmClaimId: "sc-repaired" },
      expectedWorldRevision: 0,
      memoryPolicy: "preserve",
      repairRegisteredWrongLayer: true,
    }, "site-tool");
    const patch = store.getState().stagedPatch!;
    for (const operation of patch.operations) {
      await store.recordDecision(patch.id, patch.patchRevision, operation.id, "approved");
    }
    const applied = await commands.apply({ patchId: patch.id, patchRevision: patch.patchRevision }, "site-tool");
    const duplicate = await commands.apply({ patchId: patch.id, patchRevision: patch.patchRevision }, "site-tool");

    expect(applied).toMatchObject({ ok: true, code: "ok", audit: { effect: "world", code: "ok" } });
    expect(duplicate).toMatchObject({ ok: true, code: "already_applied", audit: { effect: "none", code: "already_applied" } });
    expect(duplicate.audit?.id).not.toBe(applied.audit?.id);
  });
});
