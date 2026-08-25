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
          <div><dt>Departed</dt><dd>{report.departureDate}</dd></div>
          <div><dt>Ended</dt><dd>{report.finalDate}</dd></div>
          <div><dt>Days at sea</dt><dd>{report.elapsedDays}</dd></div>
          <div><dt>Objective</dt><dd>{report.objectiveStatus}</dd></div>
          <div><dt>Campaign save</dt><dd><span class="save-dot" aria-hidden="true" />Saved · {autosaveBoundary}</dd></div>
        </dl>
      </header>

      <AfterActionChart estimated={report.estimatedTrack} actual={report.trueTrack} />

      <section class="panel report-section" aria-labelledby="route-explanation-title">
        <p class="eyebrow">What the crew could not see</p>
        <h2 id="route-explanation-title">Why the two tracks differ</h2>
        {report.currentExplanations.length === 0
          ? <p>No hidden current pushed the ship off its estimate on this voyage.</p>
          : report.currentExplanationSummary !== null
            ? <p>{report.currentExplanationSummary}</p>
            : <ul>{report.currentExplanations.map((line) => <li key={line.text}>{line.text}</li>)}</ul>}
      </section>

      <section class="panel report-section" aria-labelledby="observation-title">
        <p class="eyebrow">What the crew went looking for</p>
        <h2 id="observation-title">Days spent observing</h2>
        {report.observations.length === 0
          ? <p>No day of this voyage was spent on a deliberate east-west observation, so nothing but a landmark could ever narrow the band.</p>
          : <ul>{report.observations.map((line) => <li key={line.day}>{line.text}</li>)}</ul>}
      </section>

      <section class="panel report-section" aria-labelledby="condition-title">
        <p class="eyebrow">Before and after</p>
        <h2 id="condition-title">Crew, ship, and stores</h2>
        <div class="report-table-wrap">
          <table><thead><tr><th scope="col">Measure</th><th scope="col">Starting</th><th scope="col">Final</th></tr></thead><tbody>
            {report.metrics.map((metric) => <tr key={metric.label}><th scope="row">{metric.label}</th><td>{metric.starting}</td><td>{metric.final}</td></tr>)}
          </tbody></table>
        </div>
        <p>Over the whole voyage the crew drank {(report.waterConsumedKg / 1_000).toFixed(2)} t of water and ate {(report.provisionsConsumedKg / 1_000).toFixed(2)} t of provisions.</p>
      </section>

      <section class="report-facts" aria-labelledby="facts-title">
        <div class="section-heading"><div><p class="eyebrow">The written record</p><h2 id="facts-title">What the chart gained and lost</h2></div>{report.reportSnapshotDay !== null && <p>Report copy left at Cape Verde on day {report.reportSnapshotDay}</p>}</div>
        <FactSection title="Seen at sea" facts={report.factsObserved} emptyText="The crew saw nothing new." />
        <FactSection title="Reached the chart" facts={report.factsReported} emptyText="Nothing new reached the campaign chart." />
        <FactSection title="Proved wrong" facts={report.factsDisproved} emptyText="No rumour was proved wrong." />
        <FactSection title="Lost outright" facts={report.factsLost} emptyText="Nothing the crew saw was lost outright." />
        <section class="report-fact-section">
          <h3>Salvaged from the log</h3>
          <p>Word of these reached Lisbon without the ship, so each stands at reduced confidence — enough to steer for, never enough to correct the reckoning by itself.</p>
          <FactList facts={report.factsSalvaged} emptyText="Nothing needed salvaging." />
        </section>
      </section>

      <section class="next-expedition-card" aria-labelledby="next-run-title">
        <div><p class="eyebrow">Campaign progression</p><h2 id="next-run-title">What the next expedition inherits</h2><FactList facts={report.inheritedDifferences} emptyText="The chart is unchanged. The next voyage starts knowing exactly what this one did." /></div>
        <button class="primary" type="button" onClick={() => controller.prepareNextExpedition()}>Prepare the next expedition</button>
      </section>
    </main>
  );
}
