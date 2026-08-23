import { SimulationValidationError } from "./errors.js";
import { deepFreeze } from "./immutable.js";
import { nextIntegerInclusive } from "./prng.js";
import {
  HEADINGS,
  WEATHER_KINDS,
  type DailyEnvironment,
  type EnvironmentProvider,
  type Heading,
  type NavigationDailyEnvironment,
  type PointOfSailResult,
  type WeatherKind,
} from "./types.js";
import {
  PREVIOUS_WEATHER_PERSISTENCE_WEIGHT,
  SOUTH_ATLANTIC_CURRENT,
  WEATHER_BASE_WEIGHTS,
  WEATHER_EFFECTS,
  WEATHER_SEASON_ADJUSTMENTS,
  contains,
  seasonForDate,
  windBandForPosition,
} from "./world.js";

const FAIR_WEATHER_STILL_WATER: DailyEnvironment = deepFreeze({
  id: "wp0-fair-weather-still-water-v1",
  pointOfSailPermille: 1_000,
  weatherPermille: 1_000,
  uncertaintyPermille: 1_000,
  tackingUncertaintyPermille: 1_000,
  trueCurrentMnm: { xMnm: 0, yMnm: 0 },
  knownCurrentMnm: { xMnm: 0, yMnm: 0 },
  leewayMnm: { xMnm: 0, yMnm: 0 },
  observation: "none",
  landfall: "none",
});

export const fairWeatherStillWaterEnvironment: EnvironmentProvider = () =>
  FAIR_WEATHER_STILL_WATER;

function circularHeadingDistance(left: Heading, right: Heading): number {
  const leftIndex = HEADINGS.indexOf(left);
  const rightIndex = HEADINGS.indexOf(right);
  const steps = Math.abs(leftIndex - rightIndex);
  return Math.min(steps, HEADINGS.length - steps);
}

/**
 * Resolves a selected heading against wind described by the compass point it
 * comes from. A heading within 45 degrees of that source automatically tacks.
 */
export function pointOfSailForHeading(
  heading: Heading,
  windFromHeading: Heading | null,
): PointOfSailResult {
  if (windFromHeading === null) {
    return { kind: "calm", speedPermille: 0, uncertaintyPermille: 1_000 };
  }
  const stepsFromWindSource = circularHeadingDistance(heading, windFromHeading);
  if (stepsFromWindSource <= 2) {
    return { kind: "automatic_tacking", speedPermille: 350, uncertaintyPermille: 1_250 };
  }
  if (stepsFromWindSource === 3) {
    return { kind: "close_hauled", speedPermille: 500, uncertaintyPermille: 1_000 };
  }
  if (stepsFromWindSource <= 5) {
    return { kind: "beam_reach", speedPermille: 900, uncertaintyPermille: 1_000 };
  }
  return { kind: "running_broad", speedPermille: 1_000, uncertaintyPermille: 1_000 };
}

function chooseWeather(
  context: Parameters<EnvironmentProvider>[0],
  regionId: "north_atlantic" | "south_atlantic",
): { readonly weather: WeatherKind; readonly nextPrng: NavigationDailyEnvironment["nextEnvironmentPrng"] } {
  const navigation = context.navigation;
  if (navigation === null) {
    throw new SimulationValidationError("authored Atlantic weather requires navigation state v2");
  }
  const season = seasonForDate(context.date);
  const weights = WEATHER_KINDS.map((kind) => {
    const base = WEATHER_BASE_WEIGHTS[regionId][kind];
    const seasonal = WEATHER_SEASON_ADJUSTMENTS[season][kind];
    const persistence = navigation.weatherState.kind === kind
      ? PREVIOUS_WEATHER_PERSISTENCE_WEIGHT
      : 0;
    return { kind, weight: Math.max(1, base + seasonal + persistence) };
  });
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  const draw = nextIntegerInclusive(navigation.environmentPrng, 1, total);
  let cursor = draw.value;
  for (const item of weights) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return { weather: item.kind, nextPrng: draw.state };
    }
  }
  throw new SimulationValidationError("authored weather weights did not select a state");
}

export const authoredAtlanticEnvironment: EnvironmentProvider = (context) => {
  const navigation = context.navigation;
  if (navigation === null) {
    throw new SimulationValidationError("authored Atlantic environment requires navigation state v2");
  }
  const windBand = windBandForPosition(context.truePosition);
  const season = seasonForDate(context.date);
  const selected = chooseWeather(context, windBand.regionId);
  const effects = WEATHER_EFFECTS[selected.weather];
  const fromHeading = selected.weather === "calm"
    ? null
    : windBand.fromHeadingBySeason[season];
  const pointOfSail = pointOfSailForHeading(context.heading, fromHeading);
  const currentActive = contains(SOUTH_ATLANTIC_CURRENT.bounds, context.truePosition);
  const trueCurrentMnm = currentActive
    ? SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay
    : { xMnm: 0, yMnm: 0 };
  const chartedCurrent = navigation.knowledge.find(
    (fact) => fact.type === "current"
      && fact.id === SOUTH_ATLANTIC_CURRENT.id
      && fact.status === "confirmed"
      && fact.confidence >= 70,
  );
  const knownCurrentMnm = currentActive && chartedCurrent?.type === "current"
    ? chartedCurrent.claimedVectorMnmPerDay
    : { xMnm: 0, yMnm: 0 };
  const daysInState = selected.weather === navigation.weatherState.kind
    ? navigation.weatherState.daysInState + 1
    : 1;

  return deepFreeze({
    schema: "wp1-navigation-environment-v1",
    id: `authored-atlantic-v1:${windBand.regionId}:${selected.weather}`,
    pointOfSailPermille: pointOfSail.speedPermille,
    weatherPermille: effects.speedPermille,
    uncertaintyPermille: effects.uncertaintyPermille,
    tackingUncertaintyPermille: pointOfSail.uncertaintyPermille,
    trueCurrentMnm: { ...trueCurrentMnm },
    knownCurrentMnm: { ...knownCurrentMnm },
    leewayMnm: { xMnm: 0, yMnm: 0 },
    observedWeather: selected.weather,
    observedWind: {
      directionConvention: "from",
      fromHeading,
      strength: effects.windStrength,
    },
    noonObservation: effects.noonObservation,
    sightRadiusMnm: effects.sightRadiusMnm,
    nextWeatherState: { kind: selected.weather, daysInState },
    nextEnvironmentPrng: selected.nextPrng,
  } satisfies NavigationDailyEnvironment);
};
