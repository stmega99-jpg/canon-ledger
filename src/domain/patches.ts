import { evaluateBeliefs } from "./beliefs.ts";
import { canonicalDigest, canonicalJson, canonicalValue } from "./canonical.ts";
import { projectConstraints, summarizeConstraintProjection } from "./constraints.ts";
import type {
  ArchiveMemoryOperation,
  ApplyReceipt,
  ConstraintProjection,
  ConstraintSummary,
  EntityPrecondition,
  EntityWrite,
  Patch,
  PatchOperation,
  ReplaceConstraintDependencyOperation,
  ResolveCanonRelationOperation,
  ReviewDecision,
  WorldSnapshot,
} from "./types.ts";
import { beliefKey } from "./types.ts";
import { validateConstraintDependency, validateWorldSnapshot } from "./validate.ts";

export type OperationDecision = "pending" | "approved" | "rejected";
export type OperationValidity = "valid" | "stale_operation" | "blocked";

export interface PlannedOperation {
  operationId: string;
  kind: PatchOperation["kind"];
  fingerprint: string;
  decision: OperationDecision;
  validity: OperationValidity;
  code: string;
  writeKeys: string[];
}

export interface PatchProjection {
  world: WorldSnapshot;
  writeKeys: string[];
  constraints: ConstraintProjection[];
  summary: ConstraintSummary;
  domainFingerprint: string;
}

export interface ReviewedPatchPlan {
  code: "ok" | "stale_patch" | "invalid_patch";
  state: "staged" | "reviewing" | "ready" | "closed_noop" | "stale_patch";
  sourceWorldFingerprint: string;
  patchFingerprint: string;
  operationFingerprints: string[];
  operations: PlannedOperation[];
  proposal: PatchProjection;
  selected: Record<string, PatchProjection>;
  reviewed: PatchProjection | null;
  pendingCount: number;
  approvedOperationIds: string[];
  rejectedOperationIds: string[];
  planDigest: string;
}

export interface WarehousePatchOptions {
  id: string;
  patchRevision: number;
  createdAt: string;
  createdVia: Patch["createdVia"];
  repairRegisteredWrongLayer?: boolean;
  memoryPolicy?: "preserve" | "review_archive";
  relationId?: string;
  confirmClaimId?: string;
}

export type ApplyPreflightCode =
  | "ready"
  | "already_applied"
  | "receipt_conflict"
  | "invalid_input"
  | "stale_patch"
  | "pending_page_review"
  | "stale_operation"
  | "review_preview_required"
  | "preview_mismatch"
  | "closed_noop";

export interface ApplyPreflight {
  code: ApplyPreflightCode;
  plan: ReviewedPatchPlan | null;
  receipt: ApplyReceipt | null;
}

const relationKey = (id: string): string => `claim_relation:${id}`;
const canonKey = (id: string): string => `canon:${id}`;
const constraintKey = (id: string): string => `constraint:${id}`;
const memoryKey = (id: string): string => `memory:${id}`;
const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

function json(value: unknown) {
  return canonicalValue(value);
}

function exactJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return exactJson(Object.keys(value).sort(), [...keys].sort());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCanonicalIso(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isJsonValue(value: unknown): boolean {
  try {
    canonicalValue(value);
    return true;
  } catch {
    return false;
  }
}

function validPreconditions(value: unknown): boolean {
  return Array.isArray(value) && isJsonValue(value) && value.every((raw) => {
    const item = plainRecord(raw);
    return item !== null &&
      hasExactKeys(item, ["stateKey", "entityRevision", "before"]) &&
      isNonEmptyString(item["stateKey"]) &&
      Number.isInteger(item["entityRevision"]) &&
      (item["entityRevision"] as number) >= 0 &&
      isJsonValue(item["before"]);
  });
}

function validWrites(value: unknown): boolean {
  return Array.isArray(value) && isJsonValue(value) && value.every((raw) => {
    const item = plainRecord(raw);
    return item !== null &&
      hasExactKeys(item, ["stateKey", "after"]) &&
      isNonEmptyString(item["stateKey"]) &&
      isJsonValue(item["after"]);
  });
}

export function validatePatchShape(value: unknown): { ok: true } | { ok: false; code: string } {
  const patch = plainRecord(value);
  if (!patch || !hasExactKeys(patch, [
    "id", "patchRevision", "worldId", "baseWorldRevision", "createdAt",
    "createdVia", "summary", "operations",
  ])) return { ok: false, code: "invalid_patch_shape" };
  if (
    !isNonEmptyString(patch["id"]) ||
    !Number.isInteger(patch["patchRevision"]) || (patch["patchRevision"] as number) < 1 ||
    !isNonEmptyString(patch["worldId"]) ||
    !Number.isInteger(patch["baseWorldRevision"]) || (patch["baseWorldRevision"] as number) < 0 ||
    !isCanonicalIso(patch["createdAt"]) ||
    (patch["createdVia"] !== "page-ui" && patch["createdVia"] !== "site-tool") ||
    !isNonEmptyString(patch["summary"]) ||
    !Array.isArray(patch["operations"]) || patch["operations"].length === 0 ||
    !isJsonValue(patch["operations"])
  ) return { ok: false, code: "invalid_patch_fields" };

  for (const raw of patch["operations"]) {
    const operation = plainRecord(raw);
    if (!operation) return { ok: false, code: "invalid_operation_shape" };
    const base = ["id", "kind", "reasonCode", "evidenceRefs", "preconditions", "writes"];
    const kind = operation["kind"];
    const specific = kind === "resolve_canon_relation"
      ? ["relationId", "confirmClaimId", "rejectClaimId"]
      : kind === "replace_constraint_dependency"
        ? ["constraintId", "beforeDependency", "afterDependency"]
        : kind === "archive_memory"
          ? ["memoryId", "beforeEligibility", "afterEligibility"]
          : null;
    if (!specific || !hasExactKeys(operation, [...base, ...specific])) {
      return { ok: false, code: "invalid_operation_shape" };
    }
    if (
      !isNonEmptyString(operation["id"]) ||
      !isNonEmptyString(operation["reasonCode"]) ||
      !Array.isArray(operation["evidenceRefs"]) ||
      !isJsonValue(operation["evidenceRefs"]) ||
      !operation["evidenceRefs"].every(isNonEmptyString) ||
      !validPreconditions(operation["preconditions"]) ||
      !validWrites(operation["writes"])
    ) return { ok: false, code: "invalid_operation_fields" };
    if (kind === "resolve_canon_relation") {
      if (!specific.every((field) => isNonEmptyString(operation[field]))) {
        return { ok: false, code: "invalid_operation_fields" };
      }
    } else if (kind === "replace_constraint_dependency") {
      if (!isNonEmptyString(operation["constraintId"])) return { ok: false, code: "invalid_operation_fields" };
      try {
        validateConstraintDependency(operation["beforeDependency"], "operation.beforeDependency");
        validateConstraintDependency(operation["afterDependency"], "operation.afterDependency");
      } catch {
        return { ok: false, code: "invalid_operation_fields" };
      }
    } else if (
      !isNonEmptyString(operation["memoryId"]) ||
      operation["beforeEligibility"] !== "active" ||
      operation["afterEligibility"] !== "archived"
    ) return { ok: false, code: "invalid_operation_fields" };
  }
  return { ok: true };
}

function expectedPrecondition(stateKey: string, entityRevision: number, before: unknown): EntityPrecondition {
  return { stateKey, entityRevision, before: json(before) };
}

function expectedWrite(stateKey: string, after: unknown): EntityWrite {
  return { stateKey, after: json(after) };
}

function sameKeyedItems<T extends { stateKey: string }>(actual: readonly T[], expected: readonly T[]): boolean {
  if (actual.length !== expected.length) return false;
  if (new Set(actual.map((item) => item.stateKey)).size !== actual.length) return false;
  const byKey = new Map(actual.map((item) => [item.stateKey, item]));
  return expected.every((item) => exactJson(byKey.get(item.stateKey), item));
}

interface OperationValidation {
  validity: OperationValidity;
  code: string;
  writeKeys: string[];
}

function stale(code: string): OperationValidation {
  return { validity: "stale_operation", code, writeKeys: [] };
}

function validateResolveCanon(
  world: WorldSnapshot,
  operation: ResolveCanonRelationOperation,
): OperationValidation {
  const relation = own(world.claimRelations, operation.relationId);
  const confirm = own(world.canon, operation.confirmClaimId);
  const reject = own(world.canon, operation.rejectClaimId);
  if (!relation || !confirm || !reject) return stale("missing_target");
  if (
    operation.confirmClaimId === operation.rejectClaimId ||
    !relation.claimIds.includes(operation.confirmClaimId) ||
    !relation.claimIds.includes(operation.rejectClaimId)
  ) return stale("relation_claim_mismatch");

  const preconditions = [
    expectedPrecondition(relationKey(relation.id), relation.entityRevision, relation),
    expectedPrecondition(canonKey(confirm.claimId), confirm.entityRevision, confirm),
    expectedPrecondition(canonKey(reject.claimId), reject.entityRevision, reject),
  ];
  const writes = [
    expectedWrite(canonKey(confirm.claimId), {
      ...confirm,
      entityRevision: confirm.entityRevision + 1,
      status: "confirmed",
    }),
    expectedWrite(canonKey(reject.claimId), {
      ...reject,
      entityRevision: reject.entityRevision + 1,
      status: "rejected",
    }),
  ];
  if (!sameKeyedItems(operation.preconditions, preconditions)) return stale("precondition_mismatch");
  if (!sameKeyedItems(operation.writes, writes)) return stale("write_mismatch");
  return { validity: "valid", code: "ok", writeKeys: writes.map((write) => write.stateKey).sort() };
}

function validateReplaceConstraint(
  world: WorldSnapshot,
  operation: ReplaceConstraintDependencyOperation,
): OperationValidation {
  const constraint = own(world.constraints, operation.constraintId);
  if (!constraint) return stale("missing_target");
  if (!exactJson(operation.beforeDependency, constraint.dependency)) return stale("dependency_before_mismatch");
  if (exactJson(operation.beforeDependency, operation.afterDependency)) return stale("unchanged_dependency");
  try {
    const validated = validateConstraintDependency(operation.afterDependency, "operation.afterDependency");
    if (!exactJson(validated, operation.afterDependency)) return stale("invalid_after_dependency");
    if (!own(world.claims, validated.claimId)) return stale("invalid_after_dependency");
    if (validated.layer === "canon") {
      if (!own(world.canon, validated.claimId)) return stale("invalid_after_dependency");
    } else if (
      !own(world.actors, validated.actorId) ||
      !own(world.beliefs, beliefKey(validated.actorId, validated.claimId))
    ) {
      return stale("invalid_after_dependency");
    }
  } catch {
    return stale("invalid_after_dependency");
  }
  const preconditions = [
    expectedPrecondition(constraintKey(constraint.id), constraint.entityRevision, constraint),
  ];
  const writes = [
    expectedWrite(constraintKey(constraint.id), {
      ...constraint,
      entityRevision: constraint.entityRevision + 1,
      dependency: operation.afterDependency,
    }),
  ];
  if (!sameKeyedItems(operation.preconditions, preconditions)) return stale("precondition_mismatch");
  if (!sameKeyedItems(operation.writes, writes)) return stale("write_mismatch");
  return { validity: "valid", code: "ok", writeKeys: [constraintKey(constraint.id)] };
}

function validateArchiveMemory(
  world: WorldSnapshot,
  operation: ArchiveMemoryOperation,
): OperationValidation {
  const memory = own(world.memories, operation.memoryId);
  if (!memory) return stale("missing_target");
  if (
    memory.beliefEligibility !== "active" ||
    operation.beforeEligibility !== "active" ||
    operation.afterEligibility !== "archived"
  ) return stale("eligibility_mismatch");
  const preconditions = [expectedPrecondition(memoryKey(memory.id), memory.entityRevision, memory)];
  const writes = [
    expectedWrite(memoryKey(memory.id), {
      ...memory,
      entityRevision: memory.entityRevision + 1,
      beliefEligibility: "archived",
    }),
  ];
  if (!sameKeyedItems(operation.preconditions, preconditions)) return stale("precondition_mismatch");
  if (!sameKeyedItems(operation.writes, writes)) return stale("write_mismatch");
  return { validity: "valid", code: "ok", writeKeys: [memoryKey(memory.id)] };
}

function validateOperation(world: WorldSnapshot, operation: PatchOperation): OperationValidation {
  switch (operation.kind) {
    case "resolve_canon_relation": return validateResolveCanon(world, operation);
    case "replace_constraint_dependency": return validateReplaceConstraint(world, operation);
    case "archive_memory": return validateArchiveMemory(world, operation);
    default: return stale("unsupported_kind");
  }
}

function changedBelief(previous: unknown, next: unknown): boolean {
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return true;
  const before = { ...(previous as Record<string, unknown>), entityRevision: 0 };
  const after = { ...(next as Record<string, unknown>), entityRevision: 0 };
  return !exactJson(before, after);
}

function projectOperations(
  source: WorldSnapshot,
  operations: readonly PatchOperation[],
): { world: WorldSnapshot; writeKeys: Set<string> } {
  if (operations.length === 0) return { world: source, writeKeys: new Set() };
  let canon = source.canon;
  let constraints = source.constraints;
  let memories = source.memories;
  let archiveSelected = false;
  const writeKeys = new Set<string>();

  for (const operation of operations) {
    if (operation.kind === "resolve_canon_relation") {
      if (canon === source.canon) canon = { ...source.canon };
      const confirm = source.canon[operation.confirmClaimId]!;
      const reject = source.canon[operation.rejectClaimId]!;
      canon[confirm.claimId] = { ...confirm, entityRevision: confirm.entityRevision + 1, status: "confirmed" };
      canon[reject.claimId] = { ...reject, entityRevision: reject.entityRevision + 1, status: "rejected" };
      writeKeys.add(canonKey(confirm.claimId));
      writeKeys.add(canonKey(reject.claimId));
    } else if (operation.kind === "replace_constraint_dependency") {
      if (constraints === source.constraints) constraints = { ...source.constraints };
      const current = source.constraints[operation.constraintId]!;
      constraints[current.id] = {
        ...current,
        entityRevision: current.entityRevision + 1,
        dependency: operation.afterDependency,
      };
      writeKeys.add(constraintKey(current.id));
    } else {
      if (memories === source.memories) memories = { ...source.memories };
      const current = source.memories[operation.memoryId]!;
      memories[current.id] = {
        ...current,
        entityRevision: current.entityRevision + 1,
        beliefEligibility: "archived",
      };
      writeKeys.add(memoryKey(current.id));
      archiveSelected = true;
    }
  }

  const partial: WorldSnapshot = {
    ...source,
    revision: source.revision + 1,
    canon,
    constraints,
    memories,
  };
  let beliefs = source.beliefs;
  if (archiveSelected) {
    const recomputed = evaluateBeliefs(partial, {
      entityRevisionFor: (actorId, claimId) =>
        source.beliefs[beliefKey(actorId, claimId)]?.entityRevision ?? 0,
    });
    beliefs = { ...source.beliefs };
    for (const [key, next] of Object.entries(recomputed)) {
      const previous = source.beliefs[key];
      if (changedBelief(previous, next)) {
        beliefs[key] = { ...next, entityRevision: (previous?.entityRevision ?? 0) + 1 };
        writeKeys.add(`belief:${next.actorId}:${next.claimId}`);
      } else if (previous) {
        beliefs[key] = previous;
      }
    }
  }
  const candidate = validateWorldSnapshot({ ...partial, beliefs });
  return { world: candidate, writeKeys };
}

async function projection(
  source: WorldSnapshot,
  operations: readonly PatchOperation[],
): Promise<PatchProjection> {
  const projected = projectOperations(source, operations);
  const constraints = projectConstraints(source, projected.world, { writeKeys: projected.writeKeys });
  return {
    world: projected.world,
    writeKeys: [...projected.writeKeys].sort(),
    constraints,
    summary: summarizeConstraintProjection(constraints),
    domainFingerprint: await canonicalDigest(projected.world),
  };
}

export async function operationFingerprint(operation: PatchOperation): Promise<string> {
  return canonicalDigest(operation);
}

export async function patchFingerprint(patch: Patch): Promise<string> {
  const shape = validatePatchShape(patch);
  if (!shape.ok) throw new Error(shape.code);
  return canonicalDigest(patch);
}

export async function createReviewDecision(
  patch: Patch,
  operationId: string,
  decision: ReviewDecision["decision"],
  decidedAt: string,
): Promise<ReviewDecision> {
  const operation = patch.operations.find((candidate) => candidate.id === operationId);
  if (!operation) throw new Error(`Unknown operation ${operationId}`);
  return {
    patchId: patch.id,
    patchRevision: patch.patchRevision,
    operationId,
    operationFingerprint: await operationFingerprint(operation),
    decision,
    decidedVia: "page-ui",
    decidedAt,
  };
}

function deriveState(
  pendingCount: number,
  approvedExecutableCount: number,
  rejectedCount: number,
  approvedInvalidCount: number,
): ReviewedPatchPlan["state"] {
  if (pendingCount > 0) {
    return approvedExecutableCount + approvedInvalidCount + rejectedCount > 0 ? "reviewing" : "staged";
  }
  if (approvedInvalidCount > 0) return "reviewing";
  return approvedExecutableCount > 0 ? "ready" : "closed_noop";
}

function isPageReviewDecision(value: unknown): value is ReviewDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const decision = value as Record<string, unknown>;
  const expected = [
    "decidedAt",
    "decidedVia",
    "decision",
    "operationFingerprint",
    "operationId",
    "patchId",
    "patchRevision",
  ].sort();
  const keys = Object.keys(decision).sort();
  return exactJson(keys, expected) &&
    typeof decision["patchId"] === "string" &&
    Number.isInteger(decision["patchRevision"]) &&
    typeof decision["operationId"] === "string" &&
    typeof decision["operationFingerprint"] === "string" &&
    (decision["decision"] === "approved" || decision["decision"] === "rejected") &&
    decision["decidedVia"] === "page-ui" &&
    isCanonicalIso(decision["decidedAt"]);
}

