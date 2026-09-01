# Hackathon Build Notes

## 2026-08-30 — Guided build onboarding

- Onboarding rounds completed: 3（既存会話とClaude調査メモをbrain dumpとして継承）。
- Participant is a coding beginner whose recent projects are implemented mostly by AI agents.
- Human availability is high; the binding resource is the included usage allowance of Codex and Claude plans.
- No paid credits, paid API calls, or paid services without explicit permission.
- Initial proposal was challenged after primary-source, competitor, repository, and adversarial review. Decision: `PIVOT`, not implementation `GO`.
- Target narrowed from a generic fiction world bible to a belief-state debugger and controlled canon editor for game narrative designers working with branching stories or many NPCs.
- Existing reusable substrate: 418 claims, 655 memories, per-character beliefs, immutable provenance roots, deterministic arbitration, and explicit contradiction relations from Rumor Memory Village.
- Likely demo fixture: confirm the warehouse repair as canon while preserving Gen's theft misperception and its propagated memories. Final scope still requires validation of how much NPC scale can be shown honestly.

### Active shaping moments

- Participant: 「あらゆる成果物は他人の役に立たないと意味が無い」— audience utility must remain the product test; do not optimize for speculative judge preferences.
- Participant: 「人間が管理出来ない数を管理するのがAIの良いところ」— corrected the emphasis from the approval interaction alone to large-scale rumor and per-character belief management.
- Participant suggested games as the more credible domain because this state model may be too heavy for ordinary prose writing.

### Working collaboration contract

- Codex/GPT: primary-source verification, architecture integration, implementation checkpoints, and final evidence-backed review.
- Claude: bounded adversarial reviews after the core loop and before submission; prompts should demand KILL reasons and concrete failures rather than safe generalities.
- Routine work: smallest suitable model/task context; local deterministic tests replace repeated model judgment where possible.

## 2026-08-30 — Scope completed

- Mandatory scope beats were covered through the existing brain dump, primary-source/competitor research, user reaction, time/usage-budget discussion, ambiguity sharpening and explicit scope cuts.
- Deepening rounds: 0. The participant explicitly chose writing over another round because Day 0 remains unverified and planning further would become effort-shaving.
- Final name: **Canon Ledger**.
- Final audience: game and simulation narrative developers managing branching stories, crowds or AI NPCs.
- Core value corrected: belief and rumor management at a scale humans cannot inspect manually; operation approval is the safe write boundary, not the entire product.
- Scale requirement corrected from “50 NPC” to verified graph invariants: depth ≥3, rejection, distortion, multiple roots, evaluated beliefs and more results than the default page can display. The locked fixture has 16 measured actors; no larger unverified count will be marketed.
- Existing seed was measured independently: 354 witnessed memories, 301 heard memories, and all 655 stored memories are provenance roots. It contains no stored multi-hop chain.
- Worldcraft was confirmed as a direct competitor for canon, evidence and human approval. Differentiation is the explicit separation of objective canon, per-NPC belief, memory, rumor transmission, distortion and refusal.
- Active shaping: participant/Claude correctly separated semantic search quality from scale evidence. Existing embeddings are preserved as a Day 3 optional lazy adapter; they are not part of the core gate.
- Performance is retained as an execution budget: initial compressed critical path target ≤300 KiB, bounded DOM, bounded tool results.
- Technical correction: official OpenAI Site tools examples return ordinary JSON-compatible objects. `content[] + structuredContent` is not treated as a required WebMCP result envelope. Results use a compact `ok/code/summary/data/pageState/audit` object with total + top N + cursor/truncated.
- Conceptual correction: mutually exclusive claims and memories remain in the ledger, but the submission will not claim that two logically incompatible propositions are simultaneously objective canon. Canon and subjective belief are separate layers.
- Explicit cuts: generic natural-language contradiction discovery, engine plugins, free-layout graphs, accident-report corpus, server/DB/auth, vanity 100-NPC scale and core-path embedding work.
- Current verdict: PIVOT accepted; implementation GO remains gated on real-runtime proof and final adversarial review.

## 2026-08-30 — Day 0 real-runtime gate passed

