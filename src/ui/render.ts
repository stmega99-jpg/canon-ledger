import { evaluateAllConstraints, projectConstraints, summarizeConstraintProjection } from "../domain/constraints.ts";
import { planReviewedPatch } from "../domain/patches.ts";
import { contradictionGroups } from "../domain/provenance.ts";
import type { ConstraintProjection, PatchOperation } from "../domain/types.ts";
import { selectActorClaimTrace } from "../selectors/provenance.ts";
import { searchBeliefs } from "../selectors/search.ts";
import type { ApplicationCommands } from "../state/commands.ts";
import type { CanonLedgerStore } from "../state/store.ts";

export type StatusTone = "neutral" | "success" | "warning" | "danger";

export interface RenderStatus {
  message: string;
  tone: StatusTone;
}

const node = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

function button(label: string, action: string, className = "button button-secondary"): HTMLButtonElement {
  const element = node("button", className, label);
  element.type = "button";
  element.dataset["action"] = action;
  return element;
}

function selectField(
  name: string,
  label: string,
  value: string | null,
  options: Array<{ value: string; label: string }>,
): HTMLLabelElement {
  const wrapper = node("label", "field");
  wrapper.append(node("span", "field-label", label));
  const select = node("select");
  select.name = name;
  for (const option of options) {
    const item = node("option", undefined, option.label);
    item.value = option.value;
    item.selected = option.value === (value ?? "");
    select.append(item);
  }
  wrapper.append(select);
  return wrapper;
}

function metric(label: string, value: string, detail: string): HTMLElement {
  const item = node("div", "metric-card");
  item.append(node("dt", undefined, label), node("dd", undefined, value), node("small", undefined, detail));
  return item;
}

function memoryCount(count: number, qualifier = ""): string {
  const noun = count === 1 ? "memory" : "memories";
  return `${count} ${qualifier}${noun}`;
}

function sectionHeading(eyebrow: string, title: string, description: string): HTMLElement {
  const header = node("header", "section-heading");
  const copy = node("div");
  copy.append(node("p", "eyebrow", eyebrow), node("h2", undefined, title), node("p", "section-copy", description));
  header.append(copy);
  return header;
}

function operationTitle(operation: PatchOperation): string {
  if (operation.kind === "resolve_canon_relation") return "Resolve objective canon";
  if (operation.kind === "replace_constraint_dependency") return "Repair the registered condition layer";
  return "Optionally archive one memory from belief scoring";
}

function conditionId(row: ConstraintProjection): string {
  return row.valid ? row.before.constraintId : row.constraintId;
}

function conditionTable(
  rows: readonly ConstraintProjection[],
  labels: Record<string, string>,
): HTMLTableElement {
  const table = node("table", "data-table condition-table");
  const caption = node("caption", "sr-only", "Registered game condition projection");
  const head = node("thead");
  const headRow = node("tr");
  for (const label of ["Registered condition", "Transition", "Before", "After", "Definition"]) {
    headRow.append(node("th", undefined, label));
  }
  head.append(headRow);
  const body = node("tbody");
  for (const row of rows) {
    const id = conditionId(row);
    const tr = node("tr");
    const name = node("th");
    name.scope = "row";
    name.append(node("strong", undefined, labels[id] ?? id), node("code", undefined, id));
    tr.append(name);
    if (row.valid) {
      tr.append(
        node("td", `state-chip transition-${row.transition}`, row.transition),
        node("td", `verdict-${row.beforeVerdict}`, row.beforeVerdict),
        node("td", `verdict-${row.afterVerdict}`, row.afterVerdict),
        node("td", undefined, row.definitionChanged ? "changed" : "preserved"),
      );
    } else {
      tr.append(
        node("td", "state-chip", "unresolved"),
        node("td", undefined, row.before.verdict),
        node("td", undefined, row.after.verdict),
        node("td", undefined, row.definitionChanged ? "changed" : "preserved"),
      );
    }
    body.append(tr);
  }
  table.append(caption, head, body);
  return table;
}

