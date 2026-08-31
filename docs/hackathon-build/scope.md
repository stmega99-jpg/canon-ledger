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

ゲーム内の1イベントを変更すると、客観canonを参照するクエストゲートと、NPCの主観的beliefを参照する会話条件では結果が別々に変わる。通常のstory bibleは客観的な設定を管理できても、各NPCが「何を信じているか」「誰から聞いたか」「どこで拒否・歪曲されたか」、そして登録済みのゲーム条件が変更後に **変わる／意図どおり残る／期待に反する** のどれかまでは人間が手作業で追い切れない。

AIに整合性修正を丸投げすると、意図的な嘘、噂、誤認、ドラマティックアイロニーまで「矛盾」として消される危険がある。

## Product Thesis And Differentiation

Canon Ledgerの本体価値は承認UI単体ではなく、**人間には管理困難な量のNPC別belief・memory・rumor provenanceをエージェントが横断できること**。人間承認は、その規模で安全に編集するためのcommit境界である。

Worldcraftなどはevidence-backed canonを扱い、PlotLensはさらにnarrative factとcharacter beliefを区別して意図的なmisdirectionを誤検知しないと明示している。したがって「canonとbeliefを分ける」だけは差別化ではない。Canon Ledgerは次の層を明示データとして分離する。

- `claim`: 正規化された命題。相互排他の命題も削除せず保持する。
- `canon status`: 客観世界でconfirmed / rejected / unresolvedのどれか。論理的に両立しない2命題を同時に客観的真実とは呼ばない。
- `memory`: NPCが持つ命題の一インスタンス。誰から、いつ、どの表現で得たかを保持する。
- `belief`: NPCごとの現在のstanceと、その決定論的な根拠。
- `provenance`: immutableな伝播元とhop列。拒否された伝達も記録する。
- `game constraint`: 開発者が登録した会話条件またはクエストゲート。predicateが`canon status`と`NPC belief`のどちらを参照するかを型として保持し、変更前後の結果と期待値を比較する。

したがって **“Contradictions held, not resolved”** は、矛盾した命題・記憶・人物視点を悪いデータとして削除しない、という意味で使う。客観canonの論理矛盾を正当化する主張には使わない。

競合に対する一文の機構差は、**NPCごとの明示的belief stance、immutableな多段hop／refusal／distortion provenance、canon/beliefを型で分けた登録済みゲーム条件投影、そして同じWebMCPページ上のpage-owned operation reviewを一続きで実演すること**。この4点の連鎖を検証済みfixtureで見せられなければ、独自性主張は`KILL`または再PIVOTとする。

## Core Workflow

1. 人間がページを開くと、対象事件についてNPC数、belief分布、rumor hop、独立provenance root、未解決constraintを集計で見る。
2. エージェントが`search_world`を呼ぶと、ツール結果を返すだけでなく、同じページのfilter・選択claim・表示中NPCが同期して変わる。
3. `trace_claim_provenance`で代表NPCの噂をrootまで辿り、歪みと拒否地点を画面に表示する。
4. `check_world_consistency`で、登録済みconstraintだけを決定論的に検査する。canon依存とbelief依存を混同せず、projected resultを差分軸`changed / preserved`と判定軸`satisfied / violated`の2軸で示す。
5. `suggest_world_edit`が構造化operationをstageする。canonやmemoryは変更しない。
6. 人間がSuggestionsパネルでoperationごとにapprove / rejectする。
7. `apply_reviewed_edit`はpatch ID、revision、各operationの承認状態を照合し、承認済みoperationだけをcommitする。
8. 集計とconstraintを再計算し、「canon decisionは確定」「主観的な誤認は保持」「provenance rootは不変」「登録済みゲーム条件の期待違反は0」を同じページで検証する。

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
- 相互排他の両命題についてactive evidenceを持つNPCを最低1人含め、`opposingScore > 0`とstance変化を実測する。証拠の無いNPCは`unknown`のままにする。
- default page size 10件では全件表示できない規模になり、`total`と集計値が意味を持つ。
- デモでは5人だけを物語の主役として追う。提出fixtureの総NPC数は不変条件を満たした結果として実測16人であり、検証していない大規模対応を宣伝しない。

現行seedの655 memoryはすべてhop depth 0であり、stored beliefでもrumor chainでもない。既存シナリオ実行時に作られるchainだけを証拠にせず、提出fixture自体に検証可能なchainを持たせる。

### 3. Typed, registered game constraints

