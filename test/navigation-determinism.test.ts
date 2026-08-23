import { describe, expect, it } from "vitest";

import {
  NAVIGATION_REPLAY_FORMAT,
  NAVIGATION_SAVE_FORMAT,
  NAVIGATION_STATE_FORMAT,
  applyCommand,
  canonicalState,
  canonicalize,
  createNavigationState,
  createReplay,
  deserializeSave,
  hashEventLog,
  hashState,
  replay,
  serializeSave,
  type NavigationSimulationState,
  type SimulationCommand,
  type SimulationState,
} from "../src/index.js";

const AUTHORED_COMMANDS: readonly SimulationCommand[] = [
  { type: "set_heading", heading: "SW" },
  { type: "set_sailing_policy", policy: "standard" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "set_heading", heading: "S" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "set_sailing_policy", policy: "cautious" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "advance_day" },
];

function initial(): NavigationSimulationState {
  return createNavigationState({
    contentVersion: "wp1-authored-atlantic-v1",
    runSeed: "wp1-representative-route",
  });
}

function run(
  startingState: Readonly<SimulationState>,
  commands: readonly SimulationCommand[],
): SimulationState {
  return commands.reduce<SimulationState>(
    (state, command) => applyCommand(state, command),
    startingState as SimulationState,
  );
}

describe("WP1 authored-environment determinism", () => {
  it("reproduces seeded weather and persisted weather state", () => {
    const first = run(initial(), AUTHORED_COMMANDS);
    const second = run(initial(), AUTHORED_COMMANDS);
    const firstWeather = first.canonicalLog
      .filter((entry) => entry.type === "day" && "observedWeather" in entry)
      .map((entry) => entry.observedWeather);
    const secondWeather = second.canonicalLog
      .filter((entry) => entry.type === "day" && "observedWeather" in entry)
      .map((entry) => entry.observedWeather);

    expect(firstWeather).toEqual(secondWeather);
    expect(first.format).toBe(NAVIGATION_STATE_FORMAT);
    expect(second.format).toBe(NAVIGATION_STATE_FORMAT);
    if (first.format === NAVIGATION_STATE_FORMAT && second.format === NAVIGATION_STATE_FORMAT) {
      expect(first.navigation.weatherState).toEqual(second.navigation.weatherState);
      expect(first.navigation.environmentPrng).toEqual(second.navigation.environmentPrng);
    }
    expect(canonicalState(first)).toBe(canonicalState(second));
  });

  it("makes save/resume byte-equivalent to uninterrupted execution", () => {
    const uninterrupted = run(initial(), AUTHORED_COMMANDS);
    const splitIndex = 7;
    const beforeSave = run(initial(), AUTHORED_COMMANDS.slice(0, splitIndex));
    const save = serializeSave(beforeSave);
    const resumed = run(deserializeSave(save), AUTHORED_COMMANDS.slice(splitIndex));

    expect(JSON.parse(save).format).toBe(NAVIGATION_SAVE_FORMAT);
    expect(canonicalState(resumed)).toBe(canonicalState(uninterrupted));
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
  });

  it("makes authored-environment replay byte-equivalent to the original", () => {
    const startingState = initial();
    const original = run(startingState, AUTHORED_COMMANDS);
    const record = createReplay(startingState, AUTHORED_COMMANDS);
    const replayed = replay(startingState, record);

    expect(record.format).toBe(NAVIGATION_REPLAY_FORMAT);
    expect(canonicalState(replayed)).toBe(canonicalState(original));
    expect(canonicalize(replayed.canonicalLog)).toBe(canonicalize(original.canonicalLog));
    expect(hashEventLog(replayed)).toBe(hashEventLog(original));
  });

  it("keeps the environment substream independent of projection and serialization", () => {
    const prefix = AUTHORED_COMMANDS.slice(0, 7);
    const suffix = AUTHORED_COMMANDS.slice(7);
    const observed = run(initial(), prefix);
    canonicalState(observed);
    serializeSave(observed);
    hashState(observed);
    const afterObservation = run(observed, suffix);
    const plain = run(run(initial(), prefix), suffix);

    expect(canonicalState(afterObservation)).toBe(canonicalState(plain));
  });
});
