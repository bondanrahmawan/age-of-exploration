import type {
  CrewState,
  EnvironmentProvider,
  JourneyFixtureConfig,
  JourneyPlayerView,
  JourneySimulationState,
  NavigationFactStatus,
  PositionMnm,
  ShipState,
  SimulationCommand,
  StoresState,
  UncertaintyRadiiMnm,
  WeatherKind,
} from "./types.js";

export const CAMPAIGN_STATE_FORMAT = "age-of-exploration-campaign-v1" as const;
export const CAMPAIGN_SAVE_FORMAT = "age-of-exploration-campaign-save-v1" as const;
export const CAMPAIGN_REPLAY_FORMAT = "age-of-exploration-campaign-replay-v1" as const;
export const AFTER_ACTION_REPORT_FORMAT = "age-of-exploration-after-action-v1" as const;

export const CAMPAIGN_FACT_TYPES = [
  "rumour",
  "landmark",
  "port",
  "water_source",
  "current",
  "hazard",
  "anchorage",
] as const;

export const CAMPAIGN_OUTCOME_IDS = [
  "full_success",
  "report_success",
  "partial_return",
  "objective_failure",
] as const;

export type CampaignFactType = (typeof CAMPAIGN_FACT_TYPES)[number];
export type CampaignOutcomeId = (typeof CAMPAIGN_OUTCOME_IDS)[number];

export type CampaignClaimedValue =
  | { readonly kind: "position"; readonly position: PositionMnm }
  | { readonly kind: "current_vector"; readonly vectorMnmPerDay: PositionMnm }
  | { readonly kind: "statement"; readonly text: string };

export interface CampaignFactEvidence {
  readonly evidenceId: string;
  readonly runNumber: number;
  readonly claimedValue: CampaignClaimedValue;
  readonly source: string;
  readonly confidence: number;
  readonly observedDate: string;
  readonly reportedDate: string | null;
  readonly status: NavigationFactStatus;
}

export interface CampaignFact {
  readonly id: string;
  readonly type: CampaignFactType;
  readonly locationOrRegion: string;
  readonly claimedValue: CampaignClaimedValue;
  readonly source: string;
  readonly confidence: number;
  readonly observedDate: string;
  readonly reportedDate: string | null;
  readonly status: NavigationFactStatus;
  /** Stable, sorted evidence retains conflicting equal-ID claims instead of overwriting them. */
  readonly evidence: readonly CampaignFactEvidence[];
}

export interface ExpeditionMetrics {
  readonly crew: CrewState;
  readonly ship: ShipState;
  readonly stores: StoresState;
}

export interface HiddenAfterActionTracePoint {
  readonly day: number;
  readonly date: string;
  readonly estimatedPosition: PositionMnm;
  readonly truePosition: PositionMnm;
  readonly uncertainty: UncertaintyRadiiMnm;
  readonly observedWeather: WeatherKind;
  readonly currentContributionMnm: PositionMnm;
  readonly recognisedLandmarkId: string | null;
}

export interface CampaignReportSnapshot {
  readonly committedDay: number;
  readonly date: string;
  readonly objectiveAchieved: boolean;
  readonly facts: readonly CampaignFact[];
  readonly snapshotHash: string;
}

export interface ActiveExpedition {
  readonly runNumber: number;
  readonly runSeed: string;
  readonly inheritedFacts: readonly CampaignFact[];
  readonly journey: JourneySimulationState;
  readonly reportSnapshot: CampaignReportSnapshot | null;
  readonly hiddenTrace: readonly HiddenAfterActionTracePoint[];
  readonly startingMetrics: ExpeditionMetrics;
  readonly departureMetrics: ExpeditionMetrics | null;
  readonly departureDate: string;
}

export interface CampaignRunSummary {
  readonly runNumber: number;
  readonly runSeed: string;
  readonly outcome: CampaignOutcomeId;
  readonly reason: string;
  readonly departureDate: string;
  readonly finalDate: string;
  readonly elapsedCommittedDays: number;
  readonly objectiveAchieved: boolean;
  readonly reportedFactCount: number;
  readonly lostFactCount: number;
  readonly reportSnapshotDay: number | null;
  readonly reportSnapshotHash: string | null;
}

export interface CampaignFactChange {
  readonly id: string;
  readonly before: CampaignFact | null;
  readonly after: CampaignFact;
}

export interface TrackPosition {
  readonly day: number;
  readonly date: string;
  readonly position: PositionMnm;
}

export interface UncertaintyHistoryPoint {
  readonly day: number;
  readonly date: string;
  readonly uncertainty: UncertaintyRadiiMnm;
  readonly errorMnm: PositionMnm;
}