- Opened `http://127.0.0.1:8787/index.html` in the in-app browser from a `gpt-5.6-sol` session using the real runtime. `document.modelContext: true`, `devShimActive: false`, secure context true.
- All four probe tools were discovered: `ping_canon`, `size_probe`, `set_headline`, `apply_change`.
- Ordinary JSON return objects arrived intact. The runtime called each handler with two arguments; the second options object contained `requestUserInteraction`; `options.signal` was absent in this run.
- Size probe returned 1, 8, 32 and 128 KiB fillers without truncation. Received JSON sizes were 1,197 / 8,365 / 32,944 / 131,251 bytes. Product result budget remains 12 KiB plus pagination because a transport ceiling is not a UI design target.
- `set_headline` changed the visible page from `nothing set yet` to `Canon Ledger — real runtime verified`.
- `apply_change(change_id: edit-001)` returned `pending_human_review`, `applied: false`, `changed: false` while the page checkbox was clear. Codex browser automation then checked that control; the same call returned `ok`, `applied: true`, `changed: true`, and the page displayed the applied state. This proves a page-state gate but does not prove that a normal DOM control is human-exclusive.
- Compact evidence saved to `docs/hackathon-build/day0-runtime-evidence.json`. No public repository or deployment was created.
- Live Devpost key dates confirmed submissions close at `2026-09-03T20:00:00Z`, which is 2026-09-04 05:00 JST. Internal cutoff set to 02:00 JST.

## 2026-08-30 — Adversarial causal correction

- Independent adversarial review found that Claude's proposed belief-dependent quest examples would not change when only objective canon changes. If Gen's belief is intentionally preserved, a gate reading Gen's belief is also preserved; calling that a blast-radius change would be false.
- Scope corrected from a single `changed / preserved / violated` bucket to two orthogonal axes: transition (`changed / preserved`) and projected verdict (`satisfied / violated`). This preserves cases such as `changed + violated` and `preserved + violated`.
- Registered game conditions now explicitly declare whether they read objective canon or one NPC's belief. Unknown engine dependencies are out of scope and must be labeled as such.
- Warehouse demo requirement sharpened: one canon-dependent gate changes, one belief-dependent line intentionally remains, and one transparent wrong-layer fixture condition is corrected without rewriting the NPC belief.
- Competitor framing corrected. articy:draft X and Arcweave are stronger game-narrative baselines for conditions and engine workflows; Talk of the Town is prior work for NPC mental models and rumor behavior. Novelty is not “beliefs never existed,” but the shared WebMCP debugging surface and explicit page-review write boundary.

## 2026-08-30 — PRD completed

- Mandatory PRD beats were satisfied from the already detailed scope, the user's instruction to proceed without another planning loop, the real-runtime evidence, and the adversarial causal review.
- Deepening rounds: 0. Re-asking the participant would duplicate decisions already captured; unresolved behavior was decided conservatively and made testable.
- Product behavior expanded into eight epics: aggregate navigation, belief provenance, typed registered conditions, staging, fail-closed partial commit, verification/audit, no-Site-tools persistence, and bounded Site tools.
- The PRD makes the product boundary visible: it evaluates registered conditions and does not discover unknown dependencies from arbitrary game projects.
- Public repository creation and live deployment remain pending explicit user permission.
- Next guided-build step: technical specification.

## 2026-08-30 — Technical specification completed

