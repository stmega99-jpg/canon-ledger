/**
 * Adapted from Rumor Memory Village's MIT-licensed pure scoring module.
 * See THIRD_PARTY_NOTICES.md for source paths, revision, and license text.
 */

export const SCORING = {
  lambda: 0.045,
  corroborationBoost: 0.35,
  repeatBoost: 0.08,
  repeatCap: 4,
  recencyHalfLifeDays: 21,
  directWitnessBonus: 1.6,
  selfTrust: 1,
  forgottenSourceTrust: 0.4,
  recallWeights: {
    similarity: 1,
    trust: 0.6,
    confidence: 0.9,
    recency: 0.4,
    emotion: 0.5,
  },
  decisionMargin: 0.12,
  minimumConviction: 0.08,
  priorBiasWeight: 0.25,
} as const;

export const ENGINE_VERSION = "scoring-v1";
const DAY_MS = 86_400_000;

export interface MemoryRow {
  memoryId: string;
  ownerNpcId: string;
  claimId: string;
  sourceType: "witnessed" | "heard";
  sourceActorId: string | null;
  sourceMemoryId: string | null;
  provenanceRootMemoryId: string;
  sourceForgottenAt: Date | null;
  witnessedDirectly: boolean;
  confidenceAtAcq: number;
  importance: number;
  emotionalWeight: number;
  emotionType: string;
  acquiredAt: Date;
  lastRecalledAt: Date | null;
  surfaceJa: string;
}

export interface SupportCounts {
  corroborationCount: number;
  repeatCount: number;
}

export interface RecallContext {
  simulatedAt: Date;
  trustOf: (actorId: string | null) => number;
  supportOf: (claimId: string) => SupportCounts;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const daysBetween = (from: Date, to: Date): number =>
  Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);

export function effectiveAgeDays(memory: MemoryRow, simulatedAt: Date): number {
  const anchor =
    memory.lastRecalledAt && memory.lastRecalledAt > memory.acquiredAt
      ? memory.lastRecalledAt
      : memory.acquiredAt;
  return daysBetween(anchor, simulatedAt);
}

export function decayedConfidence(
  memory: MemoryRow,
  support: SupportCounts,
  simulatedAt: Date,
): number {
  const age = effectiveAgeDays(memory, simulatedAt);
  const resistance = 1 + memory.importance + Math.abs(memory.emotionalWeight);
  const decay = Math.exp((-SCORING.lambda * age) / resistance);
  const reinforcement =
    1 +
    SCORING.corroborationBoost * Math.log1p(support.corroborationCount) +
    SCORING.repeatBoost * Math.log1p(Math.min(support.repeatCount, SCORING.repeatCap));
  return clamp(memory.confidenceAtAcq * decay * reinforcement, 0, 1);
}

export function sourceTrust(memory: MemoryRow, context: RecallContext): number {
  if (memory.witnessedDirectly) return SCORING.selfTrust;
  if (memory.sourceForgottenAt && memory.sourceForgottenAt <= context.simulatedAt) {
    return SCORING.forgottenSourceTrust;
  }
  return clamp(context.trustOf(memory.sourceActorId), 0, 1);
}

function recencyTerm(memory: MemoryRow, simulatedAt: Date): number {
  return Math.pow(0.5, daysBetween(memory.acquiredAt, simulatedAt) / SCORING.recencyHalfLifeDays);
}

export interface RecallBreakdown {
  memoryId: string;
  claimId: string;
  similarity: number;
  trust: number;
  confidence: number;
  recency: number;
  emotion: number;
  score: number;
}

export function recallScore(
  memory: MemoryRow,
  similarity: number,
  context: RecallContext,
): RecallBreakdown {
  const weights = SCORING.recallWeights;
  const terms = {
    similarity: clamp((similarity + 1) / 2, 0, 1),
    trust: clamp(sourceTrust(memory, context), 0, 1),
    confidence: decayedConfidence(memory, context.supportOf(memory.claimId), context.simulatedAt),
    recency: recencyTerm(memory, context.simulatedAt),
    emotion: clamp((1 + Math.abs(memory.emotionalWeight)) / 2, 0, 1),
  };
  const score =
    Math.pow(Math.max(terms.similarity, 1e-6), weights.similarity) *
    Math.pow(Math.max(terms.trust, 1e-6), weights.trust) *
    Math.pow(Math.max(terms.confidence, 1e-6), weights.confidence) *
    Math.pow(Math.max(terms.recency, 1e-6), weights.recency) *
    Math.pow(Math.max(terms.emotion, 1e-6), weights.emotion);
  return { memoryId: memory.memoryId, claimId: memory.claimId, ...terms, score };
}

export interface ClaimEvidence {
  claimId: string;
  memories: MemoryRow[];
}

export interface BeliefContribution {
  memoryId: string;
  sourceActorId: string | null;
  trust: number;
  confidence: number;
  witnessedDirectly: boolean;
  contribution: number;
}

export interface ClaimVerdict {
  claimId: string;
  score: number;
  priorBias: number;
  contributions: BeliefContribution[];
}

export function claimSupport(
  evidence: ClaimEvidence,
  context: RecallContext,
  priorBias = 0,
): ClaimVerdict {
  const support = context.supportOf(evidence.claimId);
  const contributions = evidence.memories.map((memory) => {
    const trust = sourceTrust(memory, context);
    const confidence = decayedConfidence(memory, support, context.simulatedAt);
    const witnessFactor = memory.witnessedDirectly ? SCORING.directWitnessBonus : 1;
    return {
      memoryId: memory.memoryId,
      sourceActorId: memory.sourceActorId,
      trust,
      confidence,
      witnessedDirectly: memory.witnessedDirectly,
      contribution:
        trust * confidence * witnessFactor * recencyTerm(memory, context.simulatedAt),
    };
  });
  const raw = contributions.reduce((total, item) => total + item.contribution, 0);
  return {
    claimId: evidence.claimId,
    score: raw + SCORING.priorBiasWeight * priorBias,
    priorBias,
    contributions,
  };
}

export type BeliefStatus = "believed" | "doubted" | "rejected" | "unknown";

export interface BeliefOutcome {
  claimId: string;
  status: BeliefStatus;
  score: number;
  opposingScore: number;
  contributions: BeliefContribution[];
  priorBias: number;
}

export function arbitrate(verdicts: ClaimVerdict[]): BeliefOutcome[] {
  if (verdicts.length === 0) return [];
  const ranked = [...verdicts].sort(
    (a, b) => b.score - a.score || a.claimId.localeCompare(b.claimId),
  );
  const leader = ranked[0];
  if (!leader) return [];
  const runnerUp = ranked[1];
  const decidable = leader.score >= SCORING.minimumConviction;
  const decisive =
    decidable &&
    (runnerUp === undefined || leader.score - runnerUp.score >= SCORING.decisionMargin);

  return ranked.map((verdict, index) => {
    const opposingScore = Math.max(
      0,
      ...ranked
        .filter((other) => other.claimId !== verdict.claimId)
        .map((other) => other.score),
    );
    let status: BeliefStatus;
    if (!decidable) status = "unknown";
    else if (decisive) status = index === 0 ? "believed" : "rejected";
    else status = leader.score - verdict.score < SCORING.decisionMargin ? "doubted" : "rejected";
    return {
      claimId: verdict.claimId,
      status,
      score: verdict.score,
      opposingScore,
      contributions: verdict.contributions,
      priorBias: verdict.priorBias,
    };
  });
}
