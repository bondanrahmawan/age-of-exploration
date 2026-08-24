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
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return "Enter a positive quantity in whole kilograms.";
    if (quantity > stock) return `Only ${tonnes(stock)} remains in finite port stock.`;
    if (current + quantity > SURVIVAL_TUNING.stores[store].capKg) return `The ship cap is ${tonnes(SURVIVAL_TUNING.stores[store].capKg)}.`;
    if (quantity > model.holdRemainingKg) return `Only ${tonnes(model.holdRemainingKg)} of hold capacity remains.`;
    const cost = capeVerdePurchaseCost(store, quantity);
    if (cost > model.moneyDucats) return `This costs ${cost} ducats; only ${model.moneyDucats} remain.`;
    return null;
  };
  return (
    <div class="interrupt-actions cape-verde-actions">
      <section class="port-primary-actions" aria-labelledby="port-decisions-title">
        <div><p class="eyebrow">Current decision</p><h2 id="port-decisions-title">Choose the next leg</h2></div>
        <div class="choice-grid">
          <button type="button" onClick={() => controller.depositReport()}>Deposit report snapshot <small>{model.reportDeposited ? "Replace the prior snapshot with current carried facts." : "Preserve current eligible facts at Cape Verde."}</small></button>
          <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>Set the return intent before departure.</small></button>
          <button class="primary primary-action" type="button" disabled={model.careeningDaysCompleted !== 0 || model.survivalStatus !== "active"} onClick={() => controller.dispatchSimulation({ type: "leave_cape_verde_port" })}>Depart Cape Verde <small>{model.careeningDaysCompleted !== 0 ? "Finish the six-day careening cycle first." : model.survivalStatus !== "active" ? "The ship cannot currently make way." : "Continue south or follow the return intent."}</small></button>
        </div>
      </section>
      <div class="port-operations-scroll bounded-scroll" tabIndex={0} onKeyDown={handleBoundedScrollKeyDown} aria-label="Cape Verde stores and services">
        <section aria-labelledby="port-stores-title">
          <h2 id="port-stores-title">Finite port stores</h2>
          <div class="purchase-grid">
            {STORE_KINDS.map((store) => {
              const reason = availability(store);
              const cost = Number.isSafeInteger(quantityKg[store]) && quantityKg[store] > 0 ? capeVerdePurchaseCost(store, quantityKg[store]) : 0;
              return (
                <div class="purchase-card" key={store}>
                  <label for={`purchase-${store}`}>{labels[store]} <span>kilograms</span></label>
                  <input id={`purchase-${store}`} type="number" min="1" step="100" value={quantityKg[store]} onInput={(event) => setQuantityKg((values) => ({ ...values, [store]: Number(event.currentTarget.value) }))} />
                  <small>Stock {tonnes(model.stock?.[`${store === "repair_stores" ? "repairStores" : store}Kg` as keyof NonNullable<InterruptViewModel["stock"]>] ?? 0)} · cost {cost} ducats</small>
                  <button type="button" disabled={reason !== null} onClick={() => controller.purchaseAtCapeVerde(store, quantityKg[store])}>Buy {labels[store]}</button>
                  {reason !== null && <p class="disabled-reason">{reason}</p>}
                </div>
              );
            })}
          </div>
        </section>
        <section aria-labelledby="port-services-title">
          <h2 id="port-services-title">Services and preparation</h2>
          <div class="choice-grid">
          <button type="button" disabled={model.moneyDucats < 5} onClick={() => controller.dispatchSimulation({ type: "rest_at_cape_verde" })}>Rest ashore one day <small>5 ducats; stores consumed; +2% health, +4% morale</small></button>
          {SHIP_COMPONENTS.map((component) => {
            const condition = shipComponentCondition(model.ship, component);
            const reason = condition >= 10_000 ? "Already at full condition." : model.stores.repairStoresKg < 500 ? "Requires 0.5 t repair stores." : null;
            return <button key={component} type="button" disabled={reason !== null} title={reason ?? undefined} onClick={() => controller.repair(component, "cape_verde")}>Repair {component} one day <small>{reason ?? "0.5 t repair stores; restores up to 15%."}</small></button>;
          })}
          <button type="button" onClick={() => controller.dispatchSimulation({ type: "careen_day_at_cape_verde" })}>Careen one day <small>{model.careeningDaysCompleted}/6 days complete; stores consumed</small></button>
          <button type="button" disabled={model.rumourPurchased || model.moneyDucats < 10} onClick={() => controller.dispatchSimulation({ type: "purchase_cape_verde_rumour" })}>Buy a seeded rumour <small>{model.rumourPurchased ? "The one rumour for this expedition was already bought." : model.moneyDucats < 10 ? "Requires 10 ducats." : "10 ducats; confidence 25%."}</small></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function CapeActions({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  const surveyReason = model.capeSurveyed ? "The Cape was already surveyed on this expedition." : null;
  const waterReason = !model.capeWaterKnown ? "Requires an observed or confirmed Cape water-source fact." : model.holdRemainingKg <= 0 ? "The hold has no remaining capacity." : null;
  return (
    <section class="compact-decision-surface" aria-labelledby="cape-decisions-title">
      <div><p class="eyebrow">Current decision</p><h2 id="cape-decisions-title">Use the recognised landfall</h2></div>
      <div class="choice-grid major-choices">
        <button type="button" disabled={surveyReason !== null} onClick={() => controller.dispatchSimulation({ type: "survey_cape_day" })}>Survey one full day <small>{surveyReason ?? `${model.capeSurveyDaysCompleted}/2 days complete; normal stores consumed.`}</small></button>
        <button type="button" disabled={waterReason !== null} onClick={() => controller.dispatchSimulation({ type: "collect_cape_water" })}>Collect legal Cape water <small>{waterReason ?? `One full day; collect up to 12.0 t with ${tonnes(model.holdRemainingKg)} hold free.`}</small></button>
        <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>Set return intent before leaving.</small></button>
        <button class="primary primary-action" type="button" onClick={() => controller.dispatchSimulation({ type: "leave_cape" })}>Leave the Cape <small>Begin the next sailing leg.</small></button>
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
          const reason = condition >= 10_000 ? "Already at full condition." : model.stores.repairStoresKg < 250 ? "Requires 0.25 t repair stores." : null;
          return <button key={component} type="button" disabled={reason !== null} onClick={() => controller.repair(component, "at_sea")}>Repair {titleCase(component)} <small>{reason ?? "One committed day; restores up to 5%."}</small></button>;
        })}
        <button type="button" disabled={model.survivalStatus !== "active"} onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>{model.survivalStatus === "active" ? "Set a return intent." : "Requires a ship able to sail."}</small></button>
        {model.canDismiss && <button class="primary primary-action" type="button" onClick={() => controller.dismissSoftInterrupt()}>Return to expedition controls <small>The warning stays in the written log.</small></button>}
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
        <div><p class="eyebrow">Travel interrupted · {titleCase(model.location)}</p><h1>{model.title}</h1><p class="lede">{model.description}</p></div>
        <div class="last-result" aria-label="Last committed result">
          <span>Last committed result</span>
          {model.lastResult === null ? <p>No committed result yet.</p> : <p><strong>{model.lastResult.title}:</strong> {model.lastResult.text}</p>}
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
                  <p><strong>Requirement:</strong> {choice.knownRequirement}</p>
                  <p>{choice.knownConsequence}</p>
                  {!choice.available && <p class="disabled-reason">Unavailable: {choice.reason}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {model.canRecogniseCape && <section class="compact-decision-surface"><div><p class="eyebrow">Current decision</p><h2>Confirm the landfall</h2></div><div class="choice-grid major-choices"><button class="primary primary-action" type="button" onClick={() => controller.dispatchSimulation({ type: "recognise_cape_landfall" })}>Recognise the Cape landfall <small>Corrects the estimate and records the objective.</small></button></div></section>}
        {model.canEnterCapeVerde && <section class="compact-decision-surface"><div><p class="eyebrow">Current decision</p><h2>Use the known port</h2></div><div class="choice-grid major-choices"><button class="primary primary-action" type="button" onClick={() => controller.dispatchSimulation({ type: "enter_cape_verde_port" })}>Enter Cape Verde port <small>Opens finite stock and services.</small></button></div></section>}
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
