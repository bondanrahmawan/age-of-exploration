import {
  AUTHORED_EVENTS,
  EAST_WEST_OBSERVATION_TIERS,
  HEADINGS,
  SAILING_POLICIES,
  RATION_POLICIES,
  SHIP_COMPONENTS,
  STORE_KINDS,
  SURVIVAL_TUNING,
  eastWestObservationRefusal,
  lisbonOutfittingCost,
  type AfterActionReport,
  type CampaignFact,
  type CampaignPlayerView,
  type CampaignRunSummary,
  type CanonicalLogEntry,
  type EventEffects,
  type EventChoiceRequirement,
  type Heading,
  type JourneyDayActivityResult,
  type ObservationHistoryPoint,
  type JourneyPlayerView,
  type RationPolicy,
  type SailingPolicy,
  type StoreKind,
  type SurvivalActionResult,
  type StoresState,
} from "../src/index.js";

export const PRODUCT_SCREENS = ["outfitting", "expedition", "interrupt", "after_action"] as const;
export const EXPEDITION_PANELS = ["chart", "deck", "log"] as const;
export const ANIMATION_MODES = ["normal", "reduced", "skipped"] as const;

export type ProductScreen = (typeof PRODUCT_SCREENS)[number];
export type ExpeditionPanel = (typeof EXPEDITION_PANELS)[number];
export type AnimationMode = (typeof ANIMATION_MODES)[number];
export type ShipComponent = (typeof SHIP_COMPONENTS)[number];

export interface SafeSavePreview {
  readonly kind: "none" | "valid" | "invalid";
  readonly message: string;
  readonly currentRunNumber: number | null;
  readonly committedDay: number | null;
  readonly date: string | null;
  readonly completedRuns: number;
  readonly reportedFactCount: number;
  readonly boundary: string | null;
}

export interface FactViewModel {
  readonly id: string;
  readonly label: string;
  readonly type: CampaignFact["type"] | "navigation" | "journey";
  readonly confidence: number;
  readonly status: string;
  readonly source: string;
  readonly claim: string;
}

export interface RunSummaryViewModel {
  readonly runNumber: number;
  readonly outcome: string;
  readonly reason: string;
  readonly finalDate: string;
  readonly elapsedDays: number;
  readonly objectiveAchieved: boolean;
  readonly reportedFactCount: number;
  readonly lostFactCount: number;
  readonly salvagedFactCount: number;
}

export interface OutfittingValidation {
  readonly valid: boolean;
  readonly storeErrors: Readonly<Partial<Record<StoreKind, string>>>;
  readonly capacityError: string | null;
  readonly moneyError: string | null;
  readonly costDucats: number;
  readonly moneyRemainingDucats: number;
  readonly allocatableHoldUsedKg: number;
  readonly allocatableHoldRemainingKg: number;
  readonly projectedRangeDays: number;
}

export interface OutfittingViewModel {
  readonly allocation: StoresState;
  readonly tuning: typeof SURVIVAL_TUNING;
  readonly validation: OutfittingValidation;
  readonly inheritedFacts: readonly FactViewModel[];
  readonly priorRuns: readonly RunSummaryViewModel[];
  readonly campaignReady: boolean;
}

export interface ChartPointViewModel {
  readonly day: number;
  readonly date: string;
  readonly xNm: number;
  readonly yNm: number;
}

export interface ChartLandmarkViewModel {
  readonly id: string;
  readonly label: string;
  readonly xNm: number;
  readonly yNm: number;
  readonly confidence: number;
  readonly status: string;
}

export interface ChartViewModel {
  readonly estimatedPosition: ChartPointViewModel;
  readonly estimatedTrack: readonly ChartPointViewModel[];
  readonly uncertaintyEastWestNm: number;
  readonly uncertaintyNorthSouthNm: number;
  readonly heading: Heading;
  readonly knownLandmarks: readonly ChartLandmarkViewModel[];
  readonly observedWind: string;
  readonly knownCurrentStatements: readonly string[];
}

export interface DeckViewModel {
  readonly date: string;
  readonly elapsedDays: number;
  readonly location: string;
  readonly stores: StoresState;
  readonly holdUsedKg: number;
  readonly holdRemainingKg: number;
  readonly moneyDucats: number;
  readonly crew: JourneyPlayerView["crew"];
  readonly ship: JourneyPlayerView["ship"];
  readonly foulingSpeedLossBps: number;
  readonly warnings: readonly string[];
  readonly observedWeather: string;
  readonly observedWind: string;
  readonly heading: Heading;
  readonly sailingPolicy: SailingPolicy;
  readonly rationPolicy: RationPolicy;
  readonly expeditionIntent: string;
  readonly expeditionIntentValue: JourneyPlayerView["survival"]["expeditionIntent"];
  readonly observationDaysSpent: number;
  readonly lastObservation: string;
  readonly observationReason: string | null;
}

export interface LogEntryViewModel {
  readonly index: number;
  readonly day: number;
  readonly title: string;
  readonly text: string;
}

export interface ExpeditionViewModel {
  readonly mission: MissionProgressViewModel;
  readonly record: RecordStakesViewModel;
  readonly chart: ChartViewModel;
  readonly deck: DeckViewModel;
  readonly log: readonly LogEntryViewModel[];
  readonly lastResult: LogEntryViewModel | null;
  readonly headings: typeof HEADINGS;
  readonly sailingPolicies: typeof SAILING_POLICIES;
  readonly rationPolicies: typeof RATION_POLICIES;
}

export interface MissionProgressViewModel {
  readonly milestone: string;
  readonly status: string;
}

/**
 * What the written record stands to lose today. Shown on deck and in port rather than kept
 * for the post-mortem, because a player who cannot see findings riding on an undeposited
 * log cannot decide to go and deposit it.
 */
export interface RecordStakesViewModel {
  readonly headline: string;
  readonly detail: string;
  readonly atRisk: number;
  readonly deposited: boolean;
}

