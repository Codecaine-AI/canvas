"use client";

/**
 * Per-type object defaults — the ONE defaults table (P4, OBJECT-DEF-OVERHAUL.md
 * §6 / RESTRUCTURE step 6). Replaces the four parallel switches that lived in
 * state/actions/defaults.ts (defaultGeometryFor / objectTypeLabel /
 * shapeForType / the tone switch that died in P1).
 *
 * WHY THIS LIVES IN state/schema AND NOT ON THE DEFS: the reducer needs these
 * values at reduce time (canvas.addObject without geometry, canvas.quickConnect,
 * canvas.setObjectType), state/ must not import objects/ (layering, encoded in
 * __tests__/import-boundaries.test.ts), and `@codecaine-ai/canvas/actions` is a
 * frozen public subpath — the reducer must work standalone, so the registry
 * cannot be a runtime prerequisite. Defaults are therefore SCHEMA VOCABULARY:
 * pure data keyed by the closed type union (like ./colors), living beside it.
 * The registry STAMPS each ObjectDef's `defaults` from this table
 * (objects/shapes/base.tsx + the special defs), so layers above objects/ read
 * the same rows through `objectDefForType(type).defaults`; identity is locked
 * by objects/__tests__/type-defaults.test.ts. Adding a type without a row here
 * is a compile error (exhaustive Record).
 */

import type { CanvasColor } from "./colors";
import type {
  CanvasIconGlyph,
  CanvasShapeDirection,
  InteractiveCanvasObjectType,
} from "./object-types";
import type { CanvasGeometry, InteractiveCanvasObject } from "./objects";
import type { CanvasObjectStyle } from "./style";

/** Type-level defaults every creation/placement/swap path derives from. */
export interface ObjectTypeDefaults {
  /** Placement default: x/y is the canonical drop position, width/height the default size. */
  geometry: CanvasGeometry;
  /** The `style.shape` variant stamped on creation/type-swap (render dispatch key). */
  shape: NonNullable<CanvasObjectStyle["shape"]>;
  /** Human-readable type label (context menu, id slugs, history summaries, a11y). */
  label: string;
}

/**
 * The defaults table. Values are the long-standing per-type defaults (W2/W5
 * placement briefs); geometry x/y is 160,160 for the shape family with the
 * documented exceptions (rectangle/section backdrop at 80,80, sticky at
 * 180,180, annotation-marker at 220,220).
 */
export const OBJECT_TYPE_DEFAULTS: Readonly<
  Record<InteractiveCanvasObjectType, ObjectTypeDefaults>
> = {
  rectangle: { geometry: { x: 80, y: 80, width: 360, height: 240 }, shape: "rounded-rect", label: "Rectangle" },
  process: { geometry: { x: 160, y: 160, width: 184, height: 96 }, shape: "rounded-rect", label: "Process" },
  decision: { geometry: { x: 160, y: 160, width: 160, height: 112 }, shape: "diamond", label: "Decision" },
  sticky: { geometry: { x: 180, y: 180, width: 176, height: 128 }, shape: "note", label: "Sticky" },
  "annotation-marker": { geometry: { x: 220, y: 220, width: 40, height: 40 }, shape: "marker", label: "Annotation" },
  document: { geometry: { x: 160, y: 160, width: 160, height: 120 }, shape: "document", label: "Document" },
  database: { geometry: { x: 160, y: 160, width: 140, height: 120 }, shape: "database", label: "Database" },
  // W2 — sections default large (they're meant to wrap other objects, so a
  // container-like footprint reads better than a shape-sized default).
  section: { geometry: { x: 80, y: 80, width: 480, height: 360 }, shape: "section", label: "Section" },
  pill: { geometry: { x: 160, y: 160, width: 200, height: 64 }, shape: "pill", label: "Pill" },
  // W2 — arrow-shape default matches the reference proportions (361x100
  // logical) at a comfortable placement size.
  "arrow-shape": { geometry: { x: 160, y: 160, width: 361, height: 100 }, shape: "arrow-shape", label: "Arrow" },
  "predefined-process": { geometry: { x: 160, y: 160, width: 200, height: 100 }, shape: "predefined-process", label: "Predefined Process" },
  // W5 — FigJam parity shape set (Wave A): sizes per the implementation
  // brief's size table (docs/10-system-design/20-figjam-parity's "Missing
  // shape specs" section, cross-checked against this brief's overrides).
  ellipse: { geometry: { x: 160, y: 160, width: 160, height: 120 }, shape: "ellipse", label: "Ellipse" },
  triangle: { geometry: { x: 160, y: 160, width: 140, height: 120 }, shape: "triangle", label: "Triangle" },
  parallelogram: { geometry: { x: 160, y: 160, width: 160, height: 100 }, shape: "parallelogram", label: "Parallelogram" },
  pentagon: { geometry: { x: 160, y: 160, width: 140, height: 140 }, shape: "pentagon", label: "Pentagon" },
  octagon: { geometry: { x: 160, y: 160, width: 140, height: 140 }, shape: "octagon", label: "Octagon" },
  star: { geometry: { x: 160, y: 160, width: 140, height: 140 }, shape: "star", label: "Star" },
  plus: { geometry: { x: 160, y: 160, width: 120, height: 120 }, shape: "plus", label: "Plus" },
  chevron: { geometry: { x: 160, y: 160, width: 160, height: 120 }, shape: "chevron", label: "Chevron" },
  folder: { geometry: { x: 160, y: 160, width: 140, height: 110 }, shape: "folder", label: "Folder" },
  "document-stack": { geometry: { x: 160, y: 160, width: 160, height: 120 }, shape: "document-stack", label: "Document Stack" },
  "off-page-connector": { geometry: { x: 160, y: 160, width: 120, height: 100 }, shape: "off-page-connector", label: "Off-page Connector" },
  trapezoid: { geometry: { x: 160, y: 160, width: 150, height: 100 }, shape: "trapezoid", label: "Trapezoid" },
  "manual-input": { geometry: { x: 160, y: 160, width: 150, height: 100 }, shape: "manual-input", label: "Manual Input" },
  hexagon: { geometry: { x: 160, y: 160, width: 150, height: 100 }, shape: "hexagon", label: "Hexagon" },
  "internal-storage": { geometry: { x: 160, y: 160, width: 150, height: 110 }, shape: "internal-storage", label: "Internal Storage" },
  "or-junction": { geometry: { x: 160, y: 160, width: 100, height: 100 }, shape: "or-junction", label: "Or Junction" },
  "summing-junction": { geometry: { x: 160, y: 160, width: 100, height: 100 }, shape: "summing-junction", label: "Summing Junction" },
  "cylinder-horizontal": { geometry: { x: 160, y: 160, width: 150, height: 100 }, shape: "cylinder-horizontal", label: "Cylinder (Horizontal)" },
  "page-corner": { geometry: { x: 160, y: 160, width: 160, height: 120 }, shape: "page-corner", label: "Page Corner" },
  icon: { geometry: { x: 160, y: 160, width: 120, height: 120 }, shape: "icon", label: "Icon" },
};

