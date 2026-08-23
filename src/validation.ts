import { assertIsoDate } from "./date.js";
import { SimulationValidationError } from "./errors.js";
import {
  DAY_PHASE_ORDER,
  HEADINGS,
  NAVIGATION_FACT_STATUSES,
  NAVIGATION_STATE_FORMAT,
  PRNG_ALGORITHM,
  RATION_POLICIES,
  SAILING_POLICIES,
  STATE_FORMAT,
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

function assertCanonicalLog(value: unknown, navigation: boolean): asserts value is readonly CanonicalLogEntry[] {
  if (!Array.isArray(value)) fail("canonicalLog must be an array");
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const label = `canonicalLog[${index}]`;
    assertRecord(entry, label);
    if (entry["type"] === "command") assertCommandLog(entry, label);
    else if (entry["type"] === "day") assertDayLog(entry, label, navigation);
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
  const commonKeys = [
    "format", "contentVersion", "runSeed", "committedDay", "date", "truePosition",
    "estimatedPosition", "uncertainty", "heading", "sailingPolicy", "rationPolicy",
    "crew", "stores", "moneyDucats", "ship", "prng", "canonicalLog", "replayCommands",
  ];
  assertExactKeys(value, navigation ? [...commonKeys, "navigation"] : commonKeys, "state");
  if (!navigation && value["format"] !== STATE_FORMAT) {
    fail(`state.format must be ${STATE_FORMAT} or ${NAVIGATION_STATE_FORMAT}`);
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
  if (navigation) assertNavigationState(value["navigation"]);
  assertCanonicalLog(value["canonicalLog"], navigation);

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
    if (command.type === "advance_day") {
      advanceCount += 1;
      if (log.type !== "day") fail(`canonicalLog[${index}] must be a day entry`);
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
