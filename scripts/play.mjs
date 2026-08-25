import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  promises as fs,
} from "node:fs";
import { createServer } from "node:http";
import {
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ID = "age-of-exploration";
export const LAUNCHER_PROTOCOL = 1;
export const CONTENT_VERSION = "base-game-v2";
export const HEALTH_PATH = "/__age-of-exploration/health";

const BUILD_MANIFEST_FORMAT = "age-of-exploration-launcher-build-v1";
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const GAME_HOST = "127.0.0.1";
const GAME_PORT = 4173;
const GAME_URL = `http://${GAME_HOST}:${GAME_PORT}/`;
const COMMAND_SHELL = process.env.ComSpec ?? "cmd.exe";
const SKIP_BROWSER = process.env.AOE_PLAY_SKIP_BROWSER === "1";
const PRODUCTION_DIRECTORIES = ["app", "src"];
const OPTIONAL_PRODUCTION_DIRECTORIES = ["public"];
const PRODUCTION_FILES = [
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.build.json",
  "vite.config.ts",
];
const LOCK_FILES = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];
const FORBIDDEN_PRODUCTION_MARKERS = [
  "wp5-browser-seed-",
  "WP5_E2E_ENVIRONMENT",
  "E2E route requires a navigation state",
];

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

class LauncherError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "LauncherError";
    this.exitCode = exitCode;
  }
}

function shellResult(command, stdio = "inherit") {
  return spawnSync(COMMAND_SHELL, ["/d", "/s", "/c", command], {
    cwd: REPOSITORY_ROOT,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    stdio,
    windowsHide: true,
  });
}

function findPnpmCommand(expectedVersion) {
  for (const command of ["pnpm", "corepack pnpm"]) {
    const result = shellResult(`${command} --version`, "pipe");
    if (result.status === 0 && result.stdout.trim() === expectedVersion) return command;
  }
  return null;
}

