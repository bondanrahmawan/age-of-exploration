import { deepFreeze } from "./immutable.js";
import type {
  Heading,
  NavigationFact,
  PositionMnm,
  WeatherKind,
} from "./types.js";

export const LANDMARK_IDS = {
  lisbon: "landmark.lisbon",
  capeVerde: "landmark.cape-verde-santiago",
  capeGoal: "landmark.cape-goal-region",
} as const;

export const SOUTH_ATLANTIC_CURRENT_ID = "current.south-atlantic" as const;

export interface LandmarkDefinition {
  readonly id: string;
  readonly name: string;
  readonly centre: PositionMnm;
  readonly physicalRadiusMnm: number;
  readonly confirmedFixFloorMnm: number;
}

export const LANDMARKS: readonly LandmarkDefinition[] = deepFreeze([
  {
    id: LANDMARK_IDS.lisbon,
    name: "Lisbon",
    centre: { xMnm: 0, yMnm: 0 },
    physicalRadiusMnm: 15_000,
    confirmedFixFloorMnm: 5_000,
  },
  {
    id: LANDMARK_IDS.capeVerde,
    name: "Cape Verde / Santiago",
    centre: { xMnm: -770_000, yMnm: -1_430_000 },
    physicalRadiusMnm: 15_000,
    confirmedFixFloorMnm: 5_000,
  },
  {
    id: LANDMARK_IDS.capeGoal,
    name: "Cape goal region",
    centre: { xMnm: 1_660_000, yMnm: -4_390_000 },
    physicalRadiusMnm: 60_000,
    confirmedFixFloorMnm: 5_000,
  },
]);

export function createStartingNavigationKnowledge(): readonly NavigationFact[] {
  return deepFreeze([
    {
      id: LANDMARK_IDS.lisbon,
      type: "landmark",
      status: "confirmed",
      confidence: 100,
      claimedPosition: { xMnm: 0, yMnm: 0 },
    },
    {
      id: LANDMARK_IDS.capeVerde,
      type: "landmark",
      status: "confirmed",
      confidence: 90,
      claimedPosition: { xMnm: -770_000, yMnm: -1_430_000 },
    },
    {
      id: LANDMARK_IDS.capeGoal,
      type: "landmark",
      status: "rumoured",
      confidence: 25,
      claimedPosition: { xMnm: 1_660_000, yMnm: -4_390_000 },
    },
  ]);
}

export type AtlanticRegionId = "north_atlantic" | "south_atlantic";
export type Season = "winter" | "spring" | "summer" | "autumn";

export interface AuthoredBounds {
  readonly minimumXMnm: number;
  readonly maximumXMnm: number;
  readonly minimumYMnm: number;
  readonly maximumYMnm: number;
}

export interface WindBand {
  readonly id: string;
  readonly regionId: AtlanticRegionId;
  readonly bounds: AuthoredBounds;
  readonly fromHeadingBySeason: Readonly<Record<Season, Heading>>;
}

/** One authored Atlantic wind field. Direction is always the direction wind comes from. */
export const ATLANTIC_WIND_FIELD: readonly WindBand[] = deepFreeze([
  {
    id: "atlantic-wind.north-v1",
    regionId: "north_atlantic",
    bounds: {
      minimumXMnm: -3_000_000,
      maximumXMnm: 3_000_000,
      minimumYMnm: -2_000_000,
      maximumYMnm: 750_000,
    },
    fromHeadingBySeason: { winter: "NE", spring: "NNE", summer: "N", autumn: "NE" },
  },
  {
    id: "atlantic-wind.south-v1",
    regionId: "south_atlantic",
    bounds: {
      minimumXMnm: -3_000_000,
      maximumXMnm: 3_000_000,
      minimumYMnm: -5_000_000,
      maximumYMnm: -2_000_001,
    },
    fromHeadingBySeason: { winter: "ESE", spring: "SE", summer: "SSE", autumn: "SE" },
  },
]);

