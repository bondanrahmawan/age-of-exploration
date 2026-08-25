import { useMemo, useState } from "preact/hooks";
import type { StoresState, StoreKind } from "../../src/index.js";
import type { GameActions } from "../controller.js";
import { FactList } from "./FactList.js";
import { STORE_KINDS } from "../../src/index.js";
import { validateOutfitting, type OutfittingViewModel, type SafeSavePreview } from "../view-model.js";

const labels: Record<StoreKind, string> = {
  water: "Water",
  provisions: "Provisions",
  repair_stores: "Repair stores",
  medicine: "Medicine",
};

function keyFor(store: StoreKind): keyof StoresState {
  return `${store === "repair_stores" ? "repairStores" : store}Kg` as keyof StoresState;
}

function SaveCard({ preview, controller }: { readonly preview: SafeSavePreview; readonly controller: GameActions }) {
  return (
    <section class={`save-card save-${preview.kind}`} aria-labelledby="local-campaign-title">
      <div>
        <p class="eyebrow">Local campaign</p>
        <h2 id="local-campaign-title">Begin or resume</h2>
        <p>{preview.message}</p>
        {preview.kind === "valid" && (
          <dl class="save-preview">
            <div><dt>Saved at</dt><dd>{preview.boundary}</dd></div>
            <div><dt>Date aboard</dt><dd>{preview.date ?? "Between expeditions"}</dd></div>
            <div><dt>Expeditions completed</dt><dd>{preview.completedRuns}</dd></div>
            <div><dt>Facts on the chart</dt><dd>{preview.reportedFactCount}</dd></div>
          </dl>
        )}
      </div>
      <div class="button-row">
        {preview.kind === "valid" && <button class="primary" type="button" onClick={() => controller.resumeCampaign()}>Resume this campaign</button>}
        <button class={preview.kind === "valid" ? "secondary" : "primary"} type="button" onClick={() => controller.beginNewCampaign()}>
          {preview.kind === "invalid" ? "Start fresh and replace the unreadable save" : preview.kind === "valid" ? "Start a new campaign and replace this save" : "Start a new campaign"}
        </button>
      </div>
    </section>
  );
}

