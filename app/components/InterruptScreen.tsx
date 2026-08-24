import { useState } from "preact/hooks";
import { SHIP_COMPONENTS, STORE_KINDS, SURVIVAL_TUNING, capeVerdePurchaseCost, type StoreKind } from "../../src/index.js";
import type { GameActions } from "../controller.js";
import { shipComponentCondition, type InterruptViewModel, type ShipComponent } from "../view-model.js";

const labels: Record<StoreKind, string> = { water: "Water", provisions: "Provisions", repair_stores: "Repair stores", medicine: "Medicine" };
const tonnes = (kg: number) => `${(kg / 1_000).toFixed(2)} t`;
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

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
    <div class="interrupt-actions">
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
        <h2 id="port-services-title">Port services and decisions</h2>
        <div class="choice-grid">
          <button type="button" disabled={model.moneyDucats < 5} onClick={() => controller.dispatchSimulation({ type: "rest_at_cape_verde" })}>Rest ashore one day <small>5 ducats; stores consumed; +2% health, +4% morale</small></button>
          {SHIP_COMPONENTS.map((component) => {
            const condition = shipComponentCondition(model.ship, component);
            const reason = condition >= 10_000 ? "Already at full condition." : model.stores.repairStoresKg < 500 ? "Requires 0.5 t repair stores." : null;
            return <button key={component} type="button" disabled={reason !== null} title={reason ?? undefined} onClick={() => controller.repair(component, "cape_verde")}>Repair {component} one day <small>{reason ?? "0.5 t repair stores; restores up to 15%."}</small></button>;
          })}
          <button type="button" onClick={() => controller.dispatchSimulation({ type: "careen_day_at_cape_verde" })}>Careen one day <small>{model.careeningDaysCompleted}/6 days complete; stores consumed</small></button>
          <button type="button" disabled={model.rumourPurchased || model.moneyDucats < 10} onClick={() => controller.dispatchSimulation({ type: "purchase_cape_verde_rumour" })}>Buy a seeded rumour <small>{model.rumourPurchased ? "The one rumour for this expedition was already bought." : model.moneyDucats < 10 ? "Requires 10 ducats." : "10 ducats; confidence 25%."}</small></button>
          <button type="button" onClick={() => controller.depositReport()}>Deposit report snapshot <small>{model.reportDeposited ? "Replace the earlier snapshot with the current carried facts." : "Preserves eligible facts at this boundary."}</small></button>
          <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>Changes expedition intent; depart separately.</small></button>
          <button type="button" disabled={model.careeningDaysCompleted !== 0 || model.survivalStatus !== "active"} onClick={() => controller.dispatchSimulation({ type: "leave_cape_verde_port" })}>Depart Cape Verde <small>{model.careeningDaysCompleted !== 0 ? "Finish the six-day careening cycle first." : model.survivalStatus !== "active" ? "The ship cannot currently make way." : "Continue south or follow the return intent."}</small></button>
        </div>
      </section>
    </div>
  );
}

