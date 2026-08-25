import { describe, expect, it } from "vitest";

import {
  AUTHORED_EVENTS,
  SimulationValidationError,
  applyCommand,
  authoredEventById,
  canonicalState,
  createJourneyFixtureState,
  eligibleEventWeights,
  getPlayerView,
  presentEvent,
  validateEventCatalogue,
  type EnvironmentProvider,
  type JourneySimulationState,
} from "../src/index.js";

const NO_MOVEMENT_ENVIRONMENT: EnvironmentProvider = (context) => {
  if (context.navigation === null) throw new Error("journey fixture requires navigation state");
  return {
    schema: "wp1-navigation-environment-v1",
    id: "wp3-test:no-movement",
    pointOfSailPermille: 0,
    weatherPermille: 0,
    uncertaintyPermille: 1_000,
    tackingUncertaintyPermille: 1_000,
    trueCurrentMnm: { xMnm: 0, yMnm: 0 },
    knownCurrentMnm: { xMnm: 0, yMnm: 0 },
    leewayMnm: { xMnm: 0, yMnm: 0 },
    observedWeather: "fair_clear",
    observedWind: { directionConvention: "from", fromHeading: "NE", strength: "moderate" },
    noonObservation: "none",
    sightRadiusMnm: 20_000,
    nextWeatherState: { kind: "fair_clear", daysInState: context.navigation.weatherState.daysInState + 1 },
    nextEnvironmentPrng: context.navigation.environmentPrng,
  };
};

function atSea(
  seed: string,
  options: Partial<Parameters<typeof createJourneyFixtureState>[0]> = {},
): JourneySimulationState {
  return createJourneyFixtureState({
    contentVersion: "wp3-events-v1",
    runSeed: seed,
    location: "at_sea",
    truePosition: { xMnm: -300_000, yMnm: -2_200_000 },
    estimatedPosition: { xMnm: -250_000, yMnm: -2_100_000 },
    waterKg: 20_000,
    provisionsKg: 15_000,
    repairStoresKg: 5_000,
    medicineKg: 1_000,
    ...options,
  });
}

function injectPending(
  state: Readonly<JourneySimulationState>,
  eventId: string,
): JourneySimulationState {
  const event = authoredEventById(eventId);
  if (event === undefined) throw new Error(`unknown test event ${eventId}`);
  const pending = presentEvent(state, event);
  return {
    ...state,
    journey: {
      ...state.journey,
      pendingEvent: pending,
      eventHistory: [...state.journey.eventHistory, {
        eventId,
        presentedDay: state.committedDay,
        leg: state.journey.leg,
        choiceId: null,
      }],
      firedThisLeg: state.journey.firedThisLeg.includes(eventId)
        ? [...state.journey.firedThisLeg]
        : [...state.journey.firedThisLeg, eventId],
    },
  };
}

function choose(state: JourneySimulationState, eventId: string, choiceId: string) {
  return applyCommand(state, { type: "choose_event", eventId, choiceId });
}

