import { describe, expect, it } from "vitest";

import {
  LANDMARK_IDS,
  SOUTH_ATLANTIC_CURRENT,
  SOUTH_ATLANTIC_CURRENT_ID,
  advanceDay,
  authoredAtlanticEnvironment,
  createNavigationState,
  createStartingNavigationKnowledge,
  getPlayerView,
  pointOfSailForHeading,
  type EnvironmentProvider,
  type NavigationFact,
  type PositionMnm,
  type WeatherKind,
} from "../src/index.js";

interface FixedEnvironmentOptions {
  readonly weather?: WeatherKind;
  readonly pointOfSailPermille?: number;
  readonly weatherPermille?: number;
  readonly uncertaintyPermille?: number;
  readonly tackingUncertaintyPermille?: number;
  readonly trueCurrentMnm?: PositionMnm;
  readonly knownCurrentMnm?: PositionMnm;
  readonly noonObservation?: "clear" | "heavy_swell" | "overcast" | "none";
  readonly sightRadiusMnm?: number;
}

function fixedEnvironment(options: FixedEnvironmentOptions = {}): EnvironmentProvider {
  return (context) => {
    if (context.navigation === null) throw new Error("navigation fixture requires v2 state");
    const weather = options.weather ?? "fair_clear";
    const calm = weather === "calm";
    return {
      schema: "wp1-navigation-environment-v1",
      id: `fixture:${weather}`,
      pointOfSailPermille: options.pointOfSailPermille ?? (calm ? 0 : 1_000),
      weatherPermille: options.weatherPermille ?? (calm ? 0 : 1_000),
      uncertaintyPermille: options.uncertaintyPermille ?? 1_000,
      tackingUncertaintyPermille: options.tackingUncertaintyPermille ?? 1_000,
      trueCurrentMnm: options.trueCurrentMnm ?? { xMnm: 0, yMnm: 0 },
      knownCurrentMnm: options.knownCurrentMnm ?? { xMnm: 0, yMnm: 0 },
      leewayMnm: { xMnm: 0, yMnm: 0 },
      observedWeather: weather,
      observedWind: {
        directionConvention: "from",
        fromHeading: calm ? null : "NE",
        strength: calm ? "calm" : "moderate",
      },
      noonObservation: options.noonObservation ?? "none",
      sightRadiusMnm: options.sightRadiusMnm ?? 20_000,
      nextWeatherState: {
        kind: weather,
        daysInState: context.navigation.weatherState.kind === weather
          ? context.navigation.weatherState.daysInState + 1
          : 1,
      },
      nextEnvironmentPrng: context.navigation.environmentPrng,
    };
  };
}

function currentFact(confidence: number, status: "observed" | "confirmed"): NavigationFact {
  return {
    id: SOUTH_ATLANTIC_CURRENT_ID,
    type: "current",
    status,
    confidence,
    claimedVectorMnmPerDay: { ...SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay },
  };
}

