# Product Requirements Document

## Product Summary

Canon Ledger is a belief-state debugger and controlled canon editor for game and simulation narrative developers.

It helps a developer answer three questions before committing a story-state change:

1. What does each relevant NPC currently believe, and why?
2. Which registered dialogue conditions and quest gates would change, remain active, or violate their declared expectation?
3. Which proposed edits have complete review decisions for this exact patch revision?

The product keeps objective canon separate from subjective character belief. Confirming that the traveller repaired the warehouse may open a canon-dependent gate while Gen's theft accusation remains active because Gen still believes it. That disagreement is valid story state, not bad data to erase.

The honest product promise is narrow:

> For a world and game-condition set already registered in Canon Ledger, an agent can cross NPC beliefs and rumor provenance, project a canon edit, and stage a reviewable patch; only operations approved in the page's current review state can commit.

This is a Site-tool-to-commit route/state boundary, not proof of human identity. Site-tool arguments cannot create review decisions, but a browser-capable agent may still operate ordinary visible page controls.

> **Canon Ledger records how a decision was made, not who made it — the same guarantee it gives every other record in the ledger.**

Canon Ledger does not discover unknown conditions inside an arbitrary game project, prove a whole game safe, or replace an engine integration.

## Target User

### Primary user

A narrative developer or technical narrative designer working on a branching game, social simulation, crowd of NPCs, or AI-NPC system where different characters can hold different accounts of the same event.

They need to change story truth without accidentally flattening rumors, lies, outdated knowledge, or dramatic irony. They are comfortable reading named quest gates and dialogue conditions, but they should not need to inspect raw graph data to understand the result.

### Job to be done

> When I confirm or revise an event in canon, show me which registered game conditions are affected and why, preserve character-specific misconceptions that are still intentional, and let me commit only the operations I reviewed.

### Explicitly not the primary user

- General-purpose novelists looking only for a prose story bible.
- Teams needing a production-ready Unity, Unreal, or Godot plugin.
- Users expecting natural-language discovery of every hidden dependency in an unregistered codebase.
- Users expecting a model to decide canon or creative intent on their behalf.

## Product Language And Truth Boundaries

The interface uses the following terms consistently:

- **Claim:** a normalized proposition, such as “the traveller stole from the warehouse.” Competing claims may coexist in the ledger.
- **Canon status:** whether a claim is objectively `confirmed`, `rejected`, or `unresolved` in this world.
- **Memory:** one NPC's stored instance of a claim, including source, time, wording, and confidence.
- **Belief:** one NPC's current stance toward a claim and the evidence used to reach it.
- **Provenance:** the immutable source root and ordered rumor hops, including rejection or wording/confidence changes.
- **Game constraint:** a registered dialogue condition or quest gate with a named dependency and a declared expected result.

Every game constraint has two labels that must never be collapsed into one:

1. **Transition:** `changed` when its result differs before and after the proposal, otherwise `preserved`.
2. **Verdict:** `satisfied` when the projected result matches the registered expectation, otherwise `violated`.

This preserves four distinct cases:

- `changed + satisfied`: an intended gate changed correctly.
- `changed + violated`: a proposed change would break a registered expectation.
- `preserved + satisfied`: an intentional condition remained valid, such as Gen's accusation line.
- `preserved + violated`: the proposal did not create the problem, but an existing registered inconsistency remains.

“Evaluated” means every valid registered condition shown for the incident. “Causally affected” is narrower: the condition reads a layer-qualified state key written by the proposed operations, or its own registered dependency is edited. `canon:claim` and `belief:actor:claim` are different keys even when they mention the same claim. Neither term automatically means “broken.”

## Core User Journey

