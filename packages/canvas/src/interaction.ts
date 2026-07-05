"use client";

/**
 * Pure pointer-interaction state machine for the interactive canvas (PD2).
 *
 * Mirrors term-draw's draw-state.ts architecture: a thin DOM adapter (living in
 * InteractiveCanvasEditor.tsx) converts native pointer events into normalized,
 * world-space `CanvasPointerEvent`s; this module is the pure coordinator that
 * consumes them and emits typed `CanvasAction`s plus ephemeral overlay state
 * (marquee rect, snap guides, spacing hints, drop target). No DOM access here —
 * everything is testable with plain objects.
 */
import { defaultGeometryFor, objectTypeLabel, type CanvasAction, type CanvasSelection, type CanvasTool } from "./actions";
import { boundsForGeometries, boundsIntersect, createObjectId, normalizeBounds, sectionCaptureMembers, type CanvasBounds, type CanvasPoint } from "./geometry";
import { SECTION_CAPTURE_OVERLAP_THRESHOLD } from "./figjam-tokens";
import { resolveConnectionCascade } from "./connection-overlay";
import { nearestAnchor, pointForAnchor, type Anchor } from "./routing";
import type { CanvasGeometry, InteractiveCanvasDocument, InteractiveCanvasObject, InteractiveCanvasObjectType } from "./schema";
import {
  computeSnapCorrection,
  computeSnapGuides,
  computeSpacingHints,
  type DistributionGuideSegment,
  type SnapCorrection,
  type SnapGuide,
  type SpacingHint,
} from "./snapping";
import type { ViewportState } from "./viewport";

/** Minimum object size enforced by direct (handle) resize. */
export const MIN_DIRECT_RESIZE_SIZE = 48;

/** World-space drag threshold below which a press+release is treated as a click. */
const DRAG_THRESHOLD = 3;

/** Width (world units) of the border band on containers that is hittable for move/select. */
const CONTAINER_BORDER_BAND = 16;

/** Screen-space snap threshold (px); divided by zoom so snapping feels constant at any zoom. */
const SNAP_THRESHOLD_SCREEN_PX = 6;

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const RESIZE_HANDLES: ResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export type CanvasHit =
  | { kind: "canvas" }
  | { kind: "object"; objectId: string }
  | { kind: "handle"; objectId: string; handle: ResizeHandle }
  | { kind: "connection"; connectionId: string }
  | { kind: "endpoint"; connectionId: string; end: "from" | "to" }
  | { kind: "port"; objectId: string; anchor: Anchor };

export type CanvasPointerEventType = "down" | "move" | "up" | "cancel" | "double";

export type CanvasPointerEvent = {
  type: CanvasPointerEventType;
  world: CanvasPoint;
  screen: CanvasPoint;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  hit: CanvasHit;
};

// SnapGuide/SpacingHint are defined in snapping.ts (the pure computation module);
// re-exported here so callers of the interaction machine don't need a second import.
export type { SnapGuide, SpacingHint };

/**
 * Connect-target candidate hovered by an in-progress connector drag/create
 * gesture, resolved through the ported AFFiNE connection cascade (W3b —
 * connection-overlay.ts's resolveConnectionCascade):
 *
 *  - `snapKind: "anchor"` — the pointer snapped to one of the 4 cardinal port
 *    anchors (within 8 view px). `point` is the exact outline point;
 *    `position` is set only when that point is NOT the plain bbox side
 *    midpoint (true-outline shapes like arrow-shape), so rect-family anchors
 *    commit as pure `anchor` sides exactly as before.
 *  - `snapKind: "outline"` — snapped to the nearest point on the shape's real
 *    outline (within 8 world px), off-anchor. `position` carries the exact
 *    [0..1, 0..1] relative attach point that gets stored on the endpoint.
 *  - `snapKind: "inside"` — pointer is inside the shape beyond both snap
 *    radii; commits the coarse nearest `anchor` side only (pre-W3b behavior).
 *
 * `anchor` is always populated (coarse nearest side) so overlay code and the
 * routing fallback path never need to branch on kind.
 */
export type ConnectorAnchorCandidate = {
  objectId: string;
  anchor: Anchor;
  /** Exact world point the endpoint will visually attach at (anchor/outline snaps only). */
  point?: CanvasPoint;
  /** Relative [0..1, 0..1] attach point to store on the endpoint (outline snaps + non-bbox anchor points). */
  position?: [number, number];
  /** Which cascade step won. Absent only in legacy/test-constructed candidates. */
  snapKind?: "anchor" | "outline" | "inside";
};

/**
 * Ephemeral live-preview state for both connector-endpoint-drag (3.2.2, an
 * existing connection's "from"/"to" is reconnected) and connector-create
 * (3.3.2, a brand-new connector is dragged from an object's edge port).
 * `connectionId` is set only for the reconnect case; `fromObjectId`/`fromAnchor`
 * are set only for the create case.
 */
export type ConnectorDragOverlay = {
  connectionId?: string;
  end?: "from" | "to";
  fromObjectId?: string;
  fromAnchor?: Anchor;
  point: CanvasPoint;
  candidate?: ConnectorAnchorCandidate;
};

export type InteractionOverlay = {
  marquee?: CanvasBounds;
  guides?: SnapGuide[];
  /** Equal-spacing ("distribution") guides from the ported AFFiNE snap-overlay algorithm — see snapping.ts's computeSnapCorrection. Rendered in AFFiNE's magenta distribution color, distinct from `guides`' purple alignment color. */
  distributionGuides?: DistributionGuideSegment[];
  spacing?: SpacingHint[];
  dropTargetId?: string | null;
  connectorDrag?: ConnectorDragOverlay;
  /**
   * One-shot signal (4.2.1): a double-click resolved to "start editing this
   * object's label inline". Set for both the existing-object case (id already
   * known) and the empty-canvas case (id predicted via createObjectId using
   * the exact same deterministic logic canvas.addObject's reducer uses, so it
   * matches the id the reducer will actually assign). The editor should open
   * its inline label textarea for this id and then let the overlay go stale on
   * the next interaction event (this field is not "current state", just an
   * edge-triggered request).
   */
  editObjectLabelId?: string;
  /**
   * Seed label text for editObjectLabelId when the target object won't exist
   * in the document yet at the time the editor processes this overlay (the
   * empty-canvas double-click case dispatches canvas.addObject in the same
   * batch — React hasn't run the reducer yet). Existing-object double-click
   * omits this; the editor reads the current label from the document instead.
   */
  editObjectLabelSeed?: string;
  /** Ghost preview rect for an in-progress armed-tool placement drag (4.2.2). */
  placePreview?: CanvasBounds;
};

