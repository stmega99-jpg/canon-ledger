# Project Scope

## Project Name Candidates

- **Canon Ledger — selected.** A ledger records competing accounts and their history instead of silently deleting the losing account.

## One-Line Summary

**English:** A WebMCP belief-state debugger that lets game developers trace what each NPC believes and why, then stage canon changes without erasing intentional rumors or misconceptions.

**Japanese:** ゲーム開発者が、NPCごとの信念と噂の由来を横断して調べ、意図的な誤解を消さずに正史変更をstage・review・commitできるWebMCPデバッガー。

## Target User

分岐物語、群衆NPC、またはAI NPCを持つゲーム／シミュレーションを設計するナラティブ開発者。

小説家、TRPG制作者、一般的なworld bible利用者には手を広げない。提出文とデモの語彙は、ゲーム状態、会話条件、クエストゲート、NPC belief、rumor propagationに統一する。

## Problem

ゲーム内の1イベントを変更すると、複数NPCの会話条件、クエストゲート、知識、誤解が連鎖的に影響を受ける。通常のstory bibleは客観的な設定を管理できても、各NPCが「何を信じているか」「誰から聞いたか」「どこで拒否・歪曲されたか」までは人間が手作業で追い切れない。

AIに整合性修正を丸投げすると、意図的な嘘、噂、誤認、ドラマティックアイロニーまで「矛盾」として消される危険がある。

## Product Thesis And Differentiation

Canon Ledgerの本体価値は承認UI単体ではなく、**人間には管理困難な量のNPC別belief・memory・rumor provenanceをエージェントが横断できること**。人間承認は、その規模で安全に編集するためのcommit境界である。

Worldcraftなどの既存story bibleは、原稿と客観的canonの整合性を中心に扱う。Canon Ledgerは次の層を分離する。

- `claim`: 正規化された命題。相互排他の命題も削除せず保持する。
- `canon status`: 客観世界でconfirmed / rejected / unresolvedのどれか。論理的に両立しない2命題を同時に客観的真実とは呼ばない。
- `memory`: NPCが持つ命題の一インスタンス。誰から、いつ、どの表現で得たかを保持する。
- `belief`: NPCごとの現在のstanceと、その決定論的な根拠。
- `provenance`: immutableな伝播元とhop列。拒否された伝達も記録する。

したがって **“Contradictions held, not resolved”** は、矛盾した命題・記憶・人物視点を悪いデータとして削除しない、という意味で使う。客観canonの論理矛盾を正当化する主張には使わない。

## Core Workflow

1. 人間がページを開くと、対象事件についてNPC数、belief分布、rumor hop、独立provenance root、未解決constraintを集計で見る。
2. エージェントが`search_world`を呼ぶと、ツール結果を返すだけでなく、同じページのfilter・選択claim・表示中NPCが同期して変わる。
3. `trace_claim_provenance`で代表NPCの噂をrootまで辿り、歪みと拒否地点を画面に表示する。
4. `check_world_consistency`で、登録済みconstraintに対する現在状態を決定論的に検査する。
5. `suggest_world_edit`が構造化operationをstageする。canonやmemoryは変更しない。
6. 人間がSuggestionsパネルでoperationごとにapprove / rejectする。
7. `apply_reviewed_edit`はpatch ID、revision、各operationの承認状態を照合し、承認済みoperationだけをcommitする。
8. 集計とconstraintを再計算し、「canon conflictは解消」「主観的な誤認は保持」「provenance rootは不変」を同じページで検証する。

## What We Are Building

### 1. One finished warehouse-incident workflow

主デモは既存の倉庫事件に固定する。

- 客観canonを「旅人は盗んでおらず、倉庫を修理していた」に確定する。
- ゲンの盗難誤認と、そこから伝播したmemoryは意図的なNPC視点として保持する。
- タツの直接証言、ゲンの直接誤認、ミヨ／ハナ等の異なるbelief結果を比較する。
- 既存`ground-truth.ts`は既にtheft=false / repair=trueなので、デモは値のretconではなく **unresolved → canon confirmed** と正直に表現する。

### 2. A verified rumor fixture, not a vanity NPC count

人数そのものを成功指標にしない。fixtureはテストで次を満たす。

- provenance hop depthが3以上のchainを最低1本含む。
- trust threshold不足で止まるrejected transferを最低1本含む。
- surface wordingまたはconfidenceが変化するdistorted transferを最低1本含む。
- 2つ以上の独立provenance rootを区別する。
- 対象事件に接続された全NPCについてbeliefを実際に評価する。
- default page size 10件では全件表示できない規模になり、`total`と集計値が意味を持つ。
- デモでは5人だけを物語の主役として追う。総NPC数は上の不変条件を満たした結果として20〜50を想定し、検証前に「50 NPC対応」と宣伝しない。

