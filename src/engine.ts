import { addOneDay } from "./date.js";
import {
  authoredAtlanticEnvironment,
  fairWeatherStillWaterEnvironment,
} from "./environment.js";
import { SimulationValidationError } from "./errors.js";
import { deepFreeze } from "./immutable.js";
import { createPrngState, nextIntegerInclusive } from "./prng.js";
import {
  DAY_PHASE_ORDER,
  NAVIGATION_STATE_FORMAT,
  STATE_FORMAT,
  type CanonicalLogEntry,
  type CommandLogEntry,
  type DailyEnvironment,
  type DayLogEntry,
  type EnvironmentContext,
  type EnvironmentProvider,
  type Heading,
  type InitialStateConfig,
  type LandfallResult,
  type LegacyDailyEnvironment,
  type LegacySimulationState,
  type NavigationDailyEnvironment,
  type NavigationDayLogEntry,
  type NavigationFact,
  type NavigationInitialStateConfig,
  type NavigationInterrupt,
  type NavigationPlayerView,
  type NavigationSimulationState,
  type ObservationResult,
  type PlayerView,
  type PositionMnm,
  type RationPolicy,
  type SailingPolicy,
  type SimulationCommand,
  type SimulationState,
  type UncertaintyRadiiMnm,
} from "./types.js";
import {
  CONDITION_MAX_BPS,
  PARTS_PER_MILLION,
  clampInteger,
  divideCeiling,
  divideRoundHalfAwayFromZero,
  scaleByPartsPerMillion,
  scaleByPermille,
} from "./units.js";
import {
  assertDailyEnvironment,
  assertSimulationCommand,
  assertSimulationState,
  copyCommand,
} from "./validation.js";
import {
  LANDMARKS,
  createStartingNavigationKnowledge,
  seasonForDate,
  windBandForPosition,
} from "./world.js";

const BASE_DAILY_RUN_MNM = 96_000;
const DIRECTION_SCALE = 1_000_000;
const NAVIGATOR_ERROR_PERMILLE = 800;
const BASE_EAST_WEST_GROWTH_MNM = 12_000;
const BASE_NORTH_SOUTH_GROWTH_MNM = 6_000;

const HEADING_VECTORS: Readonly<Record<Heading, PositionMnm>> = {
  N: { xMnm: 0, yMnm: 1_000_000 },
  NNE: { xMnm: 382_683, yMnm: 923_880 },
  NE: { xMnm: 707_107, yMnm: 707_107 },
  ENE: { xMnm: 923_880, yMnm: 382_683 },
  E: { xMnm: 1_000_000, yMnm: 0 },
  ESE: { xMnm: 923_880, yMnm: -382_683 },
  SE: { xMnm: 707_107, yMnm: -707_107 },
  SSE: { xMnm: 382_683, yMnm: -923_880 },
  S: { xMnm: 0, yMnm: -1_000_000 },
  SSW: { xMnm: -382_683, yMnm: -923_880 },
  SW: { xMnm: -707_107, yMnm: -707_107 },
  WSW: { xMnm: -923_880, yMnm: -382_683 },
  W: { xMnm: -1_000_000, yMnm: 0 },
  WNW: { xMnm: -923_880, yMnm: 382_683 },
  NW: { xMnm: -707_107, yMnm: 707_107 },
  NNW: { xMnm: -382_683, yMnm: 923_880 },
};

const SAILING_SPEED_PERMILLE: Readonly<Record<SailingPolicy, number>> = {
  cautious: 800,
  standard: 1_000,
  press_on: 1_150,
};

const SAILING_UNCERTAINTY_PERMILLE: Readonly<Record<SailingPolicy, number>> = {
  cautious: 750,
  standard: 1_000,
  press_on: 1_350,
};

