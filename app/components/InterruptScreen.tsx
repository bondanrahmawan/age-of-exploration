import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { SHIP_COMPONENTS, STORE_KINDS, SURVIVAL_TUNING, capeVerdePurchaseCost, type StoreKind } from "../../src/index.js";
import type { GameActions } from "../controller.js";
import { shipComponentCondition, type InterruptViewModel, type ShipComponent } from "../view-model.js";
import { SessionBriefing } from "./SessionBriefing.js";

const labels: Record<StoreKind, string> = { water: "Water", provisions: "Provisions", repair_stores: "Repair stores", medicine: "Medicine" };
const tonnes = (kg: number) => `${(kg / 1_000).toFixed(2)} t`;
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

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

function CapeVerdeActions({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  const [quantityKg, setQuantityKg] = useState<Record<StoreKind, number>>({ water: 1_000, provisions: 1_000, repair_stores: 500, medicine: 500 });
  const availability = (store: StoreKind) => {
    const quantity = quantityKg[store];
    const stock = model.stock?.[`${store === "repair_stores" ? "repairStores" : store}Kg` as keyof NonNullable<InterruptViewModel["stock"]>] ?? 0;
    const current = model.stores[`${store === "repair_stores" ? "repairStores" : store}Kg` as keyof InterruptViewModel["stores"]];
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return "Enter a whole number of kilograms, above zero.";
    if (quantity > stock) return `The port has only ${tonnes(stock)} left.`;
    if (current + quantity > SURVIVAL_TUNING.stores[store].capKg) return `The ship can hold only ${tonnes(SURVIVAL_TUNING.stores[store].capKg)} of this.`;
    if (quantity > model.holdRemainingKg) return `Only ${tonnes(model.holdRemainingKg)} of hold space is free.`;
    const cost = capeVerdePurchaseCost(store, quantity);
    if (cost > model.moneyDucats) return `That costs ${cost} ducats and you have ${model.moneyDucats}.`;
    return null;
  };
  return (
    <div class="interrupt-actions cape-verde-actions">
      <section class="port-primary-actions" aria-labelledby="port-decisions-title">
        <div><p class="eyebrow">Current decision</p><h2 id="port-decisions-title">Choose the next leg</h2></div>
        <div class="choice-grid">
          <button type="button" onClick={() => controller.depositReport()}>Leave a copy of the report <small>{model.reportDeposited ? "Replaces the copy already here with what the crew knows today." : "Keeps today’s facts safe at Cape Verde even if the ship is lost."}</small></button>
          <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>Sets the ship to return to Lisbon.</small></button>
          <button class="primary primary-action" type="button" disabled={model.careeningDaysCompleted !== 0 || model.survivalStatus !== "active"} onClick={() => controller.dispatchSimulation({ type: "leave_cape_verde_port" })}>Depart Cape Verde <small>{model.careeningDaysCompleted !== 0 ? `Finish careening first — ${model.careeningDaysCompleted} of 6 days done.` : model.survivalStatus !== "active" ? "The ship cannot sail in its present state." : "Sails on south, or home if you have turned back."}</small></button>
        </div>
      </section>
      <div class="port-operations-scroll bounded-scroll" tabIndex={0} onKeyDown={handleBoundedScrollKeyDown} aria-label="Cape Verde stores and services">
        <section aria-labelledby="port-stores-title">
          <h2 id="port-stores-title">What the port has left</h2>
          <div class="purchase-grid">
            {STORE_KINDS.map((store) => {
              const reason = availability(store);
              const cost = Number.isSafeInteger(quantityKg[store]) && quantityKg[store] > 0 ? capeVerdePurchaseCost(store, quantityKg[store]) : 0;
              return (
                <div class="purchase-card" key={store}>
                  <label for={`purchase-${store}`}>{labels[store]} <span>kilograms</span></label>
                  <input id={`purchase-${store}`} type="number" min="1" step="100" value={quantityKg[store]} onInput={(event) => setQuantityKg((values) => ({ ...values, [store]: Number(event.currentTarget.value) }))} />
                  <small>Port has {tonnes(model.stock?.[`${store === "repair_stores" ? "repairStores" : store}Kg` as keyof NonNullable<InterruptViewModel["stock"]>] ?? 0)} · costs {cost} ducats</small>
                  <button type="button" disabled={reason !== null} onClick={() => controller.purchaseAtCapeVerde(store, quantityKg[store])}>Buy {labels[store].toLowerCase()}</button>
                  {reason !== null && <p class="disabled-reason">{reason}</p>}
                </div>
              );
            })}
          </div>
        </section>
        <section aria-labelledby="port-services-title">
          <h2 id="port-services-title">Ashore</h2>
          <div class="choice-grid">
          <button type="button" disabled={model.moneyDucats < 5} onClick={() => controller.dispatchSimulation({ type: "rest_at_cape_verde" })}>Rest the crew ashore <small>One day · 5 ducats · +2% health, +4% morale. The crew still eats and drinks.</small></button>
          {SHIP_COMPONENTS.map((component) => {
            const condition = shipComponentCondition(model.ship, component);
            const reason = condition >= 10_000 ? "Already sound." : model.stores.repairStoresKg < 500 ? "Needs 0.5 t of repair stores." : null;
            return <button key={component} type="button" disabled={reason !== null} title={reason ?? undefined} onClick={() => controller.repair(component, "cape_verde")}>Repair the {component} <small>{reason ?? "One day · 0.5 t of repair stores · restores up to 15%."}</small></button>;
          })}
          <button type="button" onClick={() => controller.dispatchSimulation({ type: "careen_day_at_cape_verde" })}>Careen the hull <small>Scrapes the hull clean to recover speed. {model.careeningDaysCompleted} of 6 days done. The crew still eats and drinks.</small></button>
          <button type="button" disabled={model.rumourPurchased || model.moneyDucats < 10} onClick={() => controller.dispatchSimulation({ type: "purchase_cape_verde_rumour" })}>Buy a rumour <small>{model.rumourPurchased ? "The port had only one rumour to sell this voyage." : model.moneyDucats < 10 ? "Needs 10 ducats." : "10 ducats. A claim only 25% likely to be true."}</small></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function CapeActions({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  const surveyReason = model.capeSurveyed ? "Already surveyed this voyage." : null;
  const waterReason = !model.capeWaterKnown ? "The chart has no confirmed water source here yet." : model.holdRemainingKg <= 0 ? "The hold is full." : null;
  return (
    <section class="compact-decision-surface" aria-labelledby="cape-decisions-title">
      <div><p class="eyebrow">Current decision</p><h2 id="cape-decisions-title">You have reached the Cape</h2></div>
      <div class="choice-grid major-choices">
        <button type="button" disabled={surveyReason !== null} onClick={() => controller.dispatchSimulation({ type: "survey_cape_day" })}>Survey the coast <small>{surveyReason ?? `One day · ${model.capeSurveyDaysCompleted} of 2 done. The crew still eats and drinks.`}</small></button>
        <button type="button" disabled={waterReason !== null} onClick={() => controller.dispatchSimulation({ type: "collect_cape_water" })}>Take on water <small>{waterReason ?? `One day · up to 12.0 t, with ${tonnes(model.holdRemainingKg)} of hold free.`}</small></button>
        <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>Sets the ship to return to Lisbon.</small></button>
        <button class="primary primary-action" type="button" onClick={() => controller.dispatchSimulation({ type: "leave_cape" })}>Leave the Cape <small>Puts to sea again.</small></button>
      </div>
    </section>
  );
}

function SurvivalActions({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  return (
    <section class="compact-decision-surface" aria-labelledby="survival-decisions-title">
      <div><p class="eyebrow">Current decision</p><h2 id="survival-decisions-title">Answer the deck warning</h2></div>
      <div class="choice-grid major-choices">
        {SHIP_COMPONENTS.map((component: ShipComponent) => {
          const condition = shipComponentCondition(model.ship, component);
          const reason = condition >= 10_000 ? "Already sound." : model.stores.repairStoresKg < 250 ? "Needs 0.25 t of repair stores." : null;
          return <button key={component} type="button" disabled={reason !== null} onClick={() => controller.repair(component, "at_sea")}>Repair the {component} <small>{reason ?? "One day · 0.25 t of repair stores · restores up to 5%."}</small></button>;
        })}
        <button type="button" disabled={model.survivalStatus !== "active"} onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>{model.survivalStatus === "active" ? "Sets the ship to return to Lisbon." : "The ship cannot sail in its present state."}</small></button>
        {model.canDismiss && <button class="primary primary-action" type="button" onClick={() => controller.dismissSoftInterrupt()}>Back to the helm <small>The warning stays in the ship’s log.</small></button>}
      </div>
    </section>
  );
}

export function InterruptScreen({ model, autosaveBoundary, controller }: { readonly model: InterruptViewModel; readonly autosaveBoundary: string; readonly controller: GameActions }) {
  return (
    <main id="main-content" class={`screen session-screen interrupt-screen interrupt-${model.kind}`} data-screen="interrupt">
      <SessionBriefing
        milestone={model.mission.milestone}
        missionStatus={model.mission.status}
        date={model.date}
        elapsedDays={model.elapsedDays}
        autosaveBoundary={autosaveBoundary}
        warnings={model.warnings}
      />
      <header class="interrupt-header">
        <div><p class="eyebrow">Halted · {titleCase(model.location)}</p><h1>{model.title}</h1><p class="lede">{model.description}</p></div>
        <div class="last-result" aria-label="Last entry in the log">
          <span>Last entry in the log</span>
          {model.lastResult === null ? <p>Nothing logged yet.</p> : <p><strong>{model.lastResult.title}:</strong> {model.lastResult.text}</p>}
        </div>
      </header>
      <aside class="critical-status interrupt-status" aria-label="Decision resources and condition">
        <span>Water <strong>{tonnes(model.stores.waterKg)}</strong></span><span>Provisions <strong>{tonnes(model.stores.provisionsKg)}</strong></span><span>Repair <strong>{tonnes(model.stores.repairStoresKg)}</strong></span><span>Medicine <strong>{tonnes(model.stores.medicineKg)}</strong></span><span>Health <strong>{(model.crew.healthBps / 100).toFixed(0)}%</strong></span><span>Hull <strong>{(model.ship.hullBps / 100).toFixed(0)}%</strong></span><span>Money <strong>{model.moneyDucats} d</strong></span>
      </aside>
      <div class="interrupt-decision-frame">
        {model.kind === "event" && (
          <section class="event-choice-list bounded-scroll" tabIndex={0} onKeyDown={handleBoundedScrollKeyDown} aria-labelledby="event-decisions-title">
            <div><p class="eyebrow">Current decision</p><h2 id="event-decisions-title">Choose a response</h2></div>
            <div class="event-choice-grid">
              {model.choices.map((choice) => (
                <article key={choice.id} class={choice.available ? "choice-available" : "choice-unavailable"}>
                  <button class={choice.available ? "primary-action" : ""} type="button" disabled={!choice.available} onClick={() => model.eventId !== null && controller.chooseEvent(model.eventId, choice.id)}>{choice.label}</button>
                  <p><strong>Needs:</strong> {choice.knownRequirement}</p>
                  <p>{choice.knownConsequence}</p>
                  {!choice.available && <p class="disabled-reason">Unavailable: {choice.reason}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {model.canRecogniseCape && <section class="compact-decision-surface"><div><p class="eyebrow">Current decision</p><h2>Confirm the landfall</h2></div><div class="choice-grid major-choices"><button class="primary primary-action" type="button" onClick={() => controller.dispatchSimulation({ type: "recognise_cape_landfall" })}>Recognise the Cape landfall <small>Corrects the ship’s estimated position and completes the mission.</small></button></div></section>}
        {model.canEnterCapeVerde && <section class="compact-decision-surface"><div><p class="eyebrow">Current decision</p><h2>A known port</h2></div><div class="choice-grid major-choices"><button class="primary primary-action" type="button" onClick={() => controller.dispatchSimulation({ type: "enter_cape_verde_port" })}>Enter Cape Verde port <small>Opens the port’s stores and services.</small></button></div></section>}
        {model.kind === "cape_verde" && <CapeVerdeActions model={model} controller={controller} />}
        {model.kind === "cape" && <CapeActions model={model} controller={controller} />}
        {(model.kind === "survival" || model.kind === "landfall") && !model.canRecogniseCape && !model.canEnterCapeVerde && <SurvivalActions model={model} controller={controller} />}
        {model.kind === "terminal" && (
          <section class="terminal-card"><p class="eyebrow">Current decision</p><h2>Finalize the expedition</h2><p>{model.outcomeReason}</p><button class="primary primary-action" type="button" onClick={() => controller.finalizeExpedition()}>Finalize and read the report</button></section>
        )}
      </div>
    </main>
  );
}
