export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type CanonStatus = "unresolved" | "confirmed" | "rejected";
export type BeliefStance = "unknown" | "doubted" | "believed" | "rejected";

export interface LocalizedText {
  ja: string;
  en: string;
}

export interface Incident {
  id: string;
  label: string;
  actorIds: string[];
  claimIds: string[];
  defaultClaimId: string;
}

export interface Actor {
  id: string;
  name: LocalizedText;
}

export interface Claim {
  id: string;
  canonical: LocalizedText;
  subjectActorId: string | null;
  subjectValence: -1 | 0 | 1;
}

export interface ClaimRelation {
  id: string;
  entityRevision: number;
  kind: "mutually_exclusive";
  claimIds: [string, string];
}

export interface CanonEntry {
  claimId: string;
  entityRevision: number;
  status: CanonStatus;
}

export interface Relationship {
  fromActorId: string;
  toActorId: string;
  entityRevision: number;
  trust: number;
  affection: number;
  fear: number;
}

export type MemorySourceType = "witnessed" | "heard";

export interface Memory {
  id: string;
  entityRevision: number;
  actorId: string;
  claimId: string;
  sourceType: MemorySourceType;
  sourceActorId: string | null;
  sourceMemoryId: string | null;
  createdByTransferId: string | null;
  provenanceRootMemoryId: string;
  hop: number;
  surfaceText: LocalizedText;
  sourceForgottenAt: string | null;
  witnessedDirectly: boolean;
  confidenceAtAcq: number;
  importance: number;
  emotionalWeight: number;
  emotionType: string;
  acquiredAt: string;
  lastRecalledAt: string | null;
  beliefEligibility: "active" | "archived";
}

export interface RumorTransferBase {
  id: string;
  fromActorId: string;
  toActorId: string;
  claimId: string;
  parentMemoryId: string;
  trustAtTransfer: number;
  acceptanceThreshold: number;
  supportAtTransfer: {
    corroborationCount: number;
    repeatCount: number;
  };
  beforeText: LocalizedText;
  beforeConfidence: number;
  transferredAt: string;
}

export interface AcceptedRumorTransfer extends RumorTransferBase {
  outcome: "accepted";
  reasonCode: "trusted";
  afterText: LocalizedText;
  afterConfidence: number;
  createdMemoryId: string;
}

export interface RejectedRumorTransfer extends RumorTransferBase {
  outcome: "rejected";
  reasonCode: "low_trust" | "conflict";
  afterText: null;
  afterConfidence: null;
  createdMemoryId: null;
}

export type RumorTransfer = AcceptedRumorTransfer | RejectedRumorTransfer;

export interface Belief {
  actorId: string;
  claimId: string;
  entityRevision: number;
  stance: BeliefStance;
  supportScore: number;
  opposingScore: number;
  evidenceMemoryIds: string[];
  rationaleCode: string;
}

export type ConstraintDependency =
  | { layer: "canon"; claimId: string; equals: CanonStatus }
  | { layer: "belief"; actorId: string; claimId: string; equals: BeliefStance };

export interface GameConstraint {
  id: string;
  entityRevision: number;
  incidentId: string;
  kind: "quest_gate" | "dialogue_condition";
  label: string;
  dependency: ConstraintDependency;
  expectedActive: boolean;
}

export interface WorldSnapshot {
  schemaVersion: 1;
  worldId: string;
  revision: number;
  simulatedAt: string;
  incidents: Record<string, Incident>;
  actors: Record<string, Actor>;
  claims: Record<string, Claim>;
  claimRelations: Record<string, ClaimRelation>;
  canon: Record<string, CanonEntry>;
  relationships: Record<string, Relationship>;
  memories: Record<string, Memory>;
  rumorTransfers: Record<string, RumorTransfer>;
  beliefs: Record<string, Belief>;
  constraints: Record<string, GameConstraint>;
}

export interface SearchFilters {
  query: string;
  actorId: string | null;
  claimId: string | null;
  stance: BeliefStance | null;
  sourceType: MemorySourceType | null;
  conditionKind: GameConstraint["kind"] | null;
}

export interface EntityPrecondition {
  stateKey: string;
  entityRevision: number;
  before: JsonValue;
}

export interface EntityWrite {
  stateKey: string;
  after: JsonValue;
}

export interface OperationBase {
  id: string;
  reasonCode: string;
  evidenceRefs: string[];
  preconditions: EntityPrecondition[];
  writes: EntityWrite[];
}

