import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateBeliefs, toScoringMemory } from "../src/domain/beliefs.ts";
import { canonicalDigest, canonicalJson, roundCanonical } from "../src/domain/canonical.ts";
import { assertWarehouseFixture, measureFixture } from "../src/domain/invariants.ts";
import { decayedConfidence } from "../src/domain/scoring.ts";
import {
  relationshipKey,
  type AcceptedRumorTransfer,
  type Actor,
  type LocalizedText,
  type Memory,
  type RejectedRumorTransfer,
  type Relationship,
  type RumorTransfer,
  type WorldSnapshot,
} from "../src/domain/types.ts";
import { validateWorldSnapshot } from "../src/domain/validate.ts";

const FIXTURE_URL = new URL("../src/fixtures/warehouse-world.json", import.meta.url);
const SIMULATED_AT = "2026-08-30T12:00:00.000Z";

const ACTORS: readonly Actor[] = [
  { id: "hana", name: { ja: "ハナ", en: "Hana" } },
  { id: "gen", name: { ja: "ゲン", en: "Gen" } },
  { id: "miyo", name: { ja: "ミヨ", en: "Miyo" } },
  { id: "tatsu", name: { ja: "タツ", en: "Tatsu" } },
  { id: "sue", name: { ja: "スエ", en: "Sue" } },
  { id: "nori", name: { ja: "ノリ", en: "Nori" } },
  { id: "aya", name: { ja: "アヤ", en: "Aya" } },
  { id: "ren", name: { ja: "レン", en: "Ren" } },
  { id: "yui", name: { ja: "ユイ", en: "Yui" } },
  { id: "kei", name: { ja: "ケイ", en: "Kei" } },
  { id: "sora", name: { ja: "ソラ", en: "Sora" } },
  { id: "nao", name: { ja: "ナオ", en: "Nao" } },
  { id: "riku", name: { ja: "リク", en: "Riku" } },
  { id: "emi", name: { ja: "エミ", en: "Emi" } },
  { id: "jun", name: { ja: "ジュン", en: "Jun" } },
  { id: "aki", name: { ja: "アキ", en: "Aki" } },
];

function mapById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function buildRelationships(): Record<string, Relationship> {
  const result: Record<string, Relationship> = {};
  const trustOverrides: Record<string, number> = {
    [relationshipKey("hana", "gen")]: 0.82,
    [relationshipKey("hana", "miyo")]: 0.76,
    [relationshipKey("sue", "hana")]: 0.74,
    [relationshipKey("nori", "sue")]: 0.71,
    [relationshipKey("aya", "gen")]: 0.12,
    [relationshipKey("jun", "tatsu")]: 0.78,
  };
  ACTORS.forEach((from, fromIndex) => {
    ACTORS.forEach((to, toIndex) => {
      if (from.id === to.id) return;
      const key = relationshipKey(from.id, to.id);
      result[key] = {
        fromActorId: from.id,
        toActorId: to.id,
        entityRevision: 0,
        trust: trustOverrides[key] ?? roundCanonical(0.5 + ((fromIndex * 7 + toIndex * 3) % 26) / 100),
        affection: roundCanonical((((fromIndex * 5 + toIndex * 11) % 21) - 10) / 50),
        fear: roundCanonical(((fromIndex * 3 + toIndex * 2) % 11) / 50),
      };
    });
  });
  return result;
}

function rootMemory(
  id: string,
  actorId: string,
  claimId: string,
  surfaceText: LocalizedText,
  confidence: number,
  acquiredAt: string,
  emotionType: string,
): Memory {
  return {
    id,
    entityRevision: 0,
    actorId,
    claimId,
    sourceType: "witnessed",
    sourceActorId: null,
    sourceMemoryId: null,
    createdByTransferId: null,
    provenanceRootMemoryId: id,
    hop: 0,
    surfaceText,
    sourceForgottenAt: null,
    witnessedDirectly: true,
    confidenceAtAcq: confidence,
    importance: 0.8,
    emotionalWeight: claimId === "sc-stole" ? -0.55 : 0.45,
    emotionType,
    acquiredAt,
    lastRecalledAt: null,
    beliefEligibility: "active",
  };
}

