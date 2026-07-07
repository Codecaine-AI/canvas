"use client";

import type { ComponentType, MouseEvent as ReactMouseEvent } from "react";
import type { CanvasAction } from "../state/actions";
import type { CanvasBounds } from "../state/geometry";
import type {
  CanvasGeometry,
  CanvasObjectStyle,
  CanvasPaletteToken,
  CanvasSectionStrokeStyle,
  CanvasSectionTint,
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
  InteractiveCanvasTone,
} from "../state/schema";
import { codeBlockDef } from "./code-block/def";
import { connectorDef } from "./connector/def";
import { containerDef } from "./container/def";
import { sectionDef } from "./section/def";
import { sourceNodeDef } from "./source-node/def";
import { stickyDef } from "./sticky/def";
import { textDef } from "./text/def";
import { arrowShapeDef } from "./shapes/basic/arrow-shape";
import { chatDef } from "./shapes/basic/chat";
import { chevronDef } from "./shapes/basic/chevron";
import { decisionDef } from "./shapes/basic/decision";
import { ellipseDef } from "./shapes/basic/ellipse";
import { octagonDef } from "./shapes/basic/octagon";
import { pentagonDef } from "./shapes/basic/pentagon";
import { plusDef } from "./shapes/basic/plus";
import { processDef } from "./shapes/basic/process";
import { starDef } from "./shapes/basic/star";
import { triangleDef } from "./shapes/basic/triangle";
import { cylinderHorizontalDef } from "./shapes/flowchart/cylinder-horizontal";
import { databaseDef } from "./shapes/flowchart/database";
import { documentDef } from "./shapes/flowchart/document";
import { documentStackDef } from "./shapes/flowchart/document-stack";
import { folderDef } from "./shapes/flowchart/folder";
import { hexagonDef } from "./shapes/flowchart/hexagon";
import { internalStorageDef } from "./shapes/flowchart/internal-storage";
import { manualInputDef } from "./shapes/flowchart/manual-input";
import { offPageConnectorDef } from "./shapes/flowchart/off-page-connector";
import { orJunctionDef } from "./shapes/flowchart/or-junction";
import { pageCornerDef } from "./shapes/flowchart/page-corner";
import { parallelogramDef } from "./shapes/flowchart/parallelogram";
import { predefinedProcessDef } from "./shapes/flowchart/predefined-process";
import { summingJunctionDef } from "./shapes/flowchart/summing-junction";
import { trapezoidDef } from "./shapes/flowchart/trapezoid";
import { iconDef } from "./shapes/icon/def";
import { annotationMarkerDef } from "./shapes/misc/annotation-marker";
import { chipIconDef } from "./shapes/misc/chip-icon";
import { personDef } from "./shapes/misc/person";
import { pillDef } from "./shapes/misc/pill";

/**
 * Tier 1 of the two-tier object/shape registry (RESTRUCTURE.md, "The two-tier
 * registry"). An ObjectDef is the behavior contract for one KIND of thing
 * that behaves differently on the canvas — specials (section, sticky,
 * code-block, connector, container, text) are first-class; the ~40 uniform
 * shapes share ONE behavior and get their ObjectDef generated from a
 * ShapeDef via `objects/shapes/base.tsx`.
 *
 * Current scope: `render`, `css`, the className carried by the render path,
 * `handles`/`hitTest`/`dragCapture` (interaction/core.ts, hit-testing.ts,
 * gestures/move.ts, SelectionBox — cf3aec8), and `toolbar` (the
 * selection-toolbar layer's use-selection-toolbar.ts — 4c0d62d) are all CONSUMED
 * from the registry. `labelEditing` is DECLARED but not yet consumed —
 * inline label-editing dispatch still checks `object.type === "section"`
 * directly. `defaults` is likewise DECLARED but not yet consumed — per-type
 * defaults still live in state/actions/defaults.ts and are wired through the
 * registry in a later chunk (RESTRUCTURE.md step 6).
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
 * Selection-toolbar contract (step 5): each def owns its ordered control list
 * and the flyout components those controls open. Specs are ICON-FREE — the
 * chrome SelectionToolbar host resolves each action id to its icon via an
 * internal map, so objects/ never depends on chrome's icon set.
 */
