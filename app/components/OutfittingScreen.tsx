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
            <div><dt>Boundary</dt><dd>{preview.boundary}</dd></div>
            <div><dt>Date</dt><dd>{preview.date ?? "Between runs"}</dd></div>
            <div><dt>Completed runs</dt><dd>{preview.completedRuns}</dd></div>
            <div><dt>Reported facts</dt><dd>{preview.reportedFactCount}</dd></div>
          </dl>
        )}
      </div>
      <div class="button-row">
        {preview.kind === "valid" && <button class="primary" type="button" onClick={() => controller.resumeCampaign()}>Resume saved campaign</button>}
        <button class={preview.kind === "valid" ? "secondary" : "primary"} type="button" onClick={() => controller.beginNewCampaign()}>
          {preview.kind === "invalid" ? "Start fresh and overwrite invalid save" : preview.kind === "valid" ? "Begin new campaign and replace save" : "Begin new local campaign"}
        </button>
      </div>
    </section>
  );
}

export function OutfittingScreen({ model, preview, controller }: {
  readonly model: OutfittingViewModel;
  readonly preview: SafeSavePreview;
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
    <main id="main-content" class="screen outfitting-screen" data-screen="outfitting">
      <header class="hero">
        <div>
          <p class="eyebrow">Lisbon · 1 April 1488</p>
          <h1>Outfit the uncertain voyage</h1>
          <p class="lede">A 60-ton caravel, one objective, and a chart made from what earlier crews managed to report.</p>
        </div>
        <div class="ship-seal" aria-hidden="true">AoE</div>
      </header>

      <SaveCard preview={preview} controller={controller} />

      {model.campaignReady && (
        <div class="outfitting-grid">
          <section class="panel allocation-panel" aria-labelledby="allocation-title">
            <div class="section-heading">
              <div><p class="eyebrow">Hold plan</p><h2 id="allocation-title">Stores and range</h2></div>
              <p class="range-callout"><span>Projected-range estimate</span><strong>{validation.projectedRangeDays} days</strong><small>At 25 crew, before losses or spoilage</small></p>
            </div>
            <div class="hold-meter" role="meter" aria-label="Allocatable hold used" aria-valuemin={0} aria-valuemax={52} aria-valuenow={Math.max(0, validation.allocatableHoldUsedKg / 1_000)}>
              <span style={{ width: `${Math.min(100, Math.max(0, validation.allocatableHoldUsedKg / 520))}%` }} />
            </div>
            <p class="hold-caption">
              {Math.max(0, validation.allocatableHoldUsedKg / 1_000).toFixed(1)} t allocated + 8.0 t fixed mission allocation = {Math.max(0, (validation.allocatableHoldUsedKg + 8_000) / 1_000).toFixed(1)} t of 60.0 t
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
                    <small id={`${id}-help`}>Cap {(tuning.capKg / 1_000).toFixed(1)} t · {tuning.lisbonPriceDucatsPer1000Kg} ducats/t</small>
                    <span id={`${id}-error`} class="field-error">{validation.storeErrors[store] ?? ""}</span>
                  </div>
                );
              })}
            </div>
            <div class="allocation-summary">
              <dl>
                <div><dt>Allocatable capacity</dt><dd>{(model.tuning.hold.allocatableKg / 1_000).toFixed(1)} t</dd></div>
                <div><dt>Remaining capacity</dt><dd>{(validation.allocatableHoldRemainingKg / 1_000).toFixed(1)} t</dd></div>
                <div><dt>Sponsor advance</dt><dd>{model.tuning.sponsorAdvanceDucats} ducats</dd></div>
                <div><dt>Allocation cost</dt><dd>{validation.costDucats} ducats</dd></div>
                <div><dt>Money carried</dt><dd>{validation.moneyRemainingDucats} ducats</dd></div>
              </dl>
              {validation.capacityError !== null && <p class="validation-error" role="alert">Capacity: {validation.capacityError}</p>}
              {validation.moneyError !== null && <p class="validation-error" role="alert">Money: {validation.moneyError}</p>}
            </div>
            <button class="primary depart-button" type="button" disabled={!validation.valid} onClick={() => controller.outfitAndDepart(allocation)}>
              Depart Lisbon
            </button>
            {!validation.valid && <p class="disabled-reason">Departure remains disabled until every capacity, money, and stock error is corrected.</p>}
          </section>

          <aside class="knowledge-column">
            <section class="panel" aria-labelledby="knowledge-title">
              <p class="eyebrow">Inherited campaign knowledge</p>
              <h2 id="knowledge-title">What the chart claims</h2>
              <FactList facts={model.inheritedFacts} />
            </section>
            <section class="panel" aria-labelledby="prior-runs-title">
              <p class="eyebrow">Finalized reports</p>
              <h2 id="prior-runs-title">Prior expeditions</h2>
              {model.priorRuns.length === 0 ? <p class="empty-state">No expedition has yet returned a finalized account.</p> : (
                <ol class="run-list">
                  {model.priorRuns.map((run) => (
                    <li key={run.runNumber}>
                      <strong>Expedition {run.runNumber}: {run.outcome}</strong>
                      <span>{run.finalDate} · {run.elapsedDays} days</span>
                      <p>{run.reason}</p>
                      <small>{run.reportedFactCount} facts reported · {run.lostFactCount} lost</small>
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