function vectorForDistance(distanceMnm: number, direction: Readonly<PositionMnm>): PositionMnm {
  return {
    xMnm: divideRoundHalfAwayFromZero(
      BigInt(distanceMnm) * BigInt(direction.xMnm),
      BigInt(DIRECTION_SCALE),
      "x movement",
    ),
    yMnm: divideRoundHalfAwayFromZero(
      BigInt(distanceMnm) * BigInt(direction.yMnm),
      BigInt(DIRECTION_SCALE),
      "y movement",
    ),
  };
}

function addVectors(...vectors: readonly Readonly<PositionMnm>[]): PositionMnm {
  return vectors.reduce<PositionMnm>(
    (sum, vector) => ({ xMnm: sum.xMnm + vector.xMnm, yMnm: sum.yMnm + vector.yMnm }),
    { xMnm: 0, yMnm: 0 },
  );
}

function steeringCrossTrackMnm(distanceMnm: number, errorMilliDegrees: number): number {
  return divideRoundHalfAwayFromZero(
    BigInt(distanceMnm) * BigInt(errorMilliDegrees) * 355n,
    180_000n * 113n,
    "steering cross-track movement",
  );
}

function sailConditionPermille(state: Readonly<SimulationState>): number {
  return divideRoundHalfAwayFromZero(
    BigInt(state.ship.mastBps + state.ship.sailsBps + state.ship.rudderBps) * 1_000n,
    30_000n,
    "sail-condition factor",
  );
}

function crewWorkPermille(state: Readonly<SimulationState>): number {
  return Math.min(1_000, Math.floor((state.crew.able * 1_000) / 14));
}

function nominalDistanceMnm(
  state: Readonly<SimulationState>,
  sailingPolicy: SailingPolicy,
  environment: Readonly<DailyEnvironment>,
): number {
  return scaleByPermille(
    BASE_DAILY_RUN_MNM,
    [
      environment.pointOfSailPermille,
      SAILING_SPEED_PERMILLE[sailingPolicy],
      sailConditionPermille(state),
      crewWorkPermille(state),
      environment.weatherPermille,
    ],
    "daily commanded movement",
  );
}

function rationUsePermille(policy: RationPolicy): { water: number; provisions: number } {
  return {
    water: policy === "reduced_water" || policy === "reduced_both" ? 750 : 1_000,
    provisions: policy === "reduced_provisions" || policy === "reduced_both" ? 500 : 1_000,
  };
}

function requestedConsumptionKg(crewCount: number, rationPolicy: RationPolicy): {
  waterKg: number;
  provisionsKg: number;
} {
  const multipliers = rationUsePermille(rationPolicy);
  return {
    waterKg: divideCeiling(
      BigInt(crewCount) * 6n * BigInt(multipliers.water),
      1_000n,
      "daily water consumption",
    ),
    provisionsKg: divideCeiling(
      BigInt(crewCount) * 3n * BigInt(multipliers.provisions),
      1_000n,
      "daily provisions consumption",
    ),
  };
}

function rationConditionDelta(policy: RationPolicy): { healthBps: number; moraleBps: number } {
  const reducedWater = policy === "reduced_water" || policy === "reduced_both";
  const reducedProvisions = policy === "reduced_provisions" || policy === "reduced_both";
  return {
    healthBps: (reducedWater ? -300 : 0) + (reducedProvisions ? -100 : 0),
    moraleBps: (reducedWater ? -200 : 0) + (reducedProvisions ? -200 : 0),
  };
}

function finalizeState<T extends SimulationState>(state: T): T {
  assertSimulationState(state);
  return deepFreeze(state) as T;
}

function copyFact(fact: Readonly<NavigationFact>): NavigationFact {
  return fact.type === "landmark"
    ? { ...fact, claimedPosition: { ...fact.claimedPosition } }
    : { ...fact, claimedVectorMnmPerDay: { ...fact.claimedVectorMnmPerDay } };
}

function copyObservation(observation: Readonly<ObservationResult>): ObservationResult {
  return { ...observation };
}

function copyLandfall(landfall: Readonly<LandfallResult>): LandfallResult {
  return { ...landfall };
}

