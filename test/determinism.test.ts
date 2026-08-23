import { describe, expect, it } from "vitest";

import {
  applyCommand,
  canonicalState,
  canonicalize,
  createInitialState,
  createReplay,
  deserializeSave,
  getPlayerView,
  hashEventLog,
  hashState,
  replay,
  serializeSave,
  type SimulationCommand,
  type SimulationState,
} from "../src/index.js";

const FIXTURE_COMMANDS: readonly SimulationCommand[] = [
  { type: "set_heading", heading: "SW" },
  { type: "set_sailing_policy", policy: "standard" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "advance_day" },
  { type: "advance_day" },
];

const FIXTURE_STATE_HASH = "e292a0d42529f7ad67b301d8349cb89fd9a4066065ab49001f70058dde253a1b";
const FIXTURE_LOG_HASH = "fb122b0b002211b6abbf5ad2eaea7e84e1ac25d69d2aa7f5d54020b9446f8211";

function runCommands(
  startingState: Readonly<SimulationState>,
  commands: readonly SimulationCommand[],
): SimulationState {
  return commands.reduce<SimulationState>(
    (state, command) => applyCommand(state, command),
    startingState as SimulationState,
  );
}

function fixtureInitial(seed = "cape-route-0001"): SimulationState {
  return createInitialState({ contentVersion: "wp0-fixture-v1", runSeed: seed });
}

describe("determinism, resume, and replay", () => {
  it("produces byte-identical canonical state and logs for identical inputs", () => {
    const first = runCommands(fixtureInitial(), FIXTURE_COMMANDS);
    const second = runCommands(fixtureInitial(), FIXTURE_COMMANDS);

    expect(canonicalState(first)).toBe(canonicalState(second));
    expect(canonicalize(first.canonicalLog)).toBe(canonicalize(second.canonicalLog));
    expect(hashState(first)).toBe(FIXTURE_STATE_HASH);
    expect(hashEventLog(first)).toBe(FIXTURE_LOG_HASH);
  });

  it("changes seeded movement for different seeds without changing invariants", () => {
    const first = runCommands(fixtureInitial("seed-alpha"), FIXTURE_COMMANDS);
    const second = runCommands(fixtureInitial("seed-bravo"), FIXTURE_COMMANDS);

    expect(first.truePosition).not.toEqual(second.truePosition);
    expect(first.estimatedPosition).not.toEqual(second.estimatedPosition);
    expect(first.committedDay).toBe(second.committedDay);
    expect(first.stores).toEqual(second.stores);
    expect(first.crew).toEqual(second.crew);
    expect(first.ship).toEqual(second.ship);
    expect(first.uncertainty).toEqual(second.uncertainty);
  });

  it("save/resume at a committed day boundary equals uninterrupted execution", () => {
    const uninterrupted = runCommands(fixtureInitial(), FIXTURE_COMMANDS);
    const splitIndex = 4;
    const beforeSave = runCommands(fixtureInitial(), FIXTURE_COMMANDS.slice(0, splitIndex));
    const resumed = runCommands(
      deserializeSave(serializeSave(beforeSave)),
      FIXTURE_COMMANDS.slice(splitIndex),
    );

    expect(canonicalState(resumed)).toBe(canonicalState(uninterrupted));
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
  });

  it("replay produces the original final canonical state and hash", () => {
    const initial = fixtureInitial();
    const original = runCommands(initial, FIXTURE_COMMANDS);
    const record = createReplay(initial, FIXTURE_COMMANDS);
    const replayed = replay(initial, record);

    expect(record).toMatchObject({
      contentVersion: initial.contentVersion,
      runSeed: initial.runSeed,
      startingStateHash: hashState(initial),
      commands: FIXTURE_COMMANDS,
    });
    expect(canonicalState(replayed)).toBe(canonicalState(original));
    expect(hashState(replayed)).toBe(FIXTURE_STATE_HASH);
  });

  it("does not consume randomness through logging, projection, hashing, or serialization", () => {
    let observed = fixtureInitial("observation-independence");
    let plain = fixtureInitial("observation-independence");
    for (let day = 0; day < 4; day += 1) {
      observed = applyCommand(observed, { type: "advance_day" });
      canonicalize(observed.canonicalLog);
      getPlayerView(observed);
      hashState(observed);
      serializeSave(observed);
      plain = applyCommand(plain, { type: "advance_day" });
    }

    expect(observed.stores.waterKg).toBe(plain.stores.waterKg);
    expect(observed.stores.provisionsKg).toBe(plain.stores.provisionsKg);
    expect(canonicalState(observed)).toBe(canonicalState(plain));
  });
});
