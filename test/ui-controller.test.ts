import { describe, expect, it } from "vitest";
import {
  createCampaignFixtureState,
  executeCampaignCommand,
  executeForwardedSimulationCommand,
  getCampaignPlayerView,
  hashCampaignState,
  serializeCampaignSave,
  type StoresState,
} from "../src/index.js";
import { GameController } from "../app/controller.js";
import { FixedSeedSource } from "../app/seed.js";
import {
  CAMPAIGN_SAVE_KEY,
  CampaignSaveRepository,
  MemoryKeyValueStorage,
  PreferenceRepository,
} from "../app/storage.js";
import { PRODUCT_SCREENS, validateOutfitting } from "../app/view-model.js";
import { CAMPAIGN_ROUTE_ENVIRONMENT, NO_MOVEMENT_ENVIRONMENT } from "./campaign-test-helpers.js";

const CONTENT_VERSION = "base-game-v2";
const VALID_ALLOCATION: StoresState = {
  waterKg: 24_000,
  provisionsKg: 18_000,
  repairStoresKg: 6_000,
  medicineKg: 1_000,
};

const QUIET_TRANSIT_ENVIRONMENT = ((context: Parameters<typeof NO_MOVEMENT_ENVIRONMENT>[0]) => ({
  ...NO_MOVEMENT_ENVIRONMENT(context),
  id: "wp5-test:quiet-transit",
  knownCurrentMnm: { xMnm: 100_000, yMnm: 0 },
  leewayMnm: { xMnm: 100_000, yMnm: 0 },
})) as typeof NO_MOVEMENT_ENVIRONMENT;

function harness(
  seeds = ["ui-seed-1", "ui-seed-2", "ui-seed-3"],
  environmentProvider = QUIET_TRANSIT_ENVIRONMENT,
  dailyEventChancePermille = 0,
) {
  const storage = new MemoryKeyValueStorage();
  const controller = new GameController(
    new CampaignSaveRepository(storage),
    new PreferenceRepository(storage),
    new FixedSeedSource(seeds),
    { contentVersion: CONTENT_VERSION, dailyEventChancePermille, environmentProvider },
  );
  return { storage, controller };
}

/**
 * A campaign resumed one day short of a critical hull: the deck warning it raises is one
 * the player can answer, because there is a damaged component and repair stores to spend
 * on it. `repairStoresKg` decides whether the warning is answerable at all.
 */
function damagedHullHarness(repairStoresKg: number) {
  const state = createCampaignFixtureState({
    contentVersion: CONTENT_VERSION,
    runSeed: "damaged-hull",
    journey: {
      location: "at_sea",
      dailyEventChancePermille: 0,
      hullBps: 1_000,
      repairStoresKg,
      waterKg: 20_000,
      provisionsKg: 16_000,
    },
  });
  const storage = new MemoryKeyValueStorage();
  storage.setItem(CAMPAIGN_SAVE_KEY, serializeCampaignSave(state));
  const controller = new GameController(
    new CampaignSaveRepository(storage),
    new PreferenceRepository(storage),
    new FixedSeedSource(["unused"]),
    { contentVersion: CONTENT_VERSION, dailyEventChancePermille: 0, environmentProvider: QUIET_TRANSIT_ENVIRONMENT },
  );
  controller.resumeCampaign();
  controller.setAnimationMode("skipped");
  return { storage, controller };
}

/**
 * Sails to an answerable deck warning: the hull is critical and the hold still carries the
 * repair stores a day of repair costs.
 */
function sailToDeckWarning(controller: GameController): void {
  expect(controller.advanceOneDay()).toBe(true);
  const view = controller.view();
  expect(view.screen).toBe("interrupt");
  expect(view.interrupt?.kind).toBe("survival");
  expect(view.interrupt?.canDismiss).toBe(true);
}

