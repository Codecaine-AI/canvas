"use client";

import type { ReactNode } from "react";
import type {
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../state/schema";
import type { OutlineSpec } from "../geometry";
import type { ObjectButtonBorderPolicy, ObjectCatalogMeta } from "../object-def";
import type { ResolvedShapeObjectColors } from "../object-shell";
import type { TextSlot } from "../text-slots";

/**
 * Tier 2 of the two-tier registry (RESTRUCTURE.md): variant DATA for the
 * uniform shape family. One file per shape, each tiny — a ShapeDef never
 * mentions toolbars, handles, or hit-testing; `base.tsx` adapts it into an
 * ObjectDef carrying the ONE shared shape behavior (8 handles, solid
 * hit-test, standard label editing, standard shape toolbar).
 */

/** Everything a shape outline renderer may need, resolved once by the shared shape view. */
export interface ShapeOutlineArgs {
  object: InteractiveCanvasObject;
  /**
   * The object's color pick resolved through the "shape" palette role
   * (object-shell.tsx resolveObjectRoleColors): fill + ink border + the
   * fixed dark text color (D8). D13: no silhouette carries fixed colors
   * anymore — this is the ONLY color input.
   */
  colors: ResolvedShapeObjectColors;
  /** Resolved stroke width. */
  strokeWidth: number;
}

/**
 * The VISUAL spec: how the shape paints (P3 rename from `OutlineSpec` — the
 * geometric outline is now the separate `ShapeDef.outline: OutlineSpec` from
 * objects/geometry.ts; a silhouette and its outline should trace the same
 * curve, cross-checked by objects/__tests__/geometry-def-agreement.test.ts).
 */
export interface SilhouetteSpec {
  /**
   * Per-shape CSS class appended after the base `interactive-canvas-object`
   * class (omit for the plain rounded-rect chrome, which is fully styled by
   * the base class).
   */
  className?: string;
  /**
   * Optional absolutely-positioned silhouette layer (inline SVG silhouette or
   * polygon) painted behind the text content. Omit for shapes whose look
   * is pure CSS.
   */
  silhouette?: (args: ShapeOutlineArgs) => ReactNode;
}

/**
 * Where this shape's `object.text` renders and is edited (D3/D6): a preset
 * from objects/text-slots.ts, or `"none"` for pure glyphs that carry no
 * visible text (plus, or-junction, summing-junction — these are also not
 * text-editable). Omit for the shape default, the "center" preset.
 * Replaces the old TextZoneSpec kinds and the per-shape `labelStyle` margin
 * hacks (arrow/chevron declare rect-function slots instead).
 */
export type ShapeTextSpec = TextSlot | "none";

// (Catalog metadata is the shared ObjectCatalogMeta from ../object-def — the
// def's `catalog` is the single source the Shapes-panel catalog derives its
// entry labels/keywords from since P4; `label` is the picker-facing string,
// distinct from the type label in state/schema/object-defaults.ts.)

export interface ShapeDef {
  type: InteractiveCanvasObjectType;
  /**
   * The `style.shape` variant this def renders — the registry dispatches on
   * the EFFECTIVE render shape (style.shape with the rounded-rect fallback),
   * matching ObjectShape's existing dispatch. Usually same-named as `type`;
   * differs where history diverged (sticky → "note", process → "rounded-rect").
   */
  shape: NonNullable<CanvasObjectStyle["shape"]>;
  /** How the shape PAINTS (CSS class + optional SVG silhouette layer). */
  silhouette: SilhouetteSpec;
  /** Whether the outer button itself paints the shape border. Defaults to "painted". */
  buttonBorder?: ObjectButtonBorderPolicy;
  /**
   * The shape's geometric outline (D4, objects/geometry.ts): connection
   * anchors, outline snap, and hit-testing (D16) all derive from it. Omit
   * for the bbox default (`shapeObjectDef` stamps BBOX_OUTLINE). True-
   * outline shapes MUST reference the same exported spec object the
   * geometry dispatch tables use (identity-checked by test).
   */
  outline?: OutlineSpec;
  /** Text slot (objects/text-slots.ts) — omit for the "center" preset default. */
  text?: ShapeTextSpec;
  // (No defaultSize/defaultPosition: per-type placement defaults are schema
  // vocabulary — state/schema/object-defaults.ts — because the reducer needs
  // them below the objects/ layer; `shapeObjectDef` stamps the same row onto
  // the ObjectDef's `defaults`.)
  /** This shape's global-CSS rules (moved verbatim from CanvasStage's style block). */
  css?: string;
  /** Picker metadata — the catalog (objects/catalog.ts) derives entry labels/keywords from this. */
  catalog: ObjectCatalogMeta;
}
