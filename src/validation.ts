import { assertIsoDate, daysBetweenIsoDates } from "./date.js";
import { SimulationValidationError } from "./errors.js";
import {
  SURVIVAL_TUNING,
  assertStoreCapsAndHold,
  batchTotalKg,
  holdUsedKg,
} from "./survival.js";
import {
  DAY_PHASE_ORDER,
  EXPEDITION_INTENTS,
  HEADINGS,
  NAVIGATION_FACT_STATUSES,
  NAVIGATION_STATE_FORMAT,
  PRNG_ALGORITHM,
  RATION_POLICIES,
  SAILING_POLICIES,
  SHIP_COMPONENTS,
  STATE_FORMAT,
  STORE_KINDS,
  SURVIVAL_LOCATIONS,
  SURVIVAL_STATE_FORMAT,
  SURVIVAL_WARNING_CODES,
  WEATHER_KINDS,
  type CanonicalLogEntry,
  type DailyEnvironment,
  type Heading,
  type NavigationFact,
  type PositionMnm,
  type PrngState,
  type RationPolicy,
  type SailingPolicy,
  type SimulationCommand,
  type SimulationState,
  type StoreBatch,
  type SurvivalInterrupt,
  type SurvivalStatus,
  type SurvivalWarning,
} from "./types.js";
import { ALLOCATABLE_HOLD_KG, CONDITION_MAX_BPS } from "./units.js";

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new SimulationValidationError(message);
}

function assertRecord(value: unknown, label: string): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(record: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} must contain exactly: ${wanted.join(", ")}`);
  }
}

function assertString(value: unknown, label: string, maximumLength = 256): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) {
    fail(`${label} must contain 1 to ${maximumLength} characters`);
  }
}

function assertInteger(
  value: unknown,
  label: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`${label} must be a safe integer from ${minimum} to ${maximum}`);
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${label} must be one of: ${allowed.join(", ")}`);
  }
}

function assertPosition(value: unknown, label: string): asserts value is PositionMnm {
  assertRecord(value, label);
  assertExactKeys(value, ["xMnm", "yMnm"], label);
  assertInteger(value["xMnm"], `${label}.xMnm`, -1_000_000_000, 1_000_000_000);
  assertInteger(value["yMnm"], `${label}.yMnm`, -1_000_000_000, 1_000_000_000);
}

function assertUncertainty(value: unknown, label: string): void {
  assertRecord(value, label);
  assertExactKeys(value, ["eastWestMnm", "northSouthMnm"], label);
  assertInteger(value["eastWestMnm"], `${label}.eastWestMnm`, 0, 1_000_000_000);
  assertInteger(value["northSouthMnm"], `${label}.northSouthMnm`, 0, 1_000_000_000);
}

function assertCrew(value: unknown): void {
  assertRecord(value, "crew");
  assertExactKeys(value, ["count", "able", "healthBps", "moraleBps"], "crew");
  assertInteger(value["count"], "crew.count", 0, 500);
  assertInteger(value["able"], "crew.able", 0, value["count"] as number);
  assertInteger(value["healthBps"], "crew.healthBps", 0, CONDITION_MAX_BPS);
  assertInteger(value["moraleBps"], "crew.moraleBps", 0, CONDITION_MAX_BPS);
}

function assertStores(value: unknown): void {
  assertRecord(value, "stores");
  assertExactKeys(value, ["waterKg", "provisionsKg", "repairStoresKg", "medicineKg"], "stores");
  const keys = ["waterKg", "provisionsKg", "repairStoresKg", "medicineKg"] as const;
  for (const key of keys) {
    assertInteger(value[key], `stores.${key}`, 0, ALLOCATABLE_HOLD_KG);
  }
  const total = keys.reduce((sum, key) => sum + (value[key] as number), 0);
  if (total > ALLOCATABLE_HOLD_KG) {
    fail(`stores exceed the ${ALLOCATABLE_HOLD_KG} kg allocatable hold`);
  }
}

function assertShip(value: unknown): void {
  assertRecord(value, "ship");
  assertExactKeys(value, ["hullBps", "mastBps", "sailsBps", "rudderBps"], "ship");
  for (const key of ["hullBps", "mastBps", "sailsBps", "rudderBps"] as const) {
    assertInteger(value[key], `ship.${key}`, 0, CONDITION_MAX_BPS);
  }
}

export function assertPrngState(value: unknown): asserts value is PrngState {
  assertRecord(value, "prng");
  assertExactKeys(value, ["algorithm", "words"], "prng");
  if (value["algorithm"] !== PRNG_ALGORITHM) {
    fail(`prng.algorithm must be ${PRNG_ALGORITHM}`);
  }
  const words = value["words"];
  if (!Array.isArray(words) || words.length !== 4) {
    fail("prng.words must contain exactly four uint32 values");
  }
  for (let index = 0; index < words.length; index += 1) {
    assertInteger(words[index], `prng.words[${index}]`, 0, 0xffff_ffff);
  }
  if (words.every((word) => word === 0)) {
    fail("prng.words may not be all zero");
  }
}

