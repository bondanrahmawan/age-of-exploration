import { deepFreeze } from "./immutable.js";
import { nextIntegerInclusive } from "./prng.js";
import { componentCondition, hasOldWater } from "./survival.js";
import type {
  EventChoiceAvailability,
  EventChoiceDefinition,
  EventDefinition,
  EventEffects,
  EventHardGates,
  EventMitigationResource,
  EventWarningStage,
  EventWeightModifier,
  JourneySimulationState,
  PendingChoiceEvent,
  PrngState,
  ShipComponent,
} from "./types.js";
import { seasonForDate } from "./world.js";

export const EVENT_TUNING = deepFreeze({
  baseDailyChancePermille: 120,
  minimumDailyChancePermille: 20,
  maximumDailyChancePermille: 1_000,
  eventPrngDomainSeparator: "::events:authored-journey-v1",
  /**
   * Unfinished work is the backlog of jobs put off rather than done. A branch that
   * defers adds to it, a branch that spends a resource to finish the job removes
   * from it, and every day it stands above the tolerance it wears crew and hull.
   * This is what carries a careful expedition down towards the escalation gates:
   * without it the cheap branch is free and the dangerous half of the catalogue
   * can never become eligible.
   */
  unfinishedWork: {
    maximum: 12,
    /** A short list of outstanding jobs is normal seamanship and costs nothing. */
    toleranceBeforeWear: 1,
    /**
     * A ship at sea generates work whether or not an event asks about it. Without
     * this the backlog has no source the player cannot simply decline, and a
     * well-outfitted expedition clears it to zero and coasts.
     */
    baselineAccrualDays: 10,
    dailyCrewHealthWearBps: 4,
    dailyCrewMoraleWearBps: 10,
    dailyHullWearBps: 3,
    pressureThreshold: 6,
  },
});

/** True on the days a ship at sea adds a job to the list on its own account. */
export function accruesBaselineUnfinishedWork(committedDay: number): boolean {
  return committedDay > 0 && committedDay % EVENT_TUNING.unfinishedWork.baselineAccrualDays === 0;
}

/** Wear owed for a day carrying this much unfinished work. */
export function unfinishedWorkWear(unfinishedWork: number): {
  crewHealthBps: number;
  crewMoraleBps: number;
  hullBps: number;
} {
  const tuning = EVENT_TUNING.unfinishedWork;
  const over = Math.max(0, Math.min(unfinishedWork, tuning.maximum) - tuning.toleranceBeforeWear);
  return {
    crewHealthBps: -over * tuning.dailyCrewHealthWearBps,
    crewMoraleBps: -over * tuning.dailyCrewMoraleWearBps,
    hullBps: -over * tuning.dailyHullWearBps,
  };
}

function effects(value: EventEffects = {}): EventEffects {
  return value;
}

function choice(
  id: string,
  label: string,
  mitigationResource: EventMitigationResource,
  immediateLogText: string,
  choiceEffects: EventEffects = {},
  requirement: EventChoiceDefinition["requirement"] = {},
  delayed: EventChoiceDefinition["delayed"] = [],
): EventChoiceDefinition {
  return {
    id,
    label,
    requirement,
    mitigationResource,
    immediateLogText,
    effects: choiceEffects,
    delayed,
  };
}

interface EventInput {
  readonly id: string;
  readonly category: EventDefinition["category"];
  readonly title: string;
  readonly logText: string;
  readonly choices: readonly EventChoiceDefinition[];
  readonly hardGates?: EventHardGates;
  readonly rememberedText?: EventDefinition["rememberedText"];
  readonly baseWeight?: number;
  readonly weightModifiers?: readonly EventWeightModifier[];
  readonly cooldownDays?: number;
  readonly oncePerLeg?: boolean;
  readonly warningStage?: EventWarningStage;
  readonly traits?: Partial<EventDefinition["traits"]>;
}

function authoredEvent(input: EventInput): EventDefinition {
  return {
    id: input.id,
    category: input.category,
    title: input.title,
    logText: input.logText,
    rememberedText: input.rememberedText ?? [],
    hardGates: input.hardGates ?? {},
    baseWeight: input.baseWeight ?? 10,
    weightModifiers: input.weightModifiers ?? [],
    cooldownDays: input.cooldownDays ?? 8,
    oncePerLeg: input.oncePerLeg ?? false,
    warningStage: input.warningStage ?? "none",
    choices: input.choices,
    traits: {
      delayed: input.traits?.delayed ?? false,
      remembered: input.traits?.remembered ?? false,
      preparationSoftened: input.traits?.preparationSoftened ?? false,
      factProducing: input.traits?.factProducing ?? false,
    },
  };
}

const stormFollowUp = [{
  id: "falling-glass-major-storm",
  dueAfterDays: 1,
  logText: "The warned pressure fall has built into a major storm.",
  effects: effects({ setFlags: ["major_storm_due"] }),
  followUpEventId: "weather.major-storm",
}] as const;

