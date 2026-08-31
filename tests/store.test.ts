import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/domain/canonical.ts";
import { createWarehousePatch } from "../src/domain/patches.ts";
import type { WorldSnapshot } from "../src/domain/types.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";
import { type StorageLike } from "../src/state/persistence.ts";
import { CanonLedgerStore } from "../src/state/store.ts";

class FakeStorage implements StorageLike {
  readonly values = new Map<string, string>();
  corruptReads = 0;
  corruptAfterNextSet = false;
  setCalls = 0;
  failOnSetCall: number | null = null;

  getItem(key: string): string | null {
    if (this.corruptReads > 0) {
      this.corruptReads -= 1;
      return '{"corrupt":true}';
    }
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.failOnSetCall === this.setCalls) {
      throw new Error("set failed");
    }
    this.values.set(key, value);
    if (this.corruptAfterNextSet) {
      this.corruptAfterNextSet = false;
      this.corruptReads = 1;
    }
  }
  removeItem(key: string): void { this.values.delete(key); }
}

const fixture = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));
const clock = () => {
  let tick = 0;
  return () => `2026-08-31T00:${String(tick++).padStart(2, "0")}:00.000Z`;
};

async function staged(storage = new FakeStorage()) {
  const store = await CanonLedgerStore.create({ fixture: fixture(), storage, now: clock() });
  const candidate = createWarehousePatch(store.getState().world, {
    id: "patch-warehouse-001",
    patchRevision: 1,
    createdAt: "2026-08-31T00:00:00.000Z",
    createdVia: "page-ui",
    repairRegisteredWrongLayer: true,
    memoryPolicy: "review_archive",
  });
  expect(await store.stagePatch(candidate, "page-ui")).toMatchObject({ ok: true, code: "ok" });
  return { store, storage, candidate };
}

describe("single application store", () => {
  it("restores active review, refuses pending Apply, then commits only reviewed operations", async () => {
    const { store, storage, candidate } = await staged();
    const sourceWorld = structuredClone(store.getState().world);
    expect(await store.apply(candidate.id, candidate.patchRevision, "page-ui")).toMatchObject({
      ok: false,
      code: "pending_page_review",
    });
    expect(store.getState().world).toEqual(sourceWorld);

    expect(await store.recordDecision(candidate.id, 1, "resolve-warehouse-canon", "approved")).toMatchObject({ ok: true });
    expect(store.getState().reviewedPreviewDigest).toBeNull();
    expect(await store.recordDecision(candidate.id, 1, "repair-warehouse-dispute-layer", "approved")).toMatchObject({ ok: true });
    expect(await store.recordDecision(candidate.id, 1, "archive-gen-root-memory", "rejected")).toMatchObject({ ok: true });
    expect(store.getState().reviewedPreviewDigest).toMatch(/^sha256:/);

    const restored = await CanonLedgerStore.create({ fixture: fixture(), storage, now: clock() });
    expect(restored.getState().reviewDecisions).toHaveLength(3);
    expect(restored.getState().reviewedPreviewDigest).toBe(store.getState().reviewedPreviewDigest);
    const result = await restored.apply(candidate.id, candidate.patchRevision, "page-ui");
    expect(result).toMatchObject({ ok: true, code: "ok" });
    expect(result.receipt).toMatchObject({
      status: "applied",
      baseWorldRevision: 0,
      committedWorldRevision: 1,
      appliedOperationIds: ["resolve-warehouse-canon", "repair-warehouse-dispute-layer"],
      rejectedOperationIds: ["archive-gen-root-memory"],
    });
    expect(restored.getState().world.revision).toBe(1);
    expect(restored.getState().world.memories["mem-stole-gen-root"]).toEqual(sourceWorld.memories["mem-stole-gen-root"]);
    expect(restored.getState().world.beliefs["gen::sc-stole"]).toEqual(sourceWorld.beliefs["gen::sc-stole"]);
    expect(restored.getState().stagedPatch).toBeNull();

    const reloaded = await CanonLedgerStore.create({ fixture: fixture(), storage, now: clock() });
    expect(reloaded.getState().world.revision).toBe(1);
    expect(await reloaded.apply(candidate.id, candidate.patchRevision, "site-tool")).toMatchObject({
      ok: true,
      code: "already_applied",
      receipt: result.receipt,
    });
  });

  it("detects preview tampering and leaves the committed world byte-identical", async () => {
    const { store, candidate } = await staged();
    await store.recordDecision(candidate.id, 1, "resolve-warehouse-canon", "approved");
    await store.recordDecision(candidate.id, 1, "repair-warehouse-dispute-layer", "approved");
    await store.recordDecision(candidate.id, 1, "archive-gen-root-memory", "rejected");
    const before = canonicalJson(store.getState().world);
    store.getState().reviewedPreviewDigest = "sha256:tampered";
    expect(await store.apply(candidate.id, 1, "page-ui")).toMatchObject({
      ok: false,
      code: "preview_mismatch",
    });
    expect(canonicalJson(store.getState().world)).toBe(before);
  });

  it("keeps old memory state on storage failure and disables writes if rollback cannot verify", async () => {
    const first = await staged();
    const before = canonicalJson(first.store.getState());
    first.storage.failOnSetCall = first.storage.setCalls + 1;
    expect(await first.store.recordDecision(first.candidate.id, 1, "resolve-warehouse-canon", "approved")).toMatchObject({
      ok: false,
      code: "persistence_failed",
    });
    expect(canonicalJson(first.store.getState())).toBe(before);

    first.storage.corruptAfterNextSet = true;
    first.storage.failOnSetCall = first.storage.setCalls + 2;
    expect(await first.store.recordDecision(first.candidate.id, 1, "resolve-warehouse-canon", "approved")).toMatchObject({
      ok: false,
      code: "writes_disabled",
    });
    expect(first.store.getState().writeState).toBe("writes_disabled");
    expect(await first.store.apply(first.candidate.id, 1, "page-ui")).toMatchObject({
      ok: false,
      code: "writes_disabled",
    });
  });
});
