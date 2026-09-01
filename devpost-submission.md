# Title

Canon Ledger

## One-line Summary

**A WebMCP belief-state debugger for narrative games: trace stored rumor hops, preview registered dialogue and quest conditions, and review each staged canon operation in the live page.**

Alternative, more descriptive version:

> Debug what every NPC believes—and what will break—before an AI-assisted canon edit commits.

## Draft Status

This is a truthful working draft, not final submission copy yet.

- Implemented and verified now: deterministic belief/provenance core, registered-condition projection, operation-level page review, fail-closed partial commit, verified `localStorage` persistence, complete page-only workflow, five product Site tools, a 12/12 real-runtime eval, public HTTPS deployment, and the test suite.
- Still required before final submission: release-candidate hardening, a fresh supported judge-path rehearsal, and the public YouTube demo.
- Six local screenshot candidates have been captured from the verified item-8 build. Refresh them only if the release UI materially changes after item 9.
- Nothing has been sent to Devpost. The public repository and live URL are verified below; the video URL remains pending.

## Problem

Changing one fact in a branching game can affect two very different kinds of state. A canon-dependent quest gate may need to change immediately, while an NPC's dialogue must remain unchanged because that character still believes an old rumor.

As casts and rumor chains grow, this becomes hard to audit in raw JSON or an undifferentiated graph. A single “violations” counter can also hide the most dangerous case: the number stays the same while one problem is fixed and a different condition silently breaks. Asking an unconstrained model to “make the story consistent” creates another risk—it may erase an intentional lie, misconception, or piece of dramatic irony.

The target user is a narrative developer or technical narrative designer working on branching games, social simulations, crowds of NPCs, or AI-NPC systems. Canon Ledger does not claim to discover every dependency in an arbitrary engine project.

## Solution

Canon Ledger separates five things that ordinary story-state views often collapse:

1. objective canon;
2. each NPC's stored memories;
3. each NPC's current belief stance;
4. immutable rumor provenance, including distortion and refused transmission;
5. explicitly registered dialogue conditions and quest gates, typed by whether they read canon or one character's belief.

The page begins with a paged belief matrix and measured incident summary. A developer can inspect why a character believes a claim, see who told whom, distinguish `never heard` from a refused rumor, and compare supporting with opposing evidence. A staged canon change is projected across registered conditions on two independent axes: `changed / preserved` and `satisfied / violated`.

Edits are proposed as separate operations. Review decisions are recorded in the page and bound to the exact patch revision and operation fingerprint. Apply consumes those existing decisions; it does not accept approval as a tool argument. This is route/state integrity, not proof that a page-control actor is human.

## Why This Matters

Canon Ledger turns a vague continuity problem into named, inspectable state. Its warehouse demo exposes the failure mode that a single counter hides:

- initially, one registered condition is violated;
- confirming repair as canon fixes `traveller_can_stay`, but `warehouse_dispute` becomes the new violation—the count remains `1 → 1`;
- a separately reviewed condition-definition repair reaches `1 → 1 → 0`;
- Gen's incorrect theft belief and its provenance remain intact;
- the optional memory-archive operation is rejected and does not commit.

The distinctive claim is not merely “fact versus belief.” It is the combined mechanism: explicit per-NPC stance, immutable multi-hop/refusal/distortion provenance, typed projection of registered canon-versus-belief game conditions, and operation-level WebMCP staging whose commit boundary remains in the shared page.

## Official Project Description Draft

The event asks the text description to cover four points. These are description requirements, not four separate custom-answer fields in the current Devpost form.

### Why this use case is a strong fit for WebMCP

NPC belief debugging combines a semantic question with a deterministic answer. A developer wants to ask, “Why does Hana believe Tatsu stole the toolbox?” or “If repair becomes canon, which registered gates change and which character-specific lines must remain?” An agent is well suited to choosing the relevant search, trace, consistency, or staging action. The page—not the model—remains responsible for belief scoring, provenance links, condition evaluation, review state, and commit validity.

