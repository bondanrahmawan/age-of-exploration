import { canonicalize, hashCanonical } from "./canonical.js";
import {
  ReplayError,
  SaveFormatError,
  SimulationValidationError,
} from "./errors.js";
import {
  applyCommand,
  createJourneyFixtureState,
  createJourneyState,
  getPlayerView,
} from "./engine.js";
import { authoredAtlanticEnvironment } from "./environment.js";
import { deepFreeze } from "./immutable.js";
import type {
  CampaignClaimedValue,
  CampaignCommand,
  CampaignCommandResult,
  CampaignExecutionOptions,
  CampaignFact,
  CampaignFactChange,
  CampaignFactEvidence,
  CampaignFactType,
  CampaignFixtureConfig,
  CampaignInitialConfig,
  CampaignLogEntry,
  CampaignOutcomeId,
  CampaignPlayerView,
  CampaignReplayRecord,
  CampaignReportSnapshot,
  CampaignRunSummary,
  CampaignSaveEnvelope,
  CampaignState,
  ActiveExpedition,
  AfterActionReport,
  ExpeditionMetrics,
  HiddenAfterActionTracePoint,
} from "./campaign-types.js";
import {
  AFTER_ACTION_REPORT_FORMAT,
  CAMPAIGN_FACT_TYPES,
  CAMPAIGN_OUTCOME_IDS,
  CAMPAIGN_REPLAY_FORMAT,
  CAMPAIGN_SAVE_FORMAT,
  CAMPAIGN_STATE_FORMAT,
} from "./campaign-types.js";
import type {
  DailyEnvironment,
  EnvironmentProvider,
  JourneyFact,
  JourneySimulationState,
  NavigationFact,
  NavigationFactStatus,
  PositionMnm,
  SimulationCommand,
} from "./types.js";
import { assertSimulationCommand, assertSimulationState } from "./validation.js";
import {
  LANDMARK_IDS,
  LANDMARKS,
  SOUTH_ATLANTIC_CURRENT,
  SOUTH_ATLANTIC_CURRENT_ID,
  createStartingNavigationKnowledge,
} from "./world.js";

const DEFAULT_CAMPAIGN_DATE = "1488-04-01";
const DEFAULT_EVENT_CHANCE_PERMILLE = 120;
/** The ceiling word of mouth can put on a finding whose ship never came home. */
const SALVAGED_LOG_CONFIDENCE_CAP = 40;
/**
 * The higher ceiling for a finding a completed landmark survey produced. Two deliberate days
 * spent on a landmark the crew positively identified is a better class of claim than weed and
 * birds, and comes home worth more when the ship does not. Still short of 70, so a survey no
 * ship carried home can no more correct the reckoning by itself than any other salvage can.
 */
