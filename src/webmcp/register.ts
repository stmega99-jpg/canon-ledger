import type { ApplicationCommands, CommandReply, SearchCommandInput } from "../state/commands.ts";
import {
  TOOL_DEFINITIONS,
  validateToolInput,
  type ApplyReviewedEditInput,
  type CheckWorldConsistencyInput,
  type SearchWorldInput,
  type SuggestWorldEditInput,
  type ToolName,
  type TraceClaimProvenanceInput,
} from "./contracts.ts";

export interface ToolReply<T> {
  ok: boolean;
  code: string;
  summary: string;
  data: T;
  pageState: {
    worldRevision: number;
    focusedPanel: string;
    selectedActorId?: string;
    selectedClaimId?: string;
    patchId?: string;
  };
  audit: {
    invocationId: string;
    changed: boolean;
    effect: "none" | "view" | "workflow" | "world";
  };
}

export interface ToolRuntime {
  commands: ApplicationCommands;
  presentToolResult(reply: ToolReply<unknown>): Promise<void>;
}

export interface RegistrationFailure {
  name: string;
  message: string;
}

export interface RegistrationReport {
  registered: string[];
  failures: RegistrationFailure[];
}

export interface RegistrationHandle {
  names: readonly string[];
  completion: Promise<RegistrationReport>;
}

let fallbackSequence = 0;

function fallbackInvocationId(prefix: string): string {
  fallbackSequence += 1;
  return `${prefix}-${String(fallbackSequence).padStart(4, "0")}`;
}

function compactPageState(reply: CommandReply<unknown>): ToolReply<unknown>["pageState"] {
  const pageState: ToolReply<unknown>["pageState"] = {
    worldRevision: reply.pageState.worldRevision,
    focusedPanel: reply.pageState.focusedPanel,
  };
  if (reply.pageState.selectedActorId !== null) pageState.selectedActorId = reply.pageState.selectedActorId;
  if (reply.pageState.selectedClaimId !== null) pageState.selectedClaimId = reply.pageState.selectedClaimId;
  if (reply.pageState.patchId !== null) pageState.patchId = reply.pageState.patchId;
  return pageState;
}

function asToolReply<T>(reply: CommandReply<T>, fallbackPrefix: string): ToolReply<T> {
  const effect = reply.audit?.effect ?? "none";
  return {
    ok: reply.ok,
    code: reply.code,
    summary: reply.summary,
    data: reply.data,
    pageState: compactPageState(reply),
    audit: {
      invocationId: reply.audit?.id ?? fallbackInvocationId(fallbackPrefix),
      changed: effect === "world",
      effect,
    },
  };
}

function unavailableReply(code: "initialization_failed", summary: string): ToolReply<null> {
  return {
    ok: false,
    code,
    summary,
    data: null,
    pageState: { worldRevision: 0, focusedPanel: "initialization" },
    audit: {
      invocationId: fallbackInvocationId("site-tool-init"),
      changed: false,
      effect: "none",
    },
  };
}

function searchCommandInput(input: SearchWorldInput): SearchCommandInput {
  if (input.cursor !== undefined) return input;
  return {
    query: "",
    actorId: null,
    claimId: null,
    stance: null,
    sourceType: null,
    conditionKind: null,
    ...input,
  };
}

async function runCommand(
  name: ToolName,
  input: unknown,
  runtimeReady: Promise<ToolRuntime>,
): Promise<ToolReply<unknown>> {
  let runtime: ToolRuntime;
  try {
    runtime = await runtimeReady;
  } catch {
    return unavailableReply("initialization_failed", "Canon Ledger did not finish initializing; no command was run.");
  }

  const validated = validateToolInput(name, input);
  let commandReply: CommandReply<unknown>;
  if (!validated.ok) {
    commandReply = await runtime.commands.rejectInvalidInput(
      name,
      validated.field,
      validated.reason,
      "site-tool",
    );
  } else {
    try {
      if (name === "search_world") {
        commandReply = await runtime.commands.search(
          searchCommandInput(validated.value as SearchWorldInput),
          "site-tool",
        );
      } else if (name === "trace_claim_provenance") {
        commandReply = await runtime.commands.trace(
          validated.value as TraceClaimProvenanceInput,
          "site-tool",
        );
      } else if (name === "check_world_consistency") {
        commandReply = await runtime.commands.check(
          validated.value as CheckWorldConsistencyInput,
          "site-tool",
        );
      } else if (name === "suggest_world_edit") {
        commandReply = await runtime.commands.suggest(
          validated.value as SuggestWorldEditInput,
          "site-tool",
        );
      } else {
        commandReply = await runtime.commands.apply(
          validated.value as ApplyReviewedEditInput,
          "site-tool",
        );
      }
    } catch {
      commandReply = await runtime.commands.recordFailure(
        name,
        "unexpected_error",
        "The command failed safely before a result could be presented.",
        "site-tool",
      );
    }
  }

  const reply = asToolReply(commandReply, name);
  try {
    await runtime.presentToolResult(reply);
    return reply;
  } catch {
    return {
      ...reply,
      ok: false,
      code: "page_sync_failed",
      summary: "The command completed, but the visible page could not be synchronized.",
    };
  }
}

export function registerCanonLedgerTools(
  modelContext: ModelContext | undefined,
  runtimeReady: Promise<ToolRuntime>,
): RegistrationHandle {
  const names = TOOL_DEFINITIONS.map((definition) => definition.name);
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return { names, completion: Promise.resolve({ registered: [], failures: [] }) };
  }

  const outcomes: Array<Promise<{ name: string; ok: true } | { name: string; ok: false; message: string }>> = [];
  for (const definition of TOOL_DEFINITIONS) {
    try {
      const registration = modelContext.registerTool({
        name: definition.name,
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema as Record<string, unknown>,
        annotations: { ...definition.annotations },
        execute: (input, _options) => runCommand(definition.name, input, runtimeReady),
      });
      outcomes.push(Promise.resolve(registration).then(
        () => ({ name: definition.name, ok: true as const }),
        (error: unknown) => ({
          name: definition.name,
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        }),
      ));
    } catch (error) {
      outcomes.push(Promise.resolve({
        name: definition.name,
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return {
    names,
    completion: Promise.all(outcomes).then((results) => ({
      registered: results.filter((result) => result.ok).map((result) => result.name),
      failures: results.filter((result) => !result.ok).map((result) => ({
        name: result.name,
        message: result.message,
      })),
    })),
  };
}
