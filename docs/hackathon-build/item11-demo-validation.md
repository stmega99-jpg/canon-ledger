# Item 11 public rehearsal and demo-candidate validation

Date: 2026-09-01 JST

Status: both public-origin rehearsals pass. Both local narrated candidates pass
technical media validation and await the participant's audio/intelligibility
review at Pause 3. Checklist Item 11 remains open until the participant chooses
the retained take. No video has been uploaded.

## Public-origin rehearsal proof

Two fresh world-revision-0 runs used the deployed GitHub Pages build. Take A
used the normal Pages origin; Take B used the same DNS name with a trailing dot,
which is a distinct browser origin and therefore began with empty local storage.
The exact operator scripts are the two `promptSet` arrays in `demo/takes.json`.
Take B's runtime helper additionally logged each prompt inline; Take A's helper
logged tool inputs/replies but did not duplicate prompt text, so the operator
script—not `take-a/runtime.json`—is the prompt evidence for that run.

| run | public URL | prompt strategy | console |
|---|---|---|---|
| Take A | `https://stmega99-jpg.github.io/canon-ledger/?release=29f95b1` | provenance first | 0 warnings / 0 errors |
| Take B | `https://stmega99-jpg.github.io./canon-ledger/?take=b` | counterexample first | 0 warnings / 0 errors |

Both origins discovered exactly these five Site tools:

1. `search_world`
2. `trace_claim_provenance`
3. `check_world_consistency`
4. `suggest_world_edit`
5. `apply_reviewed_edit`

Both runs independently produced the same state transition:

- bounded belief search returned ordinary `ok` data;
- the accepted rumor trail reached Nori at depth 3 and retained one rejected
  branch;
- the current registered-condition count was 1 violation;
- the canon-only projection was `1 → 1`: `traveller_can_stay` became satisfied
  while `warehouse_dispute` became violated;
- an early `apply_reviewed_edit` returned `pending_page_review`, changed no
  world data, and left world revision 0;
- page controls recorded two `approved` decisions and one `rejected` decision,
  all with `via: page-ui`;
- the reviewed projection was `1 → 0`;
- final Apply committed world revision 1, applied exactly
  `resolve-warehouse-canon` and `repair-warehouse-dispute-layer`, retained
  `archive-gen-root-memory` as rejected, and ended with zero registered
  violations.

The complete inputs and ordinary-object replies are stored in
`demo/take-a/runtime.json` and `demo/take-b/runtime.json`. Frames 02–08 beside
each file are exact captures from that run. The shared clean overview at frame
01 comes from Take B's clean public-origin start: Take A's first overview capture
was discarded because it retained the wrong scroll position. The opening frame
contains no run-specific tool result.

## Narrated candidates

Both videos are continuous 1280 × 720 WebM files rendered from the exact public
rehearsal frames. English narration was generated locally with Windows SAPI;
no paid API, external TTS account, or production service was used.

| candidate | voice | duration | bytes | video tracks | audio tracks | browser console |
|---|---|---:|---:|---:|---:|---:|
| Take A — provenance first | Microsoft Zira Desktop | 126.734603 s (2:06.73) | 24,027,133 | 1 | 1 | 0 |
| Take B — counterexample first | Microsoft David Desktop | 125.929659 s (2:05.93) | 24,330,348 | 1 | 1 | 0 |

Chrome read finite duration metadata for both files with `readyState: 4`. Both
are below the locked 2:15 rehearsal limit and the 2:30 retained-take limit.
Generated WAV and WebM files remain local and are ignored by Git; the narration,
frame mapping, renderer, validator, public frames, and runtime proof are checked
in. `fix-webm-duration` 1.0.6 is a build-only MIT dependency and is not present
in the production bundle.

After adding the renderer source and build-only dependency, all 74 tests passed,
the production TypeScript/Vite build passed with the same 41.28 KiB compressed
critical path, and `npm audit --audit-level=moderate` reported 0 vulnerabilities.

## Public-claim traceability

| spoken/visible claim | evidence |
|---|---|
| five Site tools | both live tool discoveries; Item 9/10 public validation |
| Nori believes the theft claim | each take's `search_world` reply and search frame |
| Gen → Hana → Sue → Nori, depth 3, plus refused branch | each `trace_claim_provenance` reply and provenance frame |
| only four registered conditions are evaluated | each current consistency reply and frame |
| the total stays 1 while the violated condition changes | selected-operation consistency reply and `05-canon-only-one-to-one.jpg` |
| early Apply commits nothing | `pending_page_review`, audit `changed: false`, revision 0 |
| two approvals and one rejection | each `pageDecisions` array and review frame |
| reviewed result reaches zero | reviewed consistency reply |
| only reviewed operations commit | final receipt's applied/rejected operation IDs |
| Gen's belief and root memory remain | `tests/commands.test.ts`, `tests/store.test.ts`, and the rejected archive ID in the final receipt |

The narration says “registered conditions only” and makes no engine-wide
consistency claim. It describes `page-ui` decision provenance, not human
identity or authentication.

## Pause 3 recommendation

Provisionally retain **Take A**, subject to the participant's audio review. It
establishes the product's differentiator—stored rumor
provenance, distortion, and refusal—before the `1 → 1` counterexample, so the
canon/belief split is already understood when the surprising condition swap
appears. Take B is a valid shorter alternate.

Public YouTube upload remains blocked until the participant watches/listens to
the local candidate and explicitly selects it at Pause 3.