export interface ChoiceViewModel {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  readonly reason: string | null;
  readonly knownConsequence: string;
  readonly knownRequirement: string;
}

export interface InterruptViewModel {
  readonly kind: "event" | "cape_verde" | "cape" | "landfall" | "survival" | "terminal";
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly elapsedDays: number;
  readonly mission: MissionProgressViewModel;
  readonly record: RecordStakesViewModel;
  readonly lastResult: LogEntryViewModel | null;
  readonly choices: readonly ChoiceViewModel[];
  readonly location: string;
  readonly stores: StoresState;
  readonly stock: StoresState | null;
  readonly moneyDucats: number;
  readonly ship: JourneyPlayerView["ship"];
  readonly crew: JourneyPlayerView["crew"];
  readonly careeningDaysCompleted: number;
  readonly foulingSpeedLossBps: number;
  readonly rumourPurchased: boolean;
  readonly reportDeposited: boolean;
  readonly capeSurveyDaysCompleted: number;
  readonly capeSurveyed: boolean;
  readonly capeWaterKnown: boolean;
  readonly holdRemainingKg: number;
  readonly outcomeReason: string | null;
  readonly statusMessage: string | null;
  readonly warnings: readonly string[];
  readonly canRecogniseCape: boolean;
  readonly canEnterCapeVerde: boolean;
  readonly canDismiss: boolean;
  readonly survivalStatus: JourneyPlayerView["survival"]["status"]["kind"];
  readonly eventId: string | null;
}

/**
 * One line of the route-divergence section. Days the reported evidence explains keep a
 * line each; days it does not are collapsed into one line per unbroken run, because a
 * long voyage produces hundreds of them and one line per day reads as debug output.
 */
export type RouteExplanationViewModel =
  | { readonly kind: "supported"; readonly day: number; readonly text: string }
  | {
      readonly kind: "unexplained";
      readonly fromDay: number;
      readonly toDay: number;
      readonly dayCount: number;
      readonly text: string;
    };

export interface ReportMetricViewModel {
  readonly label: string;
  readonly starting: string;
  readonly final: string;
}

export interface ReportViewModel {
  readonly runNumber: number;
  readonly outcome: string;
  readonly reason: string;
  readonly departureDate: string;
  readonly finalDate: string;
  readonly elapsedDays: number;
  readonly objectiveStatus: string;
  readonly metrics: readonly ReportMetricViewModel[];
  readonly waterConsumedKg: number;
  readonly provisionsConsumedKg: number;
  readonly factsObserved: readonly FactViewModel[];
  readonly factsReported: readonly FactViewModel[];
  readonly factsDisproved: readonly FactViewModel[];
  readonly factsLost: readonly FactViewModel[];
  readonly factsSalvaged: readonly FactViewModel[];
  readonly reportSnapshotDay: number | null;
  readonly estimatedTrack: readonly ChartPointViewModel[];
  readonly trueTrack: readonly ChartPointViewModel[];
  readonly uncertaintyHistory: readonly {
    readonly day: number;
    readonly eastWestNm: number;
    readonly northSouthNm: number;
    readonly errorEastWestNm: number;
    readonly errorNorthSouthNm: number;
  }[];
  readonly currentExplanations: readonly RouteExplanationViewModel[];
  readonly currentExplanationSummary: string | null;
  readonly observations: readonly { readonly day: number; readonly text: string }[];
  readonly inheritedDifferences: readonly FactViewModel[];
}

export interface AppViewModel {
  readonly screen: ProductScreen;
  readonly savePreview: SafeSavePreview;
  readonly selectedPanel: ExpeditionPanel;
  readonly animationMode: AnimationMode;
  readonly isAdvancing: boolean;
  readonly announcement: string;
  readonly error: string | null;
  readonly outfitting: OutfittingViewModel | null;
  readonly expedition: ExpeditionViewModel | null;
  readonly interrupt: InterruptViewModel | null;
  readonly report: ReportViewModel | null;
}

const kgToNm = (valueMnm: number) => valueMnm / 1_000;
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function campaignFactView(fact: Readonly<CampaignFact>): FactViewModel {
  const claim = fact.claimedValue.kind === "statement"
    ? fact.claimedValue.text
    : fact.claimedValue.kind === "position"
      ? `Charted near ${kgToNm(fact.claimedValue.position.xMnm).toFixed(0)} nm east/west, ${kgToNm(fact.claimedValue.position.yMnm).toFixed(0)} nm north/south.`
      : `Claimed set ${kgToNm(fact.claimedValue.vectorMnmPerDay.xMnm).toFixed(1)} nm east/west and ${kgToNm(fact.claimedValue.vectorMnmPerDay.yMnm).toFixed(1)} nm north/south per day.`;
  return {
    id: fact.id,
    label: fact.type === "port" ? `${titleCase(fact.locationOrRegion)} Port`
      : fact.type === "landmark" ? `${titleCase(fact.locationOrRegion)} Landmark`
        : titleCase(fact.locationOrRegion),
    type: fact.type,
    confidence: fact.confidence,
    status: fact.status,
    source: fact.source,
    claim,
  };
}

function runSummaryView(summary: Readonly<CampaignRunSummary>): RunSummaryViewModel {
  return {
    runNumber: summary.runNumber,
    outcome: titleCase(summary.outcome),
    reason: summary.reason,
    finalDate: summary.finalDate,
    elapsedDays: summary.elapsedCommittedDays,
    objectiveAchieved: summary.objectiveAchieved,
    reportedFactCount: summary.reportedFactCount,
    lostFactCount: summary.lostFactCount,
    salvagedFactCount: summary.salvagedFactCount,
  };
}