WebMCP makes that collaboration visible. Tool calls move the same filters, table, trace, condition projection, and Suggestions panel the developer sees, instead of returning a detached chat summary. The agent can cross structured state and bring the page to the evidence; the developer can inspect the result and record operation-level decisions in context.

### How it creates a better user experience

Canon Ledger replaces a giant graph or raw-state dump with an aggregate-first workflow:

- canon and NPC belief are shown side by side;
- informative evidence rows appear before `never heard` rows;
- Tatsu's evidence-backed rejection is distinct from Aya's refused incoming rumor;
- provenance is shown one bounded path at a time;
- registered game conditions show both transition and verdict;
- provisional, finally reviewed, and committed projections have different labels.

The key visual is `1 → 1 → 0`. At the middle step the counter does not move, but the named violated condition changes. That makes a silent regression legible before commit.

### What people and agents can do together that was difficult before

The agent can filter the belief matrix from natural language, trace a multi-hop rumor to its roots, surface distortion and low-trust refusal, evaluate only the game conditions registered in the loaded world, and stage a versioned operation-level edit proposal.

The reviewer can inspect each operation on the same page, approve the intended canon and condition changes, reject optional memory archival, and see the final reviewed projection. A premature Apply returns `pending_page_review` and changes no world data. Once every operation has a current decision, Apply commits exactly the approved operations and produces a verifiable receipt.

Canon Ledger records how a decision was made, not who made it—the same kind of provenance guarantee it gives every other ledger record. A browser-capable agent may operate an ordinary page control, so the project does not claim human authentication.

### Briefly explain how WebMCP is implemented

**Verified release surface — 2026-09-01.**

The release surface contains exactly five narrow Site tools:

- `search_world`
- `trace_claim_provenance`
- `check_world_consistency`
- `suggest_world_edit`
- `apply_reviewed_edit`

Their descriptors are registered synchronously before the module's first `await`; thin handlers then await the shared store initialization and call the same application commands used by visible page controls. Read-only calls can move view state but not world or review state. Suggestion can stage a page-derived patch but cannot approve or commit it. Apply accepts only a patch ID and revision and reads review decisions already held by the page.

Inputs use closed JSON Schemas and are validated again in page code. Normal results use ordinary JSON objects, bounded rows, totals, cursors, explicit authority, and audit metadata. The target for normal replies is 12 KiB. The application is static Vanilla TypeScript with zero production package dependencies or runtime network/API calls; deterministic scoring, projection, planning, and persistence do not invoke a model. The production JavaScript bundle with all five adapters is 36.66 KiB gzip.

## How We Used AI

### In the product

The supported ChatGPT/Codex agent acts as a natural-language client for the page's five scoped WebMCP tools. It chooses a bounded action and summarizes structured results. It does not calculate beliefs, invent provenance, discover unregistered engine dependencies, decide creative intent, create review decisions, or bypass a stale/pending patch. Those guarantees are enforced by deterministic TypeScript in the page.

### During the build

- **OpenAI Codex / GPT:** consolidated the scope, PRD, technical specification, implementation checklist, TypeScript implementation, deterministic tests, browser-runtime probes, production UI verification, and final integration.
- **Claude:** acted as a deliberately adversarial reviewer. Its most valuable finding was that the fixture declared mutual exclusion but did not exercise it; the repair added two-sided evidence for Tatsu plus a mutation-kill test.
- **Google Antigravity:** produced an initial judge-oriented copy draft. It was treated as untrusted editorial input: unsupported claims, premature product-tool claims, incorrect tool names, and judge-target headings were rejected before this draft was written.

No model API is called by the production application's deterministic calculation path.

## How We Used Codex

The participant supplied the product direction, target audience, cost boundaries, and all irreversible publication decisions. Codex translated that direction into durable local specifications, implemented the app, ran the fixture generator and test suite, controlled the in-app browser for visible end-to-end checks, and incorporated independent adversarial feedback.

The build process was proof-first rather than code-first:

1. measure the prior dataset and reject unsupported scale claims;
2. prove the WebMCP runtime behavior with a preserved diagnostic probe;
3. prove canon-versus-belief causality before polishing UI;
4. implement fail-closed patch planning and verified persistence;
5. inspect the production bundle and repair gaps found by independent review.

