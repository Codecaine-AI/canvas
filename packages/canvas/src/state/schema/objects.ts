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
   * The object's main text — its name, or a sticky's body
   * (OBJECT-DEF-OVERHAUL.md D3/D11) — replaces the legacy
   * `label`/`body`/`title` trio; a shape, icon, or section may add one fact in
   * `detail` below. The kind decides rendering:
   * sections render it as the header title chip, stickies render simple
   * markdown (D18), shapes render it in their declared text slot
   * (objects/text-slots.ts). May be empty (a fresh sticky has no text yet).
   * Connections keep their own
   * separate `label`.
   */
  text: string;
  /**
   * Optional one-line detail under `text` (the name): a short fact such as a port, path, model, or spec —
   * never prose. Rendered muted on one line (ellipsized), below the name for shapes and icons and inline
   * after the title in a section's header. Shapes, icons, and sections only; stickies ignore it (their body
   * is markdown). Absent / empty = no detail line.
   */
  detail?: string;
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
   * enforced in stage/editor/pipeline/core.ts — `"background"` locks the section frame
   * only (children stay movable); `"all"` also locks every descendant object
   * against drag/resize. (The old section `tint` field died in the P1 color
   * cutover — sections color through `color` like every other kind.)
   */
  locked?: "all" | "background";
  /**
   * Pointing direction for direction-aware shapes (W2, generalized W5):
   * `arrow-shape` accepts "left" | "right" (soft-default "right" when
   * omitted/invalid); `triangle` accepts "up" | "down" (soft-default "up").
   * Absent/ignored for every other type.
   */
  direction?: CanvasShapeDirection;
  /** `type: "sticky"` only (W2) — rendered bottom-left at 12px/40% black. */
  author?: string;
  /**
   * Glyph selector, one of the roster ids in `CanvasIconGlyph`. Valid on
   * `type: "icon"` and `type: "section"`, ignored on every other kind:
   *  - icon (W5): REQUIRED. Missing/unknown is a hard validation error,
   *    since an icon object with no glyph can't be rendered at all.
   *  - section: OPTIONAL header icon, drawn before the title in the header
   *    chip. An unknown id is dropped with a warning (the section still
   *    renders, just without an icon).
   */
  icon?: CanvasIconGlyph;
};
