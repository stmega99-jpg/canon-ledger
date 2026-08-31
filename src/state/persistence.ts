import { canonicalDigest, canonicalJson, canonicalValue } from "../domain/canonical.ts";
import { validatePatchShape } from "../domain/patches.ts";
import type {
  AppState,
  ApplyReceipt,
  AuditEntry,
  Patch,
  PatchOperation,
  ReviewDecision,
  SearchFilters,
} from "../domain/types.ts";
import { validateWorldSnapshot } from "../domain/validate.ts";

export const STORAGE_KEY = "canon-ledger:app-state:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class AppStateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppStateValidationError";
  }
}

const fail = (path: string, message: string): never => {
  throw new AppStateValidationError(`${path}: ${message}`);
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "must be an object");
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) fail(path, `unsupported fields: ${extras.sort().join(", ")}`);
  for (const key of required) if (!(key in value)) fail(`${path}.${key}`, "is required");
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) return fail(path, "must be a non-empty string");
  return value;
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function ownReference<T>(
  record: Record<string, T>,
  value: unknown,
  path: string,
): string | null {
  const id = nullableText(value, path);
  if (id !== null && !Object.hasOwn(record, id)) fail(path, "does not reference an existing record");
  return id;
}

function isoText(value: unknown, path: string): string {
  const result = text(value, path);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) {
    fail(path, "must be a canonical ISO timestamp");
  }
  return result;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail(path, "must be a non-negative integer");
  }
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return fail(path, "must be an array");
  return value.map((item, index) => text(item, `${path}[${index}]`));
}

function validateOperation(value: unknown, path: string): PatchOperation {
  const operation = object(value, path);
  const base = ["id", "kind", "reasonCode", "evidenceRefs", "preconditions", "writes"];
  const kind = text(operation["kind"], `${path}.kind`);
  const fields = kind === "resolve_canon_relation"
    ? ["relationId", "confirmClaimId", "rejectClaimId"]
    : kind === "replace_constraint_dependency"
      ? ["constraintId", "beforeDependency", "afterDependency"]
      : kind === "archive_memory"
        ? ["memoryId", "beforeEligibility", "afterEligibility"]
        : fail(`${path}.kind`, "is unsupported");
  exactKeys(operation, [...base, ...fields], [], path);
  text(operation["id"], `${path}.id`);
  text(operation["reasonCode"], `${path}.reasonCode`);
  stringArray(operation["evidenceRefs"], `${path}.evidenceRefs`);
  if (!Array.isArray(operation["preconditions"]) || !Array.isArray(operation["writes"])) {
    return fail(path, "preconditions and writes must be arrays");
  }
  operation["preconditions"].forEach((raw, index) => {
    const item = object(raw, `${path}.preconditions[${index}]`);
    exactKeys(item, ["stateKey", "entityRevision", "before"], [], `${path}.preconditions[${index}]`);
    text(item["stateKey"], `${path}.preconditions[${index}].stateKey`);
    integer(item["entityRevision"], `${path}.preconditions[${index}].entityRevision`);
    canonicalValue(item["before"]);
  });
  operation["writes"].forEach((raw, index) => {
    const item = object(raw, `${path}.writes[${index}]`);
    exactKeys(item, ["stateKey", "after"], [], `${path}.writes[${index}]`);
    text(item["stateKey"], `${path}.writes[${index}].stateKey`);
    canonicalValue(item["after"]);
  });
  for (const field of fields) {
    if (field.endsWith("Dependency")) canonicalValue(operation[field]);
    else text(operation[field], `${path}.${field}`);
  }
  return operation as unknown as PatchOperation;
}

function validatePatch(value: unknown, path: string): Patch {
  const shape = validatePatchShape(value);
  if (!shape.ok) fail(path, shape.code);
  const patch = object(value, path);
  exactKeys(
    patch,
    ["id", "patchRevision", "worldId", "baseWorldRevision", "createdAt", "createdVia", "summary", "operations"],
    [],
    path,
  );
  text(patch["id"], `${path}.id`);
  integer(patch["patchRevision"], `${path}.patchRevision`);
  text(patch["worldId"], `${path}.worldId`);
  integer(patch["baseWorldRevision"], `${path}.baseWorldRevision`);
  text(patch["createdAt"], `${path}.createdAt`);
  if (patch["createdVia"] !== "page-ui" && patch["createdVia"] !== "site-tool") {
    fail(`${path}.createdVia`, "is unsupported");
  }
  text(patch["summary"], `${path}.summary`);
  const operations = patch["operations"];
  if (!Array.isArray(operations) || operations.length === 0) {
    fail(`${path}.operations`, "must be a non-empty array");
  }
  (operations as unknown[]).forEach((operation: unknown, index: number) => validateOperation(operation, `${path}.operations[${index}]`));
  return patch as unknown as Patch;
}

