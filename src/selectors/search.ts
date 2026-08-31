import { canonicalDigest, canonicalJson } from "../domain/canonical.ts";
import { countViolations, evaluateAllConstraints } from "../domain/constraints.ts";
import type {
  BeliefStance,
  GameConstraint,
  MemorySourceType,
  RejectedRumorTransfer,
  SearchFilters,
  WorldSnapshot,
} from "../domain/types.ts";

export interface BeliefSearchRow {
  actorId: string;
  actorName: { ja: string; en: string };
  claimId: string;
  claimText: { ja: string; en: string };
  stance: BeliefStance;
  supportScore: number;
  opposingScore: number;
  evidenceCount: number;
  evidenceMemoryIds: string[];
  sourceTypes: MemorySourceType[];
  rejectedTransfers: Array<{
    transferId: string;
    fromActorId: string;
    reasonCode: "low_trust" | "conflict";
  }>;
  conditionIds: string[];
}

export interface SearchPage {
  code: "ok" | "invalid_cursor" | "invalid_input";
  total: number;
  state: "zero" | "one" | "many";
  rows: BeliefSearchRow[];
  nextCursor: string | null;
  filters: SearchFilters;
  limit: number;
}

export interface WorldAggregates {
  actorCount: number;
  evaluatedBeliefCount: number;
  defaultClaimId: string;
  stanceTotals: Record<BeliefStance, number>;
  provenanceRootCount: number;
  maxRumorDepth: number;
  rejectedTransferCount: number;
  registeredConditionCount: number;
  violationCount: number;
}

const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

function normalizeFilters(filters: SearchFilters): SearchFilters {
  return {
    query: filters.query.trim(),
    actorId: filters.actorId,
    claimId: filters.claimId,
    stance: filters.stance,
    sourceType: filters.sourceType,
    conditionKind: filters.conditionKind,
  };
}

function relatedConstraints(
  world: WorldSnapshot,
  actorId: string,
  claimId: string,
): GameConstraint[] {
  return Object.values(world.constraints).filter((constraint) => {
    const dependency = constraint.dependency;
    return dependency.claimId === claimId &&
      (dependency.layer === "canon" || dependency.actorId === actorId);
  });
}

function rowFor(
  world: WorldSnapshot,
  actorId: string,
  claimId: string,
): BeliefSearchRow | null {
  const actor = own(world.actors, actorId);
  const claim = own(world.claims, claimId);
  const belief = own(world.beliefs, `${actorId}::${claimId}`);
  if (!actor || !claim || !belief) return null;
  const memories = belief.evidenceMemoryIds
    .map((id) => own(world.memories, id))
    .filter((memory) => memory !== undefined);
  const conditions = relatedConstraints(world, actorId, claimId);
  const rejectedTransfers = Object.values(world.rumorTransfers)
    .filter((transfer): transfer is RejectedRumorTransfer =>
      transfer.outcome === "rejected" &&
      transfer.toActorId === actorId &&
      transfer.claimId === claimId
    )
    .map((transfer) => ({
      transferId: transfer.id,
      fromActorId: transfer.fromActorId,
      reasonCode: transfer.reasonCode,
    }))
    .sort((left, right) => left.transferId.localeCompare(right.transferId));
  return {
    actorId,
    actorName: actor.name,
    claimId,
    claimText: claim.canonical,
    stance: belief.stance,
    supportScore: belief.supportScore,
    opposingScore: belief.opposingScore,
    evidenceCount: memories.length,
    evidenceMemoryIds: memories.map((memory) => memory.id).sort(),
    sourceTypes: [...new Set(memories.map((memory) => memory.sourceType))].sort(),
    rejectedTransfers,
    conditionIds: conditions.map((constraint) => constraint.id).sort(),
  };
}

function rowHaystack(world: WorldSnapshot, row: BeliefSearchRow): string {
  const memoryText = row.evidenceMemoryIds.flatMap((id) => {
    const memory = own(world.memories, id);
    return memory ? [id, memory.surfaceText.ja, memory.surfaceText.en] : [];
  });
  const conditionText = row.conditionIds.flatMap((id) => {
    const condition = own(world.constraints, id);
    return condition ? [id, condition.label] : [];
  });
  const rejectedTransferText = row.rejectedTransfers.flatMap((transfer) => {
    const sender = own(world.actors, transfer.fromActorId);
    return [
      transfer.transferId,
      transfer.reasonCode,
      transfer.fromActorId,
      ...(sender ? [sender.name.ja, sender.name.en] : []),
    ];
  });
  return [
    row.actorId,
    row.actorName.ja,
    row.actorName.en,
    row.claimId,
    row.claimText.ja,
    row.claimText.en,
    row.stance,
    ...memoryText,
    ...rejectedTransferText,
    ...conditionText,
  ].join("\n").toLocaleLowerCase();
}

function informationRank(row: BeliefSearchRow): number {
  if (row.stance !== "unknown" || row.evidenceCount > 0) return 0;
  if (row.rejectedTransfers.length > 0) return 1;
  return 2;
}

