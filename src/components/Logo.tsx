/**
 * KS Precision Cleaning logo, redrawn as SVG from the brand artwork.
 * Uses currentColor, so it is black on light surfaces and white in dark mode.
 *  - "full": KS between rules, PRECISION CLEANING LLC, RESIDENTIAL | COMMERCIAL
 *  - "mark": KS between rules + PRECISION CLEANING (for narrow places like the sidebar)
 */
export function Logo({ variant = "full", className = "", title = "KS Precision Cleaning LLC" }: { variant?: "full" | "mark"; className?: string; title?: string }) {
  if (variant === "mark") {
    return (
      <svg viewBox="0 0 640 250" className={className} role="img" aria-label={title} fill="currentColor">
        <title>{title}</title>
        <rect x="8" y="98" width="140" height="5" />
        <rect x="492" y="98" width="140" height="5" />
        <text x="320" y="170" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight={900} fontSize="190" textLength="300" lengthAdjust="spacingAndGlyphs">KS</text>
        <text x="320" y="238" textAnchor="middle" fontFamily="Montserrat, Arial, sans-serif" fontWeight={800} fontSize="58" textLength="620" lengthAdjust="spacingAndGlyphs">PRECISION CLEANING</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 1940 400" className={className} role="img" aria-label={title} fill="currentColor">
      <title>{title}</title>
      <rect x="265" y="156" width="415" height="7" />
      <rect x="1210" y="156" width="470" height="7" />
      <text x="948" y="228" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight={900} fontSize="265" textLength="500" lengthAdjust="spacingAndGlyphs">KS</text>
      <text x="262" y="322" fontFamily="Montserrat, Arial, sans-serif" fontWeight={800} fontSize="110" textLength="1285" lengthAdjust="spacingAndGlyphs">PRECISION CLEANING</text>
      <text x="1562" y="320" fontFamily="Montserrat, Arial, sans-serif" fontWeight={600} fontSize="56" textLength="122" lengthAdjust="spacingAndGlyphs">LLC</text>
      <text x="958" y="378" textAnchor="middle" fontFamily="Montserrat, Arial, sans-serif" fontWeight={400} fontSize="40" textLength="1020" lengthAdjust="spacing">RESIDENTIAL   |   COMMERCIAL</text>
    </svg>
  );
}