export interface ToolbarControlSpec {
  action: string;
  label: string;
  /** Whether this control opens a flyout (renders a chevron affordance). */
  hasFlyout?: boolean;
  /** Rendered as literal text instead of an icon (e.g. "Medium", "B"). */
  text?: string;
  /** Divider rendered immediately AFTER this control. */
  dividerAfter?: boolean;
}

/**
 * Props every toolbar flyout component receives from the editor's
 * SelectionToolbarLayer host: the primary selection, the dispatcher, a
 * `close` callback, and the selection-wide style-apply helpers from
 * use-selection-toolbar. Flyouts pick the subset they need.
 */
export interface ToolbarFlyoutProps {
  primaryObject?: InteractiveCanvasObject;
  selectedConnection?: InteractiveCanvasConnection;
  dispatch: (action: CanvasAction) => void;
  close: () => void;
  applyPaletteTokenToSelection: (token: CanvasPaletteToken | undefined) => void;
  applySectionFillToSelection: (fill: string) => void;
  applySectionStrokeToSelection: (stroke: string) => void;
  applySectionBorderStyleToSelection: (strokeStyle: CanvasSectionStrokeStyle) => void;
  applyTintToSelection: (tint: CanvasSectionTint) => void;
  toggleLockForSelection: () => void;
  swapSelectedShape: (objectType: InteractiveCanvasObjectType) => void;
}

export interface ToolbarSpec {
  controls: readonly ToolbarControlSpec[];
  /**
   * Flyout components keyed by the action id that opens them. May include
   * flyouts with no backing control (section's "tint" is opened from the
   * context menu, not a toolbar button).
   */
  flyouts?: Readonly<Record<string, ComponentType<ToolbarFlyoutProps>>>;
}

/** Type-level defaults, the registry-side replacement for state/actions/defaults.ts (wired in step 6). */
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
   * style block. CanvasStage composes its style tag as: shared base block
   * (rules that deliberately stay there — e.g. the sticky-body cascade
   * exception) + the concatenated `css` of every registered def.
   */
  css: string;
  defaults: ObjectDefaults;
  handles: ObjectHandles;
  hitTest: ObjectHitTest;
  dragCapture: ObjectDragCapture;
  labelEditing: LabelEditingSpec;
  /** This kind's selection toolbar (step 5): control list + flyout components. */
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
 * import). The mass conversion is complete: every object kind renders
 * through a registered def; the `undefined` fallback in `objectDefFor` only
 * fires for a render shape with no registered def (today solely an explicit
 * `style.shape: "section"` on a non-section object), reproducing the old
 * generic default chrome (see render/ObjectShape.tsx).
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
  // Selection-kind def (connections aren't objects): carries the connector
  // toolbar; css is empty and objectDefForType never resolves to it since
  // "connector" is not an InteractiveCanvasObjectType.
  connectorDef,
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

const DEFS_BY_KIND = new Map(OBJECT_DEFS.map((def) => [def.kind, def]));

/**
 * Behavior lookup: the flags (`handles`/`hitTest`/`dragCapture`/`labelEditing`)
 * belong to the object TYPE, unlike render dispatch (`objectDefFor` above),
 * which keys on the effective `style.shape` (only `section` render-dispatches
 * by type). Every InteractiveCanvasObjectType has a def whose `kind` is the
 * type, so this only returns `undefined` for non-type kinds (e.g. a future
 * connector def) or out-of-vocabulary strings.
 */
export function objectDefForType(type: InteractiveCanvasObjectType): ObjectDef | undefined {
  return DEFS_BY_KIND.get(type);
}

/** Concatenated per-kind CSS of every registered def, appended to CanvasStage's style tag. */
export const OBJECT_DEFS_CSS: string = OBJECT_DEFS.map((def) => def.css).join("");

/**
 * Capability-intersection for the multi-select toolbar (step 5): the first
 * def's controls (order donor) filtered to actions present in EVERY selected
 * def's control set. Defs without a toolbar contribute nothing, so any
 * toolbar-less def collapses the intersection to empty.
 */
export function intersectToolbarControls(defs: readonly ObjectDef[]): ToolbarControlSpec[] {
  const [first, ...rest] = defs;
  if (!first?.toolbar) return [];
  return first.toolbar.controls.filter((control) =>
    rest.every((def) =>
      def.toolbar?.controls.some((candidate) => candidate.action === control.action),
    ),
  );
}

export { connectorDef };