export function validateOutfitting(allocation: Readonly<StoresState>): OutfittingValidation {
  const storeErrors: Partial<Record<StoreKind, string>> = {};
  for (const store of STORE_KINDS) {
    const key = `${store === "repair_stores" ? "repairStores" : store}Kg` as keyof StoresState;
    const quantity = allocation[key];
    const cap = SURVIVAL_TUNING.stores[store].capKg;
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      storeErrors[store] = "Enter 0 or more tonnes, in steps of 0.5.";
    } else if (quantity > cap) {
      storeErrors[store] = `${(cap / 1_000).toFixed(1)} t is the most Lisbon can supply.`;
    }
  }
  const allocatableHoldUsedKg = Object.values(allocation).reduce((total, quantity) => total + quantity, 0);
  const capacityError = allocatableHoldUsedKg > SURVIVAL_TUNING.hold.allocatableKg
    ? `The hold is over by ${((allocatableHoldUsedKg - SURVIVAL_TUNING.hold.allocatableKg) / 1_000).toFixed(1)} t. Take that much back off before departing.`
    : null;
  let costDucats = Number.MAX_SAFE_INTEGER;
  if (Object.keys(storeErrors).length === 0) costDucats = lisbonOutfittingCost(allocation);
  const moneyError = costDucats > SURVIVAL_TUNING.sponsorAdvanceDucats
    ? `These stores cost ${costDucats} ducats and the sponsor advanced only ${SURVIVAL_TUNING.sponsorAdvanceDucats}. Buy ${costDucats - SURVIVAL_TUNING.sponsorAdvanceDucats} ducats’ worth less.`
    : null;
  const waterDays = Math.floor(allocation.waterKg / (25 * 6));
  const provisionDays = Math.floor(allocation.provisionsKg / (25 * 3));
  return {
    valid: Object.keys(storeErrors).length === 0 && capacityError === null && moneyError === null,
    storeErrors,
    capacityError,
    moneyError,
    costDucats,
    moneyRemainingDucats: Math.max(0, SURVIVAL_TUNING.sponsorAdvanceDucats - costDucats),
    allocatableHoldUsedKg,
    allocatableHoldRemainingKg: SURVIVAL_TUNING.hold.allocatableKg - allocatableHoldUsedKg,
    projectedRangeDays: Math.min(waterDays, provisionDays),
  };
}

function estimatedTrack(active: Readonly<JourneyPlayerView>): readonly ChartPointViewModel[] {
  const points: ChartPointViewModel[] = [{ day: 0, date: "1488-04-01", xNm: 0, yNm: 0 }];
  for (const entry of active.log) {
    if (entry.type === "day" || entry.type === "survival_day" || entry.type === "journey_day") {
      points.push({
        day: entry.committedDay,
        date: entry.date,
        xNm: kgToNm(entry.estimatedPosition.xMnm),
        yNm: kgToNm(entry.estimatedPosition.yMnm),
      });
    }
  }
  if (points.at(-1)?.day !== active.committedDay) {
    points.push({
      day: active.committedDay,
      date: active.date,
      xNm: kgToNm(active.estimatedPosition.xMnm),
      yNm: kgToNm(active.estimatedPosition.yMnm),
    });
  }
  return points;
}

const ORDER_NAMES: Record<string, string> = {
  set_heading: "Heading",
  set_sailing_policy: "Sailing policy",
  set_ration_policy: "Rations",
};

const ACTIVITY_NAMES: Record<string, string> = {
  sailing: "Under sail",
  careening: "Careening",
  repair: "Repairs",
  port_rest: "Resting in port",
  east_west_observation: "Lying to and observing",
  cape_survey: "Surveying the Cape",
  cape_water_collection: "Watering",
};

type EastWestObservationActivity = Extract<
  JourneyDayActivityResult,
  { readonly kind: "east_west_observation" }
>;

const nauticalMiles = (mnm: number) => `${Math.round(mnm / 1_000)} nm`;

/**
 * The east-west observation is the one order whose whole value is the sentence it writes,
 * so the log states the bracket the crew brought back and what it did to the chart. The
 * fruitless answer is written out too, because knowing the coast is still far off is the
 * only thing that day bought.
 */
function observationSentence(activity: Readonly<EastWestObservationActivity>): string {
  const narrowed = activity.eastWestUncertaintyAfterMnm < activity.eastWestUncertaintyBeforeMnm
    ? ` The east-west band closed from ${nauticalMiles(activity.eastWestUncertaintyBeforeMnm)} to ${nauticalMiles(activity.eastWestUncertaintyAfterMnm)}.`
    : ` The east-west band stayed at ${nauticalMiles(activity.eastWestUncertaintyAfterMnm)}: this ground has nothing further to tell, and another day here would buy nothing.`;
  const shifted = activity.estimateCorrectionMnm === 0
    ? ""
    : ` The reckoning was moved ${nauticalMiles(Math.abs(activity.estimateCorrectionMnm))} ${activity.estimateCorrectionMnm > 0 ? "east" : "west"}.`;
  switch (activity.result.kind) {
    case "shoaling_water":
      return ` The lead found shoaling water and brought up sand, and the birds held a steady quarter.${narrowed}${shifted}`;
    case "land_signs":
      return ` No bottom, but weed and land birds put a coast somewhere to the east.${narrowed}${shifted}`;
    case "open_ocean":
      return " No bottom at a hundred fathom and no sign of land. The ship is more than 900 nm from any coast the crew knows, and the day bought nothing but that.";
    case "none":
    default:
      return "";
  }
}

const STORE_WORDS: Record<StoreKind, string> = {
  water: "water",
  provisions: "provisions",
  repair_stores: "repair stores",
  medicine: "medicine",
};

const INTENT_WORDS: Record<string, string> = {
  pursue_objective: "continue to the Cape",
  return_to_lisbon: "turn home for Lisbon",
  objective_abandoned: "give up the Cape",
};

/**
 * The log is the record the crew kept, so entries are written as sentences rather than
 * as the identifiers the engine uses. Authored journey text is passed through unchanged.
 */