function copyInterrupt(interruption: Readonly<NavigationInterrupt>): NavigationInterrupt {
  return { ...interruption };
}

function copyLogEntry(entry: Readonly<CanonicalLogEntry>): CanonicalLogEntry {
  if (entry.type === "command") {
    return { ...entry };
  }
  if ("observedWeather" in entry) {
    return {
      ...entry,
      phaseOrder: [...entry.phaseOrder],
      estimatedPosition: { ...entry.estimatedPosition },
      uncertainty: { ...entry.uncertainty },
      observedWind: { ...entry.observedWind },
      observation: copyObservation(entry.observation),
      landfall: copyLandfall(entry.landfall),
      interruption: copyInterrupt(entry.interruption),
    };
  }
  return {
    ...entry,
    phaseOrder: [...entry.phaseOrder],
    estimatedPosition: { ...entry.estimatedPosition },
    uncertainty: { ...entry.uncertainty },
  };
}

function detachedState(state: Readonly<SimulationState>): SimulationState {
  const common = {
    contentVersion: state.contentVersion,
    runSeed: state.runSeed,
    committedDay: state.committedDay,
    date: state.date,
    truePosition: { ...state.truePosition },
    estimatedPosition: { ...state.estimatedPosition },
    uncertainty: { ...state.uncertainty },
    heading: state.heading,
    sailingPolicy: state.sailingPolicy,
    rationPolicy: state.rationPolicy,
    crew: { ...state.crew },
    stores: { ...state.stores },
    moneyDucats: state.moneyDucats,
    ship: { ...state.ship },
    prng: {
      algorithm: state.prng.algorithm,
      words: [
        state.prng.words[0],
        state.prng.words[1],
        state.prng.words[2],
        state.prng.words[3],
      ] as const,
    },
    canonicalLog: state.canonicalLog.map(copyLogEntry),
    replayCommands: state.replayCommands.map(copyCommand),
  };
  if (state.format === NAVIGATION_STATE_FORMAT) {
    return {
      format: NAVIGATION_STATE_FORMAT,
      ...common,
      navigation: {
        environmentModel: state.navigation.environmentModel,
        environmentPrng: {
          algorithm: state.navigation.environmentPrng.algorithm,
          words: [...state.navigation.environmentPrng.words] as [number, number, number, number],
        },
        weatherState: { ...state.navigation.weatherState },
        observedWeather: state.navigation.observedWeather,
        observedWind: { ...state.navigation.observedWind },
        knowledge: state.navigation.knowledge.map(copyFact),
        lastObservation: copyObservation(state.navigation.lastObservation),
        lastLandfall: copyLandfall(state.navigation.lastLandfall),
        interruption: copyInterrupt(state.navigation.interruption),
      },
    };
  }
  return { format: STATE_FORMAT, ...common };
}

function baseInitialState(config: Readonly<InitialStateConfig>) {
  return {
    contentVersion: config.contentVersion,
    runSeed: config.runSeed,
    committedDay: 0,
    date: config.date ?? "1488-04-01",
    uncertainty: { eastWestMnm: 0, northSouthMnm: 0 },
    heading: config.heading ?? "S" as Heading,
    sailingPolicy: config.sailingPolicy ?? "standard" as SailingPolicy,
    rationPolicy: config.rationPolicy ?? "normal" as RationPolicy,
    crew: {
      count: config.crewCount ?? 25,
      able: config.ableCrew ?? config.crewCount ?? 25,
      healthBps: config.healthBps ?? 10_000,
      moraleBps: config.moraleBps ?? 7_500,
    },
    stores: {
      waterKg: config.waterKg ?? 22_000,
      provisionsKg: config.provisionsKg ?? 16_000,
      repairStoresKg: config.repairStoresKg ?? 8_000,
      medicineKg: config.medicineKg ?? 1_000,
    },
    moneyDucats: config.moneyDucats ?? 300,
    ship: {
      hullBps: 10_000,
      mastBps: 10_000,
      sailsBps: 10_000,
      rudderBps: 10_000,
    },
    prng: createPrngState(config.runSeed),
    canonicalLog: [] as CanonicalLogEntry[],
    replayCommands: [] as SimulationCommand[],
  };
}