- Completed `docs/hackathon-build/spec.md` with an explicit static architecture, domain model, file tree, five Site-tool contracts, data flows, persistence/apply protocol, tests, deployment gate and checklist handoff.
- Stack decision changed after repository audit: Vanilla DOM + strict TypeScript + Vite + Vitest, with no production dependency, server or external runtime API. The sibling project's pure TypeScript scoring/provenance tests were measured at 50/50 passing, so retaining their types/tests is safer than manually translating them to JavaScript.
- Server/database/AWS/Managed MCP/vector code is excluded. Only the prior MIT-licensed pure scorer, provenance aggregation, selected fixture characters/relationships and warehouse claims are candidates for adaptation.
- Independent causal review separated all registered conditions evaluated for context from conditions causally affected by layer-qualified writes. `canon:claim` and `belief:actor:claim` are distinct keys; canon-only projection must leave beliefs, memories and belief-dependent conditions byte/deep equal.
- Constraint evaluation is now a valid/invalid discriminated union. The four fixture conditions are `traveller_can_stay`, `gen_warns_about_theft`, `tatsu_explains_repair` and the transparent wrong-layer `warehouse_dispute` example.
- Preview and apply share one async pure planner and SHA-256 canonical digest. The final reviewed digest is created by the same store transition as the last page-UI decision, never by rendering. This binds review state to exact content/revision but does not authenticate the actor. Pending, stale, receipt-conflict, preview-mismatch, storage-failure and duplicate-apply paths all fail closed.
- Immutable provenance invalidated the earlier rewrite/delete demo operations: an approved rewrite or delete would break transfer-to-child invariants. MVP now offers only optional non-deleting `archive_memory`, which retains the record and trace while excluding it from belief scoring; the safety demo rejects it, and a separate test must prove it is independently committable.
- An earlier spec draft explored JSON import/export with display-only imported workflow history. This was removed before implementation GO; the MVP keeps only validated same-origin persistence and explicit reset.
- Provenance truth is executable: accepted/rejected transfers are distinct union types; actor/claim/source/child/wording/confidence/time links must match; transfer-time trust and support snapshots are replayed; rejected attempts never count as hops.
- Day 0 showed no usable `ontoolchange`, so all five product tools must be registered before the top-level module's first `await`; handlers await a shared initialization promise. Fresh-load discovery without reload is a release test.
- All five tools use `untrustedContentHint: true` because fixture/stored labels and memory prose can reach results. Prompt-like prose remains quoted data and cannot alter schemas, operation kinds, review decisions or commits.
- New closest-competitor correction: PlotLens already claims character-belief versus narrative-fact separation and intentional-misdirection handling. That separation alone is not novel. The defensible claim is the combined mechanism of explicit per-NPC stance, immutable multi-hop/refusal/distortion provenance, registered game-condition projection and page-owned WebMCP operation review. Failure to demonstrate all four is a KILL/re-PIVOT condition.
- Full implementation remains behind the proof-first checklist and explicit project `GO`. No public repository, deployment, paid service or paid model/API execution was authorized or performed.
- Next guided-build step: build checklist.

## 2026-08-30 — Checklist evidence and required-video correction

- Claude's review correctly found a missing mandatory artifact. The official WebMCP Challenge requires a public YouTube demo shorter than three minutes, with a clear functioning demo and audio explaining what was built and how WebMCP was used. Recording, export, public upload and signed-out playback verification are now explicit checklist work; Vimeo and TTS are not treated as event requirements.
- Live Devpost account state confirms `The WebMCP Challenge` has relationship `registered` and not `submitted`. The local state file remains planning state rather than proof of Devpost-owned registration.
- Day 0 provenance was tightened. The original probe ran from a GPT-5.6 Sol Codex session through the Codex in-app Browser WebMCP capability, not through the shim and not by directly calling a page-side `executeTool`. It was not a separate ChatGPT Work/manual-agent run, so README wording was corrected while the real-runtime gate remains green.
- A fresh Codex in-app-browser recheck discovered the four original tools, called `ping_canon`, and returned a 128 KiB filler whose length and final eight characters were observed through the agent path. The execution option shape is measured as `requestUserInteraction: function/0-arity`.
- A diagnostic fifth tool invoked `requestUserInteraction()` once. It rejected in 1 ms with `requestUserInteraction is not supported by the Codex WebMCP shim.` Official OpenAI Site tools guidance documents browser safety review for each invocation but not this callback as an application contract. Canon Ledger cannot use it as an approval channel.
- The original approval checkbox was set by Codex browser automation, not by the participant. `Event.isTrusted` and ordinary page controls cannot distinguish a person from an agent using browser-control capability. The honest boundary is therefore narrower: Site-tool inputs cannot carry or mint operation decisions; page review is visible, revision-bound and fail-closed, but it is not a cryptographic or human-exclusive authorization channel.
- Scope, PRD, spec, checklist, README and the live probe now use the route-accurate vocabulary: `createdVia` / `decidedVia`, `page-ui`, and `pending_page_review`. The historical Day 0 evidence retains the then-returned `pending_human_review` value and labels it as historical rather than rewriting measured data. A fresh reload registered all five diagnostic tools and exposed the updated result code in the real runtime tool descriptor.
- The checklist now treats minute estimates as active-work time boxes, not completion guarantees. JSON import/export is cut before implementation to protect the required video and core proof; local persistence and reset remain.

## 2026-08-31 — Checklist accepted and locked