「会話条件とクエストゲート」をピッチだけの名詞にしない。fixtureへ、ゲーム側の依存を表す小さな`gameConstraint`集合を含める。

```text
gate "traveller_can_stay"       requires canon sc-repaired = confirmed
line "gen_warns_about_theft"    requires Gen belief sc-stole = believed
line "tatsu_explains_repair"    requires Tatsu belief sc-repaired = believed
```

- predicateは`canon`または`belief(actorId)`のどちらを読むかを必ず明示する。
- stage時に現在値とcommit後のprojected valueを比較する。`changed / preserved`は前後差分、`satisfied / violated`は変更後の期待判定として別々に数える。`changed + violated`、`changed + satisfied`、`preserved + satisfied`、`preserved + violated`の4組を潰さない。
- canon確定後もゲンのbeliefを保持するため、`gen_warns_about_theft`は意図どおりactiveのままでなければならない。これを「壊れた」と数えない。
- 最低1つのcanon依存gateはprojected valueが変わり、最低1つのbelief依存lineは意図どおり残るfixtureにする。
- fixtureには、`warehouse_dispute`が誤ってglobal canonを読むためcanon-only previewでは`changed + violated`になる例を1件だけ透明に置く。別operationで依存先を`Gen belief sc-stole = believed`へ直し、ゲンのbeliefを書き換えずに`satisfied`へ戻す。実ゲームから自動発見したバグとは呼ばない。
- 任意のUnity／Unreal／Godotプロジェクトから未知の依存を発見するとは主張しない。検査対象はJSONに登録済みの条件だけで、未登録依存は検出できないことをUIに明記する。
- 成功指標は巨大な総数ではなく、対象事件について`affected total`、transition totals（`changed / preserved`）、verdict totals（`satisfied / violated`）が再現可能であること。

### 4. Five narrow WebMCP tools

| Tool | Role | Page effect | Annotation |
|---|---|---|---|
| `search_world` | query/filter claims, actors, stances and aggregates | results table and active filters change | `readOnlyHint: true` |
| `trace_claim_provenance` | return one bounded provenance trace | trace panel and selected NPC change | `readOnlyHint: true` |
| `check_world_consistency` | evaluate registered canon/belief constraints only | projected constraint panel updates | `readOnlyHint: true` |
| `suggest_world_edit` | stage a versioned patch; never commit | Suggestions panel opens | no read-only hint |
| `apply_reviewed_edit` | commit only UI-approved operations | ledger, audit log and aggregates update | no read-only hint |

`get_character_dossier`は`search_world`のactor filterと結果詳細で代替する。重複toolを増やさない。

### 5. Bounded JSON-compatible tool results

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
- Day 0実ランタイムで約1 / 8 / 32 / 128 KiBを試し、128 KiB（131,072-byte filler、131,251-byte JSON）まで無欠損で返ることを確認済み。
- 上限が128 KiB超であることは全件返却の許可ではない。通常resultは12 KiBをsoft budgetとし、top N＋total＋cursor / truncatedを維持する。
- callbackはtop-level `undefined`、BigInt、循環参照を返さない。
- `inputSchema`に依存せず、ページ側でも型、列挙、ID、件数、revisionを検証する。

### 6. Page-reviewed, versioned write path

- staged patchとoperationにはID、base revision、author、timestampを持たせる。
- approvalはoperation IDとpatch revisionへ結び付ける。単一checkboxを任意変更の許可として使わない。
- `suggest_world_edit`はcanonを一切変更しない。
- `apply_reviewed_edit`は引数で任意operationを承認できない。UIに保存されたreview結果だけを読む。
- 同一originのlocal persistenceにより、reload後もreview stateとledgerを復元できる。JSON import/exportはMVP外とする。

### 7. No-Site-tools fallback

`document.modelContext`がない環境でも、検索、filter、trace、stage、approve/reject、commit、reload persistence、resetを通常UIからすべて使える。WebMCPは共同操作面を追加するが、製品の唯一の操作経路にはしない。

### 8. Performance budget and optional semantic search

- 初回critical-path transferは圧縮後300 KiB以下を目標とする。これは差別化主張ではなくExecutionの品質ゲート。
- 全memory／relationshipをDOMやSVGへ一括描画しない。
- keyword / structured filterをcoreとして完成させる。
- 既存の事前計算embeddingは捨てない。Day 0とcore workflowが通った後のDay 3任意項目として、lazy-loaded semantic adapterを差し込める境界だけ先に保つ。
- semantic searchを実装するまでtool schemaへ`mode: semantic`を露出しない。同じ`search_world`契約の内部実装として追加し、agentの誤選択を増やさない。