function transferBeforeConfidence(
  parent: Memory,
  supportAtTransfer: { corroborationCount: number; repeatCount: number },
  transferredAt: string,
): number {
  return roundCanonical(
    decayedConfidence(toScoringMemory(parent), supportAtTransfer, new Date(transferredAt)),
  );
}

function acceptTransfer(
  world: WorldSnapshot,
  options: {
    id: string;
    parentMemoryId: string;
    toActorId: string;
    createdMemoryId: string;
    transferredAt: string;
    supportAtTransfer: { corroborationCount: number; repeatCount: number };
    afterText: LocalizedText;
  },
): void {
  const parent = world.memories[options.parentMemoryId];
  if (!parent) throw new Error(`Missing transfer parent ${options.parentMemoryId}`);
  const trust = world.relationships[relationshipKey(options.toActorId, parent.actorId)]?.trust;
  if (trust === undefined) throw new Error("Missing transfer relationship");
  const beforeConfidence = transferBeforeConfidence(parent, options.supportAtTransfer, options.transferredAt);
  const afterConfidence = roundCanonical(
    Math.max(0.05, beforeConfidence * 0.85 * (0.5 + 0.5 * trust)),
  );
  const transfer: AcceptedRumorTransfer = {
    id: options.id,
    fromActorId: parent.actorId,
    toActorId: options.toActorId,
    claimId: parent.claimId,
    parentMemoryId: parent.id,
    trustAtTransfer: trust,
    acceptanceThreshold: 0.35,
    supportAtTransfer: options.supportAtTransfer,
    beforeText: parent.surfaceText,
    beforeConfidence,
    transferredAt: options.transferredAt,
    outcome: "accepted",
    reasonCode: "trusted",
    afterText: options.afterText,
    afterConfidence,
    createdMemoryId: options.createdMemoryId,
  };
  world.rumorTransfers[transfer.id] = transfer;
  world.memories[options.createdMemoryId] = {
    id: options.createdMemoryId,
    entityRevision: 0,
    actorId: options.toActorId,
    claimId: parent.claimId,
    sourceType: "heard",
    sourceActorId: parent.actorId,
    sourceMemoryId: parent.id,
    createdByTransferId: transfer.id,
    provenanceRootMemoryId: parent.provenanceRootMemoryId,
    hop: parent.hop + 1,
    surfaceText: options.afterText,
    sourceForgottenAt: null,
    witnessedDirectly: false,
    confidenceAtAcq: afterConfidence,
    importance: 0.55,
    emotionalWeight: parent.emotionalWeight,
    emotionType: parent.emotionType,
    acquiredAt: options.transferredAt,
    lastRecalledAt: null,
    beliefEligibility: "active",
  };
}

function rejectTransfer(
  world: WorldSnapshot,
  options: {
    id: string;
    parentMemoryId: string;
    toActorId: string;
    transferredAt: string;
  },
): void {
  const parent = world.memories[options.parentMemoryId];
  if (!parent) throw new Error(`Missing rejection parent ${options.parentMemoryId}`);
  const trust = world.relationships[relationshipKey(options.toActorId, parent.actorId)]?.trust;
  if (trust === undefined) throw new Error("Missing rejection relationship");
  const supportAtTransfer = { corroborationCount: 1, repeatCount: 0 };
  const transfer: RejectedRumorTransfer = {
    id: options.id,
    fromActorId: parent.actorId,
    toActorId: options.toActorId,
    claimId: parent.claimId,
    parentMemoryId: parent.id,
    trustAtTransfer: trust,
    acceptanceThreshold: 0.35,
    supportAtTransfer,
    beforeText: parent.surfaceText,
    beforeConfidence: transferBeforeConfidence(parent, supportAtTransfer, options.transferredAt),
    transferredAt: options.transferredAt,
    outcome: "rejected",
    reasonCode: "low_trust",
    afterText: null,
    afterConfidence: null,
    createdMemoryId: null,
  };
  world.rumorTransfers[transfer.id] = transfer;
}

