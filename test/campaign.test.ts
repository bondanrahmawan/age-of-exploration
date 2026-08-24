import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_STATE_FORMAT,
  LANDMARK_IDS,
  SOUTH_ATLANTIC_CURRENT_ID,
  canonicalCampaignState,
  createCampaign,
  createCampaignFixtureState,
  executeCampaignCommand,
  getCampaignPlayerView,
  hashCampaignState,
  journeyFactToCampaignFact,
  mergeCampaignFacts,
  type CampaignFact,
  type CampaignState,
  type JourneyFact,
} from "../src/index.js";
import {
  CAMPAIGN_ROUTE_ENVIRONMENT,
  NO_MOVEMENT_ENVIRONMENT,
  forward,
  observedFact,
} from "./campaign-test-helpers.js";

const CONTENT_VERSION = "wp4-knowledge-campaign-v1";

function loseAtCapeVerde(state: CampaignState): CampaignState {
  state = forward(state, { type: "careen_day_at_cape_verde" });
  state = forward(state, { type: "careen_day_at_cape_verde" });
  expect(state.activeExpedition?.journey.journey.outcome?.id).toBe("objective_failure");
  return state;
}

function finalize(state: CampaignState): CampaignState {
  return executeCampaignCommand(state, { type: "finalize_expedition" });
}

function start(state: CampaignState, runSeed: string): CampaignState {
  return executeCampaignCommand(state, { type: "start_expedition", runSeed });
}

function outfitAndDepart(state: CampaignState): CampaignState {
  state = forward(state, {
    type: "set_lisbon_outfitting",
    allocation: {
      waterKg: 20_000,
      provisionsKg: 12_000,
      repairStoresKg: 4_000,
      medicineKg: 1_000,
    },
  });
  return forward(state, { type: "depart_lisbon" });
}