function CapeActions({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  const surveyReason = model.capeSurveyed ? "The Cape was already surveyed on this expedition." : null;
  const waterReason = !model.capeWaterKnown ? "Requires an observed or confirmed Cape water-source fact." : model.holdRemainingKg <= 0 ? "The hold has no remaining capacity." : null;
  return (
    <div class="choice-grid major-choices">
      <button type="button" disabled={surveyReason !== null} onClick={() => controller.dispatchSimulation({ type: "survey_cape_day" })}>Survey one full day <small>{surveyReason ?? `${model.capeSurveyDaysCompleted}/2 days complete; normal stores consumed.`}</small></button>
      <button type="button" disabled={waterReason !== null} onClick={() => controller.dispatchSimulation({ type: "collect_cape_water" })}>Collect legal Cape water <small>{waterReason ?? `One full day; collect up to 12.0 t with ${tonnes(model.holdRemainingKg)} hold free.`}</small></button>
      <button type="button" onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>Set return intent before leaving.</small></button>
      <button type="button" onClick={() => controller.dispatchSimulation({ type: "leave_cape" })}>Leave the Cape <small>Begin the next sailing leg.</small></button>
    </div>
  );
}

function SurvivalActions({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  return (
    <div class="choice-grid major-choices">
      {SHIP_COMPONENTS.map((component: ShipComponent) => {
        const condition = shipComponentCondition(model.ship, component);
        const reason = condition >= 10_000 ? "Already at full condition." : model.stores.repairStoresKg < 250 ? "Requires 0.25 t repair stores." : null;
        return <button key={component} type="button" disabled={reason !== null} onClick={() => controller.repair(component, "at_sea")}>Repair {titleCase(component)} <small>{reason ?? "One committed day; restores up to 5%."}</small></button>;
      })}
      <button type="button" disabled={model.survivalStatus !== "active"} onClick={() => controller.dispatchSimulation({ type: "set_expedition_intent", intent: "return_to_lisbon" })}>Turn home <small>{model.survivalStatus === "active" ? "Set a return intent." : "Requires a ship able to sail."}</small></button>
      {model.canDismiss && <button type="button" onClick={() => controller.dismissSoftInterrupt()}>Return to expedition controls <small>The warning stays in the written log.</small></button>}
    </div>
  );
}

export function InterruptScreen({ model, controller }: { readonly model: InterruptViewModel; readonly controller: GameActions }) {
  return (
    <main id="main-content" class={`screen interrupt-screen interrupt-${model.kind}`} data-screen="interrupt">
      <header class="interrupt-header">
        <p class="eyebrow">Travel interrupted · {titleCase(model.location)}</p>
        <h1>{model.title}</h1>
        <p class="lede">{model.description}</p>
      </header>
      <aside class="interrupt-status" aria-label="Decision resources">
        <span>Water <strong>{tonnes(model.stores.waterKg)}</strong></span><span>Provisions <strong>{tonnes(model.stores.provisionsKg)}</strong></span><span>Repair <strong>{tonnes(model.stores.repairStoresKg)}</strong></span><span>Medicine <strong>{tonnes(model.stores.medicineKg)}</strong></span><span>Money <strong>{model.moneyDucats} d</strong></span>
      </aside>
      {model.warnings.length > 0 && <div class="warning-stack" role="status">{model.warnings.map((warning) => <p key={warning}>Visible warning: {warning}</p>)}</div>}

      {model.kind === "event" && (
        <section class="event-choice-list" aria-labelledby="event-decisions-title">
          <h2 id="event-decisions-title">Choose a response</h2>
          {model.choices.map((choice) => (
            <article key={choice.id} class={choice.available ? "choice-available" : "choice-unavailable"}>
              <button type="button" disabled={!choice.available} onClick={() => model.eventId !== null && controller.chooseEvent(model.eventId, choice.id)}>{choice.label}</button>
              <p><strong>Requirement:</strong> {choice.knownRequirement}</p>
              <p>{choice.knownConsequence}</p>
              {!choice.available && <p class="disabled-reason">Unavailable: {choice.reason}</p>}
            </article>
          ))}
        </section>
      )}

      {model.canRecogniseCape && <div class="choice-grid major-choices"><button class="primary" type="button" onClick={() => controller.dispatchSimulation({ type: "recognise_cape_landfall" })}>Recognise the Cape landfall <small>Corrects the estimate and records the objective.</small></button></div>}
      {model.canEnterCapeVerde && <div class="choice-grid major-choices"><button class="primary" type="button" onClick={() => controller.dispatchSimulation({ type: "enter_cape_verde_port" })}>Enter Cape Verde port <small>Opens finite stock and services.</small></button></div>}
      {model.kind === "cape_verde" && <CapeVerdeActions model={model} controller={controller} />}
      {model.kind === "cape" && <CapeActions model={model} controller={controller} />}
      {(model.kind === "survival" || model.kind === "landfall") && !model.canRecogniseCape && !model.canEnterCapeVerde && <SurvivalActions model={model} controller={controller} />}
      {model.kind === "terminal" && (
        <section class="terminal-card"><h2>Finalize the expedition</h2><p>{model.outcomeReason}</p><button class="primary" type="button" onClick={() => controller.finalizeExpedition()}>Finalize and read the report</button></section>
      )}
    </main>
  );
}
