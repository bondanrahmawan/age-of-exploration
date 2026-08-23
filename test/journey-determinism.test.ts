import { describe, expect, it } from "vitest";

import { renderDebugChart } from "../debug/chart.mjs";
import {
  JOURNEY_REPLAY_FORMAT,
  JOURNEY_SAVE_FORMAT,
  NAVIGATION_SAVE_FORMAT,
  SAVE_FORMAT,
  SURVIVAL_SAVE_FORMAT,
  applyCommand,
  canonicalState,
  canonicalize,
  createInitialState,
  createJourneyState,
  createNavigationState,
  createReplay,
  createSurvivalState,
  deserializeSave,
  getPlayerView,
  hashEventLog,
  hashState,
  replay,
  serializeSave,
  type JourneySimulationState,
  type SimulationCommand,
  type SimulationState,
} from "../src/index.js";

const WP0_COMMANDS: readonly SimulationCommand[] = [
  { type: "set_heading", heading: "SW" },
  { type: "set_sailing_policy", policy: "standard" },
  { type: "advance_day" }, { type: "advance_day" },
  { type: "advance_day" }, { type: "advance_day" },
];

const WP2_COMMANDS: readonly SimulationCommand[] = [
  { type: "set_lisbon_outfitting", allocation: { waterKg: 20_000, provisionsKg: 12_000, repairStoresKg: 4_000, medicineKg: 1_000 } },
  { type: "depart_lisbon" },
  { type: "set_heading", heading: "SW" },
  { type: "advance_day" }, { type: "advance_day" },
  { type: "set_ration_policy", policy: "reduced_provisions" },
  { type: "advance_day" },
  { type: "set_expedition_intent", intent: "return_to_lisbon" },
  { type: "advance_day" },
];

function run(start: Readonly<SimulationState>, commands: readonly SimulationCommand[]): SimulationState {
  return commands.reduce<SimulationState>((state, command) => applyCommand(state, command), start as SimulationState);
}

function journeyStart(): JourneySimulationState {
  return createJourneyState({
    contentVersion: "wp3-authored-journey-v1",
    runSeed: "wp3-representative-route",
    dailyEventChancePermille: 1_000,
  });
}

function prefixToPending(start = journeyStart()) {
  const commands: SimulationCommand[] = [
    { type: "set_lisbon_outfitting", allocation: { waterKg: 20_000, provisionsKg: 12_000, repairStoresKg: 4_000, medicineKg: 1_000 } },
    { type: "depart_lisbon" },
    { type: "set_heading", heading: "SW" },
    { type: "advance_day" },
  ];
  const state = run(start, commands) as JourneySimulationState;
  const pending = state.journey.pendingEvent;
  if (pending === null) throw new Error("100% event fixture did not produce a pending event");
  const available = pending.choices.find((item) => item.available);
  if (available === undefined) throw new Error("pending fixture has no available choice");
  return { state, commands, choice: { type: "choose_event", eventId: pending.eventId, choiceId: available.id } as const };
}

describe("WP3 version compatibility and preserved fixtures", () => {
  it("reads canonical v1, v2, and v3 saves while writing explicit v4 saves", () => {
    const legacy = createInitialState({ contentVersion: "wp0", runSeed: "compat-v1" });
    const navigation = createNavigationState({ contentVersion: "wp1", runSeed: "compat-v2" });
    const survival = createSurvivalState({ contentVersion: "wp2", runSeed: "compat-v3" });
    const journey = journeyStart();
    for (const [state, format] of [
      [legacy, SAVE_FORMAT], [navigation, NAVIGATION_SAVE_FORMAT],
      [survival, SURVIVAL_SAVE_FORMAT], [journey, JOURNEY_SAVE_FORMAT],
    ] as const) {
      const save = serializeSave(state);
      expect(JSON.parse(save).format).toBe(format);
      expect(canonicalState(deserializeSave(save))).toBe(canonicalState(state));
    }
  });

  it("preserves the WP0, WP1 chart-route, and WP2 representative fixture hashes", () => {
    const wp0 = run(createInitialState({ contentVersion: "wp0-fixture-v1", runSeed: "cape-route-0001" }), WP0_COMMANDS);
    expect(hashState(wp0)).toBe("e292a0d42529f7ad67b301d8349cb89fd9a4066065ab49001f70058dde253a1b");
    expect(hashEventLog(wp0)).toBe("fb122b0b002211b6abbf5ad2eaea7e84e1ac25d69d2aa7f5d54020b9446f8211");

    const wp1Commands: SimulationCommand[] = [
      { type: "set_heading", heading: "SW" },
      ...Array.from({ length: 22 }, () => ({ type: "advance_day" as const })),
      { type: "set_heading", heading: "S" },
      ...Array.from({ length: 18 }, () => ({ type: "advance_day" as const })),
      { type: "set_heading", heading: "SE" },
      ...Array.from({ length: 18 }, () => ({ type: "advance_day" as const })),
    ];
    const wp1 = run(createNavigationState({
      contentVersion: "wp1-authored-atlantic-v1",
      runSeed: "wp1-representative-chart-route",
    }), wp1Commands);
    expect(hashState(wp1)).toBe("511b2af05d30fe1399c497be4c506d28bf5829ad5fa4021400b92ab19e157b8e");
    expect(hashEventLog(wp1)).toBe("d822b063d2e6dd47ca18b040273294ece5168871b82d1de52753f115c6269726");

    const wp2 = run(createSurvivalState({
      contentVersion: "wp2-survival-v1",
      runSeed: "wp2-representative-sequence",
    }), WP2_COMMANDS);
    expect(hashState(wp2)).toBe("fc5557aec41d00bc0615bf655811edaf464c6445079076872b5f89e15cedd983");
    expect(hashEventLog(wp2)).toBe("af25367d034cbe59e1e3cc1c70df24dd0eb05ba23ee965b5d137e93319fc6c7e");
  });
});