type PressPending = {
  kind: "pressing";
  startWorld: CanvasPoint;
  hit: CanvasHit;
  shiftKey: boolean;
  /** Selection to apply if the gesture resolves as a click (no drag threshold crossed). */
  clickSelection: CanvasSelection | null;
  /**
   * True when the pointer-down deliberately deferred the shift-toggle dispatch
   * (shift-clicking an object that was already selected — see stepFromIdle).
   * Only in this case should a sub-threshold release apply the deferred toggle;
   * otherwise the down-dispatch already applied the correct selection and
   * toggling again on release would double-toggle it back off.
   */
  deferredShiftToggle: boolean;
};

type MoveGesture = {
  kind: "move";
  startWorld: CanvasPoint;
  objectIds: string[];
  startGeometries: Record<string, CanvasGeometry>;
  hasEmitted: boolean;
  /** Container currently under the pointer (drop target), tracked for release-time canvas.setParent. */
  dropTargetId: string | null;
};

type ResizeGesture = {
  kind: "resize";
  startWorld: CanvasPoint;
  objectId: string;
  handle: ResizeHandle;
  startGeometry: CanvasGeometry;
  hasEmitted: boolean;
};

type MarqueeGesture = {
  kind: "marquee";
  startWorld: CanvasPoint;
  currentWorld: CanvasPoint;
  additive: boolean;
};

/**
 * Armed-tool object creation (4.2.2): pointer-down with a creatable tool armed
 * (container/process/decision/text/sticky/source-node/annotation-marker)
 * starts this gesture over empty canvas. A sub-threshold release creates a
 * default-size object centered at the point; a drag creates an object sized
 * to the normalized, min-size-clamped dragged rect. Either way, on completion
 * the tool reverts to "select" and the new object becomes the selection.
 */
type PlaceGesture = {
  kind: "place";
  tool: CanvasTool;
  objectType: InteractiveCanvasObjectType;
  startWorld: CanvasPoint;
  currentWorld: CanvasPoint;
};

/** Dragging an existing connection's endpoint handle to reconnect it (3.2.2). */
type ConnectorEndpointDragGesture = {
  kind: "connector-endpoint-drag";
  connectionId: string;
  end: "from" | "to";
  /** The other (unmoved) endpoint's objectId — excluded from candidate hit-testing to prevent self-loops. */
  otherObjectId: string;
  point: CanvasPoint;
  candidate?: ConnectorAnchorCandidate;
};

/** Dragging a brand-new connector from an object's edge port (3.3.2). */
type ConnectorCreateGesture = {
  kind: "connector-create";
  fromObjectId: string;
  fromAnchor: Anchor;
  point: CanvasPoint;
  candidate?: ConnectorAnchorCandidate;
};

export type InteractionState =
  | { kind: "idle" }
  | PressPending
  | MoveGesture
  | ResizeGesture
  | MarqueeGesture
  | PlaceGesture
  | ConnectorEndpointDragGesture
  | ConnectorCreateGesture;

export const IDLE_INTERACTION_STATE: InteractionState = { kind: "idle" };

export type InteractionContext = {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  tool: CanvasTool;
  viewport: ViewportState;
  /**
   * Optional hook (checkpoint 1, T1.2.2) letting the host inject a snap
   * correction into the drag COMMIT itself, not just the overlay guides.
   * Called with the dragged set's current (pre-snap) union bounds and the
   * live zoom; returns the closest-wins SnapCorrection to apply, or null for
   * no snap. Only consulted by the move gesture's live-drag branch — resize
   * keeps its own handle-aware snap logic (computeSnapGuides) unchanged, and
   * the Escape-restore / pointercancel path always restores `startGeometries`
   * captured before any snap correction, so a snapResolver can never leak into
   * cancelled-drag geometry. Pure from this module's point of view: the host
   * builds the resolver (typically wrapping computeSnapGuides over the
   * current document + candidates) and passes it in fresh each step.
   */
  snapResolver?: (candidateBounds: CanvasBounds, zoom: number) => SnapCorrection | null;
};

export type InteractionResult = {
  state: InteractionState;
  dispatch: CanvasAction[];
  overlay: InteractionOverlay;
};

function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

function worldDistance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function objectGeometryMap(
  document: InteractiveCanvasDocument,
  objectIds: string[],
): Record<string, CanvasGeometry> {
  const ids = new Set(objectIds);
  const result: Record<string, CanvasGeometry> = {};
  for (const object of document.objects) {
    if (ids.has(object.id)) result[object.id] = object.geometry;
  }
  return result;
}

/**
 * Returns descendants (transitively) of `containerId`, not including itself.
 */
