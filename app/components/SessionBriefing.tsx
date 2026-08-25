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
        <p><strong>Recognise the Cape region.</strong> Bring home the ship, or at least a useful report. Whatever the crew confirms stays on the chart.</p>
      </div>
      <div class="milestone-summary">
        <span>Next step</span>
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
