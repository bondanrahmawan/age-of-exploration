import { render } from "preact";
import { App } from "./App.js";
import { GameController } from "./controller.js";
import { BrowserCryptoSeedSource, FixedSeedSource } from "./seed.js";
import { CampaignSaveRepository, PreferenceRepository } from "./storage.js";
import "./styles.css";

async function bootstrap(): Promise<void> {
  const e2e = import.meta.env.MODE === "e2e";
  const environmentProvider = e2e ? (await import("./e2e-environment.js")).WP5_E2E_ENVIRONMENT : undefined;
  const seedSource = e2e
    ? new FixedSeedSource(Array.from({ length: 12 }, (_, index) => `wp5-browser-seed-${index + 1}`))
    : new BrowserCryptoSeedSource();
  const controller = new GameController(
    new CampaignSaveRepository(globalThis.localStorage),
    new PreferenceRepository(globalThis.localStorage),
    seedSource,
    {
      contentVersion: "base-game-v2",
      ...(e2e ? { dailyEventChancePermille: 0 } : {}),
      ...(environmentProvider === undefined ? {} : { environmentProvider }),
      prefersReducedMotion: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
  );
  const root = document.querySelector<HTMLDivElement>("#app");
  if (root === null) throw new Error("Application root is missing");
  render(<App controller={controller} />, root);
}

void bootstrap();