## Failure Behavior

| Failure | Required behavior |
|---|---|
| 未決operationをapply | 変更せず`pending_page_review`。未決件数とSuggestions panelの状態を返す。 |
| 削除済み／revision違いの実体を参照 | 該当operationだけ`stale_operation`として無効化。依存しないoperationとpatch自体は保持する。 |
| schemaまたは業務入力違反 | ページ側で拒否し`invalid_input`とfield単位の理由を返す。 |
| WebMCP非対応 | bannerでno-Site-tools modeを示し、通常UIの全機能を維持する。 |
| 結果が上限超過 | `truncated: true`、`total`、`nextCursor`を返し、黙って欠落させない。 |
| patch base revisionが古い | commitせず`stale_patch`。再提案を要求し、既存review履歴を監査用に残す。 |

## What We Are Not Building

- 一般自然文から未知の矛盾、因果、時間制約を発見するAI。
- 「どんなゲームでも」「数千NPCでも」という未検証の汎用性。
- Unity／Unreal／Godot plugin、ゲームランタイムとのlive integration。
- 未登録の会話条件やクエストゲートをゲームプロジェクトから自動発見すること。
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
- [PlotLens](https://plotlens.ai/solutions/ai-story-bible/): closest current competitor to the surface claim. Its official product page already distinguishes character belief from narrative fact and says intentional misdirection should not be flagged. Canon Ledger cannot claim that separation as novel; it must demonstrate explicit per-NPC stance, immutable multi-hop/refusal/distortion provenance, registered game-condition projection, and page-owned WebMCP operation review as one mechanism.
- [articy:draft X](https://www.articy.com/en/how-articydraft-x-helps-developers-streamline-narrative-integration/): direct game-narrative baseline for structured dialogue, variables, conditions, validation and engine integration. Canon Ledger does not compete on engine integration; it must win specifically on per-NPC belief/provenance and reviewable agent actions.
- [Arcweave](https://docs.arcweave.com/project-items/branches): game narrative baseline for variable-driven branches and play testing. Registered conditions alone are not differentiation.
- [Talk of the Town](https://eis.ucsc.edu/papers/ryanEtAl_TowardCharactersWhoObserveTellMisrememberLie.pdf): research/OSS precedent for NPC mental models, evidence, propagation, forgetting, misremembering and lying. Canon Ledger must not claim the belief model itself is unprecedented; the submission claim is a WebMCP debugging and page-reviewed editing surface over that class of state.
- Dwarf Fortress / RimWorld: conceptual reference for stories emerging from many character-specific states; not evidence of equivalent tooling.
- Git staging review: interaction reference for versioned, operation-level review and partial commit.

## Demo Path

Hard target: 2:15, leaving margin under the event's 3:00 video limit.

1. **0:00–0:15 — Real pain.** “Change one canon fact: which quest gates flip, and which NPC dialogue must remain because that character still believes the rumor?” Show registered-condition aggregates, not a giant graph.
2. **0:15–0:35 — Ask at scale.** Agent calls `search_world`; the page filters to the warehouse incident and shows stance distribution, affected NPC total, rumor hops and provenance roots.
3. **0:35–0:55 — Explain one NPC.** Trace the theft rumor from Gen through at least three hops, including a distortion or rejection.
4. **0:55–1:15 — Stage.** Agent proposes confirming repair as canon and shows projected registered-condition results as `changed / preserved` plus `satisfied / violated`.
5. **1:15–1:35 — Visible page review.** Approve canon operations; reject optional archival of an intentional NPC misconception from belief scoring while its provenance remains stored.
6. **1:35–1:55 — Commit.** Agent calls apply; only reviewed operations commit. If useful, show one premature apply being refused before approval.
7. **1:55–2:10 — Verify.** `affected game conditions: N` with readable names, `violated: N → 0`, subjective memories preserved, provenance roots changed: 0, optional memory archival rejected.
8. **2:10–2:15 — Promise.** “Canon Ledger debugs what every NPC believes without flattening the story they disagree about.”

## Submission Story

**What people and agents can do together that was difficult before:** An agent can cross a belief graph too large for a narrative designer to inspect manually, stage the consequences of a canon decision, and move the live page to the evidence; the designer can preserve intentional misconceptions and commit only reviewed operations.

**Creativity & Ambition:** The novelty claim is the combined mechanism—not belief/fact separation alone: explicit NPC stances and immutable rumor paths feed registered canon-vs-belief game-condition projections, then a WebMCP agent stages operation-level changes whose authority remains in the page.

**WebMCP Leverage:** The agent and person act on the same visible state. Tool calls move the dashboard, suggestions appear in the visible page-review surface, and commit depends on operation-level decisions recorded there.

This is a route/state boundary, not actor authentication: Site-tool inputs cannot carry or mint review decisions, but an agent with browser-control capability may operate visible page controls. Canon Ledger therefore does not claim that an ordinary DOM control proves a person was the actor.

**Execution:** Static, local-first, usable without WebMCP, bounded tool results, deterministic constraints, reload persistence/reset, and a measurable critical-path budget.

**Decision provenance:** “Canon Ledger records how a decision was made, not who made it — the same guarantee it gives every other record in the ledger.” The route is auditable and revision-bound; it is not an identity claim.

**Potential Impact:** Narrative and simulation developers can project how registered canon- and belief-dependent dialogue or quest conditions behave before committing a canon change, without flattening character-specific misconceptions.

## Build Budget And Stop Rules

- Human availability: high.
- Binding resource: included Codex and Claude usage allowances; use a few focused sessions and durable local docs.
- Paid credits, paid APIs and paid services: prohibited without explicit user permission.
- Claude: bounded adversarial review after the core loop and before submission, not duplicate implementation.
- Official deadline: **2026-09-04 05:00 JST** (2026-09-03 13:00 PDT). Internal submission target: **2026-09-04 02:00 JST** so the final three hours remain buffer.

### Ordered gates

1. **Day 0 — real runtime, completed 2026-08-30 13:00 JST:** real `document.modelContext`、`devShimActive: false`で4 toolsを発見。ordinary JSON、page mutation、未承認拒否、人間承認後の適用、1 / 8 / 32 / 128 KiB結果を確認した。**GREEN**。
2. **Planning lock — 2026-08-30 22:00 JST:** PRD、spec、checklistでcanon/belief constraint境界と受け入れ条件を固定する。赤なら実装を始めず、game-condition訴求を切ってbelief provenance viewerへ縮退する。
3. **Core loop — 2026-08-31 23:00 JST:** ID-bound staging、op review、approved-only commit、deterministic recheckがno-Site-tools modeと自動テストで動く。赤ならsemantic、追加sample、装飾UIをすべて切る。
4. **Fixture and causal truth — 2026-09-01 23:00 JST:** depth ≥3、拒否、歪み、複数root、evaluated beliefs、正確な集計に加え、canon依存gateが最低1件変化しbelief依存lineが最低1件保持されることをテストする。赤なら「ゲーム条件のblast radius」主張を切り、belief/provenance debuggerだけで再判定する。
5. **Complete static product — 2026-09-02 20:00 JST:** persistence、no-Site-tools fallback、five tools、登録済みconstraint UIがserver／paid dependencyなしで動く。JSON import/exportは既にMVP外。遅延時は装飾polishを切り、core review pathとno-Site-tools操作は切らない。
6. **Publishable build — 2026-09-03 12:00 JST:** public repository、live HTTPS URL、fresh-profile smoke testを完了する。公開リポジトリ作成と公開はユーザーの明示許可後だけ行う。許可が得られなければsubmission blockerとして停止する。
7. **Reliability and capture — 2026-09-03 20:00 JST:** Site-tool実装直後に10–12件のnatural-language evalを実行・修正・再走し、その後fresh tab＋異なる自然文で2回連続、各2:15以内、dangerous wrong-tool 0、未承認変更0を確認する。赤ならfeature追加を停止し、tool description/schemaとデモ経路を短縮する。
8. **Submission — 2026-09-04 02:00 JST internal cutoff:** video、write-up、testing notes、credits、public URLを最終確認して提出。公式締切05:00までの3時間は障害対応専用とし、新機能を入れない。
9. **Optional only after gates 3–5 are green:** lazy semantic search。期限ゲートを1つでも圧迫するなら実装しない。

### Verdict

- `PIVOT`: accepted.
- Day 0: **GO / green**。実ランタイム前提は確定した。
- Implementation `GO`: **GO at Pause 1 (2026-08-31)**。typed constraintのcausal testは、canon-onlyでviolations `1 → 1`、belief依存2行のpreservation、wrong-layer行の`changed + violated`、定義修正後のviolations `1 → 0`を実測した。項目5以降はlocked checklistと各pauseに従う。
- `KILL / freeze`: approved-only commitをfail-closedにできない、registered constraintの因果テストが成立しない、またはverified rumor fixtureを残りのAI利用枠内で作れない場合。