function goToCapeVerde(state: CampaignState): CampaignState {
  state = forward(state, { type: "set_heading", heading: "SW" }, CAMPAIGN_ROUTE_ENVIRONMENT);
  state = forward(state, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
  return forward(state, { type: "enter_cape_verde_port" }, CAMPAIGN_ROUTE_ENVIRONMENT);
}

function returnFromCapeVerde(state: CampaignState): CampaignState {
  state = forward(state, { type: "leave_cape_verde_port" }, CAMPAIGN_ROUTE_ENVIRONMENT);
  state = forward(state, { type: "set_heading", heading: "NE" }, CAMPAIGN_ROUTE_ENVIRONMENT);
  return forward(state, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
}

function currentObservation(runNumber: number, date: string): CampaignFact {
  return journeyFactToCampaignFact({
    id: "fact.south-atlantic-current-hypothesis",
    type: "current",
    status: "observed",
    confidence: 40,
    source: "dead-reckoning discrepancy",
    observedDate: date,
    claim: "A sustained current may set the ship eastward in the South Atlantic.",
  }, runNumber);
}

function confirmedCurrent(): CampaignFact {
  return mergeCampaignFacts([
    currentObservation(1, "1488-04-10"),
    currentObservation(2, "1488-05-10"),
    currentObservation(2, "1488-05-20"),
  ]).find((fact) => fact.id === SOUTH_ATLANTIC_CURRENT_ID)!;
}

describe("WP4 campaign facts, report deposit, and outcomes", () => {
  it("starts with exactly Lisbon, Cape Verde, its port, and the broad Cape rumour, with no current", () => {
    const state = createCampaign({ contentVersion: CONTENT_VERSION });
    expect(state.format).toBe(CAMPAIGN_STATE_FORMAT);
    expect(state.facts.map((fact) => [fact.id, fact.confidence, fact.status])).toEqual([
      [LANDMARK_IDS.capeGoal, 25, "rumoured"],
      [LANDMARK_IDS.capeVerde, 90, "confirmed"],
      [LANDMARK_IDS.lisbon, 100, "confirmed"],
      ["port.cape-verde", 90, "confirmed"],
    ]);
    expect(state.facts.some((fact) => fact.type === "current")).toBe(false);
  });

  it("allows report deposit only at Cape Verde", () => {
    const sea = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "deposit-location",
      journey: { location: "at_sea", dailyEventChancePermille: 0 },
    });
    expect(() => executeCampaignCommand(sea, { type: "deposit_report_at_cape_verde" })).toThrow("only at Cape Verde");

    const port = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "deposit-port",
      journey: { location: "cape_verde", dailyEventChancePermille: 0 },
    });
    expect(executeCampaignCommand(port, { type: "deposit_report_at_cape_verde" }).activeExpedition?.reportSnapshot).not.toBeNull();
  });

  it("blocks pending-event and terminal deposits atomically", () => {
    let pending = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "pending-deposit",
      journey: { location: "cape_verde", dailyEventChancePermille: 1_000 },
    });
    pending = forward(pending, { type: "careen_day_at_cape_verde" });
    expect(pending.activeExpedition?.journey.journey.pendingEvent).not.toBeNull();
    const pendingBytes = canonicalCampaignState(pending);
    expect(() => executeCampaignCommand(pending, { type: "deposit_report_at_cape_verde" })).toThrow("pending event");
    expect(canonicalCampaignState(pending)).toBe(pendingBytes);

    let terminal = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "terminal-deposit",
      journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0 },
    });
    terminal = loseAtCapeVerde(terminal);
    const terminalBytes = canonicalCampaignState(terminal);
    expect(() => executeCampaignCommand(terminal, { type: "deposit_report_at_cape_verde" })).toThrow("terminal");
    expect(canonicalCampaignState(terminal)).toBe(terminalBytes);
  });

  it("deposits without consuming any of the three v4 PRNG streams", () => {
    const before = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "deposit-prng",
      journey: { location: "cape_verde", dailyEventChancePermille: 0 },
    });
    const after = executeCampaignCommand(before, { type: "deposit_report_at_cape_verde" });
    expect(after.activeExpedition?.journey.prng).toEqual(before.activeExpedition?.journey.prng);
    expect(after.activeExpedition?.journey.navigation.environmentPrng).toEqual(before.activeExpedition?.journey.navigation.environmentPrng);
    expect(after.activeExpedition?.journey.journey.eventPrng).toEqual(before.activeExpedition?.journey.journey.eventPrng);
    expect(after.activeExpedition?.journey.truePosition).toEqual(before.activeExpedition?.journey.truePosition);
  });

  it("replaces a prior snapshot with one newer complete snapshot", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "replacement",
      journey: { location: "cape_verde", dailyEventChancePermille: 0 },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    const first = state.activeExpedition!.reportSnapshot!;
    state = forward(state, { type: "purchase_cape_verde_rumour" });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    const second = state.activeExpedition!.reportSnapshot!;
    expect(second.facts.length).toBe(first.facts.length + 1);
    expect(second.snapshotHash).not.toBe(first.snapshotHash);
    expect(Array.isArray(state.activeExpedition?.reportSnapshot)).toBe(false);
  });

  it("reports every eligible fact on a safe Lisbon return", () => {
    const newFact = observedFact("fact.safe-return");
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "safe-return",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: 0 },
        estimatedPosition: { xMnm: 0, yMnm: 0 },
        dailyEventChancePermille: 0,
        facts: [newFact],
      },
    });
    state = forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    state = finalize(state);
    expect(state.completedRuns[0]?.outcome).toBe("partial_return");
    expect(state.facts.some((fact) => fact.id === newFact.id)).toBe(true);
    expect(state.afterActionReports[0]?.factsReported.some((fact) => fact.id === newFact.id)).toBe(true);
  });

  it("preserves only the latest snapshot on ship loss", () => {
    const initialFact = observedFact("fact.first-snapshot");
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "latest-snapshot",
      journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0, facts: [initialFact] },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    const firstHash = state.activeExpedition!.reportSnapshot!.snapshotHash;
    state = forward(state, { type: "purchase_cape_verde_rumour" });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    const last = state.activeExpedition!.reportSnapshot!;
    expect(last.snapshotHash).not.toBe(firstHash);
    state = finalize(loseAtCapeVerde(state));
    expect(state.completedRuns[0]?.reportSnapshotHash).toBe(last.snapshotHash);
    for (const fact of last.facts) expect(state.facts.some((item) => item.id === fact.id)).toBe(true);
  });

  it("marks facts learned after the final deposit as lost", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "late-fact",
      journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0 },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    state = forward(state, { type: "purchase_cape_verde_rumour" });
    const lateId = state.activeExpedition!.journey.journey.facts[0]!.id;
    state = finalize(loseAtCapeVerde(state));
    expect(state.facts.some((fact) => fact.id === lateId)).toBe(false);
    expect(state.afterActionReports[0]?.factsLostWithShip.some((fact) => fact.id === lateId)).toBe(true);
  });

  it("persists no new facts after a loss without a deposit", () => {
    const lostFact = observedFact("fact.no-deposit");
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "no-deposit",
      journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0, facts: [lostFact] },
    });
    state = finalize(loseAtCapeVerde(state));
    expect(state.facts.some((fact) => fact.id === lostFact.id)).toBe(false);
  });

  it("does not turn an early pre-Cape deposit into report success", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "early-report",
      journey: { location: "cape_verde", hullBps: 0, objectiveAchieved: false, dailyEventChancePermille: 0 },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    state = finalize(loseAtCapeVerde(state));
    expect(state.completedRuns[0]?.outcome).toBe("objective_failure");
  });

  it("creates campaign-layer report success after a post-Cape deposit and later ship loss", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "post-cape-report",
      journey: { location: "cape_verde", hullBps: 0, objectiveAchieved: true, dailyEventChancePermille: 0 },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    state = finalize(loseAtCapeVerde(state));
    expect(state.completedRuns[0]?.outcome).toBe("report_success");
    expect(state.afterActionReports[0]?.outcome).toBe("report_success");
    expect(state.afterActionReports[0]?.objectiveStatus).toBe("achieved");
  });
});