export const AUTHORED_EVENTS: readonly EventDefinition[] = deepFreeze([
  authoredEvent({
    id: "weather.falling-glass",
    category: "weather",
    title: "The Glass Is Falling",
    logText: "The glass falls steadily and the swell comes from the wrong quarter.",
    rememberedText: [{ requiredFlag: "storm_drill_practised", text: "The earlier storm drill gives the hands a practised sequence." }],
    hardGates: { forbiddenFlags: ["storm_warned", "major_storm_due"] },
    weightModifiers: [{ kind: "press_on", addWeight: 8 }],
    cooldownDays: 20,
    oncePerLeg: true,
    warningStage: "warning",
    traits: { delayed: true, remembered: true, preparationSoftened: true },
    choices: [
      choice("lower-and-batten", "Lower sail and batten down", "preparation", "The crew lowers sail and secures every opening before the weather arrives.", effects({ setFlags: ["storm_warned", "storm_prepared", "storm_drill_practised"], crewMoraleDeltaBps: -100 }), {}, stormFollowUp),
      choice("press-before-weather", "Press on before it breaks", "objective", "The expedition holds its course, accepting a harsher encounter for distance made.", effects({ setFlags: ["storm_warned", "storm_pressed_on"], crewMoraleDeltaBps: -200, unfinishedWorkDelta: 1 }), {}, stormFollowUp),
    ],
  }),
  authoredEvent({
    id: "weather.squall",
    category: "weather",
    title: "A Hard Squall",
    logText: "A black line of rain races down on the ship.",
    hardGates: { weatherKinds: ["fair_clear", "overcast", "rough_heavy_swell"] },
    weightModifiers: [{ kind: "press_on", addWeight: 6 }],
    choices: [
      choice("strike-sail", "Strike sail early", "days", "Sail is shortened; the squall passes with little harm, no useful progress, and no work done on the standing jobs.", effects({ crewMoraleDeltaBps: -100, unfinishedWorkDelta: 1 })),
      choice("carry-sail", "Carry sail through it", "repair_capacity", "The caravel keeps way but the canvas takes the strain.", effects({ sailsDeltaBps: -500 })),
    ],
  }),
  authoredEvent({
    id: "weather.major-storm",
    category: "weather",
    title: "The Major Storm",
    logText: "The warned storm arrives with breaking seas and a violent shift of wind.",
    rememberedText: [
      { requiredFlag: "storm_prepared", text: "The ship is already shortened and battened down." },
      { requiredFlag: "storm_pressed_on", text: "The decision to press on has left too much canvas exposed." },
    ],
    hardGates: { requiredFlags: ["storm_warned", "major_storm_due"] },
    baseWeight: 100,
    cooldownDays: 40,
    oncePerLeg: true,
    warningStage: "threat",
    traits: { remembered: true, preparationSoftened: true },
    choices: [
      choice("ride-prepared", "Ride it out under storm canvas", "preparation", "Preparation pays: the ship takes the sea with controlled damage.", effects({ hullDeltaBps: -500, sailsDeltaBps: -300, clearFlags: ["major_storm_due"] }), { requiredFlags: ["storm_prepared"] }),
      choice("run-before-it", "Run before the storm", "objective", "The ship runs off course and survives at a cost to hull, morale, and the objective timetable.", effects({ hullDeltaBps: -1_000, rudderDeltaBps: -600, crewMoraleDeltaBps: -300, clearFlags: ["major_storm_due"] })),
      choice("hold-course", "Hold the course", "repair_capacity", "The ship keeps its heading through punishing seas; mast and hull pay for the decision.", effects({ hullDeltaBps: -2_000, mastDeltaBps: -1_500, crewHealthDeltaBps: -500, clearFlags: ["major_storm_due"] })),
    ],
  }),
  authoredEvent({
    id: "weather.calm",
    category: "weather",
    title: "A Breathless Calm",
    logText: "The sea turns to polished metal while stores continue to fall.",
    hardGates: { weatherKinds: ["calm", "fair_clear"] },
    choices: [
      choice("wait-under-normal-rations", "Wait under normal rations", "stores", "The crew waits without further loss of confidence.", effects({ provisionsDeltaKg: -75, waterDeltaKg: -150 })),
      choice("reduce-work", "Reduce work and conserve morale", "days", "Work is eased and the calm is endured without pretending progress; the standing jobs wait another day.", effects({ crewMoraleDeltaBps: 100, unfinishedWorkDelta: 1 })),
    ],
  }),
  authoredEvent({
    id: "weather.contrary-wind",
    category: "weather",
    title: "Contrary Wind",
    logText: "The wind settles directly across the intended course.",
    weightModifiers: [{ kind: "cautious", addWeight: -2 }, { kind: "press_on", addWeight: 5 }],
    choices: [
      choice("tack-patiently", "Tack patiently", "days", "The ship gives up time to preserve rig and crew, and the hands work the sheets instead of the standing jobs.", effects({ crewMoraleDeltaBps: -100, unfinishedWorkDelta: 1 })),
      choice("force-the-course", "Force the course", "repair_capacity", "The course is held at the price of strained sails and rudder.", effects({ sailsDeltaBps: -300, rudderDeltaBps: -200 })),
    ],
  }),

  authoredEvent({
    id: "stores.leaking-cask",
    category: "stores",
    title: "A Leaking Cask",
    logText: "Water threads between the staves of an old cask.",
    weightModifiers: [{ kind: "old_water", addWeight: 10 }],
    traits: { delayed: true },
    choices: [
      choice("rehoop-cask", "Re-hoop and seal it", "repair_capacity", "Repair material and labour arrest the leak.", effects({ repairStoresDeltaKg: -100, unfinishedWorkDelta: -1, setFlags: ["casks_repaired"] }), { minimumRepairStoresKg: 100 }),
      choice("shift-water", "Shift what remains", "stores", "Most of the water is saved, but the damaged cask is left behind.", effects({ waterDeltaKg: -400 })),
      choice("mark-and-watch", "Mark it and watch", "days", "The leak is watched rather than repaired; more water may be lost tomorrow.", effects({ unfinishedWorkDelta: 2, setFlags: ["cask_leak_watched"] }), {}, [{ id: "leaking-cask-loss", dueAfterDays: 1, logText: "The watched cask leaks again overnight.", effects: effects({ waterDeltaKg: -800 }) }]),
    ],
  }),
  authoredEvent({
    id: "stores.sour-water",
    category: "stores",
    title: "Sour Water",
    logText: "The oldest water smells foul and the crew hesitate at the dipper.",
    hardGates: { minimumCommittedDay: 20 },
    weightModifiers: [{ kind: "old_water", addWeight: 18 }],
    traits: { preparationSoftened: true, factProducing: true },
    choices: [
      choice("treat-casks", "Treat the casks with medicine stores", "preparation", "The worst casks are treated and confidence steadies.", effects({ medicineDeltaKg: -100, crewHealthDeltaBps: 200, unfinishedWorkDelta: -1, facts: [{ id: "fact.cask-treatment", type: "hazard", status: "observed", confidence: 45, source: "crew treatment", claim: "Old Atlantic water can be made less harmful with early treatment." }] }), { minimumMedicineKg: 100 }),
      choice("issue-anyway", "Issue it anyway", "morale", "The ration is issued; morale and pooled health absorb the cost.", effects({ crewHealthDeltaBps: -300, crewMoraleDeltaBps: -400 })),
    ],
  }),
  authoredEvent({
    id: "stores.spoiled-provisions",
    category: "stores",
    title: "Spoiled Provisions",
    logText: "Several biscuit sacks have gone soft and moulded.",
    rememberedText: [{ requiredFlag: "stores_secured", text: "The earlier effort to secure the stores limits the affected sacks." }],
    weightModifiers: [{ kind: "old_water", addWeight: 3 }],
    traits: { remembered: true },
    choices: [
      choice("discard-worst", "Discard the worst sacks", "stores", "The spoiled mass is thrown overboard before it spreads.", effects({ provisionsDeltaKg: -600, unfinishedWorkDelta: -1, setFlags: ["stores_secured"] })),
      choice("stretch-the-lot", "Stretch the remaining lot", "morale", "Nothing is discarded, but health and morale suffer.", effects({ crewHealthDeltaBps: -350, crewMoraleDeltaBps: -250 })),
    ],
  }),
  authoredEvent({
    id: "stores.rats",
    category: "stores",
    title: "Rats in the Hold",
    logText: "Gnawed sacks and droppings reveal rats in the provision bay.",
    traits: { preparationSoftened: true },
    choices: [
      choice("use-secured-bins", "Use the secured bins", "preparation", "Prepared bins contain the damage.", effects({ provisionsDeltaKg: -100, unfinishedWorkDelta: -1 }), { requiredFlags: ["stores_secured"] }),
      choice("hunt-and-clean", "Turn out the hold and hunt them", "days", "The crew spends exhausting effort clearing the hold and securing the bins.", effects({ crewMoraleDeltaBps: -200, unfinishedWorkDelta: -1, setFlags: ["stores_secured"] })),
      choice("accept-loss", "Accept the loss", "stores", "The rats keep the dark corners and take their share.", effects({ provisionsDeltaKg: -900, unfinishedWorkDelta: 1 })),
    ],
  }),

  authoredEvent({
    id: "ship.sprung-mast",
    category: "ship",
    title: "A Sprung Mast",
    logText: "The mast works visibly at the partners and opens a dangerous seam.",
    rememberedText: [{ minimumUnfinishedWork: 6, text: "The partners were on the list of jobs long before the seam opened." }],
    weightModifiers: [
      { kind: "damaged_ship", addWeight: 8 },
      { kind: "press_on", addWeight: 6 },
      { kind: "unfinished_work", addWeight: 6 },
    ],
    warningStage: "warning",
    traits: { delayed: true, remembered: true },
    choices: [
      choice("shore-with-stores", "Shore it with repair stores", "repair_capacity", "Timber and labour secure the mast before the seam grows.", effects({ repairStoresDeltaKg: -250, mastDeltaBps: 300, unfinishedWorkDelta: -2, setFlags: ["mast_shored"] }), { minimumRepairStoresKg: 250 }),
      choice("jury-rig", "Jury-rig and continue", "objective", "The mast is bound for now, with a later strain still owed.", effects({ mastDeltaBps: -300, unfinishedWorkDelta: 2, setFlags: ["mast_jury_rigged"] }), {}, [{ id: "sprung-mast-settles", dueAfterDays: 3, logText: "The jury-rigged mast settles badly under continuing strain.", effects: effects({ mastDeltaBps: -500 }) }]),
      choice("reduce-sail", "Reduce sail indefinitely", "days", "The rig is spared while the objective yields time, and the seam is left exactly as it stands.", effects({ crewMoraleDeltaBps: -200, unfinishedWorkDelta: 1 })),
    ],
  }),
  authoredEvent({
    id: "ship.torn-sail",
    category: "ship",
    title: "Torn Sail",
    logText: "A split runs across the working canvas.",
    traits: { preparationSoftened: true },
    choices: [
      choice("use-repair-kit", "Use the prepared repair kit", "preparation", "Prepared cloth and tools keep the tear small.", effects({ repairStoresDeltaKg: -150, sailsDeltaBps: 200, unfinishedWorkDelta: -1 }), { minimumRepairStoresKg: 150 }),
      choice("cut-away", "Cut away the damaged panel", "repair_capacity", "The sail remains usable but permanently reduced.", effects({ sailsDeltaBps: -500 })),
    ],
  }),
  authoredEvent({
    id: "ship.rudder-strain",
    category: "ship",
    title: "Rudder Strain",
    logText: "The tiller kicks and the rudder answers late.",
    rememberedText: [
      { requiredFlag: "rudder_watched", minimumUnfinishedWork: 6, text: "The watch has been kept for weeks now without anyone unshipping the rudder." },
      { requiredFlag: "rudder_watched", text: "The earlier watch catches the movement before the fastenings open." },
      { minimumUnfinishedWork: 6, text: "It joins a list of jobs the ship has been carrying for some time." },
    ],
    weightModifiers: [{ kind: "damaged_ship", addWeight: 6 }, { kind: "unfinished_work", addWeight: 6 }],
    traits: { remembered: true, preparationSoftened: true },
    choices: [
      choice("rehang-rudder", "Unship and re-hang the rudder", "repair_capacity", "A hard day of work with timber and iron puts the fastenings right and clears the job from the list.", effects({ repairStoresDeltaKg: -200, rudderDeltaBps: 400, unfinishedWorkDelta: -2, clearFlags: ["rudder_watched"] }), { minimumRepairStoresKg: 200 }),
      choice("lash-and-watch", "Lash it and set a watch", "days", "The watch keeps the strain visible and buys time, but the fastenings are not touched.", effects({ rudderDeltaBps: -200, unfinishedWorkDelta: 1, setFlags: ["rudder_watched"] })),
      choice("hold-heavy-tiller", "Hold the heavy tiller", "morale", "Extra hands preserve the course but tire the crew, and the rudder is left as it is.", effects({ crewHealthDeltaBps: -200, crewMoraleDeltaBps: -100, unfinishedWorkDelta: 1 })),
    ],
  }),
  authoredEvent({
    id: "ship.hull-leak",
    category: "ship",
    title: "Hull Leak",
    logText: "The pumps bring more water than yesterday and the hull works below.",
    rememberedText: [{ minimumUnfinishedWork: 6, text: "The seams below were on the list of jobs and never came off it." }],
    hardGates: { maximumShipComponent: { component: "hull", bps: 8_500 } },
    weightModifiers: [{ kind: "damaged_ship", addWeight: 12 }, { kind: "unfinished_work", addWeight: 10 }],
    warningStage: "warning",
    traits: { remembered: true },
    choices: [
      choice("patch-with-stores", "Patch from inside", "repair_capacity", "Oakum and timber slow the ingress.", effects({ repairStoresDeltaKg: -300, hullDeltaBps: 500, unfinishedWorkDelta: -2 }), { minimumRepairStoresKg: 300 }),
      choice("man-pumps", "Man the pumps continuously", "morale", "The ship stays afloat while health and morale pay for the labour, but nobody ever gets at the hull itself.", effects({ crewHealthDeltaBps: -300, crewMoraleDeltaBps: -300, unfinishedWorkDelta: 1 })),
      choice("abandon-objective", "Abandon the expedition at the anchorage", "objective", "The current run ends in authored abandonment without claiming that the crew died.", effects({ abandonObjective: true, terminalReason: "authored_abandonment", setFlags: ["hull_leak_abandonment"] })),
    ],
  }),

  authoredEvent({
    id: "crew.fatigue",
    category: "crew",
    title: "Fatigue in the Watches",
    logText: "Hands miss calls and sleep against the rail; sickness pressure is now visible.",
    rememberedText: [{ minimumUnfinishedWork: 6, text: "The standing list of unfinished jobs has been eating the watch below for weeks." }],
    hardGates: { maximumHealthBps: 9_000 },
    weightModifiers: [
      { kind: "low_health", addWeight: 10 },
      { kind: "press_on", addWeight: 5 },
      { kind: "unfinished_work", addWeight: 8 },
    ],
    warningStage: "warning",
    traits: { delayed: true, remembered: true },
    choices: [
      choice("ease-watches", "Ease the watches", "days", "Work is reduced before fatigue becomes sickness.", effects({ crewMoraleDeltaBps: 200, unfinishedWorkDelta: -1, setFlags: ["fatigue_warning_heeded"] })),
      choice("keep-full-watches", "Keep full watches", "objective", "The expedition keeps its pace and accepts a later health consequence.", effects({ unfinishedWorkDelta: 2, setFlags: ["fatigue_warning_ignored"] }), {}, [{ id: "fatigue-sickness", dueAfterDays: 2, logText: "The warned fatigue has developed into severe weakness among the hands.", effects: effects({ crewHealthDeltaBps: -600, ableCrewDelta: -1, setFlags: ["sickness_warned"] }), followUpEventId: "crew.scurvy-symptoms" }]),
    ],
  }),
  authoredEvent({
    id: "crew.injury",
    category: "crew",
    title: "Injury on Deck",
    logText: "A hand is thrown against the rail and cannot return to the watch.",
    traits: { preparationSoftened: true },
    choices: [
      choice("use-medicine", "Use medicine and rest the injured", "preparation", "Medicine and reduced duty prevent the injury worsening.", effects({ medicineDeltaKg: -100, ableCrewDelta: -1, crewHealthDeltaBps: -100, unfinishedWorkDelta: -1 }), { minimumMedicineKg: 100 }),
      choice("bind-and-return", "Bind the injury and return the hand", "morale", "The hand returns too soon; pooled health and morale absorb the decision, and a short watch stays short.", effects({ crewHealthDeltaBps: -350, crewMoraleDeltaBps: -200, unfinishedWorkDelta: 1 })),
    ],
  }),
  authoredEvent({
    id: "crew.scurvy-symptoms",
    category: "crew",
    title: "Swollen Gums and Weakness",
    logText: "Several sailors show swollen gums and little strength for the ropes.",
    rememberedText: [{ requiredFlag: "fatigue_warning_heeded", text: "The lighter watches have kept the symptoms from spreading as quickly." }],
    hardGates: { requiredFlags: ["sickness_warned"] },
    warningStage: "threat",
    traits: { remembered: true, preparationSoftened: true },
    choices: [
      choice("medicine-and-rest", "Use medicine and rest", "preparation", "Medicine and rest soften the warned sickness.", effects({ medicineDeltaKg: -200, crewHealthDeltaBps: 300, unfinishedWorkDelta: -2, clearFlags: ["sickness_warned"] }), { minimumMedicineKg: 200 }),
      choice("search-fresh-food", "Sacrifice time to seek fresh food", "objective", "The objective yields time while symptoms stabilise.", effects({ provisionsDeltaKg: -300, crewMoraleDeltaBps: 100, unfinishedWorkDelta: -1, clearFlags: ["sickness_warned"] })),
      choice("continue-duty", "Continue full duty", "morale", "The warned sickness deepens under full duty.", effects({ crewHealthDeltaBps: -700, ableCrewDelta: -2, crewMoraleDeltaBps: -300, unfinishedWorkDelta: 2, clearFlags: ["sickness_warned"] })),
    ],
  }),
  authoredEvent({
    id: "crew.grumbling",
    category: "crew",
    title: "Grumbling Below",
    logText: "Complaints about distance, stores, and the captain are no longer private.",
    rememberedText: [{ minimumUnfinishedWork: 6, text: "The hands can recite the list of jobs that were promised and never done." }],
    hardGates: { maximumMoraleBps: 5_000, forbiddenFlags: ["mutiny_grumbling"] },
    weightModifiers: [{ kind: "unfinished_work", addWeight: 12 }],
    warningStage: "warning",
    traits: { delayed: true, remembered: true },
    choices: [
      choice("full-ration", "Issue a full extra ration", "stores", "A costly extra issue quiets the loudest complaints for now.", effects({ provisionsDeltaKg: -500, waterDeltaKg: -500, crewMoraleDeltaBps: 500, setFlags: ["mutiny_grumbling", "mutiny_rations_spent"] }), { minimumProvisionsKg: 500, minimumWaterKg: 500 }),
      choice("hear-complaints", "Hear the complaints openly", "days", "The captain hears the crew, but a formal petition will follow.", effects({ crewMoraleDeltaBps: 100, setFlags: ["mutiny_grumbling"] }), {}, [{ id: "mutiny-petition", dueAfterDays: 1, logText: "The warned grumbling has become a formal petition.", effects: effects({ setFlags: ["mutiny_petition_due"] }), followUpEventId: "crew.petition" }]),
      choice("dismiss-grumbling", "Dismiss the grumbling", "morale", "The complaints are dismissed and harden into organisation.", effects({ crewMoraleDeltaBps: -300, unfinishedWorkDelta: 1, setFlags: ["mutiny_grumbling"] }), {}, [{ id: "mutiny-petition-dismissed", dueAfterDays: 1, logText: "Dismissed complaints return as a signed petition.", effects: effects({ setFlags: ["mutiny_petition_due"] }), followUpEventId: "crew.petition" }]),
    ],
  }),
  authoredEvent({
    id: "crew.petition",
    category: "crew",
    title: "The Petition",
    logText: "A formal petition demands a safer course and fuller issues.",
    hardGates: { requiredFlags: ["mutiny_grumbling", "mutiny_petition_due"] },
    warningStage: "threat",
    traits: { delayed: true },
    choices: [
      choice("accept-turnback", "Accept a return course", "objective", "The petition is accepted; the Cape objective is abandoned for a viable return.", effects({ abandonObjective: true, crewMoraleDeltaBps: 800, clearFlags: ["mutiny_petition_due"] })),
      choice("buy-time", "Buy time with better issues", "stores", "Better issues buy time but do not erase the dispute.", effects({ provisionsDeltaKg: -700, crewMoraleDeltaBps: 400, clearFlags: ["mutiny_petition_due"], setFlags: ["petition_bought_off"] }), { minimumProvisionsKg: 700 }),
      choice("refuse-petition", "Refuse the petition", "morale", "The refusal splits those responsible for discipline.", effects({ crewMoraleDeltaBps: -500, clearFlags: ["mutiny_petition_due"], setFlags: ["petition_refused"] }), {}, [{ id: "mutiny-officers-divide", dueAfterDays: 1, logText: "After the refused petition, the officers divide in front of the crew.", effects: effects({ setFlags: ["mutiny_officers_divide_due"] }), followUpEventId: "crew.officers-divide" }]),
    ],
  }),
  authoredEvent({
    id: "crew.officers-divide",
    category: "crew",
    title: "Officers Divide",
    logText: "The officers divide is a stage in the mutiny process, not an individual-officer simulation.",
    rememberedText: [{ requiredFlag: "petition_refused", text: "The division follows directly from the refused petition." }],
    hardGates: { requiredFlags: ["mutiny_officers_divide_due"] },
    warningStage: "threat",
    traits: { delayed: true, remembered: true },
    choices: [
      choice("change-course", "Change course for Lisbon", "objective", "A return course reunites discipline at the cost of the objective.", effects({ abandonObjective: true, crewMoraleDeltaBps: 700, clearFlags: ["mutiny_officers_divide_due"] })),
      choice("open-stores", "Open the stores", "stores", "A large issue restores a fragile common purpose.", effects({ provisionsDeltaKg: -1_000, waterDeltaKg: -500, crewMoraleDeltaBps: 600, clearFlags: ["mutiny_officers_divide_due"] }), { minimumProvisionsKg: 1_000, minimumWaterKg: 500 }),
      choice("stand-fast", "Stand fast", "morale", "The division is left unresolved and attempted seizure becomes the next visible stage.", effects({ crewMoraleDeltaBps: -500, clearFlags: ["mutiny_officers_divide_due"], setFlags: ["mutiny_seizure_warned"] }), {}, [{ id: "mutiny-attempted-seizure", dueAfterDays: 1, logText: "Grumbling, petition, and division culminate in an attempted seizure.", effects: effects({ setFlags: ["mutiny_seizure_due"] }), followUpEventId: "crew.attempted-seizure" }]),
    ],
  }),
  authoredEvent({
    id: "crew.attempted-seizure",
    category: "crew",
    title: "Attempted Seizure",
    logText: "After every prior warning stage, organised hands move to seize command.",
    hardGates: { requiredFlags: ["mutiny_seizure_warned", "mutiny_seizure_due"] },
    warningStage: "terminal",
    oncePerLeg: true,
    choices: [
      choice("yield-and-save-crew", "Yield command and save the crew", "objective", "Command is yielded; the current expedition ends in objective failure without claiming universal death.", effects({ terminalReason: "mutiny_seizure", clearFlags: ["mutiny_seizure_due"] })),
      choice("offer-return-and-stores", "Offer return and open stores", "stores", "The expedition objective is abandoned, but the seizure is broken at a meaningful price.", effects({ abandonObjective: true, provisionsDeltaKg: -1_000, waterDeltaKg: -500, crewMoraleDeltaBps: 800, clearFlags: ["mutiny_seizure_due", "mutiny_seizure_warned"] }), { minimumProvisionsKg: 1_000, minimumWaterKg: 500 }),
      choice("resist-at-cost", "Resist and accept incapacity", "morale", "The seizure is resisted; several hands are incapacitated and morale is shattered, but command remains.", effects({ ableCrewDelta: -4, crewHealthDeltaBps: -800, crewMoraleDeltaBps: -1_000, clearFlags: ["mutiny_seizure_due", "mutiny_seizure_warned"] })),
    ],
  }),

  authoredEvent({
    id: "navigation.current-discrepancy",
    category: "navigation",
    title: "A Current Discrepancy",
    logText: "Repeated observations disagree with the logged east-west run.",
    hardGates: { regions: ["south_atlantic"] },
    oncePerLeg: true,
    traits: { factProducing: true },
    choices: [
      choice("record-current", "Record a current hypothesis", "days", "The discrepancy is entered as current-expedition evidence, not hidden truth, at the price of a day of ship's work.", effects({ unfinishedWorkDelta: 1, facts: [{ id: "fact.south-atlantic-current-hypothesis", type: "current", status: "observed", confidence: 40, source: "dead-reckoning discrepancy", claim: "A sustained current may set the ship eastward in the South Atlantic." }] })),
      choice("trust-reckoning", "Trust the reckoning", "objective", "The discrepancy is left unresolved to preserve the present plan.", effects({ crewMoraleDeltaBps: -100, unfinishedWorkDelta: 1, setFlags: ["current_discrepancy_ignored"] })),
    ],
  }),
  authoredEvent({
    id: "navigation.birds-vegetation",
    category: "navigation",
    title: "Birds and Vegetation",
    logText: "Land birds circle the mast and green branches drift past.",
    hardGates: { regions: ["south_atlantic", "cape"] },
    oncePerLeg: true,
    traits: { factProducing: true },
    choices: [
      choice("record-signs", "Record the signs of land", "days", "The signs become a current-expedition coastal cue, bought with a day of ship's work.", effects({ unfinishedWorkDelta: 1, facts: [{ id: "fact.southern-land-signs", type: "landmark", status: "observed", confidence: 45, source: "birds and vegetation", claim: "Land signs were observed in the southern Atlantic." }] })),
      choice("follow-birds", "Follow the birds", "objective", "The expedition spends objective time following uncertain signs.", effects({ waterDeltaKg: -150, provisionsDeltaKg: -75, setFlags: ["followed_land_birds"] })),
    ],
  }),
  authoredEvent({
    id: "navigation.false-land",
    category: "navigation",
    title: "False Land",
    logText: "A dark bank on the horizon resembles a coast where a rumour placed one.",
    rememberedText: [{ requiredFlag: "rumour_false_island", text: "The purchased Cape Verde rumour is the reason this bank looks persuasive." }],
    hardGates: { requiredFlags: ["rumour_false_island"] },
    oncePerLeg: true,
    traits: { delayed: true, remembered: true, factProducing: true },
    choices: [
      choice("investigate-bank", "Investigate the bank", "stores", "The expedition spends stores testing the claim rather than rolling a free misfortune.", effects({ waterDeltaKg: -300, provisionsDeltaKg: -150, setFlags: ["false_land_investigated"] }), {}, [{ id: "false-land-clears", dueAfterDays: 1, logText: "The bank clears without land; the carried rumour is marked disproved.", effects: effects({ facts: [{ id: "fact.cape-verde-false-island", type: "rumour", status: "disproved", confidence: 80, source: "direct investigation", claim: "The rumoured island west of the route was not found." }] }) }]),
      choice("hold-course", "Hold the planned course", "objective", "The uncertain bank is left untested to preserve the objective, and the question is left open.", effects({ crewMoraleDeltaBps: -100, unfinishedWorkDelta: 1 })),
    ],
  }),
  authoredEvent({
    id: "navigation.unknown-anchorage",
    category: "navigation",
    title: "An Unknown Anchorage",
    logText: "A sheltered indentation offers uncertain holding ground and a chance to inspect the ship.",
    hardGates: { regions: ["south_atlantic", "cape"] },
    oncePerLeg: true,
    traits: { preparationSoftened: true, factProducing: true },
    choices: [
      choice("sound-and-record", "Sound and record it", "days", "Careful soundings establish a current-expedition anchorage fact while the standing jobs wait.", effects({ unfinishedWorkDelta: 1, facts: [{ id: "fact.unknown-southern-anchorage", type: "anchorage", status: "observed", confidence: 55, source: "lead-line survey", claim: "A sheltered southern anchorage has usable holding ground." }] })),
      choice("use-repair-stores", "Anchor and make prepared repairs", "preparation", "Repair capacity is spent while shelter softens the work.", effects({ repairStoresDeltaKg: -250, hullDeltaBps: 300, mastDeltaBps: 200, unfinishedWorkDelta: -3, setFlags: ["anchorage_used"] }), { minimumRepairStoresKg: 250 }),
      choice("decline-anchorage", "Decline the uncertain anchorage", "objective", "The expedition preserves time and accepts the unresolved opportunity; every outstanding job stays outstanding.", effects({ crewMoraleDeltaBps: -100, unfinishedWorkDelta: 1 })),
    ],
  }),
]);

