import { describe, expect, it } from "vitest";

import { renderDebugChart } from "../debug/chart.mjs";
import {
  SURVIVAL_REPLAY_FORMAT,
  SURVIVAL_SAVE_FORMAT,
  applyCommand,
  canonicalState,
  canonicalize,
  createCapeVerdePortFixtureState,
  createReplay,
  createSurvivalState,
  deserializeSave,
  getPlayerView,
  hashEventLog,
  hashState,
  replay,
  serializeSave,
  type SimulationCommand,
  type SurvivalSimulationState,
} from "../src/index.js";

const COMMANDS: readonly SimulationCommand[] = [
  {
    type: "set_lisbon_outfitting",
    allocation: {
      waterKg: 20_000,
      provisionsKg: 12_000,
      repairStoresKg: 4_000,
      medicineKg: 1_000,
    },
  },
  { type: "depart_lisbon" },
  { type: "set_heading", heading: "SW" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "set_ration_policy", policy: "reduced_provisions" },
  { type: "advance_day" },
  { type: "set_expedition_intent", intent: "return_to_lisbon" },
  { type: "advance_day" },
];

function initial(): SurvivalSimulationState {
  return createSurvivalState({
    contentVersion: "wp2-survival-v1",
    runSeed: "wp2-representative-sequence",
  });
}

function run(
  startingState: Readonly<SurvivalSimulationState>,
  commands: readonly SimulationCommand[],
): SurvivalSimulationState {
  return commands.reduce<SurvivalSimulationState>(
    (state, command) => applyCommand(state, command),
    startingState as SurvivalSimulationState,
  );
}

describe("WP2 state/save/replay determinism", () => {
  it("produces byte-identical v3 state and canonical logs for identical inputs", () => {
    const first = run(initial(), COMMANDS);
    const second = run(initial(), COMMANDS);

    expect(canonicalState(first)).toBe(canonicalState(second));
    expect(canonicalize(first.canonicalLog)).toBe(canonicalize(second.canonicalLog));
    expect(hashState(first)).toBe(hashState(second));
    expect(hashEventLog(first)).toBe(hashEventLog(second));
  });

  it("makes v3 save/resume byte-equivalent to uninterrupted execution", () => {
    const uninterrupted = run(initial(), COMMANDS);
    const split = 5;
    const beforeSave = run(initial(), COMMANDS.slice(0, split));
    const save = serializeSave(beforeSave);
    const resumed = run(
      deserializeSave(save) as SurvivalSimulationState,
      COMMANDS.slice(split),
    );

    expect(JSON.parse(save).format).toBe(SURVIVAL_SAVE_FORMAT);
    expect(canonicalState(resumed)).toBe(canonicalState(uninterrupted));
    expect(hashEventLog(resumed)).toBe(hashEventLog(uninterrupted));
  });

  it("makes v3 replay byte-equivalent to the original execution", () => {
    const start = initial();
    const original = run(start, COMMANDS);
    const record = createReplay(start, COMMANDS);
    const replayed = replay(start, record);

    expect(record.format).toBe(SURVIVAL_REPLAY_FORMAT);
    expect(canonicalState(replayed)).toBe(canonicalState(original));
    expect(hashState(replayed)).toBe(hashState(original));
  });

  it("leaves every byte and both PRNG streams unchanged after a rejected atomic command", () => {
    const state = run(initial(), COMMANDS.slice(0, 2));
    const before = canonicalState(state);
    const movementPrng = state.prng;
    const environmentPrng = state.navigation.environmentPrng;

    expect(() => applyCommand(state, {
      type: "repair_day",
      component: "mast",
      location: "at_sea",
    })).toThrow("full condition");
    expect(canonicalState(state)).toBe(before);
    expect(state.prng).toEqual(movementPrng);
    expect(state.navigation.environmentPrng).toEqual(environmentPrng);
  });

  it("keeps observation operations and every non-sailing day outside PRNG ownership", () => {
    const prefix = COMMANDS.slice(0, 4);
    const observed = run(initial(), prefix);
    canonicalState(observed);
    canonicalize(observed.canonicalLog);
    serializeSave(observed);
    hashState(observed);
    hashEventLog(observed);
    renderDebugChart(getPlayerView(observed));
    const afterObservation = run(observed, COMMANDS.slice(4));
    const plain = run(run(initial(), prefix), COMMANDS.slice(4));
    expect(canonicalState(afterObservation)).toBe(canonicalState(plain));

    let port = createCapeVerdePortFixtureState({
      contentVersion: "wp2-survival-v1",
      runSeed: "wp2-non-sailing-prng",
      mastBps: 8_000,
      moneyDucats: 20,
      foulingSpeedLossBps: 500,
    });
    const movementPrng = port.prng;
    const environmentPrng = port.navigation.environmentPrng;
    port = applyCommand(port, { type: "repair_day", component: "mast", location: "cape_verde" });
    port = applyCommand(port, { type: "rest_at_cape_verde" });
    port = applyCommand(port, { type: "careen_day_at_cape_verde" });

    expect(port.prng).toEqual(movementPrng);
    expect(port.navigation.environmentPrng).toEqual(environmentPrng);
  });
});
