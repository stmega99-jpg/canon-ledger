export const TOOL_NAMES = [
  "search_world",
  "trace_claim_provenance",
  "check_world_consistency",
  "suggest_world_edit",
  "apply_reviewed_edit",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type BeliefStance = "unknown" | "doubted" | "believed" | "rejected";
export type MemorySourceType = "witnessed" | "heard";
export type ConditionKind = "quest_gate" | "dialogue_condition";
export type ConsistencyView = "current" | "proposal" | "selected_operation" | "reviewed";
export type MemoryPolicy = "preserve" | "review_archive";

export interface SearchWorldInput {
  query?: string;
  actorId?: string;
  claimId?: string;
  stance?: BeliefStance;
  sourceType?: MemorySourceType;
  conditionKind?: ConditionKind;
  cursor?: string;
  limit?: number;
}

export interface TraceClaimProvenanceInput {
  actorId: string;
  claimId: string;
  maxHops?: number;
}

export interface CheckWorldConsistencyInput {
  view?: ConsistencyView;
  operationId?: string;
}

export interface SuggestWorldEditInput {
  incidentId: string;
  resolution: {
    relationId: string;
    confirmClaimId: string;
  };
  expectedWorldRevision: number;
  memoryPolicy: MemoryPolicy;
  repairRegisteredWrongLayer: boolean;
}

export interface ApplyReviewedEditInput {
  patchId: string;
  patchRevision: number;
}

export interface ToolInputByName {
  search_world: SearchWorldInput;
  trace_claim_provenance: TraceClaimProvenanceInput;
  check_world_consistency: CheckWorldConsistencyInput;
  suggest_world_edit: SuggestWorldEditInput;
  apply_reviewed_edit: ApplyReviewedEditInput;
}

export interface ToolDefinition {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: Readonly<Record<string, boolean>>;
}

export const TOOL_DEFINITIONS = [
  {
    name: "search_world",
    title: "Search world",
    description:
      "Filter and focus the visible Canon Ledger belief table. Returns bounded registered actors, claims, memories, beliefs, and game conditions with totals and a cursor. Changes page view only; never changes the world or review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 120 },
        actorId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        claimId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        stance: { enum: ["unknown", "doubted", "believed", "rejected"] },
        sourceType: { enum: ["witnessed", "heard"] },
        conditionKind: { enum: ["quest_gate", "dialogue_condition"] },
        cursor: { type: "string", maxLength: 512 },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "trace_claim_provenance",
    title: "Trace claim provenance",
    description:
      "Show why one registered actor holds one claim by tracing stored accepted rumor hops to immutable roots and showing rejected branch attempts. Changes page view only; never invents a hop or changes world data.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["actorId", "claimId"],
      properties: {
        actorId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        claimId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        maxHops: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "check_world_consistency",
    title: "Check world consistency",
    description:
      "Evaluate only game conditions registered in the loaded Canon Ledger world, for current state or an existing page-owned preview. Separates transition from verdict and labels provisional authority. Changes page view only; this is not an engine-wide safety check.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        view: { enum: ["current", "proposal", "selected_operation", "reviewed"] },
        operationId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
      },
      allOf: [
        {
          if: {
            properties: { view: { const: "selected_operation" } },
            required: ["view"],
          },
          then: { required: ["operationId"] },
          else: { not: { required: ["operationId"] } },
        },
      ],
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "suggest_world_edit",
    title: "Suggest world edit",
    description:
      "Stage a page-derived, operation-level patch for one registered incident at an expected world revision. This changes workflow state and opens visible page review, but never approves or commits any operation and never replaces an open patch.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "incidentId",
        "resolution",
        "expectedWorldRevision",
        "memoryPolicy",
        "repairRegisteredWrongLayer",
      ],
      properties: {
        incidentId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        resolution: {
          type: "object",
          additionalProperties: false,
          required: ["relationId", "confirmClaimId"],
          properties: {
            relationId: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
            },
            confirmClaimId: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
            },
          },
        },
        expectedWorldRevision: { type: "integer", minimum: 0 },
        memoryPolicy: { enum: ["preserve", "review_archive"] },
        repairRegisteredWrongLayer: { type: "boolean" },
      },
    },
    annotations: { untrustedContentHint: true },
  },
  {
    name: "apply_reviewed_edit",
    title: "Apply reviewed edit",
    description:
      "Attempt to commit an existing page-owned patch using only review decisions already recorded through page controls. Never supplies approval. Refuses pending, stale, mismatched, or unverified review state without changing the world.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["patchId", "patchRevision"],
      properties: {
        patchId: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        },
        patchRevision: { type: "integer", minimum: 1 },
      },
    },
    annotations: { untrustedContentHint: true },
  },
] as const satisfies readonly ToolDefinition[];

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly field: string; readonly reason: string };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function invalid(field: string, reason: string): ValidationResult<never> {
  return { ok: false, field, reason };
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validateObject(
  input: unknown,
  allowedKeys: readonly string[],
  field = "$",
): ValidationResult<Record<string, unknown>> {
  if (!isObject(input)) {
    return invalid(field, "must be an object");
  }

  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      const renderedKey = typeof key === "string" ? key : key.description ?? "symbol";
      return invalid(field === "$" ? renderedKey : `${field}.${renderedKey}`, "is not allowed");
    }
  }

  return { ok: true, value: input };
}

