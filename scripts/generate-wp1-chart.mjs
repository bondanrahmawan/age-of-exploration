import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyCommand,
  createNavigationState,
  getPlayerView,
  hashEventLog,
  hashState,
} from "../dist/index.js";
import { renderDebugChart } from "../debug/chart.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "artifacts", "wp1-navigation.svg");
const commands = [
  { type: "set_heading", heading: "SW" },
  ...Array.from({ length: 22 }, () => ({ type: "advance_day" })),
  { type: "set_heading", heading: "S" },
  ...Array.from({ length: 18 }, () => ({ type: "advance_day" })),
  { type: "set_heading", heading: "SE" },
  ...Array.from({ length: 18 }, () => ({ type: "advance_day" })),
];
let state = createNavigationState({
  contentVersion: "wp1-authored-atlantic-v1",
  runSeed: "wp1-representative-chart-route",
});
for (const command of commands) state = applyCommand(state, command);
const svg = renderDebugChart(getPlayerView(state));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, svg, "utf8");
process.stdout.write([
  `SVG: ${outputPath}`,
  `STATE_SHA256: ${hashState(state)}`,
  `LOG_SHA256: ${hashEventLog(state)}`,
  "",
].join("\n"));