export interface ResolveCanonRelationOperation extends OperationBase {
  kind: "resolve_canon_relation";
  relationId: string;
  confirmClaimId: string;
  rejectClaimId: string;
}

export interface ReplaceConstraintDependencyOperation extends OperationBase {
  kind: "replace_constraint_dependency";
  constraintId: string;
  beforeDependency: ConstraintDependency;
  afterDependency: ConstraintDependency;
}

export interface ArchiveMemoryOperation extends OperationBase {
  kind: "archive_memory";
  memoryId: string;
  beforeEligibility: "active";
  afterEligibility: "archived";
}

export type PatchOperation =
  | ResolveCanonRelationOperation
  | ReplaceConstraintDependencyOperation
  | ArchiveMemoryOperation;

export interface Patch {
  id: string;
  patchRevision: number;
  worldId: string;
  baseWorldRevision: number;
  createdAt: string;
  createdVia: "page-ui" | "site-tool";
  summary: string;
  operations: PatchOperation[];
}

export interface ReviewDecision {
  patchId: string;
  patchRevision: number;
  operationId: string;
  operationFingerprint: string;
  decision: "approved" | "rejected";
  decidedVia: "page-ui";
  decidedAt: string;
}

export interface ApplyReceipt {
  status: "applied" | "closed_noop";
  worldId: string;
  patchId: string;
  patchRevision: number;
  patchFingerprint: string;
  baseWorldRevision: number;
  committedWorldRevision: number;
  planDigest: string;
  appliedOperationIds: string[];
  rejectedOperationIds: string[];
  committedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  source: "page-ui" | "site-tool" | "system";
  action: string;
  effect: "none" | "view" | "workflow" | "world";
  code: string;
  worldRevisionBefore: number;
  worldRevisionAfter: number;
  patchId?: string;
  patchRevision?: number;
  summary: string;
}

export interface AppState {
  appSchemaVersion: 1;
  writeState: "enabled" | "writes_disabled";
  world: WorldSnapshot;
  stagedPatch: Patch | null;
  reviewDecisions: ReviewDecision[];
  reviewedPreviewDigest: string | null;
  receipts: Record<string, ApplyReceipt>;
  audit: AuditEntry[];
  viewState: {
    selectedIncidentId: string;
    selectedActorId: string | null;
    selectedClaimId: string | null;
    focusedPanel: string;
    filters: SearchFilters;
    cursor: string | null;
    previewMode: "current" | "proposal" | "selected_operation" | "reviewed";
    selectedOperationId: string | null;
  };
}

export interface ValidConstraintEvaluation {
  valid: true;
  constraintId: string;
  active: boolean;
  expectedActive: boolean;
  verdict: "satisfied" | "violated";
}

export interface InvalidConstraintEvaluation {
  valid: false;
  constraintId: string;
  code:
    | "missing_actor"
    | "missing_claim"
    | "missing_belief"
    | "missing_canon"
    | "missing_expectation"
    | "invalid_dependency";
  active: null;
  expectedActive: boolean | null;
  verdict: "unresolved";
}

export type ConstraintEvaluation =
  | ValidConstraintEvaluation
  | InvalidConstraintEvaluation;

export interface ValidConstraintProjection {
  valid: true;
  before: ValidConstraintEvaluation;
  after: ValidConstraintEvaluation;
  transition: "changed" | "preserved";
  beforeVerdict: "satisfied" | "violated";
  afterVerdict: "satisfied" | "violated";
  definitionChanged: boolean;
  causallyAffected: boolean;
}

export interface InvalidConstraintProjection {
  valid: false;
  constraintId: string;
  before: ConstraintEvaluation;
  after: ConstraintEvaluation;
  transition: "unresolved";
  verdict: "unresolved";
  definitionChanged: boolean;
  causallyAffected: boolean;
}

export type ConstraintProjection =
  | ValidConstraintProjection
  | InvalidConstraintProjection;

export interface ConstraintSummary {
  evaluated: number;
  unresolved: number;
  causallyAffected: number;
  changed: number;
  preserved: number;
  violatedBefore: number;
  violatedAfter: number;
}

export const relationshipKey = (fromActorId: string, toActorId: string): string =>
  `${fromActorId}::${toActorId}`;

export const beliefKey = (actorId: string, claimId: string): string =>
  `${actorId}::${claimId}`;