- Participant acceptance: 「Claudeにも☑して貰ったよ」 was treated as the participant's workload approval after the requested external review. The 12-item checklist is now the locked `$build-project` contract and the scoped implementation is `GO`.
- Final ordering correction: the 10–12 prompt eval moved into the Site-tool item so description/schema failures are repaired before that item closes. Hardening retains CSP, accessibility, recovery and production-budget work; rehearsals/recording remain in the demo item.
- Publication permission moved to the item 8 pause. If granted, item 9 creates the public repository/live Pages path before completing Site tools, exposing hosting/path failures early. Target reply window is 2026-09-01 06:00 JST; final Devpost submission remains a separate confirmation targeted by 2026-09-04 01:00 JST.
- JSON world import/export and the ambiguous `human-only mode` label were removed from the MVP contracts. The supported fallback is `no-Site-tools mode` with validated same-origin persistence and reset.
- Submission framing adopted: “Canon Ledger records how a decision was made, not who made it — the same guarantee it gives every other record in the ledger.” This is decision provenance, not actor authentication.
- No repository publication, deployment, paid service, paid API/model execution, or Devpost submission was performed while locking the checklist.
- Next guided-build step: build project.

## 2026-08-31 — Build items 1–4 completed; Pause 1 is GO

- Participant replied `yes` to begin `$build-project`. Work followed the locked autonomous checklist and stopped at its first causal checkpoint. No commit, publication, deployment, paid service/API/model use, video upload, or Devpost mutation was performed.
- Item 1 replaced the root diagnostic with a semantic Vite product shell and moved the preserved five-tool instrument to `probe/index.html`. Node 24, TypeScript 5.9.3, Vite 8.1.5 and Vitest 4.1.10 are lockfile-pinned with zero production dependencies. `dist/` uses relative asset paths and includes `.nojekyll`.
- The built shell was served from `dist/` and opened in the Codex in-app Browser. It rendered the product entry with zero warning/error console entries. Unit coverage separately proves the honest `no-Site-tools` banner path without installing a shim. Production code neither calls nor depends on `requestUserInteraction`.
- Item 2 adapted only the MIT-licensed pure scorer and provenance support-count logic from Rumor Memory Village. SQL, Next, React, AWS, vector, cookie/world-fork, database and managed-MCP code remain excluded. Exact paths, source revision and the original copyright/license are in `THIRD_PARTY_NOTICES.md`.
- The in-memory evaluator receives an injected clock, exact directed relationships, active memories and contradiction groups; objective canon is not an argument. Missing relationships and malformed records fail validation rather than receiving neutral defaults. Persisted evidence is sorted and scores use the shared six-decimal canonical rounder.
- Item 3 generated and locked `warehouse-world.json` from the production evaluator, canonicalizer and validator. A Pause 2 preflight later exposed that the original fixture declared a mutual-exclusion relation without giving any actor evidence for both sides. The corrected deterministic fixture reports digest `sha256:01993846f93d744970bb970e50c5be73dcc322e740cbfc2f0ef3375402eca8f8`.

### Fixture measurements (derived, not pitch guesses)

| Measure | Value |
|---|---:|
| Incident actors / default-claim beliefs | 16 / 16 |
| Total explicit beliefs | 32 |
| Memories | 9 |
| Accepted / rejected transfers | 6 / 1 |
| Independent provenance roots | 3 |
| Maximum accepted depth | 3 |
| Visibly distorted accepted transfers | 6 |
| Initial registered violations | 1 |

- The rejected `Gen → Aya` transfer snapshots the listener-to-speaker `Aya → Gen` trust at `0.12` against threshold `0.35` and creates no memory. Transfer validation also replays sender support and decayed pre-transfer confidence, child links, wording, confidence and timestamps.
- Tatsu also receives Gen's accusation and retains his directly witnessed repair memory. Because both held claims are declared mutually exclusive and the repair evidence is stronger, `tatsu::sc-stole` is `rejected` with non-zero opposing score. Removing the relation changes that stance to `believed`; an unrelated no-evidence NPC remains `unknown`.
- Item 4 implemented typed canon/belief reads, valid/unresolved evaluation, layer-qualified causal intersection, isolated/full changes, and independent transition/verdict axes.

### Pause 1 causal evidence

| Registered condition | Initial | Canon-only projection | Final projection |
|---|---|---|---|
| `traveller_can_stay` | violated | `changed + satisfied` | `changed + satisfied` |
| `gen_warns_about_theft` | satisfied | `preserved + satisfied` | `preserved + satisfied` |
| `tatsu_explains_repair` | satisfied | `preserved + satisfied` | `preserved + satisfied` |
| `warehouse_dispute` | satisfied | `changed + violated` | `preserved + satisfied`, `definitionChanged: true` |

