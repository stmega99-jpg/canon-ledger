import { canonicalJson, canonicalValue, roundCanonical } from "./canonical.ts";
import { evaluateBeliefs, parseIsoDate, toScoringMemory } from "./beliefs.ts";
import { contradictionGroups, supportByClaim, traceProvenance } from "./provenance.ts";
import { decayedConfidence } from "./scoring.ts";
import {
  beliefKey,
  relationshipKey,
  type BeliefStance,
  type CanonStatus,
  type ConstraintDependency,
  type GameConstraint,
  type LocalizedText,
  type RumorTransfer,
  type WorldSnapshot,
} from "./types.ts";

export class DomainValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "DomainValidationError";
    this.path = path;
  }
}

const fail = (path: string, message: string): never => {
  throw new DomainValidationError(path, message);
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) return fail(path, "must be a non-empty string");
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "must be finite");
  return value;
}

function integer(value: unknown, path: string): number {
  const result = finite(value, path);
  if (!Number.isInteger(result)) return fail(path, "must be an integer");
  return result;
}

function ranged(value: unknown, path: string, low: number, high: number): number {
  const result = finite(value, path);
  if (result < low || result > high) return fail(path, `must be in [${low}, ${high}]`);
  return result;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return fail(path, "must be a boolean");
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return fail(path, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) fail(path, `contains unsupported fields: ${extras.sort().join(", ")}`);
  for (const key of allowed) {
    if (!(key in value)) fail(`${path}.${key}`, "is required");
  }
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return fail(path, "must be an array");
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function localized(value: unknown, path: string): LocalizedText {
  const item = record(value, path);
  exactKeys(item, ["ja", "en"], path);
  return { ja: string(item["ja"], `${path}.ja`), en: string(item["en"], `${path}.en`) };
}

function iso(value: unknown, path: string): string {
  const text = string(value, path);
  const parsed = parseIsoDate(text, path);
  if (parsed.toISOString() !== text) fail(path, "must be a canonical ISO 8601 UTC timestamp");
  return text;
}

function optionalIso(value: unknown, path: string): string | null {
  return value === null ? null : iso(value, path);
}

function validateLocalized(value: unknown, path: string): void {
  localized(value, path);
}

export function validateConstraintDependency(
  value: unknown,
  path = "dependency",
): ConstraintDependency {
  const dependency = record(value, path);
  const layer = enumValue(dependency["layer"], ["canon", "belief"] as const, `${path}.layer`);
  if (layer === "canon") {
    exactKeys(dependency, ["layer", "claimId", "equals"], path);
    return {
      layer,
      claimId: string(dependency["claimId"], `${path}.claimId`),
      equals: enumValue(
        dependency["equals"],
        ["unresolved", "confirmed", "rejected"] as const,
        `${path}.equals`,
      ),
    };
  }
  exactKeys(dependency, ["layer", "actorId", "claimId", "equals"], path);
  return {
    layer,
    actorId: string(dependency["actorId"], `${path}.actorId`),
    claimId: string(dependency["claimId"], `${path}.claimId`),
    equals: enumValue(
      dependency["equals"],
      ["unknown", "doubted", "believed", "rejected"] as const,
      `${path}.equals`,
    ),
  };
}

function validateStructure(input: unknown): WorldSnapshot {
  const world = record(input, "world");
  exactKeys(
    world,
    [
      "schemaVersion", "worldId", "revision", "simulatedAt", "incidents", "actors",
      "claims", "claimRelations", "canon", "relationships", "memories",
      "rumorTransfers", "beliefs", "constraints",
    ],
    "world",
  );
  if (world["schemaVersion"] !== 1) fail("world.schemaVersion", "must equal 1");
  string(world["worldId"], "world.worldId");
  if (integer(world["revision"], "world.revision") < 0) fail("world.revision", "must be non-negative");
  iso(world["simulatedAt"], "world.simulatedAt");

  const incidents = record(world["incidents"], "world.incidents");
  for (const [key, raw] of Object.entries(incidents)) {
    const item = record(raw, `world.incidents.${key}`);
    exactKeys(item, ["id", "label", "actorIds", "claimIds", "defaultClaimId"], `world.incidents.${key}`);
    if (string(item["id"], `world.incidents.${key}.id`) !== key) fail(`world.incidents.${key}.id`, "must match map key");
    string(item["label"], `world.incidents.${key}.label`);
    stringArray(item["actorIds"], `world.incidents.${key}.actorIds`);
    stringArray(item["claimIds"], `world.incidents.${key}.claimIds`);
    string(item["defaultClaimId"], `world.incidents.${key}.defaultClaimId`);
  }

  const actors = record(world["actors"], "world.actors");
  for (const [key, raw] of Object.entries(actors)) {
    const item = record(raw, `world.actors.${key}`);
    exactKeys(item, ["id", "name"], `world.actors.${key}`);
    if (string(item["id"], `world.actors.${key}.id`) !== key) fail(`world.actors.${key}.id`, "must match map key");
    validateLocalized(item["name"], `world.actors.${key}.name`);
  }

  const claims = record(world["claims"], "world.claims");
  for (const [key, raw] of Object.entries(claims)) {
    const item = record(raw, `world.claims.${key}`);
    exactKeys(item, ["id", "canonical", "subjectActorId", "subjectValence"], `world.claims.${key}`);
    if (string(item["id"], `world.claims.${key}.id`) !== key) fail(`world.claims.${key}.id`, "must match map key");
    validateLocalized(item["canonical"], `world.claims.${key}.canonical`);
    nullableString(item["subjectActorId"], `world.claims.${key}.subjectActorId`);
    if (![-1, 0, 1].includes(finite(item["subjectValence"], `world.claims.${key}.subjectValence`))) {
      fail(`world.claims.${key}.subjectValence`, "must be -1, 0, or 1");
    }
  }

  const claimRelations = record(world["claimRelations"], "world.claimRelations");
  for (const [key, raw] of Object.entries(claimRelations)) {
    const item = record(raw, `world.claimRelations.${key}`);
    exactKeys(item, ["id", "entityRevision", "kind", "claimIds"], `world.claimRelations.${key}`);
    if (string(item["id"], `world.claimRelations.${key}.id`) !== key) fail(`world.claimRelations.${key}.id`, "must match map key");
    if (integer(item["entityRevision"], `world.claimRelations.${key}.entityRevision`) < 0) fail(`world.claimRelations.${key}.entityRevision`, "must be non-negative");
    if (item["kind"] !== "mutually_exclusive") fail(`world.claimRelations.${key}.kind`, "must be mutually_exclusive");
    const pair = stringArray(item["claimIds"], `world.claimRelations.${key}.claimIds`);
    if (pair.length !== 2 || pair[0] === pair[1]) fail(`world.claimRelations.${key}.claimIds`, "must contain two distinct claims");
  }

  const canon = record(world["canon"], "world.canon");
  for (const [key, raw] of Object.entries(canon)) {
    const item = record(raw, `world.canon.${key}`);
    exactKeys(item, ["claimId", "entityRevision", "status"], `world.canon.${key}`);
    if (string(item["claimId"], `world.canon.${key}.claimId`) !== key) fail(`world.canon.${key}.claimId`, "must match map key");
    if (integer(item["entityRevision"], `world.canon.${key}.entityRevision`) < 0) fail(`world.canon.${key}.entityRevision`, "must be non-negative");
    enumValue(item["status"], ["unresolved", "confirmed", "rejected"] as const, `world.canon.${key}.status`);
  }

  const relationships = record(world["relationships"], "world.relationships");
  for (const [key, raw] of Object.entries(relationships)) {
    const item = record(raw, `world.relationships.${key}`);
    exactKeys(item, ["fromActorId", "toActorId", "entityRevision", "trust", "affection", "fear"], `world.relationships.${key}`);
    const from = string(item["fromActorId"], `world.relationships.${key}.fromActorId`);
    const to = string(item["toActorId"], `world.relationships.${key}.toActorId`);
    if (relationshipKey(from, to) !== key) fail(`world.relationships.${key}`, "key does not match endpoints");
    if (from === to) fail(`world.relationships.${key}`, "self relationships are not stored");
    if (integer(item["entityRevision"], `world.relationships.${key}.entityRevision`) < 0) fail(`world.relationships.${key}.entityRevision`, "must be non-negative");
    ranged(item["trust"], `world.relationships.${key}.trust`, 0, 1);
    ranged(item["affection"], `world.relationships.${key}.affection`, -1, 1);
    ranged(item["fear"], `world.relationships.${key}.fear`, 0, 1);
  }

  const memories = record(world["memories"], "world.memories");
  for (const [key, raw] of Object.entries(memories)) {
    const path = `world.memories.${key}`;
    const item = record(raw, path);
    exactKeys(item, ["id", "entityRevision", "actorId", "claimId", "sourceType", "sourceActorId", "sourceMemoryId", "createdByTransferId", "provenanceRootMemoryId", "hop", "surfaceText", "sourceForgottenAt", "witnessedDirectly", "confidenceAtAcq", "importance", "emotionalWeight", "emotionType", "acquiredAt", "lastRecalledAt", "beliefEligibility"], path);
    if (string(item["id"], `${path}.id`) !== key) fail(`${path}.id`, "must match map key");
    if (integer(item["entityRevision"], `${path}.entityRevision`) < 0) fail(`${path}.entityRevision`, "must be non-negative");
    string(item["actorId"], `${path}.actorId`);
    string(item["claimId"], `${path}.claimId`);
    enumValue(item["sourceType"], ["witnessed", "heard"] as const, `${path}.sourceType`);
    nullableString(item["sourceActorId"], `${path}.sourceActorId`);
    nullableString(item["sourceMemoryId"], `${path}.sourceMemoryId`);
    nullableString(item["createdByTransferId"], `${path}.createdByTransferId`);
    string(item["provenanceRootMemoryId"], `${path}.provenanceRootMemoryId`);
    if (integer(item["hop"], `${path}.hop`) < 0) fail(`${path}.hop`, "must be non-negative");
    validateLocalized(item["surfaceText"], `${path}.surfaceText`);
    optionalIso(item["sourceForgottenAt"], `${path}.sourceForgottenAt`);
    boolean(item["witnessedDirectly"], `${path}.witnessedDirectly`);
    ranged(item["confidenceAtAcq"], `${path}.confidenceAtAcq`, 0, 1);
    if (finite(item["importance"], `${path}.importance`) < 0) fail(`${path}.importance`, "must be non-negative");
    ranged(item["emotionalWeight"], `${path}.emotionalWeight`, -1, 1);
    string(item["emotionType"], `${path}.emotionType`);
    iso(item["acquiredAt"], `${path}.acquiredAt`);
    optionalIso(item["lastRecalledAt"], `${path}.lastRecalledAt`);
    enumValue(item["beliefEligibility"], ["active", "archived"] as const, `${path}.beliefEligibility`);
  }

  const transfers = record(world["rumorTransfers"], "world.rumorTransfers");
  for (const [key, raw] of Object.entries(transfers)) {
    const path = `world.rumorTransfers.${key}`;
    const item = record(raw, path);
    const outcome = enumValue(item["outcome"], ["accepted", "rejected"] as const, `${path}.outcome`);
    const common = ["id", "fromActorId", "toActorId", "claimId", "parentMemoryId", "trustAtTransfer", "acceptanceThreshold", "supportAtTransfer", "beforeText", "beforeConfidence", "transferredAt", "outcome", "reasonCode", "afterText", "afterConfidence", "createdMemoryId"];
    exactKeys(item, common, path);
    if (string(item["id"], `${path}.id`) !== key) fail(`${path}.id`, "must match map key");
    string(item["fromActorId"], `${path}.fromActorId`);
    string(item["toActorId"], `${path}.toActorId`);
    string(item["claimId"], `${path}.claimId`);
    string(item["parentMemoryId"], `${path}.parentMemoryId`);
    ranged(item["trustAtTransfer"], `${path}.trustAtTransfer`, 0, 1);
    ranged(item["acceptanceThreshold"], `${path}.acceptanceThreshold`, 0, 1);
    const support = record(item["supportAtTransfer"], `${path}.supportAtTransfer`);
    exactKeys(support, ["corroborationCount", "repeatCount"], `${path}.supportAtTransfer`);
    if (integer(support["corroborationCount"], `${path}.supportAtTransfer.corroborationCount`) < 0) fail(`${path}.supportAtTransfer.corroborationCount`, "must be non-negative");
    if (integer(support["repeatCount"], `${path}.supportAtTransfer.repeatCount`) < 0) fail(`${path}.supportAtTransfer.repeatCount`, "must be non-negative");
    validateLocalized(item["beforeText"], `${path}.beforeText`);
    ranged(item["beforeConfidence"], `${path}.beforeConfidence`, 0, 1);
    iso(item["transferredAt"], `${path}.transferredAt`);
    if (outcome === "accepted") {
      if (item["reasonCode"] !== "trusted") fail(`${path}.reasonCode`, "accepted transfer must be trusted");
      validateLocalized(item["afterText"], `${path}.afterText`);
      ranged(item["afterConfidence"], `${path}.afterConfidence`, 0, 1);
      string(item["createdMemoryId"], `${path}.createdMemoryId`);
    } else {
      enumValue(item["reasonCode"], ["low_trust", "conflict"] as const, `${path}.reasonCode`);
      if (item["afterText"] !== null || item["afterConfidence"] !== null || item["createdMemoryId"] !== null) {
        fail(path, "rejected transfer must have null after-values and child");
      }
    }
  }

  const beliefs = record(world["beliefs"], "world.beliefs");
  for (const [key, raw] of Object.entries(beliefs)) {
    const path = `world.beliefs.${key}`;
    const item = record(raw, path);
    exactKeys(item, ["actorId", "claimId", "entityRevision", "stance", "supportScore", "opposingScore", "evidenceMemoryIds", "rationaleCode"], path);
    const actorId = string(item["actorId"], `${path}.actorId`);
    const claimId = string(item["claimId"], `${path}.claimId`);
    if (beliefKey(actorId, claimId) !== key) fail(path, "key does not match actor and claim");
    if (integer(item["entityRevision"], `${path}.entityRevision`) < 0) fail(`${path}.entityRevision`, "must be non-negative");
    enumValue(item["stance"], ["unknown", "doubted", "believed", "rejected"] as const, `${path}.stance`);
    finite(item["supportScore"], `${path}.supportScore`);
    finite(item["opposingScore"], `${path}.opposingScore`);
    stringArray(item["evidenceMemoryIds"], `${path}.evidenceMemoryIds`);
    string(item["rationaleCode"], `${path}.rationaleCode`);
  }

  const constraints = record(world["constraints"], "world.constraints");
  for (const [key, raw] of Object.entries(constraints)) {
    const path = `world.constraints.${key}`;
    const item = record(raw, path);
    exactKeys(item, ["id", "entityRevision", "incidentId", "kind", "label", "dependency", "expectedActive"], path);
    if (string(item["id"], `${path}.id`) !== key) fail(`${path}.id`, "must match map key");
    if (integer(item["entityRevision"], `${path}.entityRevision`) < 0) fail(`${path}.entityRevision`, "must be non-negative");
    string(item["incidentId"], `${path}.incidentId`);
    enumValue(item["kind"], ["quest_gate", "dialogue_condition"] as const, `${path}.kind`);
    string(item["label"], `${path}.label`);
    validateConstraintDependency(item["dependency"], `${path}.dependency`);
    boolean(item["expectedActive"], `${path}.expectedActive`);
  }

  return input as WorldSnapshot;
}

function requireReference(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) fail(path, message);
}

