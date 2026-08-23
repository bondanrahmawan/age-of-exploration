import { describe, expect, it } from "vitest";

import { renderDebugChart } from "../debug/chart.mjs";
import {
  LANDMARK_IDS,
  SOUTH_ATLANTIC_CURRENT_ID,
  advanceDay,
  canonicalState,
  createNavigationState,
  getPlayerView,
} from "../src/index.js";

function chartState() {
  let state = createNavigationState({
    contentVersion: "wp1-authored-atlantic-v1",
    runSeed: "debug-chart-test",
    heading: "SW",
  });
  for (let day = 0; day < 5; day += 1) state = advanceDay(state);
  return state;
}

describe("WP1 deterministic debug chart", () => {
  it("renders estimate, ellipse, and only player-known landmarks by default", () => {
    const state = chartState();
    const view = getPlayerView(state);
    const first = renderDebugChart(view);
    const second = renderDebugChart(view);

    expect(first).toBe(second);
    expect(first).toContain('class="track"');
    expect(first).toContain('class="ellipse"');
    expect(first).toContain(LANDMARK_IDS.lisbon);
    expect(first).toContain(LANDMARK_IDS.capeVerde);
    expect(first).toContain(LANDMARK_IDS.capeGoal);
    expect(first).not.toContain(SOUTH_ATLANTIC_CURRENT_ID);
    expect(first).not.toContain("developer-truth-overlay");
    expect(first).not.toContain("TRUE POSITION");
  });

  it("shows truth only in explicit developer mode without changing state", () => {
    const state = chartState();
    const before = canonicalState(state);
    const svg = renderDebugChart(getPlayerView(state), {
      developerTruth: { truePosition: state.truePosition },
    });

    expect(svg).toContain('id="developer-truth-overlay"');
    expect(svg).toContain("TRUE POSITION (developer only)");
    expect(canonicalState(state)).toBe(before);
  });
});