export interface EventCatalogueStats {
  readonly total: number;
  readonly byCategory: Readonly<Record<EventDefinition["category"], number>>;
  readonly delayed: number;
  readonly remembered: number;
  readonly preparationSoftened: number;
  readonly factProducing: number;
  readonly accruesUnfinishedWork: number;
  readonly clearsUnfinishedWork: number;
}

export function validateEventCatalogue(
  catalogue: readonly Readonly<EventDefinition>[] = AUTHORED_EVENTS,
): EventCatalogueStats {
  const ids = new Set<string>();
  const categories: Record<EventDefinition["category"], number> = {
    weather: 0,
    stores: 0,
    ship: 0,
    crew: 0,
    navigation: 0,
  };
  for (const event of catalogue) {
    if (ids.has(event.id)) throw new Error(`duplicate event id: ${event.id}`);
    ids.add(event.id);
    categories[event.category] += 1;
    if (event.choices.length < 2 || event.choices.length > 4) {
      throw new Error(`${event.id} must contain two to four choices`);
    }
    if (event.baseWeight <= 0 || event.cooldownDays < 0) {
      throw new Error(`${event.id} has invalid deterministic selection tuning`);
    }
    const choiceIds = new Set<string>();
    for (const eventChoice of event.choices) {
      if (choiceIds.has(eventChoice.id)) throw new Error(`${event.id} has duplicate choice ${eventChoice.id}`);
      choiceIds.add(eventChoice.id);
      if (eventChoice.effects.terminalReason !== undefined && event.warningStage === "none") {
        throw new Error(`${event.id}.${eventChoice.id} has an unwarned terminal consequence`);
      }
    }
    if (!event.choices.some((eventChoice) => eventChoice.mitigationResource !== undefined)) {
      throw new Error(`${event.id} has no spendable mitigation option`);
    }
    const unconditional = event.choices.filter((eventChoice) => {
      const requirement = eventChoice.requirement;
      return requirement.minimumMoneyDucats === undefined
        && requirement.minimumWaterKg === undefined
        && requirement.minimumProvisionsKg === undefined
        && requirement.minimumRepairStoresKg === undefined
        && requirement.minimumMedicineKg === undefined
        && requirement.minimumMoraleBps === undefined
        && (requirement.requiredFlags?.length ?? 0) === 0
        && (eventChoice.effects.moneyDeltaDucats ?? 0) >= 0
        && (eventChoice.effects.waterDeltaKg ?? 0) >= 0
        && (eventChoice.effects.provisionsDeltaKg ?? 0) >= 0
        && (eventChoice.effects.repairStoresDeltaKg ?? 0) >= 0
        && (eventChoice.effects.medicineDeltaKg ?? 0) >= 0;
    });
    if (unconditional.length === 0) {
      throw new Error(`${event.id} has no always-legal mitigation for a depleted expedition`);
    }
    // Section 22.2: a death spiral must stay escapable, but not for free. An
    // unconditional branch that spends no store must at least add to the backlog,
    // or a careful expedition can take it every time and never feel any pressure.
    const freeEscape = unconditional.find((eventChoice) => {
      const spent = -(
        (eventChoice.effects.crewHealthDeltaBps ?? 0)
        + (eventChoice.effects.crewMoraleDeltaBps ?? 0)
        + (eventChoice.effects.hullDeltaBps ?? 0)
        + (eventChoice.effects.mastDeltaBps ?? 0)
        + (eventChoice.effects.sailsDeltaBps ?? 0)
        + (eventChoice.effects.rudderDeltaBps ?? 0)
      );
      // Either the branch defers work onto the backlog, or it is the labour that
      // takes work off it. Both are a price. Neither is free.
      const movesTheBacklog = (eventChoice.effects.unfinishedWorkDelta ?? 0) !== 0;
      const endsTheRun = eventChoice.effects.abandonObjective === true
        || eventChoice.effects.terminalReason !== undefined;
      // A branch that schedules a consequence has not escaped anything yet; the
      // price is owed rather than waived.
      const owesLater = (eventChoice.delayed?.length ?? 0) > 0;
      return spent < 200 && !movesTheBacklog && !endsTheRun && !owesLater;
    });
    if (freeEscape !== undefined) {
      throw new Error(
        `${event.id}.${freeEscape.id} is an unconditional escape that costs nothing and defers nothing`,
      );
    }
    if (event.warningStage === "terminal") {
      if ((event.hardGates.requiredFlags?.length ?? 0) === 0) {
        throw new Error(`${event.id} can terminate without a prior warning flag`);
      }
    }
    if (event.traits.delayed && !event.choices.some((item) => (item.delayed?.length ?? 0) > 0)) {
      throw new Error(`${event.id} claims delayed content without a delayed consequence`);
    }
    if (event.traits.remembered && event.rememberedText.length === 0) {
      throw new Error(`${event.id} claims remembered content without remembered text`);
    }
    if (
      event.traits.preparationSoftened
      && !event.choices.some((item) => (item.requirement.requiredFlags?.length ?? 0) > 0
        || item.requirement.minimumMedicineKg !== undefined
        || item.requirement.minimumRepairStoresKg !== undefined
        || item.effects.setFlags?.some((flag) => flag.includes("prepared")) === true)
    ) {
      throw new Error(`${event.id} claims preparation softening without a prepared choice`);
    }
    if (
      event.traits.factProducing
      && !event.choices.some((item) => (item.effects.facts?.length ?? 0) > 0
        || item.delayed?.some((delayed) => (delayed.effects.facts?.length ?? 0) > 0) === true)
    ) {
      throw new Error(`${event.id} claims fact production without a fact effect`);
    }
  }
  if (catalogue.length < 20) throw new Error("authored catalogue must contain at least 20 events");
  for (const [category, count] of Object.entries(categories)) {
    if (count === 0) throw new Error(`authored catalogue is missing ${category} events`);
  }
  const stats = {
    total: catalogue.length,
    byCategory: categories,
    delayed: catalogue.filter((event) => event.traits.delayed).length,
    remembered: catalogue.filter((event) => event.traits.remembered).length,
    preparationSoftened: catalogue.filter((event) => event.traits.preparationSoftened).length,
    factProducing: catalogue.filter((event) => event.traits.factProducing).length,
    accruesUnfinishedWork: catalogue.filter((event) => event.choices
      .some((item) => (item.effects.unfinishedWorkDelta ?? 0) > 0)).length,
    clearsUnfinishedWork: catalogue.filter((event) => event.choices
      .some((item) => (item.effects.unfinishedWorkDelta ?? 0) < 0)).length,
  };
  if (stats.delayed < 4 || stats.remembered < 4 || stats.preparationSoftened < 4 || stats.factProducing < 3) {
    throw new Error("authored catalogue does not satisfy the WP3 content quotas");
  }
  if (stats.accruesUnfinishedWork < 8 || stats.clearsUnfinishedWork < 8) {
    throw new Error("authored catalogue does not give unfinished work enough sources and sinks");
  }
  return deepFreeze(stats);
}