One concrete iteration captures the process well: an external review found that every stored `opposingScore` was zero. Codex traced this to an under-exercised fixture rather than missing evaluator wiring, preserved the rule `never heard ≠ rejected`, added a real Gen-to-Tatsu accusation memory, and wrote a test proving that deleting the mutual-exclusion relation changes Tatsu's stance.

## Key Features

- Explicit per-NPC `unknown`, `doubted`, `believed`, and `rejected` stance model. The current demo exercises believed/rejected/unknown; it does not claim to demonstrate all four.
- Bounded multi-hop rumor traces with immutable roots, wording/confidence distortion, and refused transfers.
- Clear separation between an evidence-backed rejected belief and an incoming rumor that was refused and created no memory.
- Typed registered quest/dialogue dependencies on canon or one NPC's belief.
- Two-axis before/after projection: `changed / preserved` and `satisfied / violated`.
- Versioned operation fingerprints, page-recorded review decisions, final reviewed digest, partial commit, immutable receipt, and idempotent duplicate Apply.
- Verified single-key local persistence with readback, rollback handling, reload restoration, and explicit fixture reset.
- Complete visible UI workflow when Site tools are unavailable.
- Five scoped WebMCP product tools with strict page-side validation and shared UI/tool commands.

## Architecture

Canon Ledger is a static, local-first Vanilla TypeScript application:

```text
checked-in fixture / validated local state
                  |
                  v
      deterministic domain core
     belief + provenance + constraints
                  |
                  v
         one application store
       /          |           \
      v           v            v
 page selectors  patch planner  verified persistence
       \          |            /
        +---- shared commands -+
                  |
          page UI + Site tools
```

The model is a client of the application, not a hidden source of truth. Canon, beliefs, registered-condition results, patch authority, and commit success are all computed and validated locally.

## Current Proof Snapshot

- 16 incident actors
- 32 explicit beliefs
- 9 memories
- 6 accepted rumor transfers and 1 refused transfer
- 3 independent provenance roots
- maximum accepted depth 3
- default theft matrix: Believed 5 / Rejected 1 / Unknown 10
- 4 registered game conditions
- visible causal sequence: `1 → 1 → 0`
- 12 test files / 74 passing tests
- deterministic fixture digest: `sha256:01993846f93d744970bb970e50c5be73dcc322e740cbfc2f0ef3375402eca8f8`
- production JavaScript: 36.66 KiB gzip with all five Site-tool adapters

These numbers describe the checked-in demo fixture, not an untested claim of engine-wide or thousand-NPC scale.

## Testing Instructions

### Automated

Requires Node 24.x.

```bash
npm install
npm test
npm run fixture -- --check
npm run build
```

Expected current result: 11 test files / 58 tests pass, fixture bytes reproduce the digest above, and the production build succeeds.

### Current page-only workflow

```bash
npm run dev
```

Open `http://127.0.0.1:8787/`, then:

1. Confirm the fresh summary shows 16 NPC beliefs, depth 3, 3 roots, 1 refusal, 4 registered conditions, 1 violation, and revision 0.
2. Inspect Tatsu's theft row: `rejected`, one heard memory, support about 0.414, opposing about 1.138, with the repair claim shown as held opposing evidence.
3. Inspect Aya's theft row: `unknown`, `refused (from Gen)`, `low trust`.
4. Stage the demo-safe proposal.
5. Press Apply while decisions remain pending; expect `pending_page_review` and revision 0.
6. Approve the canon and condition operations; reject optional memory archival.
7. Confirm the reviewed sequence is `1 → 1 → 0`, then Apply.
8. Confirm revision 1, two applied operation IDs, one rejected operation ID, Gen's belief preserved, and the receipt survives reload.

### Release WebMCP workflow — item 9 verified

The complete 12/12 production matrix ran against a fresh local production origin. The public HTTPS origin separately passed fresh 5/5 discovery plus a real `search_world` smoke test; the continuous public demo rehearsal remains item 11.

