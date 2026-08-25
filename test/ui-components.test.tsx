// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTHORED_EVENTS, HEADINGS, createCampaignFixtureState, executeCampaignCommand, executeForwardedSimulationCommand, serializeCampaignSave, type CampaignState } from "../src/index.js";
import { App } from "../app/App.js";
import { AfterActionScreen } from "../app/components/AfterActionScreen.js";
import { InterruptScreen } from "../app/components/InterruptScreen.js";
import { GameController, type GameActions } from "../app/controller.js";
import { FixedSeedSource } from "../app/seed.js";
import { CAMPAIGN_SAVE_KEY, CampaignSaveRepository, MemoryKeyValueStorage, PreferenceRepository } from "../app/storage.js";
import { pointOfSailFor } from "../app/view-model.js";
import type { InterruptViewModel, RecordStakesViewModel, ReportViewModel } from "../app/view-model.js";
import { CAMPAIGN_ROUTE_ENVIRONMENT, NO_MOVEMENT_ENVIRONMENT } from "./campaign-test-helpers.js";

afterEach(() => cleanup());

const NOTHING_AT_RISK: RecordStakesViewModel = {
  headline: "Nothing yet to lose",
  detail: "The crew has found nothing this voyage that the chart does not already hold.",
  atRisk: 0,
  deposited: false,
};

function controller(storage = new MemoryKeyValueStorage()) {
  return new GameController(
    new CampaignSaveRepository(storage),
    new PreferenceRepository(storage),
    new FixedSeedSource(["dom-seed-1", "dom-seed-2", "dom-seed-3"]),
    { contentVersion: "base-game-v2", dailyEventChancePermille: 0, environmentProvider: NO_MOVEMENT_ENVIRONMENT },
  );
}

/** Resumes a controller on a hand-built campaign state, as a returning player would. */
function resumed(state: Readonly<CampaignState>) {
  const storage = new MemoryKeyValueStorage();
  storage.setItem(CAMPAIGN_SAVE_KEY, serializeCampaignSave(state));
  const game = controller(storage);
  game.resumeCampaign();
  return game;
}

/** A voyage whose route divergence the chart never explains, run until the crew fails. */
function unexplainedRun(): CampaignState {
  let state = createCampaignFixtureState({
    contentVersion: "base-game-v2",
    runSeed: "dom-unexplained-run",
    journey: {
      location: "at_sea",
      truePosition: { xMnm: 0, yMnm: -2_000_000 },
      estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
      heading: "E",
      waterKg: 20_000,
      provisionsKg: 0,
      dailyEventChancePermille: 0,
    },
  });
  while (state.activeExpedition?.journey.journey.outcome === null) {
    state = executeForwardedSimulationCommand(state, { type: "advance_day" }, CAMPAIGN_ROUTE_ENVIRONMENT);
  }
  return executeCampaignCommand(state, { type: "finalize_expedition" });
}