export async function planReviewedPatch(
  world: WorldSnapshot,
  patch: Patch,
  decisions: readonly ReviewDecision[],
): Promise<ReviewedPatchPlan> {
  const sourceWorldFingerprint = await canonicalDigest(world);
  const shape = validatePatchShape(patch);
  if (!shape.ok) {
    const proposal = await projection(world, []);
    const planDigest = await canonicalDigest({
      worldId: world.worldId,
      currentWorldRevision: world.revision,
      sourceWorldFingerprint,
      invalidPatchCode: shape.code,
    });
    return {
      code: "invalid_patch",
      state: "staged",
      sourceWorldFingerprint,
      patchFingerprint: `invalid:${shape.code}`,
      operationFingerprints: [],
      operations: [],
      proposal,
      selected: {},
      reviewed: null,
      pendingCount: 0,
      approvedOperationIds: [],
      rejectedOperationIds: [],
      planDigest,
    };
  }
  const fullPatchFingerprint = await patchFingerprint(patch);
  const operationFingerprints = await Promise.all(patch.operations.map(operationFingerprint));
  const duplicateIds = new Set(
    patch.operations
      .map((operation) => operation.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index),
  );
  const matchingDecisions = decisions.filter(isPageReviewDecision).filter(
    (decision) => decision.patchId === patch.id && decision.patchRevision === patch.patchRevision,
  );

  const baseValid = patch.worldId === world.worldId && patch.baseWorldRevision === world.revision;
  const initial = patch.operations.map((operation, index): PlannedOperation => {
    const validation = validateOperation(world, operation);
    const fingerprint = operationFingerprints[index]!;
    const current = matchingDecisions.filter(
      (decision) => decision.operationId === operation.id && decision.operationFingerprint === fingerprint,
    );
    const decision: OperationDecision = current.length === 1 ? current[0]!.decision : "pending";
    if (duplicateIds.has(operation.id)) {
      return { operationId: operation.id, kind: operation.kind, fingerprint, decision, validity: "blocked", code: "duplicate_operation_id", writeKeys: validation.writeKeys };
    }
    if (current.length > 1) {
      return { operationId: operation.id, kind: operation.kind, fingerprint, decision: "pending", validity: "blocked", code: "duplicate_decision", writeKeys: validation.writeKeys };
    }
    return { operationId: operation.id, kind: operation.kind, fingerprint, decision, ...validation };
  });

  const owners = new Map<string, number[]>();
  initial.forEach((operation, index) => {
    for (const key of operation.writeKeys) owners.set(key, [...(owners.get(key) ?? []), index]);
  });
  for (const indices of owners.values()) {
    if (indices.length < 2) continue;
    for (const index of indices) {
      const operation = initial[index]!;
      operation.validity = "blocked";
      operation.code = "duplicate_write_key";
    }
  }

  const executable = (operation: PlannedOperation) => operation.validity === "valid";
  const proposalOperations = patch.operations.filter((_, index) => {
    const plan = initial[index]!;
    return executable(plan) && plan.decision !== "rejected";
  });
  const proposal = await projection(world, proposalOperations);
  const selectedEntries = await Promise.all(
    patch.operations.map(async (operation, index) => [
      operation.id,
      await projection(world, executable(initial[index]!) ? [operation] : []),
    ] as const),
  );
  const selected = Object.fromEntries(selectedEntries);
  const pendingCount = initial.filter((operation) => operation.decision === "pending").length;
  const approvedOperationIds = initial
    .filter((operation) => operation.decision === "approved" && operation.validity === "valid")
    .map((operation) => operation.operationId);
  const rejectedOperationIds = initial
    .filter((operation) => operation.decision === "rejected")
    .map((operation) => operation.operationId);
  const reviewedOperations = patch.operations.filter((_, index) => {
    const plan = initial[index]!;
    return executable(plan) && plan.decision === "approved";
  });
  const reviewed = pendingCount === 0 ? await projection(world, reviewedOperations) : null;
  const approvedInvalidCount = initial.filter(
    (operation) => operation.decision === "approved" && operation.validity !== "valid",
  ).length;
  const state = baseValid
    ? deriveState(
        pendingCount,
        approvedOperationIds.length,
        rejectedOperationIds.length,
        approvedInvalidCount,
      )
    : "stale_patch";
  const code: ReviewedPatchPlan["code"] = !baseValid
    ? "stale_patch"
    : initial.some(
        (operation) => operation.validity !== "valid" && operation.decision !== "rejected",
      )
      ? "invalid_patch"
      : "ok";
  const digestProjection = reviewed ?? proposal;
  const decisionPayload = initial.map((operation) => ({
    operationId: operation.operationId,
    operationFingerprint: operation.fingerprint,
    decision: operation.decision,
  }));
  const planDigest = await canonicalDigest({
    worldId: world.worldId,
    currentWorldRevision: world.revision,
    baseWorldRevision: patch.baseWorldRevision,
    sourceWorldFingerprint,
    patchFingerprint: fullPatchFingerprint,
    operationFingerprints,
    decisions: decisionPayload,
    projectedDomainFingerprint: digestProjection.domainFingerprint,
    operationOutcomes: initial.map(({ operationId, decision, validity, code: outcomeCode }) => ({ operationId, decision, validity, code: outcomeCode })),
    constraintComparison: digestProjection.constraints,
  });

  return {
    code,
    state,
    sourceWorldFingerprint,
    patchFingerprint: fullPatchFingerprint,
    operationFingerprints,
    operations: initial,
    proposal,
    selected,
    reviewed,
    pendingCount,
    approvedOperationIds,
    rejectedOperationIds,
    planDigest,
  };
}

