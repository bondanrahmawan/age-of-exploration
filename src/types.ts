export const STATE_FORMAT = "age-of-exploration-state-v1" as const;
export const NAVIGATION_STATE_FORMAT = "age-of-exploration-state-v2" as const;
export const SAVE_FORMAT = "age-of-exploration-save-v1" as const;
export const NAVIGATION_SAVE_FORMAT = "age-of-exploration-save-v2" as const;
export const REPLAY_FORMAT = "age-of-exploration-replay-v1" as const;
export const NAVIGATION_REPLAY_FORMAT = "age-of-exploration-replay-v2" as const;
export const PRNG_ALGORITHM = "xoshiro128ss-v1" as const;

export const HEADINGS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

export const SAILING_POLICIES = ["cautious", "standard", "press_on"] as const;
export const RATION_POLICIES = [
  "normal",
  "reduced_water",
  "reduced_provisions",
  "reduced_both",
] as const;
export const WEATHER_KINDS = [
  "fair_clear",
  "rough_heavy_swell",
  "overcast",
  "calm",
  "storm",
] as const;
export const NAVIGATION_FACT_TYPES = ["landmark", "current"] as const;
export const NAVIGATION_FACT_STATUSES = [
  "rumoured",
  "observed",
  "confirmed",
  "disproved",
] as const;

export const DAY_PHASE_ORDER = [
  "lock_orders",
  "resolve_environment",
  "advance_true_position",
  "advance_estimate_and_uncertainty",
  "attempt_observation_and_landfall",
  "consume_stores_and_spoilage",
  "tick_ship_crew_health_and_morale",
  "evaluate_event",
  "test_interruptions_and_terminal_states",
] as const;

export type Heading = (typeof HEADINGS)[number];
export type SailingPolicy = (typeof SAILING_POLICIES)[number];
export type RationPolicy = (typeof RATION_POLICIES)[number];
export type WeatherKind = (typeof WEATHER_KINDS)[number];
export type NavigationFactType = (typeof NAVIGATION_FACT_TYPES)[number];
export type NavigationFactStatus = (typeof NAVIGATION_FACT_STATUSES)[number];
export type DayPhase = (typeof DAY_PHASE_ORDER)[number];

export interface PositionMnm {
  readonly xMnm: number;
  readonly yMnm: number;
}

export interface UncertaintyRadiiMnm {
  readonly eastWestMnm: number;
  readonly northSouthMnm: number;
}

export interface CrewState {
  readonly count: number;
  readonly able: number;
  readonly healthBps: number;
  readonly moraleBps: number;
}

export interface StoresState {
  readonly waterKg: number;
  readonly provisionsKg: number;
  readonly repairStoresKg: number;
  readonly medicineKg: number;
}

export interface ShipState {
  readonly hullBps: number;
  readonly mastBps: number;
  readonly sailsBps: number;
  readonly rudderBps: number;
}

export interface PrngState {
  readonly algorithm: typeof PRNG_ALGORITHM;
  readonly words: readonly [number, number, number, number];
}

export interface WeatherState {
  readonly kind: WeatherKind;
  readonly daysInState: number;
}

export interface ObservedWind {
  /** Compass heading the wind comes from. Calm has no direction. */
  readonly directionConvention: "from";
  readonly fromHeading: Heading | null;
  readonly strength: "calm" | "moderate" | "strong";
}

export interface PointOfSailResult {
  readonly kind: "running_broad" | "beam_reach" | "close_hauled" | "automatic_tacking" | "calm";
  readonly speedPermille: number;
  readonly uncertaintyPermille: number;
}

export interface LandmarkNavigationFact {
  readonly id: string;
  readonly type: "landmark";
  readonly status: NavigationFactStatus;
  readonly confidence: number;
  readonly claimedPosition: PositionMnm;
}

export interface CurrentNavigationFact {
  readonly id: string;
  readonly type: "current";
  readonly status: NavigationFactStatus;
  readonly confidence: number;
  readonly claimedVectorMnmPerDay: PositionMnm;
}

export type NavigationFact = LandmarkNavigationFact | CurrentNavigationFact;

export type ObservationResult =
  | { readonly kind: "none" }
  | { readonly kind: "clear_noon"; readonly northSouthUncertaintyMnm: 15_000 }
  | { readonly kind: "heavy_swell_noon"; readonly northSouthUncertaintyMnm: 40_000 }
  | { readonly kind: "overcast_no_sight" };

