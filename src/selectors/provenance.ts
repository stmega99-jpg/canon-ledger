import { canonicalJson } from "../domain/canonical.ts";
import { traceProvenance } from "../domain/provenance.ts";
import type { BeliefStance, WorldSnapshot } from "../domain/types.ts";

export interface AcceptedTraceHop {
  memoryId: string;
  actorId: string;
  actorName: { ja: string; en: string };
  hop: number;
  sourceType: "witnessed" | "heard";
  surfaceText: { ja: string; en: string };
  confidenceAtAcq: number;
  transferId: string | null;
  distorted: boolean;
}

export interface ActorClaimTrace {
  code: "ok" | "invalid_input";
  actorId: string;
  claimId: string;
  stance: BeliefStance | null;
  evidenceMemoryIds: string[];
  rootMemoryIds: string[];
  acceptedDepth: number;
  acceptedHops: AcceptedTraceHop[];
  rejectedAttempts: Array<{
    transferId: string;
    parentMemoryId: string;
    fromActorId: string;
    toActorId: string;
    reasonCode: "low_trust" | "conflict";
  }>;
  problems: string[];
  truncated: boolean;
}

const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

export function selectActorClaimTrace(
  world: WorldSnapshot,
  actorId: string,
  claimId: string,
  requestedMaxHops = 12,
): ActorClaimTrace {
  const actor = own(world.actors, actorId);
  const claim = own(world.claims, claimId);
  const belief = own(world.beliefs, `${actorId}::${claimId}`);
  const maxHops = Math.min(12, Math.max(1, Math.trunc(requestedMaxHops)));
  if (!actor || !claim || !belief) {
    return {
      code: "invalid_input", actorId, claimId, stance: null, evidenceMemoryIds: [],
      rootMemoryIds: [], acceptedDepth: 0, acceptedHops: [], rejectedAttempts: [],
      problems: [], truncated: false,
    };
  }

  const traces = belief.evidenceMemoryIds.map((memoryId) => traceProvenance(world, memoryId, 64));
  const hopIds = new Set<string>();
  for (const trace of traces) for (const hop of trace.hops) hopIds.add(hop.memoryId);
  const orderedIds = [...hopIds].sort((left, right) => {
    const leftMemory = own(world.memories, left)!;
    const rightMemory = own(world.memories, right)!;
    return leftMemory.hop - rightMemory.hop || left.localeCompare(right);
  });
  const truncated = traces.some((trace) => trace.truncated) || orderedIds.length > maxHops;
  const acceptedHops = orderedIds.slice(0, maxHops).map((memoryId): AcceptedTraceHop => {
    const memory = own(world.memories, memoryId)!;
    const transfer = memory.createdByTransferId === null
      ? undefined
      : own(world.rumorTransfers, memory.createdByTransferId);
    const distorted = transfer?.outcome === "accepted" && (
      canonicalJson(transfer.beforeText) !== canonicalJson(transfer.afterText) ||
      transfer.beforeConfidence !== transfer.afterConfidence
    );
    return {
      memoryId,
      actorId: memory.actorId,
      actorName: own(world.actors, memory.actorId)!.name,
      hop: memory.hop,
      sourceType: memory.sourceType,
      surfaceText: memory.surfaceText,
      confidenceAtAcq: memory.confidenceAtAcq,
      transferId: memory.createdByTransferId,
      distorted,
    };
  });
  const rejected = new Map<string, ActorClaimTrace["rejectedAttempts"][number]>();
  for (const trace of traces) {
    for (const attempt of trace.rejectedAttempts) rejected.set(attempt.transferId, attempt);
  }
  for (const transfer of Object.values(world.rumorTransfers)) {
    if (
      transfer.outcome === "rejected" &&
      transfer.toActorId === actorId &&
      transfer.claimId === claimId
    ) {
      rejected.set(transfer.id, {
        transferId: transfer.id,
        parentMemoryId: transfer.parentMemoryId,
        fromActorId: transfer.fromActorId,
        toActorId: transfer.toActorId,
        reasonCode: transfer.reasonCode,
      });
    }
  }
  return {
    code: "ok",
    actorId,
    claimId,
    stance: belief.stance,
    evidenceMemoryIds: [...belief.evidenceMemoryIds],
    rootMemoryIds: [...new Set(traces.flatMap((trace) => trace.rootMemoryId ? [trace.rootMemoryId] : []))].sort(),
    acceptedDepth: traces.reduce((maximum, trace) => Math.max(maximum, trace.acceptedDepth), 0),
    acceptedHops,
    rejectedAttempts: [...rejected.values()].sort((left, right) => left.transferId.localeCompare(right.transferId)),
    problems: [...new Set(traces.flatMap((trace) => trace.problems.map((problem) => problem.code)))].sort(),
    truncated,
  };
}
