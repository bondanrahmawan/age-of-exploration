// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTHORED_EVENTS, createCampaignFixtureState, executeCampaignCommand, executeForwardedSimulationCommand, serializeCampaignSave } from "../src/index.js";
import { App } from "../app/App.js";
import { InterruptScreen } from "../app/components/InterruptScreen.js";
import { GameController, type GameActions } from "../app/controller.js";
import { FixedSeedSource } from "../app/seed.js";
import { CAMPAIGN_SAVE_KEY, CampaignSaveRepository, MemoryKeyValueStorage, PreferenceRepository } from "../app/storage.js";
import type { InterruptViewModel } from "../app/view-model.js";
import { NO_MOVEMENT_ENVIRONMENT } from "./campaign-test-helpers.js";

afterEach(() => cleanup());

function controller(storage = new MemoryKeyValueStorage()) {
  return new GameController(
    new CampaignSaveRepository(storage),
    new PreferenceRepository(storage),
    new FixedSeedSource(["dom-seed-1", "dom-seed-2", "dom-seed-3"]),
    { contentVersion: "base-game-v1", dailyEventChancePermille: 0, environmentProvider: NO_MOVEMENT_ENVIRONMENT },
  );
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
    fireEvent.click(screen.getByRole("button", { name: "Begin new local campaign" }));
    const water = screen.getByLabelText(/Water tonnes/);
    fireEvent.input(water, { target: { value: "25" } });
    expect(screen.getByText(/Lisbon stock and ship cap/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Depart Lisbon" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders an active accessible chart with estimate, numeric uncertainty, legend, and keyboard-focusable known symbols", () => {
    const game = controller();
    game.beginNewCampaign();
    game.outfitAndDepart({ waterKg: 20_000, provisionsKg: 16_000, repairStoresKg: 4_000, medicineKg: 0 });
    const { container } = render(<App controller={game} />);
    expect(screen.getByText(/Uncertainty ±\d+ nm east–west/)).toBeTruthy();
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
    expect(within(screen.getByLabelText("Heading")).getAllByRole("option")).toHaveLength(16);
    expect(within(screen.getByLabelText("Sailing policy")).getAllByRole("option")).toHaveLength(3);
    expect(within(screen.getByLabelText("Ration policy")).getAllByRole("option")).toHaveLength(4);
    fireEvent.keyDown(document, { key: "d" });
    expect(game.view().expedition?.deck.elapsedDays).toBe(1);
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
      date: "1488-04-02", elapsedDays: 1, mission: { milestone: "Use Cape Verde and choose the next leg", status: "Cape recognition is still required." }, lastResult: null,
      stores: { waterKg: 1_000, provisionsKg: 1_000, repairStoresKg: 1_000, medicineKg: 0 },
      stock: { waterKg: 24_000, provisionsKg: 12_000, repairStoresKg: 4_000, medicineKg: 500 }, moneyDucats: 100,
      ship: { hullBps: 9_000, mastBps: 9_000, sailsBps: 9_000, rudderBps: 9_000 }, crew: { count: 25, able: 25, healthBps: 9_000, moraleBps: 7_500 },
      careeningDaysCompleted: 0, foulingSpeedLossBps: 100, rumourPurchased: false, reportDeposited: false,
      capeSurveyDaysCompleted: 0, capeSurveyed: false, capeWaterKnown: false, holdRemainingKg: 40_000,
      outcomeReason: null, statusMessage: null, warnings: [], canRecogniseCape: false, canEnterCapeVerde: false, canDismiss: false, survivalStatus: "active", eventId: null,
    };
    const view = render(<InterruptScreen model={base} autosaveBoundary="Day 1 boundary" controller={fake} />);
    for (const name of [/Buy Water/, /Buy Provisions/, /Buy Repair stores/, /Buy Medicine/, /Rest ashore/, /Careen one day/, /Buy a seeded rumour/, /Deposit report snapshot/, /Turn home/, /Depart Cape Verde/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    view.rerender(<InterruptScreen model={{ ...base, kind: "cape", title: "Cape", location: "cape", stock: null, capeWaterKnown: true }} autosaveBoundary="Day 2 boundary" controller={fake} />);
    for (const name of [/Survey one full day/, /Collect legal Cape water/, /Turn home/, /Leave the Cape/]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("renders actual-track comparison only after the campaign is finalized", () => {
    let state = createCampaignFixtureState({
      contentVersion: "base-game-v1",
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
