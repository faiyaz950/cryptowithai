"use client";

interface Props {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export default function FollowUpSuggestions({ suggestions, onSelect }: Props) {
  if (!suggestions.length) return null;

  return (
    <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
      <p className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>
        Suggested follow-ups
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((text, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(text)}
            className="card-elevated text-left text-xs px-3.5 py-2.5 rounded-xl transition-all duration-150"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-secondary)",
              maxWidth: "100%",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--accent-soft)";
              e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.25)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