export type LandfallResult =
  | { readonly kind: "none" }
  | { readonly kind: "visible_unrecognised"; readonly knownFactId: string | null }
  | { readonly kind: "recognised"; readonly landmarkId: string }
  | { readonly kind: "missed"; readonly landmarkId: string };

export type NavigationInterrupt =
  | { readonly kind: "none" }
  | {
      readonly kind: "landfall";
      readonly result: "visible_unrecognised" | "recognised" | "missed";
    };

export interface NavigationState {
  readonly environmentModel: "authored-atlantic-v1";
  readonly environmentPrng: PrngState;
  readonly weatherState: WeatherState;
  readonly observedWeather: WeatherKind;
  readonly observedWind: ObservedWind;
  readonly knowledge: readonly NavigationFact[];
  readonly lastObservation: ObservationResult;
  readonly lastLandfall: LandfallResult;
  readonly interruption: NavigationInterrupt;
}

export interface SetHeadingCommand {
  readonly type: "set_heading";
  readonly heading: Heading;
}

export interface SetSailingPolicyCommand {
  readonly type: "set_sailing_policy";
  readonly policy: SailingPolicy;
}

export interface SetRationPolicyCommand {
  readonly type: "set_ration_policy";
  readonly policy: RationPolicy;
}

export interface AdvanceDayCommand {
  readonly type: "advance_day";
}

export type SimulationCommand =
  | SetHeadingCommand
  | SetSailingPolicyCommand
  | SetRationPolicyCommand
  | AdvanceDayCommand;

export interface CommandLogEntry {
  readonly index: number;
  readonly type: "command";
  readonly committedDay: number;
  readonly command:
    | "set_heading"
    | "set_sailing_policy"
    | "set_ration_policy";
  readonly value: Heading | SailingPolicy | RationPolicy;
}

interface DayLogEntryBase {
  readonly index: number;
  readonly type: "day";
  readonly committedDay: number;
  readonly date: string;
  readonly phaseOrder: readonly DayPhase[];
  readonly heading: Heading;
  readonly sailingPolicy: SailingPolicy;
  readonly rationPolicy: RationPolicy;
  readonly environmentId: string;
  readonly estimatedPosition: PositionMnm;
  readonly uncertainty: UncertaintyRadiiMnm;
  readonly waterConsumedKg: number;
  readonly provisionsConsumedKg: number;
  readonly event: "none";
}

export interface DayLogEntry extends DayLogEntryBase {
  readonly observation: "none";
  readonly landfall: "none";
  readonly interruption: "none";
}

export interface NavigationDayLogEntry extends DayLogEntryBase {
  readonly observedWeather: WeatherKind;
  readonly observedWind: ObservedWind;
  readonly observation: ObservationResult;
  readonly landfall: LandfallResult;
  readonly interruption: NavigationInterrupt;
}

export type CanonicalLogEntry = CommandLogEntry | DayLogEntry | NavigationDayLogEntry;

interface SimulationStateBase {
  readonly contentVersion: string;
  readonly runSeed: string;
  readonly committedDay: number;
  readonly date: string;
  readonly truePosition: PositionMnm;
  readonly estimatedPosition: PositionMnm;
  readonly uncertainty: UncertaintyRadiiMnm;
  readonly heading: Heading;
  readonly sailingPolicy: SailingPolicy;
  readonly rationPolicy: RationPolicy;
  readonly crew: CrewState;
  readonly stores: StoresState;
  readonly moneyDucats: number;
  readonly ship: ShipState;
  readonly prng: PrngState;
  readonly canonicalLog: readonly CanonicalLogEntry[];
  readonly replayCommands: readonly SimulationCommand[];
}

export interface LegacySimulationState extends SimulationStateBase {
  readonly format: typeof STATE_FORMAT;
}

export interface NavigationSimulationState extends SimulationStateBase {
  readonly format: typeof NAVIGATION_STATE_FORMAT;
  readonly navigation: NavigationState;
}

export type SimulationState = LegacySimulationState | NavigationSimulationState;