現行seedの655 memoryはすべてhop depth 0であり、stored beliefでもrumor chainでもない。既存シナリオ実行時に作られるchainだけを証拠にせず、提出fixture自体に検証可能なchainを持たせる。

### 3. Five narrow WebMCP tools

| Tool | Role | Page effect | Annotation |
|---|---|---|---|
| `search_world` | query/filter claims, actors, stances and aggregates | results table and active filters change | `readOnlyHint: true` |
| `trace_claim_provenance` | return one bounded provenance trace | trace panel and selected NPC change | `readOnlyHint: true` |
| `check_world_consistency` | evaluate declared constraints only | constraint panel updates | `readOnlyHint: true` |
| `suggest_world_edit` | stage a versioned patch; never commit | Suggestions panel opens | no read-only hint |
| `apply_reviewed_edit` | commit only UI-approved operations | ledger, audit log and aggregates update | no read-only hint |

`get_character_dossier`は`search_world`のactor filterと結果詳細で代替する。重複toolを増やさない。

### 4. Bounded JSON-compatible tool results

Site toolsのcallbackは通常のJSON互換オブジェクトを返す。MCP server用の`content[] + structuredContent` envelopeを必須契約にはしない。共通形は次とする。

```json
{
  "ok": true,
  "code": "ok",
  "summary": "12 of 27 matching NPC beliefs returned",
  "data": {
    "total": 27,
    "items": [],
    "nextCursor": "opaque-or-null",
    "truncated": true
  },
  "pageState": {
    "view": "beliefs",
    "selectedClaimId": "claim-id"
  },
  "audit": {
    "invocationId": "id",
    "changed": false
  }
}
```

- 全件をtool resultへ返さない。defaultは上位10件＋総数＋cursor / truncated。
- Day 0 probeで約1 KiB / 8 KiB / 32 KiBの結果を試し、実ランタイム挙動を記録する。
- probe完了前は1 resultあたり12 KiBをsoft budgetとする。
- callbackはtop-level `undefined`、BigInt、循環参照を返さない。
- `inputSchema`に依存せず、ページ側でも型、列挙、ID、件数、revisionを検証する。

### 5. Human-safe, versioned write path

- staged patchとoperationにはID、base revision、author、timestampを持たせる。
- approvalはoperation IDとpatch revisionへ結び付ける。単一checkboxを任意変更の許可として使わない。
- `suggest_world_edit`はcanonを一切変更しない。
- `apply_reviewed_edit`は引数で任意operationを承認できない。UIに保存されたreview結果だけを読む。
- local persistenceとJSON import/exportを含め、reload後もreview stateとledgerを復元できる。

### 6. Human-only fallback

`document.modelContext`がない環境でも、検索、filter、trace、stage、approve/reject、commit、import/exportを通常UIからすべて使える。WebMCPは共同操作面を追加するが、製品の唯一の操作経路にはしない。

### 7. Performance budget and optional semantic search

- 初回critical-path transferは圧縮後300 KiB以下を目標とする。これは差別化主張ではなくExecutionの品質ゲート。
- 全memory／relationshipをDOMやSVGへ一括描画しない。
- keyword / structured filterをcoreとして完成させる。
- 既存の事前計算embeddingは捨てない。Day 0とcore workflowが通った後のDay 3任意項目として、lazy-loaded semantic adapterを差し込める境界だけ先に保つ。
- semantic searchを実装するまでtool schemaへ`mode: semantic`を露出しない。同じ`search_world`契約の内部実装として追加し、agentの誤選択を増やさない。

## Failure Behavior

| Failure | Required behavior |
|---|---|
| 未承認operationをapply | 変更せず`pending_human_review`。未決件数とSuggestions panelの状態を返す。 |
| 削除済み／revision違いの実体を参照 | 該当operationだけ`stale_operation`として無効化。依存しないoperationとpatch自体は保持する。 |
| schemaまたは業務入力違反 | ページ側で拒否し`invalid_input`とfield単位の理由を返す。 |
| WebMCP非対応 | bannerでhuman-only modeを示し、通常UIの全機能を維持する。 |
| 結果が上限超過 | `truncated: true`、`total`、`nextCursor`を返し、黙って欠落させない。 |
| patch base revisionが古い | commitせず`stale_patch`。再提案を要求し、既存review履歴を監査用に残す。 |

## What We Are Not Building

- 一般自然文から未知の矛盾、因果、時間制約を発見するAI。
- 「どんなゲームでも」「数千NPCでも」という未検証の汎用性。
- Unity／Unreal／Godot plugin、ゲームランタイムとのlive integration。
- サーバー、DB、ログイン、共同編集、課金。
- 全relationを表示する自由配置graph。
- 非フィクション事故報告サンプルや第二のデモドメイン。
- 100 NPCを見栄えのためだけに追加すること。
- 700 claim化やembedding再計算をcore完成前に行うこと。
- モデルが最終canon、belief、constraint verdictを決めること。
- 未承認operationの自動commit。