describe("WP4 deterministic fact merging", () => {
  const fact = (
    runNumber: number,
    date: string,
    confidence: number,
    status: JourneyFact["status"],
    claim: string,
  ) => journeyFactToCampaignFact({
    id: "fact.cape-merge",
    type: "rumour",
    status,
    confidence,
    source: `source-${runNumber}-${date}`,
    observedDate: date,
    claim,
  }, runNumber);

  it("strengthens matching evidence with an order-independent canonical result", () => {
    const first = fact(1, "1488-04-10", 40, "observed", "The same claim.");
    const second = fact(2, "1488-05-10", 40, "observed", "The same claim.");
    const forwardMerge = mergeCampaignFacts([first, second]);
    const reverseMerge = mergeCampaignFacts([second, first]);
    expect(forwardMerge[0]?.confidence).toBe(65);
    expect(canonicalCampaignState({
      ...createCampaign({ contentVersion: CONTENT_VERSION }),
      facts: mergeCampaignFacts([...createCampaign({ contentVersion: CONTENT_VERSION }).facts, ...forwardMerge]),
    })).toBe(canonicalCampaignState({
      ...createCampaign({ contentVersion: CONTENT_VERSION }),
      facts: mergeCampaignFacts([...createCampaign({ contentVersion: CONTENT_VERSION }).facts, ...reverseMerge]),
    }));
  });

  it("does not let a weaker rumour replace confirmed matching information", () => {
    const confirmed = fact(1, "1488-04-10", 80, "confirmed", "A reliable claim.");
    const rumour = fact(2, "1488-05-10", 10, "rumoured", "A reliable claim.");
    const merged = mergeCampaignFacts([confirmed, rumour])[0]!;
    expect(merged.status).toBe("confirmed");
    expect(merged.confidence).toBeGreaterThanOrEqual(80);
  });

  it("retains disproved and conflicting evidence instead of silently overwriting it", () => {
    const rumour = fact(1, "1488-04-10", 25, "rumoured", "An island lies west.");
    const disproved = fact(2, "1488-05-10", 80, "disproved", "No island was found.");
    const merged = mergeCampaignFacts([rumour, disproved])[0]!;
    expect(merged.status).toBe("disproved");
    expect(merged.evidence).toHaveLength(2);
    expect(new Set(merged.evidence.map((item) => JSON.stringify(item.claimedValue))).size).toBe(2);
  });

  it("makes duplicate reporting idempotent", () => {
    const once = fact(1, "1488-04-10", 55, "observed", "A stable claim.");
    expect(mergeCampaignFacts([once, once])).toEqual(mergeCampaignFacts([once]));
  });
});

