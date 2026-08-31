import { canonicalJson } from "./canonical.ts";
import {
  beliefKey,
  type BeliefStance,
  type CanonStatus,
  type ConstraintDependency,
  type ConstraintEvaluation,
  type ConstraintProjection,
  type ConstraintSummary,
  type GameConstraint,
  type InvalidConstraintEvaluation,
  type ValidConstraintEvaluation,
  type WorldSnapshot,
} from "./types.ts";

const invalid = (
  constraintId: string,
  code: InvalidConstraintEvaluation["code"],
  expectedActive: boolean | null,
): InvalidConstraintEvaluation => ({
  valid: false,
  constraintId,
  code,
  active: null,
  expectedActive,
  verdict: "unresolved",
});

const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

export function dependencyReadKey(dependency: ConstraintDependency): string {
  return dependency.layer === "canon"
    ? `canon:${dependency.claimId}`
    : `belief:${dependency.actorId}:${dependency.claimId}`;
}

export function evaluateConstraint(
  world: WorldSnapshot,
  constraint: GameConstraint,
): ConstraintEvaluation {
  const expectedActive =
    typeof (constraint as { expectedActive?: unknown }).expectedActive === "boolean"
      ? constraint.expectedActive
      : null;
  if (expectedActive === null) return invalid(constraint.id, "missing_expectation", null);

  const dependency = (constraint as { dependency?: unknown }).dependency;
  if (!dependency || typeof dependency !== "object") {
    return invalid(constraint.id, "invalid_dependency", expectedActive);
  }
  const raw = dependency as Record<string, unknown>;
  if (raw["layer"] !== "canon" && raw["layer"] !== "belief") {
    return invalid(constraint.id, "invalid_dependency", expectedActive);
  }
  if (typeof raw["claimId"] !== "string" || !own(world.claims, raw["claimId"])) {
    return invalid(constraint.id, "missing_claim", expectedActive);
  }

  let active: boolean;
  if (raw["layer"] === "canon") {
    const fields = Object.keys(raw).sort();
    if (
      canonicalJson(fields) !== canonicalJson(["claimId", "equals", "layer"].sort()) ||
      !["unresolved", "confirmed", "rejected"].includes(String(raw["equals"]))
    ) {
      return invalid(constraint.id, "invalid_dependency", expectedActive);
    }
    const canon = own(world.canon, raw["claimId"]);
    if (!canon) return invalid(constraint.id, "missing_canon", expectedActive);
    active = canon.status === raw["equals"];
  } else {
    const fields = Object.keys(raw).sort();
    if (
      canonicalJson(fields) !== canonicalJson(["actorId", "claimId", "equals", "layer"].sort())
    ) {
      return invalid(constraint.id, "invalid_dependency", expectedActive);
    }
    if (typeof raw["actorId"] !== "string" || !own(world.actors, raw["actorId"])) {
      return invalid(constraint.id, "missing_actor", expectedActive);
    }
    if (!["unknown", "doubted", "believed", "rejected"].includes(String(raw["equals"]))) {
      return invalid(constraint.id, "invalid_dependency", expectedActive);
    }
    const belief = own(world.beliefs, beliefKey(raw["actorId"], raw["claimId"] as string));
    if (!belief) return invalid(constraint.id, "missing_belief", expectedActive);
    active = belief.stance === raw["equals"];
  }

  return {
    valid: true,
    constraintId: constraint.id,
    active,
    expectedActive,
    verdict: active === expectedActive ? "satisfied" : "violated",
  };
}

function definitionValue(constraint: GameConstraint): object {
  return {
    incidentId: constraint.incidentId,
    kind: constraint.kind,
    label: constraint.label,
    dependency: constraint.dependency,
    expectedActive: constraint.expectedActive,
  };
}

function definitionChangedSafely(
  before: GameConstraint | undefined,
  after: GameConstraint | undefined,
): boolean {
  if (!before || !after) return true;
  try {
    return canonicalJson(definitionValue(before)) !== canonicalJson(definitionValue(after));
  } catch {
    // Malformed persisted data must become an unresolved row, never abort the
    // entire projection. A malformed side is conservatively treated as edited.
    return true;
  }
}

function safeDependencyReadKey(constraint: GameConstraint | undefined): string | null {
  const dependency = (constraint as unknown as { dependency?: unknown } | undefined)?.dependency;
  if (!dependency || typeof dependency !== "object") return null;
  const raw = dependency as Record<string, unknown>;
  if (raw["layer"] === "canon" && typeof raw["claimId"] === "string") {
    return `canon:${raw["claimId"]}`;
  }
  if (
    raw["layer"] === "belief" &&
    typeof raw["actorId"] === "string" &&
    typeof raw["claimId"] === "string"
  ) {
    return `belief:${raw["actorId"]}:${raw["claimId"]}`;
  }
  return null;
}

export interface ProjectConstraintOptions {
  beforeConstraints?: Record<string, GameConstraint>;
  afterConstraints?: Record<string, GameConstraint>;
  writeKeys?: ReadonlySet<string>;
}

