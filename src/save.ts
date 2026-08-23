import { canonicalize, hashCanonical } from "./canonical.js";
import { SaveFormatError } from "./errors.js";
import { deepFreeze } from "./immutable.js";
import {
  NAVIGATION_SAVE_FORMAT,
  NAVIGATION_STATE_FORMAT,
  SAVE_FORMAT,
  type SaveEnvelope,
  type SimulationState,
} from "./types.js";
import { assertSimulationState } from "./validation.js";

export function serializeSave(state: Readonly<SimulationState>): string {
  assertSimulationState(state);
  const envelope: SaveEnvelope = state.format === NAVIGATION_STATE_FORMAT
    ? { format: NAVIGATION_SAVE_FORMAT, state }
    : { format: SAVE_FORMAT, state };
  return canonicalize(envelope);
}

function decodeSave(data: string | Uint8Array): string {
  if (typeof data === "string") {
    return data;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (error) {
    throw new SaveFormatError(
      `save is not valid UTF-8: ${error instanceof Error ? error.message : "decode failed"}`,
    );
  }
}

export function deserializeSave(data: string | Uint8Array): SimulationState {
  const text = decodeSave(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SaveFormatError(
      `save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SaveFormatError("save envelope must be an object");
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "format" || keys[1] !== "state") {
    throw new SaveFormatError("save envelope must contain exactly format and state");
  }
  if (record["format"] !== SAVE_FORMAT && record["format"] !== NAVIGATION_SAVE_FORMAT) {
    throw new SaveFormatError(`save format must be ${SAVE_FORMAT} or ${NAVIGATION_SAVE_FORMAT}`);
  }
  try {
    assertSimulationState(record["state"]);
  } catch (error) {
    throw new SaveFormatError(
      `save state is invalid: ${error instanceof Error ? error.message : "validation failed"}`,
    );
  }
  const state = record["state"];
  if (
    (record["format"] === NAVIGATION_SAVE_FORMAT) !== (state.format === NAVIGATION_STATE_FORMAT)
  ) {
    throw new SaveFormatError("save envelope version does not match its state version");
  }
  if (canonicalize(parsed) !== text) {
    throw new SaveFormatError("save must use canonical UTF-8 JSON with exactly one trailing LF");
  }
  return deepFreeze(state) as SimulationState;
}

export function canonicalState(state: Readonly<SimulationState>): string {
  assertSimulationState(state);
  return canonicalize(state);
}

export function hashState(state: Readonly<SimulationState>): string {
  assertSimulationState(state);
  return hashCanonical(state);
}

export function hashEventLog(state: Readonly<SimulationState>): string {
  assertSimulationState(state);
  return hashCanonical(state.canonicalLog);
}
