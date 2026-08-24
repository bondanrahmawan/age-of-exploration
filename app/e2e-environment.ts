import {
  LANDMARK_IDS,
  LANDMARKS,
  SOUTH_ATLANTIC_CURRENT,
  type EnvironmentProvider,
} from "../src/index.js";

const landmarkPosition = (id: string) => ({ ...LANDMARKS.find((item) => item.id === id)!.centre });

const stillEnvironment: EnvironmentProvider = (context) => {
  if (context.navigation === null) throw new Error("E2E route requires a navigation state");
  return {
    schema: "wp1-navigation-environment-v1",
    id: "wp5-e2e:still",
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

function transit(context: Parameters<EnvironmentProvider>[0], target: Readonly<{ xMnm: number; yMnm: number }>, id: string) {
  if (context.navigation === null) throw new Error("E2E route requires a navigation state");
  const delta = { xMnm: target.xMnm - context.truePosition.xMnm, yMnm: target.yMnm - context.truePosition.yMnm };
  return {
    ...stillEnvironment(context),
    id,
    knownCurrentMnm: delta,
    leewayMnm: delta,
  };
}

/** Compiled only in Vite's e2e mode; production uses the authored Atlantic provider. */
export const WP5_E2E_ENVIRONMENT: EnvironmentProvider = (context) => {
  if (context.heading === "SW") return transit(context, landmarkPosition(LANDMARK_IDS.capeVerde), "wp5-e2e:cape-verde");
  if (context.heading === "SE") return transit(context, landmarkPosition(LANDMARK_IDS.capeGoal), "wp5-e2e:cape");
  if (context.heading === "NNW") return transit(context, landmarkPosition(LANDMARK_IDS.capeVerde), "wp5-e2e:return-cape-verde");
  if (context.heading === "NE") return transit(context, landmarkPosition(LANDMARK_IDS.lisbon), "wp5-e2e:lisbon");
  if (context.heading === "W") return transit(context, { xMnm: 100_000, yMnm: 0 }, "wp5-e2e:quiet-five-day-position");
  if (context.heading === "E") {
    const base = stillEnvironment(context);
    return { ...base, id: "wp5-e2e:current", trueCurrentMnm: { ...SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay } };
  }
  return stillEnvironment(context);
};