export function assertSimulationCommand(value: unknown): asserts value is SimulationCommand {
  assertRecord(value, "command");
  const type = value["type"];
  if (type === "set_heading") {
    assertExactKeys(value, ["type", "heading"], "set_heading command");
    assertEnum(value["heading"], HEADINGS, "command.heading");
    return;
  }
  if (type === "set_sailing_policy") {
    assertExactKeys(value, ["type", "policy"], "set_sailing_policy command");
    assertEnum(value["policy"], SAILING_POLICIES, "command.policy");
    return;
  }
  if (type === "set_ration_policy") {
    assertExactKeys(value, ["type", "policy"], "set_ration_policy command");
    assertEnum(value["policy"], RATION_POLICIES, "command.policy");
    return;
  }
  if (type === "advance_day") {
    assertExactKeys(value, ["type"], "advance_day command");
    return;
  }
  if (type === "set_lisbon_outfitting") {
    assertExactKeys(value, ["type", "allocation"], "set_lisbon_outfitting command");
    assertStores(value["allocation"]);
    try {
      assertStoreCapsAndHold(value["allocation"] as unknown as Parameters<typeof assertStoreCapsAndHold>[0]);
    } catch (error) {
      fail(error instanceof Error ? error.message : "outfitting allocation is invalid");
    }
    return;
  }
  if (
    type === "depart_lisbon"
    || type === "enter_cape_verde_port"
    || type === "leave_cape_verde_port"
    || type === "rest_at_cape_verde"
    || type === "careen_day_at_cape_verde"
  ) {
    assertExactKeys(value, ["type"], `${type} command`);
    return;
  }
  if (type === "purchase_at_cape_verde") {
    assertExactKeys(value, ["type", "store", "quantityKg"], "purchase_at_cape_verde command");
    assertEnum(value["store"], STORE_KINDS, "command.store");
    assertInteger(value["quantityKg"], "command.quantityKg", 1, ALLOCATABLE_HOLD_KG);
    return;
  }
  if (type === "repair_day") {
    assertExactKeys(value, ["type", "component", "location"], "repair_day command");
    assertEnum(value["component"], SHIP_COMPONENTS, "command.component");
    assertEnum(value["location"], ["at_sea", "cape_verde"] as const, "command.location");
    return;
  }
  if (type === "set_expedition_intent") {
    assertExactKeys(value, ["type", "intent"], "set_expedition_intent command");
    assertEnum(value["intent"], EXPEDITION_INTENTS, "command.intent");
    return;
  }
  fail("command.type is unknown");
}

export function copyCommand(command: Readonly<SimulationCommand>): SimulationCommand {
  switch (command.type) {
    case "set_heading":
      return { type: command.type, heading: command.heading };
    case "set_sailing_policy":
      return { type: command.type, policy: command.policy };
    case "set_ration_policy":
      return { type: command.type, policy: command.policy };
    case "advance_day":
      return { type: command.type };
    case "set_lisbon_outfitting":
      return { type: command.type, allocation: { ...command.allocation } };
    case "depart_lisbon":
    case "enter_cape_verde_port":
    case "leave_cape_verde_port":
    case "rest_at_cape_verde":
    case "careen_day_at_cape_verde":
      return { type: command.type };
    case "purchase_at_cape_verde":
      return { type: command.type, store: command.store, quantityKg: command.quantityKg };
    case "repair_day":
      return { type: command.type, component: command.component, location: command.location };
    case "set_expedition_intent":
      return { type: command.type, intent: command.intent };
  }
}

function assertObservedWind(value: unknown, label: string): void {
  assertRecord(value, label);
  assertExactKeys(value, ["directionConvention", "fromHeading", "strength"], label);
  if (value["directionConvention"] !== "from") fail(`${label}.directionConvention must be from`);
  if (value["fromHeading"] !== null) assertEnum(value["fromHeading"], HEADINGS, `${label}.fromHeading`);
  assertEnum(value["strength"], ["calm", "moderate", "strong"] as const, `${label}.strength`);
  if ((value["strength"] === "calm") !== (value["fromHeading"] === null)) {
    fail(`${label} calm strength and null heading must agree`);
  }
}