function validateDecision(value: unknown, path: string): ReviewDecision {
  const decision = object(value, path);
  exactKeys(
    decision,
    ["patchId", "patchRevision", "operationId", "operationFingerprint", "decision", "decidedVia", "decidedAt"],
    [],
    path,
  );
  text(decision["patchId"], `${path}.patchId`);
  integer(decision["patchRevision"], `${path}.patchRevision`);
  text(decision["operationId"], `${path}.operationId`);
  text(decision["operationFingerprint"], `${path}.operationFingerprint`);
  if (decision["decision"] !== "approved" && decision["decision"] !== "rejected") fail(`${path}.decision`, "is unsupported");
  if (decision["decidedVia"] !== "page-ui") fail(`${path}.decidedVia`, "must be page-ui");
  isoText(decision["decidedAt"], `${path}.decidedAt`);
  return decision as unknown as ReviewDecision;
}

function validateReceipt(value: unknown, path: string): ApplyReceipt {
  const receipt = object(value, path);
  exactKeys(receipt, [
    "status", "worldId", "patchId", "patchRevision", "patchFingerprint",
    "baseWorldRevision", "committedWorldRevision", "planDigest",
    "appliedOperationIds", "rejectedOperationIds", "committedAt",
  ], [], path);
  if (receipt["status"] !== "applied" && receipt["status"] !== "closed_noop") fail(`${path}.status`, "is unsupported");
  for (const field of ["worldId", "patchId", "patchFingerprint", "planDigest"]) text(receipt[field], `${path}.${field}`);
  isoText(receipt["committedAt"], `${path}.committedAt`);
  for (const field of ["patchRevision", "baseWorldRevision", "committedWorldRevision"]) integer(receipt[field], `${path}.${field}`);
  stringArray(receipt["appliedOperationIds"], `${path}.appliedOperationIds`);
  stringArray(receipt["rejectedOperationIds"], `${path}.rejectedOperationIds`);
  return receipt as unknown as ApplyReceipt;
}

function validateAudit(value: unknown, path: string): AuditEntry {
  const audit = object(value, path);
  exactKeys(audit, [
    "id", "at", "source", "action", "effect", "code", "worldRevisionBefore",
    "worldRevisionAfter", "summary",
  ], ["patchId", "patchRevision"], path);
  for (const field of ["id", "action", "code", "summary"]) text(audit[field], `${path}.${field}`);
  isoText(audit["at"], `${path}.at`);
  if (!["page-ui", "site-tool", "system"].includes(String(audit["source"]))) fail(`${path}.source`, "is unsupported");
  if (!["none", "view", "workflow", "world"].includes(String(audit["effect"]))) fail(`${path}.effect`, "is unsupported");
  integer(audit["worldRevisionBefore"], `${path}.worldRevisionBefore`);
  integer(audit["worldRevisionAfter"], `${path}.worldRevisionAfter`);
  if ("patchId" in audit) text(audit["patchId"], `${path}.patchId`);
  if ("patchRevision" in audit) integer(audit["patchRevision"], `${path}.patchRevision`);
  return audit as unknown as AuditEntry;
}

function validateFilters(value: unknown, path: string): SearchFilters {
  const filters = object(value, path);
  exactKeys(filters, ["query", "actorId", "claimId", "stance", "sourceType", "conditionKind"], [], path);
  if (typeof filters["query"] !== "string") fail(`${path}.query`, "must be a string");
  nullableText(filters["actorId"], `${path}.actorId`);
  nullableText(filters["claimId"], `${path}.claimId`);
  if (filters["stance"] !== null && !["unknown", "doubted", "believed", "rejected"].includes(String(filters["stance"]))) fail(`${path}.stance`, "is unsupported");
  if (filters["sourceType"] !== null && !["witnessed", "heard"].includes(String(filters["sourceType"]))) fail(`${path}.sourceType`, "is unsupported");
  if (filters["conditionKind"] !== null && !["quest_gate", "dialogue_condition"].includes(String(filters["conditionKind"]))) fail(`${path}.conditionKind`, "is unsupported");
  return filters as unknown as SearchFilters;
}

