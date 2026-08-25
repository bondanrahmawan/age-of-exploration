import { useEffect } from "preact/hooks";
import type { JSX } from "preact";
import { SHIP_COMPONENTS } from "../../src/index.js";
import type { GameActions } from "../controller.js";
import type { AnimationMode, ExpeditionPanel, ExpeditionViewModel } from "../view-model.js";
import { shipComponentCondition } from "../view-model.js";
import { ActiveChart } from "./ActiveChart.js";
import { SessionBriefing } from "./SessionBriefing.js";

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const tonnes = (kg: number) => `${(kg / 1_000).toFixed(2)} t`;
const percent = (bps: number) => `${(bps / 100).toFixed(0)}%`;

function handleBoundedScrollKeyDown(event: JSX.TargetedKeyboardEvent<HTMLElement>) {
  if (event.target !== event.currentTarget) return;
  const region = event.currentTarget;
  const page = Math.max(40, region.clientHeight * .8);
  if (event.key === "PageDown") region.scrollTop += page;
  else if (event.key === "PageUp") region.scrollTop -= page;
  else if (event.key === "Home") region.scrollTop = 0;
  else if (event.key === "End") region.scrollTop = region.scrollHeight;
  else return;
  event.preventDefault();
}

function DeckPanel({ model, controller }: { readonly model: ExpeditionViewModel; readonly controller: GameActions }) {
  const deck = model.deck;
  return (
    <section class="deck-panel" aria-labelledby="deck-title" tabIndex={0} onKeyDown={handleBoundedScrollKeyDown}>
      <div class="section-heading"><div><p class="eyebrow">Deck state</p><h2 id="deck-title">Ship, crew, and stores</h2></div><p>{deck.date} · day {deck.elapsedDays}</p></div>
      <div class="stat-grid">
        <article><span>Water</span><strong>{tonnes(deck.stores.waterKg)}</strong></article>
        <article><span>Provisions</span><strong>{tonnes(deck.stores.provisionsKg)}</strong></article>
        <article><span>Repair stores</span><strong>{tonnes(deck.stores.repairStoresKg)}</strong></article>
        <article><span>Medicine</span><strong>{tonnes(deck.stores.medicineKg)}</strong></article>
        <article><span>Hold used</span><strong>{tonnes(deck.holdUsedKg)}</strong><small>{tonnes(deck.holdRemainingKg)} free</small></article>
        <article><span>Money</span><strong>{deck.moneyDucats}</strong><small>ducats</small></article>
        <article><span>Crew</span><strong>{deck.crew.able}/{deck.crew.count}</strong><small>fit to work / aboard</small></article>
        <article><span>Health</span><strong>{percent(deck.crew.healthBps)}</strong></article>
        <article><span>Morale</span><strong>{percent(deck.crew.moraleBps)}</strong></article>
        <article><span>Fouling</span><strong>{percent(deck.foulingSpeedLossBps)}</strong><small>speed lost to hull growth</small></article>
      </div>
      <h3>Ship components</h3>
      <div class="component-grid">
        {SHIP_COMPONENTS.map((component) => {
          const condition = shipComponentCondition(deck.ship, component);
          const disabled = condition >= 10_000 || deck.stores.repairStoresKg < 250;
          const reason = condition >= 10_000 ? "Already sound." : deck.stores.repairStoresKg < 250 ? "Needs 0.25 t of repair stores." : null;
          return (
            <article key={component}>
              <span>{titleCase(component)}</span><strong>{percent(condition)}</strong>
              <button type="button" disabled={disabled} onClick={() => controller.repair(component, "at_sea")}>Spend a day repairing</button>
              {reason !== null && <small>{reason}</small>}
            </article>
          );
        })}
      </div>
      <dl class="deck-details">
        <div><dt>Location</dt><dd>{deck.location}</dd></div>
        <div><dt>Weather</dt><dd>{deck.observedWeather}</dd></div>
        <div><dt>Observed wind</dt><dd>{deck.observedWind}</dd></div>
        <div><dt>Heading</dt><dd>{deck.heading}</dd></div>
        <div><dt>Sailing policy</dt><dd>{titleCase(deck.sailingPolicy)}</dd></div>
        <div><dt>Ration policy</dt><dd>{titleCase(deck.rationPolicy)}</dd></div>
        <div><dt>Expedition intent</dt><dd>{deck.expeditionIntent}</dd></div>
      </dl>
      {deck.warnings.length > 0 && <div class="warning-stack" aria-label="Active warnings">{deck.warnings.map((warning) => <p key={warning}>Warning: {warning}</p>)}</div>}
    </section>
  );
}

function LogPanel({ model }: { readonly model: ExpeditionViewModel }) {
  return (
    <section class="log-panel" aria-labelledby="log-title" tabIndex={0} onKeyDown={handleBoundedScrollKeyDown}>
      <div class="section-heading"><div><p class="eyebrow">Written record</p><h2 id="log-title">Ship’s log</h2></div><p>{model.log.length} entries</p></div>
      {model.log.length === 0 ? <p class="empty-state">The log is ready for the first order.</p> : (
        <ol class="log-list">
          {model.log.map((entry) => <li key={entry.index}><span>Day {entry.day}</span><strong>{entry.title}</strong><p>{entry.text}</p></li>)}
        </ol>
      )}
    </section>
  );
}