describe("WP5 controller, seed, validation, and persistence boundary", () => {
  it("declares exactly the four contract screens", () => {
    expect(PRODUCT_SCREENS).toEqual(["outfitting", "expedition", "interrupt", "after_action"]);
  });

  it("validates per-store stock/caps, hold capacity, and money before dispatch", () => {
    expect(validateOutfitting(VALID_ALLOCATION).valid).toBe(true);
    const overCap = validateOutfitting({ ...VALID_ALLOCATION, medicineKg: 2_001 });
    expect(overCap.valid).toBe(false);
    expect(overCap.storeErrors.medicine).toContain("most Lisbon can supply");
    const overHold = validateOutfitting({ waterKg: 24_000, provisionsKg: 18_000, repairStoresKg: 8_000, medicineKg: 3_000 });
    expect(overHold.capacityError).toContain("over by");
    const overMoney = validateOutfitting({ waterKg: 24_000, provisionsKg: 18_000, repairStoresKg: 8_000, medicineKg: 2_000 });
    expect(overMoney.moneyError).toContain("sponsor advance");
  });

  it("does not dispatch invalid outfitting or overwrite the last valid autosave", () => {
    const { storage, controller } = harness();
    controller.beginNewCampaign();
    const before = storage.raw(CAMPAIGN_SAVE_KEY);
    expect(controller.outfitAndDepart({ ...VALID_ALLOCATION, waterKg: 24_001 })).toBe(false);
    expect(storage.raw(CAMPAIGN_SAVE_KEY)).toBe(before);
    expect(controller.view().error).toContain("Cannot depart yet");
  });

  it("generates an explicit seed once, persists it in replay data, and omits it from normal view and preview", () => {
    const { storage, controller } = harness(["fixed-explicit-seed"]);
    controller.beginNewCampaign();
    const raw = storage.raw(CAMPAIGN_SAVE_KEY)!;
    expect(raw).toContain('"runSeed":"fixed-explicit-seed"');
    expect(raw).toContain('"type":"start_expedition"');
    expect(JSON.stringify(controller.view())).not.toContain("fixed-explicit-seed");
    expect(JSON.stringify(controller.view().savePreview)).not.toContain("runSeed");
  });

  it("autosaves only successful commands and leaves the valid save intact after engine rejection", () => {
    const { storage, controller } = harness();
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    const before = storage.raw(CAMPAIGN_SAVE_KEY);
    expect(controller.depositReport()).toBe(false);
    expect(storage.raw(CAMPAIGN_SAVE_KEY)).toBe(before);
  });

  it("keeps animation and panel preferences outside canonical campaign bytes", () => {
    const { storage, controller } = harness();
    controller.beginNewCampaign();
    const before = storage.raw(CAMPAIGN_SAVE_KEY);
    controller.setAnimationMode("skipped");
    controller.selectPanel("log");
    expect(storage.raw(CAMPAIGN_SAVE_KEY)).toBe(before);
    expect(controller.view().animationMode).toBe("skipped");
    expect(controller.view().selectedPanel).toBe("log");
  });

  it("resumes a valid campaign and reports only safe boundary metadata", () => {
    const { storage, controller } = harness();
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.advanceOneDay();
    const resumed = new GameController(
      new CampaignSaveRepository(storage),
      new PreferenceRepository(storage),
      new FixedSeedSource(["unused"]),
      { contentVersion: CONTENT_VERSION, dailyEventChancePermille: 0, environmentProvider: QUIET_TRANSIT_ENVIRONMENT },
    );
    expect(resumed.view().savePreview.boundary).toContain("Day 1");
    resumed.resumeCampaign();
    expect(resumed.view().screen).toBe("expedition");
    expect(resumed.view().expedition?.deck.elapsedDays).toBe(1);
  });

  it("does not silently replace an invalid or incompatible local save", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(CAMPAIGN_SAVE_KEY, "not a campaign save");
    const controller = new GameController(
      new CampaignSaveRepository(storage),
      new PreferenceRepository(storage),
      new FixedSeedSource(["replacement-seed"]),
      { contentVersion: CONTENT_VERSION },
    );
    expect(controller.view().savePreview.kind).toBe("invalid");
    expect(storage.raw(CAMPAIGN_SAVE_KEY)).toBe("not a campaign save");
    controller.resumeCampaign();
    expect(storage.raw(CAMPAIGN_SAVE_KEY)).toBe("not a campaign save");
  });
});