- Canon-only summary: evaluated 4, unresolved 0, causally affected 2, changed 2, preserved 2, violations `1 → 1`.
- Final summary after correcting `warehouse_dispute` to Gen's belief layer: violations `1 → 0`. Gen's belief, every memory/transfer/relationship, every provenance trace and both belief-dependent condition results remain deep-equal under the canon-only projection; provenance-root delta is zero.
- An independent adversarial pass found that malformed or one-sided-missing condition definitions could previously throw or disappear from projection totals. The projector now retains those rows as explicit `unresolved`; regression tests lock both cases.
- The causal proof itself was green before the 06:00 JST hard stop; the final full-suite rerun and documentation record were completed after the interrupted turn resumed.
- Final verification: `npm test` = 6 files / 25 tests passed; `npm run build` passed; `npm run fixture -- --check` passed.
- Active shaping after Pause 1: the participant's independent 25-test rerun confirmed GO and identified the stronger demo beat. Canon-only projection is not merely an intermediate failure: the counter stays at `1 → 1` while the violated condition swaps. The script now pauses there before the definition repair produces `1 → 1 → 0`.
- Publication preflight: `.devpost-hackathon-state.json` contains local project metadata and display name `S R`, but no token, credential, session ID or populated legal name. Re-check whether the display name is intended to be public before release; do not ignore the file merely to hide unreviewed state.
- Item 8 browser-control measurement: a visible Playwright-backed click on an operation review button arrived as `isTrusted=false, detail=1`. The previous `isTrusted` gate rejected the very browser-control path the spec permits without providing human authentication, so operation review now relies on the visible page-control route plus patch revision/fingerprint binding. Site-tool inputs still have no command that can mint a decision; fixture reset keeps a separate confirmation guard.

### Pause 1 verdict

**GO** for checklist item 5. The blast-radius claim is now test-backed rather than inferred: objective canon changes one canon gate, preserves belief-layer lines, exposes the intentionally wrong layer, and the definition correction removes the last violation without rewriting Gen's misconception. This does not yet claim the complete product or four-part novelty demo; patch review, persistence, UI and live Site-tool evidence remain later gates.

## 2026-08-31 — Build items 5–8 completed; Pause 2

- Item 5 implemented the exact three-operation, storage/DOM/clock-free planner. Canonical operation and patch fingerprints bind decisions to content and revision; selected/proposal/reviewed projections share the same pure application path; archive remains non-deleting and independently valid. Pending review, stale patch/operation, duplicate writes, receipt conflict, missing/falsified preview digest, all-rejected close and duplicate Apply are distinct outcomes.
- Planner adversarial fixes include null-prototype canonical objects, dense-array enforcement, exact runtime patch shapes, duplicate decision/write rejection, invalid dependency containment, current-world receipt identity, and fail-closed preflight states. The strongest KILL condition—committing from a plan that is not explicitly `ready` or `closed_noop`—is structurally rejected by the store.
- Item 6 added the single verified application envelope: validate → single-key write → byte/digest readback → in-memory swap, with rollback verification and `writes_disabled` recovery. Reload preserves a same-origin active review and final digest; rejected archive leaves `mem-stole-gen-root` and Gen's belief unchanged; the committed receipt is immutable and idempotently returned.
- Final persistence red-team found that a structurally valid but dangling `selectedIncidentId` could pass restoration and crash aggregate rendering. Restoration now rejects dangling incident/actor/claim/filter/operation references, foreign or duplicate decisions, stale patch world revisions, orphan previews, overlong query/cursor state and invalid focused panels before the UI sees them. The new regression test also proves the loader returns `invalid` so the checked-in fixture remains available.
- Item 7 added deterministic Japanese/English search, six visible filters, revision/signature-bound cursor pagination (10 default, 25 maximum), explicit zero/one/many states, bounded accepted provenance plus separate refusal branches, four constraint views and shared commands. Normal command results are test-bounded to 12 KiB.
- Item 8 built the semantic page: environment banner, measured metrics, paged belief table, canon/belief comparison, trace, registered blast radius, operation cards, page review, Apply, receipt, bounded audit, reload and confirmed fixture reset. Fixture/stored prose is inserted with constructed nodes and `textContent`; no force graph or third-party production dependency was added.
- Browser-control measurement showed a visible operation-review click arrives as `isTrusted=false, detail=1`. The earlier gate blocked the promised browser-control route without authenticating a person, so review no longer depends on `Event.isTrusted`; decisions remain exact patch-revision/fingerprint state unavailable to Site-tool inputs and are audited only as `page-ui`. Destructive fixture reset retains a separate trusted-event plus confirmation guard.