const FLAG_REASONS: Readonly<Record<string, string>> = {
  storm_prepared: "Requires the earlier storm-preparation response.",
  stores_secured: "Requires stores secured by an earlier response.",
  fatigue_warning_heeded: "Requires the earlier fatigue warning to have been heeded.",
};

function hasFlag(state: Readonly<JourneySimulationState>, flag: string): boolean {
  return state.journey.flags.includes(flag);
}

export function choiceAvailability(
  state: Readonly<JourneySimulationState>,
  eventChoice: Readonly<EventChoiceDefinition>,
): EventChoiceAvailability {
  const requirement = eventChoice.requirement;
  let reason: string | null = null;
  const minimumMoney = Math.max(requirement.minimumMoneyDucats ?? 0, -(eventChoice.effects.moneyDeltaDucats ?? 0));
  const minimumWater = Math.max(requirement.minimumWaterKg ?? 0, -(eventChoice.effects.waterDeltaKg ?? 0));
  const minimumProvisions = Math.max(requirement.minimumProvisionsKg ?? 0, -(eventChoice.effects.provisionsDeltaKg ?? 0));
  const minimumRepair = Math.max(requirement.minimumRepairStoresKg ?? 0, -(eventChoice.effects.repairStoresDeltaKg ?? 0));
  const minimumMedicine = Math.max(requirement.minimumMedicineKg ?? 0, -(eventChoice.effects.medicineDeltaKg ?? 0));
  if (minimumMoney > state.moneyDucats) reason = "Insufficient ducats.";
  else if (minimumWater > state.stores.waterKg) reason = "Insufficient water.";
  else if (minimumProvisions > state.stores.provisionsKg) reason = "Insufficient provisions.";
  else if (minimumRepair > state.stores.repairStoresKg) reason = "Insufficient repair stores.";
  else if (minimumMedicine > state.stores.medicineKg) reason = "Insufficient medicine.";
  else if ((requirement.minimumMoraleBps ?? 0) > state.crew.moraleBps) reason = "Crew morale is too low.";
  else {
    const missingFlag = requirement.requiredFlags?.find((flag) => !hasFlag(state, flag));
    if (missingFlag !== undefined) reason = FLAG_REASONS[missingFlag] ?? "Requires preparation established by an earlier response.";
  }
  return { id: eventChoice.id, label: eventChoice.label, available: reason === null, reason };
}