function survivalActionEntry(result: Readonly<SurvivalActionResult>): { title: string; text: string } {
  switch (result.kind) {
    case "lisbon_outfitting_set":
      return { title: "Hold loaded", text: `Stores were loaded in Lisbon for ${result.costDucats} ducats.` };
    case "departed_lisbon":
      return { title: "Departed Lisbon", text: `The ship put to sea carrying ${result.moneyCarriedDucats} ducats.` };
    case "entered_cape_verde_port":
      return { title: "Into port", text: "The ship came into Cape Verde." };
    case "left_cape_verde_port":
      return { title: "Out of port", text: "The ship left Cape Verde and stood back out to sea." };
    case "cape_verde_purchase":
      return {
        title: "Stores bought",
        text: `Took on ${Math.round(result.quantityKg)} kg of ${STORE_WORDS[result.store]} for ${result.costDucats} ducats.`,
      };
    case "expedition_intent_set":
      return {
        title: "Intent changed",
        text: `The ship will now ${INTENT_WORDS[result.intent] ?? "hold its present course"}.`,
      };
  }
}

const JOURNEY_TITLES: Record<string, string> = {
  cape_verde_rumour_purchased: "Rumour bought",
  cape_landfall_recognised: "The Cape recognised",
  left_cape: "Left the Cape",
  event_choice_resolved: "Decision",
};

function logEntry(entry: Readonly<CanonicalLogEntry>): LogEntryViewModel {
  if (entry.type === "command") {
    return {
      index: entry.index,
      day: entry.committedDay,
      title: ORDER_NAMES[entry.command] ?? "Order given",
      text: `Changed to ${entry.value.replaceAll("_", " ")}.`,
    };
  }
  if (entry.type === "survival_action") {
    const written = survivalActionEntry(entry.result);
    return { index: entry.index, day: entry.committedDay, title: written.title, text: written.text };
  }
  if (entry.type === "journey_action") {
    return {
      index: entry.index,
      day: entry.committedDay,
      title: JOURNEY_TITLES[entry.result.kind] ?? "Decision",
      text: entry.text,
    };
  }
  const weather = "observedWeather" in entry ? titleCase(entry.observedWeather) : "Fair";
  const activity = "activity" in entry ? ACTIVITY_NAMES[entry.activity.kind] ?? titleCase(entry.activity.kind) : "Under sail";
  const event = "event" in entry && entry.event !== "none" ? ` ${entry.event.title}: ${entry.event.text}` : "";
  const consequences = "delayedConsequences" in entry && entry.delayedConsequences.length > 0
    ? ` ${entry.delayedConsequences.map((item) => item.text).join(" ")}`
    : "";
  const observed = "activity" in entry && entry.activity.kind === "east_west_observation"
    ? observationSentence(entry.activity)
    : "";
  return {
    index: entry.index,
    day: entry.committedDay,
    title: `${entry.date} — ${activity}`,
    text: `${weather}. The crew drank ${Math.round(entry.waterConsumedKg)} kg of water and ate ${Math.round(entry.provisionsConsumedKg)} kg of provisions.${observed}${event}${consequences}`,
  };
}

/** The best band the named observation ground can ever establish, or null for open ocean. */
function eastWestObservationTierFloor(kind: string): number | null {
  return EAST_WEST_OBSERVATION_TIERS.find((tier) => tier.kind === kind)?.floorMnm ?? null;
}

/**
 * A short standing summary of what the last east-west observation established, so the
 * player can read the present bracket off the deck without hunting through the log.
 */
function lastObservationSummary(active: Readonly<JourneyPlayerView>): string {
  const kind = active.journey.lastEastWestObservation.kind;
  if (kind === "none") return "No east-west observation has been made yet.";
  const latest = [...active.log].reverse().find((entry) =>
    entry.type === "journey_day" && entry.activity.kind === "east_west_observation");
  const detail = latest !== undefined
    && latest.type === "journey_day"
    && latest.activity.kind === "east_west_observation"
    ? ` on day ${latest.committedDay}, band ${nauticalMiles(latest.activity.eastWestUncertaintyAfterMnm)}`
    : "";
  const floor = eastWestObservationTierFloor(kind);
  const more = floor === null
    ? ""
    : active.uncertainty.eastWestMnm <= floor
      ? ` Working this ground further cannot better ${nauticalMiles(floor)}.`
      : ` Working the same ground again closes the band further, down to ${nauticalMiles(floor)} at best.`;
  if (kind === "shoaling_water") return `Shoaling water${detail}. A coast lies within 200 nm east or west.${more}`;
  if (kind === "land_signs") return `Land signs${detail}. A coast lies within 600 nm to the east.${more}`;
  return `Open ocean${detail}. No coast within 900 nm.`;
}

/** Names why an east-west observation cannot be ordered right now, or null when it can. */
function observationBlockedReason(active: Readonly<JourneyPlayerView>): string | null {
  if (active.journey.outcome !== null) return "The expedition is over.";
  if (active.journey.pendingEvent !== null) return "Answer the decision first.";
  if (active.journey.location !== "at_sea") return "Only at sea.";
  if (active.survival.status.kind !== "active") return "The ship cannot work the day.";
  return eastWestObservationRefusal(active.uncertainty, active.log);
}

const OBSERVATION_WORDS: Record<string, string> = {
  shoaling_water: "shoaling water, a coast within 200 nm",
  land_signs: "land signs, a coast within 600 nm",
  open_ocean: "open ocean, no coast within 900 nm",
};

/** One line per observation day, so the report can say why the band moved when it did. */
function observationHistoryLine(point: Readonly<ObservationHistoryPoint>): string {
  const what = OBSERVATION_WORDS[point.result] ?? point.result;
  const narrowed = point.eastWestUncertaintyAfterMnm < point.eastWestUncertaintyBeforeMnm
    ? `the east-west band closed from ${nauticalMiles(point.eastWestUncertaintyBeforeMnm)} to ${nauticalMiles(point.eastWestUncertaintyAfterMnm)}`
    : `the east-west band stayed at ${nauticalMiles(point.eastWestUncertaintyAfterMnm)} and the day bought nothing`;
  const moved = point.estimateCorrectionMnm === 0
    ? ""
    : `, and the reckoning shifted ${nauticalMiles(Math.abs(point.estimateCorrectionMnm))} ${point.estimateCorrectionMnm > 0 ? "east" : "west"}`;
  return `${point.date} — ${what}: ${narrowed}${moved}.`;
}