describe("WP3 authored event catalogue contract", () => {
  it("contains 24 valid events across all five groups and satisfies every content quota", () => {
    expect(validateEventCatalogue()).toEqual({
      total: 24,
      byCategory: { weather: 5, stores: 4, ship: 4, crew: 7, navigation: 4 },
      delayed: 8,
      remembered: 11,
      preparationSoftened: 9,
      factProducing: 5,
      accruesUnfinishedWork: 17,
      clearsUnfinishedWork: 12,
    });
  });

  it("gives every event two to four choices and a spendable mitigation", () => {
    for (const event of AUTHORED_EVENTS) {
      expect(event.choices.length).toBeGreaterThanOrEqual(2);
      expect(event.choices.length).toBeLessThanOrEqual(4);
      expect(event.choices.some((item) => item.mitigationResource.length > 0)).toBe(true);
      for (const item of event.choices) {
        if (item.effects.terminalReason !== undefined) expect(event.warningStage).not.toBe("none");
      }
    }
  });

  it("hard-gates regions, prior flags, cooldowns, and once-per-leg events", () => {
    const north = createJourneyFixtureState({
      contentVersion: "wp3-events-v1",
      runSeed: "hard-gates",
      location: "at_sea",
      truePosition: { xMnm: 0, yMnm: -500_000 },
      estimatedPosition: { xMnm: 0, yMnm: -500_000 },
    });
    expect(eligibleEventWeights(north).map((item) => item.event.id)).not.toContain("navigation.current-discrepancy");
    expect(eligibleEventWeights(north).map((item) => item.event.id)).not.toContain("weather.major-storm");

    const south = atSea("hard-gates-south");
    const current = eligibleEventWeights(south).find((item) => item.event.id === "navigation.current-discrepancy");
    expect(current).toBeDefined();
    const excluded = {
      ...south,
      journey: {
        ...south.journey,
        firedThisLeg: ["navigation.current-discrepancy"],
        eventHistory: [{ eventId: "navigation.current-discrepancy", presentedDay: 0, leg: 0, choiceId: "record-current" }],
      },
    };
    expect(eligibleEventWeights(excluded).map((item) => item.event.id)).not.toContain("navigation.current-discrepancy");
  });

  it("applies deterministic state-dependent weights", () => {
    const standard = atSea("weights", { sailingPolicy: "standard" });
    const pressing = atSea("weights", { sailingPolicy: "press_on" });
    const standardWeight = eligibleEventWeights(standard).find((item) => item.event.id === "weather.squall")?.weight;
    const pressingWeight = eligibleEventWeights(pressing).find((item) => item.event.id === "weather.squall")?.weight;
    expect(pressingWeight).toBeGreaterThan(standardWeight ?? 0);
  });

  it("makes daily chance and weighted selection repeatable and presents at most one event", () => {
    const first = applyCommand(atSea("selection", { dailyEventChancePermille: 1_000 }), { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    const second = applyCommand(atSea("selection", { dailyEventChancePermille: 1_000 }), { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(first.journey.pendingEvent).toEqual(second.journey.pendingEvent);
    expect(first.journey.eventPrng).toEqual(second.journey.eventPrng);
    expect(first.journey.eventHistory).toHaveLength(1);
    expect(first.canonicalLog.at(-1)).toMatchObject({ type: "journey_day" });
  });

  it("shows unavailable choices honestly and rejects them atomically", () => {
    const poor = atSea("requirements", { repairStoresKg: 0, medicineKg: 0 });
    const pending = injectPending(poor, "ship.torn-sail");
    const prepared = pending.journey.pendingEvent?.choices.find((item) => item.id === "use-repair-kit");
    expect(prepared).toEqual(expect.objectContaining({ available: false, reason: "Insufficient repair stores." }));
    const before = canonicalState(pending);
    expect(() => choose(pending, "ship.torn-sail", "use-repair-kit")).toThrow("Insufficient repair stores");
    expect(canonicalState(pending)).toBe(before);
  });

  it("rejects wrong event IDs, wrong choice IDs, no-pending choices, duplicates, and advancement atomically", () => {
    const pending = injectPending(atSea("choice-rejections"), "weather.squall");
    for (const command of [
      { type: "choose_event", eventId: "wrong", choiceId: "strike-sail" } as const,
      { type: "choose_event", eventId: "weather.squall", choiceId: "wrong" } as const,
      { type: "advance_day" } as const,
    ]) {
      const before = canonicalState(pending);
      expect(() => applyCommand(pending, command, NO_MOVEMENT_ENVIRONMENT)).toThrow(SimulationValidationError);
      expect(canonicalState(pending)).toBe(before);
    }
    const resolved = choose(pending, "weather.squall", "strike-sail");
    expect(() => choose(resolved, "weather.squall", "strike-sail")).toThrow("no event choice is pending");
    expect(() => choose(atSea("no-pending"), "weather.squall", "strike-sail")).toThrow("no event choice is pending");
  });
});

describe("WP3 warning, memory, preparation, and delayed chains", () => {
  it("presents falling glass before the major-storm follow-up and remembers preparation", () => {
    let state = injectPending(atSea("storm-chain", { dailyEventChancePermille: 1 }), "weather.falling-glass");
    state = choose(state, "weather.falling-glass", "lower-and-batten");
    expect(state.journey.scheduledConsequences).toHaveLength(1);
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.journey.pendingEvent).toMatchObject({
      eventId: "weather.major-storm",
      warningStage: "threat",
    });
    expect(state.journey.pendingEvent?.text).toContain("already shortened and battened");
    expect(state.canonicalLog.at(-1)).toMatchObject({
      type: "journey_day",
      delayedConsequences: [{ sourceEventId: "weather.falling-glass" }],
    });
  });

  it("softens a major storm after preparation and hides the prepared choice otherwise", () => {
    const preparedBase = atSea("prepared-storm", {
      flags: ["storm_warned", "major_storm_due", "storm_prepared"],
    });
    const prepared = injectPending(preparedBase, "weather.major-storm");
    const unprepared = injectPending(atSea("unprepared-storm", {
      flags: ["storm_warned", "major_storm_due"],
    }), "weather.major-storm");
    expect(prepared.journey.pendingEvent?.choices.find((item) => item.id === "ride-prepared")?.available).toBe(true);
    expect(unprepared.journey.pendingEvent?.choices.find((item) => item.id === "ride-prepared")?.available).toBe(false);
    const ridden = choose(prepared, "weather.major-storm", "ride-prepared");
    const held = choose(unprepared, "weather.major-storm", "hold-course");
    expect(prepared.ship.hullBps - ridden.ship.hullBps).toBeLessThan(unprepared.ship.hullBps - held.ship.hullBps);
  });

  it("progresses visibly from grumbling through petition and division to attempted seizure", () => {
    let state = injectPending(atSea("mutiny-chain", {
      moraleBps: 4_000,
      dailyEventChancePermille: 1,
    }), "crew.grumbling");
    state = choose(state, "crew.grumbling", "dismiss-grumbling");
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.journey.pendingEvent?.eventId).toBe("crew.petition");
    state = choose(state, "crew.petition", "refuse-petition");
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.journey.pendingEvent?.eventId).toBe("crew.officers-divide");
    expect(state.journey.pendingEvent?.text).toContain("refused petition");
    state = choose(state, "crew.officers-divide", "stand-fast");
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.journey.pendingEvent).toMatchObject({ eventId: "crew.attempted-seizure", warningStage: "terminal" });
    state = choose(state, "crew.attempted-seizure", "yield-and-save-crew");
    expect(state.journey.outcome).toMatchObject({ id: "objective_failure" });
    expect(() => applyCommand(state, { type: "set_heading", heading: "N" })).toThrow("resolved expedition");
  });

  it("warns through fatigue before applying severe sickness consequences", () => {
    let state = injectPending(atSea("fatigue-chain", { healthBps: 8_000, dailyEventChancePermille: 1 }), "crew.fatigue");
    state = choose(state, "crew.fatigue", "keep-full-watches");
    const healthBefore = state.crew.healthBps;
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    if (state.journey.pendingEvent !== null) {
      const available = state.journey.pendingEvent.choices.find((item) => item.available)!;
      state = choose(state, state.journey.pendingEvent.eventId, available.id);
    }
    state = applyCommand(state, { type: "advance_day" }, NO_MOVEMENT_ENVIRONMENT);
    expect(state.crew.healthBps).toBeLessThan(healthBefore);
    expect(state.journey.pendingEvent?.eventId).toBe("crew.scurvy-symptoms");
  });

  it("keeps unwarned event damage non-terminal and supports explicit authored abandonment", () => {
    let unwarned = injectPending(atSea("unwarned-health", { healthBps: 1 }), "crew.injury");
    unwarned = choose(unwarned, "crew.injury", "bind-and-return");
    expect(unwarned.crew.healthBps).toBe(1);
    expect(unwarned.journey.outcome).toBeNull();

    let abandonment = injectPending(atSea("authored-abandonment", { hullBps: 7_000 }), "ship.hull-leak");
    abandonment = choose(abandonment, "ship.hull-leak", "abandon-objective");
    expect(abandonment.journey.outcome).toMatchObject({
      id: "objective_failure",
      objectiveStatus: "abandoned",
    });
  });

  it("creates facts without exposing hidden truth or future chain state", () => {
    let state = injectPending(atSea("fact-acquisition"), "navigation.current-discrepancy");
    state = choose(state, "navigation.current-discrepancy", "record-current");
    expect(state.journey.facts).toContainEqual(expect.objectContaining({
      id: "fact.south-atlantic-current-hypothesis",
      confidence: 40,
    }));
    const view = JSON.stringify(getPlayerView(state));
    expect(view).not.toContain("truePosition");
    expect(view).not.toContain("eventPrng");
    expect(view).not.toContain("scheduledConsequences");
    expect(view).not.toContain("trueCurrentMnm");
  });
});