function validateReferencesAndInvariants(world: WorldSnapshot): void {
  for (const incident of Object.values(world.incidents)) {
    requireReference(incident.actorIds.includes(incident.defaultClaimId) === false, `world.incidents.${incident.id}`, "default claim cannot be an actor id");
    requireReference(incident.claimIds.includes(incident.defaultClaimId), `world.incidents.${incident.id}.defaultClaimId`, "must be listed in claimIds");
    for (const actorId of incident.actorIds) requireReference(world.actors[actorId], `world.incidents.${incident.id}.actorIds`, `missing actor ${actorId}`);
    for (const claimId of incident.claimIds) requireReference(world.claims[claimId], `world.incidents.${incident.id}.claimIds`, `missing claim ${claimId}`);
    for (const from of incident.actorIds) {
      for (const to of incident.actorIds) {
        if (from !== to) requireReference(world.relationships[relationshipKey(from, to)], `world.relationships`, `missing directed relationship ${from} -> ${to}`);
      }
      requireReference(world.beliefs[beliefKey(from, incident.defaultClaimId)], `world.beliefs`, `missing default-claim belief for ${from}`);
    }
  }

  for (const claim of Object.values(world.claims)) {
    if (claim.subjectActorId !== null) requireReference(world.actors[claim.subjectActorId], `world.claims.${claim.id}.subjectActorId`, "missing actor");
    requireReference(world.canon[claim.id], `world.canon.${claim.id}`, "missing explicit canon entry");
  }
  for (const relation of Object.values(world.claimRelations)) {
    for (const claimId of relation.claimIds) requireReference(world.claims[claimId], `world.claimRelations.${relation.id}.claimIds`, `missing claim ${claimId}`);
    if (relation.claimIds.filter((claimId) => world.canon[claimId]?.status === "confirmed").length > 1) {
      fail(`world.claimRelations.${relation.id}`, "mutually exclusive claims cannot both be canon-confirmed");
    }
  }
  for (const group of contradictionGroups(Object.values(world.claims), Object.values(world.claimRelations))) {
    if (group.filter((claimId) => world.canon[claimId]?.status === "confirmed").length > 1) {
      fail("world.canon", `connected mutually exclusive group cannot confirm more than one claim: ${group.join(",")}`);
    }
  }
  for (const relation of Object.values(world.relationships)) {
    requireReference(world.actors[relation.fromActorId], `world.relationships.${relationshipKey(relation.fromActorId, relation.toActorId)}`, "missing from actor");
    requireReference(world.actors[relation.toActorId], `world.relationships.${relationshipKey(relation.fromActorId, relation.toActorId)}`, "missing to actor");
  }

  for (const memory of Object.values(world.memories)) {
    const path = `world.memories.${memory.id}`;
    requireReference(world.actors[memory.actorId], `${path}.actorId`, "missing actor");
    requireReference(world.claims[memory.claimId], `${path}.claimId`, "missing claim");
    requireReference(world.memories[memory.provenanceRootMemoryId], `${path}.provenanceRootMemoryId`, "missing root memory");
    if (memory.sourceType === "witnessed") {
      if (!memory.witnessedDirectly || memory.sourceActorId !== null || memory.sourceMemoryId !== null || memory.createdByTransferId !== null || memory.hop !== 0 || memory.provenanceRootMemoryId !== memory.id) {
        fail(path, "witnessed memory must be a self-root with no transfer source");
      }
    } else {
      if (memory.witnessedDirectly || memory.sourceActorId === null || memory.sourceMemoryId === null || memory.createdByTransferId === null || memory.hop < 1) {
        fail(path, "heard memory must have actor, parent, transfer, and positive hop");
      }
      const sourceActorId = memory.sourceActorId;
      const sourceMemoryId = memory.sourceMemoryId;
      const createdByTransferId = memory.createdByTransferId;
      if (sourceActorId === null || sourceMemoryId === null || createdByTransferId === null) {
        fail(path, "heard memory source fields cannot be null");
      }
      const validSourceActorId = string(sourceActorId, `${path}.sourceActorId`);
      const validSourceMemoryId = string(sourceMemoryId, `${path}.sourceMemoryId`);
      const validTransferId = string(createdByTransferId, `${path}.createdByTransferId`);
      requireReference(world.actors[validSourceActorId], `${path}.sourceActorId`, "missing source actor");
      requireReference(world.memories[validSourceMemoryId], `${path}.sourceMemoryId`, "missing source memory");
      requireReference(world.rumorTransfers[validTransferId], `${path}.createdByTransferId`, "missing transfer");
    }
    const trace = traceProvenance(world, memory.id);
    if (trace.truncated || trace.problems.length > 0) fail(path, `invalid provenance: ${trace.problems.map((problem) => problem.code).join(",") || "truncated"}`);
  }

  for (const transfer of Object.values(world.rumorTransfers)) {
    const path = `world.rumorTransfers.${transfer.id}`;
    const parent = world.memories[transfer.parentMemoryId];
    requireReference(parent, `${path}.parentMemoryId`, "missing parent memory");
    requireReference(world.actors[transfer.fromActorId], `${path}.fromActorId`, "missing sender");
    requireReference(world.actors[transfer.toActorId], `${path}.toActorId`, "missing recipient");
    requireReference(world.claims[transfer.claimId], `${path}.claimId`, "missing claim");
    if (parent.actorId !== transfer.fromActorId || parent.claimId !== transfer.claimId) fail(path, "parent sender/claim mismatch");
    if (parseIsoDate(transfer.transferredAt, `${path}.transferredAt`) < parseIsoDate(parent.acquiredAt, `world.memories.${parent.id}.acquiredAt`)) {
      fail(`${path}.transferredAt`, "cannot precede the parent memory");
    }
    if (canonicalJson(parent.surfaceText) !== canonicalJson(transfer.beforeText)) fail(`${path}.beforeText`, "must equal parent wording");
    const expectedBefore = roundCanonical(
      decayedConfidence(toScoringMemory(parent), transfer.supportAtTransfer, parseIsoDate(transfer.transferredAt, `${path}.transferredAt`)),
    );
    if (roundCanonical(transfer.beforeConfidence) !== expectedBefore) fail(`${path}.beforeConfidence`, `expected ${expectedBefore}`);
    const relationship = world.relationships[relationshipKey(transfer.toActorId, transfer.fromActorId)];
    requireReference(relationship, path, "missing recipient-to-sender relationship");
    if (roundCanonical(relationship.trust) !== roundCanonical(transfer.trustAtTransfer)) fail(`${path}.trustAtTransfer`, "must snapshot directed trust");
    const transferredAt = parseIsoDate(transfer.transferredAt, `${path}.transferredAt`);
    const senderRows = Object.values(world.memories)
      .filter(
        (memory) =>
          memory.actorId === transfer.fromActorId &&
          memory.claimId === transfer.claimId &&
          parseIsoDate(memory.acquiredAt, `world.memories.${memory.id}.acquiredAt`) <= transferredAt,
      )
      .map(toScoringMemory);
    const replayedSupport = supportByClaim(senderRows).support.get(transfer.claimId) ?? {
      corroborationCount: 0,
      repeatCount: 0,
    };
    if (canonicalJson(replayedSupport) !== canonicalJson(transfer.supportAtTransfer)) {
      fail(`${path}.supportAtTransfer`, `expected ${canonicalJson(replayedSupport)}`);
    }
    if (transfer.outcome === "accepted") {
      if (transfer.trustAtTransfer < transfer.acceptanceThreshold) fail(path, "trusted acceptance is below threshold");
      const child = world.memories[transfer.createdMemoryId];
      requireReference(child, `${path}.createdMemoryId`, "missing child memory");
      if (child.createdByTransferId !== transfer.id || child.sourceMemoryId !== parent.id || child.actorId !== transfer.toActorId || child.claimId !== transfer.claimId || child.sourceActorId !== transfer.fromActorId || child.hop !== parent.hop + 1 || child.provenanceRootMemoryId !== parent.provenanceRootMemoryId || child.acquiredAt !== transfer.transferredAt || canonicalJson(child.surfaceText) !== canonicalJson(transfer.afterText) || roundCanonical(child.confidenceAtAcq) !== roundCanonical(transfer.afterConfidence)) {
        fail(path, "accepted child fields do not match transfer");
      }
    } else {
      if (transfer.reasonCode === "low_trust" && transfer.trustAtTransfer >= transfer.acceptanceThreshold) fail(path, "low_trust rejection must be below threshold");
      if (Object.values(world.memories).some((memory) => memory.createdByTransferId === transfer.id)) fail(path, "rejected transfer created a memory");
    }
  }

  for (const [key, belief] of Object.entries(world.beliefs)) {
    const path = `world.beliefs.${key}`;
    requireReference(world.actors[belief.actorId], `${path}.actorId`, "missing actor");
    requireReference(world.claims[belief.claimId], `${path}.claimId`, "missing claim");
    const sorted = [...belief.evidenceMemoryIds].sort();
    if (new Set(sorted).size !== sorted.length || canonicalJson(sorted) !== canonicalJson(belief.evidenceMemoryIds)) fail(`${path}.evidenceMemoryIds`, "must be unique and sorted");
    for (const memoryId of belief.evidenceMemoryIds) {
      const memory = world.memories[memoryId];
      requireReference(memory, `${path}.evidenceMemoryIds`, `missing memory ${memoryId}`);
      if (memory.actorId !== belief.actorId || memory.claimId !== belief.claimId || memory.beliefEligibility !== "active") fail(`${path}.evidenceMemoryIds`, `ineligible evidence ${memoryId}`);
    }
  }

  const recomputed = evaluateBeliefs(world, {
    entityRevisionFor: (actorId, claimId) => world.beliefs[beliefKey(actorId, claimId)]?.entityRevision ?? 0,
  });
  if (canonicalJson(recomputed) !== canonicalJson(world.beliefs)) fail("world.beliefs", "persisted beliefs do not match deterministic recomputation");

  for (const constraint of Object.values(world.constraints)) {
    const path = `world.constraints.${constraint.id}`;
    requireReference(world.incidents[constraint.incidentId], `${path}.incidentId`, "missing incident");
    requireReference(world.claims[constraint.dependency.claimId], `${path}.dependency.claimId`, "missing claim");
    if (constraint.dependency.layer === "belief") {
      requireReference(world.actors[constraint.dependency.actorId], `${path}.dependency.actorId`, "missing actor");
      requireReference(world.beliefs[beliefKey(constraint.dependency.actorId, constraint.dependency.claimId)], `${path}.dependency`, "missing belief");
    } else {
      requireReference(world.canon[constraint.dependency.claimId], `${path}.dependency`, "missing canon");
    }
  }
}

export function validateWorldSnapshot(input: unknown): WorldSnapshot {
  const world = validateStructure(canonicalValue(input));
  validateReferencesAndInvariants(world);
  return world;
}

export function isCanonStatus(value: unknown): value is CanonStatus {
  return ["unresolved", "confirmed", "rejected"].includes(value as CanonStatus);
}

export function isBeliefStance(value: unknown): value is BeliefStance {
  return ["unknown", "doubted", "believed", "rejected"].includes(value as BeliefStance);
}

export function validateConstraint(value: unknown): GameConstraint {
  const candidate = record(value, "constraint");
  const id = string(candidate["id"], "constraint.id");
  const wrapper = {
    schemaVersion: 1,
    worldId: "validation",
    revision: 0,
    simulatedAt: "2026-01-01T00:00:00.000Z",
    incidents: {}, actors: {}, claims: {}, claimRelations: {}, canon: {}, relationships: {}, memories: {}, rumorTransfers: {}, beliefs: {},
    constraints: Object.fromEntries([[id, value]]),
  };
  try {
    validateStructure(wrapper);
  } catch (error) {
    throw error;
  }
  return validateStructure(wrapper).constraints[id]!;
}
