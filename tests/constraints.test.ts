import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/domain/canonical.ts";
import {
  applyConstraintProjection,
  countViolations,
  evaluateAllConstraints,
  evaluateConstraint,
  projectConstraints,
  summarizeConstraintProjection,
  type ConstraintProjectionChange,
} from "../src/domain/constraints.ts";
import { traceProvenance } from "../src/domain/provenance.ts";
import {
  DomainValidationError,
  validateConstraintDependency,
  validateWorldSnapshot,
} from "../src/domain/validate.ts";
import type {
  ConstraintProjection,
  GameConstraint,
  WorldSnapshot,
} from "../src/domain/types.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";

const fixture = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));

function rowTable(rows: readonly ConstraintProjection[]): Record<string, object> {
  return Object.fromEntries(
    rows.map((row) => {
      const id = row.valid ? row.before.constraintId : row.constraintId;
      return [id, row.valid
        ? {
            transition: row.transition,
            verdict: row.afterVerdict,
            beforeVerdict: row.beforeVerdict,
            definitionChanged: row.definitionChanged,
            causallyAffected: row.causallyAffected,
          }
        : {
            transition: row.transition,
            verdict: row.verdict,
            definitionChanged: row.definitionChanged,
            causallyAffected: row.causallyAffected,
          }];
    }),
  );
}

const CANON_ONLY: readonly ConstraintProjectionChange[] = [
  { kind: "set_canon", claimId: "sc-repaired", status: "confirmed" },
  { kind: "set_canon", claimId: "sc-stole", status: "rejected" },
];