export function parseAppState(input: unknown): AppState {
  // Normalize to a JSON-only detached value before trusting any restored object.
  const normalized = JSON.parse(canonicalJson(input)) as unknown;
  const state = object(normalized, "state");
  exactKeys(state, [
    "appSchemaVersion", "writeState", "world", "stagedPatch", "reviewDecisions",
    "reviewedPreviewDigest", "receipts", "audit", "viewState",
  ], [], "state");
  if (state["appSchemaVersion"] !== 1) fail("state.appSchemaVersion", "must equal 1");
  if (state["writeState"] !== "enabled" && state["writeState"] !== "writes_disabled") fail("state.writeState", "is unsupported");
  const world = validateWorldSnapshot(state["world"]);
  const stagedPatch = state["stagedPatch"] === null
    ? null
    : validatePatch(state["stagedPatch"], "state.stagedPatch");
  if (
    stagedPatch &&
    (stagedPatch.worldId !== world.worldId || stagedPatch.baseWorldRevision !== world.revision)
  ) fail("state.stagedPatch", "must target the current world and revision");
  const decisions = state["reviewDecisions"];
  if (!Array.isArray(decisions)) fail("state.reviewDecisions", "must be an array");
  const validatedDecisions = (decisions as unknown[]).map((decision: unknown, index: number) =>
    validateDecision(decision, `state.reviewDecisions[${index}]`)
  );
  const reviewedPreviewDigest = nullableText(state["reviewedPreviewDigest"], "state.reviewedPreviewDigest");
  if (!stagedPatch) {
    if (validatedDecisions.length > 0) fail("state.reviewDecisions", "must be empty without a staged patch");
    if (reviewedPreviewDigest !== null) fail("state.reviewedPreviewDigest", "must be null without a staged patch");
  } else {
    const operationIds = new Set(stagedPatch.operations.map((operation) => operation.id));
    const decisionIds = new Set<string>();
    validatedDecisions.forEach((decision, index) => {
      const path = `state.reviewDecisions[${index}]`;
      if (decision.patchId !== stagedPatch.id || decision.patchRevision !== stagedPatch.patchRevision) {
        fail(path, "does not target the active patch revision");
      }
      if (!operationIds.has(decision.operationId)) fail(`${path}.operationId`, "does not reference an active operation");
      if (decisionIds.has(decision.operationId)) fail(`${path}.operationId`, "duplicates an operation decision");
      decisionIds.add(decision.operationId);
    });
  }
  const receipts = object(state["receipts"], "state.receipts");
  for (const [key, value] of Object.entries(receipts)) {
    const receipt = validateReceipt(value, `state.receipts.${key}`);
    if (`${receipt.patchId}@${receipt.patchRevision}` !== key) fail(`state.receipts.${key}`, "key does not match receipt identity");
  }
  const auditEntries = state["audit"];
  if (!Array.isArray(auditEntries)) fail("state.audit", "must be an array");
  (auditEntries as unknown[]).forEach((entry: unknown, index: number) => validateAudit(entry, `state.audit[${index}]`));
  const view = object(state["viewState"], "state.viewState");
  exactKeys(view, [
    "selectedIncidentId", "selectedActorId", "selectedClaimId", "focusedPanel",
    "filters", "cursor", "previewMode", "selectedOperationId",
  ], [], "state.viewState");
  const incidentId = text(view["selectedIncidentId"], "state.viewState.selectedIncidentId");
  const incident = Object.hasOwn(world.incidents, incidentId)
    ? world.incidents[incidentId]!
    : fail("state.viewState.selectedIncidentId", "does not reference an existing incident");
  const selectedActorId = ownReference(world.actors, view["selectedActorId"], "state.viewState.selectedActorId");
  const selectedClaimId = ownReference(world.claims, view["selectedClaimId"], "state.viewState.selectedClaimId");
  if (selectedActorId !== null && !incident.actorIds.includes(selectedActorId)) {
    fail("state.viewState.selectedActorId", "is outside the selected incident");
  }
  if (selectedClaimId !== null && !incident.claimIds.includes(selectedClaimId)) {
    fail("state.viewState.selectedClaimId", "is outside the selected incident");
  }
  const focusedPanel = text(view["focusedPanel"], "state.viewState.focusedPanel");
  if (!["beliefs", "trace", "conditions", "suggestions"].includes(focusedPanel)) {
    fail("state.viewState.focusedPanel", "is unsupported");
  }
  const filters = validateFilters(view["filters"], "state.viewState.filters");
  if (filters.query.length > 120) fail("state.viewState.filters.query", "must be at most 120 characters");
  const filterActorId = ownReference(world.actors, filters.actorId, "state.viewState.filters.actorId");
  const filterClaimId = ownReference(world.claims, filters.claimId, "state.viewState.filters.claimId");
  if (filterActorId !== null && !incident.actorIds.includes(filterActorId)) {
    fail("state.viewState.filters.actorId", "is outside the selected incident");
  }
  if (filterClaimId !== null && !incident.claimIds.includes(filterClaimId)) {
    fail("state.viewState.filters.claimId", "is outside the selected incident");
  }
  const cursor = nullableText(view["cursor"], "state.viewState.cursor");
  if (cursor !== null && cursor.length > 512) fail("state.viewState.cursor", "must be at most 512 characters");
  const previewMode = String(view["previewMode"]);
  if (!["current", "proposal", "selected_operation", "reviewed"].includes(previewMode)) fail("state.viewState.previewMode", "is unsupported");
  const selectedOperationId = nullableText(view["selectedOperationId"], "state.viewState.selectedOperationId");
  if (!stagedPatch) {
    if (previewMode !== "current") fail("state.viewState.previewMode", "requires a staged patch");
    if (selectedOperationId !== null) fail("state.viewState.selectedOperationId", "must be null without a staged patch");
  } else {
    if (selectedOperationId !== null && !stagedPatch.operations.some((operation) => operation.id === selectedOperationId)) {
      fail("state.viewState.selectedOperationId", "does not reference an active operation");
    }
    if (previewMode === "selected_operation" && selectedOperationId === null) {
      fail("state.viewState.selectedOperationId", "is required for selected_operation preview");
    }
    if (previewMode === "reviewed" && reviewedPreviewDigest === null) {
      fail("state.viewState.previewMode", "requires a reviewed preview digest");
    }
  }
  return normalized as AppState;
}

