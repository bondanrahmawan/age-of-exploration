import type { FactViewModel } from "../view-model.js";

export function FactList({ facts, emptyText = "No new facts are recorded." }: {
  readonly facts: readonly FactViewModel[];
  readonly emptyText?: string;
}) {
  if (facts.length === 0) return <p class="empty-state">{emptyText}</p>;
  return (
    <ul class="fact-list">
      {facts.map((fact) => (
        <li key={`${fact.id}-${fact.status}`}>
          <div class="fact-heading">
            <strong>{fact.label}</strong>
            <span class={`confidence confidence-${fact.status}`}>
              {fact.status} · confidence {fact.confidence}%
            </span>
          </div>
          <p>{fact.claim}</p>
          <small>Source: {fact.source}</small>
        </li>
      ))}
    </ul>
  );
}
