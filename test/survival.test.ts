import { describe, expect, it } from "vitest";

import {
  SimulationValidationError,
  advanceDay,
  applyCommand,
  canonicalState,
  createCapeVerdePortFixtureState,
  createSurvivalState,
  getPlayerView,
  type EnvironmentProvider,
  type NavigationFact,
  type PositionMnm,
  type StoresState,
  type SurvivalSimulationState,
} from "../src/index.js";

const REPRESENTATIVE_ALLOCATION: StoresState = {
  waterKg: 20_000,
  provisionsKg: 12_000,
  repairStoresKg: 4_000,
  medicineKg: 1_000,
};

function outfitted(seed = "wp2-survival-test", allocation = REPRESENTATIVE_ALLOCATION) {
  return applyCommand(createSurvivalState({
    contentVersion: "wp2-survival-v1",
    runSeed: seed,
  }), { type: "set_lisbon_outfitting", allocation });
}

function departed(seed = "wp2-survival-test", allocation = REPRESENTATIVE_ALLOCATION) {
  return applyCommand(outfitted(seed, allocation), { type: "depart_lisbon" });
}

interface FixtureOverride {
  readonly crew?: Partial<SurvivalSimulationState["crew"]>;
  readonly ship?: Partial<SurvivalSimulationState["ship"]>;
  readonly truePosition?: PositionMnm;
  readonly estimatedPosition?: PositionMnm;
  readonly foulingSpeedLossBps?: number;
}

function overrideFixture(
  state: Readonly<SurvivalSimulationState>,
  override: Readonly<FixtureOverride>,
): SurvivalSimulationState {
  const clone = JSON.parse(canonicalState(state)) as SurvivalSimulationState;
  const crew = { ...clone.crew, ...override.crew };
  const ship = { ...clone.ship, ...override.ship };
  const reason = ship.hullBps === 0
    ? "hull_danger" as const
    : ship.mastBps === 0
      ? "mast_disabled" as const
      : ship.sailsBps === 0
        ? "sails_disabled" as const
        : ship.rudderBps === 0
          ? "rudder_disabled" as const
          : crew.able < 8
            ? "insufficient_able_crew" as const
            : null;
  const status = reason === null
    ? { kind: "active" as const, message: "Expedition remains active." as const }
    : { kind: "stranded" as const, reason, message: `Fixture stranded: ${reason}.` };
  const interruption = reason === null
    ? { kind: "none" as const }
    : {
        kind: "stranded" as const,
        reason,
        availableResponses: ["repair", "distress", "abandon_objective"] as const,
      };
  return {
    ...clone,
    crew,
    ship,
    truePosition: override.truePosition === undefined
      ? { ...clone.truePosition }
      : { ...override.truePosition },
    estimatedPosition: override.estimatedPosition === undefined
      ? { ...clone.estimatedPosition }
      : { ...override.estimatedPosition },
    survival: {
      ...clone.survival,
      foulingSpeedLossBps: override.foulingSpeedLossBps
        ?? clone.survival.foulingSpeedLossBps,
      status,
      interruption,
    },
  };
}

function fixedEnvironment(speedPermille = 1_000): EnvironmentProvider {
  return (context) => {
    if (context.navigation === null) throw new Error("WP2 fixture requires navigation state");
    return {
      schema: "wp1-navigation-environment-v1",
      id: `wp2-fixture:${speedPermille}`,
      pointOfSailPermille: speedPermille,
      weatherPermille: speedPermille,
      uncertaintyPermille: 1_000,
      tackingUncertaintyPermille: 1_000,
      trueCurrentMnm: { xMnm: 0, yMnm: 0 },
      knownCurrentMnm: { xMnm: 0, yMnm: 0 },
      leewayMnm: { xMnm: 0, yMnm: 0 },
      observedWeather: speedPermille === 0 ? "calm" : "fair_clear",
      observedWind: {
        directionConvention: "from",
        fromHeading: speedPermille === 0 ? null : "NE",
        strength: speedPermille === 0 ? "calm" : "moderate",
      },
      noonObservation: "none",
      sightRadiusMnm: 20_000,
      nextWeatherState: {
        kind: speedPermille === 0 ? "calm" : "fair_clear",
        daysInState: context.navigation.weatherState.daysInState + 1,
      },
      nextEnvironmentPrng: context.navigation.environmentPrng,
    };
  };
}

