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

const CONTENT_VERSION = "base-game-v1";
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
) {
  const storage = new MemoryKeyValueStorage();
  const controller = new GameController(
    new CampaignSaveRepository(storage),
    new PreferenceRepository(storage),
    new FixedSeedSource(seeds),
    { contentVersion: CONTENT_VERSION, dailyEventChancePermille: 0, environmentProvider },
  );
  return { storage, controller };
}

describe("WP5 controller, seed, validation, and persistence boundary", () => {
  it("declares exactly the four contract screens", () => {
    expect(PRODUCT_SCREENS).toEqual(["outfitting", "expedition", "interrupt", "after_action"]);
  });

  it("validates per-store stock/caps, hold capacity, and money before dispatch", () => {
    expect(validateOutfitting(VALID_ALLOCATION).valid).toBe(true);
    const overCap = validateOutfitting({ ...VALID_ALLOCATION, medicineKg: 2_001 });
    expect(overCap.valid).toBe(false);
    expect(overCap.storeErrors.medicine).toContain("cap");
    const overHold = validateOutfitting({ waterKg: 24_000, provisionsKg: 18_000, repairStoresKg: 8_000, medicineKg: 3_000 });
    expect(overHold.capacityError).toContain("exceeds");
    const overMoney = validateOutfitting({ waterKg: 24_000, provisionsKg: 18_000, repairStoresKg: 8_000, medicineKg: 2_000 });
    expect(overMoney.moneyError).toContain("sponsor advance");
  });

  it("does not dispatch invalid outfitting or overwrite the last valid autosave", () => {
    const { storage, controller } = harness();
    controller.beginNewCampaign();
    const before = storage.raw(CAMPAIGN_SAVE_KEY);
    expect(controller.outfitAndDepart({ ...VALID_ALLOCATION, waterKg: 24_001 })).toBe(false);
    expect(storage.raw(CAMPAIGN_SAVE_KEY)).toBe(before);
    expect(controller.view().error).toContain("Departure blocked");
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
