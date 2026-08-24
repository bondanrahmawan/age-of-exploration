import { useEffect, useState } from "preact/hooks";
import type { GameController } from "./controller.js";
import { AfterActionScreen } from "./components/AfterActionScreen.js";
import { ExpeditionScreen } from "./components/ExpeditionScreen.js";
import { InterruptScreen } from "./components/InterruptScreen.js";
import { OutfittingScreen } from "./components/OutfittingScreen.js";

export function App({ controller }: { readonly controller: GameController }) {
  const [, setRevision] = useState(0);
  useEffect(() => controller.subscribe(() => setRevision((value) => value + 1)), [controller]);
  const model = controller.view();
  const sessionActive = model.screen === "expedition" || model.screen === "interrupt";
  const autosaveBoundary = model.savePreview.boundary ?? "not started";
  return (
    <div class={`app-shell app-shell-${model.screen}${sessionActive ? " session-active" : ""}`}>
      <a class="skip-link" href="#main-content">Skip to main content</a>
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{model.announcement}</div>
      {model.error !== null && <div class="global-error" role="alert"><strong>Command not committed.</strong> {model.error}</div>}
      {model.screen === "outfitting" && model.outfitting !== null && <OutfittingScreen key={model.outfitting.campaignReady ? "campaign-ready" : "campaign-setup"} model={model.outfitting} preview={model.savePreview} autosaveBoundary={autosaveBoundary} controller={controller} />}
      {model.screen === "expedition" && model.expedition !== null && <ExpeditionScreen model={model.expedition} selectedPanel={model.selectedPanel} animationMode={model.animationMode} isAdvancing={model.isAdvancing} autosaveBoundary={autosaveBoundary} controller={controller} />}
      {model.screen === "interrupt" && model.interrupt !== null && <InterruptScreen model={model.interrupt} autosaveBoundary={autosaveBoundary} controller={controller} />}
      {model.screen === "after_action" && model.report !== null && <AfterActionScreen report={model.report} autosaveBoundary={autosaveBoundary} controller={controller} />}
    </div>
  );
}