describe("WP2 Lisbon outfitting and departure", () => {
  it("enforces every store cap, the hold boundary, and the sponsor advance", () => {
    const state = createSurvivalState({ contentVersion: "wp2-test", runSeed: "outfitting" });
    const valid = applyCommand(state, {
      type: "set_lisbon_outfitting",
      allocation: { waterKg: 24_000, provisionsKg: 18_000, repairStoresKg: 8_000, medicineKg: 1_000 },
    });

    expect(valid.moneyDucats).toBe(12);
    expect(valid.stores).toEqual({
      waterKg: 24_000,
      provisionsKg: 18_000,
      repairStoresKg: 8_000,
      medicineKg: 1_000,
    });
    expect(() => applyCommand(state, {
      type: "set_lisbon_outfitting",
      allocation: { waterKg: 24_001, provisionsKg: 0, repairStoresKg: 0, medicineKg: 0 },
    })).toThrow("water exceeds its 24000 kg cap");
    expect(() => applyCommand(state, {
      type: "set_lisbon_outfitting",
      allocation: { waterKg: 24_000, provisionsKg: 18_000, repairStoresKg: 8_000, medicineKg: 2_000 },
    })).toThrow("300 ducat");
  });

  it("rejects an invalid outfitting transaction without changing any byte or PRNG word", () => {
    const state = createSurvivalState({ contentVersion: "wp2-test", runSeed: "atomic-outfitting" });
    const before = canonicalState(state);
    const prng = state.prng;

    expect(() => applyCommand(state, {
      type: "set_lisbon_outfitting",
      allocation: { waterKg: -1, provisionsKg: 0, repairStoresKg: 0, medicineKg: 0 },
    })).toThrow(SimulationValidationError);
    expect(canonicalState(state)).toBe(before);
    expect(state.prng).toEqual(prng);
  });

  it("carries unspent money and creates dated Lisbon batches only on departure", () => {
    const prepared = outfitted("departure-money");
    expect(prepared.survival.batches.water).toEqual([]);
    const state = applyCommand(prepared, { type: "depart_lisbon" });

    expect(state.moneyDucats).toBe(108);
    expect(state.survival.lifecycle).toBe("underway");
    expect(state.survival.location).toBe("at_sea");
    expect(state.survival.batches.water).toMatchObject([
      { store: "water", source: "lisbon", acquiredDate: "1488-04-01", remainingKg: 20_000 },
    ]);
    expect(state.survival.batches.provisions).toMatchObject([
      { store: "provisions", source: "lisbon", acquiredDate: "1488-04-01", remainingKg: 12_000 },
    ]);
  });
});