export function OutfittingScreen({ model, preview, autosaveBoundary, controller }: {
  readonly model: OutfittingViewModel;
  readonly preview: SafeSavePreview;
  readonly autosaveBoundary: string;
  readonly controller: GameActions;
}) {
  const [allocation, setAllocation] = useState<StoresState>({ ...model.allocation });
  const validation = useMemo(() => validateOutfitting(allocation), [allocation]);
  const setTonnes = (store: StoreKind, value: string) => {
    const tonnes = Number(value);
    const kilograms = Number.isFinite(tonnes) ? Math.round(tonnes * 1_000) : -1;
    setAllocation((current) => ({ ...current, [keyFor(store)]: kilograms }));
  };
  return (
    <main id="main-content" class={`screen outfitting-screen${model.campaignReady ? "" : " outfitting-setup"}`} data-screen="outfitting">
      <header class="hero outfitting-header">
        <div>
          <p class="eyebrow">Lisbon · 1 April 1488</p>
          <h1>Outfit and depart</h1>
          <p class="lede"><strong>Mission:</strong> find the Cape region, then bring the ship — or at least a useful report — home to Lisbon.</p>
          <p class="lede briefing-note">Cape Verde lies on the way out and on the way back. Its port sells water, provisions, repair stores and medicine for the ducats you do not spend here, dearer than Lisbon charges. It is also the one place ashore where a copy of the report can be left, and a copy left there outlives the ship. Findings that reach no port come home as hearsay, at reduced confidence, if they come home at all.</p>
        </div>
        <p class="autosave-status"><span class="save-dot" aria-hidden="true" />Saved · {autosaveBoundary}</p>
      </header>

      <SaveCard preview={preview} controller={controller} />

      {model.campaignReady && (
        <div class="outfitting-grid">
          <section class="panel allocation-panel" aria-labelledby="allocation-title">
            <div class="section-heading">
              <div><p class="eyebrow">Hold plan</p><h2 id="allocation-title">Stores and range</h2></div>
            </div>
            <div class="hold-meter" role="meter" aria-label="Hold space used" aria-valuemin={0} aria-valuemax={52} aria-valuenow={Math.max(0, validation.allocatableHoldUsedKg / 1_000)}>
              <span style={{ width: `${Math.min(100, Math.max(0, validation.allocatableHoldUsedKg / 520))}%` }} />
            </div>
            <p class="hold-caption">
              {Math.max(0, validation.allocatableHoldUsedKg / 1_000).toFixed(1)} t of stores, plus 8.0 t the ship always carries — {Math.max(0, (validation.allocatableHoldUsedKg + 8_000) / 1_000).toFixed(1)} t of the 60.0 t hold
            </p>
            <div class="allocation-fields">
              {STORE_KINDS.map((store) => {
                const tuning = model.tuning.stores[store];
                const id = `allocation-${store}`;
                return (
                  <div class="field-group" key={store}>
                    <label for={id}>{labels[store]} <span>tonnes</span></label>
                    <input
                      id={id}
                      type="number"
                      min="0"
                      max={tuning.capKg / 1_000}
                      step="0.5"
                      value={allocation[keyFor(store)] / 1_000}
                      aria-describedby={`${id}-help ${id}-error`}
                      aria-invalid={validation.storeErrors[store] !== undefined}
                      onInput={(event) => setTonnes(store, event.currentTarget.value)}
                    />
                    <small id={`${id}-help`}>Up to {(tuning.capKg / 1_000).toFixed(1)} t · {tuning.lisbonPriceDucatsPer1000Kg} ducats a tonne</small>
                    <span id={`${id}-error`} class="field-error">{validation.storeErrors[store] ?? ""}</span>
                  </div>
                );
              })}
            </div>
            <div class="allocation-summary">
              <dl>
                <div><dt>Space you can fill</dt><dd>{(model.tuning.hold.allocatableKg / 1_000).toFixed(1)} t</dd></div>
                <div><dt>Space left</dt><dd>{(validation.allocatableHoldRemainingKg / 1_000).toFixed(1)} t</dd></div>
                <div><dt>Sponsor advance</dt><dd>{model.tuning.sponsorAdvanceDucats} ducats</dd></div>
                <div><dt>Cost of these stores</dt><dd>{validation.costDucats} ducats</dd></div>
                <div><dt>Ducats left to carry</dt><dd>{validation.moneyRemainingDucats} ducats</dd></div>
              </dl>
              <p class="hold-caption">Ducats you do not spend here are what buys resupply at Cape Verde.</p>
              {validation.capacityError !== null && <p class="validation-error" role="alert">{validation.capacityError}</p>}
              {validation.moneyError !== null && <p class="validation-error" role="alert">{validation.moneyError}</p>}
            </div>
            <div class="depart-band">
              <p class="range-callout"><span>Estimated range</span><strong>{validation.projectedRangeDays} days</strong><small>A guess for 25 crew before losses or spoilage. The sea will not match it exactly.</small></p>
              <div class="depart-commit">
                <button class="primary depart-button" type="button" disabled={!validation.valid} onClick={() => controller.outfitAndDepart(allocation)}>
                  Depart Lisbon
                </button>
                {!validation.valid && <p class="disabled-reason">Correct the errors above to depart.</p>}
              </div>
            </div>
          </section>

          <aside class="knowledge-column">
            <section class="panel" aria-labelledby="knowledge-title">
              <p class="eyebrow">Inherited knowledge</p>
              <h2 id="knowledge-title">What the chart claims</h2>
              <FactList facts={model.inheritedFacts} emptyText="The chart is blank. This first voyage sails on guesswork alone." />
            </section>
            <section class="panel" aria-labelledby="prior-runs-title">
              <p class="eyebrow">Reports filed</p>
              <h2 id="prior-runs-title">Prior expeditions</h2>
              {model.priorRuns.length === 0 ? <p class="empty-state">No expedition has come home yet.</p> : (
                <ol class="run-list">
                  {model.priorRuns.map((run) => (
                    <li key={run.runNumber}>
                      <strong>Expedition {run.runNumber}: {run.outcome}</strong>
                      <span>{run.finalDate} · {run.elapsedDays} days</span>
                      <p>{run.reason}</p>
                      <small>{run.reportedFactCount} facts reached the chart{run.salvagedFactCount > 0 ? ` · ${run.salvagedFactCount} salvaged from the log at reduced confidence` : ""}</small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
