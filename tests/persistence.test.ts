import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/domain/canonical.ts";
import type { AppState, WorldSnapshot } from "../src/domain/types.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";
import {
  loadPersistedState,
  parseAppState,
  persistVerifiedState,
  STORAGE_KEY,
  type StorageLike,
} from "../src/state/persistence.ts";
import { createInitialAppState } from "../src/state/store.ts";

class FakeStorage implements StorageLike {
  readonly values = new Map<string, string>();
  setCalls = 0;
  failOnSetCall: number | null = null;
  corruptReads = 0;
  corruptAfterNextSet = false;

  getItem(key: string): string | null {
    if (this.corruptReads > 0) {
      this.corruptReads -= 1;
      return '{"corrupted":true}';
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.failOnSetCall === this.setCalls) {
      throw new Error("quota");
    }
    this.values.set(key, value);
    if (this.corruptAfterNextSet) {
      this.corruptAfterNextSet = false;
      this.corruptReads = 1;
    }
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const fixture = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));
const state = (): AppState => createInitialAppState(fixture());

describe("verified single-envelope persistence", () => {
  it("round-trips only structurally valid state", async () => {
    const storage = new FakeStorage();
    const current = state();
    const result = await persistVerifiedState(storage, current);
    expect(result).toMatchObject({ ok: true, code: "ok", rollbackVerified: true });
    expect(result.state).toEqual(current);
    expect(storage.getItem(STORAGE_KEY)).toBe(canonicalJson(current));
    expect(loadPersistedState(storage)).toMatchObject({ code: "ok", state: current });

    const forged = structuredClone(current) as unknown as Record<string, unknown>;
    (forged["viewState"] as Record<string, unknown>)["extra"] = true;
    expect(() => parseAppState(forged)).toThrow(/unsupported fields/);
  });

  it("keeps the prior raw state on write and readback failures", async () => {
    const storage = new FakeStorage();
    const previous = state();
    storage.values.set(STORAGE_KEY, canonicalJson(previous));
    const next = structuredClone(previous);
    next.viewState.focusedPanel = "conditions";

    storage.failOnSetCall = storage.setCalls + 1;
    expect(await persistVerifiedState(storage, next)).toMatchObject({
      ok: false,
      code: "persistence_failed",
      rollbackVerified: true,
    });
    expect(storage.getItem(STORAGE_KEY)).toBe(canonicalJson(previous));

    storage.failOnSetCall = null;
    storage.corruptAfterNextSet = true;
    expect(await persistVerifiedState(storage, next)).toMatchObject({
      ok: false,
      code: "verification_failed",
      rollbackVerified: true,
    });
    expect(storage.getItem(STORAGE_KEY)).toBe(canonicalJson(previous));
  });

  it("reports rollback failure instead of manufacturing success", async () => {
    const storage = new FakeStorage();
    const previous = state();
    storage.values.set(STORAGE_KEY, canonicalJson(previous));
    const next = structuredClone(previous);
    next.viewState.focusedPanel = "conditions";
    storage.corruptAfterNextSet = true;
    storage.failOnSetCall = storage.setCalls + 2;
    expect(await persistVerifiedState(storage, next)).toMatchObject({
      ok: false,
      code: "rollback_failed",
      rollbackVerified: false,
    });
  });

  it("rejects corrupt restored authority instead of filling defaults", () => {
    const current = state();
    const corrupt = structuredClone(current);
    corrupt.reviewDecisions = [{
      patchId: "p",
      patchRevision: 1,
      operationId: "op",
      operationFingerprint: "sha256:x",
      decision: "approved",
      decidedVia: "page-ui",
      decidedAt: "2026-08-31T00:00:00.000Z",
    }];
    (corrupt.reviewDecisions[0] as unknown as { decidedVia: string }).decidedVia = "site-tool";
    expect(() => parseAppState(corrupt)).toThrow(/must be page-ui/);

    const malformedReceipt = state();
    malformedReceipt.receipts["p@1"] = {
      status: "applied",
      worldId: malformedReceipt.world.worldId,
      patchId: "p",
      patchRevision: 1,
      patchFingerprint: "sha256:x",
      baseWorldRevision: 0,
      committedWorldRevision: 1,
      planDigest: "sha256:y",
      appliedOperationIds: [],
      rejectedOperationIds: [],
      committedAt: "not-a-date",
    };
    expect(() => parseAppState(malformedReceipt)).toThrow(/canonical ISO timestamp/);
  });

  it("rejects dangling view and workflow references before they can break rendering", () => {
    const missingIncident = state();
    missingIncident.viewState.selectedIncidentId = "missing";
    expect(() => parseAppState(missingIncident)).toThrow(/selectedIncidentId.*existing incident/);

    const unknownFilterActor = state();
    unknownFilterActor.viewState.filters.actorId = "missing";
    expect(() => parseAppState(unknownFilterActor)).toThrow(/filters.actorId.*existing record/);

    const orphanPreview = state();
    orphanPreview.viewState.previewMode = "proposal";
    expect(() => parseAppState(orphanPreview)).toThrow(/previewMode.*staged patch/);

    const orphanDecision = state();
    orphanDecision.reviewDecisions = [{
      patchId: "missing",
      patchRevision: 1,
      operationId: "missing",
      operationFingerprint: "sha256:x",
      decision: "approved",
      decidedVia: "page-ui",
      decidedAt: "2026-08-31T00:00:00.000Z",
    }];
    expect(() => parseAppState(orphanDecision)).toThrow(/must be empty without a staged patch/);

    const storage = new FakeStorage();
    storage.values.set(STORAGE_KEY, canonicalJson(missingIncident));
    expect(loadPersistedState(storage)).toMatchObject({ code: "invalid", state: null });
  });
});
