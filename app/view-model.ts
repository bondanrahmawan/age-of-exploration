import {
  AUTHORED_EVENTS,
  HEADINGS,
  SAILING_POLICIES,
  RATION_POLICIES,
  SHIP_COMPONENTS,
  STORE_KINDS,
  SURVIVAL_TUNING,
  lisbonOutfittingCost,
  type AfterActionReport,
  type CampaignFact,
  type CampaignPlayerView,
  type CampaignRunSummary,
  type CanonicalLogEntry,
  type EventEffects,
  type EventChoiceRequirement,
  type Heading,
  type JourneyPlayerView,
  type RationPolicy,
  type SailingPolicy,
  type StoreKind,
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
}

export interface LogEntryViewModel {
  readonly index: number;
  readonly day: number;
  readonly title: string;
  readonly text: string;
}

export interface ExpeditionViewModel {
  readonly chart: ChartViewModel;
  readonly deck: DeckViewModel;
  readonly log: readonly LogEntryViewModel[];
  readonly headings: typeof HEADINGS;
  readonly sailingPolicies: typeof SAILING_POLICIES;
  readonly rationPolicies: typeof RATION_POLICIES;
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
  readonly currentExplanations: readonly string[];
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
  };
}

export function validateOutfitting(allocation: Readonly<StoresState>): OutfittingValidation {
  const storeErrors: Partial<Record<StoreKind, string>> = {};
  for (const store of STORE_KINDS) {
    const key = `${store === "repair_stores" ? "repairStores" : store}Kg` as keyof StoresState;
    const quantity = allocation[key];
    const cap = SURVIVAL_TUNING.stores[store].capKg;
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      storeErrors[store] = "Enter a non-negative quantity in whole kilograms.";
    } else if (quantity > cap) {
      storeErrors[store] = `Lisbon stock and ship cap: ${(cap / 1_000).toFixed(1)} t.`;
    }
  }
  const allocatableHoldUsedKg = Object.values(allocation).reduce((total, quantity) => total + quantity, 0);
  const capacityError = allocatableHoldUsedKg > SURVIVAL_TUNING.hold.allocatableKg
    ? `Allocation exceeds the 52.0 t available hold by ${((allocatableHoldUsedKg - SURVIVAL_TUNING.hold.allocatableKg) / 1_000).toFixed(1)} t.`
    : null;
  let costDucats = Number.MAX_SAFE_INTEGER;
  if (Object.keys(storeErrors).length === 0) costDucats = lisbonOutfittingCost(allocation);
  const moneyError = costDucats > SURVIVAL_TUNING.sponsorAdvanceDucats
    ? `Allocation costs ${costDucats} ducats; the sponsor advance is ${SURVIVAL_TUNING.sponsorAdvanceDucats}.`
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

function logEntry(entry: Readonly<CanonicalLogEntry>): LogEntryViewModel {
  if (entry.type === "command") {
    return { index: entry.index, day: entry.committedDay, title: titleCase(entry.command), text: `Order changed to ${titleCase(entry.value)}.` };
  }
  if (entry.type === "survival_action") {
    return { index: entry.index, day: entry.committedDay, title: titleCase(entry.result.kind), text: `The ${titleCase(entry.result.kind)} command was committed.` };
  }
  if (entry.type === "journey_action") {
    return { index: entry.index, day: entry.committedDay, title: titleCase(entry.result.kind), text: entry.text };
  }
  const weather = "observedWeather" in entry ? titleCase(entry.observedWeather) : "Fair";
  const activity = "activity" in entry ? titleCase(entry.activity.kind) : "Sailing";
  const event = "event" in entry && entry.event !== "none" ? ` ${entry.event.title}: ${entry.event.text}` : "";
  const consequences = "delayedConsequences" in entry && entry.delayedConsequences.length > 0
    ? ` ${entry.delayedConsequences.map((item) => item.text).join(" ")}`
    : "";
  return {
    index: entry.index,
    day: entry.committedDay,
    title: `${entry.date} — ${activity}`,
    text: `${weather}. Water used ${(entry.waterConsumedKg / 1_000).toFixed(3)} t; provisions used ${(entry.provisionsConsumedKg / 1_000).toFixed(3)} t.${event}${consequences}`,
  };
}

