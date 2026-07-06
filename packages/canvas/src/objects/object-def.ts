"use client";

import type { ComponentType, MouseEvent as ReactMouseEvent } from "react";
import type { CanvasBounds } from "../model/geometry";
import type {
  CanvasGeometry,
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
  InteractiveCanvasTone,
} from "../model/schema";
import { codeBlockDef } from "./code-block/def";
import { containerDef } from "./container/def";
import { sectionDef } from "./section/def";
import { sourceNodeDef } from "./source-node/def";
import { stickyDef } from "./sticky/def";
import { textDef } from "./text/def";
import { annotationMarkerDef } from "./shapes/annotation-marker";
import { arrowShapeDef } from "./shapes/arrow-shape";
import { chatDef } from "./shapes/chat";
import { chevronDef } from "./shapes/chevron";
import { chipIconDef } from "./shapes/chip-icon";
import { cylinderHorizontalDef } from "./shapes/cylinder-horizontal";
import { databaseDef } from "./shapes/database";
import { decisionDef } from "./shapes/decision";
import { documentDef } from "./shapes/document";
import { documentStackDef } from "./shapes/document-stack";
import { ellipseDef } from "./shapes/ellipse";
import { folderDef } from "./shapes/folder";
import { hexagonDef } from "./shapes/hexagon";
import { iconDef } from "./shapes/icon";
import { internalStorageDef } from "./shapes/internal-storage";
import { manualInputDef } from "./shapes/manual-input";
import { octagonDef } from "./shapes/octagon";
import { offPageConnectorDef } from "./shapes/off-page-connector";
import { orJunctionDef } from "./shapes/or-junction";
import { pageCornerDef } from "./shapes/page-corner";
import { parallelogramDef } from "./shapes/parallelogram";
import { pentagonDef } from "./shapes/pentagon";
import { personDef } from "./shapes/person";
import { pillDef } from "./shapes/pill";
import { plusDef } from "./shapes/plus";
import { predefinedProcessDef } from "./shapes/predefined-process";
import { processDef } from "./shapes/process";
import { starDef } from "./shapes/star";
import { summingJunctionDef } from "./shapes/summing-junction";
import { trapezoidDef } from "./shapes/trapezoid";
import { triangleDef } from "./shapes/triangle";

/**
 * Tier 1 of the two-tier object/shape registry (RESTRUCTURE.md, "The two-tier
 * registry"). An ObjectDef is the behavior contract for one KIND of thing
 * that behaves differently on the canvas — specials (section, sticky,
 * code-block, connector, container, text) are first-class; the ~40 uniform
 * shapes share ONE behavior and get their ObjectDef generated from a
 * ShapeDef via `objects/shapes/base.tsx`.
 *
 * Pilot scope (step 4): only `render`, `css`, and the className carried by
 * the render path are CONSUMED. The behavioral flags (`handles`, `hitTest`,
 * `dragCapture`, `labelEditing`, `toolbar`, `defaults`) are DECLARED here so
 * defs are written once in their final shape, but the existing `type ===`
 * checks in interaction/editor/model code stay authoritative until a later
 * chunk wires them through the registry.
 */

/** Props every object renderer receives — mirrors render/ObjectShape's public props. */
export interface ObjectRenderProps {
  object: InteractiveCanvasObject;
  selected: boolean;
  changed: boolean;
  dropTarget?: boolean;
  compact?: boolean;
  bounds: CanvasBounds;
  /** Shows the grab-cursor affordance; defaults to true when any select/pointer handler is wired. */
  editable?: boolean;
  /** Renders quick-connect edge ports — only true in the interactive editor. */
  showPorts?: boolean;
  /** Current viewport zoom — used to counter-scale edge ports to a constant screen size. */
  zoom?: number;
  /** True while this object's label is being edited inline (4.2.1) — hides the static label span. */
  hideLabel?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}

/** Resize-handle set: full 8-handle compass, corner-only (sections), or none. */
export type ObjectHandles = "all" | "corners" | "none";

/** Pointer hit-testing: whole box, or a border band with a pass-through interior (containers). */
export type ObjectHitTest = "solid" | "border-band";

/**
 * What a drag of this object carries along: geometric ≥60%-overlap capture
 * (sections — ephemeral, never persisted), persisted `parentId` descendants
 * (containers), or nothing.
 */
export type ObjectDragCapture = "geometric-overlap" | "descendants" | "none";

/**
 * What inline text editing targets on this object: the standard `label`, the
 * section's floating title chip (`title` field), the `body` text, or nothing.
 */
export type LabelEditingTarget = "label" | "section-title" | "body" | "none";

export interface LabelEditingSpec {
  target: LabelEditingTarget;
}

/**
 * Context-toolbar contract (step 5 wires this): action ids resolved against
 * the editor's action/flyout tables. Declared now so multi-select toolbars
 * can become a capability intersection over the selected defs.
 */
export interface ToolbarSpec {
  actions: readonly string[];
}

/** Type-level defaults, the registry-side replacement for model/actions/defaults.ts (wired in step 6). */
export interface ObjectDefaults {
  geometry: CanvasGeometry;
  tone: InteractiveCanvasTone;
  /** Effective render shape; usually also the `style.shape` value step 6 will stamp. */
  shape?: RenderObjectShape;
  /** Human-readable type label (context menu, inspector, a11y). */
  label: string;
}

