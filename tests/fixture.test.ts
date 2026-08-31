import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixtureBytesAndDigest } from "../scripts/build-fixture.ts";
import { measureFixture } from "../src/domain/invariants.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";
import fixtureJson from "../src/fixtures/warehouse-world.json";

describe("locked warehouse fixture", () => {
  it("regenerates byte-for-byte with a stable digest", async () => {
    const generated = await fixtureBytesAndDigest();
    const checkedIn = await readFile(
      fileURLToPath(new URL("../src/fixtures/warehouse-world.json", import.meta.url)),
      "utf8",
    );
    expect(generated.bytes).toBe(checkedIn);
    expect(generated.digest).toBe(
      "sha256:01993846f93d744970bb970e50c5be73dcc322e740cbfc2f0ef3375402eca8f8",
    );
  });

  it("derives honest scale and provenance counts from validated data", () => {
    const world = validateWorldSnapshot(structuredClone(fixtureJson));
    expect(measureFixture(world)).toEqual({
      actors: 16,
      defaultClaimBeliefs: 16,
      beliefs: 32,
      memories: 9,
      acceptedTransfers: 6,
      rejectedTransfers: 1,
      provenanceRoots: 3,
      maximumAcceptedDepth: 3,
      distortedAcceptedTransfers: 6,
      initialViolations: 1,
    });
    const rejection = world.rumorTransfers["tx-gen-aya-rejected"]!;
    expect(rejection).toMatchObject({
      outcome: "rejected",
      reasonCode: "low_trust",
      createdMemoryId: null,
    });
    expect(
      Object.values(world.memories).some((memory) => memory.createdByTransferId === rejection.id),
    ).toBe(false);

    const opposed = Object.values(world.beliefs).filter((belief) => belief.opposingScore > 0);
    expect(opposed.map((belief) => `${belief.actorId}::${belief.claimId}`).sort()).toEqual([
      "tatsu::sc-repaired",
      "tatsu::sc-stole",
    ]);
    expect(world.beliefs["tatsu::sc-stole"]).toMatchObject({
      stance: "rejected",
      evidenceMemoryIds: ["mem-stole-tatsu-from-gen"],
    });
    expect(world.beliefs["aki::sc-stole"]).toMatchObject({
      stance: "unknown",
      evidenceMemoryIds: [],
    });

    const theftStances = Object.values(world.beliefs)
      .filter((belief) => belief.claimId === "sc-stole")
      .reduce<Record<string, number>>((counts, belief) => {
        counts[belief.stance] = (counts[belief.stance] ?? 0) + 1;
        return counts;
      }, {});
    expect(theftStances).toEqual({ believed: 5, rejected: 1, unknown: 10 });
  });
});