function requireOwn(input: Record<string, unknown>, field: string): ValidationResult<unknown> {
  if (!Object.prototype.hasOwnProperty.call(input, field)) {
    return invalid(field, "is required");
  }
  return { ok: true, value: input[field] };
}

function validateString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(field, "must be a string");
  }
  const length = Array.from(value).length;
  if (length < minimum || length > maximum) {
    return invalid(field, `must contain between ${minimum} and ${maximum} characters`);
  }
  return { ok: true, value };
}

function validateId(value: unknown, field: string): ValidationResult<string> {
  const stringResult = validateString(value, field, 1, 80);
  if (!stringResult.ok) {
    return stringResult;
  }
  if (!ID_PATTERN.test(stringResult.value)) {
    return invalid(field, "must match ^[A-Za-z0-9][A-Za-z0-9._:-]*$");
  }
  return stringResult;
}

function validateInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum?: number,
): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return invalid(field, "must be an integer");
  }
  if (value < minimum || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? `${minimum} or greater` : `between ${minimum} and ${maximum}`;
    return invalid(field, `must be ${range}`);
  }
  return { ok: true, value };
}

function validateEnum<const Values extends readonly string[]>(
  value: unknown,
  field: string,
  values: Values,
): ValidationResult<Values[number]> {
  if (typeof value !== "string" || !values.some((candidate) => candidate === value)) {
    return invalid(field, `must be one of: ${values.join(", ")}`);
  }
  return { ok: true, value: value as Values[number] };
}

function validateSearchWorld(input: unknown): ValidationResult<SearchWorldInput> {
  const objectResult = validateObject(input, [
    "query",
    "actorId",
    "claimId",
    "stance",
    "sourceType",
    "conditionKind",
    "cursor",
    "limit",
  ]);
  if (!objectResult.ok) {
    return objectResult;
  }

  const source = objectResult.value;
  const value: SearchWorldInput = {};

  if (Object.prototype.hasOwnProperty.call(source, "query")) {
    const result = validateString(source["query"], "query", 0, 120);
    if (!result.ok) return result;
    value.query = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "actorId")) {
    const result = validateId(source["actorId"], "actorId");
    if (!result.ok) return result;
    value.actorId = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "claimId")) {
    const result = validateId(source["claimId"], "claimId");
    if (!result.ok) return result;
    value.claimId = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "stance")) {
    const result = validateEnum(source["stance"], "stance", ["unknown", "doubted", "believed", "rejected"]);
    if (!result.ok) return result;
    value.stance = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "sourceType")) {
    const result = validateEnum(source["sourceType"], "sourceType", ["witnessed", "heard"]);
    if (!result.ok) return result;
    value.sourceType = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "conditionKind")) {
    const result = validateEnum(source["conditionKind"], "conditionKind", ["quest_gate", "dialogue_condition"]);
    if (!result.ok) return result;
    value.conditionKind = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "cursor")) {
    const result = validateString(source["cursor"], "cursor", 0, 512);
    if (!result.ok) return result;
    value.cursor = result.value;
  }
  if (Object.prototype.hasOwnProperty.call(source, "limit")) {
    const result = validateInteger(source["limit"], "limit", 1, 25);
    if (!result.ok) return result;
    value.limit = result.value;
  }

  return { ok: true, value };
}

function validateTraceClaimProvenance(input: unknown): ValidationResult<TraceClaimProvenanceInput> {
  const objectResult = validateObject(input, ["actorId", "claimId", "maxHops"]);
  if (!objectResult.ok) {
    return objectResult;
  }
  const source = objectResult.value;

  const actor = requireOwn(source, "actorId");
  if (!actor.ok) return actor;
  const actorId = validateId(actor.value, "actorId");
  if (!actorId.ok) return actorId;

  const claim = requireOwn(source, "claimId");
  if (!claim.ok) return claim;
  const claimId = validateId(claim.value, "claimId");
  if (!claimId.ok) return claimId;

  const value: TraceClaimProvenanceInput = {
    actorId: actorId.value,
    claimId: claimId.value,
  };
  if (Object.prototype.hasOwnProperty.call(source, "maxHops")) {
    const result = validateInteger(source["maxHops"], "maxHops", 1, 12);
    if (!result.ok) return result;
    value.maxHops = result.value;
  }

  return { ok: true, value };
}

