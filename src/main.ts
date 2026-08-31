import "./styles.css";
import { detectSiteToolsMode, environmentMessage } from "./environment.ts";
import { validateWorldSnapshot } from "./domain/validate.ts";
import fixtureJson from "./fixtures/warehouse-world.json";
import { ApplicationCommands } from "./state/commands.ts";
import { CanonLedgerStore } from "./state/store.ts";
import { wireApplicationEvents } from "./ui/events.ts";
import { renderApplication, type RenderStatus } from "./ui/render.ts";

const banner = document.querySelector<HTMLElement>("#environment-banner");
if (!banner) {
  throw new Error("Missing environment banner");
}

const mode = detectSiteToolsMode(document);
banner.dataset["mode"] = mode;
banner.textContent = environmentMessage(mode);

const root = document.querySelector<HTMLElement>("#app-workspace");
if (!root) throw new Error("Missing application workspace");
const appRoot: HTMLElement = root;

async function start(): Promise<void> {
  const fixture = validateWorldSnapshot(fixtureJson);
  const store = await CanonLedgerStore.create({ fixture, storage: window.localStorage });
  const commands = new ApplicationCommands(store);
  let status: RenderStatus = {
    message: store.getState().stagedPatch
      ? "Restored a same-origin page review. Re-check every visible operation before Apply."
      : "Ready. Search a belief or stage the demo-safe warehouse proposal.",
    tone: store.getState().stagedPatch ? "warning" : "neutral",
  };
  let generation = 0;
  const render = async () => {
    const current = ++generation;
    await renderApplication(appRoot, store, commands, status);
    if (current === generation) appRoot.setAttribute("aria-busy", "false");
  };
  wireApplicationEvents(appRoot, store, commands, (next) => { status = next; }, render);
  store.subscribe(() => { void render(); });
  await render();
}

void start().catch((error: unknown) => {
  appRoot.setAttribute("aria-busy", "false");
  appRoot.replaceChildren();
  const message = document.createElement("p");
  message.className = "fatal-error";
  message.textContent = `Canon Ledger could not start: ${error instanceof Error ? error.message : String(error)}`;
  appRoot.append(message);
});