describe("WP2 dated stores, rationing, and spoilage", () => {
  it("consumes exactly 600 kg water and 300 kg provisions over four normal 25-crew days", () => {
    const initial = departed("four-normal-days");
    let state = initial;
    for (let day = 0; day < 4; day += 1) state = advanceDay(state, fixedEnvironment());

    expect(initial.stores.waterKg - state.stores.waterKg).toBe(600);
    expect(initial.stores.provisionsKg - state.stores.provisionsKg).toBe(300);
  });

  it("consumes Lisbon water and provision batches before later Cape Verde batches", () => {
    let state = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "fifo",
      date: "1488-04-02",
      acquiredDate: "1488-04-01",
      waterKg: 1_000,
      provisionsKg: 1_000,
      repairStoresKg: 0,
      medicineKg: 0,
      moneyDucats: 20,
    });
    state = applyCommand(state, { type: "purchase_at_cape_verde", store: "water", quantityKg: 500 });
    state = applyCommand(state, { type: "purchase_at_cape_verde", store: "provisions", quantityKg: 500 });
    state = applyCommand(state, { type: "rest_at_cape_verde" });

    expect(state.survival.batches.water.map((batch) => batch.remainingKg)).toEqual([850, 500]);
    expect(state.survival.batches.provisions.map((batch) => batch.remainingKg)).toEqual([925, 500]);
  });

  it("starts provision spoilage only after day 45 and uses ceiling-kilogram arithmetic", () => {
    let state = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "spoilage-boundary",
      date: "1488-05-15",
      acquiredDate: "1488-04-01",
      crewCount: 0,
      ableCrew: 0,
      waterKg: 1,
      provisionsKg: 1_001,
      repairStoresKg: 0,
      medicineKg: 0,
    });
    state = applyCommand(state, { type: "careen_day_at_cape_verde" });
    expect(state.date).toBe("1488-05-16");
    expect(state.stores.provisionsKg).toBe(1_001);
    state = applyCommand(state, { type: "careen_day_at_cape_verde" });

    expect(state.date).toBe("1488-05-17");
    expect(state.stores.provisionsKg).toBe(999);
    const entry = state.canonicalLog.at(-1);
    expect(entry?.type === "survival_day" && entry.provisionsSpoiledKg).toBe(2);
  });

  it("never creates provision mass across repeated deterministic spoilage", () => {
    let state = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "spoilage-conservation",
      date: "1488-06-01",
      acquiredDate: "1488-04-01",
      crewCount: 0,
      ableCrew: 0,
      waterKg: 1,
      provisionsKg: 999,
      repairStoresKg: 0,
      medicineKg: 0,
    });
    let previous = state.stores.provisionsKg;
    for (let day = 0; day < 4; day += 1) {
      state = applyCommand(state, { type: "careen_day_at_cape_verde" });
      expect(state.stores.provisionsKg).toBeLessThan(previous);
      expect(state.stores.provisionsKg).toBeGreaterThanOrEqual(0);
      previous = state.stores.provisionsKg;
    }
  });

  it("keeps old water mass while exposing sour-water pressure", () => {
    const initial = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "sour-water",
      date: "1488-05-16",
      acquiredDate: "1488-04-01",
      crewCount: 0,
      ableCrew: 0,
      waterKg: 1_000,
      provisionsKg: 1,
      repairStoresKg: 0,
      medicineKg: 0,
    });
    const state = applyCommand(initial, { type: "careen_day_at_cape_verde" });

    expect(state.stores.waterKg).toBe(1_000);
    expect(state.survival.warnings.map((warning) => warning.code)).toContain("sour_water");
  });

  it("preserves the authored combined reduced-ration multipliers and consequences", () => {
    let state = departed("reduced-rations");
    state = applyCommand(state, { type: "set_ration_policy", policy: "reduced_both" });
    const before = state;
    state = advanceDay(state, fixedEnvironment());

    expect(before.stores.waterKg - state.stores.waterKg).toBe(113);
    expect(before.stores.provisionsKg - state.stores.provisionsKg).toBe(38);
    expect(before.crew.healthBps - state.crew.healthBps).toBe(400);
    expect(before.crew.moraleBps - state.crew.moraleBps).toBe(400);
  });
});

describe("WP2 Cape Verde finite port actions", () => {
  it("atomically enforces money, capacity, store caps, and finite stock", () => {
    let state = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "cape-purchase",
      waterKg: 23_000,
      provisionsKg: 0,
      repairStoresKg: 0,
      medicineKg: 0,
      moneyDucats: 10,
    });
    state = applyCommand(state, { type: "purchase_at_cape_verde", store: "water", quantityKg: 1_000 });
    expect(state.stores.waterKg).toBe(24_000);
    expect(state.moneyDucats).toBe(7);
    expect(state.survival.capeVerdeStock.waterKg).toBe(23_000);
    const before = canonicalState(state);
    expect(() => applyCommand(state, {
      type: "purchase_at_cape_verde",
      store: "water",
      quantityKg: 1,
    })).toThrow("cap");
    expect(canonicalState(state)).toBe(before);

    const poor = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "poor-port", moneyDucats: 0,
    });
    expect(() => applyCommand(poor, {
      type: "purchase_at_cape_verde", store: "medicine", quantityKg: 1,
    })).toThrow("money");
  });

  it("does not refresh Cape Verde stock after leaving and returning", () => {
    let state = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "finite-return-stock",
      moneyDucats: 20,
    });
    state = applyCommand(state, { type: "purchase_at_cape_verde", store: "water", quantityKg: 1_000 });
    const remaining = state.survival.capeVerdeStock.waterKg;
    state = applyCommand(state, { type: "leave_cape_verde_port" });
    state = advanceDay(state, fixedEnvironment(0));
    expect(state.navigation.lastLandfall).toMatchObject({
      kind: "recognised",
      landmarkId: "landmark.cape-verde-santiago",
    });
    state = applyCommand(state, { type: "enter_cape_verde_port" });

    expect(state.survival.capeVerdeStock.waterKg).toBe(remaining);
  });

  it("commits one rest day, consumes stores and money, makes no movement, and caps recovery", () => {
    const initial = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "port-rest",
      healthBps: 9_900,
      moraleBps: 9_800,
      moneyDucats: 10,
    });
    const state = applyCommand(initial, { type: "rest_at_cape_verde" });

    expect(state.committedDay).toBe(1);
    expect(state.date).toBe("1488-04-02");
    expect(initial.stores.waterKg - state.stores.waterKg).toBe(150);
    expect(initial.stores.provisionsKg - state.stores.provisionsKg).toBe(75);
    expect(state.moneyDucats).toBe(5);
    expect(state.crew.healthBps).toBe(10_000);
    expect(state.crew.moraleBps).toBe(10_000);
    expect(state.truePosition).toEqual(initial.truePosition);
    expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
  });
});

