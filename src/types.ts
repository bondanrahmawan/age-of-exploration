export const STATE_FORMAT = "age-of-exploration-state-v1" as const;
export const NAVIGATION_STATE_FORMAT = "age-of-exploration-state-v2" as const;
export const SURVIVAL_STATE_FORMAT = "age-of-exploration-state-v3" as const;
export const JOURNEY_STATE_FORMAT = "age-of-exploration-state-v4" as const;
export const SAVE_FORMAT = "age-of-exploration-save-v1" as const;
export const NAVIGATION_SAVE_FORMAT = "age-of-exploration-save-v2" as const;
export const SURVIVAL_SAVE_FORMAT = "age-of-exploration-save-v3" as const;
export const JOURNEY_SAVE_FORMAT = "age-of-exploration-save-v4" as const;
export const REPLAY_FORMAT = "age-of-exploration-replay-v1" as const;
export const NAVIGATION_REPLAY_FORMAT = "age-of-exploration-replay-v2" as const;
export const SURVIVAL_REPLAY_FORMAT = "age-of-exploration-replay-v3" as const;
export const JOURNEY_REPLAY_FORMAT = "age-of-exploration-replay-v4" as const;
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
export const STORE_KINDS = ["water", "provisions", "repair_stores", "medicine"] as const;
export const SHIP_COMPONENTS = ["hull", "mast", "sails", "rudder"] as const;
export const SURVIVAL_LOCATIONS = ["lisbon", "at_sea", "cape_verde"] as const;
export const EXPEDITION_INTENTS = [
  "pursue_objective",
  "return_to_lisbon",
  "objective_abandoned",
] as const;
export const SURVIVAL_WARNING_CODES = [
  "zero_water",
  "zero_provisions",
  "sour_water",
  "provisions_spoiling",
  "hull_danger",
  "crew_health_danger",
] as const;
export const EVENT_CATEGORIES = ["weather", "stores", "ship", "crew", "navigation"] as const;
export const JOURNEY_LOCATIONS = ["lisbon", "at_sea", "cape_verde", "cape"] as const;
export const JOURNEY_FACT_TYPES = [
  "rumour", "landmark", "water_source", "current", "hazard", "anchorage",
] as const;
export const RUN_OUTCOME_IDS = [
  "full_success", "report_success", "partial_return", "objective_failure",
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
export type StoreKind = (typeof STORE_KINDS)[number];
export type ShipComponent = (typeof SHIP_COMPONENTS)[number];
export type SurvivalLocation = (typeof SURVIVAL_LOCATIONS)[number];
export type ExpeditionIntent = (typeof EXPEDITION_INTENTS)[number];
export type SurvivalWarningCode = (typeof SURVIVAL_WARNING_CODES)[number];
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type JourneyLocation = (typeof JOURNEY_LOCATIONS)[number];
export type JourneyFactType = (typeof JOURNEY_FACT_TYPES)[number];
export type RunOutcomeId = (typeof RUN_OUTCOME_IDS)[number];
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

export interface StoreBatch {
  readonly id: string;
  readonly store: "water" | "provisions";
  readonly source: "lisbon" | "cape_verde" | "cape";
  readonly acquiredDate: string;
  readonly remainingKg: number;
}

export interface DatedStoreBatches {
  readonly water: readonly StoreBatch[];
  readonly provisions: readonly StoreBatch[];
}

export interface SurvivalWarning {
  readonly code: SurvivalWarningCode;
  readonly firstCommittedDay: number;
  readonly message: string;
}

export type SurvivalStatus =
  | { readonly kind: "active"; readonly message: "Expedition remains active." }
  | {
      readonly kind: "stranded";
      readonly reason:
        | "hull_danger"
        | "mast_disabled"
        | "sails_disabled"
        | "rudder_disabled"
        | "insufficient_able_crew";
      readonly message: string;
    }
  | {
      readonly kind: "terminal";
      readonly reason: "ship_lost" | "crew_unable_to_continue";
      readonly message: string;
    };

export type SurvivalInterrupt =
  | { readonly kind: "none" }
  | { readonly kind: "warning"; readonly warnings: readonly SurvivalWarningCode[] }
  | {
      readonly kind: "stranded";
      readonly reason: Extract<SurvivalStatus, { readonly kind: "stranded" }>["reason"];
      readonly availableResponses: readonly ("repair" | "distress" | "abandon_objective")[];
    }
  | {
      readonly kind: "terminal";
      readonly reason: Extract<SurvivalStatus, { readonly kind: "terminal" }>["reason"];
    };

export interface SurvivalState {
  readonly lifecycle: "outfitting" | "underway";
  readonly location: SurvivalLocation;
  readonly batches: DatedStoreBatches;
  readonly nextBatchSequence: number;
  readonly capeVerdeStock: StoresState;
  readonly foulingSpeedLossBps: number;
  readonly careeningDaysCompleted: number;
  readonly warnings: readonly SurvivalWarning[];
  readonly zeroWaterPressureDays: number;
  readonly zeroProvisionPressureDays: number;
  readonly status: SurvivalStatus;
  readonly interruption: SurvivalInterrupt;
  readonly expeditionIntent: ExpeditionIntent;
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

export type EastWestObservationResult =
  | { readonly kind: "none" }
  | { readonly kind: "open_ocean" }
  | { readonly kind: "land_signs"; readonly eastWestUncertaintyMnm: 600_000 }
  | { readonly kind: "shoaling_water"; readonly eastWestUncertaintyMnm: 200_000 };

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

export interface SetLisbonOutfittingCommand {
  readonly type: "set_lisbon_outfitting";
  readonly allocation: StoresState;
}

export interface DepartLisbonCommand {
  readonly type: "depart_lisbon";
}

export interface EnterCapeVerdePortCommand {
  readonly type: "enter_cape_verde_port";
}

export interface LeaveCapeVerdePortCommand {
  readonly type: "leave_cape_verde_port";
}

export interface PurchaseAtCapeVerdeCommand {
  readonly type: "purchase_at_cape_verde";
  readonly store: StoreKind;
  readonly quantityKg: number;
}

export interface RestAtCapeVerdeCommand {
  readonly type: "rest_at_cape_verde";
}

export interface RepairDayCommand {
  readonly type: "repair_day";
  readonly component: ShipComponent;
  readonly location: "at_sea" | "cape_verde";
}

export interface CareenDayAtCapeVerdeCommand {
  readonly type: "careen_day_at_cape_verde";
}

export interface SetExpeditionIntentCommand {
  readonly type: "set_expedition_intent";
  readonly intent: ExpeditionIntent;
}

export interface PurchaseCapeVerdeRumourCommand {
  readonly type: "purchase_cape_verde_rumour";
}

export interface RecogniseCapeLandfallCommand {
  readonly type: "recognise_cape_landfall";
}

export interface SurveyCapeDayCommand {
  readonly type: "survey_cape_day";
}

export interface CollectCapeWaterCommand {
  readonly type: "collect_cape_water";
}

export interface ObservationDayCommand {
  readonly type: "observation_day";
}

export interface LeaveCapeCommand {
  readonly type: "leave_cape";
}

export interface ChooseEventCommand {
  readonly type: "choose_event";
  readonly eventId: string;
  readonly choiceId: string;
}

export type JourneyOnlyCommand =
  | PurchaseCapeVerdeRumourCommand
  | RecogniseCapeLandfallCommand
  | SurveyCapeDayCommand
  | CollectCapeWaterCommand
  | ObservationDayCommand
  | LeaveCapeCommand
  | ChooseEventCommand;

export type SurvivalOnlyCommand =
  | SetLisbonOutfittingCommand
  | DepartLisbonCommand
  | EnterCapeVerdePortCommand
  | LeaveCapeVerdePortCommand
  | PurchaseAtCapeVerdeCommand
  | RestAtCapeVerdeCommand
  | RepairDayCommand
  | CareenDayAtCapeVerdeCommand
  | SetExpeditionIntentCommand;

export type SimulationCommand =
  | SetHeadingCommand
  | SetSailingPolicyCommand
  | SetRationPolicyCommand
  | AdvanceDayCommand
  | SurvivalOnlyCommand
  | JourneyOnlyCommand;

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

export type SurvivalActionResult =
  | {
      readonly kind: "lisbon_outfitting_set";
      readonly allocation: StoresState;
      readonly costDucats: number;
      readonly moneyRemainingDucats: number;
      readonly allocatableHoldUsedKg: number;
    }
  | {
      readonly kind: "departed_lisbon";
      readonly moneyCarriedDucats: number;
      readonly allocatableHoldUsedKg: number;
    }
  | { readonly kind: "entered_cape_verde_port" }
  | { readonly kind: "left_cape_verde_port" }
  | {
      readonly kind: "cape_verde_purchase";
      readonly store: StoreKind;
      readonly quantityKg: number;
      readonly costDucats: number;
      readonly moneyRemainingDucats: number;
      readonly stockRemainingKg: number;
      readonly allocatableHoldUsedKg: number;
    }
  | {
      readonly kind: "expedition_intent_set";
      readonly intent: ExpeditionIntent;
    };

export interface SurvivalActionLogEntry {
  readonly index: number;
  readonly type: "survival_action";
  readonly committedDay: number;
  readonly result: SurvivalActionResult;
  readonly warnings: readonly SurvivalWarning[];
  readonly status: SurvivalStatus;
  readonly interruption: SurvivalInterrupt;
}

export type SurvivalDayActivityResult =
  | { readonly kind: "sailing" }
  | {
      readonly kind: "stranded_wait";
      readonly reason: Extract<SurvivalStatus, { readonly kind: "stranded" }>["reason"];
    }
  | {
      readonly kind: "repair";
      readonly location: "at_sea" | "cape_verde";
      readonly component: ShipComponent;
      readonly repairStoresSpentKg: number;
      readonly conditionRestoredBps: number;
    }
  | {
      readonly kind: "port_rest";
      readonly moneySpentDucats: number;
      readonly healthRestoredBps: number;
      readonly moraleRestoredBps: number;
    }
  | {
      readonly kind: "careening";
      readonly completedDays: number;
      readonly completed: boolean;
      readonly foulingReset: boolean;
    };

export interface SurvivalDayLogEntry {
  readonly index: number;
  readonly type: "survival_day";
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
  readonly provisionsSpoiledKg: number;
  readonly observedWeather: WeatherKind;
  readonly observedWind: ObservedWind;
  readonly observation: ObservationResult;
  readonly landfall: LandfallResult;
  readonly event: "none";
  readonly activity: SurvivalDayActivityResult;
  readonly foulingSpeedLossBps: number;
  readonly warnings: readonly SurvivalWarning[];
  readonly status: SurvivalStatus;
  readonly interruption: SurvivalInterrupt;
}

export type EventWarningStage = "none" | "warning" | "threat" | "terminal";
export type EventMitigationResource =
  | "days"
  | "stores"
  | "money"
  | "morale"
  | "repair_capacity"
  | "preparation"
  | "objective";

export interface EventChoiceRequirement {
  readonly minimumMoneyDucats?: number;
  readonly minimumWaterKg?: number;
  readonly minimumProvisionsKg?: number;
  readonly minimumRepairStoresKg?: number;
  readonly minimumMedicineKg?: number;
  readonly minimumMoraleBps?: number;
  readonly requiredFlags?: readonly string[];
}

export interface JourneyFactEffect {
  readonly id: string;
  readonly type: JourneyFactType;
  readonly status: NavigationFactStatus;
  readonly confidence: number;
  readonly source: string;
  readonly claim: string;
}

export interface EventEffects {
  readonly waterDeltaKg?: number;
  readonly provisionsDeltaKg?: number;
  readonly repairStoresDeltaKg?: number;
  readonly medicineDeltaKg?: number;
  readonly moneyDeltaDucats?: number;
  readonly crewHealthDeltaBps?: number;
  readonly crewMoraleDeltaBps?: number;
  readonly ableCrewDelta?: number;
  readonly hullDeltaBps?: number;
  readonly mastDeltaBps?: number;
  readonly sailsDeltaBps?: number;
  readonly rudderDeltaBps?: number;
  readonly setFlags?: readonly string[];
  readonly clearFlags?: readonly string[];
  readonly facts?: readonly JourneyFactEffect[];
  readonly abandonObjective?: boolean;
  readonly terminalReason?: "mutiny_seizure" | "authored_abandonment";
}

export interface DelayedConsequenceSpec {
  readonly id: string;
  readonly dueAfterDays: number;
  readonly logText: string;
  readonly effects: EventEffects;
  readonly followUpEventId?: string;
}

export interface EventChoiceDefinition {
  readonly id: string;
  readonly label: string;
  readonly requirement: EventChoiceRequirement;
  readonly mitigationResource: EventMitigationResource;
  readonly immediateLogText: string;
  readonly effects: EventEffects;
  readonly delayed?: readonly DelayedConsequenceSpec[];
}

export interface EventHardGates {
  readonly regions?: readonly ("north_atlantic" | "south_atlantic" | "cape_verde" | "cape")[];
  readonly seasons?: readonly ("winter" | "spring" | "summer" | "autumn")[];
  readonly weatherKinds?: readonly WeatherKind[];
  readonly requiredFlags?: readonly string[];
  readonly forbiddenFlags?: readonly string[];
  readonly maximumMoraleBps?: number;
  readonly maximumHealthBps?: number;
  readonly maximumShipComponent?: {
    readonly component: ShipComponent;
    readonly bps: number;
  };
  readonly minimumCommittedDay?: number;
}

export interface EventWeightModifier {
  readonly kind:
    | "press_on"
    | "cautious"
    | "old_water"
    | "low_morale"
    | "low_health"
    | "damaged_ship"
    | "prepared_flag";
  readonly addWeight: number;
  readonly flag?: string;
}

export interface RememberedEventText {
  readonly requiredFlag: string;
  readonly text: string;
}

export interface EventDefinition {
  readonly id: string;
  readonly category: EventCategory;
  readonly title: string;
  readonly logText: string;
  readonly rememberedText: readonly RememberedEventText[];
  readonly hardGates: EventHardGates;
  readonly baseWeight: number;
  readonly weightModifiers: readonly EventWeightModifier[];
  readonly cooldownDays: number;
  readonly oncePerLeg: boolean;
  readonly warningStage: EventWarningStage;
  readonly choices: readonly EventChoiceDefinition[];
  readonly traits: {
    readonly delayed: boolean;
    readonly remembered: boolean;
    readonly preparationSoftened: boolean;
    readonly factProducing: boolean;
  };
}

export interface EventChoiceAvailability {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface PendingChoiceEvent {
  readonly eventId: string;
  readonly title: string;
  readonly text: string;
  readonly presentedDay: number;
  readonly warningStage: EventWarningStage;
  readonly choices: readonly EventChoiceAvailability[];
}

export interface ScheduledConsequence {
  readonly id: string;
  readonly sourceEventId: string;
  readonly dueCommittedDay: number;
  readonly logText: string;
  readonly effects: EventEffects;
  readonly followUpEventId: string | null;
}

export interface EventHistoryEntry {
  readonly eventId: string;
  readonly presentedDay: number;
  readonly leg: number;
  readonly choiceId: string | null;
}

export interface JourneyFact {
  readonly id: string;
  readonly type: JourneyFactType;
  readonly status: NavigationFactStatus;
  readonly confidence: number;
  readonly source: string;
  readonly observedDate: string;
  readonly claim: string;
}

export interface RunOutcome {
  readonly id: RunOutcomeId;
  readonly reason: string;
  readonly day: number;
  readonly objectiveStatus: "achieved" | "not_achieved" | "abandoned";
  readonly crew: CrewState;
  readonly ship: ShipState;
  readonly stores: StoresState;
  readonly factsCarried: number;
}

export interface JourneyState {
  readonly eventModel: "authored-journey-events-v1";
  readonly eventPrng: PrngState;
  readonly dailyEventChancePermille: number;
  readonly location: JourneyLocation;
  readonly leg: number;
  readonly objectiveAchieved: boolean;
  readonly rumourPurchased: boolean;
  readonly capeSurveyDaysCompleted: number;
  readonly surveyedLandmarkIds: readonly string[];
  readonly capeWaterCollectedKg: number;
  readonly observationDaysSpent: number;
  readonly lastEastWestObservation: EastWestObservationResult;
  readonly facts: readonly JourneyFact[];
  readonly flags: readonly string[];
  readonly pendingEvent: PendingChoiceEvent | null;
  readonly scheduledConsequences: readonly ScheduledConsequence[];
  readonly eventHistory: readonly EventHistoryEntry[];
  readonly firedThisLeg: readonly string[];
  readonly outcome: RunOutcome | null;
}

export type JourneyDayActivityResult =
  | SurvivalDayActivityResult
  | {
      readonly kind: "cape_survey";
      readonly completedDays: number;
      readonly completed: boolean;
      readonly factsLearned: readonly string[];
    }
  | {
      readonly kind: "cape_water_collection";
      readonly waterCollectedKg: number;
    }
  | {
      readonly kind: "east_west_observation";
      readonly result: EastWestObservationResult;
      readonly eastWestUncertaintyBeforeMnm: number;
      readonly eastWestUncertaintyAfterMnm: number;
      readonly estimateCorrectionMnm: number;
    };

export interface EventPresentationLog {
  readonly eventId: string;
  readonly title: string;
  readonly text: string;
  readonly warningStage: EventWarningStage;
}

export interface DelayedConsequenceLog {
  readonly id: string;
  readonly sourceEventId: string;
  readonly text: string;
}

export interface JourneyDayLogEntry {
  readonly index: number;
  readonly type: "journey_day";
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
  readonly provisionsSpoiledKg: number;
  readonly observedWeather: WeatherKind;
  readonly observedWind: ObservedWind;
  readonly observation: ObservationResult;
  readonly landfall: LandfallResult;
  readonly event: "none" | EventPresentationLog;
  readonly delayedConsequences: readonly DelayedConsequenceLog[];
  readonly activity: JourneyDayActivityResult;
  readonly foulingSpeedLossBps: number;
  readonly warnings: readonly SurvivalWarning[];
  readonly status: SurvivalStatus;
  readonly interruption: SurvivalInterrupt;
  readonly journeyLocation: JourneyLocation;
  readonly outcome: RunOutcome | null;
}

export type JourneyActionResult =
  | { readonly kind: "cape_verde_rumour_purchased"; readonly factId: string; readonly costDucats: 10 }
  | { readonly kind: "cape_landfall_recognised"; readonly landmarkId: string }
  | { readonly kind: "left_cape" }
  | {
      readonly kind: "event_choice_resolved";
      readonly eventId: string;
      readonly choiceId: string;
      readonly scheduledConsequenceIds: readonly string[];
      readonly factsLearned: readonly string[];
    };

export interface JourneyActionLogEntry {
  readonly index: number;
  readonly type: "journey_action";
  readonly committedDay: number;
  readonly result: JourneyActionResult;
  readonly text: string;
  readonly outcome: RunOutcome | null;
}

export type SurvivalCommandResult = SurvivalActionLogEntry | SurvivalDayLogEntry | CommandLogEntry;

export type CanonicalLogEntry =
  | CommandLogEntry
  | DayLogEntry
  | NavigationDayLogEntry
  | SurvivalActionLogEntry
  | SurvivalDayLogEntry
  | JourneyDayLogEntry
  | JourneyActionLogEntry;

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

export interface SurvivalSimulationState extends SimulationStateBase {
  readonly format: typeof SURVIVAL_STATE_FORMAT;
  readonly navigation: NavigationState;
  readonly survival: SurvivalState;
}

export interface JourneySimulationState extends SimulationStateBase {
  readonly format: typeof JOURNEY_STATE_FORMAT;
  readonly navigation: NavigationState;
  readonly survival: SurvivalState;
  readonly journey: JourneyState;
}

export type SimulationState =
  | LegacySimulationState
  | NavigationSimulationState
  | SurvivalSimulationState
  | JourneySimulationState;

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

export interface SurvivalInitialStateConfig {
  readonly contentVersion: string;
  readonly runSeed: string;
  readonly date?: string;
  readonly heading?: Heading;
  readonly sailingPolicy?: SailingPolicy;
  readonly rationPolicy?: RationPolicy;
  readonly initialWeather?: WeatherKind;
  readonly knowledge?: readonly NavigationFact[];
}

export interface JourneyInitialStateConfig extends SurvivalInitialStateConfig {
  readonly dailyEventChancePermille?: number;
}

export interface JourneyFixtureConfig extends JourneyInitialStateConfig {
  readonly lifecycle?: "outfitting" | "underway";
  readonly location?: JourneyLocation;
  readonly truePosition?: PositionMnm;
  readonly estimatedPosition?: PositionMnm;
  readonly waterKg?: number;
  readonly provisionsKg?: number;
  readonly repairStoresKg?: number;
  readonly medicineKg?: number;
  readonly moneyDucats?: number;
  readonly crewCount?: number;
  readonly ableCrew?: number;
  readonly healthBps?: number;
  readonly moraleBps?: number;
  readonly hullBps?: number;
  readonly mastBps?: number;
  readonly sailsBps?: number;
  readonly rudderBps?: number;
  readonly objectiveAchieved?: boolean;
  readonly flags?: readonly string[];
  readonly facts?: readonly JourneyFact[];
  readonly rumourPurchased?: boolean;
}

export interface CapeVerdePortFixtureConfig extends SurvivalInitialStateConfig {
  readonly waterKg?: number;
  readonly provisionsKg?: number;
  readonly repairStoresKg?: number;
  readonly medicineKg?: number;
  readonly moneyDucats?: number;
  readonly acquiredDate?: string;
  readonly crewCount?: number;
  readonly ableCrew?: number;
  readonly healthBps?: number;
  readonly moraleBps?: number;
  readonly hullBps?: number;
  readonly mastBps?: number;
  readonly sailsBps?: number;
  readonly rudderBps?: number;
  readonly foulingSpeedLossBps?: number;
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

export interface SurvivalPlayerView extends PlayerViewBase {
  readonly navigation: NavigationPlayerView["navigation"];
  readonly survival: {
    readonly lifecycle: SurvivalState["lifecycle"];
    readonly location: SurvivalLocation;
    readonly allocatableHoldUsedKg: number;
    readonly allocatableHoldRemainingKg: number;
    readonly fixedMissionAllocationKg: number;
    readonly totalHoldKg: number;
    readonly batches: DatedStoreBatches;
    readonly capeVerdeStock: StoresState | null;
    readonly foulingSpeedLossBps: number;
    readonly careeningDaysCompleted: number;
    readonly warnings: readonly SurvivalWarning[];
    readonly status: SurvivalStatus;
    readonly interruption: SurvivalInterrupt;
    readonly expeditionIntent: ExpeditionIntent;
  };
}

export interface JourneyPlayerView extends PlayerViewBase {
  readonly navigation: NavigationPlayerView["navigation"];
  readonly survival: SurvivalPlayerView["survival"];
  readonly journey: {
    readonly location: JourneyLocation;
    readonly objectiveAchieved: boolean;
    readonly rumourPurchased: boolean;
    readonly capeSurveyDaysCompleted: number;
    readonly surveyedLandmarkIds: readonly string[];
    readonly capeWaterCollectedKg: number;
    readonly observationDaysSpent: number;
    readonly lastEastWestObservation: EastWestObservationResult;
    readonly knownFacts: readonly JourneyFact[];
    readonly pendingEvent: PendingChoiceEvent | null;
    readonly outcome: RunOutcome | null;
  };
}

export type PlayerView =
  | LegacyPlayerView
  | NavigationPlayerView
  | SurvivalPlayerView
  | JourneyPlayerView;

export interface LegacySaveEnvelope {
  readonly format: typeof SAVE_FORMAT;
  readonly state: LegacySimulationState;
}

export interface NavigationSaveEnvelope {
  readonly format: typeof NAVIGATION_SAVE_FORMAT;
  readonly state: NavigationSimulationState;
}

export interface SurvivalSaveEnvelope {
  readonly format: typeof SURVIVAL_SAVE_FORMAT;
  readonly state: SurvivalSimulationState;
}

export interface JourneySaveEnvelope {
  readonly format: typeof JOURNEY_SAVE_FORMAT;
  readonly state: JourneySimulationState;
}

export type SaveEnvelope =
  | LegacySaveEnvelope
  | NavigationSaveEnvelope
  | SurvivalSaveEnvelope
  | JourneySaveEnvelope;

export interface ReplayRecord {
  readonly format:
    | typeof REPLAY_FORMAT
    | typeof NAVIGATION_REPLAY_FORMAT
    | typeof SURVIVAL_REPLAY_FORMAT
    | typeof JOURNEY_REPLAY_FORMAT;
  readonly contentVersion: string;
  readonly runSeed: string;
  readonly startingStateHash: string;
  readonly commands: readonly SimulationCommand[];
}