/** The full defaults row for a type (the same object the registry stamps onto its def). */
export function objectTypeDefaults(type: InteractiveCanvasObjectType): ObjectTypeDefaults {
  return OBJECT_TYPE_DEFAULTS[type];
}

/** Default placement geometry for a type. Returns a fresh copy (documents must never share the table's row objects). */
export function defaultGeometryFor(type: InteractiveCanvasObjectType): CanvasGeometry {
  return { ...OBJECT_TYPE_DEFAULTS[type].geometry };
}

export function objectTypeLabel(type: InteractiveCanvasObjectType): string {
  return OBJECT_TYPE_DEFAULTS[type].label;
}

/** Shape name for a given object type, used by canvas.addObject / canvas.setObjectType to set style.shape. */
export function shapeForType(type: InteractiveCanvasObjectType): CanvasObjectStyle["shape"] {
  return OBJECT_TYPE_DEFAULTS[type].shape;
}

/**
 * Last-picked color memory buckets (P1, OBJECT-DEF-OVERHAUL.md D17): color
 * picks are remembered per KIND — sticky / section / connector / everything
 * else ("shape") — so a red connector doesn't make the next sticky red.
 */
export type CanvasColorKind = "shape" | "sticky" | "section" | "connector";

/**
 * Per-kind first-use fallbacks (D17): what a fresh board's new objects get
 * before any pick has been made, and what an object with no stored `color`
 * renders as (the two are deliberately the same ids, so stamped-vs-absent is
 * visually indistinguishable).
 */
export const FIRST_USE_COLORS: Record<CanvasColorKind, CanvasColor> = {
  shape: "gray",
  sticky: "yellow",
  section: "gray",
  connector: "gray",
};

/**
 * Which last-picked memory bucket an object type reads/writes (D17). For
 * object types this is the same 3-value space as the def's `colorRole`
 * (agreement locked by objects/__tests__/type-defaults.test.ts); "connector"
 * is the connection-selection bucket, not an object type.
 */
export function colorKindForType(type: InteractiveCanvasObjectType): CanvasColorKind {
  if (type === "sticky") return "sticky";
  if (type === "section") return "section";
  return "shape";
}

/**
 * Default `text` a freshly created object of `type` carries: sticky starts
 * EMPTY (its text is the whole body — stamping "Sticky" into a fresh note
 * would render it), everything else starts with the
 * human-readable type label (a fresh Process reads "Process", a fresh
 * section chip reads "Section"), matching the pre-unification behavior.
 */
export function defaultTextFor(type: InteractiveCanvasObjectType): string {
  if (type === "sticky") return "";
  return objectTypeLabel(type);
}

/**
 * Builds the complete object a creation flow will produce for `objectType` at
 * `geometry` — the single source of truth shared by the canvas.addObject
 * reducer (which adds a real id/parentId and snapped geometry) and the
 * armed-tool ghost preview (which renders this draft verbatim so what the
 * user sees under the cursor is exactly what a click creates). `direction`
 * and `icon` carry the Shapes-panel catalog-entry variant (triangle up/down,
 * Advanced-tier glyph); `text` overrides the per-type default (e.g. an icon
 * entry's glyph name instead of the generic "Icon").
 */
export function draftPlacedObject(
  objectType: InteractiveCanvasObjectType,
  geometry: CanvasGeometry,
  options?: {
    id?: string;
    text?: string;
    parentId?: string | null;
    /** Color pick stamped on the new object (D17: last-picked memory); omit for the per-kind first-use fallback. */
    color?: CanvasColor;
    direction?: CanvasShapeDirection;
    icon?: CanvasIconGlyph;
  },
): InteractiveCanvasObject {
  return {
    id: options?.id ?? "",
    type: objectType,
    text: options?.text ?? defaultTextFor(objectType),
    // D17 — new objects take the last-picked color for their kind; the
    // caller (reducer / ghost preview) passes the remembered pick, falling
    // back to the per-kind first-use color here.
    color: options?.color ?? FIRST_USE_COLORS[colorKindForType(objectType)],
    parentId: options?.parentId ?? null,
    geometry,
    style: {
      shape: shapeForType(objectType),
    },
    ...(options?.direction ? { direction: options.direction } : null),
    ...(options?.icon ? { icon: options.icon } : null),
  };
}