function regionForState(state: Readonly<JourneySimulationState>): "north_atlantic" | "south_atlantic" | "cape_verde" | "cape" {
  if (state.journey.location === "cape_verde") return "cape_verde";
  if (state.journey.location === "cape") return "cape";
  return state.truePosition.yMnm <= -1_500_000 ? "south_atlantic" : "north_atlantic";
}

function passesHardGates(state: Readonly<JourneySimulationState>, event: Readonly<EventDefinition>): boolean {
  const gates = event.hardGates;
  if (gates.regions !== undefined && !gates.regions.includes(regionForState(state))) return false;
  if (gates.seasons !== undefined && !gates.seasons.includes(seasonForDate(state.date))) return false;
  if (gates.weatherKinds !== undefined && !gates.weatherKinds.includes(state.navigation.observedWeather)) return false;
  if (gates.requiredFlags?.some((flag) => !hasFlag(state, flag)) === true) return false;
  if (gates.forbiddenFlags?.some((flag) => hasFlag(state, flag)) === true) return false;
  if (gates.maximumMoraleBps !== undefined && state.crew.moraleBps > gates.maximumMoraleBps) return false;
  if (gates.maximumHealthBps !== undefined && state.crew.healthBps > gates.maximumHealthBps) return false;
  if (gates.minimumCommittedDay !== undefined && state.committedDay < gates.minimumCommittedDay) return false;
  if (
    gates.minimumUnfinishedWork !== undefined
    && state.journey.unfinishedWork < gates.minimumUnfinishedWork
  ) return false;
  if (
    gates.maximumShipComponent !== undefined
    && componentCondition(state.ship, gates.maximumShipComponent.component) > gates.maximumShipComponent.bps
  ) return false;
  return true;
}