describe("WP2 repair, fouling, and careening", () => {
  it("spends 250 kg and restores 500 bps during an at-sea no-movement repair day", () => {
    const departedState = departed("at-sea-repair");
    const initial = overrideFixture(departedState, { ship: { mastBps: 9_000 } });
    const state = applyCommand(initial, { type: "repair_day", component: "mast", location: "at_sea" });

    expect(state.stores.repairStoresKg).toBe(initial.stores.repairStoresKg - 250);
    expect(state.ship.mastBps).toBe(9_500);
    expect(state.truePosition).toEqual(initial.truePosition);
    expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
    expect(state.prng).toEqual(initial.prng);
    expect(state.navigation.environmentPrng).toEqual(initial.navigation.environmentPrng);
  });

  it("spends 500 kg and restores 1,500 bps during a Cape Verde no-movement repair day", () => {
    const initial = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "port-repair",
      hullBps: 8_000,
      repairStoresKg: 2_000,
    });
    const state = applyCommand(initial, {
      type: "repair_day", component: "hull", location: "cape_verde",
    });

    expect(state.stores.repairStoresKg).toBe(1_500);
    expect(state.ship.hullBps).toBe(9_500);
    expect(state.truePosition).toEqual(initial.truePosition);
  });

  it("rejects full, under-supplied, and wrong-location repair commands atomically", () => {
    const full = departed("invalid-repair");
    const before = canonicalState(full);
    expect(() => applyCommand(full, {
      type: "repair_day", component: "mast", location: "at_sea",
    })).toThrow("full condition");
    expect(canonicalState(full)).toBe(before);

    const noStores = overrideFixture(full, {
      ship: { mastBps: 9_000 },
    });
    const noStoresState = {
      ...noStores,
      stores: { ...noStores.stores, repairStoresKg: 0 },
    } as SurvivalSimulationState;
    expect(() => applyCommand(noStoresState, {
      type: "repair_day", component: "mast", location: "at_sea",
    })).toThrow("insufficient repair stores");

    const port = createCapeVerdePortFixtureState({ contentVersion: "wp2-test", runSeed: "wrong-place", mastBps: 9_000 });
    expect(() => applyCommand(port, {
      type: "repair_day", component: "mast", location: "at_sea",
    })).toThrow("location");
  });

  it("adds 5 bps of tropical fouling per day and caps at 1,500 bps", () => {
    let growing = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "fouling-growth", foulingSpeedLossBps: 0,
    });
    growing = applyCommand(growing, { type: "leave_cape_verde_port" });
    growing = advanceDay(growing, fixedEnvironment());
    expect(growing.survival.foulingSpeedLossBps).toBe(5);

    let capped = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "fouling-cap", foulingSpeedLossBps: 1_495,
    });
    capped = applyCommand(capped, { type: "leave_cape_verde_port" });
    capped = advanceDay(capped, fixedEnvironment());
    capped = advanceDay(capped, fixedEnvironment());
    expect(capped.survival.foulingSpeedLossBps).toBe(1_500);
  });

  it("reduces commanded speed without changing daily stores or exposing authored bounds", () => {
    let clean = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "fouling-speed", foulingSpeedLossBps: 0,
    });
    let fouled = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "fouling-speed", foulingSpeedLossBps: 1_000,
    });
    clean = applyCommand(clean, { type: "leave_cape_verde_port" });
    fouled = applyCommand(fouled, { type: "leave_cape_verde_port" });
    clean = advanceDay(clean, fixedEnvironment());
    fouled = advanceDay(fouled, fixedEnvironment());

    const cleanDistance = Math.abs(clean.estimatedPosition.yMnm + 1_430_000);
    const fouledDistance = Math.abs(fouled.estimatedPosition.yMnm + 1_430_000);
    expect(fouledDistance).toBeLessThan(cleanDistance);
    expect(fouled.stores).toEqual(clean.stores);
    const encoded = JSON.stringify(getPlayerView(fouled));
    expect(encoded).not.toContain("minimumYMnm");
    expect(encoded).not.toContain("-950000");
    expect(encoded).not.toContain("-3800000");
  });

  it("applies the exact min(1, able crew / 14) work factor above the stranded threshold", () => {
    let fourteen = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "crew-work-factor", ableCrew: 14,
    });
    let thirteen = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "crew-work-factor", ableCrew: 13,
    });
    fourteen = applyCommand(fourteen, { type: "leave_cape_verde_port" });
    thirteen = applyCommand(thirteen, { type: "leave_cape_verde_port" });
    fourteen = advanceDay(fourteen, fixedEnvironment());
    thirteen = advanceDay(thirteen, fixedEnvironment());

    const fourteenRun = Math.abs(fourteen.estimatedPosition.yMnm + 1_430_000);
    const thirteenRun = Math.abs(thirteen.estimatedPosition.yMnm + 1_430_000);
    expect(thirteenRun).toBeLessThan(fourteenRun);
    expect(Math.abs(thirteenRun * 14 - fourteenRun * 13)).toBeLessThanOrEqual(14);
  });

  it("commits six no-movement careening days, consumes stores, and resets fouling", () => {
    const initial = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test", runSeed: "careening", foulingSpeedLossBps: 700,
    });
    let state = initial;
    for (let day = 0; day < 6; day += 1) {
      state = applyCommand(state, { type: "careen_day_at_cape_verde" });
    }

    expect(state.committedDay).toBe(6);
    expect(initial.stores.waterKg - state.stores.waterKg).toBe(900);
    expect(initial.stores.provisionsKg - state.stores.provisionsKg).toBe(450);
    expect(state.truePosition).toEqual(initial.truePosition);
    expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
    expect(state.prng).toEqual(initial.prng);
    expect(state.navigation.environmentPrng).toEqual(initial.navigation.environmentPrng);
    expect(state.survival.foulingSpeedLossBps).toBe(0);
    expect(state.survival.careeningDaysCompleted).toBe(0);
    expect(state.canonicalLog.every((entry) => entry.type !== "survival_day" || entry.event === "none")).toBe(true);
  });
});