describe("WP5 one-day campaign forwarding and pacing", () => {
  it("dispatches heading, policy, ration, and one-day commands through the campaign wrapper", () => {
    const { storage, controller } = harness();
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    expect(controller.setHeading("SSW")).toBe(true);
    expect(controller.setSailingPolicy("cautious")).toBe(true);
    expect(controller.setRationPolicy("reduced_provisions")).toBe(true);
    expect(controller.advanceOneDay()).toBe(true);
    const raw = storage.raw(CAMPAIGN_SAVE_KEY)!;
    expect(raw).toContain('"type":"forward_simulation_command"');
    expect(raw).toContain('"heading":"SSW"');
    expect(controller.view().expedition?.deck.elapsedDays).toBe(1);
  });

  it("advances ordinary campaign days one at a time and stops at a Cape Verde interruption", async () => {
    const { controller } = harness(["route-seed"], CAMPAIGN_ROUTE_ENVIRONMENT);
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.setHeading("SW");
    controller.setAnimationMode("skipped");
    const committed = await controller.advanceUntilInterrupted(20);
    expect(committed).toBe(1);
    expect(controller.view().screen).toBe("interrupt");
    expect(controller.view().interrupt?.canEnterCapeVerde).toBe(true);
  });

  it("cancels only after a fully committed day", async () => {
    const { controller } = harness();
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.setAnimationMode("normal");
    const pending = controller.advanceUntilInterrupted(20);
    controller.stopAdvance();
    const committed = await pending;
    expect(committed).toBe(1);
    expect(controller.view().expedition?.deck.elapsedDays).toBe(1);
  });

  it("resolves five skipped-animation days under five seconds", async () => {
    const { controller } = harness();
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.setAnimationMode("skipped");
    const start = performance.now();
    expect(await controller.advanceUntilInterrupted(5)).toBe(5);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it("produces identical campaign bytes regardless of animation mode and rendering frequency", () => {
    const first = harness(["same-seed"]);
    const second = harness(["same-seed"]);
    for (const item of [first, second]) {
      item.controller.beginNewCampaign();
      item.controller.outfitAndDepart(VALID_ALLOCATION);
    }
    first.controller.setAnimationMode("normal");
    second.controller.setAnimationMode("skipped");
    for (let day = 0; day < 5; day += 1) {
      first.controller.view();
      first.controller.view();
      first.controller.advanceOneDay();
      second.controller.advanceOneDay();
    }
    expect(first.storage.raw(CAMPAIGN_SAVE_KEY)).toBe(second.storage.raw(CAMPAIGN_SAVE_KEY));
  });
});

describe("deck warnings that cannot be answered", () => {
  it("sails past the spoilage warnings on a sound ship and leaves them standing in the briefing", async () => {
    const { controller } = harness();
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.setAnimationMode("skipped");

    expect(await controller.advanceUntilInterrupted(60)).toBe(60);
    const view = controller.view();
    expect(view.screen).toBe("expedition");
    expect(view.interrupt).toBeNull();
    expect(view.expedition?.deck.elapsedDays).toBe(60);
    expect(view.expedition?.deck.warnings.join(" ")).toMatch(/sour|spoil/i);
    expect(view.error).toBeNull();
  }, 60_000);

  it("does not halt for a damaged component the hold cannot repair, and still shows the warning", () => {
    const { controller } = damagedHullHarness(0);
    expect(controller.advanceOneDay()).toBe(true);
    const view = controller.view();
    expect(view.screen).toBe("expedition");
    expect(view.expedition?.deck.warnings.join(" ")).toContain("Hull condition is critical");
  });

  it("halts again for the same standing warning once the repair becomes possible", () => {
    const { controller } = damagedHullHarness(0);
    expect(controller.advanceOneDay()).toBe(true);
    expect(controller.view().screen).toBe("expedition");

    const stocked = damagedHullHarness(2_000);
    expect(stocked.controller.advanceOneDay()).toBe(true);
    expect(stocked.controller.view().screen).toBe("interrupt");
  });
});

describe("deck warning dismissal", () => {
  it("still halts for an answerable warning and still offers the repair", () => {
    const { controller } = damagedHullHarness(2_000);
    sailToDeckWarning(controller);
    expect(controller.view().interrupt?.stores.repairStoresKg).toBe(2_000);
    expect(controller.repair("hull", "at_sea")).toBe(true);
    expect(controller.view().expedition?.deck.stores.repairStoresKg).toBe(1_750);
  });

  it("sails on immediately after a dismissed deck warning, with no error and no wasted day", async () => {
    const { controller } = damagedHullHarness(2_000);
    sailToDeckWarning(controller);
    const dayAtWarning = controller.view().interrupt!.elapsedDays;

    controller.dismissSoftInterrupt();
    expect(controller.view().screen).toBe("expedition");

    expect(await controller.advanceUntilInterrupted(5)).toBe(5);
    expect(controller.view().error).toBeNull();
    expect(controller.view().expedition?.deck.elapsedDays).toBe(dayAtWarning + 5);
  }, 60_000);

  it("keeps the player at the helm when orders that commit no day follow a dismissal", () => {
    const { controller } = damagedHullHarness(2_000);
    sailToDeckWarning(controller);
    controller.dismissSoftInterrupt();

    expect(controller.setHeading("SSW")).toBe(true);
    expect(controller.view().screen).toBe("expedition");
    expect(controller.setSailingPolicy("cautious")).toBe(true);
    expect(controller.view().screen).toBe("expedition");
    expect(controller.setRationPolicy("reduced_provisions")).toBe(true);
    expect(controller.view().screen).toBe("expedition");
    expect(controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })).toBe(true);
    expect(controller.view().screen).toBe("expedition");
    expect(controller.view().error).toBeNull();
  });

  it("still refuses to sail on for a pending authored event", async () => {
    const { controller } = harness(["event-seed"], QUIET_TRANSIT_ENVIRONMENT, 1_000);
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.setAnimationMode("skipped");
    expect(await controller.advanceUntilInterrupted(10)).toBe(1);
    expect(controller.view().interrupt?.kind).toBe("event");

    controller.dismissSoftInterrupt();
    expect(controller.view().screen).toBe("interrupt");
    expect(await controller.advanceUntilInterrupted(10)).toBe(0);
    expect(controller.view().error).toBe("Answer the decision on screen before sailing on.");
  }, 60_000);

  it("still refuses to sail on when land is in sight, even after the halt is waved away", async () => {
    const { controller } = harness(["route-seed"], CAMPAIGN_ROUTE_ENVIRONMENT);
    controller.beginNewCampaign();
    controller.outfitAndDepart(VALID_ALLOCATION);
    controller.setHeading("SW");
    controller.setAnimationMode("skipped");
    expect(await controller.advanceUntilInterrupted(20)).toBe(1);
    expect(controller.view().interrupt?.kind).toBe("landfall");

    controller.dismissSoftInterrupt();
    expect(await controller.advanceUntilInterrupted(10)).toBe(0);
    expect(controller.view().error).toBe("Answer the decision on screen before sailing on.");
  }, 60_000);
});

