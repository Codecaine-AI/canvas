"use client";

import type { CSSProperties } from "react";

/**
 * Inline SVG glyphs for selection-toolbar controls (shape/section/connector/
 * text variants). Approximated from figjam-chrome-catalog.md section 2 and
 * fj-007/fj-012/fj-030/fj-053 frame reads. White glyphs (currentColor) on the
 * dark #1D1D1D pill.
 */

export type ToolbarIconProps = { className?: string; style?: CSSProperties };
const S = 1.5;

export function ShapeSwapIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={S} />
      <path d="M6 11.5h6M9.5 8.5 12.5 11.5 9.5 14.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ColorSwatchIcon({ color = "#F24822", className, style }: ToolbarIconProps & { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill={color} />
    </svg>
  );
}

export function AlignIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2.5 4h11M4.5 8h7M2.5 12h11" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function FontStyleIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <text x="1" y="12" fontSize="11" fontWeight="600" fill="currentColor">
        Aa
      </text>
    </svg>
  );
}

export function BoldIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <text x="4" y="12" fontSize="12" fontWeight="800" fill="currentColor">
        B
      </text>
    </svg>
  );
}

export function StrikethroughIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <text x="3" y="12" fontSize="11" fill="currentColor">
        S
      </text>
      <path d="M2.5 8h11" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function LinkIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M6.8 9.2 9.2 6.8M6 4.4 7.3 3.1a2.2 2.2 0 0 1 3.1 3.1L9.1 7.5M10 11.6l-1.3 1.3a2.2 2.2 0 0 1-3.1-3.1l1.3-1.3"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BulletsIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <circle cx="3" cy="4.5" r="1" fill="currentColor" />
      <circle cx="3" cy="8" r="1" fill="currentColor" />
      <circle cx="3" cy="11.5" r="1" fill="currentColor" />
      <path d="M6 4.5h7M6 8h7M6 11.5h7" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function ParagraphAlignIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h6M2.5 12h9" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function LayersIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M8 2.5 13.5 5.7 8 8.9 2.5 5.7Z" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
      <path d="M2.5 9 8 12.2 13.5 9" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FrameIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M5 2v11.5M11 2v11.5M2 5h11.5M2 11h11.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function EyeIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function EyeOffIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M1.5 8s2.4-4.5 6.5-4.5c1.1 0 2.1.3 3 .8M14.5 8s-.8 1.5-2.2 2.7M9.4 11.9c-.4.1-.9.1-1.4.1C3.9 12 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" stroke="currentColor" strokeWidth={S} />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function RenameIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M5 3h6M8 3v10M5 13h6" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M3.5 5.5V4.2A1.2 1.2 0 0 1 4.7 3h.8M12.5 5.5V4.2A1.2 1.2 0 0 0 11.3 3h-.8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function NoStrokeIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth={S} strokeLinecap="round" opacity=".35" />
      <path d="M3 13 13 3" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function ExpandIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StrokeIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2.5 8h11" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export function DashIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2.5 8h2.5M8 8h2.5M13.5 8h0" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function RoutingIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5v6a2 2 0 0 0 2 2h9"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function ArrowheadIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2.5 8h8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
      <path d="M9.5 5 13 8l-3.5 3" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LabelAlignIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="6" width="8" height="4" rx="1" stroke="currentColor" strokeWidth={S} />
    </svg>
  );
}

export function TextLabelIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M3 4h10M8 4v8" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  );
}

export function SizeIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path d="M2.5 12 8 4l5.5 8" stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: ToolbarIconProps) {
  return (
    <svg viewBox="0 0 10 6" className={className} fill="none" aria-hidden="true">
      <path d="M1 1 5 5 9 1" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
