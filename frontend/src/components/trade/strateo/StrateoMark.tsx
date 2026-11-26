/** Strateo ka apna nishaan — ek raasta jo nodes se guzar kar upar jaata hai. */
export default function StrateoMark({ size = 26 }: { size?: number }) {
  const glyph = Math.round(size * 0.64);
  return (
    <span className="st-mark" style={{ width: size, height: size }} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        width={glyph}
        height={glyph}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 17 8.5 11.5 12.5 14.5 19.5 6.5" />
        <circle cx="8.5" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19.5" cy="6.5" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
