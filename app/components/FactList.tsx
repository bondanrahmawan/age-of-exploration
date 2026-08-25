import type { FactViewModel } from "../view-model.js";

const CONFIDENCE_WORDS: Record<string, string> = {
  rumoured: "Rumoured",
  observed: "Observed",
  confirmed: "Confirmed",
  disproved: "Disproved",
};

export function FactList({ facts, emptyText = "Nothing is recorded here yet." }: {
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
              {CONFIDENCE_WORDS[fact.status] ?? fact.status} · {fact.confidence}% sure
            </span>
          </div>
          <p>{fact.claim}</p>
          <small>Source: {fact.source}</small>
        </li>
      ))}
    </ul>
  );
}
