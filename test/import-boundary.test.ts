import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

describe("package boundary", () => {
  it("imports without global, random, or wall-clock side effects", async () => {
    vi.resetModules();
    const beforeGlobals = Reflect.ownKeys(globalThis);
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");

    const module = await import("../src/index.js");

    expect(module.createInitialState).toBeTypeOf("function");
    expect(Reflect.ownKeys(globalThis)).toEqual(beforeGlobals);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });

  it("has no filesystem, UI, network, storage, or wall-clock dependency in src", () => {
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const sourceDirectory = join(testDirectory, "..", "src");
    const source = readdirSync(sourceDirectory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(sourceDirectory, name), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/from\s+["']node:(?:fs|http|https|net|os|path|process)/);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|indexedDB)\b/);
    expect(source).not.toMatch(/\b(?:document|window)\s*[.[]/);
    expect(source).not.toMatch(/\b(?:Date\.now|new\s+Date|Math\.random)\b/);
  });
});
