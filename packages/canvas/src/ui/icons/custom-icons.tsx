"use client";

import type { IconProps } from "./icon-props";

/**
 * Hand-authored icons that are NOT part of the generated Nucleo set
 * (see manifest.json `custom: true` entries):
 * - ColorSwatchIcon — a filled circle whose color is data, not trim
 *   styling, so it can't be expressed as a currentColor Nucleo outline.
 * - SectionIcon — FigJam sections icon, not from the Nucleo library
 *   (source asset: ./sections-icon.svg).
 * - StickyIcon — sticky note with a top-left peel, not from the Nucleo
 *   library (source asset: ./sticky-note-icon.svg; the asset's 1024px
 *   y-flipped coordinates are baked down to the 18px trim-icon grid here,
 *   with the fold flap extended past the asset's so the peel stays legible
 *   at dock size).
 */

export function ColorSwatchIcon({ color = "#F24822", className, style }: IconProps & { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill={color} />
    </svg>
  );
}

export function SectionIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 112 112" className={className} style={style} fill="none" aria-hidden="true">
      <rect x="4" y="4" width="56" height="24" rx="4" stroke="currentColor" strokeWidth="8" />
      <path d="M76 4H97C103.075 4 108 8.925 108 15V97C108 103.075 103.075 108 97 108H15C8.925 108 4 103.075 4 97V44" stroke="currentColor" strokeWidth="8" strokeLinecap="butt" strokeLinejoin="round" />
    </svg>
  );
}

export function StickyIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M2.81,7.94 L2.81,15.25 L15.19,15.25 L15.19,2.75 L8.69,2.75" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
      <path d="M2.81,7.94 C3.68,5.98 6.76,2.75 8.69,2.75" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
      <path d="M2.81,7.94 C3.7,6.8 6.1,6.3 8.1,7.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
      <path d="M8.1,7.7 C7.5,5.55 7.75,3.75 8.69,2.75" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
    </svg>
  );
}

export function ConnectorSolidLineIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M3 9H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ConnectorDashedLineIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M3 9H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 2" />
    </svg>
  );
}

export function ConnectorNoArrowheadsIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M3 9H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ConnectorArrowRightIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M3 9H12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 9L11 6.5V11.5Z" fill="currentColor" />
    </svg>
  );
}

export function ConnectorArrowLeftIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M5.5 9H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 9L7 6.5V11.5Z" fill="currentColor" />
    </svg>
  );
}

export function ConnectorArrowsBothIcon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" className={className} style={style} fill="none" aria-hidden="true">
      <path d="M5.5 9H12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 9L7 6.5V11.5Z" fill="currentColor" />
      <path d="M15 9L11 6.5V11.5Z" fill="currentColor" />
    </svg>
  );
}