function missionProgress(active: Readonly<JourneyPlayerView>): MissionProgressViewModel {
  const objectiveAchieved = active.journey.objectiveAchieved;
  const returning = active.survival.expeditionIntent !== "pursue_objective";
  const usedCapeVerde = active.log.some((entry) => entry.type === "survival_action" && entry.result.kind === "left_cape_verde_port");
  let milestone: string;
  if (active.journey.outcome !== null) milestone = "Finalize the expedition";
  else if (active.journey.location === "cape") milestone = "Survey the Cape and gather evidence";
  else if (active.journey.location === "cape_verde") milestone = objectiveAchieved ? "Leave a copy of the report, or carry it home" : "Use the port, then choose the next leg";
  else if (objectiveAchieved || returning) milestone = "Return to Lisbon";
  else if (usedCapeVerde) milestone = "Find the Cape";
  else milestone = "Reach Cape Verde";
  const status = objectiveAchieved
    ? "Cape recognised. Now get the ship, or at least the report, home."
    : active.survival.expeditionIntent === "objective_abandoned"
      ? "The Cape is given up. Bring the ship or the report home."
      : "The Cape has not been recognised yet.";
  return { milestone, status };
}

function recordStakes(deposit: Readonly<CampaignPlayerView["depositedReport"]>): RecordStakesViewModel {
  const atRisk = deposit.unreportedFactCount;
  const findings = atRisk === 1 ? "1 finding rides" : `${atRisk} findings ride`;
  const copy = deposit.deposited
    ? `The copy left at Cape Verde on ${deposit.date} holds ${deposit.factCount}.`
    : "No copy has been left ashore.";
  if (atRisk === 0) {
    return {
      headline: deposit.deposited ? "A copy is safe ashore" : "Nothing yet to lose",
      detail: deposit.deposited
        ? `${copy} Nothing has been found since.`
        : "The crew has found nothing this voyage that the chart does not already hold.",
      atRisk,
      deposited: deposit.deposited,
    };
  }
  return {
    headline: `${findings} only aboard`,
    detail: `${copy} If the ship does not come home, ${deposit.deposited ? "the rest" : "they"} reach Lisbon as hearsay at best.`,
    atRisk,
    deposited: deposit.deposited,
  };
}

function buildExpedition(
  active: Readonly<JourneyPlayerView>,
  deposit: Readonly<CampaignPlayerView["depositedReport"]>,
): ExpeditionViewModel {
  const track = estimatedTrack(active);
  const safeLog = active.log.map(logEntry).reverse();
  const landmarkLabel = (id: string) => id.includes("cape-verde") ? "Cape Verde / Santiago"
    : id.includes("cape-goal") ? "Broad Cape goal region"
      : id.includes("lisbon") ? "Lisbon"
        : titleCase(id.replaceAll(".", " ").replaceAll("-", " "));
  const knownLandmarks = active.navigation.knownFacts.flatMap((fact) => fact.type === "landmark" ? [{
    id: fact.id,
    label: landmarkLabel(fact.id),
    xNm: kgToNm(fact.claimedPosition.xMnm),
    yNm: kgToNm(fact.claimedPosition.yMnm),
    confidence: fact.confidence,
    status: fact.status,
  }] : []);
  const knownCurrentStatements = active.navigation.knownFacts.flatMap((fact) => fact.type === "current" ? [
    `${titleCase(fact.id.replaceAll(".", " "))}: ${fact.status}, confidence ${fact.confidence}%. Claimed set ${kgToNm(fact.claimedVectorMnmPerDay.xMnm).toFixed(1)} nm east/west and ${kgToNm(fact.claimedVectorMnmPerDay.yMnm).toFixed(1)} nm north/south per day.`,
  ] : []);
  const observedWind = `${active.navigation.observedWind.strength} wind from ${active.navigation.observedWind.fromHeading ?? "variable"}`;
  return {
    mission: missionProgress(active),
    record: recordStakes(deposit),
    chart: {
      estimatedPosition: {
        day: active.committedDay,
        date: active.date,
        xNm: kgToNm(active.estimatedPosition.xMnm),
        yNm: kgToNm(active.estimatedPosition.yMnm),
      },
      estimatedTrack: track,
      uncertaintyEastWestNm: kgToNm(active.uncertainty.eastWestMnm),
      uncertaintyNorthSouthNm: kgToNm(active.uncertainty.northSouthMnm),
      heading: active.heading,
      knownLandmarks,
      observedWind,
      knownCurrentStatements,
    },
    deck: {
      date: active.date,
      elapsedDays: active.committedDay,
      location: titleCase(active.journey.location),
      stores: { ...active.stores },
      holdUsedKg: active.survival.allocatableHoldUsedKg,
      holdRemainingKg: active.survival.allocatableHoldRemainingKg,
      moneyDucats: active.moneyDucats,
      crew: { ...active.crew },
      ship: { ...active.ship },
      foulingSpeedLossBps: active.survival.foulingSpeedLossBps,
      warnings: active.survival.warnings.map((warning) => warning.message),
      observedWeather: titleCase(active.navigation.observedWeather),
      observedWind,
      heading: active.heading,
      sailingPolicy: active.sailingPolicy,
      rationPolicy: active.rationPolicy,
      expeditionIntent: titleCase(active.survival.expeditionIntent),
      expeditionIntentValue: active.survival.expeditionIntent,
      observationDaysSpent: active.journey.observationDaysSpent,
      lastObservation: lastObservationSummary(active),
      observationReason: observationBlockedReason(active),
    },
    log: safeLog,
    lastResult: safeLog[0] ?? null,
    headings: HEADINGS,
    sailingPolicies: SAILING_POLICIES,
    rationPolicies: RATION_POLICIES,
  };
}

