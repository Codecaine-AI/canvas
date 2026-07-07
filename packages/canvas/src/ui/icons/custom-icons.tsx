"use client";

import type { IconProps } from "./icon-props";

/**
 * Hand-authored icons that are NOT part of the generated Nucleo set
 * (see manifest.json `custom: true` entries):
 * - ColorSwatchIcon — a filled circle whose color is data, not chrome
 *   styling, so it can't be expressed as a currentColor Nucleo outline.
 * - SectionIcon — FigJam sections icon, not from the Nucleo library
 *   (source asset: ./sections-icon.svg).
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