function assertObservation(value: unknown, label: string): void {
  assertRecord(value, label);
  const kind = value["kind"];
  if (kind === "none" || kind === "overcast_no_sight") {
    assertExactKeys(value, ["kind"], label);
    return;
  }
  if (kind === "clear_noon") {
    assertExactKeys(value, ["kind", "northSouthUncertaintyMnm"], label);
    if (value["northSouthUncertaintyMnm"] !== 15_000) fail(`${label} clear sight must reset to 15000 mnm`);
    return;
  }
  if (kind === "heavy_swell_noon") {
    assertExactKeys(value, ["kind", "northSouthUncertaintyMnm"], label);
    if (value["northSouthUncertaintyMnm"] !== 40_000) fail(`${label} heavy swell must reset to 40000 mnm`);
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertLandfall(value: unknown, label: string): void {
  assertRecord(value, label);
  const kind = value["kind"];
  if (kind === "none") {
    assertExactKeys(value, ["kind"], label);
    return;
  }
  if (kind === "visible_unrecognised") {
    assertExactKeys(value, ["kind", "knownFactId"], label);
    if (value["knownFactId"] !== null) assertString(value["knownFactId"], `${label}.knownFactId`, 128);
    return;
  }
  if (kind === "recognised" || kind === "missed") {
    assertExactKeys(value, ["kind", "landmarkId"], label);
    assertString(value["landmarkId"], `${label}.landmarkId`, 128);
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertInterrupt(value: unknown, label: string): void {
  assertRecord(value, label);
  if (value["kind"] === "none") {
    assertExactKeys(value, ["kind"], label);
    return;
  }
  if (value["kind"] === "landfall") {
    assertExactKeys(value, ["kind", "result"], label);
    assertEnum(
      value["result"],
      ["visible_unrecognised", "recognised", "missed"] as const,
      `${label}.result`,
    );
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertSurvivalWarning(value: unknown, label: string): asserts value is SurvivalWarning {
  assertRecord(value, label);
  assertExactKeys(value, ["code", "firstCommittedDay", "message"], label);
  assertEnum(value["code"], SURVIVAL_WARNING_CODES, `${label}.code`);
  assertInteger(value["firstCommittedDay"], `${label}.firstCommittedDay`, 0, 1_000_000);
  assertString(value["message"], `${label}.message`, 512);
}

function assertSurvivalWarnings(value: unknown, label: string): asserts value is readonly SurvivalWarning[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const codes = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const warning = value[index];
    assertSurvivalWarning(warning, `${label}[${index}]`);
    if (codes.has(warning.code)) fail(`${label} contains duplicate warning ${warning.code}`);
    codes.add(warning.code);
  }
}

function assertSurvivalStatus(value: unknown, label: string): asserts value is SurvivalStatus {
  assertRecord(value, label);
  if (value["kind"] === "active") {
    assertExactKeys(value, ["kind", "message"], label);
    if (value["message"] !== "Expedition remains active.") {
      fail(`${label}.message must use the canonical active wording`);
    }
    return;
  }
  if (value["kind"] === "stranded") {
    assertExactKeys(value, ["kind", "reason", "message"], label);
    assertEnum(
      value["reason"],
      ["hull_danger", "mast_disabled", "sails_disabled", "rudder_disabled", "insufficient_able_crew"] as const,
      `${label}.reason`,
    );
    assertString(value["message"], `${label}.message`, 512);
    return;
  }
  if (value["kind"] === "terminal") {
    assertExactKeys(value, ["kind", "reason", "message"], label);
    assertEnum(
      value["reason"],
      ["ship_lost", "crew_unable_to_continue"] as const,
      `${label}.reason`,
    );
    assertString(value["message"], `${label}.message`, 512);
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertSurvivalInterrupt(value: unknown, label: string): asserts value is SurvivalInterrupt {
  assertRecord(value, label);
  if (value["kind"] === "none") {
    assertExactKeys(value, ["kind"], label);
    return;
  }
  if (value["kind"] === "warning") {
    assertExactKeys(value, ["kind", "warnings"], label);
    if (!Array.isArray(value["warnings"]) || value["warnings"].length === 0) {
      fail(`${label}.warnings must be a non-empty array`);
    }
    for (const code of value["warnings"]) assertEnum(code, SURVIVAL_WARNING_CODES, `${label}.warnings`);
    return;
  }
  if (value["kind"] === "stranded") {
    assertExactKeys(value, ["kind", "reason", "availableResponses"], label);
    assertEnum(
      value["reason"],
      ["hull_danger", "mast_disabled", "sails_disabled", "rudder_disabled", "insufficient_able_crew"] as const,
      `${label}.reason`,
    );
    if (!Array.isArray(value["availableResponses"])) fail(`${label}.availableResponses must be an array`);
    for (const response of value["availableResponses"]) {
      assertEnum(response, ["repair", "distress", "abandon_objective"] as const, `${label}.availableResponses`);
    }
    return;
  }
  if (value["kind"] === "terminal") {
    assertExactKeys(value, ["kind", "reason"], label);
    assertEnum(value["reason"], ["ship_lost", "crew_unable_to_continue"] as const, `${label}.reason`);
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertStoreBatch(value: unknown, label: string, expectedStore: "water" | "provisions"): asserts value is StoreBatch {
  assertRecord(value, label);
  assertExactKeys(value, ["id", "store", "source", "acquiredDate", "remainingKg"], label);
  assertString(value["id"], `${label}.id`, 128);
  if (!/^batch\.\d{6}$/.test(value["id"])) fail(`${label}.id must use batch.NNNNNN`);
  if (value["store"] !== expectedStore) fail(`${label}.store must be ${expectedStore}`);
  assertEnum(value["source"], ["lisbon", "cape_verde"] as const, `${label}.source`);
  assertIsoDate(value["acquiredDate"], `${label}.acquiredDate`);
  assertInteger(value["remainingKg"], `${label}.remainingKg`, 1, ALLOCATABLE_HOLD_KG);
}

function assertBatches(value: unknown, date: string, lifecycle: "outfitting" | "underway"): void {
  assertRecord(value, "survival.batches");
  assertExactKeys(value, ["water", "provisions"], "survival.batches");
  const ids = new Set<string>();
  for (const store of ["water", "provisions"] as const) {
    const batches = value[store];
    if (!Array.isArray(batches)) fail(`survival.batches.${store} must be an array`);
    let previousDate = "0001-01-01";
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      assertStoreBatch(batch, `survival.batches.${store}[${index}]`, store);
      if (daysBetweenIsoDates(batch.acquiredDate, date) < 0) fail("batch date is in the future");
      if (batch.acquiredDate < previousDate) fail(`survival.batches.${store} must be oldest first`);
      previousDate = batch.acquiredDate;
      if (ids.has(batch.id)) fail(`survival batch id ${batch.id} is duplicated`);
      ids.add(batch.id);
    }
    if (lifecycle === "outfitting" && batches.length > 0) {
      fail("outfitting state may not contain dated store batches before departure");
    }
  }
}

function assertSurvivalState(value: unknown, date: string, stores: unknown, crew: unknown, ship: unknown): void {
  assertRecord(value, "survival");
  assertExactKeys(
    value,
    [
      "lifecycle", "location", "batches", "nextBatchSequence", "capeVerdeStock",
      "foulingSpeedLossBps", "careeningDaysCompleted", "warnings",
      "zeroWaterPressureDays", "zeroProvisionPressureDays", "status", "interruption",
      "expeditionIntent",
    ],
    "survival",
  );
  assertEnum(value["lifecycle"], ["outfitting", "underway"] as const, "survival.lifecycle");
  assertEnum(value["location"], SURVIVAL_LOCATIONS, "survival.location");
  if (value["lifecycle"] === "outfitting" && value["location"] !== "lisbon") {
    fail("outfitting state must be at Lisbon");
  }
  if (value["lifecycle"] === "underway" && value["location"] === "lisbon") {
    fail("WP2 underway state cannot re-enter Lisbon before WP3 outcomes");
  }
  assertBatches(value["batches"], date, value["lifecycle"]);
  assertInteger(value["nextBatchSequence"], "survival.nextBatchSequence", 0, 1_000_000);
  const sequencedBatches = value["batches"] as unknown as { water: StoreBatch[]; provisions: StoreBatch[] };
  const maximumSequence = [...sequencedBatches.water, ...sequencedBatches.provisions].reduce(
    (maximum, batch) => Math.max(maximum, Number(batch.id.slice("batch.".length))),
    -1,
  );
  if ((value["nextBatchSequence"] as number) <= maximumSequence) {
    fail("survival.nextBatchSequence must exceed every persisted batch id");
  }
  assertStores(value["capeVerdeStock"]);
  const stock = value["capeVerdeStock"] as unknown as { waterKg: number; provisionsKg: number; repairStoresKg: number; medicineKg: number };
  if (
    stock.waterKg > SURVIVAL_TUNING.stores.water.capeVerdeStockKg
    || stock.provisionsKg > SURVIVAL_TUNING.stores.provisions.capeVerdeStockKg
    || stock.repairStoresKg > SURVIVAL_TUNING.stores.repair_stores.capeVerdeStockKg
    || stock.medicineKg > SURVIVAL_TUNING.stores.medicine.capeVerdeStockKg
  ) fail("Cape Verde stock exceeds its one-expedition allocation");
  assertInteger(
    value["foulingSpeedLossBps"],
    "survival.foulingSpeedLossBps",
    0,
    SURVIVAL_TUNING.fouling.maximumSpeedLossBps,
  );
  assertInteger(
    value["careeningDaysCompleted"],
    "survival.careeningDaysCompleted",
    0,
    SURVIVAL_TUNING.fouling.careeningDays - 1,
  );
  if (value["location"] !== "cape_verde" && value["careeningDaysCompleted"] !== 0) {
    fail("careening progress may exist only at Cape Verde");
  }
  assertSurvivalWarnings(value["warnings"], "survival.warnings");
  assertInteger(value["zeroWaterPressureDays"], "survival.zeroWaterPressureDays", 0, 1_000_000);
  assertInteger(value["zeroProvisionPressureDays"], "survival.zeroProvisionPressureDays", 0, 1_000_000);
  assertSurvivalStatus(value["status"], "survival.status");
  assertSurvivalInterrupt(value["interruption"], "survival.interruption");
  assertEnum(value["expeditionIntent"], EXPEDITION_INTENTS, "survival.expeditionIntent");

  assertCrew(crew);
  assertShip(ship);
  const crewState = crew as unknown as { count: number; able: number; healthBps: number; moraleBps: number };
  const shipState = ship as unknown as { hullBps: number; mastBps: number; sailsBps: number; rudderBps: number };
  const status = value["status"] as SurvivalStatus;
  const disabledReason = shipState.hullBps === 0
    ? "hull_danger"
    : shipState.mastBps === 0
      ? "mast_disabled"
      : shipState.sailsBps === 0
        ? "sails_disabled"
        : shipState.rudderBps === 0
          ? "rudder_disabled"
          : crewState.able < SURVIVAL_TUNING.crew.minimumAbleToMakeWay
            ? "insufficient_able_crew"
            : null;
  if (status.kind === "active" && (crewState.healthBps === 0 || disabledReason !== null)) {
    fail("active survival status requires a living crew pool and sailing capability");
  }
  if (status.kind === "stranded" && status.reason !== disabledReason) {
    fail("stranded survival status must match the current sailing incapacity");
  }
  if (status.kind === "terminal") {
    if (status.reason === "crew_unable_to_continue" && crewState.healthBps !== 0) {
      fail("crew-unable terminal status requires zero pooled health");
    }
    if (status.reason === "ship_lost" && shipState.hullBps !== 0) {
      fail("ship-lost terminal status requires zero hull condition");
    }
  }
  const interruption = value["interruption"] as SurvivalInterrupt;
  if (status.kind === "terminal" && (interruption.kind !== "terminal" || interruption.reason !== status.reason)) {
    fail("terminal survival interruption must match terminal status");
  }
  if (status.kind === "stranded" && (interruption.kind !== "stranded" || interruption.reason !== status.reason)) {
    fail("stranded survival interruption must match stranded status");
  }
  if (status.kind === "active" && (interruption.kind === "terminal" || interruption.kind === "stranded")) {
    fail("active survival status cannot expose a terminal or stranded interruption");
  }

  assertRecord(stores, "stores");
  try {
    assertStoreCapsAndHold(stores as unknown as Parameters<typeof assertStoreCapsAndHold>[0]);
  } catch (error) {
    fail(error instanceof Error ? error.message : "survival stores are invalid");
  }
  const batches = sequencedBatches;
  if (value["lifecycle"] === "underway") {
    if (batchTotalKg(batches.water) !== stores["waterKg"]) fail("water batch total must equal stores.waterKg");
    if (batchTotalKg(batches.provisions) !== stores["provisionsKg"]) {
      fail("provision batch total must equal stores.provisionsKg");
    }
  }
  if (holdUsedKg(stores as unknown as Parameters<typeof holdUsedKg>[0]) > ALLOCATABLE_HOLD_KG) {
    fail("survival stores exceed allocatable hold");
  }
}

export function assertNavigationFact(value: unknown, label = "navigation fact"): asserts value is NavigationFact {
  assertRecord(value, label);
  assertString(value["id"], `${label}.id`, 128);
  assertEnum(value["status"], NAVIGATION_FACT_STATUSES, `${label}.status`);
  assertInteger(value["confidence"], `${label}.confidence`, 0, 100);
  if (value["type"] === "landmark") {
    assertExactKeys(value, ["id", "type", "status", "confidence", "claimedPosition"], label);
    assertPosition(value["claimedPosition"], `${label}.claimedPosition`);
    return;
  }
  if (value["type"] === "current") {
    assertExactKeys(value, ["id", "type", "status", "confidence", "claimedVectorMnmPerDay"], label);
    assertPosition(value["claimedVectorMnmPerDay"], `${label}.claimedVectorMnmPerDay`);
    return;
  }
  fail(`${label}.type is unknown`);
}

function assertCommandLog(value: UnknownRecord, label: string): void {
  assertExactKeys(value, ["index", "type", "committedDay", "command", "value"], label);
  assertInteger(value["index"], `${label}.index`, 0);
  assertInteger(value["committedDay"], `${label}.committedDay`, 0);
  const command = value["command"];
  if (command === "set_heading") {
    assertEnum(value["value"], HEADINGS, `${label}.value`);
  } else if (command === "set_sailing_policy") {
    assertEnum(value["value"], SAILING_POLICIES, `${label}.value`);
  } else if (command === "set_ration_policy") {
    assertEnum(value["value"], RATION_POLICIES, `${label}.value`);
  } else {
    fail(`${label}.command is unknown`);
  }
}

function assertDayLogBase(value: UnknownRecord, label: string): void {
  assertInteger(value["index"], `${label}.index`, 0);
  assertInteger(value["committedDay"], `${label}.committedDay`, 1);
  assertIsoDate(value["date"], `${label}.date`);
  if (
    !Array.isArray(value["phaseOrder"])
    || value["phaseOrder"].length !== DAY_PHASE_ORDER.length
    || value["phaseOrder"].some((phase, index) => phase !== DAY_PHASE_ORDER[index])
  ) {
    fail(`${label}.phaseOrder must match the section 4.1 transaction order`);
  }
  assertEnum(value["heading"], HEADINGS, `${label}.heading`);
  assertEnum(value["sailingPolicy"], SAILING_POLICIES, `${label}.sailingPolicy`);
  assertEnum(value["rationPolicy"], RATION_POLICIES, `${label}.rationPolicy`);
  assertString(value["environmentId"], `${label}.environmentId`, 128);
  assertPosition(value["estimatedPosition"], `${label}.estimatedPosition`);
  assertUncertainty(value["uncertainty"], `${label}.uncertainty`);
  assertInteger(value["waterConsumedKg"], `${label}.waterConsumedKg`, 0);
  assertInteger(value["provisionsConsumedKg"], `${label}.provisionsConsumedKg`, 0);
  if (value["event"] !== "none") fail(`${label}.event must be none before WP3`);
}

function assertDayLog(value: UnknownRecord, label: string, navigation: boolean): void {
  const common = [
    "index", "type", "committedDay", "date", "phaseOrder", "heading",
    "sailingPolicy", "rationPolicy", "environmentId", "estimatedPosition",
    "uncertainty", "waterConsumedKg", "provisionsConsumedKg", "observation",
    "landfall", "event", "interruption",
  ];
  if (navigation) {
    assertExactKeys(value, [...common, "observedWeather", "observedWind"], label);
  } else {
    assertExactKeys(value, common, label);
  }
  assertDayLogBase(value, label);
  if (navigation) {
    assertEnum(value["observedWeather"], WEATHER_KINDS, `${label}.observedWeather`);
    assertObservedWind(value["observedWind"], `${label}.observedWind`);
    assertObservation(value["observation"], `${label}.observation`);
    assertLandfall(value["landfall"], `${label}.landfall`);
    assertInterrupt(value["interruption"], `${label}.interruption`);
  } else {
    for (const key of ["observation", "landfall", "interruption"] as const) {
      if (value[key] !== "none") fail(`${label}.${key} must be none in WP0`);
    }
  }
}

function assertSurvivalActionResult(value: unknown, label: string): void {
  assertRecord(value, label);
  const kind = value["kind"];
  if (kind === "lisbon_outfitting_set") {
    assertExactKeys(
      value,
      ["kind", "allocation", "costDucats", "moneyRemainingDucats", "allocatableHoldUsedKg"],
      label,
    );
    assertStores(value["allocation"]);
    assertInteger(value["costDucats"], `${label}.costDucats`, 0);
    assertInteger(value["moneyRemainingDucats"], `${label}.moneyRemainingDucats`, 0);
    assertInteger(value["allocatableHoldUsedKg"], `${label}.allocatableHoldUsedKg`, 0, ALLOCATABLE_HOLD_KG);
    return;
  }
  if (kind === "departed_lisbon") {
    assertExactKeys(value, ["kind", "moneyCarriedDucats", "allocatableHoldUsedKg"], label);
    assertInteger(value["moneyCarriedDucats"], `${label}.moneyCarriedDucats`, 0);
    assertInteger(value["allocatableHoldUsedKg"], `${label}.allocatableHoldUsedKg`, 0, ALLOCATABLE_HOLD_KG);
    return;
  }
  if (kind === "entered_cape_verde_port" || kind === "left_cape_verde_port") {
    assertExactKeys(value, ["kind"], label);
    return;
  }
  if (kind === "cape_verde_purchase") {
    assertExactKeys(
      value,
      [
        "kind", "store", "quantityKg", "costDucats", "moneyRemainingDucats",
        "stockRemainingKg", "allocatableHoldUsedKg",
      ],
      label,
    );
    assertEnum(value["store"], STORE_KINDS, `${label}.store`);
    assertInteger(value["quantityKg"], `${label}.quantityKg`, 1, ALLOCATABLE_HOLD_KG);
    assertInteger(value["costDucats"], `${label}.costDucats`, 0);
    assertInteger(value["moneyRemainingDucats"], `${label}.moneyRemainingDucats`, 0);
    assertInteger(value["stockRemainingKg"], `${label}.stockRemainingKg`, 0, ALLOCATABLE_HOLD_KG);
    assertInteger(value["allocatableHoldUsedKg"], `${label}.allocatableHoldUsedKg`, 0, ALLOCATABLE_HOLD_KG);
    return;
  }
  if (kind === "expedition_intent_set") {
    assertExactKeys(value, ["kind", "intent"], label);
    assertEnum(value["intent"], EXPEDITION_INTENTS, `${label}.intent`);
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertSurvivalActionLog(value: UnknownRecord, label: string): void {
  assertExactKeys(value, ["index", "type", "committedDay", "result", "warnings", "status", "interruption"], label);
  assertInteger(value["index"], `${label}.index`, 0);
  assertInteger(value["committedDay"], `${label}.committedDay`, 0);
  assertSurvivalActionResult(value["result"], `${label}.result`);
  assertSurvivalWarnings(value["warnings"], `${label}.warnings`);
  assertSurvivalStatus(value["status"], `${label}.status`);
  assertSurvivalInterrupt(value["interruption"], `${label}.interruption`);
}

function assertSurvivalDayActivity(value: unknown, label: string): void {
  assertRecord(value, label);
  const kind = value["kind"];
  if (kind === "sailing") {
    assertExactKeys(value, ["kind"], label);
    return;
  }
  if (kind === "stranded_wait") {
    assertExactKeys(value, ["kind", "reason"], label);
    assertEnum(
      value["reason"],
      ["hull_danger", "mast_disabled", "sails_disabled", "rudder_disabled", "insufficient_able_crew"] as const,
      `${label}.reason`,
    );
    return;
  }
  if (kind === "repair") {
    assertExactKeys(
      value,
      ["kind", "location", "component", "repairStoresSpentKg", "conditionRestoredBps"],
      label,
    );
    assertEnum(value["location"], ["at_sea", "cape_verde"] as const, `${label}.location`);
    assertEnum(value["component"], SHIP_COMPONENTS, `${label}.component`);
    assertInteger(value["repairStoresSpentKg"], `${label}.repairStoresSpentKg`, 1, ALLOCATABLE_HOLD_KG);
    assertInteger(value["conditionRestoredBps"], `${label}.conditionRestoredBps`, 1, 10_000);
    return;
  }
  if (kind === "port_rest") {
    assertExactKeys(value, ["kind", "moneySpentDucats", "healthRestoredBps", "moraleRestoredBps"], label);
    assertInteger(value["moneySpentDucats"], `${label}.moneySpentDucats`, 1);
    assertInteger(value["healthRestoredBps"], `${label}.healthRestoredBps`, 0, 10_000);
    assertInteger(value["moraleRestoredBps"], `${label}.moraleRestoredBps`, 0, 10_000);
    return;
  }
  if (kind === "careening") {
    assertExactKeys(value, ["kind", "completedDays", "completed", "foulingReset"], label);
    assertInteger(value["completedDays"], `${label}.completedDays`, 1, SURVIVAL_TUNING.fouling.careeningDays);
    if (typeof value["completed"] !== "boolean" || typeof value["foulingReset"] !== "boolean") {
      fail(`${label} completion fields must be booleans`);
    }
    if (value["completed"] !== value["foulingReset"]) fail(`${label} completion and fouling reset must agree`);
    return;
  }
  fail(`${label}.kind is unknown`);
}

function assertSurvivalDayLog(value: UnknownRecord, label: string): void {
  assertExactKeys(
    value,
    [
      "index", "type", "committedDay", "date", "phaseOrder", "heading", "sailingPolicy",
      "rationPolicy", "environmentId", "estimatedPosition", "uncertainty", "waterConsumedKg",
      "provisionsConsumedKg", "provisionsSpoiledKg", "observedWeather", "observedWind",
      "observation", "landfall", "event", "activity", "foulingSpeedLossBps", "warnings",
      "status", "interruption",
    ],
    label,
  );
  assertDayLogBase(value, label);
  assertInteger(value["provisionsSpoiledKg"], `${label}.provisionsSpoiledKg`, 0, ALLOCATABLE_HOLD_KG);
  assertEnum(value["observedWeather"], WEATHER_KINDS, `${label}.observedWeather`);
  assertObservedWind(value["observedWind"], `${label}.observedWind`);
  assertObservation(value["observation"], `${label}.observation`);
  assertLandfall(value["landfall"], `${label}.landfall`);
  assertSurvivalDayActivity(value["activity"], `${label}.activity`);
  assertInteger(
    value["foulingSpeedLossBps"],
    `${label}.foulingSpeedLossBps`,
    0,
    SURVIVAL_TUNING.fouling.maximumSpeedLossBps,
  );
  assertSurvivalWarnings(value["warnings"], `${label}.warnings`);
  assertSurvivalStatus(value["status"], `${label}.status`);
  assertSurvivalInterrupt(value["interruption"], `${label}.interruption`);
}

function assertCanonicalLog(
  value: unknown,
  mode: "legacy" | "navigation" | "survival",
): asserts value is readonly CanonicalLogEntry[] {
  if (!Array.isArray(value)) fail("canonicalLog must be an array");
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const label = `canonicalLog[${index}]`;
    assertRecord(entry, label);
    if (entry["type"] === "command") assertCommandLog(entry, label);
    else if (entry["type"] === "day" && mode !== "survival") {
      assertDayLog(entry, label, mode === "navigation");
    } else if (entry["type"] === "survival_action" && mode === "survival") {
      assertSurvivalActionLog(entry, label);
    } else if (entry["type"] === "survival_day" && mode === "survival") {
      assertSurvivalDayLog(entry, label);
    }
    else fail(`${label}.type is unknown`);
    if (entry["index"] !== index) fail(`${label}.index must equal its array index`);
  }
}

function assertNavigationState(value: unknown): void {
  assertRecord(value, "navigation");
  assertExactKeys(
    value,
    [
      "environmentModel", "environmentPrng", "weatherState", "observedWeather",
      "observedWind", "knowledge", "lastObservation", "lastLandfall", "interruption",
    ],
    "navigation",
  );
  if (value["environmentModel"] !== "authored-atlantic-v1") {
    fail("navigation.environmentModel must be authored-atlantic-v1");
  }
  assertPrngState(value["environmentPrng"]);
  assertRecord(value["weatherState"], "navigation.weatherState");
  assertExactKeys(value["weatherState"], ["kind", "daysInState"], "navigation.weatherState");
  assertEnum(value["weatherState"]["kind"], WEATHER_KINDS, "navigation.weatherState.kind");
  assertInteger(value["weatherState"]["daysInState"], "navigation.weatherState.daysInState", 0, 1_000_000);
  assertEnum(value["observedWeather"], WEATHER_KINDS, "navigation.observedWeather");
  assertObservedWind(value["observedWind"], "navigation.observedWind");
  if (!Array.isArray(value["knowledge"])) fail("navigation.knowledge must be an array");
  const ids = new Set<string>();
  for (let index = 0; index < value["knowledge"].length; index += 1) {
    const fact = value["knowledge"][index];
    assertNavigationFact(fact, `navigation.knowledge[${index}]`);
    if (ids.has(fact.id)) fail(`navigation knowledge id ${fact.id} is duplicated`);
    ids.add(fact.id);
  }
  assertObservation(value["lastObservation"], "navigation.lastObservation");
  assertLandfall(value["lastLandfall"], "navigation.lastLandfall");
  assertInterrupt(value["interruption"], "navigation.interruption");
}

export function assertDailyEnvironment(value: unknown): asserts value is DailyEnvironment {
  assertRecord(value, "daily environment");
  const commonKeys = [
    "id", "pointOfSailPermille", "weatherPermille", "uncertaintyPermille",
    "tackingUncertaintyPermille", "trueCurrentMnm", "knownCurrentMnm", "leewayMnm",
  ];
  const navigation = value["schema"] === "wp1-navigation-environment-v1";
  if (navigation) {
    assertExactKeys(
      value,
      [
        ...commonKeys, "schema", "observedWeather", "observedWind", "noonObservation",
        "sightRadiusMnm", "nextWeatherState", "nextEnvironmentPrng",
      ],
      "daily environment",
    );
  } else {
    assertExactKeys(value, [...commonKeys, "observation", "landfall"], "daily environment");
  }
  assertString(value["id"], "daily environment.id", 128);
  for (const key of [
    "pointOfSailPermille", "weatherPermille", "uncertaintyPermille",
    "tackingUncertaintyPermille",
  ] as const) {
    assertInteger(value[key], `daily environment.${key}`, 0, 10_000);
  }
  assertPosition(value["trueCurrentMnm"], "daily environment.trueCurrentMnm");
  assertPosition(value["knownCurrentMnm"], "daily environment.knownCurrentMnm");
  assertPosition(value["leewayMnm"], "daily environment.leewayMnm");
  if (navigation) {
    assertEnum(value["observedWeather"], WEATHER_KINDS, "daily environment.observedWeather");
    assertObservedWind(value["observedWind"], "daily environment.observedWind");
    assertEnum(
      value["noonObservation"],
      ["clear", "heavy_swell", "overcast", "none"] as const,
      "daily environment.noonObservation",
    );
    assertInteger(value["sightRadiusMnm"], "daily environment.sightRadiusMnm", 0, 1_000_000);
    assertRecord(value["nextWeatherState"], "daily environment.nextWeatherState");
    assertExactKeys(value["nextWeatherState"], ["kind", "daysInState"], "daily environment.nextWeatherState");
    assertEnum(value["nextWeatherState"]["kind"], WEATHER_KINDS, "daily environment.nextWeatherState.kind");
    assertInteger(value["nextWeatherState"]["daysInState"], "daily environment.nextWeatherState.daysInState", 1, 1_000_000);
    assertPrngState(value["nextEnvironmentPrng"]);
  } else if (value["observation"] !== "none" || value["landfall"] !== "none") {
    fail("WP0 environments may not author observations or landfall");
  }
}

export function assertSimulationState(value: unknown): asserts value is SimulationState {
  assertRecord(value, "state");
  const navigation = value["format"] === NAVIGATION_STATE_FORMAT;
  const survival = value["format"] === SURVIVAL_STATE_FORMAT;
  const commonKeys = [
    "format", "contentVersion", "runSeed", "committedDay", "date", "truePosition",
    "estimatedPosition", "uncertainty", "heading", "sailingPolicy", "rationPolicy",
    "crew", "stores", "moneyDucats", "ship", "prng", "canonicalLog", "replayCommands",
  ];
  assertExactKeys(
    value,
    survival ? [...commonKeys, "navigation", "survival"] : navigation ? [...commonKeys, "navigation"] : commonKeys,
    "state",
  );
  if (!navigation && !survival && value["format"] !== STATE_FORMAT) {
    fail(`state.format must be ${STATE_FORMAT}, ${NAVIGATION_STATE_FORMAT}, or ${SURVIVAL_STATE_FORMAT}`);
  }
  assertString(value["contentVersion"], "state.contentVersion", 128);
  assertString(value["runSeed"], "state.runSeed", 256);
  assertInteger(value["committedDay"], "state.committedDay", 0, 1_000_000);
  assertIsoDate(value["date"], "state.date");
  assertPosition(value["truePosition"], "state.truePosition");
  assertPosition(value["estimatedPosition"], "state.estimatedPosition");
  assertUncertainty(value["uncertainty"], "state.uncertainty");
  assertEnum(value["heading"], HEADINGS, "state.heading");
  assertEnum(value["sailingPolicy"], SAILING_POLICIES, "state.sailingPolicy");
  assertEnum(value["rationPolicy"], RATION_POLICIES, "state.rationPolicy");
  assertCrew(value["crew"]);
  assertStores(value["stores"]);
  assertInteger(value["moneyDucats"], "state.moneyDucats", 0, 1_000_000_000);
  assertShip(value["ship"]);
  assertPrngState(value["prng"]);
  if (navigation || survival) assertNavigationState(value["navigation"]);
  if (survival) {
    assertSurvivalState(value["survival"], value["date"], value["stores"], value["crew"], value["ship"]);
  }
  assertCanonicalLog(value["canonicalLog"], survival ? "survival" : navigation ? "navigation" : "legacy");

  const commands = value["replayCommands"];
  if (!Array.isArray(commands)) fail("state.replayCommands must be an array");
  for (const command of commands) assertSimulationCommand(command);
  const logs = value["canonicalLog"];
  if (logs.length !== commands.length) fail("canonicalLog and replayCommands must have one entry per command");
  let advanceCount = 0;
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const log = logs[index];
    if (command === undefined || log === undefined) fail("command/log sequence is incomplete");
    const committedDayCommand = command.type === "advance_day"
      || command.type === "rest_at_cape_verde"
      || command.type === "repair_day"
      || command.type === "careen_day_at_cape_verde";
    const survivalOnly = ![
      "set_heading", "set_sailing_policy", "set_ration_policy", "advance_day",
    ].includes(command.type);
    if (!survival && survivalOnly) {
      fail(`state format ${value["format"] as string} may not contain WP2 command ${command.type}`);
    }
    if (committedDayCommand) {
      advanceCount += 1;
      if (survival) {
        if (log.type !== "survival_day") fail(`canonicalLog[${index}] must be a survival day entry`);
        if (command.type === "advance_day") {
          if (log.activity.kind !== "sailing" && log.activity.kind !== "stranded_wait") {
            fail(`canonicalLog[${index}] activity does not match advance_day`);
          }
        } else if (command.type === "rest_at_cape_verde" && log.activity.kind !== "port_rest") {
          fail(`canonicalLog[${index}] activity does not match rest_at_cape_verde`);
        } else if (command.type === "careen_day_at_cape_verde" && log.activity.kind !== "careening") {
          fail(`canonicalLog[${index}] activity does not match careen_day_at_cape_verde`);
        } else if (command.type === "repair_day") {
          if (
            log.activity.kind !== "repair"
            || log.activity.component !== command.component
            || log.activity.location !== command.location
          ) fail(`canonicalLog[${index}] activity does not match repair_day`);
        }
      } else if (log.type !== "day") fail(`canonicalLog[${index}] must be a day entry`);
    } else if (survivalOnly) {
      if (log.type !== "survival_action") fail(`canonicalLog[${index}] must be a survival action entry`);
      const expectedResultKind = command.type === "set_lisbon_outfitting"
        ? "lisbon_outfitting_set"
        : command.type === "depart_lisbon"
          ? "departed_lisbon"
          : command.type === "enter_cape_verde_port"
            ? "entered_cape_verde_port"
            : command.type === "leave_cape_verde_port"
              ? "left_cape_verde_port"
              : command.type === "purchase_at_cape_verde"
                ? "cape_verde_purchase"
                : "expedition_intent_set";
      if (log.result.kind !== expectedResultKind) {
        fail(`canonicalLog[${index}] result does not match ${command.type}`);
      }
      if (
        command.type === "purchase_at_cape_verde"
        && log.result.kind === "cape_verde_purchase"
        && (log.result.store !== command.store || log.result.quantityKg !== command.quantityKg)
      ) fail(`canonicalLog[${index}] purchase result does not match its command`);
      if (
        command.type === "set_lisbon_outfitting"
        && log.result.kind === "lisbon_outfitting_set"
        && (
          log.result.allocation.waterKg !== command.allocation.waterKg
          || log.result.allocation.provisionsKg !== command.allocation.provisionsKg
          || log.result.allocation.repairStoresKg !== command.allocation.repairStoresKg
          || log.result.allocation.medicineKg !== command.allocation.medicineKg
        )
      ) fail(`canonicalLog[${index}] outfitting result does not match its command`);
      if (
        command.type === "set_expedition_intent"
        && log.result.kind === "expedition_intent_set"
        && log.result.intent !== command.intent
      ) fail(`canonicalLog[${index}] intent result does not match its command`);
    } else {
      if (log.type !== "command" || log.command !== command.type) {
        fail(`canonicalLog[${index}] does not match its command`);
      }
      const expectedValue = command.type === "set_heading" ? command.heading : command.policy;
      if (log.value !== expectedValue) fail(`canonicalLog[${index}] has the wrong command value`);
    }
    if (log.committedDay > (value["committedDay"] as number)) {
      fail(`canonicalLog[${index}] is from an uncommitted future day`);
    }
  }
  if (advanceCount !== value["committedDay"]) {
    fail("state.committedDay must equal the number of advance_day commands");
  }
}

export function isHeading(value: unknown): value is Heading {
  return typeof value === "string" && HEADINGS.includes(value as Heading);
}

export function isSailingPolicy(value: unknown): value is SailingPolicy {
  return typeof value === "string" && SAILING_POLICIES.includes(value as SailingPolicy);
}

export function isRationPolicy(value: unknown): value is RationPolicy {
  return typeof value === "string" && RATION_POLICIES.includes(value as RationPolicy);
}
