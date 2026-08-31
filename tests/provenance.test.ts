import { describe, expect, it } from "vitest";
import { contradictionGroups, traceProvenance } from "../src/domain/provenance.ts";
import { selectActorClaimTrace } from "../src/selectors/provenance.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import type { Claim, ClaimRelation, WorldSnapshot } from "../src/domain/types.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";

const fixture = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));

describe("immutable provenance", () => {
  it("selects a bounded actor/claim trace with accepted, distorted, and rejected paths", () => {
    const source = fixture();
    const trace = selectActorClaimTrace(source, "nori", "sc-stole", 12);
    expect(trace).toMatchObject({
      code: "ok",
      stance: "believed",
      rootMemoryIds: ["mem-stole-gen-root"],
      acceptedDepth: 3,
      truncated: false,
    });
    expect(trace.acceptedHops.map((hop) => hop.hop)).toEqual([0, 1, 2, 3]);
    expect(trace.acceptedHops.filter((hop) => hop.distorted)).toHaveLength(3);
    expect(trace.rejectedAttempts).toEqual([
      expect.objectContaining({ transferId: "tx-gen-aya-rejected", reasonCode: "low_trust" }),
    ]);
    expect(selectActorClaimTrace(source, "nori", "sc-stole", 2)).toMatchObject({ truncated: true });
    expect(selectActorClaimTrace(source, "ghost", "sc-stole", 12)).toMatchObject({ code: "invalid_input" });
  });

  it("traces the depth-three chain to its stored root and keeps rejection as a branch", () => {
    const trace = traceProvenance(fixture(), "mem-stole-nori-from-sue");
    expect(trace.problems).toEqual([]);
    expect(trace.acceptedDepth).toBe(3);
    expect(trace.rootMemoryId).toBe("mem-stole-gen-root");
    expect(trace.hops.map((hop) => hop.memoryId)).toEqual([
      "mem-stole-nori-from-sue",
      "mem-stole-sue-from-hana",
      "mem-stole-hana-from-gen",
      "mem-stole-gen-root",
    ]);
    expect(trace.rejectedAttempts).toMatchObject([
      { transferId: "tx-gen-aya-rejected", reasonCode: "low_trust" },
    ]);
  });

  it("shows a rejected incoming rumor even when it created no accepted memory", () => {
    const trace = selectActorClaimTrace(fixture(), "aya", "sc-stole", 12);
    expect(trace).toMatchObject({
      code: "ok",
      stance: "unknown",
      evidenceMemoryIds: [],
      acceptedHops: [],
      rejectedAttempts: [{
        transferId: "tx-gen-aya-rejected",
        fromActorId: "gen",
        toActorId: "aya",
        reasonCode: "low_trust",
      }],
    });
  });

  it("reports missing links, cycles, hop mismatch, and root mismatch without inventing hops", () => {
    const missing = fixture();
    delete missing.memories["mem-stole-sue-from-hana"];
    expect(traceProvenance(missing, "mem-stole-nori-from-sue").problems.map((p) => p.code)).toContain("missing_parent");

    const cycle = fixture();
    cycle.memories["mem-stole-hana-from-gen"]!.sourceMemoryId = "mem-stole-nori-from-sue";
    expect(traceProvenance(cycle, "mem-stole-nori-from-sue").problems.map((p) => p.code)).toContain("cycle");

    const mismatch = fixture();
    mismatch.memories["mem-stole-nori-from-sue"]!.hop = 9;
    mismatch.memories["mem-stole-nori-from-sue"]!.provenanceRootMemoryId = "mem-stole-miyo-root";
    const codes = traceProvenance(mismatch, "mem-stole-nori-from-sue").problems.map((p) => p.code);
    expect(codes).toContain("hop_mismatch");
    expect(codes).toContain("root_mismatch");
  });

  it("builds transitive, input-order-independent contradiction groups including singletons", () => {
    const claims: Claim[] = ["c", "a", "d", "b"].map((id) => ({
      id,
      canonical: { ja: id, en: id },
      subjectActorId: null,
      subjectValence: 0,
    }));
    const relation = (id: string, a: string, b: string): ClaimRelation => ({
      id,
      entityRevision: 0,
      kind: "mutually_exclusive",
      claimIds: [a, b],
    });
    const relations = [relation("r2", "b", "c"), relation("r1", "a", "b")];
    expect(contradictionGroups(claims, relations)).toEqual([["a", "b", "c"], ["d"]]);
    expect(contradictionGroups([...claims].reverse(), [...relations].reverse())).toEqual([
      ["a", "b", "c"],
      ["d"],
    ]);
  });
});