function effectsDescription(effects: Readonly<EventEffects>): string {
  const values: string[] = [];
  const add = (value: number | undefined, label: string, divisor = 1, suffix = "") => {
    if (value !== undefined && value !== 0) values.push(`${value > 0 ? "+" : ""}${(value / divisor).toFixed(divisor === 1 ? 0 : 2)}${suffix} ${label}`);
  };
  add(effects.waterDeltaKg, "water", 1_000, " t");
  add(effects.provisionsDeltaKg, "provisions", 1_000, " t");
  add(effects.repairStoresDeltaKg, "repair stores", 1_000, " t");
  add(effects.medicineDeltaKg, "medicine", 1_000, " t");
  add(effects.moneyDeltaDucats, "ducats");
  add(effects.crewHealthDeltaBps, "crew health", 100, "%");
  add(effects.crewMoraleDeltaBps, "crew morale", 100, "%");
  for (const component of SHIP_COMPONENTS) {
    const key = `${component}DeltaBps` as keyof EventEffects;
    const value = effects[key];
    if (typeof value === "number") add(value, component, 100, "%");
  }
  if (effects.abandonObjective === true) values.push("objective abandoned");
  if (effects.terminalReason !== undefined) values.push("expedition ends");
  return values.length === 0 ? "No immediate change is promised." : values.join(", ");
}

function requirementDescription(requirement: Readonly<EventChoiceRequirement>): string {
  const values: string[] = [];
  if (requirement.minimumMoneyDucats !== undefined) values.push(`${requirement.minimumMoneyDucats} ducats`);
  if (requirement.minimumWaterKg !== undefined) values.push(`${(requirement.minimumWaterKg / 1_000).toFixed(2)} t water`);
  if (requirement.minimumProvisionsKg !== undefined) values.push(`${(requirement.minimumProvisionsKg / 1_000).toFixed(2)} t provisions`);
  if (requirement.minimumRepairStoresKg !== undefined) values.push(`${(requirement.minimumRepairStoresKg / 1_000).toFixed(2)} t repair stores`);
  if (requirement.minimumMedicineKg !== undefined) values.push(`${(requirement.minimumMedicineKg / 1_000).toFixed(2)} t medicine`);
  if (requirement.minimumMoraleBps !== undefined) values.push(`${(requirement.minimumMoraleBps / 100).toFixed(0)}% morale`);
  if ((requirement.requiredFlags?.length ?? 0) > 0) values.push("the prior preparation described in the event text");
  return values.length === 0 ? "nothing you do not already have." : `${values.join(", ")}.`;
}

function buildEventChoices(active: Readonly<JourneyPlayerView>): readonly ChoiceViewModel[] {
  const pending = active.journey.pendingEvent;
  if (pending === null) return [];
  const definition = AUTHORED_EVENTS.find((event) => event.id === pending.eventId);
  return pending.choices.map((choice) => {
    const authoredChoice = definition?.choices.find((item) => item.id === choice.id);
    return {
      id: choice.id,
      label: choice.label,
      available: choice.available,
      reason: choice.reason,
      knownConsequence: authoredChoice === undefined
        ? "The log will record what you chose."
        : `${authoredChoice.immediateLogText} Known immediate effects: ${effectsDescription(authoredChoice.effects)}`,
      knownRequirement: authoredChoice === undefined
        ? "nothing you do not already have."
        : requirementDescription(authoredChoice.requirement),
    };
  });
}

const FULL_CONDITION_BPS = 10_000;

function canRecogniseCapeFrom(active: Readonly<JourneyPlayerView>): boolean {
  return active.journey.location === "at_sea"
    && (active.navigation.landfall.kind === "visible_unrecognised"
      || (active.navigation.landfall.kind === "recognised"
        && active.navigation.landfall.landmarkId.includes("cape-goal")));
}

function canEnterCapeVerdeFrom(active: Readonly<JourneyPlayerView>): boolean {
  return active.journey.location === "at_sea"
    && active.navigation.landfall.kind === "recognised"
    && active.navigation.landfall.landmarkId.includes("cape-verde");
}

/**
 * Whether the deck-warning halt can offer the player anything today: a component that can
 * still be repaired with the repair stores aboard, or a course decision that only the halt
 * screen puts in front of them.
 */
function deckWarningHasResponse(active: Readonly<JourneyPlayerView>): boolean {
  const repairable = active.stores.repairStoresKg >= SURVIVAL_TUNING.repair.at_sea.repairStoresKg
    && SHIP_COMPONENTS.some((component) => shipComponentCondition(active.ship, component) < FULL_CONDITION_BPS);
  return repairable || canRecogniseCapeFrom(active) || canEnterCapeVerdeFrom(active);
}

/**
 * True when the only thing halting the ship is a warning with no response attached to it —
 * the day-45 spoilage warnings on a sound ship, most often. Halting for one of those puts a
 * screen of disabled buttons between the player and the next day, so the warning stays in
 * the standing warning strip instead. It halts again the day a response opens up, or the day
 * a further warning is raised.
 */
function isActionlessDeckWarning(active: Readonly<JourneyPlayerView>): boolean {
  return active.journey.pendingEvent === null
    && active.journey.outcome === null
    && active.journey.location === "at_sea"
    && active.navigation.interruption.kind === "none"
    && active.survival.status.kind === "active"
    && active.survival.interruption.kind === "warning"
    && !deckWarningHasResponse(active);
}