export async function preflightReviewedApply(
  world: WorldSnapshot,
  patch: Patch,
  decisions: readonly ReviewDecision[],
  reviewedPreviewDigest: string | null,
  existingReceipt: ApplyReceipt | null,
): Promise<ApplyPreflight> {
  const shape = validatePatchShape(patch);
  if (!shape.ok) {
    return { code: "invalid_input", plan: await planReviewedPatch(world, patch, decisions), receipt: null };
  }
  const fingerprint = await patchFingerprint(patch);
  if (existingReceipt) {
    const matches =
      existingReceipt.worldId === world.worldId &&
      existingReceipt.worldId === patch.worldId &&
      existingReceipt.patchId === patch.id &&
      existingReceipt.patchRevision === patch.patchRevision &&
      existingReceipt.patchFingerprint === fingerprint &&
      existingReceipt.baseWorldRevision === patch.baseWorldRevision;
    return {
      code: matches ? "already_applied" : "receipt_conflict",
      plan: null,
      receipt: matches ? existingReceipt : null,
    };
  }
  if (patch.worldId !== world.worldId) {
    return { code: "invalid_input", plan: await planReviewedPatch(world, patch, decisions), receipt: null };
  }
  const plan = await planReviewedPatch(world, patch, decisions);
  if (plan.code === "stale_patch") return { code: "stale_patch", plan, receipt: null };
  if (plan.pendingCount > 0) return { code: "pending_page_review", plan, receipt: null };
  if (
    plan.operations.some(
      (operation) => operation.decision === "approved" && operation.validity !== "valid",
    )
  ) return { code: "stale_operation", plan, receipt: null };
  if (reviewedPreviewDigest === null) {
    return { code: "review_preview_required", plan, receipt: null };
  }
  if (reviewedPreviewDigest !== plan.planDigest) {
    return { code: "preview_mismatch", plan, receipt: null };
  }
  if (plan.approvedOperationIds.length === 0) {
    return { code: "closed_noop", plan, receipt: null };
  }
  return { code: "ready", plan, receipt: null };
}