describe("WP3 state, pending-choice, save/resume, and replay determinism", () => {
  it("produces byte-identical v4 state and canonical logs for repeated runs", () => {
    const firstPrefix = prefixToPending();
    const secondPrefix = prefixToPending();
    const first = applyCommand(firstPrefix.state, firstPrefix.choice);
    const second = applyCommand(secondPrefix.state, secondPrefix.choice);
    expect(canonicalState(first)).toBe(canonicalState(second));
    expect(canonicalize(first.canonicalLog)).toBe(canonicalize(second.canonicalLog));
    expect(hashState(first)).toBe(hashState(second));
    expect(hashEventLog(first)).toBe(hashEventLog(second));
    expect(hashState(first)).toBe("03caed9796f4f2343e35bfc3e1766c9a4c1530d0409e4d02203feedae6b7b44b");
    expect(hashEventLog(first)).toBe("fbb2626f880cb8c5fb0e7217dd979e8cdffa44278acafdb44498142cc56bb843");
  });

  it("saves and resumes exactly at a pending-choice boundary", () => {
    const prefix = prefixToPending();
    const uninterrupted = applyCommand(prefix.state, prefix.choice);
    const save = serializeSave(prefix.state);
    const resumedBoundary = deserializeSave(save) as JourneySimulationState;
    const resumed = applyCommand(resumedBoundary, prefix.choice);
    expect(JSON.parse(save).format).toBe(JOURNEY_SAVE_FORMAT);
    expect(resumedBoundary.journey.pendingEvent).toEqual(prefix.state.journey.pendingEvent);
    expect(canonicalState(resumed)).toBe(canonicalState(uninterrupted));
  });

  it("replays the same pending event and selected response byte-for-byte", () => {
    const start = journeyStart();
    const prefix = prefixToPending(start);
    const commands = [...prefix.commands, prefix.choice];
    const original = run(start, commands);
    const record = createReplay(start, commands);
    const replayed = replay(start, record);
    expect(record.format).toBe(JOURNEY_REPLAY_FORMAT);
    expect(canonicalState(replayed)).toBe(canonicalState(original));
    expect(hashEventLog(replayed)).toBe(hashEventLog(original));
  });

  it("leaves every byte and all three PRNG streams unchanged after rejected commands", () => {
    const { state } = prefixToPending();
    const bytes = canonicalState(state);
    const movement = state.prng;
    const environment = state.navigation.environmentPrng;
    const event = state.journey.eventPrng;
    expect(() => applyCommand(state, {
      type: "choose_event",
      eventId: state.journey.pendingEvent!.eventId,
      choiceId: "not-a-choice",
    })).toThrow();
    expect(canonicalState(state)).toBe(bytes);
    expect(state.prng).toEqual(movement);
    expect(state.navigation.environmentPrng).toEqual(environment);
    expect(state.journey.eventPrng).toEqual(event);
  });

  it("consumes no randomness through projection, logs, serialization, hashing, or chart generation", () => {
    const observed = prefixToPending().state;
    const movement = observed.prng;
    const environment = observed.navigation.environmentPrng;
    const event = observed.journey.eventPrng;
    const canonicalBefore = canonicalState(observed);
    canonicalize(observed.canonicalLog);
    getPlayerView(observed);
    serializeSave(observed);
    hashState(observed);
    hashEventLog(observed);
    renderDebugChart(getPlayerView(observed));
    expect(canonicalState(observed)).toBe(canonicalBefore);
    expect(observed.prng).toEqual(movement);
    expect(observed.navigation.environmentPrng).toEqual(environment);
    expect(observed.journey.eventPrng).toEqual(event);
  });
});