export type CurrentContributionHistoryPoint =
  | {
      readonly day: number;
      readonly date: string;
      readonly explanation: "supported_by_reported_evidence";
      readonly supportingFactId: string;
      readonly vectorMnmPerDay: PositionMnm;
    }
  | {
      readonly day: number;
      readonly date: string;
      readonly explanation: "unexplained_route_divergence";
    };

export interface AfterActionReport {
  readonly format: typeof AFTER_ACTION_REPORT_FORMAT;
  readonly runNumber: number;
  readonly runSeed: string;
  readonly outcome: CampaignOutcomeId;
  readonly reason: string;
  readonly departureDate: string;
  readonly finalDate: string;
  readonly elapsedCommittedDays: number;
  readonly objectiveStatus: "achieved" | "not_achieved" | "abandoned";
  readonly startingMetrics: ExpeditionMetrics;
  readonly finalMetrics: ExpeditionMetrics;
  readonly waterConsumedKg: number;
  readonly provisionsConsumedKg: number;
  readonly factsObserved: readonly CampaignFact[];
  readonly factsReported: readonly CampaignFact[];
  readonly factsDisproved: readonly CampaignFact[];
  readonly factsLostWithShip: readonly CampaignFact[];
  readonly reportSnapshotDay: number | null;
  readonly reportSnapshotHash: string | null;
  readonly campaignFactsChanged: readonly CampaignFactChange[];
  readonly nextExpeditionDifferences: readonly CampaignFactChange[];
  readonly estimatedTrack: readonly TrackPosition[];
  readonly trueTrack: readonly TrackPosition[];
  readonly uncertaintyHistory: readonly UncertaintyHistoryPoint[];
  readonly currentContributionHistory: readonly CurrentContributionHistoryPoint[];
}

export type CampaignCommand =
  | { readonly type: "start_expedition"; readonly runSeed: string }
  | { readonly type: "forward_simulation_command"; readonly command: SimulationCommand }
  | { readonly type: "deposit_report_at_cape_verde" }
  | { readonly type: "finalize_expedition" };

export type CampaignCommandResult =
  | { readonly kind: "expedition_started"; readonly runNumber: number; readonly runSeed: string }
  | {
      readonly kind: "simulation_command_forwarded";
      readonly runNumber: number;
      readonly journeyLogIndex: number;
      readonly committedDay: number;
    }
  | {
      readonly kind: "cape_verde_report_deposited";
      readonly runNumber: number;
      readonly committedDay: number;
      readonly factCount: number;
      readonly snapshotHash: string;
    }
  | {
      readonly kind: "expedition_finalized";
      readonly runNumber: number;
      readonly outcome: CampaignOutcomeId;
      readonly afterActionReportHash: string;
    };

export interface CampaignLogEntry {
  readonly index: number;
  readonly type: "campaign_command";
  readonly runNumber: number | null;
  readonly command: CampaignCommand;
  readonly result: CampaignCommandResult;
}

export interface CampaignState {
  readonly format: typeof CAMPAIGN_STATE_FORMAT;
  readonly contentVersion: string;
  readonly expeditionDailyEventChancePermille: number;
  readonly facts: readonly CampaignFact[];
  readonly completedRuns: readonly CampaignRunSummary[];
  readonly afterActionReports: readonly AfterActionReport[];
  readonly activeExpedition: ActiveExpedition | null;
  readonly commandLog: readonly CampaignLogEntry[];
  readonly replayCommands: readonly CampaignCommand[];
}

export interface CampaignInitialConfig {
  readonly contentVersion: string;
  readonly expeditionDailyEventChancePermille?: number;
}

export interface CampaignFixtureConfig extends CampaignInitialConfig {
  readonly runSeed: string;
  readonly journey?: Omit<JourneyFixtureConfig, "contentVersion" | "runSeed" | "knowledge">;
  readonly facts?: readonly CampaignFact[];
}

export interface CampaignPlayerView {
  readonly contentVersion: string;
  readonly currentRunNumber: number | null;
  readonly inheritedReportedFacts: readonly CampaignFact[];
  readonly priorRunSummaries: readonly CampaignRunSummary[];
  readonly activeRun: JourneyPlayerView | null;
  readonly depositedReport: {
    readonly deposited: boolean;
    readonly date: string | null;
    readonly factCount: number;
  };
  readonly afterActionReports: readonly AfterActionReport[];
}

export interface CampaignSaveEnvelope {
  readonly format: typeof CAMPAIGN_SAVE_FORMAT;
  readonly state: CampaignState;
}

export interface CampaignReplayRecord {
  readonly format: typeof CAMPAIGN_REPLAY_FORMAT;
  readonly contentVersion: string;
  readonly startingCampaignHash: string;
  readonly expeditionSeeds: readonly string[];
  readonly commands: readonly CampaignCommand[];
}

export interface CampaignExecutionOptions {
  readonly environmentProvider?: EnvironmentProvider;
}
