import type { PlayerView, PositionMnm } from "../src/types.js";

export interface DeveloperTruthOverlay {
  readonly truePosition: PositionMnm;
}

export interface DebugChartOptions {
  readonly developerTruth?: DeveloperTruthOverlay;
}

export function renderDebugChart(
  view: Readonly<PlayerView>,
  options?: Readonly<DebugChartOptions>,
): string;