const SURVEYED_LANDMARK_SALVAGE_CONFIDENCE_CAP = 65;
/** §34.10 confidence bands: usable for player judgement at 40, automatic correction at 70. */
const OBSERVED_CONFIDENCE_FLOOR = 40;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function canonicalCopy<T>(value: Readonly<T>): T {
  return JSON.parse(canonicalize(value)) as T;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort().join(",");
  const wanted = [...expected].sort().join(",");
  if (actual !== wanted) throw new SimulationValidationError(`${label} has missing or unknown fields`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SimulationValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string, maximum = 2_048): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new SimulationValidationError(`${label} must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0, maximum = 1_000_000_000): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new SimulationValidationError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function isoDate(value: unknown, label: string): string {
  const text = stringValue(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new SimulationValidationError(`${label} must be an ISO calendar date`);
  }
  return text;
}

function position(value: unknown, label: string): PositionMnm {
  const item = record(value, label);
  exactKeys(item, ["xMnm", "yMnm"], label);
  return {
    xMnm: integer(item["xMnm"], `${label}.xMnm`, -1_000_000_000, 1_000_000_000),
    yMnm: integer(item["yMnm"], `${label}.yMnm`, -1_000_000_000, 1_000_000_000),
  };
}

function claim(value: unknown, label: string): CampaignClaimedValue {
  const item = record(value, label);
  if (item["kind"] === "position") {
    exactKeys(item, ["kind", "position"], label);
    return { kind: "position", position: position(item["position"], `${label}.position`) };
  }
  if (item["kind"] === "current_vector") {
    exactKeys(item, ["kind", "vectorMnmPerDay"], label);
    return {
      kind: "current_vector",
      vectorMnmPerDay: position(item["vectorMnmPerDay"], `${label}.vectorMnmPerDay`),
    };
  }
  if (item["kind"] === "statement") {
    exactKeys(item, ["kind", "text"], label);
    return { kind: "statement", text: stringValue(item["text"], `${label}.text`) };
  }
  throw new SimulationValidationError(`${label}.kind is not a campaign claim kind`);
}

function claimKey(value: Readonly<CampaignClaimedValue>): string {
  return canonicalize(value);
}

function evidenceWithoutReportedDate(value: Readonly<CampaignFactEvidence>): unknown {
  return {
    evidenceId: value.evidenceId,
    runNumber: value.runNumber,
    claimedValue: value.claimedValue,
    source: value.source,
    confidence: value.confidence,
    observedDate: value.observedDate,
    status: value.status,
  };
}

function mergeDuplicateEvidence(
  left: Readonly<CampaignFactEvidence>,
  right: Readonly<CampaignFactEvidence>,
): CampaignFactEvidence {
  if (canonicalize(evidenceWithoutReportedDate(left)) !== canonicalize(evidenceWithoutReportedDate(right))) {
    throw new SimulationValidationError(`conflicting campaign evidence ID ${left.evidenceId}`);
  }
  const reportedDates = [left.reportedDate, right.reportedDate]
    .filter((item): item is string => item !== null)
    .sort();
  return { ...canonicalCopy(left), reportedDate: reportedDates[0] ?? null };
}

function confidenceForEvidence(evidence: readonly Readonly<CampaignFactEvidence>[], type: CampaignFactType): number {
  const ordered = [...evidence].sort((left, right) =>
    left.observedDate.localeCompare(right.observedDate)
    || left.runNumber - right.runNumber
    || left.evidenceId.localeCompare(right.evidenceId));
  const first = ordered[0];
  if (first === undefined) throw new SimulationValidationError("campaign facts require evidence");
  let confidence = first.confidence;
  const seenRuns = new Set([first.runNumber]);
  for (const item of ordered.slice(1)) {
    const increment = seenRuns.has(item.runNumber) ? 20 : 25;
    confidence = Math.max(item.confidence, confidence + increment);
    seenRuns.add(item.runNumber);
  }
  return Math.min(type === "current" ? 95 : 100, confidence);
}

function statusForEvidence(
  evidence: readonly Readonly<CampaignFactEvidence>[],
  confidence: number,
): NavigationFactStatus {
  const disproved = evidence
    .filter((item) => item.status === "disproved")
    .reduce((maximum, item) => Math.max(maximum, item.confidence), -1);
  const supported = evidence
    .filter((item) => item.status !== "disproved")
    .reduce((maximum, item) => Math.max(maximum, item.confidence), -1);
  if (disproved >= supported && disproved >= 0) return "disproved";
  if (confidence >= 70) return "confirmed";
  if (confidence >= 40) return "observed";
  return "rumoured";
}

function aggregateFact(
  id: string,
  type: CampaignFactType,
  locationOrRegion: string,
  inputEvidence: readonly Readonly<CampaignFactEvidence>[],
): CampaignFact {
  const byId = new Map<string, CampaignFactEvidence>();
  for (const input of inputEvidence) {
    const item = canonicalCopy(input);
    const prior = byId.get(item.evidenceId);
    byId.set(item.evidenceId, prior === undefined ? item : mergeDuplicateEvidence(prior, item));
  }
  const evidence = [...byId.values()].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  if (evidence.length === 0) throw new SimulationValidationError(`campaign fact ${id} requires evidence`);
  const groups = new Map<string, CampaignFactEvidence[]>();
  for (const item of evidence) {
    const key = claimKey(item.claimedValue);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const candidates = [...groups.entries()].map(([key, items]) => ({
    key,
    items,
    confidence: confidenceForEvidence(items, type),
    maximumEvidence: Math.max(...items.map((item) => item.confidence)),
  })).sort((left, right) =>
    right.confidence - left.confidence
    || right.maximumEvidence - left.maximumEvidence
    || left.key.localeCompare(right.key));
  const winner = candidates[0];
  if (winner === undefined) throw new SimulationValidationError(`campaign fact ${id} has no claim`);
  const strongest = [...winner.items].sort((left, right) =>
    right.confidence - left.confidence
    || right.observedDate.localeCompare(left.observedDate)
    || left.evidenceId.localeCompare(right.evidenceId))[0]!;
  const reportedDates = winner.items
    .map((item) => item.reportedDate)
    .filter((item): item is string => item !== null)
    .sort();
  return {
    id,
    type,
    locationOrRegion,
    claimedValue: canonicalCopy<CampaignClaimedValue>(strongest.claimedValue),
    source: strongest.source,
    confidence: winner.confidence,
    observedDate: [...winner.items].map((item) => item.observedDate).sort()[0]!,
    reportedDate: reportedDates.at(-1) ?? null,
    status: statusForEvidence(winner.items, winner.confidence),
    evidence,
  };
}

function assertEvidence(value: unknown, label: string): asserts value is CampaignFactEvidence {
  const item = record(value, label);
  exactKeys(item, [
    "evidenceId", "runNumber", "claimedValue", "source", "confidence",
    "observedDate", "reportedDate", "status",
  ], label);
  stringValue(item["evidenceId"], `${label}.evidenceId`, 256);
  integer(item["runNumber"], `${label}.runNumber`, 0, 1_000_000);
  claim(item["claimedValue"], `${label}.claimedValue`);
  stringValue(item["source"], `${label}.source`, 512);
  integer(item["confidence"], `${label}.confidence`, 0, 100);
  isoDate(item["observedDate"], `${label}.observedDate`);
  if (item["reportedDate"] !== null) isoDate(item["reportedDate"], `${label}.reportedDate`);
  if (!["rumoured", "observed", "confirmed", "disproved"].includes(item["status"] as string)) {
    throw new SimulationValidationError(`${label}.status is invalid`);
  }
}

export function assertCampaignFact(value: unknown, label = "campaign fact"): asserts value is CampaignFact {
  const item = record(value, label);
  exactKeys(item, [
    "id", "type", "locationOrRegion", "claimedValue", "source", "confidence",
    "observedDate", "reportedDate", "status", "evidence",
  ], label);
  const id = stringValue(item["id"], `${label}.id`, 256);
  if (!CAMPAIGN_FACT_TYPES.includes(item["type"] as CampaignFactType)) {
    throw new SimulationValidationError(`${label}.type is invalid`);
  }
  const type = item["type"] as CampaignFactType;
  const locationOrRegion = stringValue(item["locationOrRegion"], `${label}.locationOrRegion`, 256);
  claim(item["claimedValue"], `${label}.claimedValue`);
  stringValue(item["source"], `${label}.source`, 512);
  integer(item["confidence"], `${label}.confidence`, 0, 100);
  isoDate(item["observedDate"], `${label}.observedDate`);
  if (item["reportedDate"] !== null) isoDate(item["reportedDate"], `${label}.reportedDate`);
  if (!["rumoured", "observed", "confirmed", "disproved"].includes(item["status"] as string)) {
    throw new SimulationValidationError(`${label}.status is invalid`);
  }
  if (!Array.isArray(item["evidence"]) || item["evidence"].length === 0) {
    throw new SimulationValidationError(`${label}.evidence must be a non-empty array`);
  }
  for (let index = 0; index < item["evidence"].length; index += 1) {
    assertEvidence(item["evidence"][index], `${label}.evidence[${index}]`);
  }
  const rebuilt = aggregateFact(id, type, locationOrRegion, item["evidence"] as CampaignFactEvidence[]);
  if (canonicalize(rebuilt) !== canonicalize(value)) {
    throw new SimulationValidationError(`${label} does not match its canonical evidence aggregate`);
  }
}

export function mergeCampaignFacts(
  facts: readonly Readonly<CampaignFact>[],
): readonly CampaignFact[] {
  const grouped = new Map<string, { type: CampaignFactType; location: string; evidence: CampaignFactEvidence[] }>();
  for (const fact of facts) {
    assertCampaignFact(fact);
    const prior = grouped.get(fact.id);
    if (prior !== undefined && (prior.type !== fact.type || prior.location !== fact.locationOrRegion)) {
      throw new SimulationValidationError(`equal-ID campaign fact ${fact.id} conflicts in type or location`);
    }
    grouped.set(fact.id, {
      type: fact.type,
      location: fact.locationOrRegion,
      evidence: [...(prior?.evidence ?? []), ...fact.evidence.map((item) => canonicalCopy(item))],
    });
  }
  return deepFreeze([...grouped.entries()]
    .map(([id, group]) => aggregateFact(id, group.type, group.location, group.evidence))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

function oneEvidenceFact(
  id: string,
  type: CampaignFactType,
  locationOrRegion: string,
  evidence: CampaignFactEvidence,
): CampaignFact {
  return aggregateFact(id, type, locationOrRegion, [evidence]);
}

export function createStartingCampaignFacts(): readonly CampaignFact[] {
  const source = "standard campaign chart";
  const common = (evidenceId: string, claimedValue: CampaignClaimedValue, confidence: number, status: NavigationFactStatus): CampaignFactEvidence => ({
    evidenceId,
    runNumber: 0,
    claimedValue,
    source,
    confidence,
    observedDate: DEFAULT_CAMPAIGN_DATE,
    reportedDate: DEFAULT_CAMPAIGN_DATE,
    status,
  });
  const lisbon = LANDMARKS.find((item) => item.id === LANDMARK_IDS.lisbon)!;
  const capeVerde = LANDMARKS.find((item) => item.id === LANDMARK_IDS.capeVerde)!;
  const cape = LANDMARKS.find((item) => item.id === LANDMARK_IDS.capeGoal)!;
  return mergeCampaignFacts([
    oneEvidenceFact(lisbon.id, "landmark", "Lisbon", common(
      "standard.landmark.lisbon",
      { kind: "position", position: { ...lisbon.centre } },
      100,
      "confirmed",
    )),
    oneEvidenceFact(capeVerde.id, "landmark", "Cape Verde / Santiago", common(
      "standard.landmark.cape-verde-santiago",
      { kind: "position", position: { ...capeVerde.centre } },
      90,
      "confirmed",
    )),
    oneEvidenceFact("port.cape-verde", "port", "Cape Verde / Santiago", common(
      "standard.port.cape-verde",
      { kind: "position", position: { ...capeVerde.centre } },
      90,
      "confirmed",
    )),
    oneEvidenceFact(cape.id, "landmark", "broad Cape goal region", common(
      "standard.landmark.cape-goal-region",
      { kind: "position", position: { ...cape.centre } },
      25,
      "rumoured",
    )),
  ]);
}

function campaignFactToNavigation(fact: Readonly<CampaignFact>): NavigationFact | null {
  if (fact.type === "landmark" && fact.claimedValue.kind === "position") {
    return {
      id: fact.id,
      type: "landmark",
      status: fact.status,
      confidence: fact.confidence,
      claimedPosition: { ...fact.claimedValue.position },
    };
  }
  if (fact.type === "current" && fact.claimedValue.kind === "current_vector") {
    return {
      id: fact.id,
      type: "current",
      status: fact.status,
      confidence: fact.confidence,
      claimedVectorMnmPerDay: { ...fact.claimedValue.vectorMnmPerDay },
    };
  }
  return null;
}

export function campaignFactsToNavigationFacts(
  facts: readonly Readonly<CampaignFact>[],
): readonly NavigationFact[] {
  const converted = facts.map(campaignFactToNavigation).filter((item): item is NavigationFact => item !== null);
  const byId = new Map(converted.map((item) => [item.id, item]));
  for (const standard of createStartingNavigationKnowledge()) {
    if (!byId.has(standard.id)) byId.set(standard.id, canonicalCopy<NavigationFact>(standard));
  }
  return deepFreeze([...byId.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function locationForJourneyFact(fact: Readonly<JourneyFact>): string {
  if (fact.id.includes("cape") || fact.type === "water_source") return "Cape goal region";
  if (fact.type === "current") return "South Atlantic current region";
  if (fact.id.includes("cape-verde")) return "Cape Verde / Santiago";
  return "Atlantic expedition route";
}

function campaignTypeForJourneyFact(fact: Readonly<JourneyFact>): CampaignFactType {
  return fact.type;
}

/**
 * The campaign fact a journey finding lands on. Two authored journey facts are restatements
 * of standing campaign claims rather than new ones, so they merge into the existing record
 * instead of sitting beside it under a second ID.
 */
function campaignFactIdForJourneyFactId(journeyFactId: string): string {
  if (journeyFactId === "fact.south-atlantic-current-hypothesis") return SOUTH_ATLANTIC_CURRENT_ID;
  if (journeyFactId === "fact.cape-landmark-survey") return LANDMARK_IDS.capeGoal;
  return journeyFactId;
}

function mappedJourneyClaim(fact: Readonly<JourneyFact>): {
  readonly id: string;
  readonly claimedValue: CampaignClaimedValue;
  readonly location: string;
} {
  const id = campaignFactIdForJourneyFactId(fact.id);
  if (id === SOUTH_ATLANTIC_CURRENT_ID) {
    return {
      id,
      claimedValue: { kind: "current_vector", vectorMnmPerDay: { ...SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay } },
      location: "South Atlantic current region",
    };
  }
  if (id === LANDMARK_IDS.capeGoal) {
    const cape = LANDMARKS.find((item) => item.id === LANDMARK_IDS.capeGoal)!;
    return {
      id,
      claimedValue: { kind: "position", position: { ...cape.centre } },
      location: "broad Cape goal region",
    };
  }
  return {
    id,
    claimedValue: { kind: "statement", text: fact.claim },
    location: locationForJourneyFact(fact),
  };
}

export function journeyFactToCampaignFact(
  fact: Readonly<JourneyFact>,
  runNumber: number,
): CampaignFact {
  const mapped = mappedJourneyClaim(fact);
  return oneEvidenceFact(mapped.id, campaignTypeForJourneyFact(fact), mapped.location, {
    evidenceId: `run.${String(runNumber).padStart(6, "0")}.journey.${fact.id}.${fact.observedDate}`,
    runNumber,
    claimedValue: mapped.claimedValue,
    source: fact.source,
    confidence: fact.confidence,
    observedDate: fact.observedDate,
    reportedDate: null,
    status: fact.status,
  });
}

function metrics(journey: Readonly<JourneySimulationState>): ExpeditionMetrics {
  return {
    crew: { ...journey.crew },
    ship: { ...journey.ship },
    stores: { ...journey.stores },
  };
}

function recognisedLandmarkForLatestDay(journey: Readonly<JourneySimulationState>): string | null {
  const latest = journey.canonicalLog.at(-1);
  if (
    latest?.type === "journey_day"
    && latest.committedDay === journey.committedDay
    && latest.landfall.kind === "recognised"
  ) return latest.landfall.landmarkId;
  return null;
}

function tracePoint(
  journey: Readonly<JourneySimulationState>,
  currentContributionMnm: Readonly<PositionMnm> = { xMnm: 0, yMnm: 0 },
): HiddenAfterActionTracePoint {
  return {
    day: journey.committedDay,
    date: journey.date,
    estimatedPosition: { ...journey.estimatedPosition },
    truePosition: { ...journey.truePosition },
    uncertainty: { ...journey.uncertainty },
    observedWeather: journey.navigation.observedWeather,
    currentContributionMnm: { ...currentContributionMnm },
    recognisedLandmarkId: recognisedLandmarkForLatestDay(journey),
  };
}

function createActiveExpedition(
  runNumber: number,
  runSeed: string,
  inheritedFacts: readonly Readonly<CampaignFact>[],
  journey: JourneySimulationState,
): ActiveExpedition {
  return {
    runNumber,
    runSeed,
    inheritedFacts: canonicalCopy(inheritedFacts),
    journey,
    reportSnapshot: null,
    hiddenTrace: [tracePoint(journey)],
    startingMetrics: metrics(journey),
    departureMetrics: journey.survival.lifecycle === "underway" ? metrics(journey) : null,
    departureDate: journey.date,
  };
}

export function createCampaign(config: Readonly<CampaignInitialConfig>): CampaignState {
  stringValue(config.contentVersion, "campaign contentVersion", 128);
  const chance = config.expeditionDailyEventChancePermille ?? DEFAULT_EVENT_CHANCE_PERMILLE;
  integer(chance, "campaign expeditionDailyEventChancePermille", 0, 1_000);
  return deepFreeze({
    format: CAMPAIGN_STATE_FORMAT,
    contentVersion: config.contentVersion,
    expeditionDailyEventChancePermille: chance,
    facts: createStartingCampaignFacts(),
    completedRuns: [],
    afterActionReports: [],
    activeExpedition: null,
    commandLog: [],
    replayCommands: [],
  });
}

/** Deterministic focused fixture wrapper; production campaigns start expeditions by command. */
export function createCampaignFixtureState(config: Readonly<CampaignFixtureConfig>): CampaignState {
  const base = createCampaign(config);
  const facts = mergeCampaignFacts([...base.facts, ...(config.facts ?? [])]);
  const knowledge = campaignFactsToNavigationFacts(facts);
  const journey = createJourneyFixtureState({
    contentVersion: config.contentVersion,
    runSeed: config.runSeed,
    dailyEventChancePermille: config.journey?.dailyEventChancePermille
      ?? base.expeditionDailyEventChancePermille,
    ...config.journey,
    knowledge,
  });
  const state: CampaignState = {
    ...base,
    facts,
    activeExpedition: createActiveExpedition(1, config.runSeed, facts, journey),
  };
  assertCampaignState(state);
  return deepFreeze(state);
}

function copyCampaignCommand(command: Readonly<CampaignCommand>): CampaignCommand {
  return command.type === "start_expedition"
    ? { type: "start_expedition", runSeed: command.runSeed }
    : command.type === "forward_simulation_command"
      ? { type: "forward_simulation_command", command: canonicalCopy<SimulationCommand>(command.command) }
      : { type: command.type };
}

export function assertCampaignCommand(value: unknown): asserts value is CampaignCommand {
  const item = record(value, "campaign command");
  if (item["type"] === "start_expedition") {
    exactKeys(item, ["type", "runSeed"], "campaign command");
    stringValue(item["runSeed"], "campaign command runSeed", 256);
    return;
  }
  if (item["type"] === "forward_simulation_command") {
    exactKeys(item, ["type", "command"], "campaign command");
    assertSimulationCommand(item["command"]);
    return;
  }
  if (item["type"] === "deposit_report_at_cape_verde" || item["type"] === "finalize_expedition") {
    exactKeys(item, ["type"], "campaign command");
    return;
  }
  throw new SimulationValidationError("campaign command type is invalid");
}

function markReported(facts: readonly Readonly<CampaignFact>[], reportedDate: string): readonly CampaignFact[] {
  return mergeCampaignFacts(facts.map((fact) => aggregateFact(
    fact.id,
    fact.type,
    fact.locationOrRegion,
    fact.evidence.map((item) => ({ ...canonicalCopy(item), reportedDate: item.reportedDate ?? reportedDate })),
  )));
}

function navigationObservationFacts(active: Readonly<ActiveExpedition>): readonly CampaignFact[] {
  const inheritedNavigation = new Map(campaignFactsToNavigationFacts(active.inheritedFacts).map((item) => [item.id, item]));
  const observed: CampaignFact[] = [];
  for (const fact of active.journey.navigation.knowledge) {
    const prior = inheritedNavigation.get(fact.id);
    if (prior !== undefined && canonicalize(prior) === canonicalize(fact)) continue;
    const claimedValue: CampaignClaimedValue = fact.type === "landmark"
      ? { kind: "position", position: { ...fact.claimedPosition } }
      : { kind: "current_vector", vectorMnmPerDay: { ...fact.claimedVectorMnmPerDay } };
    const location = fact.id === LANDMARK_IDS.lisbon
      ? "Lisbon"
      : fact.id === LANDMARK_IDS.capeVerde
        ? "Cape Verde / Santiago"
        : fact.id === LANDMARK_IDS.capeGoal
          ? "broad Cape goal region"
          : "South Atlantic current region";
    observed.push(oneEvidenceFact(fact.id, fact.type, location, {
      evidenceId: `run.${String(active.runNumber).padStart(6, "0")}.navigation.${fact.id}.${active.journey.date}`,
      runNumber: active.runNumber,
      claimedValue,
      source: fact.type === "landmark" ? "recognised landmark fix" : "navigation evidence",
      confidence: fact.confidence,
      observedDate: active.journey.date,
      reportedDate: null,
      status: fact.status,
    }));
  }
  return observed;
}

function currentDiscrepancyFacts(active: Readonly<ActiveExpedition>): readonly CampaignFact[] {
  const result: CampaignFact[] = [];
  let segment: HiddenAfterActionTracePoint[] = [];
  let sequence = 0;
  for (const point of active.hiddenTrace) {
    if (point.day > 0) segment.push(point);
    if (point.recognisedLandmarkId === null) continue;
    const currentDays = segment.filter((item) =>
      item.currentContributionMnm.xMnm !== 0 || item.currentContributionMnm.yMnm !== 0);
    const eastWestDiscrepancy = currentDays.reduce(
      (sum, item) => sum + item.currentContributionMnm.xMnm,
      0,
    );
    if (segment.length >= 5 && Math.abs(eastWestDiscrepancy) >= 50_000) {
      result.push(oneEvidenceFact(
        SOUTH_ATLANTIC_CURRENT_ID,
        "current",
        "South Atlantic current region",
        {
          evidenceId: `run.${String(active.runNumber).padStart(6, "0")}.current-discrepancy.${String(sequence).padStart(4, "0")}.${point.day}`,
          runNumber: active.runNumber,
          claimedValue: {
            kind: "current_vector",
            vectorMnmPerDay: { ...SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay },
          },
          source: "recognised-landfall dead-reckoning discrepancy",
          confidence: 40,
          observedDate: point.date,
          reportedDate: null,
          status: "observed",
        },
      ));
      sequence += 1;
    }
    segment = [];
  }
  return result;
}

/**
 * What the crew has actually written down: journey facts and the navigation knowledge this
 * expedition changed. The hidden-trace current derivation is deliberately absent, so this
 * set is safe to count in front of the player while the voyage is still running.
 */
function loggedFacts(active: Readonly<ActiveExpedition>): readonly CampaignFact[] {
  return mergeCampaignFacts([
    ...active.journey.journey.facts.map((fact) => journeyFactToCampaignFact(fact, active.runNumber)),
    ...navigationObservationFacts(active),
  ]);
}

function observedFacts(active: Readonly<ActiveExpedition>): readonly CampaignFact[] {
  return mergeCampaignFacts([...loggedFacts(active), ...currentDiscrepancyFacts(active)]);
}

function carriedFacts(active: Readonly<ActiveExpedition>): readonly CampaignFact[] {
  return mergeCampaignFacts([...active.inheritedFacts, ...observedFacts(active)]);
}

function snapshotPayload(snapshot: Omit<CampaignReportSnapshot, "snapshotHash">): unknown {
  return {
    committedDay: snapshot.committedDay,
    date: snapshot.date,
    objectiveAchieved: snapshot.objectiveAchieved,
    facts: snapshot.facts,
  };
}

function makeSnapshot(active: Readonly<ActiveExpedition>): CampaignReportSnapshot {
  const facts = markReported(carriedFacts(active), active.journey.date);
  const payload = {
    committedDay: active.journey.committedDay,
    date: active.journey.date,
    objectiveAchieved: active.journey.journey.objectiveAchieved,
    facts,
  };
  return { ...payload, snapshotHash: hashCanonical(snapshotPayload(payload)) };
}

function appendCampaignLog(
  prior: Readonly<CampaignState>,
  next: Omit<CampaignState, "commandLog" | "replayCommands">,
  command: Readonly<CampaignCommand>,
  result: CampaignCommandResult,
): CampaignState {
  const entry: CampaignLogEntry = {
    index: prior.commandLog.length,
    type: "campaign_command",
    runNumber: result.kind === "expedition_started" ? result.runNumber
      : result.kind === "simulation_command_forwarded" ? result.runNumber
        : result.kind === "cape_verde_report_deposited" ? result.runNumber
          : result.runNumber,
    command: copyCampaignCommand(command),
    result: canonicalCopy<CampaignCommandResult>(result),
  };
  const state: CampaignState = {
    ...next,
    commandLog: [...prior.commandLog.map((item) => canonicalCopy(item)), entry],
    replayCommands: [...prior.replayCommands.map(copyCampaignCommand), copyCampaignCommand(command)],
  };
  assertCampaignState(state);
  return deepFreeze(state);
}

function startExpedition(
  state: Readonly<CampaignState>,
  command: Readonly<Extract<CampaignCommand, { type: "start_expedition" }>>,
): CampaignState {
  if (state.activeExpedition !== null) {
    throw new SimulationValidationError("an expedition is already active");
  }
  const runNumber = state.completedRuns.length + 1;
  const inheritedFacts = mergeCampaignFacts([...createStartingCampaignFacts(), ...state.facts]);
  const journey = createJourneyState({
    contentVersion: state.contentVersion,
    runSeed: command.runSeed,
    dailyEventChancePermille: state.expeditionDailyEventChancePermille,
    knowledge: campaignFactsToNavigationFacts(inheritedFacts),
  });
  const activeExpedition = createActiveExpedition(runNumber, command.runSeed, inheritedFacts, journey);
  return appendCampaignLog(state, { ...state, activeExpedition }, command, {
    kind: "expedition_started",
    runNumber,
    runSeed: command.runSeed,
  });
}

function forwardSimulationCommand(
  state: Readonly<CampaignState>,
  command: Readonly<Extract<CampaignCommand, { type: "forward_simulation_command" }>>,
  options: Readonly<CampaignExecutionOptions>,
): CampaignState {
  const active = state.activeExpedition;
  if (active === null) throw new SimulationValidationError("no expedition is active");
  const capture: { value: DailyEnvironment | null } = { value: null };
  const provider = options.environmentProvider ?? authoredAtlanticEnvironment;
  const capturingProvider: EnvironmentProvider = (context) => {
    const resolved = provider(context);
    capture.value = canonicalCopy<DailyEnvironment>(resolved);
    return resolved;
  };
  const beforeDay = active.journey.committedDay;
  const journey = applyCommand(active.journey, command.command, capturingProvider);
  let hiddenTrace = active.hiddenTrace.map((item) => canonicalCopy(item));
  if (journey.committedDay > beforeDay) {
    const current = capture.value === null
      ? { xMnm: 0, yMnm: 0 }
      : capture.value.trueCurrentMnm;
    hiddenTrace = [...hiddenTrace, tracePoint(journey, current)];
  } else if (
    command.command.type === "recognise_cape_landfall"
    && hiddenTrace.length > 0
  ) {
    const last = hiddenTrace.at(-1)!;
    hiddenTrace = [
      ...hiddenTrace.slice(0, -1),
      { ...last, recognisedLandmarkId: LANDMARK_IDS.capeGoal },
    ];
  }
  const departure = command.command.type === "depart_lisbon"
    ? metrics(journey)
    : active.departureMetrics;
  const activeExpedition: ActiveExpedition = {
    ...active,
    journey,
    hiddenTrace,
    departureMetrics: departure === null ? null : canonicalCopy(departure),
    departureDate: command.command.type === "depart_lisbon" ? journey.date : active.departureDate,
  };
  return appendCampaignLog(state, { ...state, activeExpedition }, command, {
    kind: "simulation_command_forwarded",
    runNumber: active.runNumber,
    journeyLogIndex: journey.canonicalLog.length - 1,
    committedDay: journey.committedDay,
  });
}

function depositReport(
  state: Readonly<CampaignState>,
  command: Readonly<Extract<CampaignCommand, { type: "deposit_report_at_cape_verde" }>>,
): CampaignState {
  const active = state.activeExpedition;
  if (active === null) throw new SimulationValidationError("no expedition is active");
  const journey = active.journey;
  if (journey.journey.location !== "cape_verde" || journey.survival.location !== "cape_verde") {
    throw new SimulationValidationError("a report may be deposited only at Cape Verde");
  }
  if (journey.journey.pendingEvent !== null) {
    throw new SimulationValidationError("a pending event choice blocks report deposit");
  }
  if (journey.journey.outcome !== null || journey.survival.status.kind === "terminal") {
    throw new SimulationValidationError("a terminal expedition cannot deposit a report");
  }
  const reportSnapshot = makeSnapshot(active);
  const activeExpedition: ActiveExpedition = { ...active, reportSnapshot };
  return appendCampaignLog(state, { ...state, activeExpedition }, command, {
    kind: "cape_verde_report_deposited",
    runNumber: active.runNumber,
    committedDay: reportSnapshot.committedDay,
    factCount: reportSnapshot.facts.length,
    snapshotHash: reportSnapshot.snapshotHash,
  });
}

function campaignOutcome(active: Readonly<ActiveExpedition>): { outcome: CampaignOutcomeId; reason: string } {
  const journeyOutcome = active.journey.journey.outcome;
  if (journeyOutcome === null) throw new SimulationValidationError("the active expedition has not reached a terminal outcome");
  if (journeyOutcome.id === "full_success") return { outcome: "full_success", reason: journeyOutcome.reason };
  if (journeyOutcome.id === "partial_return") return { outcome: "partial_return", reason: journeyOutcome.reason };
  // Any terminal loss, not hull failure alone: thirst, starvation and scurvy all end an
  // expedition through crew health, and a report ashore proves as much for a crew that died
  // of thirst as for one that went down with the hull.
  const expeditionLost = active.journey.survival.status.kind === "terminal";
  if (
    expeditionLost
    && active.journey.journey.objectiveAchieved
    && active.reportSnapshot?.objectiveAchieved === true
  ) {
    return {
      outcome: "report_success",
      reason: "The Cape was recognised, the later Cape Verde snapshot proved it, and the expedition was subsequently lost.",
    };
  }
  return { outcome: "objective_failure", reason: journeyOutcome.reason };
}

function evidenceIds(facts: readonly Readonly<CampaignFact>[]): ReadonlySet<string> {
  return new Set(facts.flatMap((fact) => fact.evidence.map((item) => item.evidenceId)));
}

function factsWithEvidenceOutside(
  facts: readonly Readonly<CampaignFact>[],
  ids: ReadonlySet<string>,
): readonly CampaignFact[] {
  return facts.flatMap((fact) => {
    const lostEvidence = fact.evidence.filter((item) => !ids.has(item.evidenceId));
    return lostEvidence.length === 0
      ? []
      : [aggregateFact(fact.id, fact.type, fact.locationOrRegion, lostEvidence)];
  });
}

/**
 * The campaign facts a completed landmark survey produced on this expedition. Provenance is
 * read off the authored survey activity in the journey log rather than off a source string,
 * so a finding qualifies for the survey salvage tier only where the crew reached a landmark,
 * recognised it, and actually spent both days on it. An abandoned survey qualifies nothing.
 */
function surveyedLandmarkFactIds(active: Readonly<ActiveExpedition>): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const entry of active.journey.canonicalLog) {
    if (entry.type !== "journey_day" || entry.activity.kind !== "cape_survey") continue;
    if (!entry.activity.completed) continue;
    for (const factId of entry.activity.factsLearned) ids.add(campaignFactIdForJourneyFactId(factId));
  }
  return ids;
}

/**
 * What word of a lost expedition reaches Lisbon. Evidence no deposited copy holds is not
 * struck off with the ship: it is entered at its own confidence or the salvage cap,
 * whichever is lower, so a Cape seen once and lost leaves the next voyage somewhere to
 * steer for instead of nothing. Findings a completed landmark survey produced carry the
 * higher survey cap, because two days spent on a landmark the crew positively identified
 * is a better class of claim than weed and birds; everything else carries the ordinary cap.
 * Both sit below the 70 that automatic navigation correction needs, so salvaged evidence
 * still never on its own confirms a fact or completes the run objective.
 * A claim the expedition disproved stays disproved rather than softening into a rumour.
 * Word reaches Lisbon once per finding, not once per sighting, so repeated sightings inside
 * one lost run cannot corroborate each other past the cap.
 */
function salvagedFacts(
  facts: readonly Readonly<CampaignFact>[],
  runNumber: number,
  reportedDate: string,
  surveyedFactIds: ReadonlySet<string>,
): readonly CampaignFact[] {
  return mergeCampaignFacts(facts.map((fact) => {
    const cap = surveyedFactIds.has(fact.id)
      ? SURVEYED_LANDMARK_SALVAGE_CONFIDENCE_CAP
      : SALVAGED_LOG_CONFIDENCE_CAP;
    const confidence = Math.min(fact.confidence, cap);
    return oneEvidenceFact(fact.id, fact.type, fact.locationOrRegion, {
      evidenceId: `run.${String(runNumber).padStart(6, "0")}.salvaged.${fact.id}`,
      runNumber,
      claimedValue: canonicalCopy<CampaignClaimedValue>(fact.claimedValue),
      source: `${fact.source}, salvaged from a lost expedition`,
      confidence,
      observedDate: fact.observedDate,
      reportedDate,
      status: fact.status === "disproved"
        ? "disproved"
        : confidence >= OBSERVED_CONFIDENCE_FLOOR ? "observed" : "rumoured",
    });
  }));
}

function factChanges(
  before: readonly Readonly<CampaignFact>[],
  after: readonly Readonly<CampaignFact>[],
): readonly CampaignFactChange[] {
  const prior = new Map(before.map((fact) => [fact.id, fact]));
  return after.filter((fact) => {
    const old = prior.get(fact.id);
    return old === undefined || canonicalize(old) !== canonicalize(fact);
  }).map((fact) => ({
    id: fact.id,
    before: prior.has(fact.id) ? canonicalCopy(prior.get(fact.id)!) : null,
    after: canonicalCopy(fact),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function consumption(journey: Readonly<JourneySimulationState>): { waterKg: number; provisionsKg: number } {
  return journey.canonicalLog.reduce((total, item) => item.type === "journey_day"
    ? {
        waterKg: total.waterKg + item.waterConsumedKg,
        provisionsKg: total.provisionsKg + item.provisionsConsumedKg,
      }
    : total, { waterKg: 0, provisionsKg: 0 });
}

function reportSupportingCurrent(facts: readonly Readonly<CampaignFact>[]): CampaignFact | undefined {
  return facts.find((fact) => fact.id === SOUTH_ATLANTIC_CURRENT_ID
    && fact.type === "current"
    && fact.status !== "disproved"
    && fact.confidence >= OBSERVED_CONFIDENCE_FLOOR
    && fact.claimedValue.kind === "current_vector");
}

function buildAfterActionReport(
  active: Readonly<ActiveExpedition>,
  outcome: CampaignOutcomeId,
  reason: string,
  observed: readonly Readonly<CampaignFact>[],
  reported: readonly Readonly<CampaignFact>[],
  lost: readonly Readonly<CampaignFact>[],
  salvaged: readonly Readonly<CampaignFact>[],
  changes: readonly Readonly<CampaignFactChange>[],
  campaignFactsAfter: readonly Readonly<CampaignFact>[],
): AfterActionReport {
  const journeyOutcome = active.journey.journey.outcome!;
  const consumed = consumption(active.journey);
  const supportingCurrent = reportSupportingCurrent(campaignFactsAfter);
  return {
    format: AFTER_ACTION_REPORT_FORMAT,
    runNumber: active.runNumber,
    runSeed: active.runSeed,
    outcome,
    reason,
    departureDate: active.departureDate,
    finalDate: active.journey.date,
    elapsedCommittedDays: active.journey.committedDay,
    objectiveStatus: journeyOutcome.objectiveStatus,
    startingMetrics: canonicalCopy(active.departureMetrics ?? active.startingMetrics),
    finalMetrics: metrics(active.journey),
    waterConsumedKg: consumed.waterKg,
    provisionsConsumedKg: consumed.provisionsKg,
    factsObserved: canonicalCopy(observed),
    factsReported: canonicalCopy(reported),
    factsDisproved: canonicalCopy(observed.filter((fact) => fact.status === "disproved")),
    factsLostWithShip: canonicalCopy(lost),
    factsSalvagedFromLog: canonicalCopy(salvaged),
    reportSnapshotDay: active.reportSnapshot?.committedDay ?? null,
    reportSnapshotHash: active.reportSnapshot?.snapshotHash ?? null,
    campaignFactsChanged: canonicalCopy(changes),
    nextExpeditionDifferences: canonicalCopy(changes),
    estimatedTrack: active.hiddenTrace.map((point) => ({
      day: point.day,
      date: point.date,
      position: { ...point.estimatedPosition },
    })),
    trueTrack: active.hiddenTrace.map((point) => ({
      day: point.day,
      date: point.date,
      position: { ...point.truePosition },
    })),
    uncertaintyHistory: active.hiddenTrace.map((point) => ({
      day: point.day,
      date: point.date,
      uncertainty: { ...point.uncertainty },
      errorMnm: {
        xMnm: point.truePosition.xMnm - point.estimatedPosition.xMnm,
        yMnm: point.truePosition.yMnm - point.estimatedPosition.yMnm,
      },
    })),
    observationHistory: active.journey.canonicalLog.flatMap((entry) =>
      entry.type === "journey_day" && entry.activity.kind === "east_west_observation"
        ? [{
            day: entry.committedDay,
            date: entry.date,
            result: entry.activity.result.kind === "none"
              ? "open_ocean" as const
              : entry.activity.result.kind,
            eastWestUncertaintyBeforeMnm: entry.activity.eastWestUncertaintyBeforeMnm,
            eastWestUncertaintyAfterMnm: entry.activity.eastWestUncertaintyAfterMnm,
            estimateCorrectionMnm: entry.activity.estimateCorrectionMnm,
          }]
        : []),
    currentContributionHistory: active.hiddenTrace
      .filter((point) => point.currentContributionMnm.xMnm !== 0 || point.currentContributionMnm.yMnm !== 0)
      .map((point) => supportingCurrent?.claimedValue.kind === "current_vector"
        ? {
            day: point.day,
            date: point.date,
            explanation: "supported_by_reported_evidence" as const,
            supportingFactId: supportingCurrent.id,
            vectorMnmPerDay: { ...point.currentContributionMnm },
          }
        : {
            day: point.day,
            date: point.date,
            explanation: "unexplained_route_divergence" as const,
          }),
  };
}

function finalizeExpedition(
  state: Readonly<CampaignState>,
  command: Readonly<Extract<CampaignCommand, { type: "finalize_expedition" }>>,
): CampaignState {
  const active = state.activeExpedition;
  if (active === null) throw new SimulationValidationError("no expedition is active");
  if (active.journey.journey.outcome === null) {
    throw new SimulationValidationError("an expedition may be finalized only after its v4 outcome resolves");
  }
  const resolved = campaignOutcome(active);
  const returnedSafely = active.journey.journey.location === "lisbon"
    && (resolved.outcome === "full_success" || resolved.outcome === "partial_return");
  const observed = observedFacts(active);
  const reported = returnedSafely
    ? markReported(carriedFacts(active), active.journey.date)
    : active.reportSnapshot?.facts ?? [];
  const reportedIds = evidenceIds(reported);
  const lost = factsWithEvidenceOutside(observed, reportedIds);
  const salvaged = salvagedFacts(
    lost,
    active.runNumber,
    active.journey.date,
    surveyedLandmarkFactIds(active),
  );
  const campaignFactsAfter = mergeCampaignFacts([...state.facts, ...reported, ...salvaged]);
  const changes = factChanges(state.facts, campaignFactsAfter);
  const report = buildAfterActionReport(
    active,
    resolved.outcome,
    resolved.reason,
    observed,
    reported,
    lost,
    salvaged,
    changes,
    campaignFactsAfter,
  );
  const summary: CampaignRunSummary = {
    runNumber: active.runNumber,
    runSeed: active.runSeed,
    outcome: resolved.outcome,
    reason: resolved.reason,
    departureDate: active.departureDate,
    finalDate: active.journey.date,
    elapsedCommittedDays: active.journey.committedDay,
    objectiveAchieved: active.journey.journey.objectiveAchieved,
    reportedFactCount: reported.length,
    lostFactCount: lost.length,
    salvagedFactCount: salvaged.length,
    reportSnapshotDay: active.reportSnapshot?.committedDay ?? null,
    reportSnapshotHash: active.reportSnapshot?.snapshotHash ?? null,
  };
  return appendCampaignLog(state, {
    ...state,
    facts: campaignFactsAfter,
    completedRuns: [...state.completedRuns.map((item) => canonicalCopy(item)), summary],
    afterActionReports: [...state.afterActionReports.map((item) => canonicalCopy(item)), report],
    activeExpedition: null,
  }, command, {
    kind: "expedition_finalized",
    runNumber: active.runNumber,
    outcome: resolved.outcome,
    afterActionReportHash: hashCanonical(report),
  });
}

export function executeCampaignCommand(
  state: Readonly<CampaignState>,
  command: Readonly<CampaignCommand>,
  options: Readonly<CampaignExecutionOptions> = {},
): CampaignState {
  assertCampaignState(state);
  assertCampaignCommand(command);
  if (command.type === "start_expedition") return startExpedition(state, command);
  if (command.type === "forward_simulation_command") {
    return forwardSimulationCommand(state, command, options);
  }
  if (command.type === "deposit_report_at_cape_verde") return depositReport(state, command);
  return finalizeExpedition(state, command);
}

function assertSortedFacts(value: unknown, label: string): asserts value is readonly CampaignFact[] {
  if (!Array.isArray(value)) throw new SimulationValidationError(`${label} must be an array`);
  let previous = "";
  for (let index = 0; index < value.length; index += 1) {
    assertCampaignFact(value[index], `${label}[${index}]`);
    if (index > 0 && value[index]!.id <= previous) {
      throw new SimulationValidationError(`${label} must be uniquely sorted by fact ID`);
    }
    previous = value[index]!.id;
  }
}

function assertSnapshot(value: unknown, label: string): asserts value is CampaignReportSnapshot {
  const item = record(value, label);
  exactKeys(item, ["committedDay", "date", "objectiveAchieved", "facts", "snapshotHash"], label);
  integer(item["committedDay"], `${label}.committedDay`);
  isoDate(item["date"], `${label}.date`);
  if (typeof item["objectiveAchieved"] !== "boolean") {
    throw new SimulationValidationError(`${label}.objectiveAchieved must be boolean`);
  }
  assertSortedFacts(item["facts"], `${label}.facts`);
  const hash = stringValue(item["snapshotHash"], `${label}.snapshotHash`, 64);
  if (!HASH_PATTERN.test(hash)) throw new SimulationValidationError(`${label}.snapshotHash is invalid`);
  const payload = {
    committedDay: item["committedDay"],
    date: item["date"],
    objectiveAchieved: item["objectiveAchieved"],
    facts: item["facts"],
  };
  if (hashCanonical(payload) !== hash) throw new SimulationValidationError(`${label}.snapshotHash does not match its payload`);
}

function assertActiveExpedition(value: unknown, label: string): asserts value is ActiveExpedition {
  const item = record(value, label);
  exactKeys(item, [
    "runNumber", "runSeed", "inheritedFacts", "journey", "reportSnapshot", "hiddenTrace",
    "startingMetrics", "departureMetrics", "departureDate",
  ], label);
  integer(item["runNumber"], `${label}.runNumber`, 1, 1_000_000);
  const runSeed = stringValue(item["runSeed"], `${label}.runSeed`, 256);
  assertSortedFacts(item["inheritedFacts"], `${label}.inheritedFacts`);
  assertSimulationState(item["journey"]);
  if ((item["journey"] as JourneySimulationState).format !== "age-of-exploration-state-v4") {
    throw new SimulationValidationError(`${label}.journey must be v4`);
  }
  if ((item["journey"] as JourneySimulationState).runSeed !== runSeed) {
    throw new SimulationValidationError(`${label}.runSeed must match the journey seed`);
  }
  if (item["reportSnapshot"] !== null) assertSnapshot(item["reportSnapshot"], `${label}.reportSnapshot`);
  if (!Array.isArray(item["hiddenTrace"]) || item["hiddenTrace"].length === 0) {
    throw new SimulationValidationError(`${label}.hiddenTrace must be a non-empty array`);
  }
  for (const [index, pointValue] of item["hiddenTrace"].entries()) {
    const point = record(pointValue, `${label}.hiddenTrace[${index}]`);
    exactKeys(point, [
      "day", "date", "estimatedPosition", "truePosition", "uncertainty", "observedWeather",
      "currentContributionMnm", "recognisedLandmarkId",
    ], `${label}.hiddenTrace[${index}]`);
    integer(point["day"], `${label}.hiddenTrace[${index}].day`);
    isoDate(point["date"], `${label}.hiddenTrace[${index}].date`);
    position(point["estimatedPosition"], `${label}.hiddenTrace[${index}].estimatedPosition`);
    position(point["truePosition"], `${label}.hiddenTrace[${index}].truePosition`);
    const uncertainty = record(point["uncertainty"], `${label}.hiddenTrace[${index}].uncertainty`);
    exactKeys(uncertainty, ["eastWestMnm", "northSouthMnm"], `${label}.hiddenTrace[${index}].uncertainty`);
    integer(uncertainty["eastWestMnm"], `${label}.hiddenTrace[${index}].uncertainty.eastWestMnm`);
    integer(uncertainty["northSouthMnm"], `${label}.hiddenTrace[${index}].uncertainty.northSouthMnm`);
    if (!["fair_clear", "rough_heavy_swell", "overcast", "calm", "storm"].includes(point["observedWeather"] as string)) {
      throw new SimulationValidationError(`${label}.hiddenTrace[${index}].observedWeather is invalid`);
    }
    position(point["currentContributionMnm"], `${label}.hiddenTrace[${index}].currentContributionMnm`);
    if (point["recognisedLandmarkId"] !== null) {
      stringValue(point["recognisedLandmarkId"], `${label}.hiddenTrace[${index}].recognisedLandmarkId`, 256);
    }
  }
  assertMetrics(item["startingMetrics"], `${label}.startingMetrics`);
  if (item["departureMetrics"] !== null) assertMetrics(item["departureMetrics"], `${label}.departureMetrics`);
  isoDate(item["departureDate"], `${label}.departureDate`);
}

function assertMetrics(value: unknown, label: string): void {
  const item = record(value, label);
  exactKeys(item, ["crew", "ship", "stores"], label);
  const crew = record(item["crew"], `${label}.crew`);
  exactKeys(crew, ["count", "able", "healthBps", "moraleBps"], `${label}.crew`);
  const count = integer(crew["count"], `${label}.crew.count`, 0, 1_000_000);
  integer(crew["able"], `${label}.crew.able`, 0, count);
  integer(crew["healthBps"], `${label}.crew.healthBps`, 0, 10_000);
  integer(crew["moraleBps"], `${label}.crew.moraleBps`, 0, 10_000);
  const ship = record(item["ship"], `${label}.ship`);
  exactKeys(ship, ["hullBps", "mastBps", "sailsBps", "rudderBps"], `${label}.ship`);
  for (const key of ["hullBps", "mastBps", "sailsBps", "rudderBps"] as const) {
    integer(ship[key], `${label}.ship.${key}`, 0, 10_000);
  }
  const stores = record(item["stores"], `${label}.stores`);
  exactKeys(stores, ["waterKg", "provisionsKg", "repairStoresKg", "medicineKg"], `${label}.stores`);
  for (const key of ["waterKg", "provisionsKg", "repairStoresKg", "medicineKg"] as const) {
    integer(stores[key], `${label}.stores.${key}`);
  }
}

function nullableHash(value: unknown, label: string): void {
  if (value === null) return;
  const hash = stringValue(value, label, 64);
  if (!HASH_PATTERN.test(hash)) throw new SimulationValidationError(`${label} must be a lowercase SHA-256 hash or null`);
}

function assertRunSummary(value: unknown, label: string): void {
  const item = record(value, label);
  exactKeys(item, [
    "runNumber", "runSeed", "outcome", "reason", "departureDate", "finalDate",
    "elapsedCommittedDays", "objectiveAchieved", "reportedFactCount", "lostFactCount",
    "salvagedFactCount", "reportSnapshotDay", "reportSnapshotHash",
  ], label);
  integer(item["runNumber"], `${label}.runNumber`, 1, 1_000_000);
  stringValue(item["runSeed"], `${label}.runSeed`, 256);
  if (!CAMPAIGN_OUTCOME_IDS.includes(item["outcome"] as CampaignOutcomeId)) {
    throw new SimulationValidationError(`${label}.outcome is invalid`);
  }
  stringValue(item["reason"], `${label}.reason`);
  isoDate(item["departureDate"], `${label}.departureDate`);
  isoDate(item["finalDate"], `${label}.finalDate`);
  integer(item["elapsedCommittedDays"], `${label}.elapsedCommittedDays`);
  if (typeof item["objectiveAchieved"] !== "boolean") {
    throw new SimulationValidationError(`${label}.objectiveAchieved must be boolean`);
  }
  integer(item["reportedFactCount"], `${label}.reportedFactCount`);
  integer(item["lostFactCount"], `${label}.lostFactCount`);
  integer(item["salvagedFactCount"], `${label}.salvagedFactCount`);
  if (item["reportSnapshotDay"] !== null) integer(item["reportSnapshotDay"], `${label}.reportSnapshotDay`);
  nullableHash(item["reportSnapshotHash"], `${label}.reportSnapshotHash`);
  if ((item["reportSnapshotDay"] === null) !== (item["reportSnapshotHash"] === null)) {
    throw new SimulationValidationError(`${label} snapshot day and hash must both be null or both be present`);
  }
}

function assertFactChanges(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new SimulationValidationError(`${label} must be an array`);
  let previous = "";
  for (let index = 0; index < value.length; index += 1) {
    const item = record(value[index], `${label}[${index}]`);
    exactKeys(item, ["id", "before", "after"], `${label}[${index}]`);
    const id = stringValue(item["id"], `${label}[${index}].id`, 256);
    if (index > 0 && id <= previous) throw new SimulationValidationError(`${label} must be sorted by fact ID`);
    previous = id;
    if (item["before"] !== null) assertCampaignFact(item["before"], `${label}[${index}].before`);
    assertCampaignFact(item["after"], `${label}[${index}].after`);
    if ((item["after"] as CampaignFact).id !== id) throw new SimulationValidationError(`${label}[${index}] ID mismatch`);
  }
}

function assertTrack(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) throw new SimulationValidationError(`${label} must be a non-empty array`);
  for (let index = 0; index < value.length; index += 1) {
    const item = record(value[index], `${label}[${index}]`);
    exactKeys(item, ["day", "date", "position"], `${label}[${index}]`);
    integer(item["day"], `${label}[${index}].day`);
    isoDate(item["date"], `${label}[${index}].date`);
    position(item["position"], `${label}[${index}].position`);
  }
}

function assertAfterActionReport(value: unknown, label: string): void {
  const item = record(value, label);
  exactKeys(item, [
    "format", "runNumber", "runSeed", "outcome", "reason", "departureDate", "finalDate",
    "elapsedCommittedDays", "objectiveStatus", "startingMetrics", "finalMetrics",
    "waterConsumedKg", "provisionsConsumedKg", "factsObserved", "factsReported",
    "factsDisproved", "factsLostWithShip", "factsSalvagedFromLog", "reportSnapshotDay",
    "reportSnapshotHash",
    "campaignFactsChanged", "nextExpeditionDifferences", "estimatedTrack", "trueTrack",
    "uncertaintyHistory", "currentContributionHistory", "observationHistory",
  ], label);
  if (item["format"] !== AFTER_ACTION_REPORT_FORMAT) throw new SimulationValidationError(`${label}.format is invalid`);
  integer(item["runNumber"], `${label}.runNumber`, 1, 1_000_000);
  stringValue(item["runSeed"], `${label}.runSeed`, 256);
  if (!CAMPAIGN_OUTCOME_IDS.includes(item["outcome"] as CampaignOutcomeId)) throw new SimulationValidationError(`${label}.outcome is invalid`);
  stringValue(item["reason"], `${label}.reason`);
  isoDate(item["departureDate"], `${label}.departureDate`);
  isoDate(item["finalDate"], `${label}.finalDate`);
  integer(item["elapsedCommittedDays"], `${label}.elapsedCommittedDays`);
  if (!["achieved", "not_achieved", "abandoned"].includes(item["objectiveStatus"] as string)) {
    throw new SimulationValidationError(`${label}.objectiveStatus is invalid`);
  }
  assertMetrics(item["startingMetrics"], `${label}.startingMetrics`);
  assertMetrics(item["finalMetrics"], `${label}.finalMetrics`);
  integer(item["waterConsumedKg"], `${label}.waterConsumedKg`);
  integer(item["provisionsConsumedKg"], `${label}.provisionsConsumedKg`);
  for (const key of [
    "factsObserved", "factsReported", "factsDisproved", "factsLostWithShip", "factsSalvagedFromLog",
  ] as const) {
    assertSortedFacts(item[key], `${label}.${key}`);
  }
  for (const fact of item["factsSalvagedFromLog"] as readonly CampaignFact[]) {
    // The report does not carry provenance, so it is held to the highest salvage tier. Both
    // tiers sit below 70, which is the contract that matters: no salvaged finding is confirmed.
    if (fact.confidence > SURVEYED_LANDMARK_SALVAGE_CONFIDENCE_CAP) {
      throw new SimulationValidationError(`${label}.factsSalvagedFromLog exceeds the salvage confidence cap`);
    }
  }
  if (item["reportSnapshotDay"] !== null) integer(item["reportSnapshotDay"], `${label}.reportSnapshotDay`);
  nullableHash(item["reportSnapshotHash"], `${label}.reportSnapshotHash`);
  if ((item["reportSnapshotDay"] === null) !== (item["reportSnapshotHash"] === null)) {
    throw new SimulationValidationError(`${label} snapshot day and hash must agree`);
  }
  assertFactChanges(item["campaignFactsChanged"], `${label}.campaignFactsChanged`);
  assertFactChanges(item["nextExpeditionDifferences"], `${label}.nextExpeditionDifferences`);
  if (canonicalize(item["campaignFactsChanged"]) !== canonicalize(item["nextExpeditionDifferences"])) {
    throw new SimulationValidationError(`${label} next-expedition differences must match campaign changes`);
  }
  assertTrack(item["estimatedTrack"], `${label}.estimatedTrack`);
  assertTrack(item["trueTrack"], `${label}.trueTrack`);
  if ((item["estimatedTrack"] as unknown[]).length !== (item["trueTrack"] as unknown[]).length) {
    throw new SimulationValidationError(`${label} estimated and true tracks must align`);
  }
  if (!Array.isArray(item["uncertaintyHistory"]) || (item["uncertaintyHistory"] as unknown[]).length !== (item["trueTrack"] as unknown[]).length) {
    throw new SimulationValidationError(`${label}.uncertaintyHistory must align with its tracks`);
  }
  for (const [index, pointValue] of (item["uncertaintyHistory"] as unknown[]).entries()) {
    const point = record(pointValue, `${label}.uncertaintyHistory[${index}]`);
    exactKeys(point, ["day", "date", "uncertainty", "errorMnm"], `${label}.uncertaintyHistory[${index}]`);
    integer(point["day"], `${label}.uncertaintyHistory[${index}].day`);
    isoDate(point["date"], `${label}.uncertaintyHistory[${index}].date`);
    const uncertainty = record(point["uncertainty"], `${label}.uncertaintyHistory[${index}].uncertainty`);
    exactKeys(uncertainty, ["eastWestMnm", "northSouthMnm"], `${label}.uncertaintyHistory[${index}].uncertainty`);
    integer(uncertainty["eastWestMnm"], `${label}.uncertaintyHistory[${index}].uncertainty.eastWestMnm`);
    integer(uncertainty["northSouthMnm"], `${label}.uncertaintyHistory[${index}].uncertainty.northSouthMnm`);
    position(point["errorMnm"], `${label}.uncertaintyHistory[${index}].errorMnm`);
  }
  if (!Array.isArray(item["currentContributionHistory"])) throw new SimulationValidationError(`${label}.currentContributionHistory must be an array`);
  for (const [index, pointValue] of (item["currentContributionHistory"] as unknown[]).entries()) {
    const point = record(pointValue, `${label}.currentContributionHistory[${index}]`);
    integer(point["day"], `${label}.currentContributionHistory[${index}].day`);
    isoDate(point["date"], `${label}.currentContributionHistory[${index}].date`);
    if (point["explanation"] === "supported_by_reported_evidence") {
      exactKeys(point, ["day", "date", "explanation", "supportingFactId", "vectorMnmPerDay"], `${label}.currentContributionHistory[${index}]`);
      stringValue(point["supportingFactId"], `${label}.currentContributionHistory[${index}].supportingFactId`, 256);
      position(point["vectorMnmPerDay"], `${label}.currentContributionHistory[${index}].vectorMnmPerDay`);
    } else if (point["explanation"] === "unexplained_route_divergence") {
      exactKeys(point, ["day", "date", "explanation"], `${label}.currentContributionHistory[${index}]`);
    } else {
      throw new SimulationValidationError(`${label}.currentContributionHistory[${index}].explanation is invalid`);
    }
  }
  if (!Array.isArray(item["observationHistory"])) throw new SimulationValidationError(`${label}.observationHistory must be an array`);
  for (const [index, pointValue] of (item["observationHistory"] as unknown[]).entries()) {
    const point = record(pointValue, `${label}.observationHistory[${index}]`);
    exactKeys(point, [
      "day", "date", "result", "eastWestUncertaintyBeforeMnm", "eastWestUncertaintyAfterMnm",
      "estimateCorrectionMnm",
    ], `${label}.observationHistory[${index}]`);
    integer(point["day"], `${label}.observationHistory[${index}].day`);
    isoDate(point["date"], `${label}.observationHistory[${index}].date`);
    if (!["open_ocean", "land_signs", "shoaling_water"].includes(point["result"] as string)) {
      throw new SimulationValidationError(`${label}.observationHistory[${index}].result is invalid`);
    }
    integer(point["eastWestUncertaintyBeforeMnm"], `${label}.observationHistory[${index}].eastWestUncertaintyBeforeMnm`, 0);
    integer(point["eastWestUncertaintyAfterMnm"], `${label}.observationHistory[${index}].eastWestUncertaintyAfterMnm`, 0);
    integer(point["estimateCorrectionMnm"], `${label}.observationHistory[${index}].estimateCorrectionMnm`);
  }
}

export function assertCampaignState(value: unknown): asserts value is CampaignState {
  const item = record(value, "campaign state");
  exactKeys(item, [
    "format", "contentVersion", "expeditionDailyEventChancePermille", "facts", "completedRuns",
    "afterActionReports", "activeExpedition", "commandLog", "replayCommands",
  ], "campaign state");
  if (item["format"] !== CAMPAIGN_STATE_FORMAT) {
    throw new SimulationValidationError(`campaign state format must be ${CAMPAIGN_STATE_FORMAT}`);
  }
  stringValue(item["contentVersion"], "campaign state contentVersion", 128);
  integer(item["expeditionDailyEventChancePermille"], "campaign event chance", 0, 1_000);
  assertSortedFacts(item["facts"], "campaign state facts");
  if (!Array.isArray(item["completedRuns"]) || !Array.isArray(item["afterActionReports"])) {
    throw new SimulationValidationError("campaign completed runs and reports must be arrays");
  }
  if (item["completedRuns"].length !== item["afterActionReports"].length) {
    throw new SimulationValidationError("campaign summaries and reports must have equal length");
  }
  for (let index = 0; index < item["completedRuns"].length; index += 1) {
    const summaryValue = item["completedRuns"][index];
    const reportValue = item["afterActionReports"][index];
    assertRunSummary(summaryValue, `campaign completedRuns[${index}]`);
    assertAfterActionReport(reportValue, `campaign afterActionReports[${index}]`);
    const summary = summaryValue as CampaignRunSummary;
    const report = reportValue as AfterActionReport;
    if (summary.runNumber !== index + 1) throw new SimulationValidationError("campaign run numbers must be consecutive");
    if (
      report.runNumber !== index + 1
      || report.runSeed !== summary.runSeed
      || report.outcome !== summary.outcome
      || report.reason !== summary.reason
    ) {
      throw new SimulationValidationError("campaign after-action report identity is invalid");
    }
  }
  if (item["activeExpedition"] !== null) {
    assertActiveExpedition(item["activeExpedition"], "campaign activeExpedition");
    if ((item["activeExpedition"] as ActiveExpedition).runNumber !== item["completedRuns"].length + 1) {
      throw new SimulationValidationError("active expedition run number must follow completed runs");
    }
  }
  if (!Array.isArray(item["commandLog"]) || !Array.isArray(item["replayCommands"])) {
    throw new SimulationValidationError("campaign command log and replay commands must be arrays");
  }
  if (item["commandLog"].length !== item["replayCommands"].length) {
    throw new SimulationValidationError("campaign command log and replay commands must have equal length");
  }
  for (let index = 0; index < item["replayCommands"].length; index += 1) {
    assertCampaignCommand(item["replayCommands"][index]);
    const log = record(item["commandLog"][index], `campaign commandLog[${index}]`);
    exactKeys(log, ["index", "type", "runNumber", "command", "result"], `campaign commandLog[${index}]`);
    if (log["index"] !== index || log["type"] !== "campaign_command") {
      throw new SimulationValidationError("campaign command log index/type is invalid");
    }
    if (log["runNumber"] !== null) integer(log["runNumber"], `campaign commandLog[${index}].runNumber`, 1, 1_000_000);
    const result = record(log["result"], `campaign commandLog[${index}].result`);
    const resultKind = result["kind"];
    if (resultKind === "expedition_started") {
      exactKeys(result, ["kind", "runNumber", "runSeed"], `campaign commandLog[${index}].result`);
      integer(result["runNumber"], `campaign commandLog[${index}].result.runNumber`, 1, 1_000_000);
      stringValue(result["runSeed"], `campaign commandLog[${index}].result.runSeed`, 256);
    } else if (resultKind === "simulation_command_forwarded") {
      exactKeys(result, ["kind", "runNumber", "journeyLogIndex", "committedDay"], `campaign commandLog[${index}].result`);
      integer(result["runNumber"], `campaign commandLog[${index}].result.runNumber`, 1, 1_000_000);
      integer(result["journeyLogIndex"], `campaign commandLog[${index}].result.journeyLogIndex`);
      integer(result["committedDay"], `campaign commandLog[${index}].result.committedDay`);
    } else if (resultKind === "cape_verde_report_deposited") {
      exactKeys(result, ["kind", "runNumber", "committedDay", "factCount", "snapshotHash"], `campaign commandLog[${index}].result`);
      integer(result["runNumber"], `campaign commandLog[${index}].result.runNumber`, 1, 1_000_000);
      integer(result["committedDay"], `campaign commandLog[${index}].result.committedDay`);
      integer(result["factCount"], `campaign commandLog[${index}].result.factCount`);
      const snapshotHash = stringValue(result["snapshotHash"], `campaign commandLog[${index}].result.snapshotHash`, 64);
      if (!HASH_PATTERN.test(snapshotHash)) throw new SimulationValidationError("campaign deposit log hash is invalid");
    } else if (resultKind === "expedition_finalized") {
      exactKeys(result, ["kind", "runNumber", "outcome", "afterActionReportHash"], `campaign commandLog[${index}].result`);
      integer(result["runNumber"], `campaign commandLog[${index}].result.runNumber`, 1, 1_000_000);
      if (!CAMPAIGN_OUTCOME_IDS.includes(result["outcome"] as CampaignOutcomeId)) throw new SimulationValidationError("campaign finalized outcome is invalid");
      const reportHash = stringValue(result["afterActionReportHash"], `campaign commandLog[${index}].result.afterActionReportHash`, 64);
      if (!HASH_PATTERN.test(reportHash)) throw new SimulationValidationError("campaign finalized report hash is invalid");
    } else {
      throw new SimulationValidationError(`campaign commandLog[${index}].result kind is invalid`);
    }
    if (result["runNumber"] !== log["runNumber"]) {
      throw new SimulationValidationError(`campaign commandLog[${index}] run number does not match its result`);
    }
    if (canonicalize(log["command"]) !== canonicalize(item["replayCommands"][index])) {
      throw new SimulationValidationError("campaign command log does not match replay commands");
    }
  }
}

export function canonicalCampaignState(state: Readonly<CampaignState>): string {
  assertCampaignState(state);
  return canonicalize(state);
}

export function hashCampaignState(state: Readonly<CampaignState>): string {
  assertCampaignState(state);
  return hashCanonical(state);
}

export function hashCampaignFacts(state: Readonly<CampaignState>): string {
  assertCampaignState(state);
  return hashCanonical(state.facts);
}

export function hashCampaignCommandLog(state: Readonly<CampaignState>): string {
  assertCampaignState(state);
  return hashCanonical(state.commandLog);
}

export function hashAfterActionReport(report: Readonly<AfterActionReport>): string {
  return hashCanonical(report);
}

export function serializeCampaignSave(state: Readonly<CampaignState>): string {
  assertCampaignState(state);
  const envelope: CampaignSaveEnvelope = { format: CAMPAIGN_SAVE_FORMAT, state };
  return canonicalize(envelope);
}

function decodeSave(data: string | Uint8Array): string {
  if (typeof data === "string") return data;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (error) {
    throw new SaveFormatError(
      `campaign save is not valid UTF-8: ${error instanceof Error ? error.message : "decode failed"}`,
    );
  }
}

export function deserializeCampaignSave(data: string | Uint8Array): CampaignState {
  const text = decodeSave(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SaveFormatError(
      `campaign save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }
  try {
    const envelope = record(parsed, "campaign save envelope");
    exactKeys(envelope, ["format", "state"], "campaign save envelope");
    if (envelope["format"] !== CAMPAIGN_SAVE_FORMAT) {
      throw new SimulationValidationError(`campaign save format must be ${CAMPAIGN_SAVE_FORMAT}`);
    }
    assertCampaignState(envelope["state"]);
    if (canonicalize(parsed) !== text) {
      throw new SimulationValidationError("campaign save must be canonical JSON with exactly one trailing LF");
    }
    return deepFreeze(envelope["state"] as CampaignState);
  } catch (error) {
    throw new SaveFormatError(
      `campaign save is invalid: ${error instanceof Error ? error.message : "validation failed"}`,
    );
  }
}