export function createInitialState(config: Readonly<InitialStateConfig>): LegacySimulationState {
  const base = baseInitialState(config);
  return finalizeState({
    format: STATE_FORMAT,
    ...base,
    truePosition: { xMnm: 0, yMnm: 0 },
    estimatedPosition: { xMnm: 0, yMnm: 0 },
  });
}

export function createNavigationState(
  config: Readonly<NavigationInitialStateConfig>,
): NavigationSimulationState {
  const base = baseInitialState(config);
  const truePosition = config.truePosition ?? { xMnm: 0, yMnm: 0 };
  const estimatedPosition = config.estimatedPosition ?? { ...truePosition };
  const initialWeather = config.initialWeather ?? "fair_clear";
  const windBand = windBandForPosition(truePosition);
  const fromHeading = initialWeather === "calm"
    ? null
    : windBand.fromHeadingBySeason[seasonForDate(base.date)];
  return finalizeState({
    format: NAVIGATION_STATE_FORMAT,
    ...base,
    truePosition: { ...truePosition },
    estimatedPosition: { ...estimatedPosition },
    uncertainty: config.uncertainty === undefined
      ? base.uncertainty
      : { ...config.uncertainty },
    navigation: {
      environmentModel: "authored-atlantic-v1",
      environmentPrng: createPrngState(`${config.runSeed}::environment:authored-atlantic-v1`),
      weatherState: { kind: initialWeather, daysInState: 0 },
      observedWeather: initialWeather,
      observedWind: {
        directionConvention: "from",
        fromHeading,
        strength: initialWeather === "calm" ? "calm" : "moderate",
      },
      knowledge: (config.knowledge ?? createStartingNavigationKnowledge()).map(copyFact),
      lastObservation: { kind: "none" },
      lastLandfall: { kind: "none" },
      interruption: { kind: "none" },
    },
  });
}

function commandLog(
  state: Readonly<SimulationState>,
  command: Exclude<SimulationCommand, { readonly type: "advance_day" }>,
): CommandLogEntry {
  const value = command.type === "set_heading" ? command.heading : command.policy;
  return {
    index: state.canonicalLog.length,
    type: "command",
    committedDay: state.committedDay,
    command: command.type,
    value,
  };
}

function applySettingCommand(
  state: Readonly<SimulationState>,
  command: Exclude<SimulationCommand, { readonly type: "advance_day" }>,
): SimulationState {
  const detached = detachedState(state);
  const common = {
    ...detached,
    canonicalLog: [...detached.canonicalLog, commandLog(state, command)],
    replayCommands: [...detached.replayCommands, copyCommand(command)],
  };
  switch (command.type) {
    case "set_heading":
      return finalizeState({ ...common, heading: command.heading });
    case "set_sailing_policy":
      return finalizeState({ ...common, sailingPolicy: command.policy });
    case "set_ration_policy":
      return finalizeState({ ...common, rationPolicy: command.policy });
  }
}

function resolveEnvironment(
  state: Readonly<SimulationState>,
  heading: Heading,
  sailingPolicy: SailingPolicy,
  provider: EnvironmentProvider,
): Readonly<DailyEnvironment> {
  if (typeof provider !== "function") {
    throw new SimulationValidationError("environment provider must be a function");
  }
  const context: EnvironmentContext = deepFreeze({
    contentVersion: state.contentVersion,
    runSeed: state.runSeed,
    committedDay: state.committedDay,
    date: state.date,
    heading,
    sailingPolicy,
    truePosition: { ...state.truePosition },
    navigation: state.format === NAVIGATION_STATE_FORMAT
      ? {
          environmentPrng: {
            algorithm: state.navigation.environmentPrng.algorithm,
            words: [...state.navigation.environmentPrng.words] as [number, number, number, number],
          },
          weatherState: { ...state.navigation.weatherState },
          knowledge: state.navigation.knowledge.map(copyFact),
        }
      : null,
  });
  const environment = provider(context);
  assertDailyEnvironment(environment);
  return environment;
}

