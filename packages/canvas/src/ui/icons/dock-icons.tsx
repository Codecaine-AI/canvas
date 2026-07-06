"use client";

/**
 * Inline SVG glyphs for the FigJam bottom-dock buttons.
 *
 * The seven dock icons use the user's licensed Nucleo SVG set as provenance
 * where available, normalized to one 18px grid and currentColor strokes.
 */

export type DockIconProps = {
  className?: string;
};

const iconStrokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Nucleo select.svg (maps-location/pointer — clean tailless triangular cursor). */
export function ArrowIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.474,2.784L14.897,6.958c.481,.176,.467,.861-.021,1.018l-5.228,1.673-1.673,5.228c-.156,.488-.842,.502-1.018,.021L2.784,3.474c-.157-.43,.26-.847,.69-.69Z"
        {...iconStrokeProps}
      />
    </svg>
  );
}

/** Open palm hand tool, drawn on the shared 18px dock grid. */
export function HandIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <path d="M5.6 11.1V4.8a1.25 1.25 0 0 1 2.5 0v3.8" {...iconStrokeProps} />
      <path d="M8.1 8.6v-5a1.35 1.35 0 0 1 2.7 0v5.1" {...iconStrokeProps} />
      <path d="M10.8 8.8V4.2a1.25 1.25 0 0 1 2.5 0v5" {...iconStrokeProps} />
      <path
        d="M13.3 9.3v-4a1.2 1.2 0 0 1 2.4 0v5.9c0 3.1-1.95 4.9-4.85 4.9H7.7c-1.25 0-2.4-.62-3.1-1.66L2.2 10.9c-.42-.62-.27-1.43 .33-1.84 .56-.39 1.33-.28 1.78 .28L5.6 11.1"
        {...iconStrokeProps}
      />
    </svg>
  );
}

/** Nucleo shapes.svg. */
export function ShapeSquareIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <rect x="2.75" y="2.75" width="12.5" height="12.5" rx="2" ry="2" {...iconStrokeProps} />
    </svg>
  );
}

/** Nucleo connector-arrow-turn.svg. */
export function ConnectorIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <path d="M15.25,8.25H4.75c-1.105,0-2,.895-2,2v4" {...iconStrokeProps} />
      <polyline points="11 12.5 15.25 8.25 11 4" {...iconStrokeProps} />
    </svg>
  );
}

/** Nucleo text.svg. */
export function TextIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <line x1="6.75" y1="15.25" x2="11.25" y2="15.25" {...iconStrokeProps} />
      <line x1="9" y1="2.75" x2="9" y2="15.25" {...iconStrokeProps} />
      <polyline points="14.75 4.25 14 2.75 4 2.75 3.25 4.25" {...iconStrokeProps} />
    </svg>
  );
}

/** Nucleo section.svg. */
export function SectionIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <rect x="5.75" y="1.75" width="6.5" height="14.5" rx="2" ry="2" transform="translate(0 18) rotate(-90)" {...iconStrokeProps} />
      <line x1="3.75" y1="15.75" x2="14.25" y2="15.75" {...iconStrokeProps} />
      <line x1="3.75" y1="2.25" x2="14.25" y2="2.25" {...iconStrokeProps} />
    </svg>
  );
}

/** Sticky note redrawn on the 18px Nucleo grid with a bottom-right fold. */
export function StickyIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} fill="none" aria-hidden="true">
      <path d="M3.25 2.75h11.5v8.75l-3.25 3.75H3.25Z" {...iconStrokeProps} />
      <path d="M11.5 15.25V11.5h3.25" {...iconStrokeProps} />
    </svg>
  );
}

/** Zoom pill glyphs (bottom-right, ZoomControls.tsx). */
export function ZoomMinusIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function ZoomPlusIcon({ className }: DockIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