describe("registered-condition causality", () => {
  it("locks the initial and canon-only warehouse table without changing beliefs", () => {
    const before = fixture();
    expect(countViolations(evaluateAllConstraints(before))).toBe(1);
    const projected = applyConstraintProjection(before, CANON_ONLY);
    const rows = projectConstraints(before, projected.world, { writeKeys: projected.writeKeys });

    expect(summarizeConstraintProjection(rows)).toEqual({
      evaluated: 4,
      unresolved: 0,
      causallyAffected: 2,
      changed: 2,
      preserved: 2,
      violatedBefore: 1,
      violatedAfter: 1,
    });
    expect(rowTable(rows)).toEqual({
      traveller_can_stay: {
        transition: "changed",
        verdict: "satisfied",
        beforeVerdict: "violated",
        definitionChanged: false,
        causallyAffected: true,
      },
      gen_warns_about_theft: {
        transition: "preserved",
        verdict: "satisfied",
        beforeVerdict: "satisfied",
        definitionChanged: false,
        causallyAffected: false,
      },
      tatsu_explains_repair: {
        transition: "preserved",
        verdict: "satisfied",
        beforeVerdict: "satisfied",
        definitionChanged: false,
        causallyAffected: false,
      },
      warehouse_dispute: {
        transition: "changed",
        verdict: "violated",
        beforeVerdict: "satisfied",
        definitionChanged: false,
        causallyAffected: true,
      },
    });

    expect(projected.world.beliefs).toEqual(before.beliefs);
    expect(projected.world.memories).toEqual(before.memories);
    expect(projected.world.rumorTransfers).toEqual(before.rumorTransfers);
    expect(projected.world.relationships).toEqual(before.relationships);
    expect(projected.world.constraints).toEqual(before.constraints);
    expect(
      Object.keys(before.memories).map((id) => traceProvenance(before, id)),
    ).toEqual(Object.keys(before.memories).map((id) => traceProvenance(projected.world, id)));

    const beliefIds = ["gen_warns_about_theft", "tatsu_explains_repair"];
    expect(
      beliefIds.map((id) => evaluateConstraint(before, before.constraints[id]!)),
    ).toEqual(beliefIds.map((id) => evaluateConstraint(projected.world, projected.world.constraints[id]!)));
  });

  it("corrects the wrong-layer condition and reduces violations from one to zero", () => {
    const before = fixture();
    const final = applyConstraintProjection(before, [
      ...CANON_ONLY,
      {
        kind: "replace_constraint_dependency",
        constraintId: "warehouse_dispute",
        dependency: {
          layer: "belief",
          actorId: "gen",
          claimId: "sc-stole",
          equals: "believed",
        },
      },
    ]);
    const rows = projectConstraints(before, final.world, { writeKeys: final.writeKeys });
    const warehouse = rows.find(
      (row) => (row.valid ? row.before.constraintId : row.constraintId) === "warehouse_dispute",
    );
    expect(warehouse).toMatchObject({
      valid: true,
      transition: "preserved",
      afterVerdict: "satisfied",
      definitionChanged: true,
      causallyAffected: true,
    });
    expect(summarizeConstraintProjection(rows)).toMatchObject({
      violatedBefore: 1,
      violatedAfter: 0,
    });
    expect(rowTable(rows)).toEqual({
      traveller_can_stay: {
        transition: "changed",
        verdict: "satisfied",
        beforeVerdict: "violated",
        definitionChanged: false,
        causallyAffected: true,
      },
      gen_warns_about_theft: {
        transition: "preserved",
        verdict: "satisfied",
        beforeVerdict: "satisfied",
        definitionChanged: false,
        causallyAffected: false,
      },
      tatsu_explains_repair: {
        transition: "preserved",
        verdict: "satisfied",
        beforeVerdict: "satisfied",
        definitionChanged: false,
        causallyAffected: false,
      },
      warehouse_dispute: {
        transition: "preserved",
        verdict: "satisfied",
        beforeVerdict: "satisfied",
        definitionChanged: true,
        causallyAffected: true,
      },
    });
    expect(countViolations(evaluateAllConstraints(final.world))).toBe(0);
    expect(final.world.beliefs["gen::sc-stole"]).toEqual(before.beliefs["gen::sc-stole"]);
  });

  it("covers changed/preserved × satisfied/violated as independent axes", () => {
    const before = fixture();
    const after = applyConstraintProjection(before, [
      { kind: "set_canon", claimId: "sc-repaired", status: "confirmed" },
    ]);
    const make = (
      id: string,
      equals: "unresolved" | "confirmed" | "rejected",
      expectedActive: boolean,
    ): GameConstraint => ({
      id,
      entityRevision: 0,
      incidentId: "warehouse",
      kind: "quest_gate",
      label: id,
      dependency: { layer: "canon", claimId: "sc-repaired", equals },
      expectedActive,
    });
    const constraints = {
      changed_satisfied: make("changed_satisfied", "confirmed", true),
      changed_violated: make("changed_violated", "unresolved", true),
      preserved_satisfied: make("preserved_satisfied", "rejected", false),
      preserved_violated: make("preserved_violated", "rejected", true),
    };
    const rows = projectConstraints(before, after.world, {
      beforeConstraints: constraints,
      afterConstraints: constraints,
      writeKeys: after.writeKeys,
    });
    expect(
      Object.fromEntries(rows.map((row) => [
        row.valid ? row.before.constraintId : row.constraintId,
        row.valid ? `${row.transition}+${row.afterVerdict}` : "unresolved",
      ])),
    ).toEqual({
      changed_satisfied: "changed+satisfied",
      changed_violated: "changed+violated",
      preserved_satisfied: "preserved+satisfied",
      preserved_violated: "preserved+violated",
    });
  });

  it("marks missing references and malformed dependencies unresolved", () => {
    const base = fixture();
    const source = base.constraints["gen_warns_about_theft"]!;
    const evaluate = (world: WorldSnapshot, constraint: GameConstraint) =>
      evaluateConstraint(world, constraint);

    expect(evaluate(base, { ...source, dependency: { ...source.dependency, actorId: "ghost" } } as GameConstraint)).toMatchObject({ valid: false, code: "missing_actor" });
    expect(evaluate(base, { ...source, dependency: { ...source.dependency, claimId: "ghost" } } as GameConstraint)).toMatchObject({ valid: false, code: "missing_claim" });

    const noBelief = structuredClone(base);
    delete noBelief.beliefs["gen::sc-stole"];
    expect(evaluate(noBelief, source)).toMatchObject({ valid: false, code: "missing_belief" });

    const canonConstraint = base.constraints["traveller_can_stay"]!;
    const noCanon = structuredClone(base);
    delete noCanon.canon["sc-repaired"];
    expect(evaluate(noCanon, canonConstraint)).toMatchObject({ valid: false, code: "missing_canon" });

    expect(evaluate(base, { ...source, expectedActive: undefined } as unknown as GameConstraint)).toMatchObject({ valid: false, code: "missing_expectation" });
    expect(evaluate(base, { ...canonConstraint, dependency: { layer: "canon", actorId: "gen", claimId: "sc-repaired", equals: "confirmed" } } as unknown as GameConstraint)).toMatchObject({ valid: false, code: "invalid_dependency" });
    expect(evaluate(base, { ...source, dependency: { ...source.dependency, injected: true } } as unknown as GameConstraint)).toMatchObject({ valid: false, code: "invalid_dependency" });
    expect(() => validateConstraintDependency({ layer: "canon", actorId: "gen", claimId: "sc-repaired", equals: "confirmed" })).toThrow(DomainValidationError);
  });

  it("keeps malformed or missing projection rows visible as unresolved", () => {
    const before = fixture();
    const malformed = structuredClone(before);
    malformed.constraints["traveller_can_stay"] = {
      ...malformed.constraints["traveller_can_stay"]!,
      dependency: undefined,
    } as unknown as GameConstraint;
    const malformedRows = projectConstraints(before, malformed);
    expect(malformedRows).toHaveLength(4);
    expect(
      malformedRows.find(
        (row) => (row.valid ? row.before.constraintId : row.constraintId) === "traveller_can_stay",
      ),
    ).toMatchObject({
      valid: false,
      transition: "unresolved",
      verdict: "unresolved",
      definitionChanged: true,
    });

    const missing = structuredClone(before);
    delete missing.constraints["traveller_can_stay"];
    const missingRows = projectConstraints(before, missing);
    expect(missingRows).toHaveLength(4);
    expect(summarizeConstraintProjection(missingRows)).toMatchObject({
      evaluated: 3,
      unresolved: 1,
    });
  });

  it("kills same-claim canon fallback and supports isolated versus full projection", () => {
    const before = fixture();
    const canonOnly = applyConstraintProjection(before, [
      { kind: "set_canon", claimId: "sc-stole", status: "confirmed" },
    ]);
    const canonRows = rowTable(projectConstraints(before, canonOnly.world, { writeKeys: canonOnly.writeKeys }));
    expect(canonRows["gen_warns_about_theft"]).toMatchObject({
      transition: "preserved",
      verdict: "satisfied",
      causallyAffected: false,
    });

    const beliefOnly = applyConstraintProjection(before, [
      { kind: "set_belief", actorId: "gen", claimId: "sc-stole", stance: "rejected" },
    ]);
    const beliefRows = rowTable(projectConstraints(before, beliefOnly.world, { writeKeys: beliefOnly.writeKeys }));
    expect(beliefRows["gen_warns_about_theft"]).toMatchObject({
      transition: "changed",
      verdict: "violated",
      causallyAffected: true,
    });

    const full = applyConstraintProjection(before, CANON_ONLY);
    expect([...canonOnly.writeKeys]).toEqual(["canon:sc-stole"]);
    expect([...full.writeKeys].sort()).toEqual(["canon:sc-repaired", "canon:sc-stole"]);
    expect(canonicalJson(canonOnly.world.memories)).toBe(canonicalJson(full.world.memories));
  });
});