export function ExpeditionScreen({ model, selectedPanel, animationMode, isAdvancing, autosaveBoundary, controller }: {
  readonly model: ExpeditionViewModel;
  readonly selectedPanel: ExpeditionPanel;
  readonly animationMode: AnimationMode;
  readonly isAdvancing: boolean;
  readonly autosaveBoundary: string;
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
    <main id="main-content" class="screen session-screen expedition-screen" data-screen="expedition">
      <SessionBriefing
        milestone={model.mission.milestone}
        missionStatus={model.mission.status}
        date={model.deck.date}
        elapsedDays={model.deck.elapsedDays}
        autosaveBoundary={autosaveBoundary}
        warnings={model.deck.warnings}
      />

      <aside class="critical-status" aria-label="Critical expedition status">
        <span>Water <strong>{tonnes(model.deck.stores.waterKg)}</strong></span>
        <span>Provisions <strong>{tonnes(model.deck.stores.provisionsKg)}</strong></span>
        <span>Health <strong>{percent(model.deck.crew.healthBps)}</strong></span>
        <span>Morale <strong>{percent(model.deck.crew.moraleBps)}</strong></span>
        <span>Hull <strong>{percent(model.deck.ship.hullBps)}</strong></span>
      </aside>

      <div class="expedition-workspace">
        <section class="command-rail" aria-labelledby="orders-title">
          <div class="order-heading">
            <p class="eyebrow">Current decision</p>
            <h1 id="orders-title">Set orders, then sail</h1>
            <p>Orders remain in force until you change them.</p>
          </div>
          <div class="order-grid">
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
            <label>Expedition intent
              <select value={model.deck.expeditionIntentValue} onChange={(event) => controller.dispatchSimulation({ type: "set_expedition_intent", intent: event.currentTarget.value as typeof model.deck.expeditionIntentValue })}>
                <option value="pursue_objective">Continue to the Cape</option>
                <option value="return_to_lisbon">Turn home for Lisbon</option>
                <option value="objective_abandoned">Give up the Cape</option>
              </select>
            </label>
          </div>
          <div class="day-controls">
            <button class="primary primary-action" type="button" disabled={isAdvancing} onClick={() => void controller.advanceUntilInterrupted()}>
              Sail until something happens
              <small>Runs day after day and stops before any decision.</small>
            </button>
            <button type="button" disabled={isAdvancing} aria-keyshortcuts="D" onClick={() => controller.advanceOneDay()}>Sail one day <kbd>D</kbd></button>
            <button type="button" disabled={isAdvancing || model.deck.observationReason !== null} onClick={() => controller.dispatchSimulation({ type: "observation_day" })}>
              Lie to and observe
              <small>{model.deck.observationReason ?? `One day, no ground made. Sounds for a coast to fix east and west. ${model.deck.observationDaysSpent} spent so far.`}</small>
            </button>
            <button type="button" disabled={!isAdvancing} aria-keyshortcuts="Escape" onClick={() => controller.stopAdvance()}>Stop after this day</button>
          </div>
          <p class="observation-summary">{model.deck.lastObservation}</p>
          <section class="record-rail" aria-label="Committed record" tabIndex={0} onKeyDown={handleBoundedScrollKeyDown}>
            <p class="eyebrow">Ship’s log</p>
            {model.log.length === 0
              ? <p class="empty-state">Nothing logged yet.</p>
              : (
                <ol class="record-list">
                  {model.log.map((entry, index) => (
                    <li key={entry.index} class={index === 0 ? "record-latest" : undefined}>
                      <span>Day {entry.day}{index === 0 ? " · latest" : ""}</span>
                      <strong>{entry.title}</strong>
                      <p>{entry.text}</p>
                    </li>
                  ))}
                </ol>
              )}
          </section>
        </section>

        <section class="expedition-view" aria-label="Expedition information views">
          <div class="view-toolbar">
            <nav class="panel-tabs" role="tablist" aria-label="Expedition views">
              {(["chart", "deck", "log"] as const).map((panel) => <button key={panel} type="button" role="tab" id={`tab-${panel}`} aria-selected={selectedPanel === panel} aria-controls={`panel-${panel}`} onClick={() => controller.selectPanel(panel)}>{titleCase(panel)}</button>)}
            </nav>
            <label class="animation-control">Motion
              <select value={animationMode} aria-label="Motion" onChange={(event) => controller.setAnimationMode(event.currentTarget.value as AnimationMode)}>
                <option value="normal">Normal</option><option value="reduced">Reduced</option><option value="skipped">Skipped</option>
              </select>
            </label>
          </div>
          <div class={`expedition-panel panel-${selectedPanel}`} role="tabpanel" id={`panel-${selectedPanel}`} aria-labelledby={`tab-${selectedPanel}`} tabIndex={0}>
            {selectedPanel === "chart" ? <ActiveChart chart={model.chart} /> : selectedPanel === "deck" ? <DeckPanel model={model} controller={controller} /> : <LogPanel model={model} />}
          </div>
        </section>
      </div>
    </main>
  );
}