1. The developer opens the static app and immediately sees the warehouse incident summary: evaluated NPCs, belief distribution, maximum rumor depth, independent provenance roots, registered game constraints, and unresolved decisions.
2. If Site tools are available, the page says the agent can act on the same visible state. Otherwise it clearly says “no-Site-tools mode” without hiding any product function.
3. The developer asks the agent to inspect the warehouse dispute. The agent searches the registered world, and the visible table, filters, selected claim, and constraint panel move to the same result.
4. The developer or agent opens one NPC's theft belief and traces it to the source. The trace shows at least three hops and makes a rejection or distortion legible.
5. The developer asks to confirm repair as canon while retaining character misconceptions. A proposal appears without changing the ledger.
6. The proposal previews registered game conditions on two axes: `changed / preserved` and `satisfied / violated`. It shows that a canon-dependent gate can change while a belief-dependent line stays active.
7. If a quest condition reads the wrong layer—for example global canon even though the quest should continue while Gen believes the accusation—the proposal stages a named constraint correction as its own operation.
8. The Suggestions panel lists every operation separately. The developer approves the canon confirmation and valid constraint correction, but rejects the optional operation that would archive an intentional NPC memory from belief scoring while retaining its provenance record.
9. An apply attempt with pending decisions changes nothing and points back to the unresolved review. Once all operations have a current page decision, only approved operations commit.
10. The page re-evaluates the same registered constraints and shows that the committed result matches the preview, violations are resolved, subjective beliefs remain, and provenance roots did not change.
11. The audit trail and local state survive reload. The same journey can be completed entirely through the visible UI.

## Epics And User Stories

### Epic 1: Understand The World At A Glance

#### Story 1.1 — See meaningful scale on first open

As a narrative developer, I want the first screen to summarize the active incident so that I know whether the tool is managing more state than I can comfortably inspect row by row.

Acceptance criteria:

- The initial view names the warehouse incident and shows the evaluated NPC total.
- It shows a belief distribution whose category counts add up to the evaluated NPC total.
- It shows maximum provenance depth, accepted and rejected rumor-hop totals, and independent provenance-root count.
- It shows the number of registered dialogue conditions and quest gates.
- It shows unresolved canon decisions separately from subjective disagreements.
- The screen does not call 655 memories “655 beliefs” or imply that provenance roots are rumor hops.
- A paged list says “showing X of Y”; the first 10 rows are never presented as the whole result.
- The default page ranks rows with held evidence first, then refused incoming transfers, then records that were never heard; alphabetical order is only the stable tie-breaker inside those groups.
- No force-directed graph or all-memory dump is required to understand the summary.

#### Story 1.2 — Filter the same state by hand or through the agent

As a narrative developer, I want page controls and agent searches to produce the same visible selection so that the agent is collaborating in my workspace rather than answering in a detached chat.

Acceptance criteria:

- A human can filter by actor, claim, stance, source type, and registered-condition kind from the page.
- `search_world` applies the requested filter to the visible page and returns the same active filter and selected IDs.
- After an agent search, the active filter remains visible and can be cleared by the person.
- Selecting a summary count filters the table to the records represented by that count.
- A zero-result search shows `0 results`, the active filters, and a clear-filter action; it does not show a blank panel that resembles an error.
- When more results exist than are displayed, the page and tool result both expose total count and a next-page affordance.
- The tool result remains bounded; a search never returns every memory merely because the page can page through them.

### Epic 2: Explain Why An NPC Believes Something

#### Story 2.1 — Trace a rumor to its source

As a narrative developer, I want to inspect the provenance of one NPC belief so that I can tell whether it came from witnessing, hearsay, distortion, or a rejected transfer.

Acceptance criteria:

- The trace panel identifies the selected NPC and claim at the top.
- Each accepted hop shows sender, recipient, sequence, source root, and the wording/confidence carried forward.
- A depth-three-or-greater chain can be followed in order without opening raw JSON.
- A distortion displays the relevant before/after wording or confidence; the interface does not imply that a new semantic claim was invented unless the claim ID actually changed.
- A rejected transfer shows sender, intended recipient, rejection reason, and the point where propagation stopped.
- A refused incoming transfer remains inspectable even when it created no accepted memory. It is labeled as a transfer outcome, not as proof that the recipient's belief stance is `rejected`.
- Separate provenance roots remain separate and are never merged merely because their surface wording is similar.
- Re-opening the same trace at the same world revision returns the same ordered evidence.
- If no accepted chain exists, the page says whether the record is a root, was rejected, or has no registered provenance; it does not invent missing hops.