1. Open the public HTTPS URL in a supported ChatGPT in-app Browser with Sol/Terra, or supported Chrome with WebMCP enabled.
2. Confirm exactly the five product tools above are discovered.
3. Run the saved 12-prompt natural-language eval matrix.
4. Complete two fresh-state demo runs with different phrasing and zero dangerous wrong-tool calls or unapproved mutations.

## Public Demo Link

https://stmega99-jpg.github.io/canon-ledger/

## Public Repository Link

https://github.com/stmega99-jpg/canon-ledger

The public repository contains MIT `LICENSE`, `THIRD_PARTY_NOTICES.md`, source, tests, fixture generator, run instructions, and preserved runtime evidence. Credential, private-key, personal-path, attachment-path, and oversized-file scans were clean immediately before publication.

## Demo Video

`[TODO — no public YouTube URL yet]`

Target duration: 2:15, leaving margin under the official three-minute limit.

1. **0:00–0:15:** Ask the real question: “If repair becomes canon, which gate changes—and which NPC line must remain because the rumor survives?”
2. **0:15–0:35:** Use `search_world`; show the live page move to the relevant belief rows.
3. **0:35–0:55:** Use `trace_claim_provenance`; show a depth-three chain, distortion, and the refused Gen-to-Aya attempt.
4. **0:55–1:15:** Use `check_world_consistency`; introduce the registered-only boundary and the two axes.
5. **1:15–1:35:** Use `suggest_world_edit`; show canon-only `1 → 1` and name the swapped violation.
6. **1:35–1:50:** Attempt Apply early; show `pending_page_review`. Record two approvals and one rejection through visible page controls.
7. **1:50–2:10:** Use `apply_reviewed_edit`; show `1 → 1 → 0`, revision +1, approved-only receipt, Gen belief preserved, roots unchanged.
8. **2:10–2:15:** “Canon Ledger debugs what every NPC believes without flattening the story they disagree about.”

## Screenshot Shot List

- [x] Fresh aggregate-first page showing 16 beliefs, depth 3, roots 3, refusal 1, and the informative first 10 rows — [`01-fresh-overview-belief-matrix.jpg`](docs/submission-assets/01-fresh-overview-belief-matrix.jpg).
- [x] Tatsu detail showing `rejected`, support/opposing scores, held repair evidence, and rumor path — [`02-tatsu-rejected-belief-trace-wide.jpg`](docs/submission-assets/02-tatsu-rejected-belief-trace-wide.jpg).
- [x] Aya row/detail showing `unknown` separately from `refused (from Gen)` — [`02-aya-refused-not-rejected.jpg`](docs/submission-assets/02-aya-refused-not-rejected.jpg).
- [x] Canon-only projection at `1 → 1`, with `traveller_can_stay` fixed and `warehouse_dispute` newly violated, alongside three pending operations — [`03-staged-one-to-one-review.jpg`](docs/submission-assets/03-staged-one-to-one-review.jpg).
- [x] Final reviewed preview showing two approvals, one rejection, zero pending decisions, and `1 → 1 → 0` — [`04-final-reviewed-preview.jpg`](docs/submission-assets/04-final-reviewed-preview.jpg).
- [x] Approved-only commit receipt and decision-provenance audit at revision 1 — [`05-approved-only-commit-receipt.jpg`](docs/submission-assets/05-approved-only-commit-receipt.jpg).

These images document the verified local page workflow. The production Site-tool adapter and public-origin check are recorded separately in `docs/hackathon-build/item9-runtime-eval.md`; these screenshots do not replace the remaining fresh judge-path rehearsal.

## Submission Readiness Notes

- Received source draft: `pasted-text.txt` from the conversation attachment. It was used as editorial input only; the source attachment was not copied into the repository. Its usable ideas were rewritten into this file, while unsupported “paste-ready,” judge-targeting, scale, identity, and completed-WebMCP claims were rejected.
- Devpost authentication: verified on 2026-08-31.
- Registration for The WebMCP Challenge: verified (`registered`, submissions open) on 2026-08-31.
- Official deadline: 2026-09-03 20:00 UTC / 2026-09-04 05:00 JST.
- Official deliverables: accessible live URL, text description, public YouTube demo under three minutes with audio, and public licensed source repository.
- Current technical core: GREEN through guided-build item 9 and public-origin verification.
- Local screenshot packet: captured in `docs/submission-assets/` from a clean revision-0 origin through reviewed revision 1.
- Blocking release work: item-10 hardening/measurement, fresh judge-path rehearsal, public video, final form fields, and final readiness review.
- Devpost submission remains a separate explicit confirmation even after publication permission.