function descendantIds(document: InteractiveCanvasDocument, containerId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const object of document.objects) {
    if (!object.parentId) continue;
    const list = children.get(object.parentId) ?? [];
    list.push(object.id);
    children.set(object.parentId, list);
  }
  const result = new Set<string>();
  const stack = [...(children.get(containerId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

/**
 * Hit-tests world point against document objects, topmost-first (later objects in
 * the array render on top, mirroring CanvasStage's render order). Containers are
 * only hittable on their border band so interior clicks fall through to children
 * (matching FigJam: a container's interior is "see-through" for pointer purposes).
 */
export function hitTestObjects(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
): InteractiveCanvasObject | null {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index]!;
    const { x, y, width, height } = object.geometry;
    const inside =
      worldPoint.x >= x && worldPoint.x <= x + width && worldPoint.y >= y && worldPoint.y <= y + height;
    if (!inside) continue;
    if (object.type !== "container") return object;
    // Container: only the border band is hittable; interior is pass-through.
    const band = CONTAINER_BORDER_BAND;
    const onBorderBand =
      worldPoint.x <= x + band ||
      worldPoint.x >= x + width - band ||
      worldPoint.y <= y + band ||
      worldPoint.y >= y + height - band;
    if (onBorderBand) return object;
    // Inside the container interior but not on the band: keep searching
    // underneath in case a child object is rendered before/behind (topmost
    // search already covers ordering — here we just skip the container itself).
  }
  return null;
}

/** Reuses boundsForGeometries to compute the union bounds of a selection. */
export function selectionBounds(
  document: InteractiveCanvasDocument,
  objectIds: string[],
): CanvasBounds | null {
  const geometries = document.objects
    .filter((object) => objectIds.includes(object.id))
    .map((object) => object.geometry);
  return boundsForGeometries(geometries);
}

/**
 * Candidate bounds for live snap guides while dragging `objectIds`: siblings
 * sharing the dragged set's parent, plus every container (containers act as
 * alignment targets regardless of nesting level), excluding the dragged
 * objects themselves.
 */
function gatherSnapCandidates(
  document: InteractiveCanvasDocument,
  objectIds: string[],
): CanvasBounds[] {
  const draggedIds = new Set(objectIds);
  const parentIds = new Set(
    document.objects
      .filter((object) => draggedIds.has(object.id))
      .map((object) => object.parentId ?? null),
  );
  const candidates = new Map<string, CanvasBounds>();
  for (const object of document.objects) {
    if (draggedIds.has(object.id)) continue;
    const isSibling = parentIds.has(object.parentId ?? null);
    const isContainer = object.type === "container";
    if (!isSibling && !isContainer) continue;
    candidates.set(object.id, object.geometry);
  }
  return Array.from(candidates.values());
}

/**
 * Hit-tests world point against container objects only (full container area,
 * not just the border band — used for drop targeting during a move gesture),
 * excluding `excludeIds` (the dragged objects and their descendants) so a
 * container can't be dropped into itself or into one of its own children.
 * Topmost-first, matching hitTestObjects ordering.
 */
export function hitTestDropTarget(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
  excludeIds: Set<string>,
): InteractiveCanvasObject | null {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index]!;
    if (object.type !== "container") continue;
    if (excludeIds.has(object.id)) continue;
    const { x, y, width, height } = object.geometry;
    const inside =
      worldPoint.x >= x && worldPoint.x <= x + width && worldPoint.y >= y && worldPoint.y <= y + height;
    if (inside) return object;
  }
  return null;
}

/**
 * Applies a resize handle drag to a start geometry, anchoring the opposite edge/
 * corner and clamping both dimensions to `minSize`.
 */
export function applyResizeHandle(
  startGeometry: CanvasGeometry,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize: number = MIN_DIRECT_RESIZE_SIZE,
): CanvasGeometry {
  const left = startGeometry.x;
  const top = startGeometry.y;
  const right = startGeometry.x + startGeometry.width;
  const bottom = startGeometry.y + startGeometry.height;

  let newLeft = left;
  let newTop = top;
  let newRight = right;
  let newBottom = bottom;

  const affectsWest = handle === "w" || handle === "nw" || handle === "sw";
  const affectsEast = handle === "e" || handle === "ne" || handle === "se";
  const affectsNorth = handle === "n" || handle === "nw" || handle === "ne";
  const affectsSouth = handle === "s" || handle === "sw" || handle === "se";

  if (affectsWest) newLeft = left + dx;
  if (affectsEast) newRight = right + dx;
  if (affectsNorth) newTop = top + dy;
  if (affectsSouth) newBottom = bottom + dy;

  // Clamp so the moving edge cannot cross the anchored opposite edge/corner
  // beyond minSize.
  if (affectsWest && newRight - newLeft < minSize) newLeft = newRight - minSize;
  if (affectsEast && newRight - newLeft < minSize) newRight = newLeft + minSize;
  if (affectsNorth && newBottom - newTop < minSize) newTop = newBottom - minSize;
  if (affectsSouth && newBottom - newTop < minSize) newBottom = newTop + minSize;

  return {
    x: newLeft,
    y: newTop,
    width: newRight - newLeft,
    height: newBottom - newTop,
  };
}

export function resizeCursorFor(handle: ResizeHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
    default:
      return "nwse-resize";
  }
}

function emptyOverlay(): InteractionOverlay {
  return {};
}

/**
 * Default-size geometry for a newly created object of `type`, centered at
 * `point` (world space). Reuses defaultGeometryFor's width/height (its x/y are
 * placeholder defaults, discarded here) so double-click creation (4.2.1) and
 * armed-tool click creation (4.2.2) share one sizing source of truth instead
 * of each re-deriving per-type dimensions.
 */
export function defaultGeometryForPlacement(
  type: InteractiveCanvasObjectType,
  point: CanvasPoint,
): CanvasGeometry {
  const { width, height } = defaultGeometryFor(type);
  return { x: point.x - width / 2, y: point.y - height / 2, width, height };
}

function toIdle(): InteractionResult {
  return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
}

/** Maps an "armed" creation tool to the object type it creates; null for select/hand (and the stale "annotation" tool). */
function objectTypeForTool(tool: CanvasTool): InteractiveCanvasObjectType | null {
  switch (tool) {
    case "container":
    case "process":
    case "decision":
    case "text":
    case "sticky":
    case "source-node":
    case "annotation-marker":
    // D16 — these were previously missing from this switch, meaning an
    // armed document/person/database/chat tool silently failed to start a
    // PlaceGesture; fixed here alongside the W2 additions below since it's
    // the same one-line pattern in the same switch.
    case "document":
    case "person":
    case "database":
    case "chat":
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    case "section":
    case "pill":
    case "arrow-shape":
    case "predefined-process":
    case "code-block":
    case "chip-icon":
      return tool;
    default:
      return null;
  }
}

const MIN_PLACE_DRAG_SIZE = 24;

function isSelected(selection: CanvasSelection, objectId: string): boolean {
  return selection.kind === "objects" && selection.objectIds.includes(objectId);
}

function toggleSelection(selection: CanvasSelection, objectId: string): CanvasSelection {
  const current = selectedObjectIds(selection);
  const next = current.includes(objectId)
    ? current.filter((id) => id !== objectId)
    : [...current, objectId];
  return { kind: "objects", objectIds: next };
}