#### Story 2.2 — Compare objective canon with character belief

As a narrative developer, I want canon status and NPC stance side by side so that I can recognize intentional disagreement without treating it as corrupted data.

Acceptance criteria:

- The selected claim shows its canon status independently from each NPC stance.
- After repair is confirmed, Gen may still show `believed` for theft and that combination is presented as intentional disagreement, not an application error.
- The page distinguishes `unknown`, `rejected`, `doubted`, and `believed`; absence of evidence is not displayed as rejection.
- At least one actor holds active evidence for both claims in the fixture's mutual-exclusion relation, so arbitration produces a non-zero opposing score and changes a persisted stance. Removing that relation must change the result in a mutation test.
- For that actor, the detail panel shows the held opposing claim and both support/opposing scores; the rejection is not presented as an unexplained label.
- The page never states that mutually exclusive claims are simultaneously objective truth.

### Epic 3: Inspect Registered Dialogue And Quest Conditions

#### Story 3.1 — Know what layer each condition reads

As a technical narrative designer, I want every registered condition to say whether it reads objective canon or one NPC's belief so that wrong-layer dependencies are visible.

Acceptance criteria:

- Every condition row shows its human-readable name, kind (`dialogue condition` or `quest gate`), dependency type, target, required value, current result, and registered expectation.
- A canon-dependent condition names a claim and required canon status; it does not require an NPC.
- A belief-dependent condition names an NPC, claim, and required stance.
- The MVP does not allow one condition to ambiguously claim both dependency types.
- The warehouse fixture includes at least one canon-dependent gate and at least one belief-dependent dialogue or quest condition.
- The following ideas are visible under readable labels rather than opaque IDs alone:
  - `traveller_can_stay` depends on repair being confirmed in canon.
  - `gen_warns_about_theft` depends on Gen believing the theft claim.
  - `tatsu_explains_repair` depends on Tatsu believing the repair claim.
- The panel heading says how many **registered** conditions were evaluated.

#### Story 3.2 — Be told the boundary of the check

As a developer, I want the product to state what it did not inspect so that I do not mistake a prototype result for whole-game safety.

Acceptance criteria:

- The constraint panel states that only conditions registered in the loaded world are evaluated.
- A world with zero conditions says `No registered game conditions`; it never says `No problems found`.
- The interface does not use “all contradictions detected,” “game is safe,” or equivalent language.
- If a condition refers to a missing actor or claim, it is shown as invalid/unresolved rather than satisfied or violated.
- Re-evaluating the same world revision yields the same condition results and totals.

#### Story 3.3 — Preview causal impact before commit

As a narrative developer, I want to compare game conditions before and after a staged canon edit so that I can distinguish intended changes from broken expectations.

Acceptance criteria:

- Preview does not change the current ledger revision, canon, memory, belief, or provenance.
- Each evaluated condition shows `Before`, `After`, transition, and verdict; the UI separately marks whether it is causally affected.
- `changed / preserved` and `satisfied / violated` are displayed as separate fields and separate aggregate counts.
- A canon-only operation cannot change a belief-dependent condition unless a separate belief or condition operation is staged.
- The preview separately shows projected belief changes, memory archival, and provenance-root changes; these are not hidden inside “affected conditions.”
- At least one fixture gate is `changed + satisfied` when repair becomes confirmed.
- At least one Gen- or Tatsu-belief condition is `preserved + satisfied` when canon changes but their belief remains.
- The fixture contains one deliberately wrong-layer quest dependency whose canon-only projection is `changed + violated`; a separate proposed condition operation can make the final preview `satisfied` without rewriting the NPC belief.
- The UI identifies that example as a registered fixture problem, not a condition discovered from a real engine project.

### Epic 4: Stage Changes Without Mutating The Ledger

#### Story 4.1 — Receive an operation-level proposal

As a narrative developer, I want an agent proposal broken into reviewable operations so that I can accept a canon decision without accepting optional memory cleanup.

Acceptance criteria:

