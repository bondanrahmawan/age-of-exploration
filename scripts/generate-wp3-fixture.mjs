import {
  applyCommand,
  createJourneyState,
  hashEventLog,
  hashState,
} from "../dist/index.js";

const commands = [
  {
    type: "set_lisbon_outfitting",
    allocation: {
      waterKg: 20_000,
      provisionsKg: 12_000,
      repairStoresKg: 4_000,
      medicineKg: 1_000,
    },
  },
  { type: "depart_lisbon" },
  { type: "set_heading", heading: "SW" },
  { type: "advance_day" },
  { type: "choose_event", eventId: "stores.rats", choiceId: "hunt-and-clean" },
];

let state = createJourneyState({
  contentVersion: "wp3-authored-journey-v2",
  runSeed: "wp3-representative-route",
  dailyEventChancePermille: 1_000,
});
for (const command of commands) state = applyCommand(state, command);

process.stdout.write([
  `STATE_SHA256: ${hashState(state)}`,
  `LOG_SHA256: ${hashEventLog(state)}`,
  "",
].join("\n"));