/**
 * The core reducer: given the current interaction state, a normalized pointer
 * event, and read-only context (document/selection/tool/viewport), returns the
 * next interaction state plus any CanvasActions to dispatch and the ephemeral
 * overlay to render this frame.
 */
export function stepInteraction(
  state: InteractionState,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  switch (state.kind) {
    case "idle":
      return stepFromIdle(state, event, ctx);
    case "pressing":
      return stepFromPressing(state, event, ctx);
    case "move":
      return stepFromMove(state, event, ctx);
    case "resize":
      return stepFromResize(state, event, ctx);
    case "marquee":
      return stepFromMarquee(state, event, ctx);
    case "place":
      return stepFromPlace(state, event, ctx);
    case "connector-endpoint-drag":
      return stepFromConnectorEndpointDrag(state, event, ctx);
    case "connector-create":
      return stepFromConnectorCreate(state, event, ctx);
    default:
      return toIdle();
  }
}

function stepFromIdle(
  _state: InteractionState,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") return toIdle();

  if (event.type === "double") {
    // Double-click on an existing object: start editing its label inline (the
    // id is already known). Double-click on empty canvas: create a new text
    // object centered at the click point and immediately start editing its
    // label — typing starts right away, mirroring FigJam's "type anywhere"
    // affordance. The new object's id is predicted with the exact same
    // deterministic createObjectId() call canvas.addObject's reducer makes,
    // so this machine (which never mutates the document itself) can request
    // the label editor open for the correct id without waiting on a render.
    if (event.hit.kind === "object") {
      return {
        state: IDLE_INTERACTION_STATE,
        dispatch: [],
        overlay: { editObjectLabelId: event.hit.objectId },
      };
    }
    if (event.hit.kind === "canvas") {
      const label = objectTypeLabel("text");
      const predictedId = createObjectId(ctx.document, label);
      const geometry = defaultGeometryForPlacement("text", event.world);
      return {
        state: IDLE_INTERACTION_STATE,
        dispatch: [
          {
            type: "canvas.addObject",
            objectType: "text",
            label,
            geometry,
          },
        ],
        overlay: { editObjectLabelId: predictedId, editObjectLabelSeed: label },
      };
    }
    return toIdle();
  }

  if (event.type !== "down") return toIdle();
  if (event.button !== 0) return toIdle();

  if (event.hit.kind === "handle") {
    const hit = event.hit;
    const object = ctx.document.objects.find((candidate) => candidate.id === hit.objectId);
    if (!object) return toIdle();
    const pending: ResizeGesture = {
      kind: "resize",
      startWorld: event.world,
      objectId: object.id,
      handle: hit.handle,
      startGeometry: object.geometry,
      hasEmitted: false,
    };
    // Enter "pressing" until the 3px threshold is crossed, but resize handles
    // commit to resize immediately (they're small targets; no click semantics).
    return { state: pending, dispatch: [], overlay: emptyOverlay() };
  }

  if (event.hit.kind === "endpoint") {
    const hit = event.hit;
    const connection = ctx.document.connections.find((candidate) => candidate.id === hit.connectionId);
    if (!connection) return toIdle();
    const otherObjectId = hit.end === "from" ? connection.to.objectId : connection.from.objectId;
    const pending: ConnectorEndpointDragGesture = {
      kind: "connector-endpoint-drag",
      connectionId: hit.connectionId,
      end: hit.end,
      otherObjectId,
      point: event.world,
    };
    // Small handle target; commits to the drag gesture immediately (no click
    // semantics), mirroring resize handles above.
    return { state: pending, dispatch: [], overlay: { connectorDrag: pending } };
  }

  if (event.hit.kind === "port") {
    const hit = event.hit;
    const pending: ConnectorCreateGesture = {
      kind: "connector-create",
      fromObjectId: hit.objectId,
      fromAnchor: hit.anchor,
      point: event.world,
    };
    return { state: pending, dispatch: [], overlay: { connectorDrag: pending } };
  }

  // An armed creation tool (4.2.2) takes priority over ordinary object/
  // connection selection — clicking or dragging anywhere on the canvas while
  // a shape tool is armed places a new object there, matching FigJam's "tool
  // stays committed until you draw with it" feel. Resize handles, connector
  // endpoints, and edge ports (handled above) never render while a creation
  // tool is armed (those affordances are select-mode-only), so this is safe.
  const armedObjectTypeForClick = objectTypeForTool(ctx.tool);
  if (armedObjectTypeForClick && (event.hit.kind === "object" || event.hit.kind === "connection")) {
    const pending: PlaceGesture = {
      kind: "place",
      tool: ctx.tool,
      objectType: armedObjectTypeForClick,
      startWorld: event.world,
      currentWorld: event.world,
    };
    return {
      state: pending,
      dispatch: [],
      overlay: { placePreview: defaultGeometryForPlacement(armedObjectTypeForClick, event.world) },
    };
  }

  if (event.hit.kind === "connection") {
    const connectionId = event.hit.connectionId;
    const pending: PressPending = {
      kind: "pressing",
      startWorld: event.world,
      hit: event.hit,
      shiftKey: event.shiftKey,
      clickSelection: { kind: "connection", connectionId },
      deferredShiftToggle: false,
    };
    return {
      state: pending,
      dispatch: [{ type: "canvas.select", selection: { kind: "connection", connectionId } }],
      overlay: emptyOverlay(),
    };
  }

  if (event.hit.kind === "object") {
    const objectId = event.hit.objectId;
    const alreadySelected = isSelected(ctx.selection, objectId);
    const clickSelection: CanvasSelection = event.shiftKey
      ? toggleSelection(ctx.selection, objectId)
      : { kind: "objects", objectIds: [objectId] };
    // Objects that are already part of a multi-selection drag together;
    // otherwise a plain click-drag operates on just this object (selection is
    // finalized on release if the gesture resolves as a click).
    const dragObjectIds =
      !event.shiftKey && alreadySelected && selectedObjectIds(ctx.selection).length > 1
        ? selectedObjectIds(ctx.selection)
        : [objectId];
    // Pre-select immediately (matches existing click-to-select feel) unless
    // shift-clicking an object that's already selected — in that case, defer
    // the toggle until release so a shift-drag of a multi-selection doesn't
    // instantly drop a member.
    const deferredShiftToggle = event.shiftKey && alreadySelected;
    const pending: PressPending = {
      kind: "pressing",
      startWorld: event.world,
      hit: event.hit,
      shiftKey: event.shiftKey,
      clickSelection,
      deferredShiftToggle,
    };
    const dispatch: CanvasAction[] = deferredShiftToggle
      ? []
      : [{ type: "canvas.select", selection: { kind: "objects", objectIds: dragObjectIds } }];
    return { state: pending, dispatch, overlay: emptyOverlay() };
  }

  // Canvas (empty space) pointer-down with an armed creation tool (4.2.2):
  // start a place gesture. A sub-threshold release creates a default-size
  // object at the point; a drag creates a rect sized to the drag.
  const armedObjectType = objectTypeForTool(ctx.tool);
  if (armedObjectType) {
    const pending: PlaceGesture = {
      kind: "place",
      tool: ctx.tool,
      objectType: armedObjectType,
      startWorld: event.world,
      currentWorld: event.world,
    };
    return {
      state: pending,
      dispatch: [],
      overlay: { placePreview: defaultGeometryForPlacement(armedObjectType, event.world) },
    };
  }

  // Canvas (empty space) pointer-down.
  if (ctx.tool === "select" || ctx.tool === "hand") {
    const pending: PressPending = {
      kind: "pressing",
      startWorld: event.world,
      hit: { kind: "canvas" },
      shiftKey: event.shiftKey,
      clickSelection: { kind: "none" },
      deferredShiftToggle: false,
    };
    return { state: pending, dispatch: [], overlay: emptyOverlay() };
  }

  return toIdle();
}