export interface LoadStateResult {
  state: AppState | null;
  raw: string | null;
  code: "ok" | "missing" | "invalid" | "storage_failed";
}

export function loadPersistedState(storage: StorageLike, key = STORAGE_KEY): LoadStateResult {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { state: null, raw: null, code: "missing" };
    try {
      return { state: parseAppState(JSON.parse(raw)), raw, code: "ok" };
    } catch {
      return { state: null, raw, code: "invalid" };
    }
  } catch {
    return { state: null, raw: null, code: "storage_failed" };
  }
}

class VerificationError extends Error {}

export interface PersistStateResult {
  ok: boolean;
  code: "ok" | "persistence_failed" | "verification_failed" | "rollback_failed";
  digest: string | null;
  state: AppState | null;
  rollbackVerified: boolean;
}

export async function persistVerifiedState(
  storage: StorageLike,
  nextState: AppState,
  key = STORAGE_KEY,
  expectedWorldDigest: string | null = null,
): Promise<PersistStateResult> {
  let previousRaw: string | null;
  try {
    previousRaw = storage.getItem(key);
  } catch {
    return { ok: false, code: "persistence_failed", digest: null, state: null, rollbackVerified: true };
  }
  let failure: "persistence_failed" | "verification_failed" = "persistence_failed";
  try {
    const validated = parseAppState(nextState);
    const raw = canonicalJson(validated);
    const expectedDigest = await canonicalDigest(validated);
    storage.setItem(key, raw);
    failure = "verification_failed";
    const readback = storage.getItem(key);
    if (readback !== raw) throw new VerificationError("readback differs");
    const parsed = parseAppState(JSON.parse(readback));
    const actualDigest = await canonicalDigest(parsed);
    if (actualDigest !== expectedDigest) throw new VerificationError("digest differs");
    if (
      expectedWorldDigest !== null &&
      await canonicalDigest(parsed.world) !== expectedWorldDigest
    ) throw new VerificationError("world digest differs");
    return { ok: true, code: "ok", digest: actualDigest, state: parsed, rollbackVerified: true };
  } catch (error) {
    if (!(error instanceof VerificationError) && failure === "verification_failed") {
      failure = "verification_failed";
    }
    try {
      if (storage.getItem(key) !== previousRaw) {
        if (previousRaw === null) storage.removeItem(key);
        else storage.setItem(key, previousRaw);
      }
      if (storage.getItem(key) !== previousRaw) throw new Error("rollback readback differs");
      return { ok: false, code: failure, digest: null, state: null, rollbackVerified: true };
    } catch {
      return { ok: false, code: "rollback_failed", digest: null, state: null, rollbackVerified: false };
    }
  }
}