function modifierApplies(state: Readonly<JourneySimulationState>, modifier: Readonly<EventWeightModifier>): boolean {
  switch (modifier.kind) {
    case "press_on": return state.sailingPolicy === "press_on";
    case "cautious": return state.sailingPolicy === "cautious";
    case "old_water": return hasOldWater(state.survival.batches.water, state.date);
    case "low_morale": return state.crew.moraleBps <= 4_500;
    case "low_health": return state.crew.healthBps <= 6_000;
    case "damaged_ship": return (["hull", "mast", "sails", "rudder"] as ShipComponent[])
      .some((component) => componentCondition(state.ship, component) <= 7_500);
    case "unfinished_work": return state.journey.unfinishedWork >= EVENT_TUNING.unfinishedWork.pressureThreshold;
    case "prepared_flag": return modifier.flag !== undefined && hasFlag(state, modifier.flag);
  }
}

export interface WeightedEvent {
  readonly event: EventDefinition;
  readonly weight: number;
}

export function eligibleEventWeights(
  state: Readonly<JourneySimulationState>,
): readonly WeightedEvent[] {
  return AUTHORED_EVENTS.flatMap((event) => {
    if (!passesHardGates(state, event)) return [];
    if (event.oncePerLeg && state.journey.firedThisLeg.includes(event.id)) return [];
    const last = [...state.journey.eventHistory].reverse().find((item) => item.eventId === event.id);
    if (last !== undefined && state.committedDay - last.presentedDay <= event.cooldownDays) return [];
    const weight = Math.max(1, event.baseWeight + event.weightModifiers.reduce(
      (sum, modifier) => sum + (modifierApplies(state, modifier) ? modifier.addWeight : 0),
      0,
    ));
    return [{ event, weight }];
  });
}