function stepFromPressing(
  state: PressPending,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") return toIdle();

  if (event.type === "up") {
    // Sub-threshold release: resolve as a click.
    if (state.clickSelection) {
      if (state.hit.kind === "object" && state.deferredShiftToggle) {
        // Deferred shift-toggle (see stepFromIdle) for already-selected objects.
        return {
          state: IDLE_INTERACTION_STATE,
          dispatch: [
            { type: "canvas.select", selection: toggleSelection(ctx.selection, state.hit.objectId) },
          ],
          overlay: emptyOverlay(),
        };
      }
      if (state.hit.kind === "canvas") {
        return {
          state: IDLE_INTERACTION_STATE,
          dispatch: [{ type: "canvas.select", selection: { kind: "none" } }],
          overlay: emptyOverlay(),
        };
      }
    }
    return toIdle();
  }

  if (event.type !== "move") return toIdle();

  const distance = worldDistance(state.startWorld, event.world);
  if (distance < DRAG_THRESHOLD) {
    return { state, dispatch: [], overlay: emptyOverlay() };
  }

  // Threshold crossed: transition into the appropriate gesture.
  if (state.hit.kind === "object") {
    const alreadySelected = isSelected(ctx.selection, state.hit.objectId);
    const dragObjectIds =
      !state.shiftKey && alreadySelected && selectedObjectIds(ctx.selection).length > 1
        ? selectedObjectIds(ctx.selection)
        : [state.hit.objectId];
    // FigJam section capture (W2): dragging a section also carries every
    // object positionally "inside" it (recursively, including nested
    // sections' own members) — computed once, right here, at drag-start, and
    // simply folded into the same objectIds/startGeometries the generic move
    // machinery already drags/snaps/undoes as a single unit. No new gesture
    // kind or history plumbing needed.
    const expandedObjectIds = new Set(dragObjectIds);
    for (const id of dragObjectIds) {
      const object = ctx.document.objects.find((candidate) => candidate.id === id);
      if (object?.type !== "section") continue;
      for (const memberId of sectionCaptureMembers(
        ctx.document,
        id,
        SECTION_CAPTURE_OVERLAP_THRESHOLD,
      )) {
        expandedObjectIds.add(memberId);
      }
    }
    const finalObjectIds = Array.from(expandedObjectIds);
    const startGeometries = objectGeometryMap(ctx.document, finalObjectIds);
    const moveState: MoveGesture = {
      kind: "move",
      startWorld: state.startWorld,
      objectIds: finalObjectIds,
      startGeometries,
      hasEmitted: false,
      dropTargetId: null,
    };
    return stepFromMove(moveState, event, ctx);
  }

  if (state.hit.kind === "canvas" && ctx.tool === "select") {
    const marqueeState: MarqueeGesture = {
      kind: "marquee",
      startWorld: state.startWorld,
      currentWorld: event.world,
      additive: state.shiftKey,
    };
    return stepFromMarquee(marqueeState, event, ctx, /* alreadyEntered */ true);
  }

  return toIdle();
}

/**
 * The single shared parentId of the dragged set, or null if they don't share
 * one (mixed parents never happens today since multi-drag only groups an
 * existing selection, but guard defensively): returns null when there's no
 * single common parent, matching "drop on open canvas" semantics.
 */
function currentParentId(document: InteractiveCanvasDocument, objectIds: string[]): string | null {
  const parents = new Set(
    document.objects
      .filter((object) => objectIds.includes(object.id))
      .map((object) => object.parentId ?? null),
  );
  if (parents.size !== 1) return null;
  return parents.values().next().value ?? null;
}