describe("WP1 wind, movement, and authored current", () => {
  it("uses wind-from semantics for representative 16-point headings", () => {
    expect(pointOfSailForHeading("NE", "NE")).toEqual({
      kind: "automatic_tacking",
      speedPermille: 350,
      uncertaintyPermille: 1_250,
    });
    expect(pointOfSailForHeading("N", "NE").kind).toBe("automatic_tacking");
    expect(pointOfSailForHeading("NNW", "NE").speedPermille).toBe(500);
    expect(pointOfSailForHeading("NW", "NE").speedPermille).toBe(900);
    expect(pointOfSailForHeading("SW", "NE").speedPermille).toBe(1_000);
    expect(pointOfSailForHeading("SW", null)).toEqual({
      kind: "calm",
      speedPermille: 0,
      uncertaintyPermille: 1_000,
    });
  });

  it("applies automatic-tacking speed and uncertainty modifiers", () => {
    const initial = createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "tacking-modifiers",
      heading: "E",
      truePosition: { xMnm: -1_000_000, yMnm: -1_000_000 },
    });
    const tacking = advanceDay(initial, fixedEnvironment({
      pointOfSailPermille: 350,
      tackingUncertaintyPermille: 1_250,
    }));
    const running = advanceDay(initial, fixedEnvironment());

    expect(tacking.uncertainty.eastWestMnm).toBe(12_000);
    expect(running.uncertainty.eastWestMnm).toBe(9_600);
    expect(Math.abs(tacking.estimatedPosition.xMnm - initial.estimatedPosition.xMnm))
      .toBeLessThan(Math.abs(running.estimatedPosition.xMnm - initial.estimatedPosition.xMnm));
  });

  it("advances days and stores while calm produces no commanded movement", () => {
    const initial = createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "calm-stores",
      truePosition: { xMnm: -1_000_000, yMnm: -1_000_000 },
    });
    const state = advanceDay(initial, fixedEnvironment({ weather: "calm" }));

    expect(state.truePosition).toEqual(initial.truePosition);
    expect(state.estimatedPosition).toEqual(initial.estimatedPosition);
    expect(state.committedDay).toBe(1);
    expect(state.date).toBe("1488-04-02");
    expect(initial.stores.waterKg - state.stores.waterKg).toBe(150);
    expect(initial.stores.provisionsKg - state.stores.provisionsKg).toBe(75);
  });

  it("keeps an unknown current out of the estimate", () => {
    const initial = createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "unknown-current",
      truePosition: { xMnm: 0, yMnm: -2_000_000 },
      heading: "S",
    });
    const state = advanceDay(initial, authoredAtlanticEnvironment);
    const trueDeltaX = state.truePosition.xMnm - initial.truePosition.xMnm;
    const estimatedDeltaX = state.estimatedPosition.xMnm - initial.estimatedPosition.xMnm;

    expect(trueDeltaX).not.toBe(estimatedDeltaX);
    expect(state.navigation.knowledge.some((fact) => fact.id === SOUTH_ATLANTIC_CURRENT_ID)).toBe(false);
  });

  it("adds a confirmed charted current to the estimate", () => {
    const configuration = {
      contentVersion: "wp1-test-v1",
      runSeed: "confirmed-current",
      truePosition: { xMnm: 0, yMnm: -2_000_000 },
      heading: "S" as const,
    };
    const unknown = advanceDay(createNavigationState(configuration), authoredAtlanticEnvironment);
    const confirmed = advanceDay(createNavigationState({
      ...configuration,
      knowledge: [...createStartingNavigationKnowledge(), currentFact(70, "confirmed")],
    }), authoredAtlanticEnvironment);

    expect(confirmed.truePosition).toEqual(unknown.truePosition);
    expect(confirmed.estimatedPosition.xMnm - unknown.estimatedPosition.xMnm)
      .toBe(SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay.xMnm);
  });

  it("shows but does not automatically apply a sub-70 observed current", () => {
    const configuration = {
      contentVersion: "wp1-test-v1",
      runSeed: "observed-current",
      truePosition: { xMnm: 0, yMnm: -2_000_000 },
      heading: "S" as const,
    };
    const unknown = advanceDay(createNavigationState(configuration), authoredAtlanticEnvironment);
    const observed = advanceDay(createNavigationState({
      ...configuration,
      knowledge: [...createStartingNavigationKnowledge(), currentFact(60, "observed")],
    }), authoredAtlanticEnvironment);
    const view = getPlayerView(observed);

    expect(observed.estimatedPosition).toEqual(unknown.estimatedPosition);
    expect("navigation" in view && view.navigation.knownFacts.some(
      (fact) => fact.id === SOUTH_ATLANTIC_CURRENT_ID && fact.confidence === 60,
    )).toBe(true);
  });
});