export function dailyEventChancePermille(state: Readonly<JourneySimulationState>): number {
  if (state.journey.dailyEventChancePermille === 0) return 0;
  const policyPermille = state.sailingPolicy === "cautious" ? 750 : state.sailingPolicy === "press_on" ? 1_500 : 1_000;
  const warningPressure = state.survival.warnings.length * 10;
  return Math.max(
    EVENT_TUNING.minimumDailyChancePermille,
    Math.min(
      EVENT_TUNING.maximumDailyChancePermille,
      Math.floor((state.journey.dailyEventChancePermille * policyPermille) / 1_000) + warningPressure,
    ),
  );
}

export function eventText(state: Readonly<JourneySimulationState>, event: Readonly<EventDefinition>): string {
  const remembered = event.rememberedText.find((item) => (
    (item.requiredFlag === undefined || hasFlag(state, item.requiredFlag))
    && (
      item.minimumUnfinishedWork === undefined
      || state.journey.unfinishedWork >= item.minimumUnfinishedWork
    )
  ));
  return remembered === undefined ? event.logText : `${event.logText} ${remembered.text}`;
}

export function presentEvent(
  state: Readonly<JourneySimulationState>,
  event: Readonly<EventDefinition>,
): PendingChoiceEvent {
  return deepFreeze({
    eventId: event.id,
    title: event.title,
    text: eventText(state, event),
    presentedDay: state.committedDay,
    warningStage: event.warningStage,
    choices: event.choices.map((eventChoice) => choiceAvailability(state, eventChoice)),
  });
}