/**
 * A run that ends with the crew unable to continue, having sailed every one of its days
 * inside the hidden current with nothing on the chart that explains it. Its report is the
 * long all-unexplained evidence boundary the after-action screen has to present.
 */
function unexplainedRunReportController() {
  let state = createCampaignFixtureState({
    contentVersion: CONTENT_VERSION,
    runSeed: "long-unexplained",
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
  state = executeCampaignCommand(state, { type: "finalize_expedition" });
  const storage = new MemoryKeyValueStorage();
  storage.setItem(CAMPAIGN_SAVE_KEY, serializeCampaignSave(state));
  const controller = new GameController(
    new CampaignSaveRepository(storage),
    new PreferenceRepository(storage),
    new FixedSeedSource(["unused"]),
    { contentVersion: CONTENT_VERSION, dailyEventChancePermille: 0, environmentProvider: QUIET_TRANSIT_ENVIRONMENT },
  );
  controller.resumeCampaign();
  return { controller, days: state.afterActionReports[0]!.elapsedCommittedDays };
}

describe("after-action evidence boundary", () => {
  it("collapses a run of unexplained days into one line with a range and a count", () => {
    const { controller, days } = unexplainedRunReportController();
    const report = controller.view().report!;

    expect(report.currentExplanations).toHaveLength(1);
    expect(report.currentExplanations[0]).toMatchObject({ kind: "unexplained", fromDay: 1, toDay: days, dayCount: days });
    expect(report.currentExplanations[0]!.text).toBe(`Days 1-${days}: route divergence unexplained (${days} days).`);
    expect(days).toBeGreaterThan(10);
  });

  it("states a report with nothing but unexplained days in one sentence, and reveals no hidden vector", () => {
    const { controller, days } = unexplainedRunReportController();
    const report = controller.view().report!;

    expect(report.currentExplanationSummary).toBe(
      `No reported evidence explains the difference on any of the ${days} recorded days, day 1 to day ${days}.`,
    );
    expect(JSON.stringify(report.currentExplanations)).not.toContain("nm east/west");
  });
});

describe("WP5 safe report transition", () => {
  it("shows finalized comparison data only after finalization", () => {
    let state = createCampaignFixtureState({
      contentVersion: CONTENT_VERSION,
      runSeed: "finalize-boundary",
      journey: { location: "at_sea", truePosition: { xMnm: 0, yMnm: 0 }, estimatedPosition: { xMnm: 50_000, yMnm: 0 }, dailyEventChancePermille: 0 },
    });
    state = executeForwardedSimulationCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.activeExpedition?.journey.journey.outcome).not.toBeNull();
    const beforeFinalization = JSON.stringify(getCampaignPlayerView(state));
    expect(beforeFinalization).not.toContain('"trueTrack"');
    state = executeCampaignCommand(state, { type: "finalize_expedition" });
    const afterFinalization = JSON.stringify(getCampaignPlayerView(state));
    expect(afterFinalization).toContain('"trueTrack"');
    expect(state.afterActionReports[0]?.currentContributionHistory.every((point) => point.explanation === "unexplained_route_divergence")).toBe(true);
  });
});