describe("WP1 observations and landfall", () => {
  const observationConfig = {
    contentVersion: "wp1-test-v1",
    runSeed: "observation-fixture",
    truePosition: { xMnm: -1_100_000, yMnm: -1_100_000 },
    estimatedPosition: { xMnm: -900_000, yMnm: -900_000 },
    uncertainty: { eastWestMnm: 80_000, northSouthMnm: 70_000 },
  } as const;

  it("resets only north-south uncertainty to 15 nm on a clear noon sight", () => {
    const state = advanceDay(
      createNavigationState(observationConfig),
      fixedEnvironment({ weatherPermille: 0, noonObservation: "clear" }),
    );

    expect(state.uncertainty).toEqual({ eastWestMnm: 89_600, northSouthMnm: 15_000 });
    expect(state.estimatedPosition.xMnm).toBe(observationConfig.estimatedPosition.xMnm);
    expect(state.estimatedPosition.yMnm).toBe(state.truePosition.yMnm);
    expect(state.navigation.lastObservation.kind).toBe("clear_noon");
  });

  it("resets north-south uncertainty to 40 nm in heavy swell", () => {
    const state = advanceDay(
      createNavigationState(observationConfig),
      fixedEnvironment({
        weather: "rough_heavy_swell",
        weatherPermille: 0,
        uncertaintyPermille: 1_500,
        noonObservation: "heavy_swell",
        sightRadiusMnm: 8_000,
      }),
    );

    expect(state.uncertainty.eastWestMnm).toBe(94_400);
    expect(state.uncertainty.northSouthMnm).toBe(40_000);
    expect(state.navigation.lastObservation.kind).toBe("heavy_swell_noon");
  });

  it("performs no latitude reset under overcast", () => {
    const state = advanceDay(
      createNavigationState(observationConfig),
      fixedEnvironment({
        weather: "overcast",
        weatherPermille: 0,
        uncertaintyPermille: 1_500,
        noonObservation: "overcast",
        sightRadiusMnm: 8_000,
      }),
    );

    expect(state.estimatedPosition).toEqual(observationConfig.estimatedPosition);
    expect(state.uncertainty).toEqual({ eastWestMnm: 94_400, northSouthMnm: 77_200 });
    expect(state.navigation.lastObservation.kind).toBe("overcast_no_sight");
  });

  it("sights and recognises Cape Verde using true-position geometry", () => {
    const initial = createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "cape-verde-fix",
      truePosition: { xMnm: -770_000, yMnm: -1_430_000 },
      estimatedPosition: { xMnm: -620_000, yMnm: -1_300_000 },
      uncertainty: { eastWestMnm: 200_000, northSouthMnm: 100_000 },
    });
    const trueBefore = { ...initial.truePosition };
    const state = advanceDay(
      initial,
      fixedEnvironment({ weatherPermille: 0, noonObservation: "none" }),
    );

    expect(state.navigation.lastLandfall).toEqual({
      kind: "recognised",
      landmarkId: LANDMARK_IDS.capeVerde,
    });
    expect(state.estimatedPosition).toEqual({ xMnm: -770_000, yMnm: -1_430_000 });
    expect(state.uncertainty).toEqual({ eastWestMnm: 5_000, northSouthMnm: 5_000 });
    expect(state.truePosition).toEqual(trueBefore);
  });

  it("reports a missed landmark when only the estimate reaches its symbol", () => {
    const state = advanceDay(createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "missed-cape-verde",
      truePosition: { xMnm: -500_000, yMnm: -1_430_000 },
      estimatedPosition: { xMnm: -770_000, yMnm: -1_430_000 },
    }), fixedEnvironment({ weatherPermille: 0, noonObservation: "none" }));

    expect(state.navigation.lastLandfall).toEqual({
      kind: "missed",
      landmarkId: LANDMARK_IDS.capeVerde,
    });
    expect(state.navigation.interruption).toEqual({ kind: "landfall", result: "missed" });
  });

  it("does not recognise the initially rumoured Cape as a confirmed fix", () => {
    const state = advanceDay(createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "rumoured-cape",
      truePosition: { xMnm: 1_660_000, yMnm: -4_390_000 },
      estimatedPosition: { xMnm: 1_500_000, yMnm: -4_200_000 },
    }), fixedEnvironment({ weatherPermille: 0, noonObservation: "none" }));

    expect(state.navigation.lastLandfall).toEqual({
      kind: "visible_unrecognised",
      knownFactId: LANDMARK_IDS.capeGoal,
    });
    expect(state.estimatedPosition).not.toEqual({ xMnm: 1_660_000, yMnm: -4_390_000 });
  });
});

describe("WP1 hidden-information projection", () => {
  it("keeps true position, unknown current data, and environment state out of view and logs", () => {
    const state = advanceDay(createNavigationState({
      contentVersion: "wp1-test-v1",
      runSeed: "wp1-hidden-truth",
      truePosition: { xMnm: 0, yMnm: -2_000_000 },
    }), authoredAtlanticEnvironment);
    const encoded = JSON.stringify(getPlayerView(state));

    expect(encoded).not.toContain("truePosition");
    expect(encoded).not.toContain("trueCurrentMnm");
    expect(encoded).not.toContain("environmentPrng");
    expect(encoded).not.toContain("claimedVectorMnmPerDay");
    expect(encoded).not.toContain(SOUTH_ATLANTIC_CURRENT_ID);
    expect(encoded).not.toContain("minimumXMnm");
    expect(encoded).not.toContain("maximumYMnm");
  });
});
