export interface SessionBriefingProps {
  readonly milestone: string;
  readonly missionStatus: string;
  readonly date: string;
  readonly elapsedDays: number;
  readonly autosaveBoundary: string;
  readonly warnings: readonly string[];
}

export function SessionBriefing({ milestone, missionStatus, date, elapsedDays, autosaveBoundary, warnings }: SessionBriefingProps) {
  return (
    <section class="session-briefing" aria-label="Mission and current milestone">
      <div class="mission-summary">
        <span>Mission</span>
        <p><strong>Recognise the Cape region.</strong> Return the ship or a useful report to Lisbon; improve the chart when worthwhile.</p>
      </div>
      <div class="milestone-summary">
        <span>Current milestone</span>
        <strong>{milestone}</strong>
        <small>{missionStatus}</small>
      </div>
      <div class="session-meta">
        <span>{date} · day {elapsedDays}</span>
        <span class="autosave-status"><i class="save-dot" aria-hidden="true" />Saved · {autosaveBoundary}</span>
      </div>
      {warnings.length > 0 && (
        <div class="session-warnings" role="status" aria-label="Active warnings">
          {warnings.map((warning) => <p key={warning}>Warning: {warning}</p>)}
        </div>
      )}
    </section>
  );
}
