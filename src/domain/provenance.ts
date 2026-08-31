/**
 * Support counting is adapted from Rumor Memory Village's MIT-licensed
 * `lib/memory/recall.ts`. Full trace validation is Canon Ledger-specific.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { Claim, ClaimRelation, Memory, RumorTransfer, WorldSnapshot } from "./types.ts";
import type { MemoryRow, SupportCounts } from "./scoring.ts";

export function supportByClaim(
  memories: readonly MemoryRow[],
): { support: Map<string, SupportCounts>; roots: Map<string, string[]> } {
  const roots = new Map<string, string[]>();
  for (const memory of memories) {
    const list = roots.get(memory.claimId) ?? [];
    list.push(memory.provenanceRootMemoryId);
    roots.set(memory.claimId, list);
  }

  const support = new Map<string, SupportCounts>();
  for (const [claimId, list] of [...roots].sort(([a], [b]) => a.localeCompare(b))) {
    const frequencies = new Map<string, number>();
    for (const root of list) {
      frequencies.set(root, (frequencies.get(root) ?? 0) + 1);
    }
    support.set(claimId, {
      corroborationCount: frequencies.size,
      repeatCount: [...frequencies.values()].reduce(
        (total, count) => total + (count > 1 ? count : 0),
        0,
      ),
    });
    roots.set(claimId, [...list].sort());
  }
  return { support, roots };
}

export function contradictionGroups(
  claims: readonly Claim[],
  relations: readonly ClaimRelation[],
): string[][] {
  const claimIds = [...new Set(claims.map((claim) => claim.id))].sort();
  const parent = new Map(claimIds.map((id) => [id, id]));

  const find = (id: string): string => {
    const current = parent.get(id);
    if (current === undefined) throw new Error(`Unknown claim in contradiction relation: ${id}`);
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    if (first === undefined || second === undefined) return;
    parent.set(second, first);
  };

  for (const relation of [...relations].sort((a, b) => a.id.localeCompare(b.id))) {
    union(relation.claimIds[0], relation.claimIds[1]);
  }

  const groups = new Map<string, string[]>();
  for (const claimId of claimIds) {
    const root = find(claimId);
    const list = groups.get(root) ?? [];
    list.push(claimId);
    groups.set(root, list);
  }
  return [...groups.values()]
    .map((group) => group.sort())
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
}

export type ProvenanceProblemCode =
  | "missing_memory"
  | "cycle"
  | "missing_parent"
  | "root_mismatch"
  | "hop_mismatch"
  | "missing_transfer"
  | "transfer_mismatch";

export interface ProvenanceProblem {
  code: ProvenanceProblemCode;
  memoryId: string;
  relatedId: string | null;
}

export interface ProvenanceHop {
  memoryId: string;
  actorId: string;
  claimId: string;
  hop: number;
  sourceMemoryId: string | null;
  transferId: string | null;
}

export interface RejectedBranchAttempt {
  transferId: string;
  parentMemoryId: string;
  fromActorId: string;
  toActorId: string;
  reasonCode: "low_trust" | "conflict";
}

export interface ProvenanceTrace {
  requestedMemoryId: string;
  rootMemoryId: string | null;
  acceptedDepth: number;
  hops: ProvenanceHop[];
  rejectedAttempts: RejectedBranchAttempt[];
  problems: ProvenanceProblem[];
  truncated: boolean;
}

function transferForMemory(
  transfers: Record<string, RumorTransfer>,
  memory: Memory,
): RumorTransfer | undefined {
  return memory.createdByTransferId === null
    ? undefined
    : transfers[memory.createdByTransferId];
}

export function traceProvenance(
  world: Pick<WorldSnapshot, "memories" | "rumorTransfers">,
  memoryId: string,
  limit = 64,
): ProvenanceTrace {
  const hops: ProvenanceHop[] = [];
  const problems: ProvenanceProblem[] = [];
  const seen = new Set<string>();
  let currentId: string | null = memoryId;
  let expectedRoot: string | null = null;
  let truncated = false;

  while (currentId !== null) {
    if (hops.length >= limit) {
      truncated = true;
      break;
    }
    if (seen.has(currentId)) {
      problems.push({ code: "cycle", memoryId: currentId, relatedId: currentId });
      break;
    }
    seen.add(currentId);
    const memory: Memory | undefined = world.memories[currentId];
    if (!memory) {
      problems.push({
        code: hops.length === 0 ? "missing_memory" : "missing_parent",
        memoryId: currentId,
        relatedId: currentId,
      });
      break;
    }
    expectedRoot ??= memory.provenanceRootMemoryId;
    if (memory.provenanceRootMemoryId !== expectedRoot) {
      problems.push({ code: "root_mismatch", memoryId: memory.id, relatedId: expectedRoot });
    }
    hops.push({
      memoryId: memory.id,
      actorId: memory.actorId,
      claimId: memory.claimId,
      hop: memory.hop,
      sourceMemoryId: memory.sourceMemoryId,
      transferId: memory.createdByTransferId,
    });

    if (memory.sourceMemoryId === null) {
      if (memory.hop !== 0 || memory.id !== memory.provenanceRootMemoryId) {
        problems.push({
          code: memory.hop !== 0 ? "hop_mismatch" : "root_mismatch",
          memoryId: memory.id,
          relatedId: memory.provenanceRootMemoryId,
        });
      }
      break;
    }

    const parent = world.memories[memory.sourceMemoryId];
    if (parent && memory.hop !== parent.hop + 1) {
      problems.push({ code: "hop_mismatch", memoryId: memory.id, relatedId: parent.id });
    }
    const transfer = transferForMemory(world.rumorTransfers, memory);
    if (!transfer) {
      problems.push({
        code: "missing_transfer",
        memoryId: memory.id,
        relatedId: memory.createdByTransferId,
      });
    } else if (
      transfer.outcome !== "accepted" ||
      transfer.createdMemoryId !== memory.id ||
      transfer.parentMemoryId !== memory.sourceMemoryId
    ) {
      problems.push({ code: "transfer_mismatch", memoryId: memory.id, relatedId: transfer.id });
    }
    currentId = memory.sourceMemoryId;
  }

  const pathIds = new Set(hops.map((hop) => hop.memoryId));
  const rejectedAttempts = Object.values(world.rumorTransfers)
    .filter(
      (transfer): transfer is Extract<RumorTransfer, { outcome: "rejected" }> =>
        transfer.outcome === "rejected" && pathIds.has(transfer.parentMemoryId),
    )
    .map((transfer) => ({
      transferId: transfer.id,
      parentMemoryId: transfer.parentMemoryId,
      fromActorId: transfer.fromActorId,
      toActorId: transfer.toActorId,
      reasonCode: transfer.reasonCode,
    }))
    .sort((a, b) => a.transferId.localeCompare(b.transferId));

  const rootMemoryId = hops.at(-1)?.memoryId ?? null;
  return {
    requestedMemoryId: memoryId,
    rootMemoryId,
    acceptedDepth: hops.length === 0 ? 0 : Math.max(...hops.map((hop) => hop.hop)),
    hops,
    rejectedAttempts,
    problems,
    truncated,
  };
}
