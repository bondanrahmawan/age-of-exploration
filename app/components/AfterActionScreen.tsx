import type { GameActions } from "../controller.js";
import type { ReportViewModel } from "../view-model.js";
import { AfterActionChart } from "./ActiveChart.js";
import { FactList } from "./FactList.js";

function FactSection({ title, facts, emptyText }: {
  readonly title: string;
  readonly facts: ReportViewModel["factsObserved"];
  readonly emptyText: string;
}) {
  return <section class="report-fact-section"><h3>{title}</h3><FactList facts={facts} emptyText={emptyText} /></section>;
}

export function AfterActionScreen({ report, autosaveBoundary, controller }: { readonly report: ReportViewModel; readonly autosaveBoundary: string; readonly controller: GameActions }) {
  return (
    <main id="main-content" class="screen after-action-screen" data-screen="after_action">
      <header class="report-hero">
        <div>
          <p class="eyebrow">Finalized expedition {report.runNumber}</p>
          <h1>{report.outcome}</h1>
          <p class="lede">{report.reason}</p>
        </div>
        <dl class="report-dates">
          <div><dt>Departure</dt><dd>{report.departureDate}</dd></div>
          <div><dt>Final date</dt><dd>{report.finalDate}</dd></div>
          <div><dt>Elapsed</dt><dd>{report.elapsedDays} committed days</dd></div>
          <div><dt>Objective</dt><dd>{report.objectiveStatus}</dd></div>
          <div><dt>Campaign save</dt><dd><span class="save-dot" aria-hidden="true" />Saved · {autosaveBoundary}</dd></div>
        </dl>
      </header>

      <AfterActionChart estimated={report.estimatedTrack} actual={report.trueTrack} />

      <section class="panel report-section" aria-labelledby="route-explanation-title">
        <p class="eyebrow">Evidence boundary</p>
        <h2 id="route-explanation-title">Route divergence</h2>
        {report.currentExplanations.length === 0 ? <p>No hidden-current contribution occurred on the finalized route.</p> : (
          <ul>{report.currentExplanations.map((text) => <li key={text}>{text}</li>)}</ul>
        )}
      </section>

      <section class="panel report-section" aria-labelledby="condition-title">
        <p class="eyebrow">Before and after</p>
        <h2 id="condition-title">Crew, ship, and stores</h2>
        <div class="report-table-wrap">
          <table><thead><tr><th scope="col">Measure</th><th scope="col">Starting</th><th scope="col">Final</th></tr></thead><tbody>
            {report.metrics.map((metric) => <tr key={metric.label}><th scope="row">{metric.label}</th><td>{metric.starting}</td><td>{metric.final}</td></tr>)}
          </tbody></table>
        </div>
        <p>Consumed: {(report.waterConsumedKg / 1_000).toFixed(3)} t water and {(report.provisionsConsumedKg / 1_000).toFixed(3)} t provisions.</p>
      </section>

      <section class="report-facts" aria-labelledby="facts-title">
        <div class="section-heading"><div><p class="eyebrow">The written record</p><h2 id="facts-title">Knowledge disposition</h2></div>{report.reportSnapshotDay !== null && <p>Last Cape Verde deposit: day {report.reportSnapshotDay}</p>}</div>
        <FactSection title="Observed" facts={report.factsObserved} emptyText="No new fact was observed." />
        <FactSection title="Reported" facts={report.factsReported} emptyText="No new fact reached the campaign record." />
        <FactSection title="Disproved" facts={report.factsDisproved} emptyText="No rumour was disproved." />
        <FactSection title="Lost with the ship" facts={report.factsLost} emptyText="No observed evidence was lost." />
      </section>

      <section class="next-expedition-card" aria-labelledby="next-run-title">
        <div><p class="eyebrow">Campaign progression</p><h2 id="next-run-title">What the next expedition inherits</h2><FactList facts={report.inheritedDifferences} emptyText="The reported chart is unchanged." /></div>
        <button class="primary" type="button" onClick={() => controller.prepareNextExpedition()}>Prepare the next expedition</button>
      </section>
    </main>
  );
}