- A proposal opens the Suggestions panel but leaves all committed data unchanged.
- The panel shows a patch ID, base revision, creation time, and the proposal summary.
- Every operation has a stable ID, category, target name, before/after values, reason, and relevant evidence link.
- Canon confirmation, game-condition correction, and optional memory archival appear as separate operations when proposed.
- Each operation begins as `pending` and can be approved or rejected independently.
- Rejecting memory archival does not prevent approval of the canon operation or an independent condition correction.
- Reviewing an operation does not itself change the ledger revision.
- The projected condition panel updates to reflect current approve/reject decisions while remaining explicitly a preview.

#### Story 4.2 — Keep review decisions page-owned

As a reviewer, I want my decisions to be tied to the exact patch revision so that an agent cannot reuse approval for a different operation.

Acceptance criteria:

- Approval is visibly associated with one operation ID and one patch revision.
- A tool argument cannot mark an operation approved or replace a page-stored decision.
- If the proposal changes after review, previous approval is no longer accepted for the changed operation.
- The page shows which decisions are pending before apply is allowed.
- Rejecting optional memory archival is a normal successful review outcome, not an error.

### Epic 5: Commit Only Reviewed Operations

#### Story 5.1 — Fail closed while any decision is pending

As a reviewer, I want premature apply to do nothing so that an agent cannot treat silence as approval.

Acceptance criteria:

- If any operation remains pending, apply commits zero operations.
- The result code is `pending_page_review` and includes the unresolved count and a route back to the Suggestions panel.
- The ledger revision, canon status, beliefs, memories, game constraints, aggregates, and audit state are unchanged by the refused attempt except for a non-mutating attempt record.
- Repeating premature apply remains non-mutating.

#### Story 5.2 — Partially commit a fully reviewed patch

As a reviewer, I want approved operations to commit and rejected operations to remain unapplied so that intentional misconceptions survive a valid canon change.

Acceptance criteria:

- Apply is eligible only after every operation is either approved or rejected.
- Exactly the approved operations commit; rejected operations are listed as skipped.
- A successful commit advances the world revision exactly once.
- The audit view names the applied, rejected, and invalidated operation IDs.
- Gen's theft memory and its accepted provenance remain byte-for-byte equivalent when its archival operation was rejected.
- The committed condition results match the final approved preview.
- Applying the same completed patch again does not repeat mutations and explains that the patch is already applied.

#### Story 5.3 — Refuse stale or invalid edits without losing the review

As a reviewer, I want stale operations isolated and explained so that one broken reference does not silently corrupt the rest of my proposal.

Acceptance criteria:

- A base-revision mismatch commits nothing and returns `stale_patch` with a re-proposal action.
- A committed-world revision mismatch takes precedence and returns `stale_patch` for the whole patch. `stale_operation` is reserved for a same-base malformed/persisted target or an internal operation conflict.
- An approved `stale_operation` remains visible and blocks that apply attempt; it is never silently skipped. The person can reject it or request a new proposal without losing independent review decisions.
- Independent reviewed operations remain visible in the patch; they are not silently discarded.
- Invalid inputs return `invalid_input` with field-specific reasons and make no product-state change.
- The previous review decisions remain available in the audit record even when re-proposal is required.

### Epic 6: Verify The Outcome

#### Story 6.1 — Compare committed state with the preview

As a narrative developer, I want an immediate recheck after commit so that I can prove what changed and what was intentionally preserved.

Acceptance criteria:

- The same registered condition set is re-evaluated automatically after commit.
- The screen separately shows evaluated and causally affected totals, plus transition and verdict totals with readable condition names.
- The warehouse demo shows violations reduced from one to zero after the approved condition correction.
- It shows at least one intended canon-dependent transition and at least one preserved belief-dependent condition.
- It shows subjective memories preserved, optional archival rejected, and provenance roots changed by zero.
- It shows unresolved canon decisions reduced by one, but that small number is supporting evidence rather than the main visual metric.
- If committed values differ from the approved preview, the page shows a verification failure instead of declaring success.

#### Story 6.2 — Inspect an audit trail

As a developer, I want a concise history of the review and commit so that I can explain the result in a demo or debugging session.

Acceptance criteria:

