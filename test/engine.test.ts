import { describe, expect, it } from "vitest";

import {
  DAY_PHASE_ORDER,
  SimulationValidationError,
  advanceDay,
  applyCommand,
  canonicalState,
  createInitialState,
  getPlayerView,
  type DailyEnvironment,
  type SimulationCommand,
  type SimulationState,
} from "../src/index.js";

describe("WP0 day transaction and invariants", () => {
  it("consumes exactly 600 kg water and 300 kg provisions for 25 crew over four days", () => {
    const initial = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "four-day-consumption",
    });
    let state = initial;
    for (let day = 0; day < 4; day += 1) {
      state = advanceDay(state);
    }

    expect(initial.stores.waterKg - state.stores.waterKg).toBe(600);
    expect(initial.stores.provisionsKg - state.stores.provisionsKg).toBe(300);
    expect(state.committedDay).toBe(4);
    expect(state.date).toBe("1488-04-05");
  });

  it("records every section 4.1 phase in the required order", () => {
    const state = advanceDay(createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "phase-order",
    }));
    const entry = state.canonicalLog[0];

    expect(entry?.type).toBe("day");
    if (entry?.type === "day") {
      expect(entry.phaseOrder).toEqual(DAY_PHASE_ORDER);
    }
  });

  it("clamps depleted stores at zero", () => {
    let state = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "empty-stores",
      waterKg: 1,
      provisionsKg: 2,
      repairStoresKg: 0,
      medicineKg: 0,
    });
    for (let day = 0; day < 10; day += 1) {
      state = advanceDay(state);
      expect(state.stores.waterKg).toBeGreaterThanOrEqual(0);
      expect(state.stores.provisionsKg).toBeGreaterThanOrEqual(0);
    }
    expect(state.stores.waterKg).toBe(0);
    expect(state.stores.provisionsKg).toBe(0);
  });

  it("keeps crew and component conditions within their basis-point ranges", () => {
    let state = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "condition-clamps",
      rationPolicy: "reduced_both",
      healthBps: 100,
      moraleBps: 100,
    });
    for (let day = 0; day < 20; day += 1) {
      state = advanceDay(state);
      expect(state.crew.healthBps).toBeGreaterThanOrEqual(0);
      expect(state.crew.healthBps).toBeLessThanOrEqual(10_000);
      expect(state.crew.moraleBps).toBeGreaterThanOrEqual(0);
      expect(state.crew.moraleBps).toBeLessThanOrEqual(10_000);
      for (const condition of Object.values(state.ship)) {
        expect(condition).toBeGreaterThanOrEqual(0);
        expect(condition).toBeLessThanOrEqual(10_000);
      }
    }
    expect(state.crew.healthBps).toBe(0);
    expect(state.crew.moraleBps).toBe(0);
  });

  it("projects an allow-listed player view with no seed, PRNG, true position, or hidden vector", () => {
    const hiddenEnvironment: DailyEnvironment = {
      id: "test-hidden-environment",
      pointOfSailPermille: 1_000,
      weatherPermille: 1_000,
      uncertaintyPermille: 1_000,
      tackingUncertaintyPermille: 1_000,
      trueCurrentMnm: { xMnm: 77_777, yMnm: -44_444 },
      knownCurrentMnm: { xMnm: 0, yMnm: 0 },
      leewayMnm: { xMnm: 0, yMnm: 0 },
      observation: "none",
      landfall: "none",
    };
    const state = advanceDay(
      createInitialState({ contentVersion: "wp0-test-v1", runSeed: "hidden-truth" }),
      () => hiddenEnvironment,
    );
    const view = getPlayerView(state);
    const encoded = JSON.stringify(view);

    expect(Object.keys(view).sort()).not.toContain("truePosition");
    expect(encoded).not.toContain("runSeed");
    expect(encoded).not.toContain("prng");
    expect(encoded).not.toContain("truePosition");
    expect(encoded).not.toContain("trueCurrentMnm");
    expect(encoded).not.toContain("77777");
    expect(encoded).not.toContain("-44444");
  });

  it("rejects invalid commands and failing environments without mutating the input", () => {
    const state = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "atomic-failure",
    });
    const before = canonicalState(state);
    const invalid = { type: "set_heading", heading: "UP" } as unknown as SimulationCommand;

    expect(() => applyCommand(state, invalid)).toThrow(SimulationValidationError);
    expect(() => advanceDay(state, () => {
      throw new Error("fixture failed");
    })).toThrow("fixture failed");
    expect(canonicalState(state)).toBe(before);
  });

  it("does not mutate or freeze a valid externally reconstructed input", () => {
    const original = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "detached-output",
    });
    const external = JSON.parse(canonicalState(original)) as SimulationState;
    const before = canonicalState(external);

    const result = applyCommand(external, { type: "set_heading", heading: "NW" });

    expect(canonicalState(external)).toBe(before);
    expect(Object.isFrozen(external)).toBe(false);
    expect(Object.isFrozen(external.truePosition)).toBe(false);
    expect(result.heading).toBe("NW");
  });

  it("rejects negative initial stores and out-of-range conditions", () => {
    expect(() => createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "negative-store",
      waterKg: -1,
    })).toThrow(SimulationValidationError);
    expect(() => createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "bad-condition",
      moraleBps: 10_001,
    })).toThrow(SimulationValidationError);
  });
});
