"use client";

import type { ComponentType, MouseEvent as ReactMouseEvent } from "react";
import type { CanvasBounds } from "../state/geometry";
import type {
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../state/schema";
import type { ObjectTypeDefaults } from "../state/schema/object-defaults";
import type { OutlineSpec } from "./geometry";
import type { TextSlot } from "./text-slots";
import { connectorDef } from "./connector/def";
import { sectionDef } from "./section/def";
import { stickyDef } from "./sticky/def";
import { arrowShapeDef } from "./shapes/basic/arrow-shape";
import { chevronDef } from "./shapes/basic/chevron";
import { decisionDef } from "./shapes/basic/decision";
import { ellipseDef } from "./shapes/basic/ellipse";
import { octagonDef } from "./shapes/basic/octagon";
import { pentagonDef } from "./shapes/basic/pentagon";
import { plusDef } from "./shapes/basic/plus";
import { processDef } from "./shapes/basic/process";
import { rectangleDef } from "./shapes/basic/rectangle";
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
import { pillDef } from "./shapes/misc/pill";

/**
 * Tier 1 of the two-tier object/shape registry (RESTRUCTURE.md, "The two-tier
 * registry"). An ObjectDef is the behavior contract for one KIND of thing
 * that behaves differently on the canvas — section and sticky are first-class
 * specials; the ~40 uniform shapes share ONE behavior and get their ObjectDef
 * generated from a ShapeDef via `objects/shapes/base.tsx`.
 *
 * Every field is CONSUMED from the registry: `render`, `css`, the className
 * carried by the render path, `handles`/`dragCapture` (interaction/core.ts,
 * hit-testing.ts, gestures/move.ts, SelectionBox — cf3aec8), `toolbar` (the
 * selection-toolbar layer's use-selection-toolbar.ts — 4c0d62d),
 * `textSlot`/`textEditing` (P2: at-rest renderer + in-place editor overlay),
 * `outline` (P3: anchors/dots/snap/hit-testing via objects/geometry.ts),
 * `defaults` (P4: stamped from the schema-vocabulary leaf
 * state/schema/object-defaults.ts — the same rows the reducer's creation/
 * swap paths read), and `catalog` (P4: the Shapes-panel catalog derives its
 * entry labels/keywords from the def).
 *
 * Connectors are NOT objects (D19): they have their own small ConnectorDef
 * below — ObjectDef carries no connector stub fields.
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
  /** Current viewport zoom — used to counter-scale zoom-invariant chrome (the section title chip). */
  zoom?: number;
  /** True while this object's text is being edited in place (D14) — hides the at-rest text so the editor is the only visible copy. */
  hideText?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}

/** Resize-handle set: full 8-handle compass, corner-only (sections), or none. */
export type ObjectHandles = "all" | "corners" | "none";

/**
 * What a drag of this object carries along: persisted `parentId` descendants
 * (sections — membership is auto-managed on drop), or nothing.
 */
export type ObjectDragCapture = "descendants" | "none";

/**
 * In-place text editing (D14). The old per-field target ("label" /
 * "section-title" / "body") died with the single `text` field — the def keeps
 * only whether double-click / the toolbar "text" action opens the editor.
 * WHERE editing happens is the def's `textSlot`: the editor overlay is
 * positioned and typographically styled from the SAME slot preset the
 * renderer uses, so at rest and mid-edit are pixel-identical (caret aside).
 * `markdown` is intentionally opt-in, because only sticky owns the closed D18
 * grammar and the source-offset decoration machinery needed for live preview.
 */
export interface TextEditingSpec {
  editable: boolean;
  markdown?: boolean;
}

/**
 * Selection-toolbar contract (step 5, made DATA-ONLY by the co-location
 * alignment): each def owns its ordered control list and nothing else. Specs
 * are ICON-FREE and COMPONENT-FREE — the editor's SelectionToolbar host
 * resolves each action id to its icon, and the flyout components those
 * controls open live in editor/features/selection-toolbar/flyouts/ (keyed by
 * def kind + action id), so objects/ never imports interface JSX.
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

export interface ToolbarSpec {
  controls: readonly ToolbarControlSpec[];
}

/**
 * Catalog metadata (P4, O7): the def is the single source for the picker's
 * per-shape identity — `label` is the picker-facing display string (sentence
 * case, may differ from the type label in state/schema/object-defaults.ts),
 * `keywords` feed shape search. objects/catalog.ts derives its entries from
 * this; only the ARRANGEMENT (category grouping, ordering, direction/icon
 * placement variants) stays catalog-side.
 */
export interface ObjectCatalogMeta {
  label: string;
  keywords?: readonly string[];
}

/**
 * Which palette role table this kind's `object.color` pick resolves through
 * (P1, OBJECT-DEF-OVERHAUL.md §3.5, D1/D12): the roster is universal (all
 * 10 hue picks, identical previews), the role decides rendering — shape =
 * fill+border pair, sticky = exact fill hex, section = tint + title chip.
 * (Connectors resolve through the separate "connector" role cells via
 * ConnectorDef.colorRole, D19.)
 */
export type ObjectColorRole = "shape" | "sticky" | "section";
export type ObjectButtonBorderPolicy = "painted" | "suppressed";