export interface ObjectDef {
  /** Registry key — the object `type` for type-keyed kinds, the selection kind for connector. */
  kind: string;
  /** The object's world-layer renderer (receives the same props as render/ObjectShape). */
  render: ComponentType<ObjectRenderProps>;
  /**
   * This kind's global-CSS rules, moved verbatim from CanvasStage's embedded
   * style block. CanvasStage composes its style tag as: legacy block (rules
   * not yet migrated) + the concatenated `css` of every registered def.
   */
  css: string;
  defaults: ObjectDefaults;
  handles: ObjectHandles;
  hitTest: ObjectHitTest;
  dragCapture: ObjectDragCapture;
  labelEditing: LabelEditingSpec;
  /** Declared for step 5 (toolbar migration); unconsumed in the pilot. */
  toolbar?: ToolbarSpec;
}

/**
 * The effective render shape ObjectShape dispatches on: `style.shape`, with
 * the W2 fallbacks (standalone `text` objects render as a borderless label;
 * everything else defaults to the rounded-rect chrome).
 */
export type RenderObjectShape = NonNullable<CanvasObjectStyle["shape"]> | "label";

export function renderShapeFor(object: InteractiveCanvasObject): RenderObjectShape {
  return object.style?.shape ?? (object.type === "text" ? "label" : "rounded-rect");
}

/**
 * Static def tables (no registration-order issues — populated by direct
 * import as kinds are converted; pilot converts six, the rest keep flowing
 * through ObjectShape's legacy branches via the `undefined` fallback).
 *
 * Two keys mirror the two dispatch mechanisms ObjectShape actually uses:
 *  - `section` is dispatched on `object.type` (the ONLY type the legacy
 *    renderer checked before style.shape). `container` and `source-node`
 *    deliberately are NOT type-keyed for RENDER dispatch: legacy rendering
 *    for them is purely style.shape-driven (an explicit non-default
 *    style.shape wins), so their objects flow through the render-shape table
 *    — typically to the rounded-rect def. Their ObjectDefs still register in
 *    OBJECT_DEFS to carry defaults (step 6) and behavioral flags (step 4,
 *    which needs a type-keyed BEHAVIOR lookup, distinct from render
 *    dispatch).
 *  - everything else is dispatched on the effective render shape, so e.g. a
 *    `sticky`-typed object WITHOUT `style.shape: "note"` keeps falling
 *    through to the rounded-rect path exactly as before.
 */
const DEFS_BY_TYPE: Partial<Record<InteractiveCanvasObjectType, ObjectDef>> = {
  section: sectionDef,
};

const DEFS_BY_RENDER_SHAPE: Partial<Record<RenderObjectShape, ObjectDef>> = {
  label: textDef,
  note: stickyDef,
  "code-block": codeBlockDef,
  "rounded-rect": processDef,
  ellipse: ellipseDef,
  person: personDef,
  diamond: decisionDef,
  marker: annotationMarkerDef,
  document: documentDef,
  database: databaseDef,
  chat: chatDef,
  "chip-icon": chipIconDef,
  pill: pillDef,
  "arrow-shape": arrowShapeDef,
  "predefined-process": predefinedProcessDef,
  triangle: triangleDef,
  parallelogram: parallelogramDef,
  pentagon: pentagonDef,
  octagon: octagonDef,
  hexagon: hexagonDef,
  star: starDef,
  plus: plusDef,
  chevron: chevronDef,
  trapezoid: trapezoidDef,
  "off-page-connector": offPageConnectorDef,
  "manual-input": manualInputDef,
  "internal-storage": internalStorageDef,
  "or-junction": orJunctionDef,
  "summing-junction": summingJunctionDef,
  "page-corner": pageCornerDef,
  folder: folderDef,
  "document-stack": documentStackDef,
  "cylinder-horizontal": cylinderHorizontalDef,
  icon: iconDef,
};

/** Registered defs in stylesheet order (their `css` is appended in this order). */
export const OBJECT_DEFS: readonly ObjectDef[] = [
  sectionDef,
  stickyDef,
  codeBlockDef,
  processDef,
  ellipseDef,
  personDef,
  containerDef,
  textDef,
  sourceNodeDef,
  decisionDef,
  annotationMarkerDef,
  documentDef,
  databaseDef,
  chatDef,
  chipIconDef,
  pillDef,
  arrowShapeDef,
  predefinedProcessDef,
  triangleDef,
  parallelogramDef,
  pentagonDef,
  octagonDef,
  hexagonDef,
  starDef,
  plusDef,
  chevronDef,
  trapezoidDef,
  offPageConnectorDef,
  manualInputDef,
  internalStorageDef,
  orJunctionDef,
  summingJunctionDef,
  pageCornerDef,
  folderDef,
  documentStackDef,
  cylinderHorizontalDef,
  iconDef,
];

export function objectDefFor(object: InteractiveCanvasObject): ObjectDef | undefined {
  return DEFS_BY_TYPE[object.type] ?? DEFS_BY_RENDER_SHAPE[renderShapeFor(object)];
}

/** Concatenated per-kind CSS of every registered def, appended to CanvasStage's style tag. */
export const OBJECT_DEFS_CSS: string = OBJECT_DEFS.map((def) => def.css).join("");

/**
 * Capability-intersection helper for the multi-select toolbar (step 5):
 * replaces the hard-coded `multi` toolbar variant with "action ids offered
 * by EVERY selected def, in the first def's order". Declared, unconsumed.
 */
export function intersectToolbarActions(defs: readonly ObjectDef[]): string[] {
  const [first, ...rest] = defs;
  if (!first) return [];
  return (first.toolbar?.actions ?? []).filter((action) =>
    rest.every((def) => def.toolbar?.actions.includes(action)),
  );
}
