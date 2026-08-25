import { describe, expect, it } from "vitest";

import {
  canonicalCampaignState,
  createCampaign,
  createCampaignFixtureState,
  createCampaignReplay,
  createInitialState,
  createJourneyState,
  createNavigationState,
  createSurvivalState,
  deserializeCampaignSave,
  deserializeSave,
  executeCampaignCommand,
  getCampaignPlayerView,
  hashCampaignCommandLog,
  hashCampaignFacts,
  hashCampaignState,
  LANDMARK_IDS,
  replayCampaign,
  serializeCampaignSave,
  serializeSave,
  type CampaignCommand,
  type CampaignState,
  type SimulationCommand,
} from "../src/index.js";
import {
  CAMPAIGN_ROUTE_ENVIRONMENT,
  NO_MOVEMENT_ENVIRONMENT,
  forward,
} from "./campaign-test-helpers.js";

const CONTENT_VERSION = "wp4-knowledge-campaign-v2";

function execute(
  state: CampaignState,
  command: CampaignCommand,
): CampaignState {
  return executeCampaignCommand(state, command, { environmentProvider: CAMPAIGN_ROUTE_ENVIRONMENT });
}

function forwarded(command: SimulationCommand): CampaignCommand {
  return { type: "forward_simulation_command", command };
}

function runCommands(state: CampaignState, commands: readonly CampaignCommand[]): CampaignState {
  return commands.reduce((current, command) => execute(current, command), state);
}

const STANDARD_ALLOCATION = {
  waterKg: 24_000,
  provisionsKg: 18_000,
  repairStoresKg: 4_000,
  medicineKg: 0,
} as const;

function currentEvidenceLoop(): CampaignCommand[] {
  return [
    forwarded({ type: "set_heading", heading: "S" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "set_heading", heading: "E" }),
    ...Array.from({ length: 5 }, () => forwarded({ type: "advance_day" })),
  ];
}

