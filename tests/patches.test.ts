import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalValue } from "../src/domain/canonical.ts";
import { traceProvenance } from "../src/domain/provenance.ts";
import {
  createReviewDecision,
  createWarehousePatch,
  planReviewedPatch,
  preflightReviewedApply,
} from "../src/domain/patches.ts";
import type { ApplyReceipt, Patch, ReviewDecision, WorldSnapshot } from "../src/domain/types.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";

const world = (): WorldSnapshot => validateWorldSnapshot(structuredClone(fixtureJson));
const patch = (source = world(), patchRevision = 1): Patch => createWarehousePatch(source, {
  id: "patch-warehouse-001",
  patchRevision,
  createdAt: "2026-08-31T00:00:00.000Z",
  createdVia: "page-ui",
  memoryPolicy: "review_archive",
});

async function decisionsFor(
  candidate: Patch,
  values: readonly ReviewDecision["decision"][],
  at = "2026-08-31T00:01:00.000Z",
): Promise<ReviewDecision[]> {
  return Promise.all(candidate.operations.map((operation, index) =>
    createReviewDecision(candidate, operation.id, values[index]!, at),
  ));
}

describe("pure fail-closed patch planning", () => {
  it.each([
    {
      name: "canon only",
      choices: ["approved", "rejected", "rejected"] as const,
      inspect: (source: WorldSnapshot, next: WorldSnapshot) => {
        expect(next.canon["sc-repaired"]).toMatchObject({ status: "confirmed", entityRevision: 1 });
        expect(next.canon["sc-stole"]).toMatchObject({ status: "rejected", entityRevision: 1 });
        expect(next.constraints).toEqual(source.constraints);
        expect(next.memories).toEqual(source.memories);
        expect(next.beliefs).toEqual(source.beliefs);
        expect(next.claimRelations).toEqual(source.claimRelations);
      },
    },
    {
      name: "constraint only",
      choices: ["rejected", "approved", "rejected"] as const,
      inspect: (source: WorldSnapshot, next: WorldSnapshot) => {
        expect(next.constraints["warehouse_dispute"]).toMatchObject({ entityRevision: 1 });
        expect(next.canon).toEqual(source.canon);
        expect(next.memories).toEqual(source.memories);
        expect(next.beliefs).toEqual(source.beliefs);
        for (const [id, constraint] of Object.entries(next.constraints)) {
          if (id !== "warehouse_dispute") expect(constraint).toEqual(source.constraints[id]);
        }
      },
    },
  ])("applies $name as an independent exact-revision plan", async ({ choices, inspect }) => {
    const source = world();
    const candidate = patch(source);
    const plan = await planReviewedPatch(source, candidate, await decisionsFor(candidate, choices));
    expect(plan).toMatchObject({ code: "ok", state: "ready" });
    expect(plan.reviewed!.world.revision).toBe(source.revision + 1);
    inspect(source, plan.reviewed!.world);
  });

  it("keeps stage/review immutable and exposes the 1→1→0 causal sequence", async () => {
    const source = world();
    const candidate = patch(source);
    const before = canonicalJson(source);
    const staged = await planReviewedPatch(source, candidate, []);

    expect(staged).toMatchObject({ code: "ok", state: "staged", pendingCount: 3 });
    expect(staged.selected["resolve-warehouse-canon"]!.summary).toMatchObject({
      violatedBefore: 1,
      violatedAfter: 1,
    });
    const isolatedRows = staged.selected["resolve-warehouse-canon"]!.constraints;
    expect(isolatedRows.find((row) => row.valid && row.before.constraintId === "traveller_can_stay")).toMatchObject({
      valid: true,
      transition: "changed",
      afterVerdict: "satisfied",
    });
    expect(isolatedRows.find((row) => row.valid && row.before.constraintId === "warehouse_dispute")).toMatchObject({
      valid: true,
      transition: "changed",
      afterVerdict: "violated",
    });
    expect(staged.selected["resolve-warehouse-canon"]!.world.beliefs).toEqual(source.beliefs);

    const reviewed = await planReviewedPatch(
      source,
      candidate,
      await decisionsFor(candidate, ["approved", "approved", "rejected"]),
    );
    expect(reviewed).toMatchObject({ code: "ok", state: "ready", pendingCount: 0 });
    expect(reviewed.reviewed!.summary).toMatchObject({ violatedBefore: 1, violatedAfter: 0 });
    expect(reviewed.reviewed!.world.revision).toBe(source.revision + 1);
    expect(reviewed.reviewed!.world.canon["sc-repaired"]).toMatchObject({ status: "confirmed", entityRevision: 1 });
    expect(reviewed.reviewed!.world.canon["sc-stole"]).toMatchObject({ status: "rejected", entityRevision: 1 });
    expect(reviewed.reviewed!.world.constraints["warehouse_dispute"]).toMatchObject({ entityRevision: 1 });
    expect(reviewed.reviewed!.world.memories["mem-stole-gen-root"]).toEqual(source.memories["mem-stole-gen-root"]);
    expect(reviewed.reviewed!.world.beliefs["gen::sc-stole"]).toEqual(source.beliefs["gen::sc-stole"]);
    expect(canonicalJson(source)).toBe(before);
  });

  it("can approve the archive independently without deleting provenance", async () => {
    const source = world();
    const candidate = patch(source);
    const plan = await planReviewedPatch(
      source,
      candidate,
      await decisionsFor(candidate, ["rejected", "rejected", "approved"]),
    );
    const archived = plan.reviewed!.world;
    expect(plan).toMatchObject({ code: "ok", state: "ready" });
    expect(archived.revision).toBe(1);
    expect(archived.memories["mem-stole-gen-root"]).toMatchObject({
      beliefEligibility: "archived",
      entityRevision: 1,
    });
    expect(archived.beliefs["gen::sc-stole"]).toMatchObject({
      stance: "unknown",
      entityRevision: 1,
      evidenceMemoryIds: [],
    });
    expect(archived.beliefs["hana::sc-stole"]).toEqual(source.beliefs["hana::sc-stole"]);
    expect(traceProvenance(archived, "mem-stole-gen-root")).toEqual(
      traceProvenance(source, "mem-stole-gen-root"),
    );
    expect(() => validateWorldSnapshot(archived)).not.toThrow();
  });

  it("invalidates old approvals when patch revision changes", async () => {
    const source = world();
    const first = patch(source, 1);
    const oldDecisions = await decisionsFor(first, ["approved", "approved", "rejected"]);
    const revised = patch(source, 2);
    revised.summary += " Revised.";
    const plan = await planReviewedPatch(source, revised, oldDecisions);
    expect(plan).toMatchObject({ state: "staged", pendingCount: 3 });
    expect(plan.operations.every((operation) => operation.decision === "pending")).toBe(true);
    expect(plan.reviewed).toBeNull();
  });

  it("does not treat forged non-page decisions as review authority", async () => {
    const source = world();
    const candidate = patch(source);
    const forged = await decisionsFor(candidate, ["approved", "approved", "rejected"]);
    (forged[0] as unknown as { decidedVia: string }).decidedVia = "site-tool";
    (forged[1] as unknown as { decision: string }).decision = "accept";
    (forged[2] as unknown as Record<string, unknown>)["injected"] = true;
    forged[0]!.decidedAt = "not-a-date";
    const plan = await planReviewedPatch(source, candidate, forged);
    expect(plan).toMatchObject({ state: "staged", pendingCount: 3 });
    expect(plan.reviewed).toBeNull();
  });

  it("rejects malformed operations and duplicate layer-qualified writes", async () => {
    const source = world();
    const malformed = patch(source);
    malformed.operations[0]!.writes[0]!.after = {
      ...(malformed.operations[0]!.writes[0]!.after as Record<string, string | number>),
      status: "unresolved",
    };
    const malformedPlan = await planReviewedPatch(source, malformed, []);
    expect(malformedPlan).toMatchObject({ code: "invalid_patch" });
    expect(malformedPlan.operations[0]).toMatchObject({
      validity: "stale_operation",
      code: "write_mismatch",
    });

    const conflicting = patch(source);
    conflicting.operations.push({
      ...structuredClone(conflicting.operations[0]!),
      id: "duplicate-canon-write",
    });
    const conflictPlan = await planReviewedPatch(source, conflicting, []);
    expect(conflictPlan).toMatchObject({ code: "invalid_patch" });
    expect(conflictPlan.operations.filter((operation) => operation.code === "duplicate_write_key")).toHaveLength(2);

    const ghost = patch(source);
    const condition = ghost.operations[1];
    if (condition?.kind !== "replace_constraint_dependency") throw new Error("fixture operation order changed");
    condition.afterDependency = {
      layer: "belief",
      actorId: "ghost",
      claimId: "sc-stole",
      equals: "believed",
    };
    const ghostPlan = await planReviewedPatch(source, ghost, []);
    expect(ghostPlan.operations[1]).toMatchObject({
      validity: "stale_operation",
      code: "invalid_after_dependency",
    });

    const sparse = patch(source);
    const sparsePreconditions = new Array(3) as typeof sparse.operations[0]["preconditions"];
    sparse.operations[0]!.preconditions = sparsePreconditions;
    await expect(planReviewedPatch(source, sparse, [])).resolves.toMatchObject({
      code: "invalid_patch",
      patchFingerprint: "invalid:invalid_patch_fields",
    });
  });

  it("allows a rejected stale operation beside an independent valid approval", async () => {
    const source = world();
    const candidate = patch(source);
    candidate.operations[1]!.writes = [];
    const choices = await decisionsFor(candidate, ["approved", "rejected", "rejected"]);
    const plan = await planReviewedPatch(source, candidate, choices);
    expect(plan).toMatchObject({ code: "ok", state: "ready", approvedOperationIds: ["resolve-warehouse-canon"] });
    expect(plan.operations[1]).toMatchObject({ validity: "stale_operation", decision: "rejected" });
    expect((await preflightReviewedApply(source, candidate, choices, plan.planDigest, null)).code).toBe("ready");
  });

  it("makes all-rejected review an unchanged deterministic no-op plan", async () => {
    const source = world();
    const candidate = patch(source);
    const plan = await planReviewedPatch(
      source,
      candidate,
      await decisionsFor(candidate, ["rejected", "rejected", "rejected"]),
    );
    expect(plan).toMatchObject({ code: "ok", state: "closed_noop", pendingCount: 0 });
    expect(plan.reviewed!.world).toBe(source);
    expect(plan.reviewed!.world.revision).toBe(0);
    expect(plan.reviewed!.writeKeys).toEqual([]);
  });

  it("marks a base mismatch stale even when targets still look identical", async () => {
    const source = world();
    const candidate = patch(source);
    const advanced = structuredClone(source);
    advanced.revision = 1;
    const plan = await planReviewedPatch(advanced, candidate, []);
    expect(plan).toMatchObject({ code: "stale_patch", state: "stale_patch" });
  });

  it("binds digest to causal decisions but excludes decision timestamps", async () => {
    const source = world();
    const candidate = patch(source);
    const early = await decisionsFor(candidate, ["approved", "approved", "rejected"], "2026-08-31T00:01:00.000Z");
    const late = await decisionsFor(candidate, ["approved", "approved", "rejected"], "2026-08-31T00:09:00.000Z");
    const earlyPlan = await planReviewedPatch(source, candidate, early);
    const latePlan = await planReviewedPatch(source, candidate, late);
    expect(earlyPlan.planDigest).toBe(latePlan.planDigest);
    expect((await planReviewedPatch(source, candidate, [...early].reverse())).planDigest).toBe(earlyPlan.planDigest);

    const tampered = structuredClone(candidate);
    tampered.operations[1]!.reasonCode = "changed-reason";
    const tamperedPlan = await planReviewedPatch(source, tampered, early);
    expect(tamperedPlan.patchFingerprint).not.toBe(earlyPlan.patchFingerprint);
    expect(tamperedPlan.pendingCount).toBeGreaterThan(0);
    expect(tamperedPlan.planDigest).not.toBe(earlyPlan.planDigest);

    const reordered = structuredClone(candidate);
    const canon = reordered.operations[0]!;
    canon.preconditions.reverse();
    const reorderedPlan = await planReviewedPatch(source, reordered, early);
    expect(reorderedPlan.patchFingerprint).not.toBe(earlyPlan.patchFingerprint);
    expect(reorderedPlan.operations[0]!.decision).toBe("pending");
  });

  it("never mutates deeply frozen planner inputs", async () => {
    const freeze = (value: unknown): unknown => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
      }
      return value;
    };
    const source = world();
    const candidate = patch(source);
    const choices = await decisionsFor(candidate, ["approved", "approved", "rejected"]);
    freeze(source);
    freeze(candidate);
    freeze(choices);
    await expect(planReviewedPatch(source, candidate, choices)).resolves.toMatchObject({ code: "ok", state: "ready" });
  });

  it("recomputes one belief group once when two memories are archived", async () => {
    const source = world();
    const makeArchive = (memoryId: string, id: string) => {
      const memory = source.memories[memoryId]!;
      return {
        id,
        kind: "archive_memory" as const,
        memoryId,
        beforeEligibility: "active" as const,
        afterEligibility: "archived" as const,
        reasonCode: "test_multi_archive",
        evidenceRefs: [memoryId],
        preconditions: [{ stateKey: `memory:${memoryId}`, entityRevision: memory.entityRevision, before: canonicalValue(memory) }],
        writes: [{ stateKey: `memory:${memoryId}`, after: canonicalValue({ ...memory, entityRevision: memory.entityRevision + 1, beliefEligibility: "archived" }) }],
      };
    };
    const candidate: Patch = {
      id: "archive-hana-pair",
      patchRevision: 1,
      worldId: source.worldId,
      baseWorldRevision: source.revision,
      createdAt: "2026-08-31T00:00:00.000Z",
      createdVia: "page-ui",
      summary: "Archive both Hana evidence memories in one reviewed plan.",
      operations: [
        makeArchive("mem-stole-hana-from-gen", "archive-hana-gen"),
        makeArchive("mem-stole-hana-from-miyo", "archive-hana-miyo"),
      ],
    };
    const choices = await decisionsFor(candidate, ["approved", "approved"]);
    const plan = await planReviewedPatch(source, candidate, choices);
    expect(plan.reviewed!.world.beliefs["hana::sc-stole"]).toMatchObject({
      stance: "unknown",
      entityRevision: 1,
      evidenceMemoryIds: [],
    });
    expect(plan.reviewed!.world.memories["mem-stole-hana-from-gen"]!.entityRevision).toBe(1);
    expect(plan.reviewed!.world.memories["mem-stole-hana-from-miyo"]!.entityRevision).toBe(1);
  });

  it("makes every Apply preflight refusal distinct and deterministic", async () => {
    const source = world();
    const candidate = patch(source);
    const choices = await decisionsFor(candidate, ["approved", "approved", "rejected"]);
    const reviewed = await planReviewedPatch(source, candidate, choices);

    expect((await preflightReviewedApply(source, candidate, [], null, null)).code).toBe("pending_page_review");
    expect((await preflightReviewedApply(source, candidate, choices, null, null)).code).toBe("review_preview_required");
    expect((await preflightReviewedApply(source, candidate, choices, "sha256:wrong", null)).code).toBe("preview_mismatch");
    expect((await preflightReviewedApply(source, candidate, choices, reviewed.planDigest, null)).code).toBe("ready");

    const rejected = await decisionsFor(candidate, ["rejected", "rejected", "rejected"]);
    const rejectedPlan = await planReviewedPatch(source, candidate, rejected);
    expect((await preflightReviewedApply(source, candidate, rejected, rejectedPlan.planDigest, null)).code).toBe("closed_noop");

    const staleWorld = structuredClone(source);
    staleWorld.revision += 1;
    expect((await preflightReviewedApply(staleWorld, candidate, choices, reviewed.planDigest, null)).code).toBe("stale_patch");

    const invalid = structuredClone(candidate);
    invalid.operations[0]!.writes = [];
    const invalidChoices = await decisionsFor(invalid, ["approved", "rejected", "rejected"]);
    const invalidPlan = await planReviewedPatch(source, invalid, invalidChoices);
    expect((await preflightReviewedApply(source, invalid, invalidChoices, invalidPlan.planDigest, null)).code).toBe("stale_operation");

    const receipt: ApplyReceipt = {
      status: "applied",
      worldId: candidate.worldId,
      patchId: candidate.id,
      patchRevision: candidate.patchRevision,
      patchFingerprint: reviewed.patchFingerprint,
      baseWorldRevision: candidate.baseWorldRevision,
      committedWorldRevision: 1,
      planDigest: reviewed.planDigest,
      appliedOperationIds: reviewed.approvedOperationIds,
      rejectedOperationIds: reviewed.rejectedOperationIds,
      committedAt: "2026-08-31T00:02:00.000Z",
    };
    expect((await preflightReviewedApply(staleWorld, candidate, choices, null, receipt)).code).toBe("already_applied");
    expect((await preflightReviewedApply(source, candidate, choices, null, { ...receipt, patchFingerprint: "sha256:forged" })).code).toBe("receipt_conflict");
    expect((await preflightReviewedApply(source, { ...candidate, createdAt: "not-a-date" }, choices, null, null)).code).toBe("invalid_input");
    expect((await preflightReviewedApply(source, { ...candidate, worldId: "other-world" }, choices, null, null)).code).toBe("invalid_input");
    expect((await preflightReviewedApply(source, candidate, choices, null, { ...receipt, worldId: "other-world" })).code).toBe("receipt_conflict");
  });

  it("defaults to preserve and only emits archive on explicit review_archive", () => {
    const source = world();
    const preserve = createWarehousePatch(source, {
      id: "preserve",
      patchRevision: 1,
      createdAt: "2026-08-31T00:00:00.000Z",
      createdVia: "page-ui",
    });
    expect(preserve.operations.map((operation) => operation.kind)).toEqual([
      "resolve_canon_relation",
      "replace_constraint_dependency",
    ]);
    expect(patch(source).operations).toHaveLength(3);
  });
});
