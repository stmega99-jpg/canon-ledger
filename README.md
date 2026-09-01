# Canon Ledger

A WebMCP belief-state debugger and reviewed canon editor for game narrative
developers. It keeps objective canon separate from NPC memory and belief, traces
who told whom, evaluates explicitly registered dialogue/quest conditions, and
lets an agent stage changes whose exact revision must receive complete,
page-recorded review decisions before it can be applied.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/) (submission
period 2026-08-25 → 2026-09-03). Everything in this repository was written during
the submission period. Seed content is imported from a prior MIT-licensed project
by the same author; copied/adapted code and its complete MIT notice are recorded
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Try it

| | |
|---|---|
| **Live app** | <https://stmega99-jpg.github.io/canon-ledger/> |
| **Demo video** (2:07) | <https://youtu.be/D2XQ0LoTmzM> |
| **Devpost entry** | <https://devpost.com/software/canon-ledger> |

Open the live app in ChatGPT's in-app browser on **GPT-5.6 Sol or Terra**, or in
Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. In any other browser
the product stays complete without Site tools, and says so on the page.

## The proof, in one line

Confirm "Tatsu repaired the sluice gate" as objective canon, and the violation
count goes `1 → 1`. Nothing looks like it moved — but a different condition
broke. `traveller_can_stay` was repaired, and the wrong-layer `warehouse_dispute`
started failing. Correcting that condition's dependency takes it to `0`.

**That is the bug a counter hides**, and it is why the projection reports
`changed / preserved` and `satisfied / violated` on separate axes instead of a
single number.

Through all of it Gen still believes the theft, Tatsu still rejects it on his own
evidence, Aya's refused rumour stays refused, and every provenance root is
unchanged. Canon moved; nobody's memory was rewritten.

## What is verified

The locked warehouse fixture measures 16 actors, 32 explicit beliefs, 9 memories,
6 accepted transfers, 1 refused transfer, 3 independent provenance roots, and
maximum accepted depth 3. Its default theft matrix is
`Believed 5 · Rejected 1 · Unknown 10`: Tatsu's rejection is produced by held
evidence for *both* mutually exclusive claims, and a test asserts that removing
the mutual-exclusion relation flips that stance back to `believed`. Aya's refused
incoming rumour stays a transfer outcome and never becomes a belief.

The release suite is 74/74 green. The compressed critical path is 41.28 KiB, the
slower fresh local Chrome render was 205.6 ms, and a 25-row tool reply was
10,544 bytes against a 12 KiB budget. The public origin returns HTTP 200 without
credentials, exposes exactly the five product Site tools on a fresh load, and
produces zero browser warnings or errors. Evidence:
[release validation](docs/hackathon-build/item10-release-validation.md),
[demo validation](docs/hackathon-build/item11-demo-validation.md),
[build notes](docs/hackathon-build/build-notes.md).

## What this does not claim

- **Only registered conditions are evaluated.** This is not engine-wide
  dependency discovery; it cannot find a condition you never declared.
- **The review gate is a route-and-state boundary, not an identity check.** An
  agent with browser control can operate an ordinary page control. The audit
  records `decidedVia: page-ui` — how a decision was made, not who made it. That
  is the same guarantee this ledger gives every other record it holds.
- **One fixture ships.** Nothing here claims arbitrary worlds or thousands of NPCs.

The [scope](docs/hackathon-build/scope.md), [PRD](docs/hackathon-build/prd.md),
[technical specification](docs/hackathon-build/spec.md), and
[build checklist](docs/hackathon-build/checklist.md) record how it was built and
every gate it had to pass.

The production surface is exactly `search_world`, `trace_claim_provenance`,
`check_world_consistency`, `suggest_world_edit`, and `apply_reviewed_edit`.

[`probe/index.html`](probe/index.html) is the preserved diagnostic instrument;
the root `index.html` is now the product shell. The probe registers five
tools and records exactly what the agent runtime does with them, so the real API
surface is measured rather than assumed.

| tool | annotation | what it tests |
|---|---|---|
| `ping_canon` | `readOnlyHint: true` | discovery, argument passing, return shape |
| `size_probe` | `readOnlyHint: true` | **how large a tool result the runtime will carry** — ask for 1, 8, 32, 128 KiB |
| `set_headline` | write | agent mutation is visible to the person in the same tab |
| `apply_change` | write | **the page-review gate**: while the page has no decision, it refuses and returns `pending_page_review` |
| `interaction_probe` | `readOnlyHint: true` | measures the undocumented `requestUserInteraction` option without treating it as authority |

