import { hashState } from "./save.js";
import { applyCommand } from "./engine.js";
import { ReplayError } from "./errors.js";
import { deepFreeze } from "./immutable.js";
import {
  NAVIGATION_REPLAY_FORMAT,
  NAVIGATION_STATE_FORMAT,
  REPLAY_FORMAT,
  type EnvironmentProvider,
  type ReplayRecord,
  type SimulationCommand,
  type SimulationState,
} from "./types.js";
import {
  assertSimulationCommand,
  assertSimulationState,
  copyCommand,
} from "./validation.js";

function assertReplayRecord(value: unknown): asserts value is ReplayRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ReplayError("replay record must be an object");
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort().join(",");
  const expectedKeys = ["format", "contentVersion", "runSeed", "startingStateHash", "commands"]
    .sort()
    .join(",");
  if (actualKeys !== expectedKeys) {
    throw new ReplayError("replay record has missing or unknown fields");
  }
  if (record["format"] !== REPLAY_FORMAT && record["format"] !== NAVIGATION_REPLAY_FORMAT) {
    throw new ReplayError(`replay format must be ${REPLAY_FORMAT} or ${NAVIGATION_REPLAY_FORMAT}`);
  }
  if (typeof record["contentVersion"] !== "string" || record["contentVersion"].length === 0) {
    throw new ReplayError("replay contentVersion must be a non-empty string");
  }
  if (typeof record["runSeed"] !== "string" || record["runSeed"].length === 0) {
    throw new ReplayError("replay runSeed must be a non-empty string");
  }
  if (
    typeof record["startingStateHash"] !== "string"
    || !/^[0-9a-f]{64}$/.test(record["startingStateHash"])
  ) {
    throw new ReplayError("replay startingStateHash must be a lowercase SHA-256 hash");
  }
  if (!Array.isArray(record["commands"])) {
    throw new ReplayError("replay commands must be an array");
  }
  try {
    for (const command of record["commands"]) {
      assertSimulationCommand(command);
    }
  } catch (error) {
    throw new ReplayError(
      `replay command is invalid: ${error instanceof Error ? error.message : "validation failed"}`,
    );
  }
}

export function createReplay(
  startingState: Readonly<SimulationState>,
  commands: readonly Readonly<SimulationCommand>[],
): ReplayRecord {
  assertSimulationState(startingState);
  const commandCopies: SimulationCommand[] = [];
  for (const command of commands) {
    assertSimulationCommand(command);
    commandCopies.push(copyCommand(command));
  }
  return deepFreeze({
    format: startingState.format === NAVIGATION_STATE_FORMAT
      ? NAVIGATION_REPLAY_FORMAT
      : REPLAY_FORMAT,
    contentVersion: startingState.contentVersion,
    runSeed: startingState.runSeed,
    startingStateHash: hashState(startingState),
    commands: commandCopies,
  }) as ReplayRecord;
}

export function replay(
  startingState: Readonly<SimulationState>,
  record: Readonly<ReplayRecord>,
  environmentProvider?: EnvironmentProvider,
): SimulationState {
  assertSimulationState(startingState);
  assertReplayRecord(record);
  if (record.contentVersion !== startingState.contentVersion) {
    throw new ReplayError("replay contentVersion does not match the starting state");
  }
  if (record.runSeed !== startingState.runSeed) {
    throw new ReplayError("replay runSeed does not match the starting state");
  }
  if (record.startingStateHash !== hashState(startingState)) {
    throw new ReplayError("replay startingStateHash does not match the starting state");
  }
  if (
    (record.format === NAVIGATION_REPLAY_FORMAT)
    !== (startingState.format === NAVIGATION_STATE_FORMAT)
  ) {
    throw new ReplayError("replay format version does not match the starting state version");
  }

  let state = startingState as SimulationState;
  for (const command of record.commands) {
    state = applyCommand(state, command, environmentProvider);
  }
  return state;
}
