"use client";

import type { CanvasColor } from "./colors";
import type {
  CanvasIconGlyph,
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
  /**
   * The object's ONE text field (OBJECT-DEF-OVERHAUL.md D3/D11) — replaces
   * the legacy `label`/`body`/`title` trio. The kind decides rendering:
   * sections render it as the floating title chip, code blocks tokenize it
   * per `language`, stickies render simple markdown (D18), shapes render it
   * in their declared text slot (objects/text-slots.ts). May be empty (a
   * fresh sticky/code block has no text yet). Connections keep their own
   * separate `label`.
   */
  text: string;
  /**
   * The object's ONE color pick (P1, OBJECT-DEF-OVERHAUL.md D1/D12/D17) —
   * a swatch id from the closed 10-id roster (state/schema/colors.ts). The
   * def's `colorRole` decides how the pick renders (shape fill+border /
   * sticky fill / section tint+chip — palette.ts role tables). Absent =
   * the kind's first-use default (sticky → "yellow", section → "gray",
   * everything else → "gray").
   */
  color?: CanvasColor;
  parentId?: string | null;
  geometry: CanvasGeometry;
  style?: CanvasObjectStyle;
  layout?: {
    mode: "free" | "row" | "column" | "stack";
    padding?: number;
    gap?: number;
  };
  /**
   * `type: "section"` only (W2). `locked` is a two-mode section lock,
   * enforced in interaction/core.ts — `"background"` locks the section frame
   * only (children stay movable); `"all"` also locks every descendant object
   * against drag/resize. (The old section `tint` field died in the P1 color
   * cutover — sections color through `color` like every other kind.)
   */
  locked?: "all" | "background";
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