describe("WP5 accessible product surfaces", () => {
  it("renders the outfitting product screen with explicit new/resume controls and adjacent validation", () => {
    const game = controller();
    const { container } = render(<App controller={game} />);
    expect(container.querySelectorAll("[data-screen]")).toHaveLength(1);
    expect(container.querySelector("[data-screen='outfitting']")).not.toBeNull();
    expect(container.textContent).not.toContain("Age of Exploration");
    expect(container.textContent).not.toContain("The Uncertain Sea");
    expect(container.textContent).not.toContain("Local only · deterministic commands · no telemetry or network play");
    fireEvent.click(screen.getByRole("button", { name: "Start a new campaign" }));
    const water = screen.getByLabelText(/Water tonnes/);
    fireEvent.input(water, { target: { value: "25" } });
    expect(screen.getByText(/is the most Lisbon can supply/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Depart Lisbon" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders an active accessible chart with estimate, numeric uncertainty, legend, and keyboard-focusable known symbols", () => {
    const game = controller();
    game.beginNewCampaign();
    game.outfitAndDepart({ waterKg: 20_000, provisionsKg: 16_000, repairStoresKg: 4_000, medicineKg: 0 });
    const { container } = render(<App controller={game} />);
    expect(screen.getByText(/could be up to ±\d+ nm east–west/)).toBeTruthy();
    expect(screen.getByText(/where the crew believes it sailed/)).toBeTruthy();
    expect(screen.getByText(/Hatched uncertainty/)).toBeTruthy();
    expect(screen.getByText(/pinned to the edge with its distance/)).toBeTruthy();
    expect(screen.getByText(/Position is estimated/i)).toBeTruthy();
    expect(screen.getByText(/how wrong the estimate may be, not a coastline/i)).toBeTruthy();
    expect(screen.getByText(/Recognise the Cape region/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Set orders, then sail" })).toBeTruthy();
    expect(container.querySelectorAll("svg [role='img']").length).toBeGreaterThan(0);
    const dom = container.innerHTML;
    for (const forbidden of ["truePosition", "hiddenTrace", "eventPrng", "environmentPrng", "unknown current vector", "event weights"]) {
      expect(dom).not.toContain(forbidden);
    }
  });

  it("exposes all sixteen headings, three sailing policies, ration controls, day advance, and keyboard day advance", () => {
    const game = controller();
    game.beginNewCampaign();
    game.outfitAndDepart({ waterKg: 20_000, provisionsKg: 16_000, repairStoresKg: 4_000, medicineKg: 0 });
    render(<App controller={game} />);
    const rose = screen.getByRole("radiogroup", { name: "Heading" });
    expect(within(rose).getAllByRole("radio")).toHaveLength(16);
    expect(within(screen.getByLabelText("Sailing policy")).getAllByRole("option")).toHaveLength(3);
    expect(within(screen.getByLabelText("Ration policy")).getAllByRole("option")).toHaveLength(4);
    fireEvent.keyDown(document, { key: "d" });
    expect(game.view().expedition?.deck.elapsedDays).toBe(1);
  });

  it("shades every compass point by the point of sail it would give, and steers to a chosen point", () => {
    const game = controller();
    game.beginNewCampaign();
    game.outfitAndDepart({ waterKg: 20_000, provisionsKg: 16_000, repairStoresKg: 4_000, medicineKg: 0 });
    render(<App controller={game} />);
    const rose = screen.getByRole("radiogroup", { name: "Heading" });
    const wind = game.view().expedition!.deck.wind;

    for (const heading of HEADINGS) {
      const expected = pointOfSailFor(heading, wind.fromHeading);
      expect(within(rose).getByRole("radio", { name: `${heading} — ${expected.label}` })).toBeTruthy();
    }

    fireEvent.click(within(rose).getByRole("radio", { name: /^SW —/ }));
    expect(game.view().expedition?.deck.heading).toBe("SW");
    expect(within(rose).getByRole("radio", { name: /^SW —/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("turns the ship one compass point at a time from the keyboard", () => {
    const game = controller();
    game.beginNewCampaign();
    game.outfitAndDepart({ waterKg: 20_000, provisionsKg: 16_000, repairStoresKg: 4_000, medicineKg: 0 });
    render(<App controller={game} />);
    const rose = screen.getByRole("radiogroup", { name: "Heading" });
    const before = game.view().expedition!.deck.heading;
    const clockwise = HEADINGS[(HEADINGS.indexOf(before) + 1) % HEADINGS.length];

    fireEvent.keyDown(within(rose).getByRole("radio", { name: `${before} — ${pointOfSailFor(before, game.view().expedition!.deck.wind.fromHeading).label}` }), { key: "ArrowRight" });
    expect(game.view().expedition?.deck.heading).toBe(clockwise);
  });

  it("renders every authored event choice as a native decision control, including disabled reasons", () => {
    const chooseEvent = vi.fn();
    const fake = { chooseEvent } as unknown as GameActions;
    for (const event of AUTHORED_EVENTS) {
      cleanup();
      const choices = event.choices.map((choice, index) => ({
        id: choice.id,
        label: choice.label,
        available: index !== 0,
        reason: index === 0 ? "Focused disabled-reason proof." : null,
        knownConsequence: choice.immediateLogText,
        knownRequirement: "Focused requirement rendering proof.",
      }));
      const model = {
        kind: "event",
        title: event.title,
        description: event.logText,
        date: "1488-04-02",
        elapsedDays: 1,
        mission: { milestone: "Reach or use Cape Verde", status: "Cape recognition is still required." },
        record: NOTHING_AT_RISK,
        lastResult: null,
        choices,
        location: "at_sea",
        stores: { waterKg: 1_000, provisionsKg: 1_000, repairStoresKg: 1_000, medicineKg: 1_000 },
        stock: null,
        moneyDucats: 10,
        ship: { hullBps: 10_000, mastBps: 10_000, sailsBps: 10_000, rudderBps: 10_000 },
        crew: { count: 25, able: 25, healthBps: 10_000, moraleBps: 7_500 },
        careeningDaysCompleted: 0,
        foulingSpeedLossBps: 0,
        rumourPurchased: false,
        reportDeposited: false,
        capeSurveyDaysCompleted: 0,
        capeSurveyed: false,
        capeWaterKnown: false,
        holdRemainingKg: 10_000,
        outcomeReason: null,
        statusMessage: null,
        warnings: [],
        canRecogniseCape: false,
        canEnterCapeVerde: false,
        canDismiss: false,
        survivalStatus: "active",
        eventId: event.id,
      } satisfies InterruptViewModel;
      render(<InterruptScreen model={model} autosaveBoundary="Pending event decision" controller={fake} />);
      expect(screen.getAllByRole("button")).toHaveLength(event.choices.length);
      expect(screen.getByText(/Focused disabled-reason proof/)).toBeTruthy();
      expect((screen.getByRole("button", { name: event.choices[0]!.label }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("maps every Cape Verde and Cape action to visible keyboard-operable controls", () => {
    const fake = {
      purchaseAtCapeVerde: vi.fn(), repair: vi.fn(), dispatchSimulation: vi.fn(), depositReport: vi.fn(), dismissSoftInterrupt: vi.fn(),
    } as unknown as GameActions;
    const base: InterruptViewModel = {
      kind: "cape_verde", title: "Cape Verde", description: "Port", choices: [], location: "cape_verde",
      date: "1488-04-02", elapsedDays: 1, mission: { milestone: "Use Cape Verde and choose the next leg", status: "Cape recognition is still required." },
      record: NOTHING_AT_RISK, lastResult: null,
      stores: { waterKg: 1_000, provisionsKg: 1_000, repairStoresKg: 1_000, medicineKg: 0 },
      stock: { waterKg: 24_000, provisionsKg: 12_000, repairStoresKg: 4_000, medicineKg: 500 }, moneyDucats: 100,
      ship: { hullBps: 9_000, mastBps: 9_000, sailsBps: 9_000, rudderBps: 9_000 }, crew: { count: 25, able: 25, healthBps: 9_000, moraleBps: 7_500 },
      careeningDaysCompleted: 0, foulingSpeedLossBps: 100, rumourPurchased: false, reportDeposited: false,
      capeSurveyDaysCompleted: 0, capeSurveyed: false, capeWaterKnown: false, holdRemainingKg: 40_000,
      outcomeReason: null, statusMessage: null, warnings: [], canRecogniseCape: false, canEnterCapeVerde: false, canDismiss: false, survivalStatus: "active", eventId: null,
    };
    const view = render(<InterruptScreen model={base} autosaveBoundary="Day 1 boundary" controller={fake} />);
    for (const name of [/Buy water/, /Buy provisions/, /Buy repair stores/, /Buy medicine/, /Rest the crew ashore/, /Careen the hull/, /Buy a rumour/, /Leave a copy of the report/, /Turn home/, /Depart Cape Verde/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    view.rerender(<InterruptScreen model={{ ...base, kind: "cape", title: "Cape", location: "cape", stock: null, capeWaterKnown: true }} autosaveBoundary="Day 2 at sea" controller={fake} />);
    for (const name of [/Survey the coast/, /Take on water/, /Turn home/, /Leave the Cape/]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("keeps sailing at the helm when a deck warning has no answer, and still shows it in the briefing", () => {
    const game = resumed(createCampaignFixtureState({
      contentVersion: "base-game-v2",
      runSeed: "dom-actionless-warning",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: -2_000_000 },
        estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
        hullBps: 1_000,
        repairStoresKg: 0,
        dailyEventChancePermille: 0,
      },
    }));
    game.advanceOneDay();
    const { container } = render(<App controller={game} />);

    expect(container.querySelector("[data-screen='expedition']")).not.toBeNull();
    expect(container.querySelector("[data-screen='interrupt']")).toBeNull();
    expect(within(screen.getByLabelText("Active warnings")).getByText(/Hull condition is critical/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sail one day/ })).toBeTruthy();
  });

  it("halts on the same warning once the hold carries repair stores, and offers the repair", () => {
    const game = resumed(createCampaignFixtureState({
      contentVersion: "base-game-v2",
      runSeed: "dom-answerable-warning",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: 0, yMnm: -2_000_000 },
        estimatedPosition: { xMnm: 0, yMnm: -2_000_000 },
        hullBps: 1_000,
        repairStoresKg: 2_000,
        dailyEventChancePermille: 0,
      },
    }));
    game.advanceOneDay();
    const { container } = render(<App controller={game} />);

    expect(container.querySelector("[data-screen='interrupt']")).not.toBeNull();
    expect((screen.getByRole("button", { name: /Repair the hull/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Back to the helm/ })).toBeTruthy();
  });

  it("states a wholly unexplained evidence boundary once instead of one line per day", () => {
    const state = unexplainedRun();
    const days = state.afterActionReports[0]!.elapsedCommittedDays;
    render(<App controller={resumed(state)} />);

    const section = screen.getByLabelText("Why the two tracks differ");
    expect(section.querySelectorAll("li")).toHaveLength(0);
    expect(within(section).getByText(
      `No reported evidence explains the difference on any of the ${days} recorded days, day 1 to day ${days}.`,
    )).toBeTruthy();
    expect(section.textContent).not.toContain("route divergence");
  });

  it("keeps every supported evidence line and collapses only the unexplained runs between them", () => {
    const report = {
      runNumber: 1,
      outcome: "Partial Return",
      reason: "The expedition returned without the Cape.",
      departureDate: "1488-04-01",
      finalDate: "1488-10-05",
      elapsedDays: 187,
      objectiveStatus: "Not Achieved",
      objectiveStatusNote: "the Cape was never sighted",
      outcomeExplanation: "The Cape was never sighted. The ship came home, so every finding the crew did make reached the chart at the strength they recorded it.",
      metrics: [],
      waterConsumedKg: 1_000,
      provisionsConsumedKg: 1_000,
      factsObserved: [],
      factsReported: [],
      factsDisproved: [],
      factsLost: [],
      factsSalvaged: [],
      reportSnapshotDay: null,
      estimatedTrack: [],
      trueTrack: [],
      uncertaintyHistory: [],
      currentExplanations: [
        { kind: "unexplained", fromDay: 1, toDay: 26, dayCount: 26, text: "Days 1-26: route divergence unexplained (26 days)." },
        { kind: "supported", day: 27, text: "Day 27: reported evidence supports a current contribution of 1.5 nm east/west and 0.0 nm north/south." },
        { kind: "unexplained", fromDay: 28, toDay: 187, dayCount: 160, text: "Days 28-187: route divergence unexplained (160 days)." },
      ],
      currentExplanationSummary: null,
      observations: [
        { day: 40, text: "1488-05-11 — open ocean, no coast within 900 nm: the east-west band stayed at 480 nm." },
        { day: 90, text: "1488-06-30 — land signs, a coast within 600 nm: the east-west band closed from 1120 nm to 600 nm, and the reckoning shifted 340 nm east." },
      ],
      inheritedDifferences: [],
    } satisfies ReportViewModel;
    const fake = { prepareNextExpedition: vi.fn() } as unknown as GameActions;
    render(<AfterActionScreen report={report} autosaveBoundary="Between expeditions" controller={fake} />);

    const section = screen.getByLabelText("Why the two tracks differ");
    expect(section.querySelectorAll("li")).toHaveLength(3);
    expect(within(section).getByText(/Day 27: reported evidence supports/)).toBeTruthy();
    expect(within(section).getByText("Days 28-187: route divergence unexplained (160 days).")).toBeTruthy();
  });

  it("explains a headline outcome that disagrees with the objective it reports", () => {
    const report = {
      runNumber: 2,
      outcome: "Objective Failure",
      reason: "The pooled crew is unable to continue the expedition.",
      departureDate: "1488-04-01",
      finalDate: "1488-10-05",
      elapsedDays: 187,
      objectiveStatus: "Achieved",
      objectiveStatusNote: "found, but the proof was lost",
      outcomeExplanation: "The Cape was found and the proof did not survive. No copy of the report was ashore when the expedition ended, so nothing the crew wrote at the Cape came home in writing. Word of it reached Lisbon second-hand and stands at 65 — enough for the next voyage to steer by, never enough to call the Cape discovered.",
      metrics: [],
      waterConsumedKg: 1_000,
      provisionsConsumedKg: 1_000,
      factsObserved: [],
      factsReported: [],
      factsDisproved: [],
      factsLost: [],
      factsSalvaged: [],
      reportSnapshotDay: null,
      estimatedTrack: [],
      trueTrack: [],
      uncertaintyHistory: [],
      currentExplanations: [],
      currentExplanationSummary: null,
      observations: [],
      inheritedDifferences: [],
    } satisfies ReportViewModel;
    const fake = { prepareNextExpedition: vi.fn() } as unknown as GameActions;
    render(<AfterActionScreen report={report} autosaveBoundary="Between expeditions" controller={fake} />);

    // "Objective Failure" and "Achieved" may not sit on one screen with nothing between them.
    const hero = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(hero.textContent).toContain("The Cape was found and the proof did not survive");
    expect(hero.textContent).toContain("found, but the proof was lost");
  });

  it("briefs Cape Verde as a working port, a report drop, and what carried ducats are for", () => {
    const game = controller();
    render(<App controller={game} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a new campaign" }));
    const briefing = screen.getByText(/Cape Verde lies on the way out and on the way back/);
    expect(briefing.textContent).toContain("sells water, provisions, repair stores and medicine");
    expect(briefing.textContent).toContain("ducats you do not spend here");
    expect(briefing.textContent).toContain("a copy left there outlives the ship");
    expect(briefing.textContent).toContain("hearsay");
    expect(screen.getByText(/Ducats you do not spend here are what buys resupply at Cape Verde/)).toBeTruthy();
    // A briefing, not a chart: no hidden truth may reach the outfitting screen.
    for (const forbidden of ["truePosition", "hiddenTrace", "trueCurrent", "eventPrng"]) {
      expect(document.body.innerHTML).not.toContain(forbidden);
    }
  });

  it("shows findings riding on an undeposited log while the voyage is still running", () => {
    const game = resumed(createCampaignFixtureState({
      contentVersion: "base-game-v2",
      runSeed: "dom-at-risk",
      journey: {
        location: "at_sea",
        truePosition: { xMnm: -300_000, yMnm: -1_000_000 },
        estimatedPosition: { xMnm: -300_000, yMnm: -1_000_000 },
        dailyEventChancePermille: 0,
        facts: [{
          id: "fact.riding-aboard",
          type: "anchorage",
          status: "observed",
          confidence: 55,
          source: "dom fixture",
          observedDate: "1488-04-01",
          claim: "A sheltered anchorage, seen once and not yet reported.",
        }],
      },
    }));
    render(<App controller={game} />);
    const record = screen.getByText("1 finding rides only aboard");
    expect(record).toBeTruthy();
    expect(screen.getByText(/No copy has been left ashore/)).toBeTruthy();
    expect(screen.getByText(/reach Lisbon as hearsay at best/)).toBeTruthy();
    expect(record.closest(".record-summary")?.className).toContain("record-at-risk");
  });

  it("names what a deposit would save on the Cape Verde port screen", () => {
    const game = resumed(createCampaignFixtureState({
      contentVersion: "base-game-v2",
      runSeed: "dom-deposit-stakes",
      journey: {
        location: "cape_verde",
        dailyEventChancePermille: 0,
        facts: [{
          id: "fact.port-side-finding",
          type: "anchorage",
          status: "observed",
          confidence: 55,
          source: "dom fixture",
          observedDate: "1488-04-01",
          claim: "A finding the port could keep safe.",
        }],
      },
    }));
    render(<App controller={game} />);
    const deposit = screen.getByRole("button", { name: /Leave a copy of the report/ });
    expect(deposit.textContent).toContain("Puts 1 finding beyond the sea’s reach");
    expect(deposit.textContent).toContain("Nothing is ashore yet.");
    fireEvent.click(deposit);
    expect(screen.getByRole("button", { name: /Leave a copy of the report/ }).textContent)
      .toContain("The copy already here holds everything the crew knows.");
  });

  it("separates salvaged findings from findings lost outright in the after-action report", () => {
    let state = createCampaignFixtureState({
      contentVersion: "base-game-v2",
      runSeed: "dom-salvage-report",
      journey: {
        location: "cape_verde",
        hullBps: 0,
        dailyEventChancePermille: 0,
        facts: [{
          id: "fact.salvaged-anchorage",
          type: "anchorage",
          status: "observed",
          confidence: 55,
          source: "dom fixture",
          observedDate: "1488-04-01",
          claim: "An anchorage word of which outlived the ship.",
        }],
      },
    });
    state = executeForwardedSimulationCommand(state, { type: "careen_day_at_cape_verde" }, NO_MOVEMENT_ENVIRONMENT);
    state = executeForwardedSimulationCommand(state, { type: "careen_day_at_cape_verde" }, NO_MOVEMENT_ENVIRONMENT);
    state = executeCampaignCommand(state, { type: "finalize_expedition" });
    render(<App controller={resumed(state)} />);
    expect(screen.getByRole("heading", { name: "Salvaged from the log" })).toBeTruthy();
    expect(screen.getByText(/each stands at reduced confidence/)).toBeTruthy();
    expect(screen.getByText("Nothing the crew saw was lost outright.")).toBeTruthy();
    expect(screen.getAllByText(/40%/).length).toBeGreaterThan(0);
  });

  it("renders actual-track comparison only after the campaign is finalized", () => {
    let state = createCampaignFixtureState({
      contentVersion: "base-game-v2",
      runSeed: "dom-final-report",
      journey: { location: "at_sea", truePosition: { xMnm: 0, yMnm: 0 }, estimatedPosition: { xMnm: 20_000, yMnm: 0 }, dailyEventChancePermille: 0 },
    });
    state = executeForwardedSimulationCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    state = executeCampaignCommand(state, { type: "finalize_expedition" });
    const storage = new MemoryKeyValueStorage();
    storage.setItem(CAMPAIGN_SAVE_KEY, serializeCampaignSave(state));
    const game = controller(storage);
    game.resumeCampaign();
    render(<App controller={game} />);
    expect(screen.getByRole("heading", { name: "Estimated and actual tracks" })).toBeTruthy();
    expect(screen.getByText("Actual track, solid with round markers")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare the next expedition" })).toBeTruthy();
  });
});
