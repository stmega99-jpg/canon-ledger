import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const pageUrl = process.argv[2] ?? process.env.CANON_LEDGER_URL ?? "http://127.0.0.1:8801/";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run the keyboard smoke test.");

const profileDirectory = await mkdtemp(path.join(tmpdir(), "canon-ledger-keyboard-"));
let chrome;
let socket;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(read, predicate, label, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await read();
    if (predicate(lastValue)) return lastValue;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

try {
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "--window-size=1440,1200",
      pageUrl,
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );

  let chromeError = "";
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => {
    chromeError = `${chromeError}${chunk}`.slice(-8_000);
  });

  const activePortPath = path.join(profileDirectory, "DevToolsActivePort");
  const activePort = await waitFor(
    async () => {
      try {
        return await readFile(activePortPath, "utf8");
      } catch {
        if (chrome.exitCode !== null) throw new Error(`Chrome exited early. ${chromeError}`);
        return "";
      }
    },
    (value) => value.includes("\n"),
    "Chrome DevTools endpoint",
  );
  const [port] = activePort.trim().split(/\r?\n/u);

  const targets = await waitFor(
    async () => fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()),
    (items) => items.some((item) => item.type === "page" && item.url.startsWith(pageUrl)),
    "the Canon Ledger page target",
  );
  const target = targets.find((item) => item.type === "page" && item.url.startsWith(pageUrl));

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  const runtimeProblems = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown") runtimeProblems.push(message.params.exceptionDetails.text);
      if (
        message.method === "Log.entryAdded" &&
        ["error", "warning"].includes(message.params.entry.level)
      ) runtimeProblems.push(message.params.entry.text);
      return;
    }
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const bodyText = () => evaluate("document.body.innerText");
  const activeElement = () => evaluate(`(() => {
    const element = document.activeElement;
    return {
      aria: element?.getAttribute?.("aria-label") ?? "",
      id: element?.id ?? "",
      tag: element?.tagName ?? "",
      text: element?.textContent?.trim?.() ?? "",
      type: element?.type ?? "",
      value: element?.value ?? "",
    };
  })()`);

  const keyDefinitions = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  };
  const press = async (keyName, modifiers = 0) => {
    const definition = keyDefinitions[keyName];
    const text = keyName === "Enter" ? "\r" : undefined;
    await call("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      modifiers,
      nativeVirtualKeyCode: definition.windowsVirtualKeyCode,
      text,
      unmodifiedText: text,
      ...definition,
    });
    await call("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...definition });
  };
  const tabUntil = async (predicate, label, maximumTabs = 120) => {
    for (let index = 0; index <= maximumTabs; index += 1) {
      const active = await activeElement();
      if (predicate(active)) return active;
      await press("Tab");
    }
    throw new Error(`Could not reach ${label} with Tab. Active element: ${JSON.stringify(await activeElement())}`);
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  await call("Runtime.enable");
  await call("Log.enable");
  await call("Page.enable");
  await waitFor(bodyText, (text) => text.includes("Ready. Search a belief"), "the application ready state");
  const readyMilliseconds = Number(await evaluate("document.querySelector('#app-workspace')?.getAttribute('data-ready-ms')"));
  assert(Number.isFinite(readyMilliseconds) && readyMilliseconds < 500, `First render took ${readyMilliseconds} ms.`);

  await tabUntil((active) => active.tag === "INPUT" && active.type === "search", "the belief search box", 10);
  await call("Input.insertText", { text: "Nori" });
  assert((await activeElement()).value === "Nori", "Keyboard text input did not reach the search box.");
  await press("Enter");
  await waitFor(bodyText, (text) => text.includes("1 matching belief row"), "the filtered belief row");

  const traceLabel = "Trace Nori's evidence for sc-stole";
  await tabUntil((active) => active.aria === traceLabel, traceLabel, 30);
  await press("Enter");
  await waitFor(bodyText, (text) => !text.includes("Choose Trace on any belief row") && text.includes("Nori"), "the provenance trace");
  assert((await activeElement()).aria === traceLabel, "Trace focus was not restored after rendering.");

  await tabUntil((active) => active.text === "Stage demo-safe proposal", "the proposal staging button", 80);
  await press("Enter");
  await waitFor(bodyText, (text) => text.includes("3 decisions pending"), "the staged three-operation proposal");
  assert((await activeElement()).id === "suggestions-panel", "Focus did not move to Suggestions after the staging button disappeared.");

  await tabUntil((active) => active.text === "Apply reviewed operations", "the early Apply button", 80);
  await press("Enter");
  const refusedBody = await waitFor(bodyText, (text) => text.includes("apply_patch · pending_page_review"), "the pending-review refusal");
  assert(refusedBody.includes("WORLD REVISION\n0"), "Early Apply changed the world revision.");

  const decisions = [
    ["Approve resolve-warehouse-canon", "2 decisions pending"],
    ["Approve repair-warehouse-dispute-layer", "1 decisions pending"],
    ["Reject archive-gen-root-memory", "0 decisions pending"],
  ];
  for (const [label, pendingText] of decisions) {
    await tabUntil((active) => active.aria === label, label);
    await press("Enter");
    await waitFor(bodyText, (text) => text.includes(pendingText), pendingText);
    assert((await activeElement()).aria === label, `Focus was not restored after ${label}.`);
  }

  await tabUntil((active) => active.text === "Apply reviewed operations", "the reviewed Apply button", 30);
  await press("Enter");
  const committedBody = await waitFor(
    bodyText,
    (text) => text.includes("WORLD REVISION\n1") && text.includes("0 currently violated"),
    "the committed reviewed proposal",
  );
  assert(committedBody.includes("resolve-warehouse-canon, repair-warehouse-dispute-layer"), "The receipt omitted approved operations.");
  assert(committedBody.includes("archive-gen-root-memory"), "The receipt omitted the rejected operation.");
  assert(runtimeProblems.length === 0, `Browser errors or warnings occurred: ${runtimeProblems.join(" | ")}`);

  const result = {
    browser: chromePath,
    consoleProblems: runtimeProblems.length,
    earlyApply: "pending_page_review at revision 0",
    finalRevision: 1,
    firstRenderMilliseconds: readyMilliseconds,
    focusRestoration: "trace, staging fallback, and all three decisions",
    keyboardRoute: "Tab / Enter / text input only after page load",
    url: pageUrl,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  await delay(150);
  await rm(profileDirectory, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
}
