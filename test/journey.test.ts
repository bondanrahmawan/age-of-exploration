import { describe, expect, it } from "vitest";

import {
  EAST_WEST_OBSERVATION_FLOOR_MNM,
  EAST_WEST_OBSERVATION_TIERS,
  JOURNEY_STATE_FORMAT,
  LANDMARK_IDS,
  SimulationValidationError,
  advanceUntilInterrupted,
  applyCommand,
  canonicalState,
  createJourneyFixtureState,
  createJourneyState,
  eastWestObservationRefusal,
  getPlayerView,
  hashState,
  holdUsedKg,
  type EnvironmentProvider,
  type JourneySimulationState,
} from "../src/index.js";

const NO_MOVEMENT_ENVIRONMENT: EnvironmentProvider = (context) => {
  if (context.navigation === null) throw new Error("journey fixture requires navigation state");
  return {
    schema: "wp1-navigation-environment-v1",
    id: "wp3-test:no-movement",
    pointOfSailPermille: 0,
    weatherPermille: 0,
    uncertaintyPermille: 1_000,
    tackingUncertaintyPermille: 1_000,
    trueCurrentMnm: { xMnm: 0, yMnm: 0 },
    knownCurrentMnm: { xMnm: 0, yMnm: 0 },
    leewayMnm: { xMnm: 0, yMnm: 0 },
    observedWeather: "fair_clear",
    observedWind: { directionConvention: "from", fromHeading: "NE", strength: "moderate" },
    noonObservation: "none",
    sightRadiusMnm: 20_000,
    nextWeatherState: { kind: "fair_clear", daysInState: context.navigation.weatherState.daysInState + 1 },
    nextEnvironmentPrng: context.navigation.environmentPrng,
  };
};

function cape(seed: string, overrides: Partial<Parameters<typeof createJourneyFixtureState>[0]> = {}) {
  const visible = createJourneyFixtureState({
    contentVersion: "wp3-journey-v1",
    runSeed: seed,
    location: "cape",
    dailyEventChancePermille: 0,
    ...overrides,
  });
  return applyCommand(visible, { type: "recognise_cape_landfall" });
}

function capeVerde(seed: string, overrides: Partial<Parameters<typeof createJourneyFixtureState>[0]> = {}) {
  return createJourneyFixtureState({
    contentVersion: "wp3-journey-v1",
    runSeed: seed,
    location: "cape_verde",
    dailyEventChancePermille: 0,
    ...overrides,
  });
}

function resolvePending(state: JourneySimulationState): JourneySimulationState {
  const pending = state.journey.pendingEvent;
  if (pending === null) return state;
  const available = pending.choices.find((item) => item.available);
  if (available === undefined) throw new Error("test event has no available choice");
  return applyCommand(state, { type: "choose_event", eventId: pending.eventId, choiceId: available.id });
}