function isNavigationEnvironment(
  environment: Readonly<DailyEnvironment>,
): environment is NavigationDailyEnvironment {
  return "schema" in environment;
}

function movementForDay(
  state: Readonly<SimulationState>,
  environment: Readonly<DailyEnvironment>,
) {
  const distanceMnm = nominalDistanceMnm(state, state.sailingPolicy, environment);
  const steeringDraw = nextIntegerInclusive(state.prng, -3_200, 3_200);
  const logDistanceDraw = nextIntegerInclusive(steeringDraw.state, -80_000, 80_000);
  const direction = HEADING_VECTORS[state.heading];
  const starboardDirection: PositionMnm = {
    xMnm: direction.yMnm,
    yMnm: -direction.xMnm,
  };
  const forwardMovement = vectorForDistance(distanceMnm, direction);
  const crossTrackMovement = vectorForDistance(
    steeringCrossTrackMnm(distanceMnm, steeringDraw.value),
    starboardDirection,
  );
  const trueMovement = addVectors(
    forwardMovement,
    crossTrackMovement,
    environment.trueCurrentMnm,
    environment.leewayMnm,
  );
  const loggedDistanceMnm = scaleByPartsPerMillion(
    distanceMnm,
    PARTS_PER_MILLION + logDistanceDraw.value,
    "logged daily movement",
  );
  const estimatedMovement = addVectors(
    vectorForDistance(loggedDistanceMnm, direction),
    environment.knownCurrentMnm,
  );
  const uncertaintyFactors = [
    NAVIGATOR_ERROR_PERMILLE,
    SAILING_UNCERTAINTY_PERMILLE[state.sailingPolicy],
    environment.uncertaintyPermille,
    environment.tackingUncertaintyPermille,
  ];
  return {
    truePosition: addVectors(state.truePosition, trueMovement),
    estimatedPosition: addVectors(state.estimatedPosition, estimatedMovement),
    uncertainty: {
      eastWestMnm: state.uncertainty.eastWestMnm + scaleByPermille(
        BASE_EAST_WEST_GROWTH_MNM,
        uncertaintyFactors,
        "east-west uncertainty growth",
      ),
      northSouthMnm: state.uncertainty.northSouthMnm + scaleByPermille(
        BASE_NORTH_SOUTH_GROWTH_MNM,
        uncertaintyFactors,
        "north-south uncertainty growth",
      ),
    },
    nextMovementPrng: logDistanceDraw.state,
  };
}

function consumeAndTick(state: Readonly<SimulationState>) {
  const requested = requestedConsumptionKg(state.crew.count, state.rationPolicy);
  const waterConsumedKg = Math.min(state.stores.waterKg, requested.waterKg);
  const provisionsConsumedKg = Math.min(state.stores.provisionsKg, requested.provisionsKg);
  const stores = {
    ...state.stores,
    waterKg: state.stores.waterKg - waterConsumedKg,
    provisionsKg: state.stores.provisionsKg - provisionsConsumedKg,
  };
  const conditionDelta = rationConditionDelta(state.rationPolicy);
  const crew = {
    ...state.crew,
    healthBps: clampInteger(
      state.crew.healthBps + conditionDelta.healthBps,
      0,
      CONDITION_MAX_BPS,
    ),
    moraleBps: clampInteger(
      state.crew.moraleBps + conditionDelta.moraleBps,
      0,
      CONDITION_MAX_BPS,
    ),
  };
  return { waterConsumedKg, provisionsConsumedKg, stores, crew };
}

function squaredDistance(left: Readonly<PositionMnm>, right: Readonly<PositionMnm>): bigint {
  const x = BigInt(left.xMnm) - BigInt(right.xMnm);
  const y = BigInt(left.yMnm) - BigInt(right.yMnm);
  return x * x + y * y;
}

