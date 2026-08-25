import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APP_ID,
  CONTENT_VERSION,
  HEALTH_PATH,
  LAUNCHER_PROTOCOL,
  browserOpenerCommand,
  hashRelativeFiles,
  listenGameServer,
  probeLauncher,
  readBuildManifest,
  writeBuildManifest,
} from "./play.mjs";

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), "age-of-exploration-launcher-"));
  const appDirectory = join(root, "app-dist");
  await fs.mkdir(join(appDirectory, "assets"), { recursive: true });
  await fs.writeFile(
    join(appDirectory, "index.html"),
    "<!doctype html><title>Age of Exploration — The Uncertain Sea</title>",
  );
  await fs.writeFile(join(appDirectory, "assets", "game-abc123.js"), "export const game = true;\n");
  await fs.writeFile(join(appDirectory, "assets", "game-abc123.css"), "body { color: white; }\n");
  return { appDirectory, root };
}

async function startFixtureServer(appDirectory, buildId = "a".repeat(64)) {
  const server = await listenGameServer({ appDirectory, buildId, port: 0 });
  const address = server.address();
  assert(address !== null && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function close(server) {
  server.close();
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve) => server.once("close", resolve));
}

function rawRequest(url, path, method = "GET") {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: target.hostname,
      method,
      path,
      port: target.port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("serves only the production bundle with safe cache and method behavior", async (context) => {
  const { appDirectory, root } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const { server, url } = await startFixtureServer(appDirectory);
  context.after(() => close(server));

  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Age of Exploration/);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");

  const asset = await fetch(new URL("assets/game-abc123.js", url));
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.match(asset.headers.get("content-type"), /^text\/javascript/);

  const head = await rawRequest(url, "/", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");

  const post = await rawRequest(url, "/", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");

  const traversal = await rawRequest(url, "/%2e%2e%2foutside.txt");
  assert.equal(traversal.status, 404);
});

test("health exposes launcher identity and no campaign state", async (context) => {
  const { appDirectory, root } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const buildId = "b".repeat(64);
  const { server, url } = await startFixtureServer(appDirectory, buildId);
  context.after(() => close(server));

  const response = await fetch(new URL(HEALTH_PATH, url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const health = await response.json();
  assert.deepEqual(health, {
    app: APP_ID,
    buildId,
    contentVersion: CONTENT_VERSION,
    launcherProtocol: LAUNCHER_PROTOCOL,
  });
  assert.doesNotMatch(JSON.stringify(health), /campaign|position|prng|route|save|seed/i);
});

test("probe distinguishes current, stale, legacy, and foreign servers", async (context) => {
  const { appDirectory, root } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const buildId = "c".repeat(64);
  const current = await startFixtureServer(appDirectory, buildId);
  context.after(() => close(current.server));
  assert.deepEqual(await probeLauncher(current.url, buildId), { kind: "current" });
  assert.deepEqual(await probeLauncher(current.url, "d".repeat(64)), {
    kind: "stale",
    runningBuildId: buildId,
  });

  const legacyServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<title>Age of Exploration — The Uncertain Sea</title>");
  });
  await new Promise((resolve) => legacyServer.listen(0, "127.0.0.1", resolve));
  context.after(() => close(legacyServer));
  const legacyAddress = legacyServer.address();
  assert(legacyAddress !== null && typeof legacyAddress === "object");
  assert.deepEqual(
    await probeLauncher(`http://127.0.0.1:${legacyAddress.port}/`, buildId),
    { kind: "legacy" },
  );

  const foreignServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("another application");
  });
  await new Promise((resolve) => foreignServer.listen(0, "127.0.0.1", resolve));
  context.after(() => close(foreignServer));
  const foreignAddress = foreignServer.address();
  assert(foreignAddress !== null && typeof foreignAddress === "object");
  assert.deepEqual(
    await probeLauncher(`http://127.0.0.1:${foreignAddress.port}/`, buildId),
    { kind: "foreign" },
  );
});

test("build fingerprints and manifests are deterministic and sensitive to inputs", async (context) => {
  const root = await fs.mkdtemp(join(tmpdir(), "age-of-exploration-fingerprint-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(join(root, "a.txt"), "alpha\n");
  await fs.writeFile(join(root, "b.txt"), "beta\n");

  const first = await hashRelativeFiles(root, ["a.txt", "b.txt"]);
  const reordered = await hashRelativeFiles(root, ["b.txt", "a.txt"]);
  assert.equal(first, reordered);
  await fs.writeFile(join(root, "b.txt"), "changed\n");
  assert.notEqual(await hashRelativeFiles(root, ["a.txt", "b.txt"]), first);

  await fs.mkdir(join(root, "app-dist"));
  await writeBuildManifest(root, first, "e".repeat(64));
  assert.deepEqual(await readBuildManifest(root), {
    buildId: first,
    lockHash: "e".repeat(64),
  });
});

// The launcher opened nothing for months and said nothing about it, because the
// obvious way to open a URL on Windows is the one way that does not work: `cmd
// /c start "" <url>` opens no browser here, never exits, and leaves the shell
// running. This does not prove the opener works - only a real desktop can - but
// it does stop anyone quietly putting `start` back.
test("the browser opener is the shell URL handler, not cmd start", () => {
  const opener = browserOpenerCommand("http://127.0.0.1:4173/");
  assert.equal(opener.command, "rundll32.exe");
  assert.deepEqual(opener.arguments_, [
    "url.dll,FileProtocolHandler",
    "http://127.0.0.1:4173/",
  ]);
  assert.ok(
    !opener.command.includes("cmd") && !opener.arguments_.some((value) => value.includes("start")),
    "cmd start hangs on this platform and opens nothing",
  );
});