describe("WP3 explicit v4 boundary and authored locations", () => {
  it("creates v4 only through the clearly named journey constructor", () => {
    const state = createJourneyState({ contentVersion: "wp3-journey-v1", runSeed: "constructor" });
    expect(state.format).toBe(JOURNEY_STATE_FORMAT);
    expect(state.journey).toMatchObject({
      eventModel: "authored-journey-events-v1",
      location: "lisbon",
      outcome: null,
    });
  });

  it("recognises the Cape only after true-position landfall, never estimated-marker proximity", () => {
    let falseMarker = createJourneyFixtureState({
      contentVersion: "wp3-journey-v1",
      runSeed: "estimated-cape-only",
      location: "at_sea",
      truePosition: { xMnm: 1_200_000, yMnm: -4_390_000 },
      estimatedPosition: { xMnm: 1_660_000, yMnm: -4_390_000 },
      dailyEventChancePermille: 0,
    });
    falseMarker = applyCommand(falseMarker, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(falseMarker.navigation.lastLandfall).toEqual({ kind: "missed", landmarkId: LANDMARK_IDS.capeGoal });
    expect(() => applyCommand(falseMarker, { type: "recognise_cape_landfall" })).toThrow("true-position");

    const recognised = cape("true-cape");
    expect(recognised.journey.objectiveAchieved).toBe(true);
    expect(recognised.journey.location).toBe("cape");
    expect(recognised.navigation.lastLandfall).toEqual({ kind: "recognised", landmarkId: LANDMARK_IDS.capeGoal });
  });

  it("sells exactly one seeded confidence-25 rumour for 10 ducats and rejects failures atomically", () => {
    const firstInitial = capeVerde("rumour-seed", { moneyDucats: 20 });
    const secondInitial = capeVerde("rumour-seed", { moneyDucats: 20 });
    const first = applyCommand(firstInitial, { type: "purchase_cape_verde_rumour" });
    const second = applyCommand(secondInitial, { type: "purchase_cape_verde_rumour" });
    expect(first.moneyDucats).toBe(10);
    expect(first.journey.facts).toHaveLength(1);
    expect(first.journey.facts[0]).toMatchObject({ confidence: 25, status: "rumoured" });
    expect(first.journey.facts[0]).toEqual(second.journey.facts[0]);
    expect(first.journey.eventPrng).toEqual(second.journey.eventPrng);

    const repeatedBytes = canonicalState(first);
    expect(() => applyCommand(first, { type: "purchase_cape_verde_rumour" })).toThrow("only one");
    expect(canonicalState(first)).toBe(repeatedBytes);
    const poor = capeVerde("poor-rumour", { moneyDucats: 9 });
    const poorBytes = canonicalState(poor);
    expect(() => applyCommand(poor, { type: "purchase_cape_verde_rumour" })).toThrow("10 ducat");
    expect(canonicalState(poor)).toBe(poorBytes);
  });

  it("commits two no-movement survey days with normal consumption, then creates facts once", () => {
    const initial = cape("cape-survey");
    const truePosition = { ...initial.truePosition };
    let state = applyCommand(initial, { type: "survey_cape_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.journey.capeSurveyDaysCompleted).toBe(1);
    expect(state.journey.facts).toEqual([]);
    state = applyCommand(state, { type: "survey_cape_day" }, NO_MOVEMENT_ENVIRONMENT);

    expect(state.committedDay).toBe(2);
    expect(initial.stores.waterKg - state.stores.waterKg).toBe(300);
    expect(initial.stores.provisionsKg - state.stores.provisionsKg).toBe(150);
    expect(state.truePosition).toEqual(truePosition);
    expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
    expect(state.journey.surveyedLandmarkIds).toEqual([LANDMARK_IDS.capeGoal]);
    expect(state.journey.facts.map((fact) => fact.id)).toEqual([
      "fact.cape-landmark-survey", "fact.cape-water-source", "fact.cape-hazard",
    ]);
    expect(() => applyCommand(state, { type: "survey_cape_day" })).toThrow("only once");
  });

  it("gates Cape water, commits one normal day, collects at most 12000 kg, and respects capacity", () => {
    const unsurveyed = cape("water-gate");
    expect(() => applyCommand(unsurveyed, { type: "collect_cape_water" })).toThrow("water-source fact");

    let state = applyCommand(unsurveyed, { type: "survey_cape_day" }, NO_MOVEMENT_ENVIRONMENT);
    state = applyCommand(state, { type: "survey_cape_day" }, NO_MOVEMENT_ENVIRONMENT);
    const before = state;
    state = applyCommand(state, { type: "collect_cape_water" }, NO_MOVEMENT_ENVIRONMENT);
    const entry = state.canonicalLog.at(-1);
    expect(entry).toMatchObject({
      type: "journey_day",
      activity: { kind: "cape_water_collection", waterCollectedKg: 12_000 },
    });
    expect(state.stores.waterKg).toBe(before.stores.waterKg - 150 + 12_000);
    expect(state.truePosition).toEqual(before.truePosition);
    expect(holdUsedKg(state.stores)).toBeLessThanOrEqual(52_000);

    let full = cape("water-capacity", {
      waterKg: 24_000,
      provisionsKg: 18_000,
      repairStoresKg: 8_000,
      medicineKg: 2_000,
      facts: [{
        id: "fact.cape-water-source", type: "water_source", status: "observed", confidence: 70,
        source: "fixture survey", observedDate: "1488-04-01", claim: "A usable source is known.",
      }],
    });
    full = applyCommand(full, { type: "collect_cape_water" }, NO_MOVEMENT_ENVIRONMENT);
    expect(full.stores.waterKg).toBe(24_000);
    expect((full.canonicalLog.at(-1) as { activity: { waterCollectedKg: number } }).activity.waterCollectedKg).toBe(150);
    expect(holdUsedKg(full.stores)).toBeLessThanOrEqual(52_000);
  });

  it("keeps the Cape non-trading and preserves Cape Verde port behavior", () => {
    const atCape = cape("no-cape-trade");
    expect(() => applyCommand(atCape, { type: "purchase_at_cape_verde", store: "water", quantityKg: 1_000 })).toThrow("Cape Verde");
    const port = capeVerde("existing-port", { moneyDucats: 20 });
    const purchased = applyCommand(port, { type: "purchase_at_cape_verde", store: "water", quantityKg: 1_000 });
    expect(purchased.stores.waterKg).toBe(port.stores.waterKg + 1_000);
  });
});

describe("WP3 day semantics, helper, outcomes, and projection", () => {
  it("allows events on repair, careen, and survey days without movement/environment draws", () => {
    const cases: readonly [JourneySimulationState, Parameters<typeof applyCommand>[1]][] = [
      [createJourneyFixtureState({
        contentVersion: "wp3-journey-v1", runSeed: "repair-event", location: "at_sea",
        truePosition: { xMnm: -300_000, yMnm: -2_200_000 }, estimatedPosition: { xMnm: -300_000, yMnm: -2_200_000 },
        mastBps: 8_000, dailyEventChancePermille: 1_000,
      }), { type: "repair_day", component: "mast", location: "at_sea" }],
      [capeVerde("careen-event", { dailyEventChancePermille: 1_000 }), { type: "careen_day_at_cape_verde" }],
      [cape("survey-event", { dailyEventChancePermille: 1_000 }), { type: "survey_cape_day" }],
    ];
    for (const [initial, command] of cases) {
      const movementPrng = initial.prng;
      const environmentPrng = initial.navigation.environmentPrng;
      const state = applyCommand(initial, command, NO_MOVEMENT_ENVIRONMENT) as JourneySimulationState;
      expect(state.truePosition).toEqual(initial.truePosition);
      expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
      expect(state.prng).toEqual(movementPrng);
      expect(state.navigation.environmentPrng).toEqual(environmentPrng);
      expect(state.journey.eventPrng).not.toEqual(initial.journey.eventPrng);
      expect(state.journey.pendingEvent).not.toBeNull();
      expect(state.journey.eventHistory).toHaveLength(1);
    }
  });

  it("makes advanceUntilInterrupted equivalent to repeated ordinary day commands", () => {
    const initial = createJourneyFixtureState({
      contentVersion: "wp3-journey-v1",
      runSeed: "until-equivalence",
      location: "at_sea",
      truePosition: { xMnm: -300_000, yMnm: -2_200_000 },
      estimatedPosition: { xMnm: -300_000, yMnm: -2_200_000 },
      dailyEventChancePermille: 0,
    });
    const automatic = advanceUntilInterrupted(initial, 5, NO_MOVEMENT_ENVIRONMENT);
    let manual = initial;
    for (let day = 0; day < 5; day += 1) {
      manual = applyCommand(manual, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    }
    expect(canonicalState(automatic)).toBe(canonicalState(manual));
  });

  it("resolves full success and partial return exactly once from true Lisbon landfall", () => {
    for (const objectiveAchieved of [true, false]) {
      const initial = createJourneyFixtureState({
        contentVersion: "wp3-journey-v1",
        runSeed: `return-${objectiveAchieved}`,
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: 0 },
        estimatedPosition: { xMnm: 100_000, yMnm: 100_000 },
        objectiveAchieved,
        dailyEventChancePermille: 0,
      });
      const returned = applyCommand(initial, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
      expect(returned.journey.outcome?.id).toBe(objectiveAchieved ? "full_success" : "partial_return");
      expect(returned.journey.location).toBe("lisbon");
      expect(() => applyCommand(returned, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT)).toThrow("resolved expedition");
    }
  });

  it("resolves warned terminal loss as objective failure and stops commands", () => {
    let state = createJourneyFixtureState({
      contentVersion: "wp3-journey-v1",
      runSeed: "terminal-loss",
      location: "at_sea",
      truePosition: { xMnm: -300_000, yMnm: -2_200_000 },
      estimatedPosition: { xMnm: -300_000, yMnm: -2_200_000 },
      hullBps: 0,
      dailyEventChancePermille: 0,
    });
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.survival.warnings.map((warning) => warning.code)).toContain("hull_danger");
    state = resolvePending(state);
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.journey.outcome).toMatchObject({ id: "objective_failure" });
    expect(() => applyCommand(state, { type: "set_heading", heading: "N" })).toThrow("resolved expedition");
  });

  it("reserves report_success but rejects it as unreachable until WP4", () => {
    const state = createJourneyState({ contentVersion: "wp3-journey-v1", runSeed: "report-boundary" });
    const invalid = {
      ...state,
      journey: {
        ...state.journey,
        outcome: {
          id: "report_success" as const,
          reason: "No WP4 report snapshot exists.",
          day: 0,
          objectiveStatus: "achieved" as const,
          crew: { ...state.crew },
          ship: { ...state.ship },
          stores: { ...state.stores },
          factsCarried: 0,
        },
      },
    };
    expect(() => hashState(invalid)).toThrow("reserved and unreachable before WP4");
  });

  it("keeps hidden truth, all PRNG states, secret event calculations, and future stages out of the player view", () => {
    const state = createJourneyFixtureState({
      contentVersion: "wp3-journey-v1",
      runSeed: "hidden-journey",
      location: "at_sea",
      truePosition: { xMnm: 123_456, yMnm: -2_345_678 },
      estimatedPosition: { xMnm: 111_000, yMnm: -2_300_000 },
      flags: ["mutiny_seizure_warned"],
      dailyEventChancePermille: 0,
    });
    const encoded = JSON.stringify(getPlayerView(state));
    expect(encoded).not.toContain("truePosition");
    expect(encoded).not.toContain("123456");
    expect(encoded).not.toContain("eventPrng");
    expect(encoded).not.toContain("environmentPrng");
    expect(encoded).not.toContain('"prng"');
    expect(encoded).not.toContain("dailyEventChancePermille");
    expect(encoded).not.toContain("firedThisLeg");
    expect(encoded).not.toContain("mutiny_seizure_warned");
  });
});

/** Grows the east-west band fast enough to demonstrate a narrowing without a long voyage. */
const WIDE_ERROR_ENVIRONMENT: EnvironmentProvider = (context) => {
  const base = NO_MOVEMENT_ENVIRONMENT(context);
  if (!("schema" in base)) throw new Error("wide-error fixture requires a navigation environment");
  return { ...base, uncertaintyPermille: 10_000, tackingUncertaintyPermille: 10_000 };
};

function atSea(
  seed: string,
  truePosition: { xMnm: number; yMnm: number },
  estimatedPosition = truePosition,
  eastWestMnm?: number,
) {
  return createJourneyFixtureState({
    contentVersion: "wp3-journey-v1",
    runSeed: seed,
    location: "at_sea",
    truePosition,
    estimatedPosition,
    ...(eastWestMnm === undefined ? {} : { uncertainty: { eastWestMnm, northSouthMnm: 20_000 } }),
    dailyEventChancePermille: 0,
  });
}

const OPEN_OCEAN = { xMnm: -2_500_000, yMnm: -3_000_000 };
const LAND_SIGNS = { xMnm: 700_000, yMnm: -3_000_000 };
const SHOALING = { xMnm: 1_150_000, yMnm: -3_000_000 };

/** No commanded run and no uncertainty growth, so a bracket can be watched on its own. */
const STILL_ENVIRONMENT: EnvironmentProvider = (context) => {
  const base = NO_MOVEMENT_ENVIRONMENT(context);
  if (!("schema" in base)) throw new Error("still fixture requires a navigation environment");
  return { ...base, uncertaintyPermille: 0, tackingUncertaintyPermille: 0 };
};

function widened(state: JourneySimulationState, days: number) {
  let next = state;
  for (let index = 0; index < days; index += 1) {
    next = applyCommand(next, { type: "advance_day" }, WIDE_ERROR_ENVIRONMENT) as JourneySimulationState;
  }
  return next;
}

/** Ordinary growth, for bands that must land between the floor and the entry bracket. */
function drifted(state: JourneySimulationState, days: number) {
  let next = state;
  for (let index = 0; index < days; index += 1) {
    next = applyCommand(next, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT) as JourneySimulationState;
  }
  return next;
}

function observe(state: JourneySimulationState, environment = NO_MOVEMENT_ENVIRONMENT) {
  return applyCommand(state, { type: "observation_day" }, environment) as JourneySimulationState;
}

function observationActivity(state: JourneySimulationState) {
  const entry = state.canonicalLog.at(-1);
  if (entry?.type !== "journey_day" || entry.activity.kind !== "east_west_observation") {
    throw new Error("the observation day must log its own activity");
  }
  return entry.activity;
}

describe("east-west observation days", () => {
  it("narrows the east-west band to the shoaling bracket and records why", () => {
    const wide = widened(atSea("shoaling", SHOALING), 3);
    expect(wide.uncertainty.eastWestMnm).toBeGreaterThan(200_000);
    const observed = observe(wide);
    expect(observed.uncertainty.eastWestMnm).toBe(200_000);
    expect(observed.journey.lastEastWestObservation).toEqual({
      kind: "shoaling_water",
      eastWestUncertaintyMnm: 200_000,
    });
    expect(observed.journey.observationDaysSpent).toBe(1);
    const entry = observed.canonicalLog.at(-1);
    expect(entry?.type).toBe("journey_day");
    if (entry?.type !== "journey_day" || entry.activity.kind !== "east_west_observation") {
      throw new Error("the observation day must log its own activity");
    }
    expect(entry.activity.eastWestUncertaintyAfterMnm).toBeLessThan(entry.activity.eastWestUncertaintyBeforeMnm);
  });

  it("gives the wider land-signs bracket further off the shelf", () => {
    const observed = observe(widened(atSea("signs", LAND_SIGNS), 3));
    expect(observed.uncertainty.eastWestMnm).toBe(600_000);
    expect(observed.journey.lastEastWestObservation.kind).toBe("land_signs");
  });

  it("returns open ocean far from the shelf and never converges on a longitude", () => {
    const wide = widened(atSea("offshore", OPEN_OCEAN), 3);
    const before = wide.uncertainty.eastWestMnm;
    const observed = observe(wide);
    expect(observed.journey.lastEastWestObservation).toEqual({ kind: "open_ocean" });
    expect(observed.journey.observationDaysSpent).toBe(1);
    expect(observed.uncertainty.eastWestMnm).toBeGreaterThan(before);
    expect(observed.estimatedPosition.xMnm).toBe(wide.estimatedPosition.xMnm);
    expect(observed.crew.moraleBps).toBeLessThan(wide.crew.moraleBps);

    // A second look from the same standing is not information, so the order is refused
    // rather than sold: the band offshore only ever grows.
    expect(() => observe(observed)).toThrow(SimulationValidationError);
    const sailed = drifted(observed, 1);
    const again = observe(sailed);
    expect(again.journey.lastEastWestObservation).toEqual({ kind: "open_ocean" });
    expect(again.uncertainty.eastWestMnm).toBeGreaterThan(observed.uncertainty.eastWestMnm);
  });

  it("corrects the estimate only as far as the bracket edge and never onto the truth", () => {
    const state = atSea("edge", SHOALING, { xMnm: SHOALING.xMnm - 900_000, yMnm: SHOALING.yMnm }, 900_000);
    const observed = observe(state);
    expect(observed.estimatedPosition.xMnm).toBe(SHOALING.xMnm - 200_000);
    expect(observed.estimatedPosition.xMnm).not.toBe(observed.truePosition.xMnm);
  });

  it("never widens a band that is already inside the bracket", () => {
    const observed = observe(atSea("tight", SHOALING, SHOALING, 96_000));
    expect(observed.uncertainty.eastWestMnm).toBeLessThan(200_000);
    const activity = observationActivity(observed);
    expect(activity.estimateCorrectionMnm).toBe(0);
    expect(activity.eastWestUncertaintyAfterMnm).toBeLessThanOrEqual(activity.eastWestUncertaintyBeforeMnm);
  });

  it("leaks the bracket but never the true position", () => {
    const observed = observe(atSea("projection", SHOALING, { xMnm: 900_000, yMnm: -3_000_000 }, 900_000));
    const encoded = JSON.stringify(getPlayerView(observed));
    expect(encoded).toContain("shoaling_water");
    expect(encoded).not.toContain("truePosition");
    expect(encoded).not.toContain(String(observed.truePosition.xMnm));
  });

  it("keeps paying for sustained work on the same ground, at a diminishing rate", () => {
    let state = observe(atSea("worked-shelf", SHOALING, SHOALING, 900_000), STILL_ENVIRONMENT);
    expect(state.uncertainty.eastWestMnm).toBe(200_000);

    const bands = [state.uncertainty.eastWestMnm];
    const steps: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const previous = state.uncertainty.eastWestMnm;
      state = observe(state, STILL_ENVIRONMENT);
      expect(state.uncertainty.eastWestMnm).toBeLessThan(previous);
      bands.push(state.uncertainty.eastWestMnm);
      steps.push(previous - state.uncertainty.eastWestMnm);
    }
    expect(bands).toEqual([200_000, 160_040, 133_387, 115_609, 103_751]);
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]!).toBeLessThan(steps[index - 1]!);
    }
    expect(state.journey.observationDaysSpent).toBe(5);
    expect(observationActivity(state).eastWestUncertaintyAfterMnm)
      .toBeLessThan(observationActivity(state).eastWestUncertaintyBeforeMnm);
  });

  it("stops at the tier floor and then refuses the order instead of selling the day", () => {
    let state = observe(atSea("floored-shelf", SHOALING, SHOALING, 900_000), STILL_ENVIRONMENT);
    for (let index = 0; index < 9; index += 1) {
      state = observe(state, STILL_ENVIRONMENT);
      expect(state.uncertainty.eastWestMnm).toBeGreaterThanOrEqual(EAST_WEST_OBSERVATION_FLOOR_MNM);
    }
    expect(state.uncertainty.eastWestMnm).toBe(EAST_WEST_OBSERVATION_FLOOR_MNM);
    expect(state.journey.observationDaysSpent).toBe(10);
    expect(() => observe(state, STILL_ENVIRONMENT)).toThrow(SimulationValidationError);
  });

  it("never lets the working floor beat the tier the ship is actually in", () => {
    let state = observe(atSea("signs-floor", LAND_SIGNS, LAND_SIGNS, 900_000), STILL_ENVIRONMENT);
    for (let index = 0; index < 20; index += 1) {
      try {
        state = observe(state, STILL_ENVIRONMENT);
      } catch {
        break;
      }
    }
    const landSignsFloor = EAST_WEST_OBSERVATION_TIERS
      .find((tier) => tier.kind === "land_signs")!.floorMnm;
    expect(state.uncertainty.eastWestMnm).toBe(landSignsFloor);
    expect(landSignsFloor).toBeGreaterThan(EAST_WEST_OBSERVATION_FLOOR_MNM);
    expect(() => observe(state, STILL_ENVIRONMENT)).toThrow(SimulationValidationError);
  });

  it("refuses an observation the reckoning is already too tight to need", () => {
    const state = atSea("already-tight", SHOALING);
    expect(state.uncertainty.eastWestMnm).toBeLessThanOrEqual(EAST_WEST_OBSERVATION_FLOOR_MNM);
    expect(() => observe(state)).toThrow(SimulationValidationError);
    expect(eastWestObservationRefusal(state.uncertainty, state.canonicalLog))
      .toContain("No sounding or land sign can better that");
  });

  it("spends no day, no stores, and no morale on a refused observation", () => {
    const state = observe(widened(atSea("refused-cost", OPEN_OCEAN), 3));
    const before = canonicalState(state);
    expect(() => observe(state)).toThrow(SimulationValidationError);
    expect(canonicalState(state)).toBe(before);
    expect(state.committedDay).toBe(observe(drifted(state, 1)).committedDay - 2);
  });

  it("refuses an observation day anywhere but at sea", () => {
    expect(() => applyCommand(capeVerde("port"), { type: "observation_day" }, NO_MOVEMENT_ENVIRONMENT))
      .toThrow(SimulationValidationError);
  });

  it("takes a landmark fix without letting a look-around finish the voyage", () => {
    const state = atSea("home-waters", { xMnm: 0, yMnm: 0 }, { xMnm: 400_000, yMnm: 0 }, 900_000);
    const observed = observe(state);
    expect(observed.navigation.lastLandfall).toEqual({
      kind: "recognised",
      landmarkId: LANDMARK_IDS.lisbon,
    });
    expect(observed.estimatedPosition.xMnm).toBe(0);
    expect(observed.journey.location).toBe("at_sea");
    expect(observed.journey.outcome).toBeNull();
  });

});