export interface ObjectDef {
  /** Registry key — the object `type` (every registered def's kind is an InteractiveCanvasObjectType). */
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
  /**
   * Per-type creation/placement defaults (P4): stamped VERBATIM from the
   * schema-vocabulary leaf (state/schema/object-defaults.ts, the same rows
   * the reducer reads — state/ can't import objects/, so the data lives
   * below both and the registry carries it upward). Identity-locked by
   * objects/__tests__/type-defaults.test.ts.
   */
  defaults: ObjectTypeDefaults;
  /** Palette role table this kind's color pick renders through (P1, §3.5). */
  colorRole: ObjectColorRole;
  /** Whether the outer button itself contributes a CSS border/padding-box inset. */
  buttonBorder: ObjectButtonBorderPolicy;
  /**
   * The kind's geometric outline (P3, D4 — objects/geometry.ts): connection
   * anchors, anchor dots, outline snap, and pointer hit-testing (D16) all
   * derive from it. Bbox for everything but the true-outline shapes; a
   * true-outline def must reference the SAME exported spec object the
   * geometry dispatch tables use (identity-checked by
   * objects/__tests__/geometry-def-agreement.test.ts).
   */
  outline: OutlineSpec;
  handles: ObjectHandles;
  dragCapture: ObjectDragCapture;
  /**
   * Where and how this kind's `object.text` renders AND is edited (D3/D6/D14
   * — objects/text-slots.ts preset library). Absent = the kind renders no
   * object text at all (plus / or-junction / summing-junction glyphs).
   */
  textSlot?: TextSlot;
  textEditing: TextEditingSpec;
  /** This kind's selection toolbar (step 5): data-only control list. */
  toolbar?: ToolbarSpec;
  /** Picker metadata (P4, O7) — absent for kinds the Shapes panel never lists (section/sticky; icon entries derive from the glyph registry). */
  catalog?: ObjectCatalogMeta;
}

/**
 * Connector definition (P4, D19): connectors are what CONNECT objects, not
 * objects — connections draw through render/connectors/*, route through
 * routing/, and are selected as their own selection kind. Their def is
 * therefore honest and small: the selection toolbar it carries, the palette
 * role its `connection.color` pick resolves through, and where its label
 * lives (rendered AND edited at routeConnection().labelPoint — see
 * editor/features/text-editing/use-text-editing.ts).
 */
export interface ConnectorDef {
  kind: "connector";
  toolbar: ToolbarSpec;
  /** Connection color picks resolve through palette.ts's "connector" role cells (resolveConnectorStroke). */
  colorRole: "connector";
  /** Labels edit in place at the routed midpoint, not via an object text slot. */
  labelEditing: "routed-midpoint";
}

/**
 * The effective render shape ObjectShape dispatches on: `style.shape`, with
 * objects without an explicit shape defaulting to the rounded-rect chrome.
 */
export type RenderObjectShape = NonNullable<CanvasObjectStyle["shape"]>;

export function renderShapeFor(object: InteractiveCanvasObject): RenderObjectShape {
  return object.style?.shape ?? "rounded-rect";
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
 *    renderer checked before style.shape). `rectangle` deliberately is NOT
 *    type-keyed for RENDER dispatch: its rendering is purely style.shape-driven
 *    (an explicit non-default style.shape wins), so it flows through the
 *    render-shape table — typically to the rounded-rect def. Its ObjectDef
 *    still registers in OBJECT_DEFS to carry defaults and behavioral
 *    flags (the type-keyed BEHAVIOR lookup below, distinct from render
 *    dispatch).
 *  - everything else is dispatched on the effective render shape, so e.g. a
 *    `sticky`-typed object WITHOUT `style.shape: "note"` keeps falling
 *    through to the rounded-rect path exactly as before.
 */
const DEFS_BY_TYPE: Partial<Record<InteractiveCanvasObjectType, ObjectDef>> = {
  section: sectionDef,
};

const DEFS_BY_RENDER_SHAPE: Partial<Record<RenderObjectShape, ObjectDef>> = {
  note: stickyDef,
  "rounded-rect": processDef,
  ellipse: ellipseDef,
  diamond: decisionDef,
  marker: annotationMarkerDef,
  document: documentDef,
  database: databaseDef,
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

/** Registered defs in stylesheet order (their `css` is appended in this order). Objects only — the connector's ConnectorDef (D19) is not an ObjectDef and lives outside this registry. */
export const OBJECT_DEFS: readonly ObjectDef[] = [
  sectionDef,
  stickyDef,
  processDef,
  ellipseDef,
  rectangleDef,
  decisionDef,
  annotationMarkerDef,
  documentDef,
  databaseDef,
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
 * Behavior lookup: the flags (`handles`/`dragCapture`/`textEditing`)
 * belong to the object TYPE, unlike render dispatch (`objectDefFor` above),
 * which keys on the effective `style.shape` (only `section` render-dispatches
 * by type). Every InteractiveCanvasObjectType has a def whose `kind` is the
 * type, so this only returns `undefined` for out-of-vocabulary strings.
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

// The connector's honest small def (D19) — re-exported here because this
// module is the def-registry entry point consumers already import from,
// even though the ConnectorDef is deliberately NOT in OBJECT_DEFS.
export { connectorDef };