export interface InitialStateConfig {
  readonly contentVersion: string;
  readonly runSeed: string;
  readonly date?: string;
  readonly heading?: Heading;
  readonly sailingPolicy?: SailingPolicy;
  readonly rationPolicy?: RationPolicy;
  readonly crewCount?: number;
  readonly ableCrew?: number;
  readonly healthBps?: number;
  readonly moraleBps?: number;
  readonly waterKg?: number;
  readonly provisionsKg?: number;
  readonly repairStoresKg?: number;
  readonly medicineKg?: number;
  readonly moneyDucats?: number;
}

export interface NavigationInitialStateConfig extends InitialStateConfig {
  readonly truePosition?: PositionMnm;
  readonly estimatedPosition?: PositionMnm;
  readonly uncertainty?: UncertaintyRadiiMnm;
  readonly initialWeather?: WeatherKind;
  readonly knowledge?: readonly NavigationFact[];
}

export interface NavigationEnvironmentContext {
  readonly environmentPrng: PrngState;
  readonly weatherState: WeatherState;
  readonly knowledge: readonly NavigationFact[];
}

export interface EnvironmentContext {
  readonly contentVersion: string;
  readonly runSeed: string;
  readonly committedDay: number;
  readonly date: string;
  readonly heading: Heading;
  readonly sailingPolicy: SailingPolicy;
  readonly truePosition: PositionMnm;
  readonly navigation: NavigationEnvironmentContext | null;
}

export interface LegacyDailyEnvironment {
  readonly id: string;
  readonly pointOfSailPermille: number;
  readonly weatherPermille: number;
  readonly uncertaintyPermille: number;
  readonly tackingUncertaintyPermille: number;
  readonly trueCurrentMnm: PositionMnm;
  readonly knownCurrentMnm: PositionMnm;
  readonly leewayMnm: PositionMnm;
  readonly observation: "none";
  readonly landfall: "none";
}

export interface NavigationDailyEnvironment {
  readonly schema: "wp1-navigation-environment-v1";
  readonly id: string;
  readonly pointOfSailPermille: number;
  readonly weatherPermille: number;
  readonly uncertaintyPermille: number;
  readonly tackingUncertaintyPermille: number;
  readonly trueCurrentMnm: PositionMnm;
  readonly knownCurrentMnm: PositionMnm;
  readonly leewayMnm: PositionMnm;
  readonly observedWeather: WeatherKind;
  readonly observedWind: ObservedWind;
  readonly noonObservation: "clear" | "heavy_swell" | "overcast" | "none";
  readonly sightRadiusMnm: number;
  readonly nextWeatherState: WeatherState;
  readonly nextEnvironmentPrng: PrngState;
}

export type DailyEnvironment = LegacyDailyEnvironment | NavigationDailyEnvironment;

export type EnvironmentProvider = (
  context: Readonly<EnvironmentContext>,
) => Readonly<DailyEnvironment>;

interface PlayerViewBase {
  readonly contentVersion: string;
  readonly committedDay: number;
  readonly date: string;
  readonly estimatedPosition: PositionMnm;
  readonly uncertainty: UncertaintyRadiiMnm;
  readonly heading: Heading;
  readonly sailingPolicy: SailingPolicy;
  readonly rationPolicy: RationPolicy;
  readonly crew: CrewState;
  readonly stores: StoresState;
  readonly moneyDucats: number;
  readonly ship: ShipState;
  readonly log: readonly CanonicalLogEntry[];
}

export interface LegacyPlayerView extends PlayerViewBase {}

export interface NavigationPlayerView extends PlayerViewBase {
  readonly navigation: {
    readonly observedWeather: WeatherKind;
    readonly observedWind: ObservedWind;
    readonly knownFacts: readonly NavigationFact[];
    readonly observation: ObservationResult;
    readonly landfall: LandfallResult;
    readonly interruption: NavigationInterrupt;
  };
}

export type PlayerView = LegacyPlayerView | NavigationPlayerView;

export interface LegacySaveEnvelope {
  readonly format: typeof SAVE_FORMAT;
  readonly state: LegacySimulationState;
}

export interface NavigationSaveEnvelope {
  readonly format: typeof NAVIGATION_SAVE_FORMAT;
  readonly state: NavigationSimulationState;
}

export type SaveEnvelope = LegacySaveEnvelope | NavigationSaveEnvelope;

export interface ReplayRecord {
  readonly format: typeof REPLAY_FORMAT | typeof NAVIGATION_REPLAY_FORMAT;
  readonly contentVersion: string;
  readonly runSeed: string;
  readonly startingStateHash: string;
  readonly commands: readonly SimulationCommand[];
}