- Each proposal, review decision, refused apply, successful apply, and recheck has a visible timestamp and stable identifier.
- Audit entries distinguish read-only inspection from state-changing actions.
- The history records whether the action came through page UI, a Site tool, or the system without claiming that route identifies the actor.
- The user can copy a bounded audit summary without including giant payloads by default.

### Epic 7: Remain A Complete Page Without Site Tools

#### Story 7.1 — Use every core workflow without Site tools

As a developer opening the project in an ordinary browser, I want the same workflow available through visible controls so that lack of WebMCP does not make the demo page useless.

Acceptance criteria:

- When `document.modelContext` is absent, a no-Site-tools banner appears.
- Search, filtering, trace, constraint check, proposal creation, operation review, apply, and recheck remain available.
- Site-tool absence does not remove data or disable essential controls.
- Given the same starting revision and decisions, the page-only path and agent-assisted path produce the same committed ledger result.
- The normal page does not require a chat sidebar to explain its primary state.

#### Story 7.2 — Survive reload and reset safely

As a developer, I want my local review state to survive reload and reset explicitly so that the prototype behaves like a tool rather than a one-shot animation.

Acceptance criteria:

- Reload restores the committed world revision, current staged patch, review decisions, filters, and audit log.
- Resetting the demo requires an explicit action and returns to the known fixture revision.
- Invalid or incompatible same-origin stored data is rejected without partially replacing the active fixture.
- Same-origin `localStorage` reload may restore the active workflow; JSON import/export is explicitly outside the MVP.

### Epic 8: Make Agent Actions Bounded And Legible

#### Story 8.1 — Discover only five purposeful tools

As an agent user, I want a small tool surface with distinct roles so that natural-language requests do not cause dangerous tool confusion.

Acceptance criteria:

- The page exposes exactly the five scoped tools: search, provenance trace, registered consistency check, edit suggestion, and reviewed apply.
- Read-only tools are marked read-only; proposal and apply are not.
- Search and trace cannot mutate committed world data.
- Suggestion cannot commit.
- Apply cannot create a new proposal or manufacture approval.
- Every result uses a consistent success/failure code, concise summary, bounded data, page-state cue, and audit metadata.
- Large result sets return the top items, total count, and continuation information rather than silent truncation.
- The normal soft target is 12 KiB per tool result even though the real runtime carried the 128 KiB probe without loss.

#### Story 8.2 — Handle agent/user races visibly

As a person sharing the page with an agent, I want conflicts explained so that a delayed tool call does not overwrite a newer page review decision.

Acceptance criteria:

- If the user changes the world revision while an agent is preparing a proposal, the proposal is marked stale before apply.
- If the user changes only a view filter, the committed data is unaffected and the latest active filter remains visible.
- A failed or refused tool call leaves a readable message in the page; the person does not need the model transcript to know what happened.
- An invalid tool input never clears the current page selection or review state.

## Warehouse Demo Fixture Requirements

The submission demo uses one intentionally compact warehouse incident. It is not presented as a general benchmark.

The fixture must contain:

- a theft claim and repair claim with an explicit mutual-exclusion relation;
- at least one NPC with active evidence for both sides of that relation, while an NPC with no evidence remains `unknown` rather than being treated as a rejection;
- at least one canon decision that begins unresolved;
- a rumor chain with depth at least three;
- at least one accepted transmission, one trust-based rejection, one visible wording/confidence distortion, and at least two independent roots;
- evaluated beliefs for every NPC shown in the incident aggregates;
- enough connected NPCs to require paging, while only five named characters carry the spoken demo;
- a canon-dependent `traveller_can_stay` gate that becomes active when repair is confirmed;
- a belief-dependent `gen_warns_about_theft` line that remains active while Gen believes theft;
- a belief-dependent Tatsu repair line that remains active;
- one deliberately wrong-layer `warehouse_dispute` quest condition that would turn off under the canon-only proposal despite a registered expectation that it remain active while the accusation persists;
- a proposed operation that corrects that quest dependency without rewriting Gen's belief;
- one optional, non-deleting memory-archival operation that the reviewer can reject; archival excludes a memory from belief scoring but never deletes its provenance record.