## Known Limitations

- One compact, deterministic warehouse fixture; not a general scale benchmark.
- Evaluates only conditions explicitly registered in the loaded world; it does not discover dependencies in engine code.
- No Unity, Unreal, Godot, Twine, Ink, articy:draft, or Arcweave integration.
- Keyword/structured search only; semantic search is outside the MVP.
- Same-origin `localStorage`, not authenticated server storage or collaboration.
- Page review is revision/fingerprint-bound route state, not actor identity or cryptographic authorization against browser automation or DevTools.
- The current fixture demonstrates believed, rejected, and unknown; `doubted` is supported but has a count of zero.
- The production tools were verified in the Codex in-app Browser; a fresh ChatGPT in-app Browser or WebMCP-enabled Chrome rehearsal remains before final submission.

## TODO Official Form Fields

Official fields fetched from Devpost on 2026-08-31:

### 28249 — Submitter Type (required)

`[USER CONFIRM — likely Individual]`

### 28250 — Country of residence (required)

`[USER CONFIRM — do not infer; Japan is available as an option]`

### 28251 — Organization name (optional)

`[Leave blank unless submitting for an organization]`

### 28252 — App Status (required)

Recommended: `New`.

Canon Ledger itself was created during the submission period. It adapts and attributes a limited deterministic scoring/provenance core and seed content from the author's earlier MIT-licensed Rumor Memory Village project.

### 28253 — If Existing, explain updates (optional)

`[Not applicable if App Status = New. If Devpost requires Existing, describe the new Canon Ledger UI, typed registered-condition model, patch/review/apply state machine, WebMCP surface, tests, and deployment created during the event.]`

### 28254 — Live URL (required)

https://stmega99-jpg.github.io/canon-ledger/

### 28255 — Testing instructions (optional, judges only)

Use the concise release steps from **Testing Instructions**. No credentials are expected.

### 28256 — Public code repository (required)

https://github.com/stmega99-jpg/canon-ledger

### 28257 — Agents/clients tested (required)

Current truthful answer:

> The diagnostic probe and the production five-tool product were tested through the real `document.modelContext` path in the Codex Desktop in-app Browser with GPT-5.6 Sol (`devShimActive: false`). The public HTTPS origin discovered all five production tools, and the saved 12-prompt matrix passed with zero dangerous wrong-tool calls or console errors. A fresh ChatGPT in-app Browser or WebMCP-enabled Chrome rehearsal remains before final submission and is not claimed as complete.

### 28258 — AI tools leveraged (required)

Draft answer:

> OpenAI Codex/GPT was used for product planning, implementation, deterministic tests, browser runtime verification, and integration. Claude was used as an independent adversarial design and QA reviewer. Google Antigravity produced an early judge-oriented prose draft that was fact-checked and substantially rewritten. In the product, a supported ChatGPT/Codex agent is the natural-language client for five narrow WebMCP tools; deterministic TypeScript in the page—not the model—computes beliefs, provenance, registered-condition projections, and commit validity.

### 28259 — Learning level (required)

Recommended: `Significant`. `[USER CONFIRM]`

Evidence: the participant began with very little implementation experience and used the project to learn proof-first scoping, WebMCP runtime constraints, typed state boundaries, deterministic testing, adversarial review, and truthful claim control.

### 28260 — Reusable career AI value (required)

Recommended: `Yes`. `[USER CONFIRM]`

The reusable value is a workflow: use AI for implementation and cross-state inspection, keep deterministic domain logic and irreversible decisions outside model authority, and require evidence-backed release claims.

No Codex session ID is requested by the current official form.