function withinDistance(
  left: Readonly<PositionMnm>,
  right: Readonly<PositionMnm>,
  radiusMnm: number,
): boolean {
  const radius = BigInt(radiusMnm);
  return squaredDistance(left, right) <= radius * radius;
}

function resolveNavigationObservation(
  environment: Readonly<NavigationDailyEnvironment>,
  truePosition: Readonly<PositionMnm>,
  estimatedPosition: Readonly<PositionMnm>,
  uncertainty: Readonly<UncertaintyRadiiMnm>,
): {
  readonly observation: ObservationResult;
  readonly estimatedPosition: PositionMnm;
  readonly uncertainty: UncertaintyRadiiMnm;
} {
  if (environment.noonObservation === "clear") {
    return {
      observation: { kind: "clear_noon", northSouthUncertaintyMnm: 15_000 },
      estimatedPosition: { xMnm: estimatedPosition.xMnm, yMnm: truePosition.yMnm },
      uncertainty: { eastWestMnm: uncertainty.eastWestMnm, northSouthMnm: 15_000 },
    };
  }
  if (environment.noonObservation === "heavy_swell") {
    return {
      observation: { kind: "heavy_swell_noon", northSouthUncertaintyMnm: 40_000 },
      estimatedPosition: { xMnm: estimatedPosition.xMnm, yMnm: truePosition.yMnm },
      uncertainty: { eastWestMnm: uncertainty.eastWestMnm, northSouthMnm: 40_000 },
    };
  }
  if (environment.noonObservation === "overcast") {
    return {
      observation: { kind: "overcast_no_sight" },
      estimatedPosition: { ...estimatedPosition },
      uncertainty: { ...uncertainty },
    };
  }
  return {
    observation: { kind: "none" },
    estimatedPosition: { ...estimatedPosition },
    uncertainty: { ...uncertainty },
  };
}

function resolveLandfall(
  state: Readonly<NavigationSimulationState>,
  environment: Readonly<NavigationDailyEnvironment>,
  truePosition: Readonly<PositionMnm>,
  estimatedPosition: Readonly<PositionMnm>,
  uncertainty: Readonly<UncertaintyRadiiMnm>,
): {
  readonly landfall: LandfallResult;
  readonly interruption: NavigationInterrupt;
  readonly estimatedPosition: PositionMnm;
  readonly uncertainty: UncertaintyRadiiMnm;
  readonly knowledge: readonly NavigationFact[];
} {
  const visible = LANDMARKS.find((landmark) => withinDistance(
    truePosition,
    landmark.centre,
    landmark.physicalRadiusMnm + environment.sightRadiusMnm,
  ));
  if (visible !== undefined) {
    const fact = state.navigation.knowledge.find(
      (candidate) => candidate.type === "landmark" && candidate.id === visible.id,
    );
    if (fact?.type === "landmark" && fact.status === "confirmed" && fact.confidence >= 70) {
      const knowledge = state.navigation.knowledge.map((candidate) => {
        if (candidate.id !== fact.id || candidate.type !== "landmark") return copyFact(candidate);
        return { ...candidate, confidence: Math.min(100, candidate.confidence + 5) };
      });
      return {
        landfall: { kind: "recognised", landmarkId: visible.id },
        interruption: { kind: "landfall", result: "recognised" },
        estimatedPosition: { ...fact.claimedPosition },
        uncertainty: {
          eastWestMnm: visible.confirmedFixFloorMnm,
          northSouthMnm: visible.confirmedFixFloorMnm,
        },
        knowledge,
      };
    }
    return {
      landfall: {
        kind: "visible_unrecognised",
        knownFactId: fact?.id ?? null,
      },
      interruption: { kind: "landfall", result: "visible_unrecognised" },
      estimatedPosition: { ...estimatedPosition },
      uncertainty: { ...uncertainty },
      knowledge: state.navigation.knowledge.map(copyFact),
    };
  }

  for (const fact of state.navigation.knowledge) {
    if (fact.type !== "landmark" || fact.status === "disproved") continue;
    const landmark = LANDMARKS.find((candidate) => candidate.id === fact.id);
    if (landmark !== undefined && withinDistance(
      estimatedPosition,
      fact.claimedPosition,
      landmark.physicalRadiusMnm,
    )) {
      return {
        landfall: { kind: "missed", landmarkId: fact.id },
        interruption: { kind: "landfall", result: "missed" },
        estimatedPosition: { ...estimatedPosition },
        uncertainty: { ...uncertainty },
        knowledge: state.navigation.knowledge.map(copyFact),
      };
    }
  }

  return {
    landfall: { kind: "none" },
    interruption: { kind: "none" },
    estimatedPosition: { ...estimatedPosition },
    uncertainty: { ...uncertainty },
    knowledge: state.navigation.knowledge.map(copyFact),
  };
}

