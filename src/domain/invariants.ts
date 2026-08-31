import { countViolations, evaluateAllConstraints } from "./constraints.ts";
import { traceProvenance } from "./provenance.ts";
import type { WorldSnapshot } from "./types.ts";

export interface FixtureMeasurements {
  actors: number;
  defaultClaimBeliefs: number;
  beliefs: number;
  memories: number;
  acceptedTransfers: number;
  rejectedTransfers: number;
  provenanceRoots: number;
  maximumAcceptedDepth: number;
  distortedAcceptedTransfers: number;
  initialViolations: number;
}

export function measureFixture(world: WorldSnapshot): FixtureMeasurements {
  const incident = world.incidents["warehouse"];
  if (!incident) throw new Error("Warehouse fixture is missing the warehouse incident");
  const traces = Object.keys(world.memories).map((memoryId) => traceProvenance(world, memoryId));
  const transfers = Object.values(world.rumorTransfers);
  return {
    actors: incident.actorIds.length,
    defaultClaimBeliefs: incident.actorIds.filter(
      (actorId) => world.beliefs[`${actorId}::${incident.defaultClaimId}`] !== undefined,
    ).length,
    beliefs: Object.keys(world.beliefs).length,
    memories: Object.keys(world.memories).length,
    acceptedTransfers: transfers.filter((transfer) => transfer.outcome === "accepted").length,
    rejectedTransfers: transfers.filter((transfer) => transfer.outcome === "rejected").length,
    provenanceRoots: new Set(Object.values(world.memories).map((memory) => memory.provenanceRootMemoryId)).size,
    maximumAcceptedDepth: Math.max(0, ...traces.map((trace) => trace.acceptedDepth)),
    distortedAcceptedTransfers: transfers.filter(
      (transfer) =>
        transfer.outcome === "accepted" &&
        (transfer.beforeText.ja !== transfer.afterText.ja ||
          transfer.beforeText.en !== transfer.afterText.en ||
          transfer.beforeConfidence !== transfer.afterConfidence),
    ).length,
    initialViolations: countViolations(evaluateAllConstraints(world)),
  };
}

export function assertWarehouseFixture(world: WorldSnapshot): FixtureMeasurements {
  const measurements = measureFixture(world);
  const failures: string[] = [];
  if (measurements.defaultClaimBeliefs <= 10) failures.push("default-claim beliefs must exceed 10");
  if (measurements.maximumAcceptedDepth < 3) failures.push("accepted provenance depth must be at least 3");
  if (measurements.provenanceRoots < 2) failures.push("at least two independent roots are required");
  if (measurements.acceptedTransfers < 1) failures.push("at least one accepted transfer is required");
  if (measurements.rejectedTransfers < 1) failures.push("at least one rejected transfer is required");
  if (measurements.distortedAcceptedTransfers < 1) failures.push("at least one accepted transfer must be visibly distorted");
  if (measurements.initialViolations !== 1) failures.push("initial registered violations must equal one");
  if (failures.length > 0) throw new Error(`Warehouse fixture invariant failure: ${failures.join("; ")}`);
  return measurements;
}