function stepFromMove(
  state: MoveGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") {
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.updateObjectGeometries",
          geometries: state.startGeometries,
          recordHistory: false,
          snap: false,
          summary: "Cancelled drag",
        },
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type === "up") {
    const parentId = currentParentId(ctx.document, state.objectIds);
    const dispatch: CanvasAction[] =
      state.dropTargetId !== parentId
        ? [{ type: "canvas.setParent", objectIds: state.objectIds, parentId: state.dropTargetId }]
        : [];
    return { state: IDLE_INTERACTION_STATE, dispatch, overlay: emptyOverlay() };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: emptyOverlay() };

  const dx = event.world.x - state.startWorld.x;
  const dy = event.world.y - state.startWorld.y;
  const rawGeometries: Record<string, CanvasGeometry> = {};
  for (const objectId of state.objectIds) {
    const startGeometry = state.startGeometries[objectId];
    if (!startGeometry) continue;
    rawGeometries[objectId] = {
      ...startGeometry,
      x: startGeometry.x + dx,
      y: startGeometry.y + dy,
    };
  }

  // Live snap guides: compare the dragged set's union bounds against siblings
  // + containers, then apply the resulting correction uniformly to every
  // dragged object so relative offsets within a multi-selection are preserved.
  // ctx.snapResolver (T1.2.2) lets the host override/extend this closest-wins
  // computation (e.g. with a different candidate set) — when supplied, it wins;
  // otherwise this module falls back to computeSnapCorrection (Wave 3b), which
  // composes point/edge alignment with the ported AFFiNE equal-spacing
  // ("distribution") snap, so the machine keeps working correctly — now with
  // distribution snapping included — even for callers/tests that never
  // provide the hook. Either way the offset is applied uniformly below, and
  // startGeometries (captured before this function ever runs) is what Escape/
  // cancel restores, so a snap correction can never leak into cancelled-drag
  // geometry.
  const movingBounds = boundsForGeometries(Object.values(rawGeometries));
  const candidates = gatherSnapCandidates(ctx.document, state.objectIds);
  const threshold = SNAP_THRESHOLD_SCREEN_PX / ctx.viewport.zoom;
  const resolverSnap = movingBounds ? ctx.snapResolver?.(movingBounds, ctx.viewport.zoom) : null;
  const snap: SnapCorrection & { distributionGuides?: DistributionGuideSegment[] } = movingBounds
    ? (resolverSnap ?? computeSnapCorrection(movingBounds, candidates, threshold, ctx.viewport.zoom))
    : { dx: 0, dy: 0, guides: [] };

  const geometries: Record<string, CanvasGeometry> = {};
  for (const [objectId, geometry] of Object.entries(rawGeometries)) {
    geometries[objectId] = {
      ...geometry,
      x: geometry.x + snap.dx,
      y: geometry.y + snap.dy,
    };
  }

  const spacing = movingBounds
    ? [
        ...computeSpacingHints(movingBounds, candidates, "x"),
        ...computeSpacingHints(movingBounds, candidates, "y"),
      ]
    : [];

  // Drop-target hit-testing: full container area (not just the border band),
  // excluding the dragged objects and their own descendants so a container
  // can't be dropped into itself or a child it contains.
  const excludeIds = new Set(state.objectIds);
  for (const objectId of state.objectIds) {
    for (const descendantId of descendantIds(ctx.document, objectId)) {
      excludeIds.add(descendantId);
    }
  }
  const snappedBounds = boundsForGeometries(Object.values(geometries));
  const dropTargetCenter = snappedBounds
    ? { x: snappedBounds.x + snappedBounds.width / 2, y: snappedBounds.y + snappedBounds.height / 2 }
    : event.world;
  const dropTarget = hitTestDropTarget(ctx.document, dropTargetCenter, excludeIds);

  const nextState: MoveGesture = {
    ...state,
    hasEmitted: true,
    dropTargetId: dropTarget?.id ?? null,
  };
  return {
    state: nextState,
    dispatch: [
      {
        type: "canvas.updateObjectGeometries",
        geometries,
        recordHistory: !state.hasEmitted,
        snap: false,
        summary: "Dragged selection",
      },
    ],
    overlay: {
      guides: snap.guides,
      distributionGuides: snap.distributionGuides,
      spacing,
      dropTargetId: dropTarget?.id ?? null,
    },
  };
}

function stepFromResize(
  state: ResizeGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") {
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.updateObjectGeometries",
          geometries: { [state.objectId]: state.startGeometry },
          recordHistory: false,
          snap: false,
          summary: "Cancelled resize",
        },
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type === "up") {
    return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: emptyOverlay() };

  const dx = event.world.x - state.startWorld.x;
  const dy = event.world.y - state.startWorld.y;
  const rawGeometry = applyResizeHandle(state.startGeometry, state.handle, dx, dy);

  // Live snap guides for resize: snap only the edges the handle actually
  // moves (the anchored opposite edge/corner must not move — applyResizeHandle
  // already clamps it, so we correct just the moving edge(s) toward alignment).
  const candidates = gatherSnapCandidates(ctx.document, [state.objectId]);
  const threshold = SNAP_THRESHOLD_SCREEN_PX / ctx.viewport.zoom;
  const snap = computeSnapGuides(rawGeometry, candidates, threshold);

  const affectsWest = state.handle === "w" || state.handle === "nw" || state.handle === "sw";
  const affectsEast = state.handle === "e" || state.handle === "ne" || state.handle === "se";
  const affectsNorth = state.handle === "n" || state.handle === "nw" || state.handle === "ne";
  const affectsSouth = state.handle === "s" || state.handle === "sw" || state.handle === "se";

  let geometry = rawGeometry;
  if (snap.dx !== 0 && (affectsWest || affectsEast)) {
    geometry = affectsWest
      ? { ...geometry, x: geometry.x + snap.dx, width: geometry.width - snap.dx }
      : { ...geometry, width: geometry.width + snap.dx };
  }
  if (snap.dy !== 0 && (affectsNorth || affectsSouth)) {
    geometry = affectsNorth
      ? { ...geometry, y: geometry.y + snap.dy, height: geometry.height - snap.dy }
      : { ...geometry, height: geometry.height + snap.dy };
  }
  geometry = {
    ...geometry,
    width: Math.max(MIN_DIRECT_RESIZE_SIZE, geometry.width),
    height: Math.max(MIN_DIRECT_RESIZE_SIZE, geometry.height),
  };

  const guides = snap.guides.filter((guide) => {
    if (guide.axis === "x") return affectsWest || affectsEast;
    return affectsNorth || affectsSouth;
  });

  const nextState: ResizeGesture = { ...state, hasEmitted: true };
  return {
    state: nextState,
    dispatch: [
      {
        type: "canvas.updateObjectGeometries",
        geometries: { [state.objectId]: geometry },
        recordHistory: !state.hasEmitted,
        snap: false,
        summary: "Resized object",
      },
    ],
    overlay: { guides },
  };
}

function objectsIntersectingBounds(
  document: InteractiveCanvasDocument,
  bounds: CanvasBounds,
): string[] {
  return document.objects
    .filter((object) => boundsIntersect(object.geometry, bounds))
    .map((object) => object.id);
}