Tools return an ordinary JSON object, matching the shape the site-tools
documentation shows (`execute: async () => ({ title: document.title })`) rather
than an MCP `content[]` envelope:

```json
{ "ok": false, "code": "pending_page_review",
  "summary": "change \"edit-001\" is waiting for a decision ...",
  "data": { "change_id": "edit-001", "applied": false, "awaitingDecisions": 1 },
  "audit": { "invocationId": "inv-2", "changed": false } }
```

`apply_change` is the load-bearing bet of the whole project in its smallest form.
Site-tool input cannot carry or mint a review decision. The page declines to act
until its current patch revision has a complete decision set, and says so in the
tool's own return value. This proves a route/state boundary, not that the actor
operating an ordinary page control was necessarily a person.

### Real-runtime result — 2026-08-30

The probe passed from a GPT-5.6 Sol Codex session through the Codex in-app
Browser's WebMCP tool surface, with the real `document.modelContext`
(`devShimActive: false`). It was not a shim or a direct page-side
`executeTool` call; it was also not a separate ChatGPT Work/manual-agent run:

- all four original tools were discovered and returned ordinary JSON objects;
- 1, 8, 32, and 128 KiB synthetic results arrived without truncation; a later
  in-app-browser recheck observed the complete 128 KiB result tail in the agent
  path;
- `set_headline` changed the visible page state;
- `apply_change` returned the then-current code `pending_human_review` and
  changed nothing while the checkbox was clear;
- after Codex browser automation checked the approval box, the same change
  applied and became visible in the page. This proves the page-state gate, not
  that an ordinary DOM control can distinguish a person from an agent with
  browser-control capability.

The compact evidence record, including the runtime calling convention, is in
[`docs/hackathon-build/day0-runtime-evidence.json`](docs/hackathon-build/day0-runtime-evidence.json).
The 128 KiB success is a measured ceiling lower bound, not permission to return
unbounded data; product tools retain a 12 KiB soft budget and pagination.
The runtime also supplied a zero-argument `requestUserInteraction` function,
but invoking it in the measured Codex path rejected immediately as unsupported;
the product does not depend on it. The current probe registers the fifth,
read-only `interaction_probe` tool solely to preserve that measurement.

### Running the product

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8787/`. The production build is `npm run build`; its
asset paths are relative so the output can be served from a subpath.

To reproduce the production keyboard smoke, run `npm run build`, start
`npm run preview` in another terminal, then run:

```bash
npm run test:keyboard -- http://127.0.0.1:8801/
```

### Running the preserved probe

Any static server. The API requires a secure context, which `127.0.0.1` and
`https://` both satisfy.

```bash
python -m http.server 8787 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8787/probe/index.html`.

- **ChatGPT in-app browser** — supports WebMCP out of the box, but only on
  **GPT-5.6 Sol or Terra**. GPT-5.6 Luna has WebMCP disabled and will find no
  tools. Enterprise and Edu workspaces are not supported.
- **Chrome 149+** — enable `chrome://flags/#enable-webmcp-testing`. Chrome 148
  and earlier do not expose the API at all.
- **Any other browser** — the page remains complete in no-Site-tools mode and says so.

`probe/index.html?mock=1` installs a small dev shim implementing the WebMCP IDL so the
registration and execute paths can be exercised without the flag. It never
installs when a real implementation is present. Results produced under the shim
are **not** evidence about a real agent runtime, and the page labels them
`devShimActive: true`.

### Reading the results

The page shows the environment, the tool definitions as `getTools()` returns
them, and a log of every call with the runtime's own calling convention
(argument count, whether `options.signal` was supplied). **Copy diagnostics
JSON** puts the whole record on the clipboard.

---

## API notes measured so far

Taken from the [specification](https://webmachinelearning.github.io/webmcp/):

```webidl
partial interface Document {
  [SecureContext, SameObject] readonly attribute ModelContext modelContext;
};

interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional object inputObject = {}, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
};
```

- It is `document.modelContext`. `navigator.modelContext` is not in the
  specification; some published tutorials still show it, so the page detects
  both and reports which one it found.
- `executeTool` resolves to a **string**, so structured returns reach the agent
  serialised.
- `inputSchema` is not enforced on the agent path. The page validates its own
  inputs.
- Tools must be registered in the **top-level** document. Tools registered
  inside an iframe are not discovered.

## Licence

MIT. See [LICENSE](LICENSE).