## Inspiration And References

- [OpenAI Site tools](https://learn.chatgpt.com/docs/webmcp): person and agent share the same live page; preserve the normal human interface; keep inputs narrow and results verifiable.
- [WebMCP Gerrit-style example](https://github.com/webmachinelearning/webmcp): agent stages a suggested edit and the person accepts, changes or rejects it in the UI.
- [Worldcraft](https://www.worldcraft.co.uk/): direct competitive baseline for evidence-backed canon, contradiction review and human approval. Canon Ledger must demonstrate the additional per-NPC belief / rumor / refusal model.
- Dwarf Fortress / RimWorld: conceptual reference for stories emerging from many character-specific states; not evidence of equivalent tooling.
- Git staging review: interaction reference for versioned, operation-level review and partial commit.

## Demo Path

Hard target: 2:15, leaving margin under the event's 3:00 video limit.

1. **0:00–0:15 — Real pain.** “Change one event and three NPC dialogue conditions and a quest gate silently break.” Show aggregate counts, not a giant graph.
2. **0:15–0:35 — Ask at scale.** Agent calls `search_world`; the page filters to the warehouse incident and shows stance distribution, affected NPC total, rumor hops and provenance roots.
3. **0:35–0:55 — Explain one NPC.** Trace the theft rumor from Gen through at least three hops, including a distortion or rejection.
4. **0:55–1:15 — Stage.** Agent proposes confirming repair as canon and stages operation-level consequences.
5. **1:15–1:35 — Human judgment.** Approve canon operations; reject deletion or rewriting of intentional NPC misconceptions.
6. **1:35–1:55 — Commit.** Agent calls apply; only reviewed operations commit. If useful, show one premature apply being refused before approval.
7. **1:55–2:10 — Verify.** `unresolved canon decisions: 1 → 0`, subjective memories preserved, provenance roots changed: 0, destructive rewrites rejected.
8. **2:10–2:15 — Promise.** “Canon Ledger debugs what every NPC believes without flattening the story they disagree about.”

## Submission Story

**What people and agents can do together that was difficult before:** An agent can cross a belief graph too large for a narrative designer to inspect manually, stage the consequences of a canon decision, and move the live page to the evidence; the designer can preserve intentional misconceptions and commit only reviewed operations.

**Creativity & Ambition:** Canon Ledger does not treat every contradiction as bad data. It retains mutually exclusive claims, per-NPC memories, rejection and distortion as inspectable state while keeping objective canon separate.

**WebMCP Leverage:** The agent and person act on the same visible state. Tool calls move the dashboard, suggestions appear in the human review surface, and commit depends on operation-level decisions made there.

**Execution:** Static, local-first, usable without WebMCP, bounded tool results, deterministic constraints, reload persistence, import/export, and a measurable critical-path budget.

**Potential Impact:** Narrative and simulation developers can debug belief-dependent dialogue and quest conditions before a canon change silently breaks character behavior.

## Build Budget And Stop Rules

- Human availability: high.
- Binding resource: included Codex and Claude usage allowances; use a few focused sessions and durable local docs.
- Paid credits, paid APIs and paid services: prohibited without explicit user permission.
- Claude: bounded adversarial review after the core loop and before submission, not duplicate implementation.

### Ordered gates

1. **Day 0 — real runtime:** In ChatGPT desktop with GPT-5.6 Sol or Terra, open the top-level probe and verify discovery, ordinary JSON return, page mutation, unapproved refusal and bounded result sizes. Shim output does not count.
2. **Core loop:** ID-bound staging, op review, approved-only commit and deterministic recheck work in human mode and automated tests.
3. **Fixture truth:** depth ≥3, one rejection, one distortion, multiple roots, evaluated beliefs and exact aggregate counts are asserted by tests.
4. **Complete product:** persistence, import/export, human-only fallback and the five tools work without a server or paid dependency.
5. **Reliability:** 10–12 natural-language tool-selection evals produce no dangerous wrong-tool call; the 2:15 demo succeeds five consecutive times in the real runtime.
6. **Optional Day 3:** only after gates 1–4 are green, add lazy semantic search if the existing vectors can be integrated without breaking the performance budget or tool contract.

### Verdict

- `PIVOT`: accepted.
- Implementation `GO`: **not yet**. It requires Day 0 real-runtime proof plus a final adversarial review of this narrowed scope and build checklist.
- `KILL / freeze`: if real Site tools cannot be discovered reliably, approved-only commit cannot be made fail-closed, or the verified rumor fixture cannot be produced inside the remaining AI-usage budget.