describe("WP2 warning, stranded, terminal, and projection contracts", () => {
  it("warns on the first zero-store day before applying pressure on the next day", () => {
    let state = departed("zero-warning-stage", {
      waterKg: 150,
      provisionsKg: 75,
      repairStoresKg: 1_000,
      medicineKg: 0,
    });
    const initialHealth = state.crew.healthBps;
    const initialMorale = state.crew.moraleBps;
    state = advanceDay(state, fixedEnvironment());

    expect(state.stores.waterKg).toBe(0);
    expect(state.stores.provisionsKg).toBe(0);
    expect(state.crew.healthBps).toBe(initialHealth);
    expect(state.crew.moraleBps).toBe(initialMorale);
    expect(state.survival.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["zero_water", "zero_provisions"]),
    );

    state = advanceDay(state, fixedEnvironment());
    expect(initialHealth - state.crew.healthBps).toBe(2_500);
    expect(initialMorale - state.crew.moraleBps).toBe(1_300);
    expect(state.survival.zeroWaterPressureDays).toBe(1);
    expect(state.survival.zeroProvisionPressureDays).toBe(1);
  });

  it("stops movement for zero mast, sails, rudder, or fewer than eight able crew without ship loss", () => {
    const base = departed("stranded-capability");
    const cases: readonly [Partial<SurvivalSimulationState["ship"]>, Partial<SurvivalSimulationState["crew"]>, string][] = [
      [{ mastBps: 0 }, {}, "mast_disabled"],
      [{ sailsBps: 0 }, {}, "sails_disabled"],
      [{ rudderBps: 0 }, {}, "rudder_disabled"],
      [{}, { able: 7 }, "insufficient_able_crew"],
    ];
    for (const [ship, crew, reason] of cases) {
      const initial = overrideFixture(base, { ship, crew });
      const state = advanceDay(initial, fixedEnvironment());
      expect(state.truePosition).toEqual(initial.truePosition);
      expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
      expect(state.survival.status).toMatchObject({ kind: "stranded", reason });
      expect(state.survival.status.kind).not.toBe("terminal");
    }
  });

  it("stages hull danger before ship loss and allows a repair response", () => {
    const initial = createCapeVerdePortFixtureState({
      contentVersion: "wp2-test",
      runSeed: "hull-staging",
      hullBps: 0,
      repairStoresKg: 2_000,
    });
    const warned = applyCommand(initial, { type: "careen_day_at_cape_verde" });
    expect(warned.survival.warnings.map((warning) => warning.code)).toContain("hull_danger");
    expect(warned.survival.status).toMatchObject({ kind: "stranded", reason: "hull_danger" });

    const repaired = applyCommand(warned, {
      type: "repair_day", component: "hull", location: "cape_verde",
    });
    expect(repaired.ship.hullBps).toBe(1_500);
    expect(repaired.survival.status.kind).toBe("active");

    const lost = applyCommand(warned, { type: "careen_day_at_cape_verde" });
    expect(lost.survival.status).toEqual({
      kind: "terminal",
      reason: "ship_lost",
      message: "The warned hull failure has resulted in loss of the ship.",
    });
  });

  it("uses crew-unable wording after warned zero-water pressure and never claims universal death", () => {
    let state = departed("crew-terminal", {
      waterKg: 0,
      provisionsKg: 10_000,
      repairStoresKg: 1_000,
      medicineKg: 0,
    });
    expect(state.survival.warnings.map((warning) => warning.code)).toContain("zero_water");
    for (let day = 0; day < 5; day += 1) state = advanceDay(state, fixedEnvironment());

    expect(state.crew.healthBps).toBe(0);
    expect(state.survival.status).toEqual({
      kind: "terminal",
      reason: "crew_unable_to_continue",
      message: "The pooled crew is unable to continue the expedition.",
    });
    expect(JSON.stringify(state.survival.status).toLowerCase()).not.toContain("everyone died");
  });

  it("represents voluntary return and objective abandonment whenever the ship can sail", () => {
    let state = departed("intent-representation");
    state = applyCommand(state, { type: "set_expedition_intent", intent: "return_to_lisbon" });
    expect(state.survival.expeditionIntent).toBe("return_to_lisbon");
    state = applyCommand(state, { type: "set_expedition_intent", intent: "objective_abandoned" });
    expect(state.survival.expeditionIntent).toBe("objective_abandoned");
  });

  it("keeps new hidden truth, PRNG state, region bounds, and mutiny paths out of normal view/logs", () => {
    const initial = overrideFixture(departed("hidden-survival"), {
      truePosition: { xMnm: 123_456, yMnm: -2_000_000 },
      estimatedPosition: { xMnm: 100_000, yMnm: -1_900_000 },
    });
    const state = advanceDay(initial, fixedEnvironment());
    const encoded = JSON.stringify(getPlayerView(state));

    expect(encoded).not.toContain("truePosition");
    expect(encoded).not.toContain("environmentPrng");
    expect(encoded).not.toContain('"prng"');
    expect(encoded).not.toContain("123456");
    expect(encoded).not.toContain("tropicalBounds");
    expect(encoded).not.toContain("minimumXMnm");
    expect(encoded.toLowerCase()).not.toContain("mutiny");
  });
});
