# Canon Ledger

A world bible that answers questions. The world is held as **propositions** — who
knows what, who told whom, what contradicts what — so an agent can traverse it,
and contradiction detection is *computation in the page*, not model output.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/) (submission
period 2026-08-25 → 2026-09-03). Everything in this repository was written during
the submission period. Seed content is imported from a prior MIT-licensed project
by the same author and is documented as such where it appears.

---

## Status: Day 0 — WebMCP probe

`index.html` is a diagnostic instrument, not the product. It registers three
tools and records exactly what the agent runtime does with them, so the real API
surface is measured rather than assumed.

| tool | annotation | what it tests |
|---|---|---|
| `ping_canon` | `readOnlyHint: true` | discovery, argument passing, return shape |
| `set_headline` | write | agent mutation is visible to the person in the same tab |
| `apply_change` | write | **the human gate**: unapproved, it refuses and returns `pending_human_review` |

`apply_change` is the load-bearing bet of the whole project in its smallest form.
The agent may call it. The page declines to act until a person has decided, and
says so in the tool's own return value.

### Running it

Any static server. The API requires a secure context, which `127.0.0.1` and
`https://` both satisfy.

```bash
python -m http.server 8787 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8787/index.html`.

- **ChatGPT in-app browser** — supports WebMCP out of the box, but only on
  **GPT-5.6 Sol or Terra**. GPT-5.6 Luna has WebMCP disabled and will find no
  tools. Enterprise and Edu workspaces are not supported.
- **Chrome 149+** — enable `chrome://flags/#enable-webmcp-testing`. Chrome 148
  and earlier do not expose the API at all.
- **Any other browser** — the page degrades to human-only mode and says so.

`?mock=1` installs a small dev shim implementing the WebMCP IDL so the
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
