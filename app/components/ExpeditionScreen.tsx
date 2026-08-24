import { useEffect } from "preact/hooks";
import { SHIP_COMPONENTS } from "../../src/index.js";
import type { GameActions } from "../controller.js";
import type { AnimationMode, ExpeditionPanel, ExpeditionViewModel } from "../view-model.js";
import { shipComponentCondition } from "../view-model.js";
import { ActiveChart } from "./ActiveChart.js";

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const tonnes = (kg: number) => `${(kg / 1_000).toFixed(2)} t`;
const percent = (bps: number) => `${(bps / 100).toFixed(0)}%`;

function DeckPanel({ model, controller }: { readonly model: ExpeditionViewModel; readonly controller: GameActions }) {
  const deck = model.deck;
  return (
    <section class="deck-panel" aria-labelledby="deck-title">
      <div class="section-heading"><div><p class="eyebrow">Deck state</p><h2 id="deck-title">Ship, crew, and stores</h2></div><p>{deck.date} · day {deck.elapsedDays}</p></div>
      <div class="stat-grid">
        <article><span>Water</span><strong>{tonnes(deck.stores.waterKg)}</strong></article>
        <article><span>Provisions</span><strong>{tonnes(deck.stores.provisionsKg)}</strong></article>
        <article><span>Repair stores</span><strong>{tonnes(deck.stores.repairStoresKg)}</strong></article>
        <article><span>Medicine</span><strong>{tonnes(deck.stores.medicineKg)}</strong></article>
        <article><span>Hold used</span><strong>{tonnes(deck.holdUsedKg)}</strong><small>{tonnes(deck.holdRemainingKg)} free</small></article>
        <article><span>Money</span><strong>{deck.moneyDucats}</strong><small>ducats</small></article>
        <article><span>Crew</span><strong>{deck.crew.able}/{deck.crew.count}</strong><small>able / aboard</small></article>
        <article><span>Health</span><strong>{percent(deck.crew.healthBps)}</strong></article>
        <article><span>Morale</span><strong>{percent(deck.crew.moraleBps)}</strong></article>
        <article><span>Fouling</span><strong>{percent(deck.foulingSpeedLossBps)}</strong><small>speed loss</small></article>
      </div>
      <h3>Ship components</h3>
      <div class="component-grid">
        {SHIP_COMPONENTS.map((component) => {
          const condition = shipComponentCondition(deck.ship, component);
          const disabled = condition >= 10_000 || deck.stores.repairStoresKg < 250;
          const reason = condition >= 10_000 ? "Already at full condition." : deck.stores.repairStoresKg < 250 ? "Requires 0.25 t repair stores." : null;
          return (
            <article key={component}>
              <span>{titleCase(component)}</span><strong>{percent(condition)}</strong>
              <button type="button" disabled={disabled} onClick={() => controller.repair(component, "at_sea")}>Repair one day</button>
              {reason !== null && <small>{reason}</small>}
            </article>
          );
        })}
      </div>
      <dl class="deck-details">
        <div><dt>Location</dt><dd>{deck.location}</dd></div>
        <div><dt>Weather</dt><dd>{deck.observedWeather}</dd></div>
        <div><dt>Known wind</dt><dd>{deck.observedWind}</dd></div>
        <div><dt>Heading</dt><dd>{deck.heading}</dd></div>
        <div><dt>Sailing policy</dt><dd>{titleCase(deck.sailingPolicy)}</dd></div>
        <div><dt>Ration policy</dt><dd>{titleCase(deck.rationPolicy)}</dd></div>
        <div><dt>Intent</dt><dd>{deck.expeditionIntent}</dd></div>
      </dl>
      {deck.warnings.length > 0 && <div class="warning-stack" aria-label="Active warnings">{deck.warnings.map((warning) => <p key={warning}>Warning: {warning}</p>)}</div>}
    </section>
  );
}

function LogPanel({ model }: { readonly model: ExpeditionViewModel }) {
  return (
    <section class="log-panel" aria-labelledby="log-title">
      <div class="section-heading"><div><p class="eyebrow">Written record</p><h2 id="log-title">Expedition log</h2></div><p>{model.log.length} committed entries</p></div>
      {model.log.length === 0 ? <p class="empty-state">The log is ready for the first order.</p> : (
        <ol class="log-list">
          {model.log.map((entry) => <li key={entry.index}><span>Day {entry.day}</span><strong>{entry.title}</strong><p>{entry.text}</p></li>)}
        </ol>
      )}
    </section>
  );
}

