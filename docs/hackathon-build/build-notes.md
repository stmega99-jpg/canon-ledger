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
- Scale requirement corrected from “50 NPC” to verified graph invariants: depth ≥3, rejection, distortion, multiple roots, evaluated beliefs and more results than the default page can display. Expected actor count is 20–50 but will not be marketed before verification.
- Existing seed was measured independently: 354 witnessed memories, 301 heard memories, and all 655 stored memories are provenance roots. It contains no stored multi-hop chain.
- Worldcraft was confirmed as a direct competitor for canon, evidence and human approval. Differentiation is the explicit separation of objective canon, per-NPC belief, memory, rumor transmission, distortion and refusal.
- Active shaping: participant/Claude correctly separated semantic search quality from scale evidence. Existing embeddings are preserved as a Day 3 optional lazy adapter; they are not part of the core gate.
- Performance is retained as an execution budget: initial compressed critical path target ≤300 KiB, bounded DOM, bounded tool results.
- Technical correction: official OpenAI Site tools examples return ordinary JSON-compatible objects. `content[] + structuredContent` is not treated as a required WebMCP result envelope. Results use a compact `ok/code/summary/data/pageState/audit` object with total + top N + cursor/truncated.
- Conceptual correction: mutually exclusive claims and memories remain in the ledger, but the submission will not claim that two logically incompatible propositions are simultaneously objective canon. Canon and subjective belief are separate layers.
- Explicit cuts: generic natural-language contradiction discovery, engine plugins, free-layout graphs, accident-report corpus, server/DB/auth, vanity 100-NPC scale and core-path embedding work.
- Current verdict: PIVOT accepted; implementation GO remains gated on real-runtime proof and final adversarial review.