function stepFromMarquee(
  state: MarqueeGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
  alreadyEntered = false,
): InteractionResult {
  if (event.type === "cancel") {
    return toIdle();
  }

  if (event.type === "up") {
    const bounds = normalizeBounds({
      x1: state.startWorld.x,
      y1: state.startWorld.y,
      x2: state.currentWorld.x,
      y2: state.currentWorld.y,
    });
    const intersecting = objectsIntersectingBounds(ctx.document, bounds);
    if (intersecting.length === 0) {
      return {
        state: IDLE_INTERACTION_STATE,
        dispatch: state.additive ? [] : [{ type: "canvas.select", selection: { kind: "none" } }],
        overlay: emptyOverlay(),
      };
    }
    const nextIds = state.additive
      ? Array.from(new Set([...selectedObjectIds(ctx.selection), ...intersecting]))
      : intersecting;
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [{ type: "canvas.select", selection: { kind: "objects", objectIds: nextIds } }],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") {
    const bounds = normalizeBounds({
      x1: state.startWorld.x,
      y1: state.startWorld.y,
      x2: state.currentWorld.x,
      y2: state.currentWorld.y,
    });
    return { state, dispatch: [], overlay: { marquee: bounds } };
  }

  const nextState: MarqueeGesture = { ...state, currentWorld: event.world };
  const bounds = normalizeBounds({
    x1: nextState.startWorld.x,
    y1: nextState.startWorld.y,
    x2: nextState.currentWorld.x,
    y2: nextState.currentWorld.y,
  });
  return { state: nextState, dispatch: [], overlay: { marquee: bounds } };
}

/**
 * Sizes/positions the ghost preview (and eventual created object) for a place
 * gesture: below the drag threshold it's the default-size box centered on the
 * start point (so a plain click still shows/creates a sensible default-sized
 * shape); past the threshold it's the normalized drag rect, clamped so neither
 * dimension collapses below MIN_PLACE_DRAG_SIZE.
 */
function placeGeometryFor(state: PlaceGesture): CanvasGeometry {
  const distance = worldDistance(state.startWorld, state.currentWorld);
  if (distance < DRAG_THRESHOLD) {
    return defaultGeometryForPlacement(state.objectType, state.startWorld);
  }
  const bounds = normalizeBounds({
    x1: state.startWorld.x,
    y1: state.startWorld.y,
    x2: state.currentWorld.x,
    y2: state.currentWorld.y,
  });
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, MIN_PLACE_DRAG_SIZE),
    height: Math.max(bounds.height, MIN_PLACE_DRAG_SIZE),
  };
}

/**
 * Armed-tool object creation (4.2.2). Tracks the pointer from the initial
 * down through move/up, always exposing a live `placePreview` ghost so the
 * editor can render an outline of what will be created. On release, finalizes
 * the object (click -> default size at point; drag -> normalized/clamped
 * rect), assigns parentId via the same full-bounds drop-target hit-test used
 * by drag-and-drop-into-container moves, dispatches the creation, reverts the
 * tool to "select" (canvas.addObject's reducer already selects the new
 * object), and returns to idle.
 */
function stepFromPlace(
  state: PlaceGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") {
    return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
  }

  if (event.type === "up") {
    const geometry = placeGeometryFor(state);
    const center: CanvasPoint = {
      x: geometry.x + geometry.width / 2,
      y: geometry.y + geometry.height / 2,
    };
    const dropTarget = hitTestDropTarget(ctx.document, center, new Set());
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.addObject",
          objectType: state.objectType,
          parentId: dropTarget?.id ?? null,
          geometry,
        },
        { type: "canvas.setTool", tool: "select" },
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") {
    return { state, dispatch: [], overlay: { placePreview: placeGeometryFor(state) } };
  }

  const nextState: PlaceGesture = { ...state, currentWorld: event.world };
  return { state: nextState, dispatch: [], overlay: { placePreview: placeGeometryFor(nextState) } };
}

/**
 * Resolves the connect-target under the pointer through the ported AFFiNE
 * connection cascade (W3b — connection-overlay.ts): anchor snap within 8 view
 * px, else nearest-outline-point snap within 8 world px, else inside-the-
 * shape, else no candidate. `document.objects` is passed in array order
 * (later = topmost, matching CanvasStage's render order) so an overlapping
 * upper object wins, and `excludeId` (the connector's other endpoint's
 * object) can never candidate-snap into a self-loop.
 *
 * The candidate always carries the coarse nearest `anchor` side; `position`
 * is set only when the exact snapped point is not the plain bbox side
 * midpoint (outline snaps, and anchor snaps on true-outline shapes like
 * arrow-shape) so pre-W3b anchor-only commits stay byte-identical for the
 * rect family.
 */
function connectorCandidateAt(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
  excludeId: string | null,
  zoom: number,
): ConnectorAnchorCandidate | undefined {
  const cascade = resolveConnectionCascade(
    worldPoint,
    document.objects,
    zoom,
    new Set(excludeId ? [excludeId] : []),
  );
  if (cascade.kind === "free") return undefined;

  const object = document.objects.find((item) => item.id === cascade.objectId);
  if (!object) return undefined;

  if (cascade.kind === "inside") {
    return {
      objectId: cascade.objectId,
      anchor: nearestAnchor(object.geometry, worldPoint),
      snapKind: "inside",
    };
  }

  const anchor = nearestAnchor(object.geometry, cascade.point);
  const canonical = pointForAnchor(object.geometry, anchor);
  const isCanonicalAnchorPoint =
    cascade.kind === "anchor" &&
    Math.abs(canonical.x - cascade.point.x) < 0.5 &&
    Math.abs(canonical.y - cascade.point.y) < 0.5;

  return {
    objectId: cascade.objectId,
    anchor,
    point: cascade.point,
    ...(isCanonicalAnchorPoint ? {} : { position: cascade.coord }),
    snapKind: cascade.kind,
  };
}