The expected counts are recorded in fixture tests and copied exactly into demo captions only after the fixture exists. Until then, submission prose says “verified fixture” rather than claiming a particular NPC count.

## Edge Cases

The product must explicitly handle the following:

- No search matches.
- One match versus more matches than a page can display.
- A root memory with no rumor hops.
- A rejected transfer that created no recipient memory.
- Two independent roots carrying similar claims.
- A registered condition with a missing actor, claim, or expectation.
- A world with no registered game conditions.
- A proposal with all operations still pending.
- A proposal with a mix of approved, rejected, and stale operations.
- A duplicate apply request.
- A page reload during review.
- Malformed or wrong-version same-origin stored data.
- A browser without Site tools.
- A delayed agent call against an older world revision.
- A bounded tool response where more matches exist than were returned.

## What We Are Building

- One polished warehouse-incident dashboard and review workflow.
- A verified multi-hop rumor fixture with rejection, distortion, multiple roots, and evaluated beliefs.
- Aggregate-first navigation and a readable paged table.
- One bounded provenance trace at a time.
- Registered, typed canon- and belief-dependent dialogue/quest conditions.
- Two-axis before/after projection for those registered conditions.
- Operation-level stage, approve/reject, fail-closed apply, partial commit, audit, and deterministic recheck.
- Five narrow Site tools that move the same visible page.
- A complete no-Site-tools path with local persistence and reset.
- A static live HTTPS build and public repository after the user explicitly authorizes publication.

## What We Would Add With More Time

- Lazy semantic search using the already computed embeddings.
- Adapters for articy:draft, Arcweave, Unity, Unreal, or Godot exports.
- Discovery of unregistered game-code dependencies.
- Compound conditions that intentionally combine multiple canon and belief predicates.
- A second scenario or domain.
- Larger verified fixtures and performance characterization beyond the submission fixture.
- Collaborative accounts, server persistence, and production access control.
- Natural-language discovery of previously undeclared contradictions or temporal rules.

## Demo And Submission Acceptance

### Two-minute-fifteen-second path

- **0:00–0:15:** show scale and the problem: a canon fact can flip a gate while a character-specific accusation should remain.
- **0:15–0:35:** natural-language search moves the page to the warehouse incident.
- **0:35–0:55:** trace one depth-three rumor and show a rejection or distortion.
- **0:55–1:15:** stage repair confirmation and show the two-axis registered-condition preview.
- **1:15–1:35:** demonstrate premature apply refusal, then approve valid operations and reject optional memory archival.
- **1:35–1:50:** commit approved operations only.
- **1:50–2:10:** show named condition impact, violation reduction, preserved beliefs/memories, and unchanged provenance roots.
- **2:10–2:15:** “Canon Ledger debugs what every NPC believes without flattening the story they disagree about.”

### Submission-ready proof

- The full path succeeds twice consecutively from a fresh tab with two different natural-language phrasings.
- Each run finishes in 2:15 or less.
- There are zero dangerous wrong-tool calls and zero unapproved mutations.
- The visible aggregate and condition counts match the verified fixture expectations.
- No-Site-tools mode completes the same final ledger state.
- The live HTTPS URL opens in a fresh profile without local setup.
- The public repository contains license, attribution, run instructions, test instructions, and the Day 0 runtime evidence.
- The submission states that game constraints are registered, not auto-discovered.
- The submission cites belief-model precedents honestly and positions the novelty as the shared WebMCP debugger plus explicit page-review boundary, without claiming human authentication.

## Release And Stop Conditions

- Official deadline: 2026-09-04 05:00 JST. Internal submission cutoff: 02:00 JST.
- A core release cannot omit fail-closed review, typed constraint projection, verified rumor provenance, or no-Site-tools operation.
- JSON import/export, semantic search, and a second sample are outside the MVP; visual polish is removed before any core safety behavior is weakened.
- If the causal fixture cannot produce both an intended canon-dependent transition and an intentionally preserved belief-dependent condition by 2026-09-01 23:00 JST, remove the game-condition blast-radius claim and reframe the project as a belief/provenance debugger before continuing.
- If publication permission is not available in time to create a public repository and live URL, stop and report a submission blocker; do not publish implicitly.
