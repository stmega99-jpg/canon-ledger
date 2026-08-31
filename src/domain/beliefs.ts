import { roundCanonical } from "./canonical.ts";
import { contradictionGroups, supportByClaim } from "./provenance.ts";
import {
  ENGINE_VERSION,
  arbitrate,
  claimSupport,
  type BeliefOutcome,
  type MemoryRow,
} from "./scoring.ts";
import {
  beliefKey,
  relationshipKey,
  type Belief,
  type Claim,
  type Memory,
  type WorldSnapshot,
} from "./types.ts";

export type BeliefWorld = Pick<
  WorldSnapshot,
  "simulatedAt" | "actors" | "claims" | "claimRelations" | "relationships" | "memories"
>;

export function parseIsoDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  return parsed;
}

export function toScoringMemory(memory: Memory): MemoryRow {
  return {
    memoryId: memory.id,
    ownerNpcId: memory.actorId,
    claimId: memory.claimId,
    sourceType: memory.sourceType,
    sourceActorId: memory.sourceActorId,
    sourceMemoryId: memory.sourceMemoryId,
    provenanceRootMemoryId: memory.provenanceRootMemoryId,
    sourceForgottenAt:
      memory.sourceForgottenAt === null
        ? null
        : parseIsoDate(memory.sourceForgottenAt, `${memory.id}.sourceForgottenAt`),
    witnessedDirectly: memory.witnessedDirectly,
    confidenceAtAcq: memory.confidenceAtAcq,
    importance: memory.importance,
    emotionalWeight: memory.emotionalWeight,
    emotionType: memory.emotionType,
    acquiredAt: parseIsoDate(memory.acquiredAt, `${memory.id}.acquiredAt`),
    lastRecalledAt:
      memory.lastRecalledAt === null
        ? null
        : parseIsoDate(memory.lastRecalledAt, `${memory.id}.lastRecalledAt`),
    surfaceJa: memory.surfaceText.ja,
  };
}

function priorBias(world: BeliefWorld, ownerId: string, claim: Claim): number {
  if (claim.subjectActorId === null || claim.subjectActorId === ownerId) return 0;
  const relation = world.relationships[relationshipKey(ownerId, claim.subjectActorId)];
  if (!relation) {
    throw new Error(`Missing relationship ${ownerId} -> ${claim.subjectActorId}`);
  }
  return relation.affection * claim.subjectValence;
}

function trustResolver(world: BeliefWorld, ownerId: string): (actorId: string | null) => number {
  return (actorId) => {
    if (actorId === null) throw new Error(`Missing source actor for ${ownerId}'s heard memory`);
    if (actorId === ownerId) return 1;
    const relation = world.relationships[relationshipKey(ownerId, actorId)];
    if (!relation) throw new Error(`Missing relationship ${ownerId} -> ${actorId}`);
    return relation.trust;
  };
}

function persistedBelief(
  actorId: string,
  claimId: string,
  outcome: BeliefOutcome | undefined,
  evidenceMemoryIds: string[],
  entityRevision: number,
): Belief {
  const stance = outcome?.status ?? "unknown";
  return {
    actorId,
    claimId,
    entityRevision,
    stance,
    supportScore: roundCanonical(outcome?.score ?? 0),
    opposingScore: roundCanonical(outcome?.opposingScore ?? 0),
    evidenceMemoryIds: [...evidenceMemoryIds].sort(),
    rationaleCode: `${ENGINE_VERSION}:${stance}`,
  };
}

export interface EvaluateBeliefOptions {
  entityRevisionFor?: (actorId: string, claimId: string) => number;
}

export function evaluateBeliefs(
  world: BeliefWorld,
  options: EvaluateBeliefOptions = {},
): Record<string, Belief> {
  const simulatedAt = parseIsoDate(world.simulatedAt, "world.simulatedAt");
  const claims = Object.values(world.claims).sort((a, b) => a.id.localeCompare(b.id));
  const groups = contradictionGroups(
    claims,
    Object.values(world.claimRelations),
  );
  const activeRows = Object.values(world.memories)
    .filter((memory) => memory.beliefEligibility === "active")
    .map(toScoringMemory);
  const result: Record<string, Belief> = {};

  for (const actorId of Object.keys(world.actors).sort()) {
    const actorMemories = activeRows.filter((memory) => memory.ownerNpcId === actorId);
    const { support } = supportByClaim(actorMemories);
    const context = {
      simulatedAt,
      trustOf: trustResolver(world, actorId),
      supportOf: (claimId: string) =>
        support.get(claimId) ?? { corroborationCount: 0, repeatCount: 0 },
    };

    for (const group of groups) {
      // A matrix row with no evidence remains `unknown`; it must not become a
      // zero-score rival and read as rejection merely because another account
      // is supported. Once an actor holds memories for both sides, both held
      // claims enter the same arbitration group and receive opposing scores.
      const heldClaimIds = group.filter((claimId) =>
        actorMemories.some((memory) => memory.claimId === claimId),
      );
      const verdicts = heldClaimIds.map((claimId) => {
        const evidence = actorMemories.filter((memory) => memory.claimId === claimId);
        const claim = world.claims[claimId];
        if (!claim) throw new Error(`Missing claim ${claimId}`);
        return claimSupport({ claimId, memories: evidence }, context, priorBias(world, actorId, claim));
      });
      const outcomes = new Map(arbitrate(verdicts).map((outcome) => [outcome.claimId, outcome]));
      for (const claimId of group) {
        const evidenceIds = actorMemories
          .filter((memory) => memory.claimId === claimId)
          .map((memory) => memory.memoryId);
        const entityRevision = options.entityRevisionFor?.(actorId, claimId) ?? 0;
        result[beliefKey(actorId, claimId)] = persistedBelief(
          actorId,
          claimId,
          outcomes.get(claimId),
          evidenceIds,
          entityRevision,
        );
      }
    }
  }

  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