export async function renderApplication(
  root: HTMLElement,
  store: CanonLedgerStore,
  commands: ApplicationCommands,
  status: RenderStatus,
): Promise<void> {
  const state = store.getState();
  const world = state.world;
  const incident = world.incidents[state.viewState.selectedIncidentId]!;
  const aggregates = commands.aggregates();
  const search = await searchBeliefs(
    world,
    incident.id,
    state.viewState.filters,
    state.viewState.cursor,
    10,
  );
  const patch = state.stagedPatch;
  const plan = patch ? await planReviewedPatch(world, patch, state.reviewDecisions) : null;
  const receipts = Object.values(state.receipts).sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  const receipt = receipts[0];
  const showsCommittedDemo = !patch && receipt?.status === "applied"
    && receipt.appliedOperationIds.includes("resolve-warehouse-canon")
    && receipt.appliedOperationIds.includes("repair-warehouse-dispute-layer")
    && receipt.rejectedOperationIds.includes("archive-gen-root-memory");
  const currentRows = projectConstraints(world, world);
  const currentSummary = summarizeConstraintProjection(currentRows);
  const currentViolationIds = evaluateAllConstraints(world)
    .filter((evaluation) => evaluation.valid && evaluation.verdict === "violated")
    .map((evaluation) => evaluation.constraintId);
  const canonProjection = plan?.selected["resolve-warehouse-canon"] ?? null;
  const reviewedProjection = plan?.reviewed ?? null;
  const activeProjection = state.viewState.previewMode === "proposal" && plan
    ? plan.proposal
    : state.viewState.previewMode === "selected_operation" && plan && state.viewState.selectedOperationId
      ? plan.selected[state.viewState.selectedOperationId] ?? plan.proposal
      : state.viewState.previewMode === "reviewed" && reviewedProjection
        ? reviewedProjection
        : null;
  const labels = Object.fromEntries(Object.values(world.constraints).map((constraint) => [constraint.id, constraint.label]));

  const fragment = document.createDocumentFragment();
  const intro = node("section", "intro-grid");
  const introCopy = node("div");
  introCopy.append(
    node("p", "eyebrow", "Warehouse incident · deterministic fixture"),
    node("h2", "display-title", "A belief debugger for the bugs that counters hide."),
    node("p", "lede", "Change objective canon, then see which dialogue conditions and quest gates actually move—without rewriting what each NPC remembers or believes."),
  );
  const metrics = node("dl", "metric-grid");
  metrics.append(
    metric("NPC beliefs", String(aggregates.evaluatedBeliefCount), `${aggregates.actorCount} actors · default page 10`),
    metric("Rumour depth", String(aggregates.maxRumorDepth), `${aggregates.provenanceRootCount} roots · ${aggregates.rejectedTransferCount} refusal`),
    metric("Registered conditions", String(aggregates.registeredConditionCount), `${aggregates.violationCount} currently violated`),
    metric("World revision", String(world.revision), state.writeState === "enabled" ? "verified writes enabled" : "writes disabled"),
  );
  intro.append(introCopy, metrics);
  fragment.append(intro);

  const live = node("div", `action-status status-${status.tone}`, status.message);
  live.id = "action-status";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  fragment.append(live);

  if (state.writeState === "writes_disabled") {
    const recovery = node("aside", "recovery-banner");
    recovery.append(node("strong", undefined, "Writes disabled"), document.createTextNode(" A previous storage rollback could not be verified. The current ledger remains readable; reload or clear site storage before trying another write."));
    fragment.append(recovery);
  }

  const beliefsSection = node("section", "panel panel-beliefs");
  beliefsSection.id = "beliefs-panel";
  beliefsSection.append(sectionHeading(
    "1 · Belief matrix",
    "Who believes what?",
    "The table is deliberately longer than one page. Search changes this page state, whether it comes from a visible form or a Site tool.",
  ));
  const form = node("form", "filter-grid");
  form.id = "belief-filters";
  form.dataset["action"] = "search";
  const queryLabel = node("label", "field field-query");
  queryLabel.append(node("span", "field-label", "Japanese / English keyword"));
  const query = node("input");
  query.name = "query";
  query.type = "search";
  query.maxLength = 120;
  query.value = state.viewState.filters.query;
  query.placeholder = "Hana, 工具箱, warehouse dispute…";
  queryLabel.append(query);
  form.append(
    queryLabel,
    selectField("actorId", "Actor", state.viewState.filters.actorId, [
      { value: "", label: "All actors" },
      ...Object.values(world.actors).sort((a, b) => a.id.localeCompare(b.id)).map((actor) => ({ value: actor.id, label: `${actor.name.en} / ${actor.name.ja}` })),
    ]),
    selectField("claimId", "Claim", state.viewState.filters.claimId, [
      { value: "", label: "All claims" },
      ...Object.values(world.claims).sort((a, b) => a.id.localeCompare(b.id)).map((claim) => ({ value: claim.id, label: claim.canonical.en })),
    ]),
    selectField("stance", "Stance", state.viewState.filters.stance, [
      { value: "", label: "All stances" },
      ...(["believed", "doubted", "rejected", "unknown"] as const).map((value) => ({ value, label: value })),
    ]),
    selectField("sourceType", "Evidence source", state.viewState.filters.sourceType, [
      { value: "", label: "Any source" },
      { value: "witnessed", label: "Witnessed" },
      { value: "heard", label: "Heard" },
    ]),
    selectField("conditionKind", "Condition link", state.viewState.filters.conditionKind, [
      { value: "", label: "Any condition" },
      { value: "quest_gate", label: "Quest gate" },
      { value: "dialogue_condition", label: "Dialogue condition" },
    ]),
  );
  const formActions = node("div", "filter-actions");
  const submit = node("button", "button button-primary", "Search ledger");
  submit.type = "submit";
  formActions.append(submit, button("Reset filters", "reset-filters", "button button-quiet"));
  form.append(formActions);
  beliefsSection.append(form);

  const tableMeta = node("div", "table-meta");
  tableMeta.append(
    node("p", undefined, search.code === "ok" ? `${search.total} matching belief rows · showing ${search.rows.length}` : "The saved cursor is no longer valid."),
    node("p", "stance-summary", `Believed ${aggregates.stanceTotals.believed} · Doubted ${aggregates.stanceTotals.doubted} · Rejected ${aggregates.stanceTotals.rejected} · Unknown ${aggregates.stanceTotals.unknown}`),
  );
  beliefsSection.append(tableMeta);
  const beliefTable = node("table", "data-table belief-table");
  const beliefCaption = node("caption", "sr-only", "Paged NPC belief rows");
  const beliefHead = node("thead");
  const beliefHeadRow = node("tr");
  for (const label of ["Actor", "Claim", "Stance", "Evidence", "Source", "Inspect"]) beliefHeadRow.append(node("th", undefined, label));
  beliefHead.append(beliefHeadRow);
  const beliefBody = node("tbody");
  if (search.rows.length === 0) {
    const empty = node("tr");
    const cell = node("td", "empty-state", "No belief rows match these filters.");
    cell.colSpan = 6;
    empty.append(cell);
    beliefBody.append(empty);
  }
  for (const row of search.rows) {
    const tr = node("tr");
    if (row.actorId === state.viewState.selectedActorId && row.claimId === state.viewState.selectedClaimId) tr.classList.add("is-selected");
    const actorCell = node("th");
    actorCell.scope = "row";
    actorCell.append(node("strong", undefined, row.actorName.en), node("small", undefined, row.actorName.ja));
    const claimCell = node("td");
    claimCell.append(node("span", undefined, row.claimText.en), node("small", undefined, row.claimText.ja));
    const inspect = button("Trace", "trace-row", "button button-small");
    inspect.dataset["actorId"] = row.actorId;
    inspect.dataset["claimId"] = row.claimId;
    const rejectedTransfer = row.rejectedTransfers[0];
    const rejectedSender = rejectedTransfer
      ? world.actors[rejectedTransfer.fromActorId]?.name.en ?? rejectedTransfer.fromActorId
      : null;
    const evidenceLabel = row.evidenceCount > 0
      ? memoryCount(row.evidenceCount)
      : rejectedSender
        ? `refused (from ${rejectedSender})`
        : "never heard";
    const sourceLabel = row.sourceTypes.length > 0
      ? row.sourceTypes.join(" + ")
      : rejectedTransfer
        ? rejectedTransfer.reasonCode.replaceAll("_", " ")
        : "—";
    tr.append(
      actorCell,
      claimCell,
      node("td", `stance stance-${row.stance}`, row.stance),
      node("td", undefined, evidenceLabel),
      node("td", undefined, sourceLabel),
      node("td"),
    );
    tr.lastElementChild!.append(inspect);
    beliefBody.append(tr);
  }
  beliefTable.append(beliefCaption, beliefHead, beliefBody);
  beliefsSection.append(beliefTable);
  const paging = node("nav", "paging");
  paging.setAttribute("aria-label", "Belief results pages");
  if (state.viewState.cursor !== null) paging.append(button("Back to first page", "first-page", "button button-secondary"));
  if (search.nextCursor) {
    const next = button("Next page", "next-page", "button button-secondary");
    next.dataset["cursor"] = search.nextCursor;
    paging.append(next);
  }
  beliefsSection.append(paging);
  fragment.append(beliefsSection);

  const inspectionGrid = node("div", "inspection-grid");
  const detailSection = node("section", "panel");
  detailSection.id = "trace-panel";
  detailSection.append(sectionHeading("2 · Canon vs belief", "Trace the reason, not just the stance.", "Accepted rumour hops and rejected branch attempts remain different records."));
  const selectedActorId = state.viewState.selectedActorId;
  const selectedClaimId = state.viewState.selectedClaimId;
  if (selectedActorId && selectedClaimId) {
    const actor = world.actors[selectedActorId];
    const claim = world.claims[selectedClaimId];
    const belief = world.beliefs[`${selectedActorId}::${selectedClaimId}`];
    const canon = world.canon[selectedClaimId];
    const compare = node("dl", "compare-grid");
    const scoreDetail = belief
      ? `${memoryCount(belief.evidenceMemoryIds.length, "evidence ")} · support ${belief.supportScore.toFixed(3)} · opposing ${belief.opposingScore.toFixed(3)}`
      : "missing belief record";
    compare.append(
      metric("Objective canon", canon?.status ?? "missing", claim?.canonical.en ?? selectedClaimId),
      metric(`${actor?.name.en ?? selectedActorId}'s belief`, belief?.stance ?? "missing", scoreDetail),
    );
    detailSection.append(compare);
    const contradictionGroup = contradictionGroups(
      Object.values(world.claims),
      Object.values(world.claimRelations),
    ).find((group) => group.includes(selectedClaimId));
    const opposingBeliefs = (contradictionGroup ?? [])
      .filter((opposingClaimId) => opposingClaimId !== selectedClaimId)
      .map((opposingClaimId) => ({
        claim: world.claims[opposingClaimId],
        belief: world.beliefs[`${selectedActorId}::${opposingClaimId}`],
      }))
      .filter((entry) => entry.claim && entry.belief && entry.belief.evidenceMemoryIds.length > 0);
    if (belief && belief.opposingScore > 0 && opposingBeliefs.length > 0) {
      detailSection.append(node("h3", undefined, "Held opposing evidence"));
      for (const opposing of opposingBeliefs) {
        const card = node("article", "rejection-card");
        card.append(
          node("strong", undefined, opposing.claim!.canonical.en),
          node("span", `state-chip stance-${opposing.belief!.stance}`, opposing.belief!.stance),
          node("small", undefined, `${memoryCount(opposing.belief!.evidenceMemoryIds.length)} · support ${opposing.belief!.supportScore.toFixed(3)}`),
        );
        detailSection.append(card);
      }
    }
    const trace = selectActorClaimTrace(world, selectedActorId, selectedClaimId, 12);
    const traceTitle = node("h3", undefined, "Accepted memory path");
    detailSection.append(traceTitle);
    const timeline = node("ol", "trace-list");
    if (trace.acceptedHops.length === 0) timeline.append(node("li", "empty-state", "No active evidence memory is attached to this belief."));
    for (const hop of trace.acceptedHops) {
      const item = node("li", "trace-hop");
      const top = node("div", "trace-hop-heading");
      top.append(node("strong", undefined, `${hop.actorName.en} · hop ${hop.hop}`), node("span", hop.distorted ? "state-chip chip-warning" : "state-chip", hop.distorted ? "distorted" : hop.sourceType));
      item.append(top, node("p", undefined, hop.surfaceText.en), node("small", undefined, `${hop.memoryId} · confidence ${hop.confidenceAtAcq}`));
      timeline.append(item);
    }
    detailSection.append(timeline);
    const rejectionTitle = node("h3", undefined, "Rejected branch attempts");
    detailSection.append(rejectionTitle);
    if (trace.rejectedAttempts.length === 0) detailSection.append(node("p", "empty-state", "No rejection branches touch this evidence path."));
    for (const rejected of trace.rejectedAttempts) {
      const card = node("article", "rejection-card");
      card.append(node("strong", undefined, `${rejected.fromActorId} → ${rejected.toActorId}`), node("span", "state-chip chip-danger", rejected.reasonCode), node("small", undefined, rejected.transferId));
      detailSection.append(card);
    }
  } else {
    detailSection.append(node("p", "empty-state", "Choose Trace on any belief row. Gen, Hana, Sue, and Nori expose the longest useful path."));
  }
  inspectionGrid.append(detailSection);

  const conditionsSection = node("section", "panel panel-conditions");
  conditionsSection.id = "conditions-panel";
  conditionsSection.append(sectionHeading("3 · Registered blast radius", "The count can stay at one while a different thing breaks.", "Only registered quest gates and dialogue conditions are evaluated; this is not engine-wide dependency discovery."));
  const causal = node("div", "causal-sequence");
  const currentBox = node("article", "causal-step");
  currentBox.append(
    node("span", "causal-number", showsCommittedDemo ? "1" : String(currentSummary.violatedAfter)),
    node("strong", undefined, showsCommittedDemo ? "Before" : "Current"),
    node("small", undefined, showsCommittedDemo
      ? "traveller_can_stay was violated"
      : currentViolationIds.length > 0
        ? `${currentViolationIds.join(", ")} ${currentViolationIds.length === 1 ? "is" : "are"} violated`
        : "All registered conditions are satisfied"),
  );
  const canonBox = node("article", "causal-step causal-emphasis");
  canonBox.append(
    node("span", "causal-number", canonProjection ? String(canonProjection.summary.violatedAfter) : "1"),
    node("strong", undefined, "Canon-only"),
    node("small", undefined, patch || showsCommittedDemo
      ? "Same count. warehouse_dispute is now violated."
      : "Stage the proposal to reveal the swap."),
  );
  const finalBox = node("article", "causal-step");
  finalBox.append(
    node("span", "causal-number", showsCommittedDemo ? String(currentSummary.violatedAfter) : reviewedProjection ? String(reviewedProjection.summary.violatedAfter) : "—"),
    node("strong", undefined, showsCommittedDemo ? "Committed" : "Reviewed"),
    node("small", undefined, showsCommittedDemo || reviewedProjection ? "Condition definition repaired" : "Waiting for all operation decisions"),
  );
  causal.append(currentBox, node("span", "causal-arrow", "→"), canonBox, node("span", "causal-arrow", "→"), finalBox);
  conditionsSection.append(causal);
  const viewControls = node("div", "segmented-controls");
  const currentView = button("Committed", "condition-view", "button button-quiet");
  currentView.dataset["view"] = "current";
  viewControls.append(currentView);
  if (plan) {
    const proposalView = button("Whole proposal", "condition-view", "button button-quiet");
    proposalView.dataset["view"] = "proposal";
    const canonView = button("Canon operation only", "inspect-operation", "button button-quiet");
    canonView.dataset["operationId"] = "resolve-warehouse-canon";
    viewControls.append(proposalView, canonView);
    if (reviewedProjection) {
      const reviewedView = button("Final reviewed", "condition-view", "button button-quiet");
      reviewedView.dataset["view"] = "reviewed";
      viewControls.append(reviewedView);
    }
  }
  conditionsSection.append(viewControls);
  conditionsSection.append(conditionTable(activeProjection?.constraints ?? currentRows, labels));
  inspectionGrid.append(conditionsSection);
  fragment.append(inspectionGrid);

  const workflow = node("section", "panel panel-workflow");
  workflow.id = "suggestions-panel";
  workflow.append(sectionHeading("4 · Suggestions", "Stage broadly. Commit narrowly.", "A suggestion is only a page-owned review workflow. Site tools cannot create approve/reject decisions."));
  if (!patch) {
    const emptyWorkflow = node("div", "workflow-empty");
    emptyWorkflow.append(
      node("p", undefined, "Stage the scripted three-operation proposal: resolve canon, repair one condition definition, and surface an optional memory archive for rejection."),
      button("Stage demo-safe proposal", "stage-demo", "button button-primary button-large"),
    );
    workflow.append(emptyWorkflow);
  } else if (plan) {
    const workflowMeta = node("div", "workflow-meta");
    workflowMeta.append(
      node("p", undefined, `${patch.id} · revision ${patch.patchRevision} · created via ${patch.createdVia}`),
      node("strong", undefined, `${plan.pendingCount} decisions pending`),
    );
    workflow.append(workflowMeta);
    const cards = node("div", "operation-grid");
    for (const operationPlan of plan.operations) {
      const operation = patch.operations.find((candidate) => candidate.id === operationPlan.operationId)!;
      const card = node("article", `operation-card decision-${operationPlan.decision}`);
      const cardHeader = node("header");
      cardHeader.append(node("p", "eyebrow", operation.kind.replaceAll("_", " ")), node("h3", undefined, operationTitle(operation)), node("span", "state-chip", operationPlan.decision));
      card.append(cardHeader, node("p", undefined, operation.reasonCode.replaceAll("_", " ")), node("code", undefined, operation.id));
      if (operation.kind === "archive_memory") card.append(node("p", "operation-warning", "This preserves the record and provenance, but removes it from belief scoring. The scripted demo rejects it."));
      const actions = node("div", "operation-actions");
      const inspect = button("Inspect effect", "inspect-operation", "button button-quiet");
      inspect.dataset["operationId"] = operation.id;
      const approve = button("Approve", "review-operation", "button button-approve");
      approve.dataset["operationId"] = operation.id;
      approve.dataset["decision"] = "approved";
      const reject = button("Reject", "review-operation", "button button-reject");
      reject.dataset["operationId"] = operation.id;
      reject.dataset["decision"] = "rejected";
      actions.append(inspect, approve, reject);
      card.append(actions);
      cards.append(card);
    }
    workflow.append(cards);
    const applyBar = node("div", "apply-bar");
    const applyCopy = node("div");
    applyCopy.append(node("strong", undefined, plan.pendingCount === 0 ? "Final reviewed preview is bound." : "Apply is expected to refuse while decisions remain."), node("small", undefined, state.reviewedPreviewDigest ? state.reviewedPreviewDigest.slice(0, 28) + "…" : "No final digest yet"));
    applyBar.append(applyCopy, button("Apply reviewed operations", "apply-patch", "button button-primary button-large"));
    workflow.append(applyBar);
  }
  fragment.append(workflow);

  const evidenceGrid = node("div", "evidence-grid");
  const receiptPanel = node("section", "panel compact-panel");
  receiptPanel.append(sectionHeading("Receipt", "Committed proof", "Duplicate Apply returns the same immutable receipt before checking a stale base revision."));
  if (receipt) {
    const dl = node("dl", "receipt-list");
    for (const [label, value] of [
      ["Status", receipt.status],
      ["World revision", String(receipt.committedWorldRevision)],
      ["Applied", receipt.appliedOperationIds.join(", ") || "none"],
      ["Rejected", receipt.rejectedOperationIds.join(", ") || "none"],
      ["Plan digest", receipt.planDigest],
    ]) {
      dl.append(node("dt", undefined, label), node("dd", undefined, value));
    }
    receiptPanel.append(dl);
  } else receiptPanel.append(node("p", "empty-state", "No Apply receipt yet."));
  evidenceGrid.append(receiptPanel);

  const auditPanel = node("section", "panel compact-panel");
  auditPanel.append(sectionHeading("Audit", "Decision provenance", "The ledger records how a decision was made, not who made it."));
  const auditList = node("ol", "audit-list");
  for (const entry of [...state.audit].reverse().slice(0, 8)) {
    const item = node("li");
    item.append(node("strong", undefined, `${entry.action} · ${entry.code}`), node("span", "state-chip", entry.source), node("small", undefined, `r${entry.worldRevisionBefore} → r${entry.worldRevisionAfter} · ${entry.summary}`));
    auditList.append(item);
  }
  if (state.audit.length === 0) auditList.append(node("li", "empty-state", "No interactions recorded yet."));
  auditPanel.append(auditList);
  const reset = button("Reset checked-in fixture", "reset-fixture", "button button-danger");
  auditPanel.append(reset);
  evidenceGrid.append(auditPanel);
  fragment.append(evidenceGrid);

  root.replaceChildren(fragment);
}