function validateCheckWorldConsistency(input: unknown): ValidationResult<CheckWorldConsistencyInput> {
  const objectResult = validateObject(input, ["view", "operationId"]);
  if (!objectResult.ok) {
    return objectResult;
  }
  const source = objectResult.value;
  const value: CheckWorldConsistencyInput = {};

  if (Object.prototype.hasOwnProperty.call(source, "view")) {
    const result = validateEnum(source["view"], "view", ["current", "proposal", "selected_operation", "reviewed"]);
    if (!result.ok) return result;
    value.view = result.value;
  }

  const hasOperationId = Object.prototype.hasOwnProperty.call(source, "operationId");
  if (value.view === "selected_operation") {
    if (!hasOperationId) {
      return invalid("operationId", "is required when view is selected_operation");
    }
    const result = validateId(source["operationId"], "operationId");
    if (!result.ok) return result;
    value.operationId = result.value;
  } else if (hasOperationId) {
    return invalid("operationId", "is allowed only when view is selected_operation");
  }

  return { ok: true, value };
}

function validateSuggestWorldEdit(input: unknown): ValidationResult<SuggestWorldEditInput> {
  const objectResult = validateObject(input, [
    "incidentId",
    "resolution",
    "expectedWorldRevision",
    "memoryPolicy",
    "repairRegisteredWrongLayer",
  ]);
  if (!objectResult.ok) {
    return objectResult;
  }
  const source = objectResult.value;

  const incident = requireOwn(source, "incidentId");
  if (!incident.ok) return incident;
  const incidentId = validateId(incident.value, "incidentId");
  if (!incidentId.ok) return incidentId;

  const resolutionValue = requireOwn(source, "resolution");
  if (!resolutionValue.ok) return resolutionValue;
  const resolutionObject = validateObject(
    resolutionValue.value,
    ["relationId", "confirmClaimId"],
    "resolution",
  );
  if (!resolutionObject.ok) return resolutionObject;

  const relation = requireOwn(resolutionObject.value, "relationId");
  if (!relation.ok) return invalid("resolution.relationId", relation.reason);
  const relationId = validateId(relation.value, "resolution.relationId");
  if (!relationId.ok) return relationId;

  const confirmClaim = requireOwn(resolutionObject.value, "confirmClaimId");
  if (!confirmClaim.ok) return invalid("resolution.confirmClaimId", confirmClaim.reason);
  const confirmClaimId = validateId(confirmClaim.value, "resolution.confirmClaimId");
  if (!confirmClaimId.ok) return confirmClaimId;

  const revisionValue = requireOwn(source, "expectedWorldRevision");
  if (!revisionValue.ok) return revisionValue;
  const expectedWorldRevision = validateInteger(
    revisionValue.value,
    "expectedWorldRevision",
    0,
  );
  if (!expectedWorldRevision.ok) return expectedWorldRevision;

  const policyValue = requireOwn(source, "memoryPolicy");
  if (!policyValue.ok) return policyValue;
  const memoryPolicy = validateEnum(policyValue.value, "memoryPolicy", ["preserve", "review_archive"]);
  if (!memoryPolicy.ok) return memoryPolicy;

  const repairValue = requireOwn(source, "repairRegisteredWrongLayer");
  if (!repairValue.ok) return repairValue;
  if (typeof repairValue.value !== "boolean") {
    return invalid("repairRegisteredWrongLayer", "must be a boolean");
  }

  return {
    ok: true,
    value: {
      incidentId: incidentId.value,
      resolution: {
        relationId: relationId.value,
        confirmClaimId: confirmClaimId.value,
      },
      expectedWorldRevision: expectedWorldRevision.value,
      memoryPolicy: memoryPolicy.value,
      repairRegisteredWrongLayer: repairValue.value,
    },
  };
}

function validateApplyReviewedEdit(input: unknown): ValidationResult<ApplyReviewedEditInput> {
  const objectResult = validateObject(input, ["patchId", "patchRevision"]);
  if (!objectResult.ok) {
    return objectResult;
  }
  const source = objectResult.value;

  const patch = requireOwn(source, "patchId");
  if (!patch.ok) return patch;
  const patchId = validateId(patch.value, "patchId");
  if (!patchId.ok) return patchId;

  const revision = requireOwn(source, "patchRevision");
  if (!revision.ok) return revision;
  const patchRevision = validateInteger(revision.value, "patchRevision", 1);
  if (!patchRevision.ok) return patchRevision;

  return {
    ok: true,
    value: { patchId: patchId.value, patchRevision: patchRevision.value },
  };
}

export function validateToolInput<Name extends ToolName>(
  name: Name,
  input: unknown,
): ValidationResult<ToolInputByName[Name]> {
  switch (name) {
    case "search_world":
      return validateSearchWorld(input) as ValidationResult<ToolInputByName[Name]>;
    case "trace_claim_provenance":
      return validateTraceClaimProvenance(input) as ValidationResult<ToolInputByName[Name]>;
    case "check_world_consistency":
      return validateCheckWorldConsistency(input) as ValidationResult<ToolInputByName[Name]>;
    case "suggest_world_edit":
      return validateSuggestWorldEdit(input) as ValidationResult<ToolInputByName[Name]>;
    case "apply_reviewed_edit":
      return validateApplyReviewedEdit(input) as ValidationResult<ToolInputByName[Name]>;
  }
}
