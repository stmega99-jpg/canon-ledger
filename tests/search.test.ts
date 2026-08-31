import { describe, expect, it } from "vitest";
import type { SearchFilters, WorldSnapshot } from "../src/domain/types.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";
import { searchBeliefs, selectWorldAggregates } from "../src/selectors/search.ts";

const world = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));
const filters = (overrides: Partial<SearchFilters> = {}): SearchFilters => ({
  query: "",
  actorId: null,
  claimId: "sc-stole",
  stance: null,
  sourceType: null,
  conditionKind: null,
  ...overrides,
});

describe("bounded deterministic search", () => {
  it("paginates the 16 default-claim actors with unique aggregates", async () => {
    const source = world();
    const first = await searchBeliefs(source, "warehouse", filters(), null, 10);
    expect(first).toMatchObject({ code: "ok", total: 16, state: "many", limit: 10 });
    expect(first.rows).toHaveLength(10);
    expect(first.nextCursor).toBeTruthy();
    expect(first.rows.map((row) => row.actorId)).toEqual([
      "gen", "hana", "miyo", "nori", "sue", "tatsu", "aya", "aki", "emi", "jun",
    ]);
    expect(first.rows.slice(0, 6).every((row) => row.stance !== "unknown" || row.evidenceCount > 0)).toBe(true);
    expect(first.rows[6]).toMatchObject({
      actorId: "aya",
      stance: "unknown",
      evidenceCount: 0,
      rejectedTransfers: [{
        transferId: "tx-gen-aya-rejected",
        fromActorId: "gen",
        reasonCode: "low_trust",
      }],
    });
    const second = await searchBeliefs(source, "warehouse", filters(), first.nextCursor, 10);
    expect(second.rows).toHaveLength(6);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.rows, ...second.rows].map((row) => row.actorId)).size).toBe(16);

    const aggregates = selectWorldAggregates(source, "warehouse");
    expect(aggregates).toMatchObject({
      actorCount: 16,
      evaluatedBeliefCount: 16,
      defaultClaimId: "sc-stole",
      maxRumorDepth: 3,
      provenanceRootCount: 3,
      rejectedTransferCount: 1,
      registeredConditionCount: 4,
      violationCount: 1,
    });
    expect(Object.values(aggregates.stanceTotals).reduce((sum, count) => sum + count, 0)).toBe(16);
  });

  it("makes zero, one, Japanese, source, and condition filters explicit", async () => {
    const source = world();
    expect(await searchBeliefs(source, "warehouse", filters({ query: "絶対に存在しない" }), null, 10)).toMatchObject({
      code: "ok", total: 0, state: "zero", rows: [],
    });
    expect(await searchBeliefs(source, "warehouse", filters({ actorId: "gen" }), null, 10)).toMatchObject({
      code: "ok", total: 1, state: "one",
    });
    const japanese = await searchBeliefs(source, "warehouse", filters({ query: "工具箱" }), null, 25);
    expect(japanese.total).toBeGreaterThan(1);
    const witnessed = await searchBeliefs(source, "warehouse", filters({ sourceType: "witnessed" }), null, 25);
    expect(witnessed.rows.map((row) => row.actorId)).toEqual(["gen", "miyo"]);
    const dialogue = await searchBeliefs(source, "warehouse", filters({ conditionKind: "dialogue_condition" }), null, 25);
    expect(dialogue.total).toBe(1);
    expect(dialogue.rows[0]?.actorId).toBe("gen");

    const refused = await searchBeliefs(source, "warehouse", filters({ query: "low_trust" }), null, 10);
    expect(refused).toMatchObject({
      code: "ok",
      total: 1,
      rows: [{ actorId: "aya", evidenceCount: 0 }],
    });
  });

  it("rejects forged, stale, oversized, and filter-mismatched cursors", async () => {
    const source = world();
    const first = await searchBeliefs(source, "warehouse", filters(), null, 5);
    const cursor = first.nextCursor!;
    expect((await searchBeliefs(source, "warehouse", filters(), `${cursor}x`, 5)).code).toBe("invalid_cursor");
    expect((await searchBeliefs({ ...source, revision: 1 }, "warehouse", filters(), cursor, 5)).code).toBe("invalid_cursor");
    expect((await searchBeliefs(source, "warehouse", filters({ stance: "believed" }), cursor, 5)).code).toBe("invalid_cursor");
    expect((await searchBeliefs(source, "warehouse", filters(), "x".repeat(513), 5)).code).toBe("invalid_cursor");
    expect((await searchBeliefs(source, "warehouse", filters(), null, 100)).limit).toBe(25);
  });

  it("keeps a normal page below the 12 KiB result budget", async () => {
    const page = await searchBeliefs(world(), "warehouse", filters(), null, 10);
    expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(12 * 1024);
  });
});