function threeRunFixture(): {
  readonly starting: CampaignState;
  readonly final: CampaignState;
  readonly afterRuns: readonly CampaignState[];
  readonly runThreeCurrentEstimateDelta: number;
} {
  const starting = createCampaign({
    contentVersion: CONTENT_VERSION,
    expeditionDailyEventChancePermille: 0,
  });
  let state = starting;

  // Run 1: an early Cape Verde report survives a later zero-water loss.
  state = runCommands(state, [
    { type: "start_expedition", runSeed: "wp4-fixture-run-1" },
    forwarded({
      type: "set_lisbon_outfitting",
      allocation: { ...STANDARD_ALLOCATION, waterKg: 0 },
    }),
    forwarded({ type: "depart_lisbon" }),
    forwarded({ type: "set_heading", heading: "SW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    forwarded({ type: "purchase_cape_verde_rumour" }),
    { type: "deposit_report_at_cape_verde" },
    forwarded({ type: "leave_cape_verde_port" }),
    forwarded({ type: "set_heading", heading: "S" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "set_heading", heading: "E" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "advance_day" }),
    { type: "finalize_expedition" },
  ]);
  const afterRun1 = state;

  // Run 2: three matching discrepancy legs confirm the current, then a
  // post-Cape report and safe return produce full success.
  state = runCommands(state, [
    { type: "start_expedition", runSeed: "wp4-fixture-run-2" },
    forwarded({ type: "set_lisbon_outfitting", allocation: STANDARD_ALLOCATION }),
    forwarded({ type: "depart_lisbon" }),
    forwarded({ type: "set_heading", heading: "SW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    forwarded({ type: "leave_cape_verde_port" }),
    ...currentEvidenceLoop(),
    forwarded({ type: "set_heading", heading: "NNW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    forwarded({ type: "leave_cape_verde_port" }),
    ...currentEvidenceLoop(),
    forwarded({ type: "set_heading", heading: "NNW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    forwarded({ type: "leave_cape_verde_port" }),
    ...currentEvidenceLoop(),
    forwarded({ type: "set_heading", heading: "SE" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "recognise_cape_landfall" }),
    forwarded({ type: "survey_cape_day" }),
    forwarded({ type: "survey_cape_day" }),
    forwarded({ type: "leave_cape" }),
    forwarded({ type: "set_heading", heading: "NW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "set_heading", heading: "NNW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    { type: "deposit_report_at_cape_verde" },
    forwarded({ type: "leave_cape_verde_port" }),
    forwarded({ type: "set_heading", heading: "NE" }),
    forwarded({ type: "advance_day" }),
    { type: "finalize_expedition" },
  ]);
  const afterRun2 = state;

  // Run 3: inherited confirmed current changes the estimate immediately.
  state = runCommands(state, [
    { type: "start_expedition", runSeed: "wp4-fixture-run-3" },
    forwarded({ type: "set_lisbon_outfitting", allocation: STANDARD_ALLOCATION }),
    forwarded({ type: "depart_lisbon" }),
    forwarded({ type: "set_heading", heading: "SW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    forwarded({ type: "leave_cape_verde_port" }),
    forwarded({ type: "set_heading", heading: "S" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "set_heading", heading: "E" }),
  ]);
  const estimateBefore = state.activeExpedition!.journey.estimatedPosition.xMnm;
  state = execute(state, forwarded({ type: "advance_day" }));
  const runThreeCurrentEstimateDelta = state.activeExpedition!.journey.estimatedPosition.xMnm - estimateBefore;
  state = runCommands(state, [
    forwarded({ type: "set_heading", heading: "NNW" }),
    forwarded({ type: "advance_day" }),
    forwarded({ type: "enter_cape_verde_port" }),
    forwarded({ type: "leave_cape_verde_port" }),
    forwarded({ type: "set_heading", heading: "NE" }),
    forwarded({ type: "advance_day" }),
    { type: "finalize_expedition" },
  ]);
  return { starting, final: state, afterRuns: [afterRun1, afterRun2, state], runThreeCurrentEstimateDelta };
}

describe("WP4 campaign save/resume determinism", () => {
  function roundTrip(state: CampaignState): CampaignState {
    return deserializeCampaignSave(serializeCampaignSave(state));
  }

  it("round-trips at an ordinary committed day boundary", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "resume-day",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: -300_000, yMnm: -2_200_000 },
        estimatedPosition: { xMnm: -300_000, yMnm: -2_200_000 },
        dailyEventChancePermille: 0,
      },
    });
    state = forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    const uninterrupted = forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    const resumed = forward(roundTrip(state), { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(canonicalCampaignState(resumed)).toBe(canonicalCampaignState(uninterrupted));
  });

  it("round-trips at a pending event choice", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "resume-choice",
      journey: { location: "cape_verde", dailyEventChancePermille: 1_000 },
    });
    state = forward(state, { type: "careen_day_at_cape_verde" });
    const pending = state.activeExpedition!.journey.journey.pendingEvent!;
    const choice = pending.choices.find((item) => item.available)!;
    const command = { type: "choose_event", eventId: pending.eventId, choiceId: choice.id } as const;
    expect(canonicalCampaignState(forward(roundTrip(state), command))).toBe(
      canonicalCampaignState(forward(state, command)),
    );
  });

  it("round-trips immediately after report deposit", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "resume-deposit",
      journey: { location: "cape_verde", dailyEventChancePermille: 0 },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    const command = { type: "forward_simulation_command", command: { type: "purchase_cape_verde_rumour" } } as const;
    expect(canonicalCampaignState(executeCampaignCommand(roundTrip(state), command))).toBe(
      canonicalCampaignState(executeCampaignCommand(state, command)),
    );
  });

  it("round-trips immediately before finalization", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "resume-finalize",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: 0 },
        estimatedPosition: { xMnm: 0, yMnm: 0 },
        dailyEventChancePermille: 0,
      },
    });
    state = forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(canonicalCampaignState(executeCampaignCommand(roundTrip(state), { type: "finalize_expedition" }))).toBe(
      canonicalCampaignState(executeCampaignCommand(state, { type: "finalize_expedition" })),
    );
  });

  it("round-trips a losing finalization that salvages the log", () => {
    const build = () => {
      const state = createCampaignFixtureState({
        contentVersion: CONTENT_VERSION,
        runSeed: "resume-salvage",
        journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0 },
      });
      const withRumour = forward(state, { type: "purchase_cape_verde_rumour" });
      return forward(forward(withRumour, { type: "careen_day_at_cape_verde" }), { type: "careen_day_at_cape_verde" });
    };
    const state = build();
    const uninterrupted = executeCampaignCommand(state, { type: "finalize_expedition" });
    expect(uninterrupted.afterActionReports[0]!.factsSalvagedFromLog.length).toBeGreaterThan(0);
    expect(canonicalCampaignState(executeCampaignCommand(roundTrip(state), { type: "finalize_expedition" }))).toBe(
      canonicalCampaignState(uninterrupted),
    );
  });

  it("round-trips between completed expeditions", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "resume-between",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: 0 },
        estimatedPosition: { xMnm: 0, yMnm: 0 },
        dailyEventChancePermille: 0,
      },
    });
    state = executeCampaignCommand(forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT), { type: "finalize_expedition" });
    const command = { type: "start_expedition", runSeed: "resume-next" } as const;
    expect(canonicalCampaignState(executeCampaignCommand(roundTrip(state), command))).toBe(
      canonicalCampaignState(executeCampaignCommand(state, command)),
    );
  });
});