export function ExpeditionScreen({ model, selectedPanel, animationMode, isAdvancing, controller }: {
  readonly model: ExpeditionViewModel;
  readonly selectedPanel: ExpeditionPanel;
  readonly animationMode: AnimationMode;
  readonly isAdvancing: boolean;
  readonly controller: GameActions;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches("input, select, textarea, button, a")) return;
      if (event.key.toLowerCase() === "d" && !event.repeat && !isAdvancing) {
        event.preventDefault();
        controller.advanceOneDay();
      }
      if (event.key === "Escape" && isAdvancing) controller.stopAdvance();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [controller, isAdvancing]);

  return (
    <main id="main-content" class="screen expedition-screen" data-screen="expedition">
      <header class="expedition-header">
        <div><p class="eyebrow">Expedition {model.deck.date}</p><h1>The uncertain sea</h1><p>{model.deck.location} · day {model.deck.elapsedDays}</p></div>
        <div class="compact-stores" aria-label="Quick stores status"><span>Water <strong>{tonnes(model.deck.stores.waterKg)}</strong></span><span>Provisions <strong>{tonnes(model.deck.stores.provisionsKg)}</strong></span><span>Morale <strong>{percent(model.deck.crew.moraleBps)}</strong></span></div>
      </header>

      <section class="command-rail" aria-labelledby="orders-title">
        <div class="order-heading"><p class="eyebrow">Standing orders</p><h2 id="orders-title">Set the next day</h2></div>
        <label>Heading
          <select value={model.deck.heading} onChange={(event) => controller.setHeading(event.currentTarget.value as typeof model.deck.heading)}>
            {model.headings.map((heading) => <option key={heading} value={heading}>{heading}</option>)}
          </select>
        </label>
        <label>Sailing policy
          <select value={model.deck.sailingPolicy} onChange={(event) => controller.setSailingPolicy(event.currentTarget.value as typeof model.deck.sailingPolicy)}>
            {model.sailingPolicies.map((policy) => <option key={policy} value={policy}>{titleCase(policy)}</option>)}
          </select>
        </label>
        <label>Ration policy
          <select value={model.deck.rationPolicy} onChange={(event) => controller.setRationPolicy(event.currentTarget.value as typeof model.deck.rationPolicy)}>
            {model.rationPolicies.map((policy) => <option key={policy} value={policy}>{titleCase(policy)}</option>)}
          </select>
        </label>
        <label>Animation
          <select value={animationMode} onChange={(event) => controller.setAnimationMode(event.currentTarget.value as AnimationMode)}>
            <option value="normal">Normal</option><option value="reduced">Reduced</option><option value="skipped">Skipped</option>
          </select>
        </label>
        <div class="day-controls">
          <button class="primary" type="button" disabled={isAdvancing} aria-keyshortcuts="D" onClick={() => controller.advanceOneDay()}>Advance one day <kbd>D</kbd></button>
          <button type="button" disabled={isAdvancing} onClick={() => void controller.advanceUntilInterrupted()}>Advance until interrupted</button>
          <button type="button" disabled={!isAdvancing} aria-keyshortcuts="Escape" onClick={() => controller.stopAdvance()}>Stop between days</button>
        </div>
        <details class="intent-controls">
          <summary>Expedition intent</summary>
          <div class="button-row">
            <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "pursue_objective" })}>Continue objective</button>
            <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home</button>
            <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "objective_abandoned" })}>Abandon objective</button>
          </div>
        </details>
      </section>

      <nav class="panel-tabs" role="tablist" aria-label="Expedition views">
        {(["chart", "deck", "log"] as const).map((panel) => <button key={panel} type="button" role="tab" id={`tab-${panel}`} aria-selected={selectedPanel === panel} aria-controls={`panel-${panel}`} onClick={() => controller.selectPanel(panel)}>{titleCase(panel)}</button>)}
      </nav>
      <div role="tabpanel" id={`panel-${selectedPanel}`} aria-labelledby={`tab-${selectedPanel}`} tabIndex={0}>
        {selectedPanel === "chart" ? <ActiveChart chart={model.chart} /> : selectedPanel === "deck" ? <DeckPanel model={model} controller={controller} /> : <LogPanel model={model} />}
      </div>
    </main>
  );
}