function buildInterrupt(
  active: Readonly<JourneyPlayerView>,
  deposit: Readonly<CampaignPlayerView["depositedReport"]>,
): InterruptViewModel | null {
  if (isActionlessDeckWarning(active)) return null;
  const pending = active.journey.pendingEvent;
  let kind: InterruptViewModel["kind"];
  let title: string;
  let description: string;
  if (active.journey.outcome !== null) {
    kind = "terminal";
    title = "The expedition is over";
    description = active.journey.outcome.reason;
  } else if (pending !== null) {
    kind = "event";
    title = pending.title;
    description = pending.text;
  } else if (active.journey.location === "cape_verde") {
    kind = "cape_verde";
    title = "Cape Verde — Porto da Ribeira Grande";
    description = "The port sells only what it has left. Resupply, rest the crew, repair, careen the hull, buy one rumour, or leave a copy of your report here for safekeeping.";
  } else if (active.journey.location === "cape") {
    kind = "cape";
    title = "The Cape";
    description = "You have recognised the Cape. Survey it, take on water if the chart says there is any, or start for home.";
  } else if (active.navigation.interruption.kind !== "none") {
    kind = "landfall";
    title = active.navigation.interruption.kind === "landfall" ? "Land in sight" : "The ship needs orders";
    description = active.navigation.interruption.kind === "landfall"
      ? `Land was sighted \u2014 ${titleCase(active.navigation.interruption.result)}.`
      : "Give an order before the next leg begins.";
  } else if (active.survival.interruption.kind !== "none" || active.survival.status.kind !== "active") {
    kind = "survival";
    title = "Trouble aboard";
    description = active.survival.status.kind === "active" ? "Something aboard needs attention before the ship sails on." : active.survival.status.message;
  } else {
    return null;
  }
  const capeWater = active.journey.knownFacts.find((fact) => fact.id === "fact.cape-water-source");
  return {
    kind,
    title,
    description,
    date: active.date,
    elapsedDays: active.committedDay,
    mission: missionProgress(active),
    record: recordStakes(deposit),
    lastResult: active.log.length === 0 ? null : logEntry(active.log.at(-1)!),
    choices: buildEventChoices(active),
    location: active.journey.location,
    stores: { ...active.stores },
    stock: active.survival.capeVerdeStock === null ? null : { ...active.survival.capeVerdeStock },
    moneyDucats: active.moneyDucats,
    ship: { ...active.ship },
    crew: { ...active.crew },
    careeningDaysCompleted: active.survival.careeningDaysCompleted,
    foulingSpeedLossBps: active.survival.foulingSpeedLossBps,
    rumourPurchased: active.journey.rumourPurchased,
    reportDeposited: deposit.deposited,
    capeSurveyDaysCompleted: active.journey.capeSurveyDaysCompleted,
    capeSurveyed: active.journey.surveyedLandmarkIds.length > 0,
    capeWaterKnown: capeWater !== undefined && capeWater.status !== "disproved" && capeWater.confidence >= 40,
    holdRemainingKg: active.survival.allocatableHoldRemainingKg,
    outcomeReason: active.journey.outcome?.reason ?? null,
    statusMessage: active.survival.status.kind === "active" ? null : active.survival.status.message,
    warnings: active.survival.warnings.map((warning) => warning.message),
    canRecogniseCape: canRecogniseCapeFrom(active),
    canEnterCapeVerde: canEnterCapeVerdeFrom(active),
    canDismiss: pending === null && active.journey.outcome === null
      && active.survival.status.kind === "active"
      && active.journey.location === "at_sea",
    survivalStatus: active.survival.status.kind,
    eventId: pending?.eventId ?? null,
  };
}

function metrics(report: Readonly<AfterActionReport>): readonly ReportMetricViewModel[] {
  const percent = (value: number) => `${(value / 100).toFixed(0)}%`;
  return [
    { label: "Crew count", starting: String(report.startingMetrics.crew.count), final: String(report.finalMetrics.crew.count) },
    { label: "Able crew", starting: String(report.startingMetrics.crew.able), final: String(report.finalMetrics.crew.able) },
    { label: "Crew health", starting: percent(report.startingMetrics.crew.healthBps), final: percent(report.finalMetrics.crew.healthBps) },
    { label: "Crew morale", starting: percent(report.startingMetrics.crew.moraleBps), final: percent(report.finalMetrics.crew.moraleBps) },
    ...SHIP_COMPONENTS.map((component) => ({
      label: titleCase(component),
      starting: percent(report.startingMetrics.ship[`${component}Bps` as keyof JourneyPlayerView["ship"]] as number),
      final: percent(report.finalMetrics.ship[`${component}Bps` as keyof JourneyPlayerView["ship"]] as number),
    })),
    ...STORE_KINDS.map((store) => {
      const key = `${store === "repair_stores" ? "repairStores" : store}Kg` as keyof StoresState;
      return {
        label: titleCase(store),
        starting: `${(report.startingMetrics.stores[key] / 1_000).toFixed(2)} t`,
        final: `${(report.finalMetrics.stores[key] / 1_000).toFixed(2)} t`,
      };
    }),
  ];
}

function reportTrack(points: Readonly<AfterActionReport["estimatedTrack"]>): readonly ChartPointViewModel[] {
  return points.map((point) => ({
    day: point.day,
    date: point.date,
    xNm: kgToNm(point.position.xMnm),
    yNm: kgToNm(point.position.yMnm),
  }));
}

function routeExplanations(
  history: Readonly<AfterActionReport>["currentContributionHistory"],
): readonly RouteExplanationViewModel[] {
  const lines: RouteExplanationViewModel[] = [];
  let fromDay: number | null = null;
  let toDay = 0;
  let dayCount = 0;
  const closeRun = () => {
    if (fromDay === null) return;
    lines.push({
      kind: "unexplained",
      fromDay,
      toDay,
      dayCount,
      text: dayCount === 1
        ? `Day ${fromDay}: route divergence unexplained.`
        : `Days ${fromDay}-${toDay}: route divergence unexplained (${dayCount} days).`,
    });
    fromDay = null;
    dayCount = 0;
  };
  for (const point of history) {
    if (point.explanation === "supported_by_reported_evidence") {
      closeRun();
      lines.push({
        kind: "supported",
        day: point.day,
        text: `Day ${point.day}: reported evidence supports a current contribution of ${kgToNm(point.vectorMnmPerDay.xMnm).toFixed(1)} nm east/west and ${kgToNm(point.vectorMnmPerDay.yMnm).toFixed(1)} nm north/south.`,
      });
      continue;
    }
    if (fromDay === null) fromDay = point.day;
    toDay = point.day;
    dayCount += 1;
  }
  closeRun();
  return lines;
}