describe("WP4 truth boundary, after-action data, and expedition inheritance", () => {
  it("omits active true track, hidden trace, snapshots, and PRNG state from the campaign player view", () => {
    const state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "projection",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 123_456, yMnm: -2_345_678 },
        estimatedPosition: { xMnm: 111_000, yMnm: -2_300_000 },
        dailyEventChancePermille: 0,
      },
    });
    const encoded = JSON.stringify(getCampaignPlayerView(state));
    expect(encoded).not.toContain("truePosition");
    expect(encoded).not.toContain("trueTrack");
    expect(encoded).not.toContain("hiddenTrace");
    expect(encoded).not.toContain("snapshotHash");
    expect(encoded).not.toContain("eventPrng");
    expect(encoded).not.toContain("environmentPrng");
    expect(encoded).not.toContain('"prng"');
    expect(encoded).not.toContain("123456");
  });

  it("reveals estimated and true tracks only in a finalized after-action report", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "truth-report",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: 0 },
        estimatedPosition: { xMnm: 50_000, yMnm: 0 },
        dailyEventChancePermille: 0,
      },
    });
    state = forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    state = finalize(state);
    const report = state.afterActionReports[0]!;
    expect(report.estimatedTrack.length).toBeGreaterThan(0);
    expect(report.trueTrack.length).toBe(report.estimatedTrack.length);
    expect(report.uncertaintyHistory.length).toBe(report.trueTrack.length);
    expect(JSON.stringify(getCampaignPlayerView(state))).toContain("trueTrack");
  });

  it("explains current contribution only when reported evidence supports it", () => {
    const makeLoss = (facts: readonly CampaignFact[]) => {
      let state = createCampaignFixtureState({
        contentVersion: CONTENT_VERSION,
        runSeed: `current-explanation-${facts.length}`,
        facts,
        journey: {
          location: "at_sea",
          truePosition: { xMnm: 0, yMnm: -2_000_000 },
          estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
          heading: "E",
          waterKg: 0,
          healthBps: 2_000,
          dailyEventChancePermille: 0,
        },
      });
      state = forward(state, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
      state = forward(state, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
      return finalize(state).afterActionReports[0]!;
    };
    const unexplained = makeLoss([]);
    expect(unexplained.currentContributionHistory.length).toBeGreaterThan(0);
    expect(unexplained.currentContributionHistory.every((point) => point.explanation === "unexplained_route_divergence")).toBe(true);
    expect(JSON.stringify(unexplained.currentContributionHistory)).not.toContain("vectorMnmPerDay");

    const supported = makeLoss([confirmedCurrent()]);
    expect(supported.currentContributionHistory.every((point) => point.explanation === "supported_by_reported_evidence")).toBe(true);
    expect(JSON.stringify(supported.currentContributionHistory)).toContain("vectorMnmPerDay");
  });

  it("starts expedition 2 with only reported knowledge and never revives a lost observation", () => {
    const reported = observedFact("fact.reported-before-loss");
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "inherit-run-1",
      journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0, facts: [reported] },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    state = forward(state, { type: "purchase_cape_verde_rumour" });
    const lostId = state.activeExpedition!.journey.journey.facts.find((fact) => fact.id !== reported.id)!.id;
    state = finalize(loseAtCapeVerde(state));
    state = start(state, "inherit-run-2");
    const inheritedIds = state.activeExpedition!.inheritedFacts.map((fact) => fact.id);
    expect(inheritedIds).toContain(reported.id);
    expect(inheritedIds).not.toContain(lostId);
    expect(JSON.stringify(state.activeExpedition)).not.toContain(lostId);
  });

  it("starts expedition 3 with accumulated reported facts and no hard three-run cap", () => {
    const firstFact = observedFact("fact.run-one-report");
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "three-run-1",
      journey: { location: "cape_verde", hullBps: 0, dailyEventChancePermille: 0, facts: [firstFact] },
    });
    state = executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" });
    state = finalize(loseAtCapeVerde(state));

    state = outfitAndDepart(start(state, "three-run-2"));
    state = goToCapeVerde(state);
    state = forward(state, { type: "purchase_cape_verde_rumour" }, CAMPAIGN_ROUTE_ENVIRONMENT);
    const secondFactId = state.activeExpedition!.journey.journey.facts[0]!.id;
    state = returnFromCapeVerde(state);
    state = finalize(state);

    state = start(state, "three-run-3");
    const runThreeIds = state.activeExpedition!.inheritedFacts.map((fact) => fact.id);
    expect(runThreeIds).toContain(firstFact.id);
    expect(runThreeIds).toContain(secondFactId);

    // Consecutive runs are unbounded; this reaches run four after a focused partial return.
    state = outfitAndDepart(state);
    state = forward(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    state = finalize(state);
    state = start(state, "three-run-4");
    expect(state.activeExpedition?.runNumber).toBe(4);
  });

  it("automatically applies confirmed inherited current knowledge to estimated movement", () => {
    const facts = [confirmedCurrent()];
    let known = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "known-current",
      facts,
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: -2_000_000 },
        estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
        heading: "E",
        dailyEventChancePermille: 0,
      },
    });
    let unknown = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "unknown-current",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: -2_000_000 },
        estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
        heading: "E",
        dailyEventChancePermille: 0,
      },
    });
    known = forward(known, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
    unknown = forward(unknown, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
    expect(known.activeExpedition?.journey.estimatedPosition.xMnm).toBe(18_000);
    expect(unknown.activeExpedition?.journey.estimatedPosition.xMnm).toBe(0);
    expect(known.activeExpedition?.journey.truePosition.xMnm).toBe(18_000);
  });

  it("keeps failed campaign commands byte-atomic", () => {
    const state = createCampaign({ contentVersion: CONTENT_VERSION });
    const before = hashCampaignState(state);
    expect(() => executeCampaignCommand(state, { type: "deposit_report_at_cape_verde" })).toThrow("no expedition");
    expect(hashCampaignState(state)).toBe(before);
  });
});