function runPnpm(pnpmCommand, arguments_) {
  const result = shellResult(`${pnpmCommand} ${arguments_.join(" ")}`);
  if (result.error !== undefined) {
    throw new LauncherError(`Could not run ${pnpmCommand}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new LauncherError(
      `${pnpmCommand} ${arguments_.join(" ")} failed.`,
      result.status ?? 1,
    );
  }
}

async function listFiles(directory, repositoryRoot) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolute, repositoryRoot));
    } else if (entry.isFile()) {
      files.push(relative(repositoryRoot, absolute).replaceAll("\\", "/"));
    } else {
      throw new LauncherError(`Unsupported production input: ${absolute}`);
    }
  }
  return files;
}

export async function hashRelativeFiles(repositoryRoot, relativeFiles) {
  const hash = createHash("sha256");
  hash.update("age-of-exploration-launcher-input-v1\0");
  for (const relativeFile of [...relativeFiles].sort()) {
    const normalized = relativeFile.replaceAll("\\", "/");
    const bytes = await fs.readFile(join(repositoryRoot, relativeFile));
    hash.update(`${Buffer.byteLength(normalized, "utf8")}:`);
    hash.update(normalized, "utf8");
    hash.update(`${bytes.length}:`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

export async function collectProductionInputs(repositoryRoot) {
  const files = [...PRODUCTION_FILES];
  for (const directoryName of PRODUCTION_DIRECTORIES) {
    files.push(...await listFiles(join(repositoryRoot, directoryName), repositoryRoot));
  }
  for (const directoryName of OPTIONAL_PRODUCTION_DIRECTORIES) {
    const directory = join(repositoryRoot, directoryName);
    if (existsSync(directory)) files.push(...await listFiles(directory, repositoryRoot));
  }
  return [...new Set(files)].sort();
}

export async function computeBuildId(repositoryRoot) {
  return hashRelativeFiles(repositoryRoot, await collectProductionInputs(repositoryRoot));
}

export async function computeLockHash(repositoryRoot) {
  return hashRelativeFiles(repositoryRoot, LOCK_FILES);
}

function manifestPath(repositoryRoot) {
  return join(repositoryRoot, "app-dist", ".launcher-build.json");
}

export async function readBuildManifest(repositoryRoot) {
  try {
    const value = JSON.parse(await fs.readFile(manifestPath(repositoryRoot), "utf8"));
    if (
      value?.format !== BUILD_MANIFEST_FORMAT
      || value?.app !== APP_ID
      || typeof value?.buildId !== "string"
      || typeof value?.lockHash !== "string"
    ) return null;
    return { buildId: value.buildId, lockHash: value.lockHash };
  } catch {
    return null;
  }
}

export async function writeBuildManifest(repositoryRoot, buildId, lockHash) {
  const value = {
    app: APP_ID,
    buildId,
    format: BUILD_MANIFEST_FORMAT,
    lockHash,
  };
  await fs.writeFile(manifestPath(repositoryRoot), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function builtAssetFiles(appDirectory) {
  const assetsDirectory = join(appDirectory, "assets");
  if (!existsSync(assetsDirectory)) return [];
  return listFiles(assetsDirectory, appDirectory);
}

export async function verifyProductionBundle(repositoryRoot) {
  const appDirectory = join(repositoryRoot, "app-dist");
  const index = await fs.readFile(join(appDirectory, "index.html"), "utf8");
  if (!index.includes("<title>Age of Exploration")) {
    throw new LauncherError("The production build does not contain the Age of Exploration page.");
  }

  const assets = await builtAssetFiles(appDirectory);
  if (!assets.some((file) => file.endsWith(".js")) || !assets.some((file) => file.endsWith(".css"))) {
    throw new LauncherError("The production build is missing its JavaScript or stylesheet assets.");
  }

  for (const asset of assets.filter((file) => file.endsWith(".js"))) {
    const source = await fs.readFile(join(appDirectory, asset), "utf8");
    for (const marker of FORBIDDEN_PRODUCTION_MARKERS) {
      if (source.includes(marker)) {
        throw new LauncherError(`The production build contains an E2E-only marker: ${marker}`);
      }
    }
  }
}

function safeStaticPath(appDirectory, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const relativeName = decoded === "/"
    ? "index.html"
    : decoded.replace(/^[/\\]+/, "");
  const candidate = resolve(appDirectory, relativeName);
  const fromRoot = relative(appDirectory, candidate);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) return null;
  return candidate;
}

function responseHeaders(cacheControl) {
  return {
    "Cache-Control": cacheControl,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function send(request, response, status, body, headers = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  response.writeHead(status, {
    ...headers,
    "Content-Length": bytes.length,
  });
  response.end(request.method === "HEAD" ? undefined : bytes);
}

export function createGameServer({ appDirectory, buildId }) {
  const health = Buffer.from(`${JSON.stringify({
    app: APP_ID,
    buildId,
    contentVersion: CONTENT_VERSION,
    launcherProtocol: LAUNCHER_PROTOCOL,
  })}\n`, "utf8");

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        send(request, response, 405, "Method Not Allowed\n", {
          ...responseHeaders("no-store"),
          Allow: "GET, HEAD",
          "Content-Type": "text/plain; charset=utf-8",
        });
        return;
      }

      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === HEALTH_PATH) {
        send(request, response, 200, health, {
          ...responseHeaders("no-store"),
          "Content-Type": "application/json; charset=utf-8",
        });
        return;
      }

      const file = safeStaticPath(appDirectory, pathname);
      if (file === null) {
        send(request, response, 404, "Not Found\n", {
          ...responseHeaders("no-store"),
          "Content-Type": "text/plain; charset=utf-8",
        });
        return;
      }

      let stat;
      try {
        stat = await fs.stat(file);
      } catch {
        stat = null;
      }
      if (stat === null || !stat.isFile()) {
        send(request, response, 404, "Not Found\n", {
          ...responseHeaders("no-store"),
          "Content-Type": "text/plain; charset=utf-8",
        });
        return;
      }

      const body = await fs.readFile(file);
      const extension = extname(file).toLowerCase();
      const asset = relative(appDirectory, file).replaceAll("\\", "/").startsWith("assets/");
      send(request, response, 200, body, {
        ...responseHeaders(asset ? "public, max-age=31536000, immutable" : "no-store"),
        "Content-Type": MIME_TYPES.get(extension) ?? "application/octet-stream",
      });
    })().catch(() => {
      if (!response.headersSent) {
        send(request, response, 500, "Internal Server Error\n", {
          ...responseHeaders("no-store"),
          "Content-Type": "text/plain; charset=utf-8",
        });
      } else {
        response.destroy();
      }
    });
  });

  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.requestTimeout = 10_000;
  return server;
}

export async function listenGameServer({ appDirectory, buildId, host = GAME_HOST, port = GAME_PORT }) {
  const server = createGameServer({ appDirectory, buildId });
  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  return server;
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return { reachable: true, status: response.status, text: await response.text() };
  } catch {
    return { reachable: false, status: 0, text: "" };
  }
}

export async function probeLauncher(gameUrl, expectedBuildId) {
  const healthResponse = await fetchText(new URL(HEALTH_PATH, gameUrl));
  if (!healthResponse.reachable) return { kind: "absent" };

  try {
    const health = JSON.parse(healthResponse.text);
    if (health?.app === APP_ID) {
      if (health?.launcherProtocol !== LAUNCHER_PROTOCOL) return { kind: "incompatible" };
      return health?.buildId === expectedBuildId
        ? { kind: "current" }
        : { kind: "stale", runningBuildId: health?.buildId };
    }
  } catch {
    // The earlier Vite-preview launcher returns HTML at the health path. The
    // title check below distinguishes that migration case from another server.
  }

  if (healthResponse.text.includes("<title>Age of Exploration")) return { kind: "legacy" };
  const rootResponse = await fetchText(gameUrl);
  if (rootResponse.text.includes("<title>Age of Exploration")) return { kind: "legacy" };
  return { kind: "foreign" };
}

function openBrowser() {
  if (SKIP_BROWSER) {
    console.log(`Game ready at ${GAME_URL} (browser opening skipped for verification).`);
    return;
  }

  try {
    const opener = spawn(COMMAND_SHELL, ["/d", "/s", "/c", `start "" "${GAME_URL}"`], {
      cwd: REPOSITORY_ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    opener.on("error", () => console.log(`Open ${GAME_URL} in your browser.`));
    opener.unref();
  } catch {
    console.log(`Open ${GAME_URL} in your browser.`);
  }
}

async function expectedPnpmVersion(repositoryRoot) {
  const packageJson = JSON.parse(await fs.readFile(join(repositoryRoot, "package.json"), "utf8"));
  const packageManager = packageJson.packageManager;
  const separator = typeof packageManager === "string" ? packageManager.lastIndexOf("@") : -1;
  if (separator <= 0 || packageManager.slice(0, separator) !== "pnpm") {
    throw new LauncherError("package.json does not declare a pinned pnpm package manager.");
  }
  return packageManager.slice(separator + 1);
}

function dependenciesPresent(repositoryRoot) {
  return existsSync(join(repositoryRoot, "node_modules", ".bin", "tsc.cmd"))
    && existsSync(join(repositoryRoot, "node_modules", ".bin", "vite.cmd"));
}

async function prepareProductionBuild(repositoryRoot, desiredBuildId, lockHash, pnpmCommand) {
  let manifest = await readBuildManifest(repositoryRoot);
  if (!dependenciesPresent(repositoryRoot) || manifest?.lockHash !== lockHash) {
    console.log("Preparing game dependencies...");
    runPnpm(pnpmCommand, ["install", "--frozen-lockfile"]);
    if (!dependenciesPresent(repositoryRoot)) {
      throw new LauncherError("The required build tools are still missing after pnpm install.");
    }
  }

  let bundleValid = false;
  try {
    await verifyProductionBundle(repositoryRoot);
    bundleValid = true;
  } catch {
    bundleValid = false;
  }

  if (manifest?.buildId !== desiredBuildId || !bundleValid) {
    console.log("Building the production game...");
    runPnpm(pnpmCommand, ["build"]);
    const afterBuildId = await computeBuildId(repositoryRoot);
    if (afterBuildId !== desiredBuildId) {
      throw new LauncherError("Production inputs changed while the game was building. Double-click play.cmd again.");
    }
    await verifyProductionBundle(repositoryRoot);
    await writeBuildManifest(repositoryRoot, desiredBuildId, lockHash);
    manifest = { buildId: desiredBuildId, lockHash };
  } else {
    console.log("Using the current production build.");
  }

  return manifest;
}

async function main() {
  if (process.platform !== "win32") {
    throw new LauncherError("play.cmd is the Windows launcher. On other systems, use pnpm dev.");
  }

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor !== 22) {
    throw new LauncherError(`Node.js 22 is required; this launcher found ${process.version}.`, 2);
  }

  const desiredBuildId = await computeBuildId(REPOSITORY_ROOT);
  const lockHash = await computeLockHash(REPOSITORY_ROOT);
  const running = await probeLauncher(GAME_URL, desiredBuildId);
  if (running.kind === "current") {
    console.log(`Age of Exploration is already running at ${GAME_URL}`);
    openBrowser();
    return;
  }
  if (running.kind === "stale") {
    throw new LauncherError(
      "An older Age of Exploration build is already running. Close its launcher window, then double-click play.cmd again.",
    );
  }
  if (running.kind === "legacy") {
    throw new LauncherError(
      "The earlier Age of Exploration preview server is still running. Close its window, then double-click play.cmd again.",
    );
  }
  if (running.kind === "incompatible") {
    throw new LauncherError(
      "An incompatible Age of Exploration launcher is already using port 4173. Close it, then try again.",
    );
  }
  if (running.kind === "foreign") {
    throw new LauncherError(
      "Port 4173 is used by a different application. Nothing was started and no browser tab was opened.",
    );
  }

  const pnpmVersion = await expectedPnpmVersion(REPOSITORY_ROOT);
  const pnpmCommand = findPnpmCommand(pnpmVersion);
  if (pnpmCommand === null) {
    throw new LauncherError(
      `pnpm ${pnpmVersion} was not found, and Corepack could not provide it. Install the required pnpm version and try again.`,
      2,
    );
  }

  await prepareProductionBuild(REPOSITORY_ROOT, desiredBuildId, lockHash, pnpmCommand);

  console.log(`Starting the local game at ${GAME_URL}`);
  let server;
  try {
    server = await listenGameServer({
      appDirectory: join(REPOSITORY_ROOT, "app-dist"),
      buildId: desiredBuildId,
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      throw new LauncherError("Port 4173 became unavailable before the game could start.");
    }
    throw error;
  }

  const health = await probeLauncher(GAME_URL, desiredBuildId);
  if (health.kind !== "current") {
    server.close();
    throw new LauncherError("The local server started but failed its application identity check.");
  }

  openBrowser();
  console.log("Keep this window open while playing. Close it or press Ctrl+C to stop the game.");

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping Age of Exploration...");
    server.close();
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 1_000).unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await once(server, "close");
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  console.log("Game stopped.");
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof LauncherError ? error.exitCode : 1;
  }
}