/**
 * The honest one-liner for a voyage where the reported evidence explained none of the
 * divergence, so the section is not a list of one collapsed range.
 */
function routeExplanationSummary(lines: readonly RouteExplanationViewModel[]): string | null {
  if (lines.length === 0 || lines.some((line) => line.kind !== "unexplained")) return null;
  const total = lines.reduce((days, line) => days + (line.kind === "unexplained" ? line.dayCount : 0), 0);
  const first = lines[0]!;
  const last = lines.at(-1)!;
  if (first.kind !== "unexplained" || last.kind !== "unexplained") return null;
  return `No reported evidence explains the difference on any of the ${total} recorded ${total === 1 ? "day" : "days"}, day ${first.fromDay} to day ${last.toDay}.`;
}

function buildReport(report: Readonly<AfterActionReport>): ReportViewModel {
  const currentExplanations = routeExplanations(report.currentContributionHistory);
  const salvagedIds = new Set(report.factsSalvagedFromLog.map((fact) => fact.id));
  return {
    runNumber: report.runNumber,
    outcome: titleCase(report.outcome),
    reason: report.reason,
    departureDate: report.departureDate,
    finalDate: report.finalDate,
    elapsedDays: report.elapsedCommittedDays,
    objectiveStatus: titleCase(report.objectiveStatus),
    metrics: metrics(report),
    waterConsumedKg: report.waterConsumedKg,
    provisionsConsumedKg: report.provisionsConsumedKg,
    factsObserved: report.factsObserved.map(campaignFactView),
    factsReported: report.factsReported.map(campaignFactView),
    factsDisproved: report.factsDisproved.map(campaignFactView),
    factsLost: report.factsLostWithShip
      .filter((fact) => !salvagedIds.has(fact.id))
      .map(campaignFactView),
    factsSalvaged: report.factsSalvagedFromLog.map(campaignFactView),
    reportSnapshotDay: report.reportSnapshotDay,
    estimatedTrack: reportTrack(report.estimatedTrack),
    trueTrack: reportTrack(report.trueTrack),
    uncertaintyHistory: report.uncertaintyHistory.map((point) => ({
      day: point.day,
      eastWestNm: kgToNm(point.uncertainty.eastWestMnm),
      northSouthNm: kgToNm(point.uncertainty.northSouthMnm),
      errorEastWestNm: kgToNm(point.errorMnm.xMnm),
      errorNorthSouthNm: kgToNm(point.errorMnm.yMnm),
    })),
    currentExplanations,
    currentExplanationSummary: routeExplanationSummary(currentExplanations),
    observations: report.observationHistory.map((point) => ({
      day: point.day,
      text: observationHistoryLine(point),
    })),
    inheritedDifferences: report.nextExpeditionDifferences.map((change) => campaignFactView(change.after)),
  };
}

export interface AppViewBuildOptions {
  readonly savePreview: SafeSavePreview;
  readonly selectedPanel: ExpeditionPanel;
  readonly animationMode: AnimationMode;
  readonly isAdvancing: boolean;
  readonly announcement: string;
  readonly error: string | null;
  readonly forceExpedition: boolean;
}

export function buildAppViewModel(
  campaign: Readonly<CampaignPlayerView>,
  options: Readonly<AppViewBuildOptions>,
): AppViewModel {
  const active = campaign.activeRun;
  const activeInterrupt = active === null ? null : buildInterrupt(active, campaign.depositedReport);
  let screen: ProductScreen;
  if (active === null) {
    screen = campaign.afterActionReports.length > 0 ? "after_action" : "outfitting";
  } else if (active.survival.lifecycle === "outfitting") {
    screen = "outfitting";
  } else if (activeInterrupt !== null && !options.forceExpedition) {
    screen = "interrupt";
  } else {
    screen = "expedition";
  }
  const latestReport = screen === "after_action" ? campaign.afterActionReports.at(-1) ?? null : null;
  return {
    screen,
    savePreview: options.savePreview,
    selectedPanel: options.selectedPanel,
    animationMode: options.animationMode,
    isAdvancing: options.isAdvancing,
    announcement: options.announcement,
    error: options.error,
    outfitting: screen === "outfitting" ? {
      allocation: active?.stores ?? { waterKg: 0, provisionsKg: 0, repairStoresKg: 0, medicineKg: 0 },
      tuning: SURVIVAL_TUNING,
      validation: validateOutfitting(active?.stores ?? { waterKg: 0, provisionsKg: 0, repairStoresKg: 0, medicineKg: 0 }),
      inheritedFacts: campaign.inheritedReportedFacts.map(campaignFactView),
      priorRuns: campaign.priorRunSummaries.map(runSummaryView),
      campaignReady: active !== null,
    } : null,
    expedition: active === null || (screen !== "expedition" && screen !== "interrupt")
      ? null
      : buildExpedition(active, campaign.depositedReport),
    interrupt: screen === "interrupt" ? activeInterrupt : null,
    report: latestReport === null ? null : buildReport(latestReport),
  };
}

export function hasBlockingInterruption(view: Readonly<CampaignPlayerView>): boolean {
  const active = view.activeRun;
  if (active !== null && isActionlessDeckWarning(active)) return false;
  return active === null
    || active.journey.pendingEvent !== null
    || active.journey.outcome !== null
    || active.navigation.interruption.kind !== "none"
    || active.survival.interruption.kind !== "none"
    || active.survival.status.kind !== "active"
    || active.journey.location !== "at_sea";
}

export function shipComponentCondition(ship: Readonly<JourneyPlayerView["ship"]>, component: ShipComponent): number {
  return ship[`${component}Bps` as keyof JourneyPlayerView["ship"]] as number;
}
