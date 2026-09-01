import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const takeId = process.argv[2];
if (!/^take-[ab]$/u.test(takeId ?? "")) throw new Error("Usage: npm run demo:video -- take-a|take-b");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "docs", "hackathon-build", "demo", takeId);
const outputPath = path.join(outputDirectory, `${takeId}.webm`);
const profileDirectory = await mkdtemp(path.join(tmpdir(), "canon-ledger-demo-"));
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
if (!chromePath) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to render the demo.");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".wav", "audio/wav"],
]);

let savedResolve;
let savedReject;
const saved = new Promise((resolve, reject) => {
  savedResolve = resolve;
  savedReject = reject;
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (request.method === "POST" && url.pathname === "/__save") {
    const name = url.searchParams.get("name");
    if (name !== `${takeId}.webm`) {
      response.writeHead(400).end("unexpected output name");
      return;
    }
    const output = createWriteStream(outputPath);
    request.pipe(output);
    request.on("error", savedReject);
    output.on("error", savedReject);
    output.on("finish", () => {
      response.writeHead(204).end();
      savedResolve(outputPath);
    });
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405).end("method not allowed");
    return;
  }
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = path.resolve(repositoryRoot, relativePath || "scripts/demo-renderer.html");
  if (!filePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("not a file");
  } catch {
    response.writeHead(404).end("not found");
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => response.destroy());
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
  });
  stream.pipe(response);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(read, predicate, label, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

let chrome;
let socket;
try {
  await mkdir(outputDirectory, { recursive: true });
  await rm(outputPath, { force: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const rendererUrl = `http://127.0.0.1:${port}/scripts/demo-renderer.html`;

  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "--window-size=1365,900",
    rendererUrl,
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });

  let chromeError = "";
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => { chromeError = `${chromeError}${chunk}`.slice(-12_000); });
  const activePortPath = path.join(profileDirectory, "DevToolsActivePort");
  const activePort = await waitFor(async () => {
    try {
      return await readFile(activePortPath, "utf8");
    } catch {
      if (chrome.exitCode !== null) throw new Error(`Chrome exited early. ${chromeError}`);
      return "";
    }
  }, (value) => value.includes("\n"), "Chrome DevTools endpoint");
  const [debugPort] = activePort.trim().split(/\r?\n/u);
  const targets = await waitFor(
    async () => fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json()),
    (items) => items.some((item) => item.type === "page" && item.url === rendererUrl),
    "demo renderer target",
  );
  const target = targets.find((item) => item.type === "page" && item.url === rendererUrl);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
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
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };

  await call("Runtime.enable");
  await waitFor(
    () => evaluate("typeof window.renderTake"),
    (value) => value === "function",
    "renderer initialization",
  );
  process.stdout.write(`Rendering ${takeId} with ${chromePath}\n`);
  const renderResult = await evaluate(`window.renderTake(${JSON.stringify(takeId)})`, true);
  await saved;
  const output = await stat(outputPath);
  process.stdout.write(`${JSON.stringify({ ...renderResult, outputPath, outputBytes: output.size }, null, 2)}\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  await new Promise((resolve) => server.close(resolve));
  await delay(150);
  await rm(profileDirectory, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
}