export function createWarehousePatch(
  world: WorldSnapshot,
  options: WarehousePatchOptions,
): Patch {
  const relation = world.claimRelations[options.relationId ?? "rel-warehouse-accounts"]!;
  const confirmClaimId = options.confirmClaimId ?? "sc-repaired";
  const rejectClaimId = relation.claimIds.find((claimId) => claimId !== confirmClaimId)!;
  const repaired = world.canon[confirmClaimId]!;
  const stole = world.canon[rejectClaimId]!;
  const dispute = world.constraints["warehouse_dispute"]!;
  const memory = world.memories["mem-stole-gen-root"]!;
  const canonOperation: ResolveCanonRelationOperation = {
    id: "resolve-warehouse-canon",
    kind: "resolve_canon_relation",
    relationId: relation.id,
    confirmClaimId: repaired.claimId,
    rejectClaimId: stole.claimId,
    reasonCode: "repair_was_not_theft",
    evidenceRefs: [relation.id, repaired.claimId, stole.claimId],
    preconditions: [
      expectedPrecondition(relationKey(relation.id), relation.entityRevision, relation),
      expectedPrecondition(canonKey(repaired.claimId), repaired.entityRevision, repaired),
      expectedPrecondition(canonKey(stole.claimId), stole.entityRevision, stole),
    ],
    writes: [
      expectedWrite(canonKey(repaired.claimId), { ...repaired, entityRevision: repaired.entityRevision + 1, status: "confirmed" }),
      expectedWrite(canonKey(stole.claimId), { ...stole, entityRevision: stole.entityRevision + 1, status: "rejected" }),
    ],
  };
  const afterDependency = {
    layer: "belief" as const,
    actorId: "gen",
    claimId: "sc-stole",
    equals: "believed" as const,
  };
  const conditionOperation: ReplaceConstraintDependencyOperation = {
    id: "repair-warehouse-dispute-layer",
    kind: "replace_constraint_dependency",
    constraintId: dispute.id,
    beforeDependency: dispute.dependency,
    afterDependency,
    reasonCode: "condition_reads_subjective_belief",
    evidenceRefs: [dispute.id, beliefKey("gen", "sc-stole")],
    preconditions: [expectedPrecondition(constraintKey(dispute.id), dispute.entityRevision, dispute)],
    writes: [expectedWrite(constraintKey(dispute.id), { ...dispute, entityRevision: dispute.entityRevision + 1, dependency: afterDependency })],
  };
  const archiveOperation: ArchiveMemoryOperation = {
    id: "archive-gen-root-memory",
    kind: "archive_memory",
    memoryId: memory.id,
    beforeEligibility: "active",
    afterEligibility: "archived",
    reasonCode: "optional_remove_from_belief_scoring",
    evidenceRefs: [memory.id],
    preconditions: [expectedPrecondition(memoryKey(memory.id), memory.entityRevision, memory)],
    writes: [expectedWrite(memoryKey(memory.id), { ...memory, entityRevision: memory.entityRevision + 1, beliefEligibility: "archived" })],
  };
  return {
    id: options.id,
    patchRevision: options.patchRevision,
    worldId: world.worldId,
    baseWorldRevision: world.revision,
    createdAt: options.createdAt,
    createdVia: options.createdVia,
    summary: "Resolve the warehouse account, repair its condition layer, and optionally archive Gen's root memory.",
    operations: [
      canonOperation,
      ...(options.repairRegisteredWrongLayer === false ? [] : [conditionOperation]),
      ...(options.memoryPolicy === "review_archive" ? [archiveOperation] : []),
    ],
  };
}