interface CursorPayload {
  v: 1;
  revision: number;
  signature: string;
  offset: number;
}

function encodeCursor(payload: CursorPayload): string {
  return encodeURIComponent(canonicalJson(payload));
}

function decodeCursor(value: string): CursorPayload | null {
  if (value.length > 512) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    if (
      canonicalJson(Object.keys(parsed).sort()) !== canonicalJson(["offset", "revision", "signature", "v"]) ||
      parsed["v"] !== 1 ||
      !Number.isInteger(parsed["revision"]) ||
      !Number.isInteger(parsed["offset"]) ||
      (parsed["offset"] as number) < 0 ||
      typeof parsed["signature"] !== "string"
    ) return null;
    return parsed as unknown as CursorPayload;
  } catch {
    return null;
  }
}

export async function searchBeliefs(
  world: WorldSnapshot,
  incidentId: string,
  rawFilters: SearchFilters,
  cursor: string | null,
  requestedLimit = 10,
): Promise<SearchPage> {
  const incident = own(world.incidents, incidentId);
  const filters = normalizeFilters(rawFilters);
  const limit = Math.min(25, Math.max(1, Math.trunc(requestedLimit)));
  if (
    !incident ||
    filters.query.length > 120 ||
    (filters.actorId !== null && !own(world.actors, filters.actorId)) ||
    (filters.claimId !== null && !own(world.claims, filters.claimId))
  ) {
    return { code: "invalid_input", total: 0, state: "zero", rows: [], nextCursor: null, filters, limit };
  }
  const signature = await canonicalDigest({
    incidentId,
    filters,
    limit,
    ordering: "informative-first-v1",
  });
  let offset = 0;
  if (cursor !== null) {
    const decoded = decodeCursor(cursor);
    if (!decoded || decoded.revision !== world.revision || decoded.signature !== signature) {
      return { code: "invalid_cursor", total: 0, state: "zero", rows: [], nextCursor: null, filters, limit };
    }
    offset = decoded.offset;
  }

  const claimIds = filters.claimId === null
    ? [...incident.claimIds].sort()
    : [filters.claimId];
  const actorIds = filters.actorId === null
    ? [...incident.actorIds].sort()
    : [filters.actorId];
  const query = filters.query.toLocaleLowerCase();
  const rows = actorIds.flatMap((actorId) => claimIds.flatMap((claimId) => {
    const row = rowFor(world, actorId, claimId);
    if (!row) return [];
    if (filters.stance !== null && row.stance !== filters.stance) return [];
    if (filters.sourceType !== null && !row.sourceTypes.includes(filters.sourceType)) return [];
    if (filters.conditionKind !== null) {
      const matchesKind = row.conditionIds.some((id) => own(world.constraints, id)?.kind === filters.conditionKind);
      if (!matchesKind) return [];
    }
    if (query.length > 0 && !rowHaystack(world, row).includes(query)) return [];
    return [row];
  })).sort((left, right) =>
    informationRank(left) - informationRank(right) ||
    left.actorId.localeCompare(right.actorId) ||
    left.claimId.localeCompare(right.claimId)
  );
  if (offset > rows.length) {
    return { code: "invalid_cursor", total: 0, state: "zero", rows: [], nextCursor: null, filters, limit };
  }
  const page = rows.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    code: "ok",
    total: rows.length,
    state: rows.length === 0 ? "zero" : rows.length === 1 ? "one" : "many",
    rows: page,
    nextCursor: nextOffset < rows.length
      ? encodeCursor({ v: 1, revision: world.revision, signature, offset: nextOffset })
      : null,
    filters,
    limit,
  };
}

export function selectWorldAggregates(world: WorldSnapshot, incidentId: string): WorldAggregates {
  const incident = own(world.incidents, incidentId);
  if (!incident) throw new Error(`Unknown incident ${incidentId}`);
  const stanceTotals: Record<BeliefStance, number> = {
    unknown: 0,
    doubted: 0,
    believed: 0,
    rejected: 0,
  };
  for (const actorId of new Set(incident.actorIds)) {
    const belief = own(world.beliefs, `${actorId}::${incident.defaultClaimId}`);
    if (belief) stanceTotals[belief.stance] += 1;
  }
  const memories = Object.values(world.memories);
  return {
    actorCount: new Set(incident.actorIds).size,
    evaluatedBeliefCount: Object.values(stanceTotals).reduce((sum, value) => sum + value, 0),
    defaultClaimId: incident.defaultClaimId,
    stanceTotals,
    provenanceRootCount: new Set(memories.map((memory) => memory.provenanceRootMemoryId)).size,
    maxRumorDepth: memories.reduce((maximum, memory) => Math.max(maximum, memory.hop), 0),
    rejectedTransferCount: Object.values(world.rumorTransfers).filter((transfer) => transfer.outcome === "rejected").length,
    registeredConditionCount: Object.keys(world.constraints).length,
    violationCount: countViolations(evaluateAllConstraints(world)),
  };
}