function advanceLegacyDay(
  state: Readonly<LegacySimulationState>,
  provider: EnvironmentProvider,
): LegacySimulationState {
  const environment = resolveEnvironment(state, state.heading, state.sailingPolicy, provider);
  if (isNavigationEnvironment(environment)) {
    throw new SimulationValidationError("state v1 requires a legacy daily environment");
  }
  const movement = movementForDay(state, environment);
  const consumption = consumeAndTick(state);
  const committedDay = state.committedDay + 1;
  const date = addOneDay(state.date);
  const entry: DayLogEntry = {
    index: state.canonicalLog.length,
    type: "day",
    committedDay,
    date,
    phaseOrder: [...DAY_PHASE_ORDER],
    heading: state.heading,
    sailingPolicy: state.sailingPolicy,
    rationPolicy: state.rationPolicy,
    environmentId: environment.id,
    estimatedPosition: movement.estimatedPosition,
    uncertainty: movement.uncertainty,
    waterConsumedKg: consumption.waterConsumedKg,
    provisionsConsumedKg: consumption.provisionsConsumedKg,
    observation: environment.observation,
    landfall: environment.landfall,
    event: "none",
    interruption: "none",
  };
  return finalizeState({
    ...detachedState(state) as LegacySimulationState,
    committedDay,
    date,
    truePosition: movement.truePosition,
    estimatedPosition: movement.estimatedPosition,
    uncertainty: movement.uncertainty,
    crew: consumption.crew,
    stores: consumption.stores,
    ship: { ...state.ship },
    prng: movement.nextMovementPrng,
    canonicalLog: [...state.canonicalLog, entry],
    replayCommands: [...state.replayCommands, { type: "advance_day" }],
  });
}

function advanceNavigationDay(
  state: Readonly<NavigationSimulationState>,
  provider: EnvironmentProvider,
): NavigationSimulationState {
  const environment = resolveEnvironment(state, state.heading, state.sailingPolicy, provider);
  if (!isNavigationEnvironment(environment)) {
    throw new SimulationValidationError("state v2 requires a WP1 navigation daily environment");
  }
  const movement = movementForDay(state, environment);
  const observed = resolveNavigationObservation(
    environment,
    movement.truePosition,
    movement.estimatedPosition,
    movement.uncertainty,
  );
  const landfall = resolveLandfall(
    state,
    environment,
    movement.truePosition,
    observed.estimatedPosition,
    observed.uncertainty,
  );
  const consumption = consumeAndTick(state);
  const committedDay = state.committedDay + 1;
  const date = addOneDay(state.date);
  const entry: NavigationDayLogEntry = {
    index: state.canonicalLog.length,
    type: "day",
    committedDay,
    date,
    phaseOrder: [...DAY_PHASE_ORDER],
    heading: state.heading,
    sailingPolicy: state.sailingPolicy,
    rationPolicy: state.rationPolicy,
    environmentId: environment.id,
    estimatedPosition: landfall.estimatedPosition,
    uncertainty: landfall.uncertainty,
    waterConsumedKg: consumption.waterConsumedKg,
    provisionsConsumedKg: consumption.provisionsConsumedKg,
    observedWeather: environment.observedWeather,
    observedWind: { ...environment.observedWind },
    observation: observed.observation,
    landfall: landfall.landfall,
    event: "none",
    interruption: landfall.interruption,
  };
  return finalizeState({
    ...detachedState(state) as NavigationSimulationState,
    committedDay,
    date,
    truePosition: movement.truePosition,
    estimatedPosition: landfall.estimatedPosition,
    uncertainty: landfall.uncertainty,
    crew: consumption.crew,
    stores: consumption.stores,
    ship: { ...state.ship },
    prng: movement.nextMovementPrng,
    navigation: {
      environmentModel: state.navigation.environmentModel,
      environmentPrng: environment.nextEnvironmentPrng,
      weatherState: environment.nextWeatherState,
      observedWeather: environment.observedWeather,
      observedWind: { ...environment.observedWind },
      knowledge: landfall.knowledge,
      lastObservation: observed.observation,
      lastLandfall: landfall.landfall,
      interruption: landfall.interruption,
    },
    canonicalLog: [...state.canonicalLog, entry],
    replayCommands: [...state.replayCommands, { type: "advance_day" }],
  });
}

