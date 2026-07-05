"use client";

/**
 * Inline SVG glyphs for the 13 FigJam bottom-dock buttons.
 *
 * Approximated from board-design-reference/analysis/figjam-frames/fj-005.png
 * (resting state) and the bottom-dock spec's button inventory. These are
 * hand-drawn line-art reproductions, not traced vector extractions — see the
 * per-icon notes below for what's matched vs. approximated.
 *
 * All icons share a 20x20 viewBox and inherit color via `currentColor` so the
 * dock can recolor them per state (charcoal rest / violet active) without
 * per-icon props.
 */

export type DockIconProps = {
  className?: string;
};

const STROKE = 1.6;

/** 1. Selection arrow — matched: classic cursor-arrow silhouette. */
export function ArrowIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M5 3.2 L15.5 10.4 L10.6 11.4 L13.2 16.4 L11.3 17.3 L8.7 12.3 L5.4 15.6 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 2. Hand / pan tool — approximated: open palm with 4 fingers + thumb. */
export function HandIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M6.5 10.5V4.8a1.1 1.1 0 0 1 2.2 0v4.3M8.7 9.1V3.6a1.1 1.1 0 0 1 2.2 0v5.5M10.9 9.3V4.6a1.1 1.1 0 0 1 2.2 0v6.6M13.1 11.1V7a1 1 0 0 1 2 0v5.3c0 3.1-1.9 5.7-5.3 5.7-2.6 0-3.7-.9-5-2.5l-2.4-3a1.1 1.1 0 0 1 1.7-1.4l1.8 1.8"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 3. Pen/marker — matched: conical black tip + slim barrel, per spec. */
export function PenIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M13.2 2.6 17.4 6.8 8.1 16.1 3.4 17.1 4.4 12.4 Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M4.4 12.4 7.6 15.6" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M11.4 4.4 15.6 8.6" stroke="currentColor" strokeWidth={STROKE} />
    </svg>
  );
}

/**
 * 4. Highlighter — matched: static light-blue blob baked into the artwork
 * (per spec, this is NOT a state, it's part of the icon at rest).
 */
export function HighlighterIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M12.5 3 16.6 7.1 9.8 13.9 5.7 9.8Z"
        fill="#BFD9FA"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M5.7 9.8 3.4 16.3 9.8 13.9Z" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round" />
    </svg>
  );
}

/** 5. Shape tool (square outline) — matched: opens the Shapes panel. */
export function ShapeSquareIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth={STROKE} />
    </svg>
  );
}

/** 6. Connector — matched: curved arrow per spec's "curved connector arrow". */
export function ConnectorIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4.5 5.5c0 5 3.5 8 9 8"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M10.3 10.6 13.6 13.6 10.3 16.5" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** 7. Text "T" — matched. */
export function TextIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M4.5 5.2h11M10 5.2v10.4" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

/** 8. Sticky note — matched: folded top-right corner glyph. */
export function StickyIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 4h9l3 3v9H4Z"
        fill="#BFD9FA"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M13 4v3h3" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** 9. Table/grid — matched. */
export function TableIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="13" height="13" rx="1" stroke="currentColor" strokeWidth={STROKE} />
      <path d="M3.5 8.5h13M3.5 13h13M8.5 3.5v13M13 3.5v13" stroke="currentColor" strokeWidth={STROKE} />
    </svg>
  );
}

/**
 * 10. Stamp — approximated: catalog describes this as "visually a
 * person/stamp glyph"; we render a simple stamp/badge shape since function
 * was never exercised in the recording (flagged unconfirmed by the catalog).
 */
export function StampIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M10 3.2a2.6 2.6 0 0 1 2.6 2.6c0 1-.6 1.7-1.2 2.3-.5.5-.8.9-.8 1.6h-1.2c0-.7-.3-1.1-.8-1.6-.6-.6-1.2-1.3-1.2-2.3A2.6 2.6 0 0 1 10 3.2Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <rect x="5.5" y="11.2" width="9" height="3.2" rx="0.6" stroke="currentColor" strokeWidth={STROKE} />
      <path d="M4 16.8h12" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

/** 11. Comment bubble — matched. */
export function CommentIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 5.5h12a1 1 0 0 1 1 1v6.3a1 1 0 0 1-1 1H9.6L6.4 17V13.8H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 12. Widgets — matched: two diamonds + circle + small "+", per spec. */
export function WidgetsIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M5.6 3.4 8 5.8 5.6 8.2 3.2 5.8Z" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round" />
      <path d="M14.4 3.4 16.8 5.8 14.4 8.2 12 5.8Z" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round" />
      <circle cx="5.6" cy="14.2" r="2.4" stroke="currentColor" strokeWidth={STROKE} />
      <path d="M14.4 12v4.4M12.2 14.2h4.4" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

/** 13. "+" overflow — matched: persistent gray circular background per spec. */
export function PlusIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

/** Zoom pill glyphs (bottom-right, ZoomControls.tsx). */
export function ZoomMinusIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function ZoomPlusIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}
