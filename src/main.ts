import "./styles.css";
import { validateWorldSnapshot } from "./domain/validate.ts";
import { detectSiteToolsMode, environmentMessage } from "./environment.ts";
import fixtureJson from "./fixtures/warehouse-world.json";
import { ApplicationCommands } from "./state/commands.ts";
import { CanonLedgerStore } from "./state/store.ts";
import { wireApplicationEvents } from "./ui/events.ts";
import { renderApplication, type RenderStatus } from "./ui/render.ts";
import {
  registerCanonLedgerTools,
  type ToolReply,
  type ToolRuntime,
} from "./webmcp/register.ts";

const banner = document.querySelector<HTMLElement>("#environment-banner");
if (!banner) throw new Error("Missing environment banner");

const root = document.querySelector<HTMLElement>("#app-workspace");
if (!root) throw new Error("Missing application workspace");
const appRoot: HTMLElement = root;

const mode = detectSiteToolsMode(document);
banner.dataset["mode"] = mode;
banner.textContent = environmentMessage(mode);

function showFatal(error: unknown): void {
  appRoot.setAttribute("aria-busy", "false");
  appRoot.replaceChildren();
  const message = document.createElement("p");
  message.className = "fatal-error";
  message.textContent = `Canon Ledger could not start: ${error instanceof Error ? error.message : String(error)}`;
  appRoot.append(message);
}

async function initializeApplication(): Promise<ToolRuntime> {
  const fixture = validateWorldSnapshot(fixtureJson);
  const store = await CanonLedgerStore.create({ fixture, storage: window.localStorage });
  const commands = new ApplicationCommands(store);
  let status: RenderStatus = {
    message: store.getState().stagedPatch
      ? "Restored a same-origin page review. Re-check every visible operation before Apply."
      : "Ready. Search a belief or stage the demo-safe warehouse proposal.",
    tone: store.getState().stagedPatch ? "warning" : "neutral",
  };
  let renderTail: Promise<void> = Promise.resolve();
  const render = (): Promise<void> => {
    appRoot.setAttribute("aria-busy", "true");
    renderTail = renderTail
      .catch(() => undefined)
      .then(() => renderApplication(appRoot, store, commands, status))
      .then(() => { appRoot.setAttribute("aria-busy", "false"); });
    return renderTail;
  };
  wireApplicationEvents(appRoot, store, commands, (next) => { status = next; }, render);
  store.subscribe(() => { void render().catch(showFatal); });
  await render();
  return {
    commands,
    async presentToolResult(reply: ToolReply<unknown>): Promise<void> {
      status = {
        message: `${reply.code}: ${reply.summary}`,
        tone: reply.ok ? "success" : reply.code.includes("pending") ? "warning" : "danger",
      };
      await render();
    },
  };
}

// Registration is initiated synchronously from the top-level module. Handlers
// await this shared promise, so a tool discovered during startup cannot race the
// store or manufacture a second application state.
const storeReady = initializeApplication();
const registration = registerCanonLedgerTools(document.modelContext, storeReady);

if (mode === "site-tools") {
  void registration.completion.then((report) => {
    if (report.failures.length === 0) {
      banner.textContent = `Site tools available · ${report.registered.length}/5 registered · page and agent share one ledger`;
      return;
    }
    banner.dataset["mode"] = "no-site-tools";
    banner.textContent = `Site tools incomplete · ${report.registered.length}/5 registered · the complete page workflow remains available`;
  });
}

void storeReady.catch(showFatal);
