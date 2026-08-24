import {
  LANDMARK_IDS,
  LANDMARKS,
  SOUTH_ATLANTIC_CURRENT,
  canonicalCampaignState,
  createCampaign,
  createCampaignReplay,
  executeCampaignCommand,
  hashAfterActionReport,
  hashCampaignCommandLog,
  hashCampaignFacts,
  hashCampaignState,
  hashCanonical,
  replayCampaign,
} from "../dist/index.js";

const landmarkPosition = (id) => ({ ...LANDMARKS.find((item) => item.id === id).centre });

function noMovement(context) {
  if (context.navigation === null) throw new Error("WP4 fixture requires navigation state");
  return {
    schema: "wp1-navigation-environment-v1",
    id: "wp4-fixture:no-movement",
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
}

function transit(context, target, id) {
  const delta = {
    xMnm: target.xMnm - context.truePosition.xMnm,
    yMnm: target.yMnm - context.truePosition.yMnm,
  };
  return {
    ...noMovement(context),
    id,
    knownCurrentMnm: delta,
    leewayMnm: delta,
  };
}

const fixtureEnvironment = (context) => {
  if (context.heading === "SW") return transit(context, landmarkPosition(LANDMARK_IDS.capeVerde), "wp4-fixture:transit-cape-verde");
  if (context.heading === "NE") return transit(context, landmarkPosition(LANDMARK_IDS.lisbon), "wp4-fixture:transit-lisbon");
  if (context.heading === "SE") return transit(context, landmarkPosition(LANDMARK_IDS.capeGoal), "wp4-fixture:transit-cape");
  if (context.heading === "S") return transit(context, { xMnm: -770_000, yMnm: -1_800_000 }, "wp4-fixture:transit-current-north");
  if (context.heading === "NW") return transit(context, { xMnm: 1_000_000, yMnm: -3_500_000 }, "wp4-fixture:transit-current-south");
  if (context.heading === "NNW") return transit(context, landmarkPosition(LANDMARK_IDS.capeVerde), "wp4-fixture:return-cape-verde");
  if (context.heading === "E") {
    const known = context.navigation.knowledge.find((fact) => fact.id === SOUTH_ATLANTIC_CURRENT.id
      && fact.type === "current"
      && fact.status === "confirmed"
      && fact.confidence >= 70);
    return {
      ...noMovement(context),
      id: "wp4-fixture:hidden-current-day",
      trueCurrentMnm: { ...SOUTH_ATLANTIC_CURRENT.vectorMnmPerDay },
      knownCurrentMnm: known?.type === "current"
        ? { ...known.claimedVectorMnmPerDay }
        : { xMnm: 0, yMnm: 0 },
    };
  }
  return noMovement(context);
};

const forward = (command) => ({ type: "forward_simulation_command", command });
const allocation = {
  waterKg: 24_000,
  provisionsKg: 18_000,
  repairStoresKg: 4_000,
  medicineKg: 0,
};
const currentLoop = () => [
  forward({ type: "set_heading", heading: "S" }),
  forward({ type: "advance_day" }),
  forward({ type: "set_heading", heading: "E" }),
  ...Array.from({ length: 5 }, () => forward({ type: "advance_day" })),
];

const starting = createCampaign({
  contentVersion: "wp4-knowledge-campaign-v1",
  expeditionDailyEventChancePermille: 0,
});
let state = starting;
const execute = (command) => {
  state = executeCampaignCommand(state, command, { environmentProvider: fixtureEnvironment });
};
const executeAll = (commands) => commands.forEach(execute);

executeAll([
  { type: "start_expedition", runSeed: "wp4-fixture-run-1" },
  forward({ type: "set_lisbon_outfitting", allocation: { ...allocation, waterKg: 0 } }),
  forward({ type: "depart_lisbon" }),
  forward({ type: "set_heading", heading: "SW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  forward({ type: "purchase_cape_verde_rumour" }),
  { type: "deposit_report_at_cape_verde" },
  forward({ type: "leave_cape_verde_port" }),
  forward({ type: "set_heading", heading: "S" }),
  forward({ type: "advance_day" }),
  forward({ type: "set_heading", heading: "E" }),
  forward({ type: "advance_day" }),
  forward({ type: "advance_day" }),
  forward({ type: "advance_day" }),
  { type: "finalize_expedition" },
]);
const afterRun1 = state;

executeAll([
  { type: "start_expedition", runSeed: "wp4-fixture-run-2" },
  forward({ type: "set_lisbon_outfitting", allocation }),
  forward({ type: "depart_lisbon" }),
  forward({ type: "set_heading", heading: "SW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  forward({ type: "leave_cape_verde_port" }),
  ...currentLoop(),
  forward({ type: "set_heading", heading: "NNW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  forward({ type: "leave_cape_verde_port" }),
  ...currentLoop(),
  forward({ type: "set_heading", heading: "NNW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  forward({ type: "leave_cape_verde_port" }),
  ...currentLoop(),
  forward({ type: "set_heading", heading: "SE" }),
  forward({ type: "advance_day" }),
  forward({ type: "recognise_cape_landfall" }),
  forward({ type: "survey_cape_day" }),
  forward({ type: "survey_cape_day" }),
  forward({ type: "leave_cape" }),
  forward({ type: "set_heading", heading: "NW" }),
  forward({ type: "advance_day" }),
  forward({ type: "set_heading", heading: "NNW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  { type: "deposit_report_at_cape_verde" },
  forward({ type: "leave_cape_verde_port" }),
  forward({ type: "set_heading", heading: "NE" }),
  forward({ type: "advance_day" }),
  { type: "finalize_expedition" },
]);
const afterRun2 = state;

executeAll([
  { type: "start_expedition", runSeed: "wp4-fixture-run-3" },
  forward({ type: "set_lisbon_outfitting", allocation }),
  forward({ type: "depart_lisbon" }),
  forward({ type: "set_heading", heading: "SW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  forward({ type: "leave_cape_verde_port" }),
  forward({ type: "set_heading", heading: "S" }),
  forward({ type: "advance_day" }),
  forward({ type: "set_heading", heading: "E" }),
]);
const beforeKnownCurrent = state.activeExpedition.journey.estimatedPosition.xMnm;
execute(forward({ type: "advance_day" }));
const knownCurrentEstimateDelta = state.activeExpedition.journey.estimatedPosition.xMnm - beforeKnownCurrent;
executeAll([
  forward({ type: "set_heading", heading: "NNW" }),
  forward({ type: "advance_day" }),
  forward({ type: "enter_cape_verde_port" }),
  forward({ type: "leave_cape_verde_port" }),
  forward({ type: "set_heading", heading: "NE" }),
  forward({ type: "advance_day" }),
  { type: "finalize_expedition" },
]);
const afterRun3 = state;

const replay = createCampaignReplay(starting, state.replayCommands);
const replayed = replayCampaign(starting, replay, { environmentProvider: fixtureEnvironment });
if (canonicalCampaignState(replayed) !== canonicalCampaignState(state)) {
  throw new Error("WP4 fixture replay is not byte-equivalent");
}
if (knownCurrentEstimateDelta !== 18_000) {
  throw new Error(`WP4 fixture expected inherited current estimate delta 18000, got ${knownCurrentEstimateDelta}`);
}

process.stdout.write([
  `RUN_1_STATE_SHA256: ${hashCampaignState(afterRun1)}`,
  `RUN_1_REPORT_SHA256: ${hashAfterActionReport(afterRun1.afterActionReports[0])}`,
  `RUN_2_STATE_SHA256: ${hashCampaignState(afterRun2)}`,
  `RUN_2_REPORT_SHA256: ${hashAfterActionReport(afterRun2.afterActionReports[1])}`,
  `RUN_3_STATE_SHA256: ${hashCampaignState(afterRun3)}`,
  `RUN_3_REPORT_SHA256: ${hashAfterActionReport(afterRun3.afterActionReports[2])}`,
  `FINAL_KNOWLEDGE_SHA256: ${hashCampaignFacts(afterRun3)}`,
  `CAMPAIGN_COMMAND_LOG_SHA256: ${hashCampaignCommandLog(afterRun3)}`,
  `CAMPAIGN_REPLAY_SHA256: ${hashCanonical(replay)}`,
  `RUN_3_KNOWN_CURRENT_ESTIMATE_DELTA_MNM: ${knownCurrentEstimateDelta}`,
  "",
].join("\n"));