function stepFromConnectorEndpointDrag(
  state: ConnectorEndpointDragGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") return toIdle();

  if (event.type === "up") {
    const candidate = state.candidate;
    if (!candidate) {
      // Released on empty space (or back on the same/invalid spot): revert silently.
      return toIdle();
    }
    // Off-anchor drops (outline snaps + true-outline anchor points) carry the
    // exact [0..1, 0..1] `position`; plain bbox-anchor and inside drops stay
    // anchor-only, matching pre-W3b commit shapes (see ConnectorAnchorCandidate).
    const endpoint = {
      objectId: candidate.objectId,
      anchor: candidate.anchor,
      ...(candidate.position ? { position: candidate.position } : {}),
    };
    const patch = state.end === "from" ? { from: endpoint } : { to: endpoint };
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [{ type: "canvas.updateConnection", connectionId: state.connectionId, patch }],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: { connectorDrag: state } };

  const candidate = connectorCandidateAt(ctx.document, event.world, state.otherObjectId, ctx.viewport.zoom);
  const nextState: ConnectorEndpointDragGesture = { ...state, point: event.world, candidate };
  return { state: nextState, dispatch: [], overlay: { connectorDrag: nextState } };
}

function stepFromConnectorCreate(
  state: ConnectorCreateGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") return toIdle();

  if (event.type === "up") {
    const candidate = state.candidate;
    if (candidate) {
      return {
        state: IDLE_INTERACTION_STATE,
        dispatch: [
          {
            type: "canvas.addConnection",
            fromObjectId: state.fromObjectId,
            toObjectId: candidate.objectId,
            fromAnchor: state.fromAnchor,
            toAnchor: candidate.anchor,
            // Off-anchor drop: store the exact relative attach point (W3b).
            ...(candidate.position ? { toPosition: candidate.position } : {}),
          },
        ],
        overlay: emptyOverlay(),
      };
    }
    // Released on empty canvas: create-and-connect as a single history entry.
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.quickConnect",
          fromObjectId: state.fromObjectId,
          fromAnchor: state.fromAnchor,
          drop: { point: event.world },
        },
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: { connectorDrag: state } };

  const candidate = connectorCandidateAt(ctx.document, event.world, state.fromObjectId, ctx.viewport.zoom);
  const nextState: ConnectorCreateGesture = { ...state, point: event.world, candidate };
  return { state: nextState, dispatch: [], overlay: { connectorDrag: nextState } };
}

/**
 * Injectable scheduler shape for createFrameCoalescer — mirrors the subset of
 * window.requestAnimationFrame/cancelAnimationFrame the coalescer needs, so
 * tests can supply a deterministic fake instead of a real rAF loop.
 */
export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

const rafScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Handle returned by createFrameCoalescer — named so hosts can store one in a ref. */
export type FrameCoalescer<T> = {
  /** Records the latest value; schedules exactly one frame if none is pending. */
  push(value: T): void;
  /** Cancels any pending frame and synchronously commits the queued value, if any. */
  flush(): void;
  /** Cancels any pending frame WITHOUT committing. */
  cancel(): void;
  /** True while a frame is scheduled and waiting to commit. */
  readonly isPending: boolean;
};

/**
 * Coalesces a rapid stream of values (e.g. pointermove positions, wheel
 * deltas) down to at most one `commit` call per animation frame (checkpoint 1,
 * T1.1.1/T1.1.2). Every `push` overwrites the pending value and schedules a
 * frame only if one isn't already pending — so N pushes within the same frame
 * collapse into a single commit of the *latest* value.
 *
 * This is a plain, DOM-free unit extracted specifically so the coalescing
 * behavior itself (collapse-to-latest, synchronous flush, cancel-without-
 * commit) can be unit tested deterministically with a fake scheduler, rather
 * than relying on a brittle React-component test that has to fake real
 * animation frames through jsdom. InteractiveCanvasEditor wires this to the
 * real requestAnimationFrame/cancelAnimationFrame by default (via the
 * internal `rafScheduler`, used when no scheduler is passed).
 */
export function createFrameCoalescer<T>(
  commit: (value: T) => void,
  scheduler: FrameScheduler = rafScheduler,
): FrameCoalescer<T> {
  let pendingValue: T | null = null;
  let pendingHandle: number | null = null;
  let hasPending = false;

  const runPending = () => {
    pendingHandle = null;
    if (!hasPending) return;
    const value = pendingValue as T;
    hasPending = false;
    pendingValue = null;
    commit(value);
  };

  return {
    /** Records the latest value; schedules exactly one frame if none is pending. */
    push(value: T) {
      pendingValue = value;
      hasPending = true;
      if (pendingHandle !== null) return;
      pendingHandle = scheduler.request(runPending);
    },
    /**
     * Cancels any pending frame and, if a value was queued, commits it
     * synchronously right now. Used on pointerup/pointercancel so the drag end
     * is never dropped behind a frame that never fires (e.g. tab backgrounded).
     */
    flush() {
      if (pendingHandle !== null) {
        scheduler.cancel(pendingHandle);
        pendingHandle = null;
      }
      if (!hasPending) return;
      const value = pendingValue as T;
      hasPending = false;
      pendingValue = null;
      commit(value);
    },
    /**
     * Cancels any pending frame WITHOUT committing — used on unmount, where
     * committing a stale value after the component is gone would be wrong.
     */
    cancel() {
      if (pendingHandle !== null) {
        scheduler.cancel(pendingHandle);
        pendingHandle = null;
      }
      hasPending = false;
      pendingValue = null;
    },
    /** True while a frame is scheduled and waiting to commit. */
    get isPending() {
      return pendingHandle !== null;
    },
  };
}

/**
 * Restores geometry and returns to idle — used when the host wants to cancel a
 * gesture explicitly (e.g. Escape key) without a corresponding pointer event.
 */
export function cancelInteraction(state: InteractionState): InteractionResult {
  if (state.kind === "move") {
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.updateObjectGeometries",
          geometries: state.startGeometries,
          recordHistory: false,
          snap: false,
          summary: "Cancelled drag",
        },
      ],
      overlay: emptyOverlay(),
    };
  }
  if (state.kind === "resize") {
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.updateObjectGeometries",
          geometries: { [state.objectId]: state.startGeometry },
          recordHistory: false,
          snap: false,
          summary: "Cancelled resize",
        },
      ],
      overlay: emptyOverlay(),
    };
  }
  return toIdle();
}
