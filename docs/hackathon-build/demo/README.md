# Item 11 demo rehearsals

Two public-origin rehearsals were run on 2026-09-01 JST. Take A used the normal
GitHub Pages origin at a clean world revision 0; Take B used the same public
Pages host with a trailing DNS dot, which the browser treats as a separate
origin and therefore began with empty local storage. Both discovered the same
five WebMCP tools.

Each `runtime.json` records the real tool inputs and ordinary-object replies.
Both runs returned `ok` for search, provenance trace, current/selected/reviewed
condition checks, suggestion, and final Apply. Premature Apply returned
`pending_page_review` at revision 0. Page controls then recorded two approvals
and one rejection; final Apply committed revision 1 with zero registered
violations and 0 browser warnings/errors.

`takes.json` contains two distinct prompt sets, narrated segment scripts, and
their frame mapping. Audio and local WebM candidates are generated from these
checked-in records. They are rehearsal artifacts only: no video is uploaded
before the checklist's Pause 3.

The locally technically validated candidates are:

- **Take A — provenance first:** 2:06.73, 1280 × 720, one VP9 video track and
  one Opus audio track, Microsoft Zira Desktop narration.
- **Take B — counterexample first:** 2:05.93, 1280 × 720, one VP9 video track
  and one Opus audio track, Microsoft David Desktop narration.

Take A is the provisional Pause 3 recommendation because the stored rumor path
explains the canon/belief split before the `1 → 1` condition swap. Track,
duration, dimension, and console validation has passed; the participant still
needs to confirm narration intelligibility. Exact validation and public-claim
traceability are recorded in `../item11-demo-validation.md`.

Generate local media with `npm run demo:audio` and
`npm run demo:video -- take-a|take-b`. Generated WAV and WebM files are ignored
by Git; the public frames, runtime replies, narration configuration, renderer,
and validator remain reproducible source evidence.
