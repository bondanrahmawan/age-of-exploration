import { validateEventCatalogue } from "../dist/index.js";

const stats = validateEventCatalogue();
process.stdout.write([
  `EVENTS_TOTAL: ${stats.total}`,
  `EVENTS_BY_CATEGORY: ${JSON.stringify(stats.byCategory)}`,
  `DELAYED: ${stats.delayed}`,
  `REMEMBERED: ${stats.remembered}`,
  `PREPARATION_SOFTENED: ${stats.preparationSoftened}`,
  `FACT_PRODUCING: ${stats.factProducing}`,
  "",
].join("\n"));