describe("WP4 campaign replay, projections, and compatibility", () => {
  it("replays all three runs byte-for-byte with explicit ordered expedition seeds", () => {
    const fixture = threeRunFixture();
    const replay = createCampaignReplay(fixture.starting, fixture.final.replayCommands);
    expect(replay.expeditionSeeds).toEqual([
      "wp4-fixture-run-1", "wp4-fixture-run-2", "wp4-fixture-run-3",
    ]);
    const replayed = replayCampaign(fixture.starting, replay, {
      environmentProvider: CAMPAIGN_ROUTE_ENVIRONMENT,
    });
    expect(canonicalCampaignState(replayed)).toBe(canonicalCampaignState(fixture.final));
    expect(fixture.afterRuns.map(hashCampaignState)).toHaveLength(3);
    expect(fixture.runThreeCurrentEstimateDelta).toBe(18_000);
    expect(fixture.final.facts.find((fact) => fact.id === "current.south-atlantic")).toMatchObject({
      status: "confirmed",
      confidence: 80,
    });
  });

  it("replays a lost expedition that never deposited, salvage included, byte-for-byte", () => {
    const starting = createCampaign({
      contentVersion: CONTENT_VERSION,
      expeditionDailyEventChancePermille: 0,
    });
    const final = runCommands(starting, [
      { type: "start_expedition", runSeed: "wp4-salvage-replay" },
      forwarded({ type: "set_lisbon_outfitting", allocation: { ...STANDARD_ALLOCATION, waterKg: 0 } }),
      forwarded({ type: "depart_lisbon" }),
      forwarded({ type: "set_heading", heading: "SW" }),
      forwarded({ type: "advance_day" }),
      forwarded({ type: "enter_cape_verde_port" }),
      forwarded({ type: "purchase_cape_verde_rumour" }),
      forwarded({ type: "leave_cape_verde_port" }),
      forwarded({ type: "set_heading", heading: "S" }),
      forwarded({ type: "advance_day" }),
      forwarded({ type: "set_heading", heading: "E" }),
      forwarded({ type: "advance_day" }),
      forwarded({ type: "advance_day" }),
      forwarded({ type: "advance_day" }),
      { type: "finalize_expedition" },
    ]);
    const report = final.afterActionReports[0]!;
    expect(report.outcome).toBe("objective_failure");
    expect(report.reportSnapshotHash).toBeNull();
    expect(report.factsSalvagedFromLog.length).toBeGreaterThan(0);
    expect(report.factsSalvagedFromLog.every((fact) => fact.confidence <= 40)).toBe(true);
    const replayed = replayCampaign(starting, createCampaignReplay(starting, final.replayCommands), {
      environmentProvider: CAMPAIGN_ROUTE_ENVIRONMENT,
    });
    expect(canonicalCampaignState(replayed)).toBe(canonicalCampaignState(final));
    expect(hashCampaignFacts(replayed)).toBe(hashCampaignFacts(final));
  });

  it("replays a surveyed Cape lost on the way home, at the survey salvage tier, byte-for-byte", () => {
    const starting = createCampaign({
      contentVersion: CONTENT_VERSION,
      expeditionDailyEventChancePermille: 0,
    });
    const final = runCommands(starting, [
      { type: "start_expedition", runSeed: "wp4-survey-salvage-replay" },
      forwarded({ type: "set_lisbon_outfitting", allocation: { ...STANDARD_ALLOCATION, waterKg: 0 } }),
      forwarded({ type: "depart_lisbon" }),
      forwarded({ type: "set_heading", heading: "SE" }),
      forwarded({ type: "advance_day" }),
      forwarded({ type: "recognise_cape_landfall" }),
      forwarded({ type: "survey_cape_day" }),
      forwarded({ type: "survey_cape_day" }),
      forwarded({ type: "leave_cape" }),
      forwarded({ type: "set_heading", heading: "E" }),
      forwarded({ type: "advance_day" }),
      forwarded({ type: "advance_day" }),
      { type: "finalize_expedition" },
    ]);
    const report = final.afterActionReports[0]!;
    expect(report.outcome).toBe("objective_failure");
    expect(report.objectiveStatus).toBe("achieved");
    expect(report.reportSnapshotHash).toBeNull();
    const salvaged = new Map(report.factsSalvagedFromLog.map((fact) => [fact.id, fact.confidence]));
    expect(salvaged.get(LANDMARK_IDS.capeGoal)).toBe(65);
    expect(salvaged.get("fact.cape-water-source")).toBe(65);
    // The raised tier is still a cap, and still short of automatic navigation correction.
    expect(report.factsSalvagedFromLog.every((fact) => fact.confidence < 70)).toBe(true);
    const replayed = replayCampaign(starting, createCampaignReplay(starting, final.replayCommands), {
      environmentProvider: CAMPAIGN_ROUTE_ENVIRONMENT,
    });
    expect(canonicalCampaignState(replayed)).toBe(canonicalCampaignState(final));
    expect(hashCampaignFacts(replayed)).toBe(hashCampaignFacts(final));
  });

  it("does not consume randomness through projection, reporting hashes, trace inspection, or serialization", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "read-only-operations",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: -2_000_000 },
        estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
        heading: "E",
        dailyEventChancePermille: 0,
      },
    });
    state = forward(state, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
    const before = canonicalCampaignState(state);
    getCampaignPlayerView(state);
    hashCampaignState(state);
    hashCampaignFacts(state);
    hashCampaignCommandLog(state);
    serializeCampaignSave(state);
    state.activeExpedition!.hiddenTrace.map((point) => ({ ...point }));
    expect(canonicalCampaignState(state)).toBe(before);
  });

  it("keeps v1-v4 save readers intact alongside the separate campaign save format", () => {
    const states = [
      createInitialState({ contentVersion: "compat", runSeed: "v1" }),
      createNavigationState({ contentVersion: "compat", runSeed: "v2" }),
      createSurvivalState({ contentVersion: "compat", runSeed: "v3" }),
      createJourneyState({ contentVersion: "compat", runSeed: "v4" }),
    ];
    for (const state of states) {
      expect(deserializeSave(serializeSave(state)).format).toBe(state.format);
    }
    const campaign = createCampaign({ contentVersion: CONTENT_VERSION });
    expect(deserializeCampaignSave(serializeCampaignSave(campaign)).format).toBe("age-of-exploration-campaign-v1");
  });
});

export { threeRunFixture };