function buildExpedition(active: Readonly<JourneyPlayerView>): ExpeditionViewModel {
  const track = estimatedTrack(active);
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
    },
    log: active.log.map(logEntry).reverse(),
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
  return values.length === 0 ? "No immediate numeric change is promised." : values.join(", ");
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
  return values.length === 0 ? "No additional minimum resource requirement." : `Requires ${values.join(", ")}.`;
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
        ? "The written log will record the committed decision."
        : `${authoredChoice.immediateLogText} Known immediate effects: ${effectsDescription(authoredChoice.effects)}`,
      knownRequirement: authoredChoice === undefined
        ? "No additional minimum resource requirement is shown."
        : requirementDescription(authoredChoice.requirement),
    };
  });
}

function buildInterrupt(active: Readonly<JourneyPlayerView>, reportDeposited: boolean): InterruptViewModel | null {
  const pending = active.journey.pendingEvent;
  let kind: InterruptViewModel["kind"];
  let title: string;
  let description: string;
  if (active.journey.outcome !== null) {
    kind = "terminal";
    title = "Expedition ended";
    description = active.journey.outcome.reason;
  } else if (pending !== null) {
    kind = "event";
    title = pending.title;
    description = pending.text;
  } else if (active.journey.location === "cape_verde") {
    kind = "cape_verde";
    title = "Cape Verde — Porto da Ribeira Grande";
    description = "Resupply from finite stock, rest, repair, careen, buy one rumour, or deposit the carried report.";
  } else if (active.journey.location === "cape") {
    kind = "cape";
    title = "The Cape objective";
    description = "The landfall is recognised. Survey, collect water where evidence permits, or begin the return leg.";
  } else if (active.navigation.interruption.kind !== "none") {
    kind = "landfall";
    title = active.navigation.interruption.kind === "landfall" ? "Landfall decision" : "Navigation interrupted";
    description = active.navigation.interruption.kind === "landfall"
      ? `The latest landfall result is ${titleCase(active.navigation.interruption.result)}.`
      : "Navigation requires attention before the next leg.";
  } else if (active.survival.interruption.kind !== "none" || active.survival.status.kind !== "active") {
    kind = "survival";
    title = "Deck warning";
    description = active.survival.status.kind === "active" ? "A visible warning requires attention." : active.survival.status.message;
  } else {
    return null;
  }
  const capeWater = active.journey.knownFacts.find((fact) => fact.id === "fact.cape-water-source");
  return {
    kind,
    title,
    description,
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
    reportDeposited,
    capeSurveyDaysCompleted: active.journey.capeSurveyDaysCompleted,
    capeSurveyed: active.journey.surveyedLandmarkIds.length > 0,
    capeWaterKnown: capeWater !== undefined && capeWater.status !== "disproved" && capeWater.confidence >= 40,
    holdRemainingKg: active.survival.allocatableHoldRemainingKg,
    outcomeReason: active.journey.outcome?.reason ?? null,
    statusMessage: active.survival.status.kind === "active" ? null : active.survival.status.message,
    warnings: active.survival.warnings.map((warning) => warning.message),
    canRecogniseCape: active.navigation.landfall.kind === "visible_unrecognised"
      || (active.navigation.landfall.kind === "recognised"
        && active.navigation.landfall.landmarkId.includes("cape-goal")),
    canEnterCapeVerde: active.navigation.landfall.kind === "recognised"
      && active.navigation.landfall.landmarkId.includes("cape-verde"),
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

function buildReport(report: Readonly<AfterActionReport>): ReportViewModel {
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
    factsLost: report.factsLostWithShip.map(campaignFactView),
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
    currentExplanations: report.currentContributionHistory.map((point) => point.explanation === "supported_by_reported_evidence"
      ? `Day ${point.day}: reported evidence supports a current contribution of ${kgToNm(point.vectorMnmPerDay.xMnm).toFixed(1)} nm east/west and ${kgToNm(point.vectorMnmPerDay.yMnm).toFixed(1)} nm north/south.`
      : `Day ${point.day}: route divergence remains unexplained.`),
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
  const activeInterrupt = active === null ? null : buildInterrupt(active, campaign.depositedReport.deposited);
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
    expedition: active === null || (screen !== "expedition" && screen !== "interrupt") ? null : buildExpedition(active),
    interrupt: screen === "interrupt" ? activeInterrupt : null,
    report: latestReport === null ? null : buildReport(latestReport),
  };
}

export function hasBlockingInterruption(view: Readonly<CampaignPlayerView>): boolean {
  const active = view.activeRun;
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