function replaySeeds(startingState: Readonly<CampaignState>, commands: readonly Readonly<CampaignCommand>[]): string[] {
  return [
    ...(startingState.activeExpedition === null ? [] : [startingState.activeExpedition.runSeed]),
    ...commands.filter((command): command is Extract<CampaignCommand, { type: "start_expedition" }> =>
      command.type === "start_expedition").map((command) => command.runSeed),
  ];
}

export function createCampaignReplay(
  startingState: Readonly<CampaignState>,
  commands: readonly Readonly<CampaignCommand>[],
): CampaignReplayRecord {
  assertCampaignState(startingState);
  for (const command of commands) assertCampaignCommand(command);
  return deepFreeze({
    format: CAMPAIGN_REPLAY_FORMAT,
    contentVersion: startingState.contentVersion,
    startingCampaignHash: hashCampaignState(startingState),
    expeditionSeeds: replaySeeds(startingState, commands),
    commands: commands.map(copyCampaignCommand),
  });
}

function assertCampaignReplay(value: unknown): asserts value is CampaignReplayRecord {
  const item = record(value, "campaign replay");
  exactKeys(item, ["format", "contentVersion", "startingCampaignHash", "expeditionSeeds", "commands"], "campaign replay");
  if (item["format"] !== CAMPAIGN_REPLAY_FORMAT) throw new ReplayError("campaign replay format is invalid");
  stringValue(item["contentVersion"], "campaign replay contentVersion", 128);
  const hash = stringValue(item["startingCampaignHash"], "campaign replay startingCampaignHash", 64);
  if (!HASH_PATTERN.test(hash)) throw new ReplayError("campaign replay starting hash is invalid");
  if (!Array.isArray(item["expeditionSeeds"]) || !Array.isArray(item["commands"])) {
    throw new ReplayError("campaign replay seeds and commands must be arrays");
  }
  for (const seed of item["expeditionSeeds"]) stringValue(seed, "campaign replay expedition seed", 256);
  for (const command of item["commands"]) assertCampaignCommand(command);
}