### Production-bundle proof

| Check | Visible result |
|---|---|
| Fresh `dist/` load | 16 NPC beliefs, depth 3, 3 roots, 1 refusal, 4 conditions, violations 1, revision 0 |
| Premature Apply | `pending_page_review`; world remained revision 0 |
| Canon-only preview | violations `1 → 1`; `traveller_can_stay` becomes satisfied while `warehouse_dispute` becomes violated |
| Page review | approve canon, approve condition repair, reject optional archive; 0 pending |
| Reload before Apply | active patch, all three decisions and reviewed digest restored |
| Apply | only two approved operations committed; rejected archive listed in receipt |
| Final state | violations `1 → 1 → 0`, revision 1, roots still 3 |
| Preserved belief | objective canon rejects theft while Gen still believes it from one active witnessed root memory |
| Reload after Apply | receipt, revision 1 and complete `1 → 1 → 0` causal sequence restored |
| Browser console | 0 warnings, 0 errors |

- The same visible page controls completed the entire production path without invoking a Site tool. The unavailable-Site-tools environment branch is separately unit-tested; the Codex in-app-browser used for visual proof truthfully displayed `Site tools available`.
- The initial item 8 verification was `npm test` = 11 files / 56 tests passed. The Pause 2 public-preflight correction adds exercised mutual-exclusion, direct-refusal trace, informative-first pagination, and UI-label regressions; its final suite/build/digest evidence is recorded below rather than silently overwriting the earlier checkpoint.
- Independent final adversarial review rechecked the committed-sequence UI, browser-control review route and restoration failure path after fixes, reran persistence tests, and found no remaining KILL-grade defect for Pause 2.
- No commit, public repository, deployment, public video upload, paid service/API/model use or Devpost mutation was performed. Publication remains gated on the participant's explicit named permission.

### Pause 2 verdict

**GO** for the core product. The proof is understandable from the page alone: the middle counter deliberately stays at one while the violated condition changes identity, then the reviewed condition-definition repair reaches zero without erasing Gen's false belief or its rumor provenance. Item 9 must not begin until the participant explicitly authorizes the public source repository, live deployment, release commits and public YouTube upload named in the checklist.

### Pause 2 public-preflight correction

- Independent fixture inspection found a real coverage gap: `claimRelations` was wired into the evaluator, but no actor held active evidence for both mutually exclusive claims, so every persisted `opposingScore` was zero. This was not a loader bug and the inherited rule remains `never heard ≠ rejected`.
- The fixture now gives Tatsu an accepted Gen accusation alongside his stronger witnessed repair memory. Default-theft stances are `Believed 5 · Rejected 1 · Unknown 10`; Tatsu is the evidence-backed rejection. The relation-deletion mutation changes Tatsu's theft stance, proving the declared mechanism executes.
- The existing refused transfer is truthfully `Gen → Aya`, rejected because Aya's directed trust in Gen is below threshold. Aya remains `unknown`; search and trace expose `refused (from Gen)` as a transfer outcome rather than mislabeling her stance.
- Default search ordering is evidence-bearing rows → direct incoming refusals → never-heard rows, with stable actor/claim tie-breaks. The table now renders `1 memory`, `refused (from Gen)`, and `never heard` as distinct states.
- Corrected verification: `npm test` = 11 files / 58 tests passed; `npm run fixture -- --check` reproduced `sha256:01993846f93d744970bb970e50c5be73dcc322e740cbfc2f0ef3375402eca8f8` with 16 actors, 32 beliefs, 9 memories, 6 accepted transfers, 1 refusal, 3 roots and maximum depth 3; `npm run build` passed. Built critical assets are 0.57 KiB HTML + 3.19 KiB CSS gzip + 32.92 KiB JS gzip, below the 300 KiB target.
- Fresh production-origin browser proof at `127.0.0.1:8789` showed the first page ordered Gen/Hana/Miyo/Nori/Sue/Tatsu/Aya before never-heard rows; `1 memory` rendered correctly. Aya's trace reported 0 accepted memories and the `Gen → Aya` low-trust refusal while retaining stance `unknown`. Tatsu's detail showed theft `rejected`, support `0.414`, opposing `1.138`, and the held repair claim at support `1.138`.
- The corrected bundle completed the full visible workflow again: premature Apply returned `pending_page_review` at revision 0; review state survived reload; canon/condition were approved and archive rejected; Apply committed exactly those two operations; the page showed `1 → 1 → 0`, revision 1, roots 3, and the immutable receipt survived a second reload.
- No commit, publication, deployment, paid action, video upload, or Devpost mutation was performed during this repair loop. The corrected production bundle is re-verified; Pause 2 now waits only for the participant's explicit named publication decision.

