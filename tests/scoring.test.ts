import { describe, expect, it } from "vitest";
import { evaluateBeliefs } from "../src/domain/beliefs.ts";
import { supportByClaim } from "../src/domain/provenance.ts";
import {
  SCORING,
  arbitrate,
  claimSupport,
  decayedConfidence,
  recallScore,
  sourceTrust,
  type MemoryRow,
  type RecallContext,
} from "../src/domain/scoring.ts";
import type { WorldSnapshot } from "../src/domain/types.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function memory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  const memoryId = overrides.memoryId ?? "memory-1";
  return {
    memoryId,
    ownerNpcId: "hana",
    claimId: "claim-a",
    sourceType: "heard",
    sourceActorId: "gen",
    sourceMemoryId: "root",
    provenanceRootMemoryId: overrides.provenanceRootMemoryId ?? memoryId,
    sourceForgottenAt: null,
    witnessedDirectly: false,
    confidenceAtAcq: 0.8,
    importance: 0.5,
    emotionalWeight: -0.4,
    emotionType: "suspicion",
    acquiredAt: new Date("2026-08-20T12:00:00.000Z"),
    lastRecalledAt: null,
    surfaceJa: "倉庫で見た。",
    ...overrides,
  };
}

function context(overrides: Partial<RecallContext> = {}): RecallContext {
  return {
    simulatedAt: NOW,
    trustOf: () => 0.7,
    supportOf: () => ({ corroborationCount: 1, repeatCount: 0 }),
    ...overrides,
  };
}

describe("deterministic scoring port", () => {
  it("uses the injected clock and lets importance/emotion slow decay symmetrically", () => {
    const plain = memory({ importance: 0, emotionalWeight: 0 });
    const important = memory({ importance: 1, emotionalWeight: -0.9 });
    const positiveEmotion = memory({ importance: 1, emotionalWeight: 0.9 });
    const support = { corroborationCount: 1, repeatCount: 0 };
    expect(decayedConfidence(plain, support, NOW)).toBeLessThan(
      decayedConfidence(important, support, NOW),
    );
    expect(decayedConfidence(important, support, NOW)).toBe(
      decayedConfidence(positiveEmotion, support, NOW),
    );
    expect(decayedConfidence(plain, support, new Date("2026-09-30T12:00:00.000Z"))).toBeLessThan(
      decayedConfidence(plain, support, NOW),
    );
  });

  it("counts independent roots more strongly than repetition and caps repeats", () => {
    const item = memory();
    const independent = decayedConfidence(item, { corroborationCount: 2, repeatCount: 0 }, NOW);
    const repeated = decayedConfidence(item, { corroborationCount: 1, repeatCount: 2 }, NOW);
    expect(independent).toBeGreaterThan(repeated);
    expect(decayedConfidence(item, { corroborationCount: 1, repeatCount: 999 }, NOW)).toBe(
      decayedConfidence(item, { corroborationCount: 1, repeatCount: SCORING.repeatCap }, NOW),
    );
  });

  it("uses self trust for witnesses and forgotten-source trust only after forgetting", () => {
    const witnessed = memory({ witnessedDirectly: true, sourceActorId: null });
    const forgotten = memory({ sourceForgottenAt: new Date("2026-08-29T12:00:00.000Z") });
    const notYetForgotten = memory({ sourceForgottenAt: new Date("2026-09-01T12:00:00.000Z") });
    expect(sourceTrust(witnessed, context({ trustOf: () => 0 }))).toBe(1);
    expect(sourceTrust(forgotten, context({ trustOf: () => 0.9 }))).toBe(0.4);
    expect(sourceTrust(notYetForgotten, context({ trustOf: () => 0.9 }))).toBe(0.9);
  });

  it("combines all weighted recall terms rather than using a shared multiplier", () => {
    const lowTrust = recallScore(memory(), 0.8, context({ trustOf: () => 0.2 }));
    const highTrust = recallScore(memory(), 0.8, context({ trustOf: () => 0.9 }));
    expect(highTrust.score).toBeGreaterThan(lowTrust.score);
    expect(highTrust.similarity).toBeCloseTo(0.9);
  });

  it("retains both rivals, doubts a near tie, and believes a lone supported claim", () => {
    const evidenceA = claimSupport({ claimId: "a", memories: [memory({ claimId: "a" })] }, context());
    const evidenceB = { ...evidenceA, claimId: "b", score: evidenceA.score - 0.01 };
    expect(arbitrate([evidenceA, evidenceB]).map((outcome) => outcome.status)).toEqual([
      "doubted",
      "doubted",
    ]);
    expect(arbitrate([evidenceA])).toMatchObject([{ claimId: "a", status: "believed" }]);
    expect(arbitrate([{ ...evidenceA, score: 0.001 }])).toMatchObject([
      { claimId: "a", status: "unknown" },
    ]);
  });

  it("lets prior bias move a verdict without hiding its contribution", () => {
    const evidence = { claimId: "a", memories: [memory({ claimId: "a", confidenceAtAcq: 0.3 })] };
    const negative = claimSupport(evidence, context(), -1);
    const positive = claimSupport(evidence, context(), 1);
    expect(positive.score - negative.score).toBeCloseTo(SCORING.priorBiasWeight * 2);
    expect(positive.priorBias).toBe(1);
  });

  it("separates corroboration from repeated copies of one persisted root", () => {
    const sameRoot = supportByClaim([
      memory({ memoryId: "a", provenanceRootMemoryId: "root-a" }),
      memory({ memoryId: "b", provenanceRootMemoryId: "root-a" }),
    ]).support.get("claim-a");
    const twoRoots = supportByClaim([
      memory({ memoryId: "a", provenanceRootMemoryId: "root-a" }),
      memory({ memoryId: "b", provenanceRootMemoryId: "root-b" }),
    ]).support.get("claim-a");
    expect(sameRoot).toEqual({ corroborationCount: 1, repeatCount: 2 });
    expect(twoRoots).toEqual({ corroborationCount: 2, repeatCount: 0 });
  });

  it("does not take canon as an evaluator input", () => {
    const world = structuredClone(fixtureJson) as unknown as WorldSnapshot;
    const before = evaluateBeliefs(world);
    world.canon["sc-stole"]!.status = "confirmed";
    world.canon["sc-repaired"]!.status = "rejected";
    expect(evaluateBeliefs(world)).toEqual(before);
  });

  it("routes a declared mutual exclusion into held-claim arbitration", () => {
    const world = structuredClone(fixtureJson) as unknown as WorldSnapshot;
    const evaluated = evaluateBeliefs(world);
    expect(evaluated["tatsu::sc-stole"]).toMatchObject({
      stance: "rejected",
      evidenceMemoryIds: ["mem-stole-tatsu-from-gen"],
      opposingScore: evaluated["tatsu::sc-repaired"]!.supportScore,
    });
    expect(evaluated["tatsu::sc-repaired"]).toMatchObject({
      stance: "believed",
      opposingScore: evaluated["tatsu::sc-stole"]!.supportScore,
    });

    const withoutRelation = structuredClone(world);
    delete withoutRelation.claimRelations["rel-warehouse-accounts"];
    const independentlyEvaluated = evaluateBeliefs(withoutRelation);
    expect(independentlyEvaluated["tatsu::sc-stole"]).toMatchObject({
      stance: "believed",
      opposingScore: 0,
    });

    expect(evaluated["aki::sc-stole"]).toMatchObject({
      stance: "unknown",
      evidenceMemoryIds: [],
      opposingScore: 0,
    });
  });
});