export function replayCampaign(
  startingState: Readonly<CampaignState>,
  replay: Readonly<CampaignReplayRecord>,
  options: Readonly<CampaignExecutionOptions> = {},
): CampaignState {
  assertCampaignState(startingState);
  try {
    assertCampaignReplay(replay);
  } catch (error) {
    if (error instanceof ReplayError) throw error;
    throw new ReplayError(error instanceof Error ? error.message : "campaign replay validation failed");
  }
  if (replay.contentVersion !== startingState.contentVersion) {
    throw new ReplayError("campaign replay contentVersion does not match the starting campaign");
  }
  if (replay.startingCampaignHash !== hashCampaignState(startingState)) {
    throw new ReplayError("campaign replay starting hash does not match the starting campaign");
  }
  const expectedSeeds = replaySeeds(startingState, replay.commands);
  if (canonicalize(expectedSeeds) !== canonicalize(replay.expeditionSeeds)) {
    throw new ReplayError("campaign replay expedition seeds do not match its ordered commands");
  }
  let state = startingState as CampaignState;
  for (const command of replay.commands) state = executeCampaignCommand(state, command, options);
  return state;
}

export function getCampaignPlayerView(state: Readonly<CampaignState>): CampaignPlayerView {
  assertCampaignState(state);
  const active = state.activeExpedition;
  const snapshot = active?.reportSnapshot ?? null;
  const unreported = active === null
    ? []
    : factsWithEvidenceOutside(loggedFacts(active), evidenceIds(snapshot?.facts ?? []));
  return deepFreeze({
    contentVersion: state.contentVersion,
    currentRunNumber: active?.runNumber ?? null,
    inheritedReportedFacts: canonicalCopy(active?.inheritedFacts ?? state.facts),
    priorRunSummaries: canonicalCopy(state.completedRuns),
    activeRun: active === null ? null : getPlayerView(active.journey),
    depositedReport: {
      deposited: snapshot !== null,
      date: snapshot?.date ?? null,
      factCount: snapshot?.facts.length ?? 0,
      unreportedFactCount: unreported.length,
    },
    afterActionReports: canonicalCopy(state.afterActionReports),
  }) as CampaignPlayerView;
}

export function executeForwardedSimulationCommand(
  state: Readonly<CampaignState>,
  command: Readonly<SimulationCommand>,
  environmentProvider?: EnvironmentProvider,
): CampaignState {
  return executeCampaignCommand(
    state,
    { type: "forward_simulation_command", command },
    environmentProvider === undefined ? {} : { environmentProvider },
  );
}
