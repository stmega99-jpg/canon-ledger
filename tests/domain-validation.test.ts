import { describe, expect, it } from "vitest";
import { evaluateBeliefs, toScoringMemory } from "../src/domain/beliefs.ts";
import { canonicalDigest, canonicalJson, roundCanonical } from "../src/domain/canonical.ts";
import { decayedConfidence } from "../src/domain/scoring.ts";
import { DomainValidationError, validateWorldSnapshot } from "../src/domain/validate.ts";
import type { WorldSnapshot } from "../src/domain/types.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";

const copy = (): WorldSnapshot => structuredClone(fixtureJson) as unknown as WorldSnapshot;

describe("manual domain validation and canonical encoding", () => {
  it("validates the checked-in world without supplying defaults", () => {
    expect(validateWorldSnapshot(copy()).worldId).toBe("warehouse-demo-v1");
    const missing = copy() as unknown as { memories: Record<string, Record<string, unknown>> };
    delete missing.memories["mem-stole-gen-root"]!["importance"];
    expect(() => validateWorldSnapshot(missing)).toThrow(DomainValidationError);
  });

  it("adapts every scoring field and rejects an invalid date", () => {
    const memory = copy().memories["mem-stole-hana-from-gen"]!;
    const row = toScoringMemory(memory);
    expect(row).toMatchObject({
      memoryId: memory.id,
      ownerNpcId: memory.actorId,
      sourceMemoryId: memory.sourceMemoryId,
      provenanceRootMemoryId: memory.provenanceRootMemoryId,
      surfaceJa: memory.surfaceText.ja,
      confidenceAtAcq: memory.confidenceAtAcq,
      importance: memory.importance,
      emotionalWeight: memory.emotionalWeight,
      emotionType: memory.emotionType,
    });
    const invalid = copy();
    invalid.memories["mem-stole-gen-root"]!.acquiredAt = "not-a-date";
    expect(() => validateWorldSnapshot(invalid)).toThrow(/valid ISO date/);
  });

  it("uses six-decimal persistence and stable key-sorted SHA-256", async () => {
    expect(roundCanonical(0.12345678)).toBe(0.123457);
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(await canonicalDigest({ b: 2, a: 1 })).toBe(await canonicalDigest({ a: 1, b: 2 }));
    expect(() => canonicalJson({ broken: Number.NaN })).toThrow(/non-finite/);
    const withPrototypeKey = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}') as object;
    expect(canonicalJson(withPrototypeKey)).toBe('{"__proto__":{"polluted":true},"safe":1}');
    expect(await canonicalDigest(withPrototypeKey)).not.toBe(await canonicalDigest({ safe: 1 }));
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => canonicalJson(sparse)).toThrow(/dense JSON array/);
    const decorated = [1] as number[] & { label?: string };
    decorated.label = "ignored by JSON.stringify";
    expect(() => canonicalJson(decorated)).toThrow(/dense JSON array/);
    expect(canonicalJson([null])).toBe("[null]");
  });

  it("rejects broken relationship, transfer, belief, and reference invariants", () => {
    const relationship = copy();
    delete relationship.relationships["hana::gen"];
    expect(() => validateWorldSnapshot(relationship)).toThrow(/missing directed relationship/);

    const rejection = copy();
    const transfer = rejection.rumorTransfers["tx-gen-aya-rejected"]!;
    if (transfer.outcome === "rejected") {
      transfer.trustAtTransfer = transfer.acceptanceThreshold;
      rejection.relationships["aya::gen"]!.trust = transfer.acceptanceThreshold;
    }
    expect(() => validateWorldSnapshot(rejection)).toThrow(/low_trust rejection/);

    const belief = copy();
    belief.beliefs["gen::sc-stole"]!.supportScore += 0.1;
    expect(() => validateWorldSnapshot(belief)).toThrow(/deterministic recomputation/);

    const support = copy();
    const supportTransfer = support.rumorTransfers["tx-hana-sue"]!;
    supportTransfer.supportAtTransfer.corroborationCount = 1;
    supportTransfer.beforeConfidence = roundCanonical(
      decayedConfidence(
        toScoringMemory(support.memories[supportTransfer.parentMemoryId]!),
        supportTransfer.supportAtTransfer,
        new Date(supportTransfer.transferredAt),
      ),
    );
    expect(() => validateWorldSnapshot(support)).toThrow(/supportAtTransfer/);

    const contradictoryCanon = copy();
    contradictoryCanon.canon["sc-stole"]!.status = "confirmed";
    contradictoryCanon.canon["sc-repaired"]!.status = "confirmed";
    expect(() => validateWorldSnapshot(contradictoryCanon)).toThrow(/cannot both be canon-confirmed/);

    const disconnectedBeliefArbitration = copy();
    delete disconnectedBeliefArbitration.claimRelations["rel-warehouse-accounts"];
    expect(() => validateWorldSnapshot(disconnectedBeliefArbitration)).toThrow(
      /deterministic recomputation/,
    );

    const timeTravel = copy();
    timeTravel.rumorTransfers["tx-gen-hana"]!.transferredAt = "2026-08-19T09:00:00.000Z";
    expect(() => validateWorldSnapshot(timeTravel)).toThrow(/cannot precede the parent memory/);

    const inheritedReference = copy();
    inheritedReference.claims["sc-stole"]!.subjectActorId = "toString";
    expect(() => validateWorldSnapshot(inheritedReference)).toThrow(/missing actor/);

    const transitiveCanon = copy();
    transitiveCanon.claims["sc-third"] = {
      id: "sc-third",
      canonical: { ja: "第三の説明", en: "A third account" },
      subjectActorId: "tatsu",
      subjectValence: 0,
    };
    transitiveCanon.canon["sc-stole"]!.status = "confirmed";
    transitiveCanon.canon["sc-third"] = { claimId: "sc-third", entityRevision: 0, status: "confirmed" };
    transitiveCanon.claimRelations["rel-second-link"] = {
      id: "rel-second-link",
      entityRevision: 0,
      kind: "mutually_exclusive",
      claimIds: ["sc-repaired", "sc-third"],
    };
    transitiveCanon.beliefs = evaluateBeliefs(transitiveCanon);
    expect(() => validateWorldSnapshot(transitiveCanon)).toThrow(/connected mutually exclusive group/);
  });
});