export interface AuthoredCurrentRegion {
  readonly id: typeof SOUTH_ATLANTIC_CURRENT_ID;
  readonly bounds: AuthoredBounds;
  readonly vectorMnmPerDay: PositionMnm;
}

export const SOUTH_ATLANTIC_CURRENT: AuthoredCurrentRegion = deepFreeze({
  id: SOUTH_ATLANTIC_CURRENT_ID,
  bounds: {
    minimumXMnm: -1_500_000,
    maximumXMnm: 1_200_000,
    minimumYMnm: -3_800_000,
    maximumYMnm: -1_700_000,
  },
  vectorMnmPerDay: { xMnm: 18_000, yMnm: -4_000 },
});

export interface WeatherEffects {
  readonly speedPermille: number;
  readonly uncertaintyPermille: number;
  readonly sightRadiusMnm: number;
  readonly noonObservation: "clear" | "heavy_swell" | "overcast" | "none";
  readonly windStrength: "calm" | "moderate" | "strong";
}

export const WEATHER_EFFECTS: Readonly<Record<WeatherKind, WeatherEffects>> = deepFreeze({
  fair_clear: {
    speedPermille: 1_000,
    uncertaintyPermille: 1_000,
    sightRadiusMnm: 20_000,
    noonObservation: "clear",
    windStrength: "moderate",
  },
  rough_heavy_swell: {
    speedPermille: 750,
    uncertaintyPermille: 1_500,
    sightRadiusMnm: 8_000,
    noonObservation: "heavy_swell",
    windStrength: "strong",
  },
  overcast: {
    speedPermille: 900,
    uncertaintyPermille: 1_500,
    sightRadiusMnm: 8_000,
    noonObservation: "overcast",
    windStrength: "moderate",
  },
  calm: {
    speedPermille: 0,
    uncertaintyPermille: 1_000,
    sightRadiusMnm: 20_000,
    noonObservation: "clear",
    windStrength: "calm",
  },
  storm: {
    speedPermille: 750,
    uncertaintyPermille: 1_800,
    sightRadiusMnm: 8_000,
    noonObservation: "none",
    windStrength: "strong",
  },
});

export const WEATHER_BASE_WEIGHTS: Readonly<
  Record<AtlanticRegionId, Readonly<Record<WeatherKind, number>>>
> = deepFreeze({
  north_atlantic: {
    fair_clear: 52,
    rough_heavy_swell: 14,
    overcast: 22,
    calm: 8,
    storm: 4,
  },
  south_atlantic: {
    fair_clear: 44,
    rough_heavy_swell: 22,
    overcast: 16,
    calm: 10,
    storm: 8,
  },
});

export const WEATHER_SEASON_ADJUSTMENTS: Readonly<
  Record<Season, Readonly<Record<WeatherKind, number>>>
> = deepFreeze({
  winter: { fair_clear: -8, rough_heavy_swell: 8, overcast: 2, calm: -2, storm: 5 },
  spring: { fair_clear: 4, rough_heavy_swell: 0, overcast: 0, calm: 0, storm: 0 },
  summer: { fair_clear: 8, rough_heavy_swell: -4, overcast: -2, calm: 4, storm: -2 },
  autumn: { fair_clear: 0, rough_heavy_swell: 4, overcast: 2, calm: -1, storm: 2 },
});

export const PREVIOUS_WEATHER_PERSISTENCE_WEIGHT = 45;

export function contains(bounds: Readonly<AuthoredBounds>, position: Readonly<PositionMnm>): boolean {
  return position.xMnm >= bounds.minimumXMnm
    && position.xMnm <= bounds.maximumXMnm
    && position.yMnm >= bounds.minimumYMnm
    && position.yMnm <= bounds.maximumYMnm;
}

export function seasonForDate(date: string): Season {
  const month = Number(date.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

export function windBandForPosition(position: Readonly<PositionMnm>): WindBand {
  return ATLANTIC_WIND_FIELD.find((band) => contains(band.bounds, position))
    ?? ATLANTIC_WIND_FIELD[0]!;
}