export function applyCommand(
  state: Readonly<LegacySimulationState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): LegacySimulationState;
export function applyCommand(
  state: Readonly<NavigationSimulationState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): NavigationSimulationState;
export function applyCommand(
  state: Readonly<SimulationState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): SimulationState;
export function applyCommand(
  state: Readonly<SimulationState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): SimulationState {
  assertSimulationState(state);
  assertSimulationCommand(command);
  if (command.type !== "advance_day") {
    return applySettingCommand(state, command);
  }
  if (state.format === NAVIGATION_STATE_FORMAT) {
    return advanceNavigationDay(state, environmentProvider ?? authoredAtlanticEnvironment);
  }
  return advanceLegacyDay(state, environmentProvider ?? fairWeatherStillWaterEnvironment);
}

export function advanceDay(
  state: Readonly<LegacySimulationState>,
  environmentProvider?: EnvironmentProvider,
): LegacySimulationState;
export function advanceDay(
  state: Readonly<NavigationSimulationState>,
  environmentProvider?: EnvironmentProvider,
): NavigationSimulationState;
export function advanceDay(
  state: Readonly<SimulationState>,
  environmentProvider?: EnvironmentProvider,
): SimulationState;
export function advanceDay(
  state: Readonly<SimulationState>,
  environmentProvider?: EnvironmentProvider,
): SimulationState {
  return applyCommand(state, { type: "advance_day" }, environmentProvider);
}

function basePlayerView(state: Readonly<SimulationState>) {
  return {
    contentVersion: state.contentVersion,
    committedDay: state.committedDay,
    date: state.date,
    estimatedPosition: { ...state.estimatedPosition },
    uncertainty: { ...state.uncertainty },
    heading: state.heading,
    sailingPolicy: state.sailingPolicy,
    rationPolicy: state.rationPolicy,
    crew: { ...state.crew },
    stores: { ...state.stores },
    moneyDucats: state.moneyDucats,
    ship: { ...state.ship },
    log: state.canonicalLog.map(copyLogEntry),
  };
}

export function getPlayerView(state: Readonly<SimulationState>): PlayerView {
  assertSimulationState(state);
  const base = basePlayerView(state);
  if (state.format === NAVIGATION_STATE_FORMAT) {
    return deepFreeze({
      ...base,
      navigation: {
        observedWeather: state.navigation.observedWeather,
        observedWind: { ...state.navigation.observedWind },
        knownFacts: state.navigation.knowledge.map(copyFact),
        observation: copyObservation(state.navigation.lastObservation),
        landfall: copyLandfall(state.navigation.lastLandfall),
        interruption: copyInterrupt(state.navigation.interruption),
      },
    }) as NavigationPlayerView;
  }
  return deepFreeze(base) as PlayerView;
}
