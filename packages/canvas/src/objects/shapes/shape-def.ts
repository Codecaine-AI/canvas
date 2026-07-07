"use client";

import type { CSSProperties, ReactNode } from "react";
import type { CanvasBounds, CanvasPoint } from "../../state/geometry";
import type {
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
  InteractiveCanvasTone,
} from "../../state/schema";
import type { Anchor } from "../../routing/routing";
import type { CanvasToneStyle } from "../../theme";

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
  /** Resolved fill/border/text colors (theme/resolve.ts resolveObjectColors). */
  colors: CanvasToneStyle;
  /** True when the object carries an explicit paletteToken/tone/fill/stroke. */
  hasExplicitColor: boolean;
  /** Resolved stroke width (theme/resolve.ts resolveObjectStrokeWidth). */
  strokeWidth: number;
}

export interface OutlineSpec {
  /**
   * Per-shape CSS class appended after the base `interactive-canvas-object`
   * class (omit for the plain rounded-rect chrome, which is fully styled by
   * the base class).
   */
  className?: string;
  /**
   * Optional absolutely-positioned outline layer (inline SVG silhouette or
   * polygon) painted behind the text content. Omit for shapes whose outline
   * is pure CSS.
   */
  silhouette?: (args: ShapeOutlineArgs) => ReactNode;
}

export type TextZoneKind =
  /** Standard label span + optional body span (rounded-rect, ellipse, most shapes). */
  | "label"
  /** Bold label rendered BELOW the silhouette (person/chat/chip-icon family). */
  | "label-below-icon"
  /** No visible text (plus, or-junction, summing-junction). */
  | "none";

export interface TextZoneSpec {
  kind: TextZoneKind;
  /**
   * Below this object height the shape is treated as a compact glyph: label
   * and body are dropped so the silhouette stays legible (person: 100px).
   */
  compactBelowHeightPx?: number;
  /**
   * What the compact threshold suppresses. Person (the default,
   * "label-and-body") drops BOTH the below-icon label and the body; chat
   * ("body") keeps its below-icon label and drops only the body copy.
   */
  compactDrops?: "label-and-body" | "body";
  /** Per-shape inline label style (e.g. arrow-shape/chevron center the label within the body, not the bbox). */
  labelStyle?: (object: InteractiveCanvasObject) => CSSProperties | undefined;
}

/**
 * Connector attachment points. Absent = the current behavior for every
 * shape: bbox compass points (top/right/bottom/left side midpoints).
 * Declared for shapes whose true outline should reposition anchors later;
 * not consumed anywhere yet.
 */
export interface AnchorSpec {
  points: (bounds: CanvasBounds) => ReadonlyArray<{ anchor: Anchor; point: CanvasPoint }>;
}

/** Shape-catalog metadata (objects/catalog.ts migrates onto this in a later chunk). Declared, unconsumed. */
export interface ShapeCatalogMeta {
  label: string;
  /** Catalog preview glyph. */
  icon?: ReactNode;
  keywords?: readonly string[];
}

export interface ShapeDef {
  type: InteractiveCanvasObjectType;
  /**
   * The `style.shape` variant this def renders — the registry dispatches on
   * the EFFECTIVE render shape (style.shape with the rounded-rect fallback),
   * matching ObjectShape's existing dispatch. Usually same-named as `type`;
   * differs where history diverged (sticky → "note", process → "rounded-rect").
   */
  shape: NonNullable<CanvasObjectStyle["shape"]>;
  outline: OutlineSpec;
  text: TextZoneSpec;
  anchors?: AnchorSpec;
  defaultSize: { width: number; height: number };
  /** Placement default; omit for the shape-family standard (160, 160). annotation-marker: (220, 220). */
  defaultPosition?: { x: number; y: number };
  /** Tone stamped on new objects of this type (defaults to "neutral" — the W5 inert fallback). */
  defaultTone?: InteractiveCanvasTone;
  /** This shape's global-CSS rules (moved verbatim from CanvasStage's style block). */
  css?: string;
  catalog: ShapeCatalogMeta;
}
