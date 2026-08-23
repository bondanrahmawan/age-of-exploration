import { addOneDay } from "./date.js";
import {
  authoredAtlanticEnvironment,
  fairWeatherStillWaterEnvironment,
} from "./environment.js";
import { SimulationValidationError } from "./errors.js";
import { deepFreeze } from "./immutable.js";
import { createPrngState, nextIntegerInclusive } from "./prng.js";
import {
  ACTIVE_SURVIVAL_STATUS,
  SURVIVAL_TUNING,
  appendBatch,
  assertStoreCapsAndHold,
  batchTotalKg,
  capeVerdeInitialStock,
  capeVerdePurchaseCost,
  componentCondition,
  consumeOldestFirst,
  copyBatches,
  emptyBatches,
  emptyStores,
  hasOldWater,
  holdUsedKg,
  isTropicalDay,
  lisbonOutfittingCost,
  spoilProvisionBatches,
  storeQuantity,
  survivalWarning,
  withComponentCondition,
  withStoreQuantity,
} from "./survival.js";
import {
  DAY_PHASE_ORDER,
  NAVIGATION_STATE_FORMAT,
  STATE_FORMAT,
  SURVIVAL_STATE_FORMAT,
  type CanonicalLogEntry,
  type CapeVerdePortFixtureConfig,
  type CommandLogEntry,
  type CrewState,
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
  type PrngState,
  type RationPolicy,
  type SailingPolicy,
  type ShipComponent,
  type ShipState,
  type SimulationCommand,
  type SimulationState,
  type StoreBatch,
  type StoreKind,
  type StoresState,
  type SurvivalActionLogEntry,
  type SurvivalActionResult,
  type SurvivalCommandResult,
  type SurvivalDayActivityResult,
  type SurvivalDayLogEntry,
  type SurvivalInitialStateConfig,
  type SurvivalInterrupt,
  type SurvivalPlayerView,
  type SurvivalSimulationState,
  type SurvivalStatus,
  type SurvivalWarning,
  type SurvivalWarningCode,
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
  LANDMARK_IDS,
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
  if (state.format === SURVIVAL_STATE_FORMAT) {
    let distance = scaleByPermille(
      BASE_DAILY_RUN_MNM,
      [
        environment.pointOfSailPermille,
        SAILING_SPEED_PERMILLE[sailingPolicy],
        sailConditionPermille(state),
        environment.weatherPermille,
      ],
      "WP2 daily commanded movement before crew and fouling",
    );
    if (state.crew.able < 14) {
      distance = divideRoundHalfAwayFromZero(
        BigInt(distance) * BigInt(state.crew.able),
        14n,
        "WP2 exact crew-work factor",
      );
    }
    return divideRoundHalfAwayFromZero(
      BigInt(distance) * BigInt(10_000 - state.survival.foulingSpeedLossBps),
      10_000n,
      "WP2 fouling speed factor",
    );
  }
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

function copySurvivalWarning(warning: Readonly<SurvivalWarning>): SurvivalWarning {
  return { ...warning };
}

function copySurvivalStatus(status: Readonly<SurvivalStatus>): SurvivalStatus {
  return { ...status };
}

function copySurvivalInterrupt(interruption: Readonly<SurvivalInterrupt>): SurvivalInterrupt {
  if (interruption.kind === "warning") {
    return { kind: "warning", warnings: [...interruption.warnings] };
  }
  if (interruption.kind === "stranded") {
    return {
      kind: "stranded",
      reason: interruption.reason,
      availableResponses: [...interruption.availableResponses],
    };
  }
  return { ...interruption };
}

function copySurvivalActionResult(result: Readonly<SurvivalActionResult>): SurvivalActionResult {
  return result.kind === "lisbon_outfitting_set"
    ? { ...result, allocation: { ...result.allocation } }
    : { ...result };
}

function copySurvivalDayActivity(result: Readonly<SurvivalDayActivityResult>): SurvivalDayActivityResult {
  return { ...result };
}

function copyLogEntry(entry: Readonly<CanonicalLogEntry>): CanonicalLogEntry {
  if (entry.type === "command") {
    return { ...entry };
  }
  if (entry.type === "survival_action") {
    return {
      ...entry,
      result: copySurvivalActionResult(entry.result),
      warnings: entry.warnings.map(copySurvivalWarning),
      status: copySurvivalStatus(entry.status),
      interruption: copySurvivalInterrupt(entry.interruption),
    };
  }
  if (entry.type === "survival_day") {
    return {
      ...entry,
      phaseOrder: [...entry.phaseOrder],
      estimatedPosition: { ...entry.estimatedPosition },
      uncertainty: { ...entry.uncertainty },
      observedWind: { ...entry.observedWind },
      observation: copyObservation(entry.observation),
      landfall: copyLandfall(entry.landfall),
      activity: copySurvivalDayActivity(entry.activity),
      warnings: entry.warnings.map(copySurvivalWarning),
      status: copySurvivalStatus(entry.status),
      interruption: copySurvivalInterrupt(entry.interruption),
    };
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
  if (state.format === NAVIGATION_STATE_FORMAT || state.format === SURVIVAL_STATE_FORMAT) {
    const navigation = {
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
    };
    if (state.format === SURVIVAL_STATE_FORMAT) {
      return {
        format: SURVIVAL_STATE_FORMAT,
        ...common,
        navigation,
        survival: {
          lifecycle: state.survival.lifecycle,
          location: state.survival.location,
          batches: copyBatches(state.survival.batches),
          nextBatchSequence: state.survival.nextBatchSequence,
          capeVerdeStock: { ...state.survival.capeVerdeStock },
          foulingSpeedLossBps: state.survival.foulingSpeedLossBps,
          careeningDaysCompleted: state.survival.careeningDaysCompleted,
          warnings: state.survival.warnings.map(copySurvivalWarning),
          zeroWaterPressureDays: state.survival.zeroWaterPressureDays,
          zeroProvisionPressureDays: state.survival.zeroProvisionPressureDays,
          status: copySurvivalStatus(state.survival.status),
          interruption: copySurvivalInterrupt(state.survival.interruption),
          expeditionIntent: state.survival.expeditionIntent,
        },
      };
    }
    return { format: NAVIGATION_STATE_FORMAT, ...common, navigation };
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

export function createSurvivalState(
  config: Readonly<SurvivalInitialStateConfig>,
): SurvivalSimulationState {
  const navigation = createNavigationState({
    ...config,
    waterKg: 0,
    provisionsKg: 0,
    repairStoresKg: 0,
    medicineKg: 0,
    moneyDucats: SURVIVAL_TUNING.sponsorAdvanceDucats,
    crewCount: SURVIVAL_TUNING.crew.departureCount,
    ableCrew: SURVIVAL_TUNING.crew.departureAble,
    healthBps: SURVIVAL_TUNING.crew.departureHealthBps,
    moraleBps: SURVIVAL_TUNING.crew.departureMoraleBps,
  });
  const detached = detachedState(navigation) as NavigationSimulationState;
  return finalizeState({
    ...detached,
    format: SURVIVAL_STATE_FORMAT,
    stores: emptyStores(),
    moneyDucats: SURVIVAL_TUNING.sponsorAdvanceDucats,
    survival: {
      lifecycle: "outfitting",
      location: "lisbon",
      batches: emptyBatches(),
      nextBatchSequence: 0,
      capeVerdeStock: capeVerdeInitialStock(),
      foulingSpeedLossBps: 0,
      careeningDaysCompleted: 0,
      warnings: [],
      zeroWaterPressureDays: 0,
      zeroProvisionPressureDays: 0,
      status: { ...ACTIVE_SURVIVAL_STATUS },
      interruption: { kind: "none" },
      expeditionIntent: "pursue_objective",
    },
  });
}

function fixtureBatches(
  date: string,
  waterKg: number,
  provisionsKg: number,
): { readonly batches: ReturnType<typeof emptyBatches>; readonly nextSequence: number } {
  let batches = emptyBatches();
  let nextSequence = 0;
  const water = appendBatch(batches, "water", "lisbon", date, waterKg, nextSequence);
  batches = water.batches;
  nextSequence = water.nextSequence;
  const provisions = appendBatch(
    batches,
    "provisions",
    "lisbon",
    date,
    provisionsKg,
    nextSequence,
  );
  return { batches: provisions.batches, nextSequence: provisions.nextSequence };
}

/** Deterministic WP2-only fixture entry to port actions; it is not a journey transition. */
export function createCapeVerdePortFixtureState(
  config: Readonly<CapeVerdePortFixtureConfig>,
): SurvivalSimulationState {
  const base = createSurvivalState(config);
  const stores = {
    waterKg: config.waterKg ?? 10_000,
    provisionsKg: config.provisionsKg ?? 8_000,
    repairStoresKg: config.repairStoresKg ?? 2_000,
    medicineKg: config.medicineKg ?? 500,
  };
  assertStoreCapsAndHold(stores);
  const acquiredDate = config.acquiredDate ?? base.date;
  const dated = fixtureBatches(acquiredDate, stores.waterKg, stores.provisionsKg);
  const crew = {
    count: config.crewCount ?? SURVIVAL_TUNING.crew.departureCount,
    able: config.ableCrew ?? config.crewCount ?? SURVIVAL_TUNING.crew.departureAble,
    healthBps: config.healthBps ?? SURVIVAL_TUNING.crew.departureHealthBps,
    moraleBps: config.moraleBps ?? SURVIVAL_TUNING.crew.departureMoraleBps,
  };
  const ship = {
    hullBps: config.hullBps ?? 10_000,
    mastBps: config.mastBps ?? 10_000,
    sailsBps: config.sailsBps ?? 10_000,
    rudderBps: config.rudderBps ?? 10_000,
  };
  const status = sailingCapabilityStatus(crew, ship);
  return finalizeState({
    ...detachedState(base) as SurvivalSimulationState,
    truePosition: { ...LANDMARKS.find((landmark) => landmark.id === LANDMARK_IDS.capeVerde)!.centre },
    estimatedPosition: { ...LANDMARKS.find((landmark) => landmark.id === LANDMARK_IDS.capeVerde)!.centre },
    uncertainty: { eastWestMnm: 5_000, northSouthMnm: 5_000 },
    crew,
    stores,
    moneyDucats: config.moneyDucats ?? 100,
    ship,
    navigation: {
      ...base.navigation,
      lastLandfall: { kind: "recognised", landmarkId: LANDMARK_IDS.capeVerde },
      interruption: { kind: "landfall", result: "recognised" },
    },
    survival: {
      ...base.survival,
      lifecycle: "underway",
      location: "cape_verde",
      batches: dated.batches,
      nextBatchSequence: dated.nextSequence,
      foulingSpeedLossBps: config.foulingSpeedLossBps ?? 0,
      status,
      interruption: interruptForStatus(status),
    },
  });
}

type SettingCommand = Extract<
  SimulationCommand,
  { readonly type: "set_heading" | "set_sailing_policy" | "set_ration_policy" }
>;

function commandLog(
  state: Readonly<SimulationState>,
  command: SettingCommand,
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
  command: SettingCommand,
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
    navigation: state.format === NAVIGATION_STATE_FORMAT || state.format === SURVIVAL_STATE_FORMAT
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
  state: Readonly<NavigationSimulationState | SurvivalSimulationState>,
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

function sailingCapabilityStatus(
  crew: Readonly<CrewState>,
  ship: Readonly<ShipState>,
): SurvivalStatus {
  if (crew.healthBps === 0) {
    return {
      kind: "terminal",
      reason: "crew_unable_to_continue",
      message: "The pooled crew is unable to continue the expedition.",
    };
  }
  if (ship.hullBps === 0) {
    return {
      kind: "stranded",
      reason: "hull_danger",
      message: "The hull cannot safely make way; repair, distress, or abandonment is required.",
    };
  }
  if (ship.mastBps === 0) {
    return {
      kind: "stranded",
      reason: "mast_disabled",
      message: "The mast is disabled; normal travel is stopped pending repair or distress.",
    };
  }
  if (ship.sailsBps === 0) {
    return {
      kind: "stranded",
      reason: "sails_disabled",
      message: "The sails are disabled; normal travel is stopped pending repair or distress.",
    };
  }
  if (ship.rudderBps === 0) {
    return {
      kind: "stranded",
      reason: "rudder_disabled",
      message: "The rudder is disabled; normal travel is stopped pending repair or distress.",
    };
  }
  if (crew.able < SURVIVAL_TUNING.crew.minimumAbleToMakeWay) {
    return {
      kind: "stranded",
      reason: "insufficient_able_crew",
      message: "Fewer than eight able crew remain; the ship is stranded pending later rescue or port resolution.",
    };
  }
  return { ...ACTIVE_SURVIVAL_STATUS };
}

function interruptForStatus(status: Readonly<SurvivalStatus>): SurvivalInterrupt {
  if (status.kind === "terminal") return { kind: "terminal", reason: status.reason };
  if (status.kind === "stranded") {
    return {
      kind: "stranded",
      reason: status.reason,
      availableResponses: ["repair", "distress", "abandon_objective"],
    };
  }
  return { kind: "none" };
}

function warningIsActive(
  warnings: readonly Readonly<SurvivalWarning>[],
  code: SurvivalWarningCode,
): boolean {
  return warnings.some((warning) => warning.code === code);
}

function setWarningActive(
  warnings: readonly Readonly<SurvivalWarning>[],
  code: SurvivalWarningCode,
  active: boolean,
  committedDay: number,
): readonly SurvivalWarning[] {
  const existing = warnings.find((warning) => warning.code === code);
  if (!active) return warnings.filter((warning) => warning.code !== code).map(copySurvivalWarning);
  if (existing !== undefined) return warnings.map(copySurvivalWarning);
  return [...warnings.map(copySurvivalWarning), survivalWarning(code, committedDay)];
}

function syncStoreWarnings(
  prior: readonly Readonly<SurvivalWarning>[],
  stores: Readonly<StoresState>,
  batches: Readonly<{ readonly water: readonly StoreBatch[]; readonly provisions: readonly StoreBatch[] }>,
  date: string,
  provisionsSpoiledKg: number,
  committedDay: number,
): readonly SurvivalWarning[] {
  let warnings = setWarningActive(prior, "zero_water", stores.waterKg === 0, committedDay);
  warnings = setWarningActive(warnings, "zero_provisions", stores.provisionsKg === 0, committedDay);
  warnings = setWarningActive(warnings, "sour_water", hasOldWater(batches.water, date), committedDay);
  warnings = setWarningActive(
    warnings,
    "provisions_spoiling",
    provisionsSpoiledKg > 0,
    committedDay,
  );
  return warnings;
}

function syncConditionWarnings(
  prior: readonly Readonly<SurvivalWarning>[],
  crew: Readonly<CrewState>,
  ship: Readonly<ShipState>,
  committedDay: number,
): readonly SurvivalWarning[] {
  let warnings = setWarningActive(
    prior,
    "hull_danger",
    ship.hullBps <= SURVIVAL_TUNING.warnings.hullDangerAtOrBelowBps,
    committedDay,
  );
  warnings = setWarningActive(
    warnings,
    "crew_health_danger",
    crew.healthBps <= SURVIVAL_TUNING.warnings.crewHealthDangerAtOrBelowBps,
    committedDay,
  );
  return warnings;
}

function requestedSurvivalConsumption(
  livingCrewAtDayStart: number,
  policy: RationPolicy,
): { readonly waterKg: number; readonly provisionsKg: number } {
  const tuning = SURVIVAL_TUNING.rations[policy];
  return {
    waterKg: divideCeiling(
      BigInt(livingCrewAtDayStart) * 6n * BigInt(tuning.waterUsePermille),
      1_000n,
      "WP2 daily water consumption",
    ),
    provisionsKg: divideCeiling(
      BigInt(livingCrewAtDayStart) * 3n * BigInt(tuning.provisionUsePermille),
      1_000n,
      "WP2 daily provision consumption",
    ),
  };
}

type SurvivalDayCommand = Extract<
  SimulationCommand,
  {
    readonly type:
      | "advance_day"
      | "rest_at_cape_verde"
      | "repair_day"
      | "careen_day_at_cape_verde";
  }
>;

function validateSurvivalDayCommand(
  state: Readonly<SurvivalSimulationState>,
  command: Readonly<SurvivalDayCommand>,
): void {
  if (state.survival.lifecycle !== "underway") {
    throw new SimulationValidationError("a survival day cannot begin before Lisbon departure");
  }
  if (state.survival.status.kind === "terminal") {
    throw new SimulationValidationError("a terminal expedition cannot commit another day");
  }
  if (command.type === "advance_day") {
    if (state.survival.location !== "at_sea") {
      throw new SimulationValidationError("advance_day is a sailing command and requires an at-sea location");
    }
    return;
  }
  if (command.type === "rest_at_cape_verde") {
    if (state.survival.location !== "cape_verde") {
      throw new SimulationValidationError("rest is available only at Cape Verde");
    }
    if (state.moneyDucats < SURVIVAL_TUNING.capeVerdeRest.costDucats) {
      throw new SimulationValidationError("insufficient money for one Cape Verde rest day");
    }
    return;
  }
  if (command.type === "careen_day_at_cape_verde") {
    if (state.survival.location !== "cape_verde") {
      throw new SimulationValidationError("careening is available only at Cape Verde");
    }
    return;
  }
  if (state.survival.location !== command.location) {
    throw new SimulationValidationError("repair command location does not match the expedition location");
  }
  const tuning = SURVIVAL_TUNING.repair[command.location];
  if (state.stores.repairStoresKg < tuning.repairStoresKg) {
    throw new SimulationValidationError("insufficient repair stores for the requested repair day");
  }
  if (componentCondition(state.ship, command.component) === CONDITION_MAX_BPS) {
    throw new SimulationValidationError("the targeted ship component is already at full condition");
  }
}

function advanceSurvivalDay(
  state: Readonly<SurvivalSimulationState>,
  command: Readonly<SurvivalDayCommand>,
  provider: EnvironmentProvider,
): SurvivalSimulationState {
  validateSurvivalDayCommand(state, command);

  let truePosition = { ...state.truePosition };
  let estimatedPosition = { ...state.estimatedPosition };
  let uncertainty = { ...state.uncertainty };
  let nextMovementPrng: PrngState = {
    algorithm: state.prng.algorithm,
    words: [...state.prng.words] as [number, number, number, number],
  };
  let nextEnvironmentPrng: PrngState = {
    algorithm: state.navigation.environmentPrng.algorithm,
    words: [...state.navigation.environmentPrng.words] as [number, number, number, number],
  };
  let nextWeatherState = { ...state.navigation.weatherState };
  let observedWeather = state.navigation.observedWeather;
  let observedWind = { ...state.navigation.observedWind };
  let observation: ObservationResult = { kind: "none" };
  let landfall: LandfallResult = { kind: "none" };
  let navigationInterrupt: NavigationInterrupt = { kind: "none" };
  let knowledge = state.navigation.knowledge.map(copyFact);
  let environmentId = "wp2-no-randomness-v1";
  let activity: SurvivalDayActivityResult;

  if (command.type === "advance_day") {
    const capability = sailingCapabilityStatus(state.crew, state.ship);
    if (capability.kind === "active") {
      const environment = resolveEnvironment(state, state.heading, state.sailingPolicy, provider);
      if (!isNavigationEnvironment(environment)) {
        throw new SimulationValidationError("state v3 requires a WP1 navigation daily environment");
      }
      const movement = movementForDay(state, environment);
      const observed = resolveNavigationObservation(
        environment,
        movement.truePosition,
        movement.estimatedPosition,
        movement.uncertainty,
      );
      const resolvedLandfall = resolveLandfall(
        state,
        environment,
        movement.truePosition,
        observed.estimatedPosition,
        observed.uncertainty,
      );
      truePosition = movement.truePosition;
      estimatedPosition = resolvedLandfall.estimatedPosition;
      uncertainty = resolvedLandfall.uncertainty;
      nextMovementPrng = movement.nextMovementPrng;
      nextEnvironmentPrng = environment.nextEnvironmentPrng;
      nextWeatherState = environment.nextWeatherState;
      observedWeather = environment.observedWeather;
      observedWind = { ...environment.observedWind };
      observation = observed.observation;
      landfall = resolvedLandfall.landfall;
      navigationInterrupt = resolvedLandfall.interruption;
      knowledge = resolvedLandfall.knowledge.map(copyFact);
      environmentId = environment.id;
      activity = { kind: "sailing" };
    } else if (capability.kind === "stranded") {
      environmentId = "wp2-no-randomness-v1:stranded-wait";
      activity = { kind: "stranded_wait", reason: capability.reason };
    } else {
      throw new SimulationValidationError("a terminal expedition cannot attempt normal travel");
    }
  } else if (command.type === "repair_day") {
    const tuning = SURVIVAL_TUNING.repair[command.location];
    const before = componentCondition(state.ship, command.component);
    activity = {
      kind: "repair",
      location: command.location,
      component: command.component,
      repairStoresSpentKg: tuning.repairStoresKg,
      conditionRestoredBps: Math.min(tuning.restorationBps, CONDITION_MAX_BPS - before),
    };
    environmentId = `wp2-no-randomness-v1:repair-${command.location}`;
  } else if (command.type === "rest_at_cape_verde") {
    activity = {
      kind: "port_rest",
      moneySpentDucats: SURVIVAL_TUNING.capeVerdeRest.costDucats,
      healthRestoredBps: 0,
      moraleRestoredBps: 0,
    };
    environmentId = "wp2-no-randomness-v1:cape-verde-rest";
  } else {
    const completedDays = state.survival.careeningDaysCompleted + 1;
    const completed = completedDays === SURVIVAL_TUNING.fouling.careeningDays;
    activity = { kind: "careening", completedDays, completed, foulingReset: completed };
    environmentId = "wp2-no-randomness-v1:cape-verde-careening";
  }

  const committedDay = state.committedDay + 1;
  const date = addOneDay(state.date);
  const requested = requestedSurvivalConsumption(state.crew.count, state.rationPolicy);
  const water = consumeOldestFirst(state.survival.batches.water, requested.waterKg);
  const provisions = consumeOldestFirst(
    state.survival.batches.provisions,
    requested.provisionsKg,
  );
  const spoiled = spoilProvisionBatches(provisions.batches, date);
  const batches = {
    water: water.batches,
    provisions: spoiled.batches,
  };
  let stores: StoresState = {
    ...state.stores,
    waterKg: batchTotalKg(batches.water),
    provisionsKg: batchTotalKg(batches.provisions),
  };
  let ship: ShipState = { ...state.ship };
  let moneyDucats = state.moneyDucats;
  let careeningDaysCompleted = state.survival.careeningDaysCompleted;
  let foulingSpeedLossBps = state.survival.foulingSpeedLossBps;

  if (isTropicalDay(state.truePosition)) {
    foulingSpeedLossBps = Math.min(
      SURVIVAL_TUNING.fouling.maximumSpeedLossBps,
      foulingSpeedLossBps + SURVIVAL_TUNING.fouling.dailySpeedLossBps,
    );
  }
  if (activity.kind === "repair") {
    stores = {
      ...stores,
      repairStoresKg: stores.repairStoresKg - activity.repairStoresSpentKg,
    };
    ship = withComponentCondition(
      ship,
      activity.component,
      componentCondition(ship, activity.component) + activity.conditionRestoredBps,
    );
  } else if (activity.kind === "port_rest") {
    moneyDucats -= activity.moneySpentDucats;
  } else if (activity.kind === "careening") {
    careeningDaysCompleted = activity.completed ? 0 : activity.completedDays;
    if (activity.completed) foulingSpeedLossBps = 0;
  }

  const hadZeroWaterWarning = warningIsActive(state.survival.warnings, "zero_water");
  const hadZeroProvisionWarning = warningIsActive(state.survival.warnings, "zero_provisions");
  const waterPressure = stores.waterKg === 0 && hadZeroWaterWarning;
  const provisionPressure = stores.provisionsKg === 0 && hadZeroProvisionWarning;
  const ration = SURVIVAL_TUNING.rations[state.rationPolicy];
  let healthBps = clampInteger(
    state.crew.healthBps
      + ration.healthDeltaBps
      + (waterPressure ? SURVIVAL_TUNING.warnings.zeroWaterHealthDeltaBps : 0)
      + (provisionPressure ? SURVIVAL_TUNING.warnings.zeroProvisionHealthDeltaBps : 0),
    0,
    CONDITION_MAX_BPS,
  );
  let moraleBps = clampInteger(
    state.crew.moraleBps
      + ration.moraleDeltaBps
      + (waterPressure ? SURVIVAL_TUNING.warnings.zeroWaterMoraleDeltaBps : 0)
      + (provisionPressure ? SURVIVAL_TUNING.warnings.zeroProvisionMoraleDeltaBps : 0),
    0,
    CONDITION_MAX_BPS,
  );
  if (activity.kind === "port_rest") {
    const beforeHealth = healthBps;
    const beforeMorale = moraleBps;
    healthBps = clampInteger(
      healthBps + SURVIVAL_TUNING.capeVerdeRest.healthRestorationBps,
      0,
      CONDITION_MAX_BPS,
    );
    moraleBps = clampInteger(
      moraleBps + SURVIVAL_TUNING.capeVerdeRest.moraleRestorationBps,
      0,
      CONDITION_MAX_BPS,
    );
    activity = {
      ...activity,
      healthRestoredBps: healthBps - beforeHealth,
      moraleRestoredBps: moraleBps - beforeMorale,
    };
  }
  const crew = { ...state.crew, healthBps, moraleBps };

  let warnings = syncStoreWarnings(
    state.survival.warnings,
    stores,
    batches,
    date,
    spoiled.spoiledKg,
    committedDay,
  );
  warnings = syncConditionWarnings(warnings, crew, ship, committedDay);

  const hadHullDangerWarning = warningIsActive(state.survival.warnings, "hull_danger");
  let status = sailingCapabilityStatus(crew, ship);
  if (ship.hullBps === 0 && hadHullDangerWarning) {
    status = {
      kind: "terminal",
      reason: "ship_lost",
      message: "The warned hull failure has resulted in loss of the ship.",
    };
  }
  const newlyVisibleWarnings = warnings
    .filter((warning) => !warningIsActive(state.survival.warnings, warning.code))
    .map((warning) => warning.code);
  let survivalInterrupt = interruptForStatus(status);
  if (status.kind === "active" && newlyVisibleWarnings.length > 0) {
    survivalInterrupt = { kind: "warning", warnings: newlyVisibleWarnings };
  }

  const entry: SurvivalDayLogEntry = {
    index: state.canonicalLog.length,
    type: "survival_day",
    committedDay,
    date,
    phaseOrder: [...DAY_PHASE_ORDER],
    heading: state.heading,
    sailingPolicy: state.sailingPolicy,
    rationPolicy: state.rationPolicy,
    environmentId,
    estimatedPosition,
    uncertainty,
    waterConsumedKg: water.consumedKg,
    provisionsConsumedKg: provisions.consumedKg,
    provisionsSpoiledKg: spoiled.spoiledKg,
    observedWeather,
    observedWind,
    observation,
    landfall,
    event: "none",
    activity,
    foulingSpeedLossBps,
    warnings: warnings.map(copySurvivalWarning),
    status: copySurvivalStatus(status),
    interruption: copySurvivalInterrupt(survivalInterrupt),
  };

  return finalizeState({
    ...detachedState(state) as SurvivalSimulationState,
    committedDay,
    date,
    truePosition,
    estimatedPosition,
    uncertainty,
    crew,
    stores,
    moneyDucats,
    ship,
    prng: nextMovementPrng,
    navigation: {
      environmentModel: state.navigation.environmentModel,
      environmentPrng: nextEnvironmentPrng,
      weatherState: nextWeatherState,
      observedWeather,
      observedWind,
      knowledge,
      lastObservation: observation,
      lastLandfall: landfall,
      interruption: navigationInterrupt,
    },
    survival: {
      ...state.survival,
      batches,
      foulingSpeedLossBps,
      careeningDaysCompleted,
      warnings,
      zeroWaterPressureDays: stores.waterKg === 0
        ? (waterPressure ? state.survival.zeroWaterPressureDays + 1 : 0)
        : 0,
      zeroProvisionPressureDays: stores.provisionsKg === 0
        ? (provisionPressure ? state.survival.zeroProvisionPressureDays + 1 : 0)
        : 0,
      status,
      interruption: survivalInterrupt,
    },
    canonicalLog: [...state.canonicalLog.map(copyLogEntry), entry],
    replayCommands: [...state.replayCommands.map(copyCommand), copyCommand(command)],
  });
}

type SurvivalActionCommand = Extract<
  SimulationCommand,
  {
    readonly type:
      | "set_lisbon_outfitting"
      | "depart_lisbon"
      | "enter_cape_verde_port"
      | "leave_cape_verde_port"
      | "purchase_at_cape_verde"
      | "set_expedition_intent";
  }
>;

function finalizeSurvivalAction(
  prior: Readonly<SurvivalSimulationState>,
  next: SurvivalSimulationState,
  command: Readonly<SurvivalActionCommand>,
  result: SurvivalActionResult,
): SurvivalSimulationState {
  const entry: SurvivalActionLogEntry = {
    index: prior.canonicalLog.length,
    type: "survival_action",
    committedDay: prior.committedDay,
    result: copySurvivalActionResult(result),
    warnings: next.survival.warnings.map(copySurvivalWarning),
    status: copySurvivalStatus(next.survival.status),
    interruption: copySurvivalInterrupt(next.survival.interruption),
  };
  return finalizeState({
    ...next,
    canonicalLog: [...prior.canonicalLog.map(copyLogEntry), entry],
    replayCommands: [...prior.replayCommands.map(copyCommand), copyCommand(command)],
  });
}

function immediateStoreWarnings(
  prior: readonly Readonly<SurvivalWarning>[],
  stores: Readonly<StoresState>,
  batches: Readonly<{ readonly water: readonly StoreBatch[]; readonly provisions: readonly StoreBatch[] }>,
  date: string,
  committedDay: number,
): readonly SurvivalWarning[] {
  let warnings = setWarningActive(prior, "zero_water", stores.waterKg === 0, committedDay);
  warnings = setWarningActive(warnings, "zero_provisions", stores.provisionsKg === 0, committedDay);
  warnings = setWarningActive(warnings, "sour_water", hasOldWater(batches.water, date), committedDay);
  return warnings;
}

function applySurvivalAction(
  state: Readonly<SurvivalSimulationState>,
  command: Readonly<SurvivalActionCommand>,
): SurvivalSimulationState {
  if (state.survival.status.kind === "terminal") {
    throw new SimulationValidationError("a terminal expedition cannot accept another command");
  }
  if (command.type === "set_lisbon_outfitting") {
    if (state.survival.lifecycle !== "outfitting" || state.survival.location !== "lisbon") {
      throw new SimulationValidationError("Lisbon outfitting is available only before departure");
    }
    assertStoreCapsAndHold(command.allocation);
    const costDucats = lisbonOutfittingCost(command.allocation);
    if (costDucats > SURVIVAL_TUNING.sponsorAdvanceDucats) {
      throw new SimulationValidationError("Lisbon outfitting exceeds the 300 ducat sponsor advance");
    }
    const next = {
      ...detachedState(state) as SurvivalSimulationState,
      stores: { ...command.allocation },
      moneyDucats: SURVIVAL_TUNING.sponsorAdvanceDucats - costDucats,
    };
    return finalizeSurvivalAction(state, next, command, {
      kind: "lisbon_outfitting_set",
      allocation: { ...command.allocation },
      costDucats,
      moneyRemainingDucats: next.moneyDucats,
      allocatableHoldUsedKg: holdUsedKg(next.stores),
    });
  }
  if (command.type === "depart_lisbon") {
    if (state.survival.lifecycle !== "outfitting" || state.survival.location !== "lisbon") {
      throw new SimulationValidationError("Lisbon departure is available only after outfitting");
    }
    let batches = emptyBatches();
    let nextSequence = state.survival.nextBatchSequence;
    const water = appendBatch(
      batches,
      "water",
      "lisbon",
      state.date,
      state.stores.waterKg,
      nextSequence,
    );
    batches = water.batches;
    nextSequence = water.nextSequence;
    const provisions = appendBatch(
      batches,
      "provisions",
      "lisbon",
      state.date,
      state.stores.provisionsKg,
      nextSequence,
    );
    batches = provisions.batches;
    nextSequence = provisions.nextSequence;
    const warnings = immediateStoreWarnings(
      state.survival.warnings,
      state.stores,
      batches,
      state.date,
      state.committedDay,
    );
    const next = {
      ...detachedState(state) as SurvivalSimulationState,
      survival: {
        ...state.survival,
        lifecycle: "underway" as const,
        location: "at_sea" as const,
        batches,
        nextBatchSequence: nextSequence,
        warnings,
        interruption: warnings.length > 0
          ? { kind: "warning" as const, warnings: warnings.map((warning) => warning.code) }
          : { kind: "none" as const },
      },
    };
    return finalizeSurvivalAction(state, next, command, {
      kind: "departed_lisbon",
      moneyCarriedDucats: state.moneyDucats,
      allocatableHoldUsedKg: holdUsedKg(state.stores),
    });
  }
  if (command.type === "enter_cape_verde_port") {
    if (
      state.survival.lifecycle !== "underway"
      || state.survival.location !== "at_sea"
      || state.navigation.lastLandfall.kind !== "recognised"
      || state.navigation.lastLandfall.landmarkId !== LANDMARK_IDS.capeVerde
    ) {
      throw new SimulationValidationError("Cape Verde port entry requires a recognised Cape Verde landfall");
    }
    const next = {
      ...detachedState(state) as SurvivalSimulationState,
      survival: { ...state.survival, location: "cape_verde" as const },
    };
    return finalizeSurvivalAction(state, next, command, { kind: "entered_cape_verde_port" });
  }
  if (command.type === "leave_cape_verde_port") {
    if (state.survival.location !== "cape_verde") {
      throw new SimulationValidationError("Cape Verde departure requires the expedition to be in port");
    }
    if (state.survival.careeningDaysCompleted !== 0) {
      throw new SimulationValidationError("an incomplete six-day careening cycle must finish before departure");
    }
    const capability = sailingCapabilityStatus(state.crew, state.ship);
    if (capability.kind !== "active") {
      throw new SimulationValidationError("the expedition cannot leave port while unable to make way");
    }
    const next = {
      ...detachedState(state) as SurvivalSimulationState,
      navigation: {
        ...state.navigation,
        lastLandfall: { kind: "none" as const },
        interruption: { kind: "none" as const },
      },
      survival: { ...state.survival, location: "at_sea" as const },
    };
    return finalizeSurvivalAction(state, next, command, { kind: "left_cape_verde_port" });
  }
  if (command.type === "set_expedition_intent") {
    if (state.survival.lifecycle !== "underway") {
      throw new SimulationValidationError("expedition intent is available only after departure");
    }
    if (sailingCapabilityStatus(state.crew, state.ship).kind !== "active") {
      throw new SimulationValidationError("return or abandonment intent requires a ship able to sail");
    }
    const next = {
      ...detachedState(state) as SurvivalSimulationState,
      survival: { ...state.survival, expeditionIntent: command.intent },
    };
    return finalizeSurvivalAction(state, next, command, {
      kind: "expedition_intent_set",
      intent: command.intent,
    });
  }

  if (state.survival.lifecycle !== "underway" || state.survival.location !== "cape_verde") {
    throw new SimulationValidationError("Cape Verde purchases are available only while in port");
  }
  const availableKg = storeQuantity(state.survival.capeVerdeStock, command.store);
  if (command.quantityKg > availableKg) {
    throw new SimulationValidationError("Cape Verde purchase exceeds finite expedition stock");
  }
  const currentKg = storeQuantity(state.stores, command.store);
  const stores = withStoreQuantity(state.stores, command.store, currentKg + command.quantityKg);
  assertStoreCapsAndHold(stores);
  const costDucats = capeVerdePurchaseCost(command.store, command.quantityKg);
  if (costDucats > state.moneyDucats) {
    throw new SimulationValidationError("Cape Verde purchase exceeds available money");
  }
  const capeVerdeStock = withStoreQuantity(
    state.survival.capeVerdeStock,
    command.store,
    availableKg - command.quantityKg,
  );
  let batches = copyBatches(state.survival.batches);
  let nextBatchSequence = state.survival.nextBatchSequence;
  if (command.store === "water" || command.store === "provisions") {
    const appended = appendBatch(
      batches,
      command.store,
      "cape_verde",
      state.date,
      command.quantityKg,
      nextBatchSequence,
    );
    batches = appended.batches;
    nextBatchSequence = appended.nextSequence;
  }
  const warnings = immediateStoreWarnings(
    state.survival.warnings,
    stores,
    batches,
    state.date,
    state.committedDay,
  );
  const status = sailingCapabilityStatus(state.crew, state.ship);
  const interruption = interruptForStatus(status);
  const next = {
    ...detachedState(state) as SurvivalSimulationState,
    stores,
    moneyDucats: state.moneyDucats - costDucats,
    survival: {
      ...state.survival,
      batches,
      nextBatchSequence,
      capeVerdeStock,
      warnings,
      zeroWaterPressureDays: stores.waterKg === 0 ? state.survival.zeroWaterPressureDays : 0,
      zeroProvisionPressureDays: stores.provisionsKg === 0
        ? state.survival.zeroProvisionPressureDays
        : 0,
      status,
      interruption,
    },
  };
  return finalizeSurvivalAction(state, next, command, {
    kind: "cape_verde_purchase",
    store: command.store,
    quantityKg: command.quantityKg,
    costDucats,
    moneyRemainingDucats: next.moneyDucats,
    stockRemainingKg: storeQuantity(capeVerdeStock, command.store),
    allocatableHoldUsedKg: holdUsedKg(stores),
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
  state: Readonly<SurvivalSimulationState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): SurvivalSimulationState;
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
  const setting = command.type === "set_heading"
    || command.type === "set_sailing_policy"
    || command.type === "set_ration_policy";
  if (state.format === SURVIVAL_STATE_FORMAT) {
    if (setting) return applySettingCommand(state, command) as SurvivalSimulationState;
    if (
      command.type === "advance_day"
      || command.type === "rest_at_cape_verde"
      || command.type === "repair_day"
      || command.type === "careen_day_at_cape_verde"
    ) {
      return advanceSurvivalDay(
        state,
        command,
        environmentProvider ?? authoredAtlanticEnvironment,
      );
    }
    return applySurvivalAction(state, command);
  }
  if (!setting && command.type !== "advance_day") {
    throw new SimulationValidationError("WP2 survival commands require state format v3");
  }
  if (setting) {
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
  state: Readonly<SurvivalSimulationState>,
  environmentProvider?: EnvironmentProvider,
): SurvivalSimulationState;
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

export function executeSurvivalCommand(
  state: Readonly<SurvivalSimulationState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): { readonly state: SurvivalSimulationState; readonly result: SurvivalCommandResult } {
  const next = applyCommand(state, command, environmentProvider);
  const result = next.canonicalLog.at(-1);
  if (
    result === undefined
    || (result.type !== "command" && result.type !== "survival_action" && result.type !== "survival_day")
  ) {
    throw new SimulationValidationError("WP2 command did not produce a typed canonical result");
  }
  return deepFreeze({ state: next, result: copyLogEntry(result) as SurvivalCommandResult });
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
  if (state.format === SURVIVAL_STATE_FORMAT) {
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
      survival: {
        lifecycle: state.survival.lifecycle,
        location: state.survival.location,
        allocatableHoldUsedKg: holdUsedKg(state.stores),
        allocatableHoldRemainingKg: SURVIVAL_TUNING.hold.allocatableKg - holdUsedKg(state.stores),
        fixedMissionAllocationKg: SURVIVAL_TUNING.hold.fixedMissionAllocationKg,
        totalHoldKg: SURVIVAL_TUNING.hold.totalKg,
        batches: copyBatches(state.survival.batches),
        capeVerdeStock: state.survival.location === "cape_verde"
          ? { ...state.survival.capeVerdeStock }
          : null,
        foulingSpeedLossBps: state.survival.foulingSpeedLossBps,
        careeningDaysCompleted: state.survival.careeningDaysCompleted,
        warnings: state.survival.warnings.map(copySurvivalWarning),
        status: copySurvivalStatus(state.survival.status),
        interruption: copySurvivalInterrupt(state.survival.interruption),
        expeditionIntent: state.survival.expeditionIntent,
      },
    }) as SurvivalPlayerView;
  }
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
