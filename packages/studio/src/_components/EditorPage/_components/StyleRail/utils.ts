import {
  CANVAS_STYLE_CONTROLS,
  CANVAS_STYLE_GROUP_LABELS,
  type CanvasStyle,
  type CanvasStyleControl,
  type CanvasStyleOverrides,
} from "@codecaine-ai/canvas/style";
import type { CanvasStyleTokenValue } from "@/shared/useCanvasStyleSettings";
import { COLOR_STRENGTH_KEYS } from "./constants";

export function isColorControl(control: CanvasStyleControl): boolean {
  return control.kind === "color" || COLOR_STRENGTH_KEYS.has(control.key);
}

export function controlId(control: CanvasStyleControl): string {
  return control.key === "palette" ? `palette.${control.paletteColor}` : control.key;
}

/** Accessible name: "Shapes corner radius", "Palette blue". */
export function controlName(control: CanvasStyleControl): string {
  return `${CANVAS_STYLE_GROUP_LABELS[control.group]} ${control.label.toLowerCase()}`;
}

export function controlValue(control: CanvasStyleControl, style: CanvasStyle): CanvasStyleTokenValue {
  if (control.key === "palette") return control.paletteColor ? style.palette[control.paletteColor] : "";
  return style[control.key] as CanvasStyleTokenValue;
}

export function isOverridden(control: CanvasStyleControl, overrides: CanvasStyleOverrides): boolean {
  if (control.key === "palette") {
    return control.paletteColor !== undefined && overrides.palette?.[control.paletteColor] !== undefined;
  }
  return control.key in overrides;
}

export function isVisible(control: CanvasStyleControl, style: CanvasStyle): boolean {
  return !control.visibleWhen || style[control.visibleWhen.key] === control.visibleWhen.equals;
}

/**
 * Why an overridden row is shown while its `visibleWhen` does not hold —
 * "Applies when Fill is Layer cake" — so the override can still be reset.
 */
export function inactiveNote(control: CanvasStyleControl): string | undefined {
  const condition = control.visibleWhen;
  if (!condition) return undefined;
  const trigger = CANVAS_STYLE_CONTROLS.find((candidate) => candidate.key === condition.key);
  const value =
    trigger?.options?.find((option) => option.value === condition.equals)?.label ?? String(condition.equals);
  return `Applies when ${trigger?.label ?? condition.key} is ${value}`;
}

export function overrideCount(overrides: CanvasStyleOverrides): number {
  const { palette, ...scalars } = overrides;
  return Object.keys(scalars).length + Object.keys(palette ?? {}).length;
}
