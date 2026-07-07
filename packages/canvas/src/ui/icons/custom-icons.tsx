"use client";

import type { IconProps } from "./icon-props";

/**
 * Hand-authored icons that are NOT part of the generated Nucleo set
 * (see manifest.json `custom: true` entries). Currently just the dynamic
 * color swatch — a filled circle whose color is data, not chrome styling,
 * so it can't be expressed as a currentColor Nucleo outline.
 */

export function ColorSwatchIcon({ color = "#F24822", className, style }: IconProps & { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill={color} />
    </svg>
  );
}