export interface EventSelectionResult {
  readonly pendingEvent: PendingChoiceEvent | null;
  readonly eventPrng: PrngState;
}

/**
 * Stable draw order: if the eligible pool is empty, zero draws. Otherwise draw the
 * daily chance once; only a passing chance draws once more for weighted selection.
 */
export function selectDailyEvent(state: Readonly<JourneySimulationState>): EventSelectionResult {
  const eligible = eligibleEventWeights(state);
  if (eligible.length === 0) return { pendingEvent: null, eventPrng: state.journey.eventPrng };
  const chance = nextIntegerInclusive(state.journey.eventPrng, 1, 1_000);
  if (chance.value > dailyEventChancePermille(state)) {
    return { pendingEvent: null, eventPrng: chance.state };
  }
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  const selected = nextIntegerInclusive(chance.state, 1, totalWeight);
  let cursor = selected.value;
  for (const item of eligible) {
    cursor -= item.weight;
    if (cursor <= 0) return { pendingEvent: presentEvent(state, item.event), eventPrng: selected.state };
  }
  throw new Error("weighted event selection exhausted its deterministic pool");
}

export function authoredEventById(id: string): EventDefinition | undefined {
  return AUTHORED_EVENTS.find((event) => event.id === id);
}

validateEventCatalogue();
