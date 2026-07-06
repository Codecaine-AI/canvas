"use client";

import type {
  CanvasIconGlyph,
  CanvasSectionTint,
  CanvasShapeDirection,
  InteractiveCanvasObjectType,
} from "./object-types";
import type { CanvasObjectStyle } from "./style";

export type CanvasGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type InteractiveCanvasObject = {
  id: string;
  type: InteractiveCanvasObjectType;
  label: string;
  body?: string;
  parentId?: string | null;
  geometry: CanvasGeometry;
  style?: CanvasObjectStyle;
  layout?: {
    mode: "free" | "row" | "column" | "stack";
    padding?: number;
    gap?: number;
  };
  source?: {
    path?: string;
    symbol?: string;
    section?: string;
  };
  /**
   * `type: "section"` only (W2). `title` is the text shown in the section's
   * floating title chip (distinct from `label`, which every object still
   * carries for a11y/docs-targeting/consistency but is not separately
   * rendered on sections — the chip IS the visible title). `tint` selects the
   * fill/chip family from figjam-tokens.ts's SECTION_FAMILIES. `locked`
   * reserved for a later wave (no enforcement yet — see actions.ts).
   */
  title?: string;
  tint?: CanvasSectionTint;
  locked?: boolean;
  contentHidden?: boolean;
  /**
   * Pointing/skew direction for direction-aware shapes (W2, generalized W5):
   * `arrow-shape` | `chevron` | `parallelogram` accept "left" | "right"
   * (soft-default "right" when omitted/invalid); `triangle` accepts
   * "up" | "down" (soft-default "up"). Absent/ignored for every other type.
   */
  direction?: CanvasShapeDirection;
  /** `type: "code-block"` only (W2) — selects the minimal tokenizer in code-tokenizer.ts. */
  language?: string;
  /** `type: "sticky"` only (W2) — rendered bottom-left at 12px/40% black. */
  author?: string;
  /**
   * `type: "icon"` only (W5) — REQUIRED glyph selector, one of the 26
   * Advanced-tier ids in `CanvasIconGlyph`. Missing/unknown is a hard
   * validation error (mirrors the `section` title/tint precedent above),
   * since an icon object with no glyph can't be rendered at all.
   */
  icon?: CanvasIconGlyph;
};