## 2026-09-01 — Publication authorized; item 9 preflight

- The participant explicitly authorized the public source repository, live deployment, release commits, and public YouTube upload. Final Devpost submission and paid use remain separate gates.
- Public-file preflight found no credentials, tokens, private keys, personal absolute paths, attachment paths, or oversized artifacts. Six screenshots used a `.png` suffix despite containing JFIF/JPEG bytes; they were renamed to `.jpg` and every checked-in reference was corrected before publication.
- Independent concurrent-command testing reproduced two core defects before the Site-tool adapter was added: simultaneous suggestions could both pass the open-patch check, and an all-rejected `closed_noop` could cause the next proposal at the same world revision to collide with its receipt. Store transitions are now FIFO-serialized, and proposal IDs use a persisted attempt suffix so receipts remain immutable without blocking a later proposal.
- Early refusal and duplicate-Apply paths previously reused the preceding audit entry. Every command attempt now records its own bounded audit entry; duplicate Apply is explicitly `effect: none`, while the original Apply remains `effect: world`.
- Pre-adapter verification: `npm test -- tests/commands.test.ts tests/store.test.ts` = 2 files / 9 tests passed; `npm run build` passed. The public GitHub identity still requires interactive CLI reauthentication before the first push.
- Item 9 added five exact, synchronously registered Site-tool descriptors, strict page-side validation, shared-ready handlers, bounded ordinary-object replies, visible render synchronization, and callable feature detection. `requestUserInteraction` is accepted only by the ambient callback type and is never read or invoked by a product handler.
- Final local verification after the adapter: `npm test` = 12 files / 74 tests passed; `npm run build` passed. The real GPT-5.6 Sol Codex in-app-browser matrix passed 12/12 with zero dangerous wrong-tool calls and zero console warnings/errors; full observations are in `item9-runtime-eval.md`.
- The real run proved fresh-load 5/5 discovery, Nori depth 3, Aya's separate low-trust refusal, inert prompt-like query text, current `1 → 1`, staged three-operation review, premature Apply refusal, open-patch refusal, final reviewed `1 → 0`, approved-only revision-1 commit, stale revision refusal, and preserved Gen belief/root.
- Public deployment remains the only incomplete item 9 acceptance line. GitHub CLI device authentication reached the account authorization screen, but GitHub kept the additional Workflow-permission button disabled; no forced click or permission bypass was attempted.

## 2026-09-01 — Item 9 public release completed

- The participant completed GitHub's device and email verification. GitHub CLI then reported the active `stmega99-jpg` account with `repo` and `workflow` scopes.
- Created the public repository at `https://github.com/stmega99-jpg/canon-ledger` and pushed the existing dated history without squash, rebase, amend or force. Release commits remain `8fd1222` (green core) followed by `1731bf9` (five verified WebMCP tools).
- The first Pages run failed only because the new repository did not yet have a Pages site. Pages was explicitly enabled with `build_type: workflow`; rerunning the same workflow then passed install, all tests, production build, Pages configuration, artifact upload and deployment.
- The live product is `https://stmega99-jpg.github.io/canon-ledger/`. An unauthenticated request returned `HTTP/1.1 200 OK` over HTTPS.
- A fresh live-origin Codex in-app Browser load discovered exactly `search_world`, `trace_claim_provenance`, `check_world_consistency`, `suggest_world_edit`, and `apply_reviewed_edit`. A real `search_world` call returned `ok`, 16 total rows and 10 bounded rows with a cursor; it changed only view state. The live browser console contained 0 warnings and 0 errors.
- Item 9 acceptance is complete. Public YouTube upload is authorized but remains gated by the item 11 release/demo proof. Paid use and final Devpost submission remain unapproved separate gates.