export function buildWarehouseWorld(): WorldSnapshot {
  const relationships = buildRelationships();
  const memories: Record<string, Memory> = {
    "mem-stole-gen-root": rootMemory(
      "mem-stole-gen-root",
      "gen",
      "sc-stole",
      {
        ja: "雨の夜、タツが倉庫から銀の工具箱を持ち出すのを見た。",
        en: "On the rainy night, I saw Tatsu carry the silver toolbox out of the warehouse.",
      },
      0.95,
      "2026-08-20T18:00:00.000Z",
      "suspicion",
    ),
    "mem-stole-miyo-root": rootMemory(
      "mem-stole-miyo-root",
      "miyo",
      "sc-stole",
      {
        ja: "祭りの前の日、タツが倉庫の裏口から工具箱を運んでいた。",
        en: "The day before the festival, Tatsu carried a toolbox through the warehouse back door.",
      },
      0.78,
      "2026-08-20T18:05:00.000Z",
      "worry",
    ),
    "mem-repaired-tatsu-root": rootMemory(
      "mem-repaired-tatsu-root",
      "tatsu",
      "sc-repaired",
      {
        ja: "壊れた水門を直すため、倉庫から自分の工具箱を持ち出した。",
        en: "I took my toolbox from the warehouse to repair the broken sluice gate.",
      },
      0.96,
      "2026-08-20T17:50:00.000Z",
      "gratitude",
    ),
  };

  const world: WorldSnapshot = {
    schemaVersion: 1,
    worldId: "warehouse-demo-v1",
    revision: 0,
    simulatedAt: SIMULATED_AT,
    incidents: {
      warehouse: {
        id: "warehouse",
        label: "The missing warehouse toolbox",
        actorIds: ACTORS.map((actor) => actor.id),
        claimIds: ["sc-stole", "sc-repaired"],
        defaultClaimId: "sc-stole",
      },
    },
    actors: mapById(ACTORS),
    claims: {
      "sc-stole": {
        id: "sc-stole",
        canonical: {
          ja: "タツは倉庫の工具箱を盗んだ。",
          en: "Tatsu stole the warehouse toolbox.",
        },
        subjectActorId: "tatsu",
        subjectValence: -1,
      },
      "sc-repaired": {
        id: "sc-repaired",
        canonical: {
          ja: "タツは水門を修理するために工具箱を借りた。",
          en: "Tatsu borrowed the toolbox to repair the sluice gate.",
        },
        subjectActorId: "tatsu",
        subjectValence: 1,
      },
    },
    claimRelations: {
      "rel-warehouse-accounts": {
        id: "rel-warehouse-accounts",
        entityRevision: 0,
        kind: "mutually_exclusive",
        claimIds: ["sc-stole", "sc-repaired"],
      },
    },
    canon: {
      "sc-stole": { claimId: "sc-stole", entityRevision: 0, status: "unresolved" },
      "sc-repaired": { claimId: "sc-repaired", entityRevision: 0, status: "unresolved" },
    },
    relationships,
    memories,
    rumorTransfers: {},
    beliefs: {},
    constraints: {
      traveller_can_stay: {
        id: "traveller_can_stay",
        entityRevision: 0,
        incidentId: "warehouse",
        kind: "quest_gate",
        label: "Let the traveller stay",
        dependency: { layer: "canon", claimId: "sc-repaired", equals: "confirmed" },
        expectedActive: true,
      },
      gen_warns_about_theft: {
        id: "gen_warns_about_theft",
        entityRevision: 0,
        incidentId: "warehouse",
        kind: "dialogue_condition",
        label: "Gen warns about the theft",
        dependency: { layer: "belief", actorId: "gen", claimId: "sc-stole", equals: "believed" },
        expectedActive: true,
      },
      tatsu_explains_repair: {
        id: "tatsu_explains_repair",
        entityRevision: 0,
        incidentId: "warehouse",
        kind: "dialogue_condition",
        label: "Tatsu explains the repair",
        dependency: { layer: "belief", actorId: "tatsu", claimId: "sc-repaired", equals: "believed" },
        expectedActive: true,
      },
      warehouse_dispute: {
        id: "warehouse_dispute",
        entityRevision: 0,
        incidentId: "warehouse",
        kind: "quest_gate",
        label: "Warehouse dispute remains active",
        dependency: { layer: "canon", claimId: "sc-repaired", equals: "unresolved" },
        expectedActive: true,
      },
    },
  };

  acceptTransfer(world, {
    id: "tx-gen-hana",
    parentMemoryId: "mem-stole-gen-root",
    toActorId: "hana",
    createdMemoryId: "mem-stole-hana-from-gen",
    transferredAt: "2026-08-21T09:00:00.000Z",
    supportAtTransfer: { corroborationCount: 1, repeatCount: 0 },
    afterText: {
      ja: "タツが倉庫から銀の工具箱を持ち出したらしい。",
      en: "Apparently Tatsu carried the silver toolbox out of the warehouse.",
    },
  });
  acceptTransfer(world, {
    id: "tx-gen-tatsu",
    parentMemoryId: "mem-stole-gen-root",
    toActorId: "tatsu",
    createdMemoryId: "mem-stole-tatsu-from-gen",
    transferredAt: "2026-08-21T09:05:00.000Z",
    supportAtTransfer: { corroborationCount: 1, repeatCount: 0 },
    afterText: {
      ja: "ゲンは、私が銀の工具箱を運び出したところを見たと言っている。",
      en: "Gen says he saw me carry the silver toolbox out of the warehouse.",
    },
  });
  acceptTransfer(world, {
    id: "tx-miyo-hana",
    parentMemoryId: "mem-stole-miyo-root",
    toActorId: "hana",
    createdMemoryId: "mem-stole-hana-from-miyo",
    transferredAt: "2026-08-21T09:10:00.000Z",
    supportAtTransfer: { corroborationCount: 1, repeatCount: 0 },
    afterText: {
      ja: "タツが倉庫の裏から工具箱を運んでいたそうだ。",
      en: "They say Tatsu carried a toolbox behind the warehouse.",
    },
  });
  acceptTransfer(world, {
    id: "tx-hana-sue",
    parentMemoryId: "mem-stole-hana-from-gen",
    toActorId: "sue",
    createdMemoryId: "mem-stole-sue-from-hana",
    transferredAt: "2026-08-22T09:00:00.000Z",
    supportAtTransfer: { corroborationCount: 2, repeatCount: 0 },
    afterText: {
      ja: "タツが工具箱を持ち出したって聞いたよ。",
      en: "I heard Tatsu took a toolbox away.",
    },
  });
  acceptTransfer(world, {
    id: "tx-sue-nori",
    parentMemoryId: "mem-stole-sue-from-hana",
    toActorId: "nori",
    createdMemoryId: "mem-stole-nori-from-sue",
    transferredAt: "2026-08-23T09:00:00.000Z",
    supportAtTransfer: { corroborationCount: 1, repeatCount: 0 },
    afterText: {
      ja: "タツが何か持っていったって話だ。",
      en: "The story is that Tatsu took something.",
    },
  });
  acceptTransfer(world, {
    id: "tx-tatsu-jun",
    parentMemoryId: "mem-repaired-tatsu-root",
    toActorId: "jun",
    createdMemoryId: "mem-repaired-jun-from-tatsu",
    transferredAt: "2026-08-21T10:00:00.000Z",
    supportAtTransfer: { corroborationCount: 1, repeatCount: 0 },
    afterText: {
      ja: "タツは水門修理に工具箱を使ったそうだ。",
      en: "Tatsu says the toolbox was used to repair the sluice gate.",
    },
  });
  rejectTransfer(world, {
    id: "tx-gen-aya-rejected",
    parentMemoryId: "mem-stole-gen-root",
    toActorId: "aya",
    transferredAt: "2026-08-21T11:00:00.000Z",
  });

  world.beliefs = evaluateBeliefs(world);
  const validated = validateWorldSnapshot(world);
  assertWarehouseFixture(validated);
  return validated;
}

export async function fixtureBytesAndDigest(): Promise<{
  bytes: string;
  digest: string;
  measurements: ReturnType<typeof measureFixture>;
}> {
  const world = buildWarehouseWorld();
  const bytes = `${canonicalJson(world)}\n`;
  return {
    bytes,
    digest: await canonicalDigest(world),
    measurements: measureFixture(world),
  };
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const generated = await fixtureBytesAndDigest();
  const fixturePath = fileURLToPath(FIXTURE_URL);
  if (check) {
    const current = await readFile(fixturePath, "utf8");
    if (current !== generated.bytes) {
      throw new Error("warehouse-world.json differs from deterministic regeneration");
    }
    console.log(JSON.stringify({ ok: true, digest: generated.digest, ...generated.measurements }));
    return;
  }
  await writeFile(fixturePath, generated.bytes, "utf8");
  console.log(JSON.stringify({ wrote: fixturePath, digest: generated.digest, ...generated.measurements }));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
