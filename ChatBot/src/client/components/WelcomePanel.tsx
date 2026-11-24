import { SUGGESTIONS } from "../lib/suggestions";

interface WelcomePanelProps {
  onSelect: (query: string) => void;
}

export function WelcomePanel({ onSelect }: WelcomePanelProps) {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <p className="welcome__eyebrow">Bidholi · Foothills of Mussoorie</p>
      <h1 id="welcome-title" className="welcome__title">
        Welcome to <em>Musafir Café.</em>
      </h1>
      <p className="welcome__text">
        Find your next favourite coffee, explore our menu, or ask for a recommendation.
      </p>
      <div className="suggestions" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.id}
            type="button"
            className="suggestion"
            onClick={() => onSelect(suggestion.query)}
          >
            <span className="suggestion__num">{String(index + 1).padStart(2, "0")}</span>
            <span className="suggestion__label">{suggestion.label}</span>
            <span className="suggestion__arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
