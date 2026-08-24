import {
  LANDMARK_IDS,
  LANDMARKS,
  SOUTH_ATLANTIC_CURRENT,
  type CampaignState,
  type EnvironmentProvider,
  type JourneyFact,
  type SimulationCommand,
  executeForwardedSimulationCommand,
} from "../src/index.js";

const landmarkPosition = (id: string) => ({
  ...LANDMARKS.find((item) => item.id === id)!.centre,
});

export const NO_MOVEMENT_ENVIRONMENT: EnvironmentProvider = (context) => {
  if (context.navigation === null) throw new Error("campaign test requires navigation state");
  return {
    schema: "wp1-navigation-environment-v1",
    id: "wp4-test:no-movement",
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

function transitEnvironment(
  context: Parameters<EnvironmentProvider>[0],
  target: Readonly<{ xMnm: number; yMnm: number }>,
  id: string,
) {
  if (context.navigation === null) throw new Error("campaign route requires navigation state");
  const delta = {
    xMnm: target.xMnm - context.truePosition.xMnm,
    yMnm: target.yMnm - context.truePosition.yMnm,
  };
  return {
    schema: "wp1-navigation-environment-v1" as const,
    id,
    pointOfSailPermille: 0,
    weatherPermille: 0,
    uncertaintyPermille: 1_000,
    tackingUncertaintyPermille: 1_000,
    trueCurrentMnm: { xMnm: 0, yMnm: 0 },
    knownCurrentMnm: delta,
    leewayMnm: delta,
    observedWeather: "fair_clear" as const,
    observedWind: { directionConvention: "from" as const, fromHeading: "NE" as const, strength: "moderate" as const },
    noonObservation: "none" as const,
    sightRadiusMnm: 20_000,
    nextWeatherState: { kind: "fair_clear" as const, daysInState: context.navigation.weatherState.daysInState + 1 },
    nextEnvironmentPrng: context.navigation.environmentPrng,
  };
}

/**
 * A deterministic injected route used only by focused campaign tests/fixtures.
 * Transit is authored as matched leeway + logged correction, while heading E
 * inside the current rectangle exposes the real hidden-current distinction.
 */
export const CAMPAIGN_ROUTE_ENVIRONMENT: EnvironmentProvider = (context) => {
  if (context.navigation === null) throw new Error("campaign route requires navigation state");
  if (context.heading === "SW") {
    return transitEnvironment(context, landmarkPosition(LANDMARK_IDS.capeVerde), "wp4-fixture:transit-cape-verde");
  }
  if (context.heading === "NE") {
    return transitEnvironment(context, landmarkPosition(LANDMARK_IDS.lisbon), "wp4-fixture:transit-lisbon");
  }
  if (context.heading === "SE") {
    return transitEnvironment(context, landmarkPosition(LANDMARK_IDS.capeGoal), "wp4-fixture:transit-cape");
  }
  if (context.heading === "S") {
    return transitEnvironment(context, { xMnm: -770_000, yMnm: -1_800_000 }, "wp4-fixture:transit-current-north");
  }
  if (context.heading === "NW") {
    return transitEnvironment(context, { xMnm: 1_000_000, yMnm: -3_500_000 }, "wp4-fixture:transit-current-south");
  }
  if (context.heading === "NNW") {
    return transitEnvironment(context, landmarkPosition(LANDMARK_IDS.capeVerde), "wp4-fixture:return-cape-verde");
  }
  if (context.heading === "E") {
    const known = context.navigation.knowledge.find((fact) => fact.id === SOUTH_ATLANTIC_CURRENT.id
      && fact.type === "current"
      && fact.status === "confirmed"
      && fact.confidence >= 70);
    return {
      ...NO_MOVEMENT_ENVIRONMENT(context),
      id: "wp4-fixture:hidden-current-day",
      trueCurrentMnm: { ...SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay },
      knownCurrentMnm: known?.type === "current"
        ? { ...known.claimedVectorMnmPerDay }
        : { xMnm: 0, yMnm: 0 },
    };
  }
  return NO_MOVEMENT_ENVIRONMENT(context);
};

export function forward(
  state: CampaignState,
  command: SimulationCommand,
  environmentProvider: EnvironmentProvider = NO_MOVEMENT_ENVIRONMENT,
): CampaignState {
  return executeForwardedSimulationCommand(state, command, environmentProvider);
}

export function observedFact(id: string, observedDate = "1488-04-01"): JourneyFact {
  return {
    id,
    type: "anchorage",
    status: "observed",
    confidence: 55,
    source: "focused campaign fixture",
    observedDate,
    claim: `A deterministic observation for ${id}.`,
  };
}
