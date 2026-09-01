# Item 10 release validation — 2026-09-01 JST

This record covers the hardened production artifact and its authorized public
deployment at commit `29f95b14835e511f37223694fb22474616347cc0`.

## Locked data and automated checks

- `npm test`: **74/74 tests passed across 12 files**.
- `npm run fixture -- --check`: digest
  `sha256:01993846f93d744970bb970e50c5be73dcc322e740cbfc2f0ef3375402eca8f8`;
  16 actors, 32 beliefs, 9 memories, 6 accepted transfers, 1 refused
  transfer, 3 provenance roots, accepted depth 3, and 1 initial registered
  violation.
- `npm audit --audit-level=moderate`: **0 vulnerabilities**.
- `npm run build`: production HTML, CSS, and JavaScript built successfully.

## Security and accessibility hardening

- The document uses a meta CSP with `default-src 'none'`; scripts, styles,
  fonts, and connections are restricted to self; images are self/data only;
  objects, bases, and forms are disabled. `referrer` is `no-referrer`.
- Stored/fixture strings continue to enter the page through `textContent`.
- Tables expose scoped column headers. Trace, inspect, approve, and reject
  controls have operation-specific accessible names and pressed state.
- Full-root renders restore a control's stable focus identity. When a trigger
  disappears, focus moves to the relevant labelled panel instead of the body.
- The writes-disabled recovery message is an alert; reset still requires a
  trusted click plus the browser confirmation and a confirmed store command.
- The favicon is self-hosted, so the release artifact produces no missing-icon
  warning under the restrictive CSP.

## Native-keyboard production smoke

After `npm run build` and `npm run preview`, this command drove a fresh Chrome
profile through the production bundle using native CDP Tab, Enter, and text
input events after page load:

```bash
npm run test:keyboard -- http://127.0.0.1:8801/
```

It searched for Nori, opened the provenance trace, staged three operations,
proved early Apply returned `pending_page_review` at world revision 0,
approved canon and condition repair, rejected memory archive, and committed at
revision 1. Focus restoration passed for trace, the disappearing staging
button, and all three decisions. The slower fresh-profile first-render sample
was **205.6 ms**, and Chrome reported **0 errors or warnings**.

## Production budgets

Measured on the development machine against a fresh production origin:

| Budget | Measured | Limit | Result |
|---|---:|---:|---|
| Compressed critical path | 0.73 + 3.24 + 37.31 = **41.28 KiB** | 300 KiB | pass |
| Fresh in-app-browser first render | **79.4 ms** | 500 ms | pass |
| Slower fresh-profile headless first render | **205.6 ms** | 500 ms | pass |
| Largest representative command render | **19.1 ms** | 100 ms | pass |
| Largest 25-row search reply | **10,544 bytes** | 12,288 bytes | pass |

The representative real WebMCP run returned `ok` for search, trace, current
consistency, suggestion, and selected-operation preview. Premature Apply
returned `pending_page_review`. Internal command-render samples were 1.5–19.1
ms, and the browser console contained no warning or error. The automated tool
suite separately exercises every normal reply shape against the same 12 KiB
budget.

## Visual records

- [Fresh production ledger](screenshots/item10-fresh-ledger.png)
- [Reviewed two-operation commit](screenshots/item10-reviewed-commit.png)

The final screenshot visibly records revision 1, zero registered violations,
the two applied operation IDs, the rejected archive operation, and the bounded
decision audit.

## Release materials checked

- `README.md` describes the exact five-tool surface and links the public source,
  live product, scope, PRD, specification, checklist, and Day 0 evidence.
- `LICENSE` is MIT and `THIRD_PARTY_NOTICES.md` carries the adapted project's
  full MIT notice and source-revision boundary.
- The public release remains static and local-first, with no API key, account,
  analytics, cookie, database, or paid runtime dependency.

## Public-origin verification

- GitHub Actions run `33488956528` passed tests, production build, Pages
  artifact upload, and deployment for commit `29f95b1`.
- An unauthenticated request returned HTTP 200 for both the product and its
  self-hosted favicon.
- A cache-busted fresh public tab discovered exactly the five release tools.
  A real `search_world` call returned `ok`, updated the visible page, and its
  serialized reply was 1,214 bytes.
- The deployed CSP and `no-referrer` policy were present. The public browser
  console contained 0 warnings and 0 errors.
- The cold public in-app-browser load recorded 616.8 ms including remote
  delivery. This is retained as context, not substituted for the checklist's
  development-machine first-render budget; post-load command rendering was
  1.6 ms in the same public check.