export function projectConstraints(
  beforeWorld: WorldSnapshot,
  afterWorld: WorldSnapshot,
  options: ProjectConstraintOptions = {},
): ConstraintProjection[] {
  const beforeConstraints = options.beforeConstraints ?? beforeWorld.constraints;
  const afterConstraints = options.afterConstraints ?? afterWorld.constraints;
  const ids = [...new Set([...Object.keys(beforeConstraints), ...Object.keys(afterConstraints)])].sort();

  return ids.flatMap((constraintId): ConstraintProjection[] => {
    const beforeConstraint = beforeConstraints[constraintId];
    const afterConstraint = afterConstraints[constraintId];
    const before = beforeConstraint
      ? evaluateConstraint(beforeWorld, beforeConstraint)
      : invalid(constraintId, "invalid_dependency", null);
    const after = afterConstraint
      ? evaluateConstraint(afterWorld, afterConstraint)
      : invalid(constraintId, "invalid_dependency", null);
    const definitionChanged = definitionChangedSafely(beforeConstraint, afterConstraint);
    const readKeys = new Set(
      [safeDependencyReadKey(beforeConstraint), safeDependencyReadKey(afterConstraint)].filter(
        (key): key is string => key !== null,
      ),
    );
    const causallyAffected =
      definitionChanged ||
      [...(options.writeKeys ?? [])].some((writeKey) => readKeys.has(writeKey));

    if (!before.valid || !after.valid) {
      return [{
        valid: false as const,
        constraintId,
        before,
        after,
        transition: "unresolved" as const,
        verdict: "unresolved" as const,
        definitionChanged,
        causallyAffected,
      }];
    }
    return [{
      valid: true as const,
      before,
      after,
      transition: before.active === after.active ? "preserved" as const : "changed" as const,
      beforeVerdict: before.verdict,
      afterVerdict: after.verdict,
      definitionChanged,
      causallyAffected,
    }];
  });
}

export function summarizeConstraintProjection(rows: readonly ConstraintProjection[]): ConstraintSummary {
  const valid = rows.filter(
    (row): row is Extract<ConstraintProjection, { valid: true }> => row.valid,
  );
  return {
    evaluated: valid.length,
    unresolved: rows.length - valid.length,
    causallyAffected: rows.filter((row) => row.causallyAffected).length,
    changed: valid.filter((row) => row.transition === "changed").length,
    preserved: valid.filter((row) => row.transition === "preserved").length,
    violatedBefore: valid.filter((row) => row.beforeVerdict === "violated").length,
    violatedAfter: valid.filter((row) => row.afterVerdict === "violated").length,
  };
}

export type ConstraintProjectionChange =
  | { kind: "set_canon"; claimId: string; status: CanonStatus }
  | { kind: "set_belief"; actorId: string; claimId: string; stance: BeliefStance }
  | { kind: "replace_constraint_dependency"; constraintId: string; dependency: ConstraintDependency };

export interface AppliedConstraintProjection {
  world: WorldSnapshot;
  writeKeys: Set<string>;
}

export function applyConstraintProjection(
  source: WorldSnapshot,
  changes: readonly ConstraintProjectionChange[],
): AppliedConstraintProjection {
  let canon = source.canon;
  let beliefs = source.beliefs;
  let constraints = source.constraints;
  const writeKeys = new Set<string>();

  for (const change of changes) {
    if (change.kind === "set_canon") {
      const current = canon[change.claimId];
      if (!current) throw new Error(`Missing canon ${change.claimId}`);
      if (canon === source.canon) canon = { ...source.canon };
      canon[change.claimId] = {
        ...current,
        entityRevision: current.entityRevision + 1,
        status: change.status,
      };
      writeKeys.add(`canon:${change.claimId}`);
    } else if (change.kind === "set_belief") {
      const key = beliefKey(change.actorId, change.claimId);
      const current = beliefs[key];
      if (!current) throw new Error(`Missing belief ${key}`);
      if (beliefs === source.beliefs) beliefs = { ...source.beliefs };
      beliefs[key] = {
        ...current,
        entityRevision: current.entityRevision + 1,
        stance: change.stance,
      };
      writeKeys.add(`belief:${change.actorId}:${change.claimId}`);
    } else {
      const current = constraints[change.constraintId];
      if (!current) throw new Error(`Missing constraint ${change.constraintId}`);
      if (constraints === source.constraints) constraints = { ...source.constraints };
      constraints[change.constraintId] = {
        ...current,
        entityRevision: current.entityRevision + 1,
        dependency: change.dependency,
      };
      writeKeys.add(`constraint:${change.constraintId}`);
    }
  }

  return {
    world: {
      ...source,
      canon,
      beliefs,
      constraints,
    },
    writeKeys,
  };
}

export function evaluateAllConstraints(world: WorldSnapshot): ConstraintEvaluation[] {
  return Object.values(world.constraints)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((constraint) => evaluateConstraint(world, constraint));
}

export function countViolations(evaluations: readonly ConstraintEvaluation[]): number {
  return evaluations.filter((evaluation) => evaluation.valid && evaluation.verdict === "violated").length;
}
