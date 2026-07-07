"use client";

/**
 * Shared vocabulary for the pointer-interaction state machine: the pointer
 * event/hit model, the per-gesture state types and their discriminated union,
 * the ephemeral overlay shape, the read-only step context/result types, the
 * shared thresholds, and a few tiny cross-gesture helpers (selectedObjectIds,
 * worldDistance, emptyOverlay, toIdle). This is the bottom layer of
 * src/interaction/ — it imports only from state/, routing/, snapping and the
 * viewport module, never from the gesture steppers or core, so gestures/ and
 * core.ts can both depend on it without cycles.
 */
import type { CanvasAction, CanvasSelection, CanvasTool } from "../state/actions";
import type { CanvasBounds, CanvasPoint } from "../state/geometry";
import type {
  CanvasGeometry,
  CanvasIconGlyph,
  CanvasShapeDirection,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
  InteractiveCanvasDocument,
} from "../state/schema";
import type { Anchor } from "../routing/routing";
import type { DistributionGuideSegment, SnapCorrection, SnapGuide, SpacingHint } from "./snapping";
import type { ViewportState } from "../render/viewport";

/** World-space drag threshold below which a press+release is treated as a click. */
export const DRAG_THRESHOLD = 3;

/** Screen-space snap threshold (px); divided by zoom so snapping feels constant at any zoom. */
export const SNAP_THRESHOLD_SCREEN_PX = 6;

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/**
 * Catalog-entry variant of the armed creation tool (Shapes panel flow): the
 * tool itself is just an object TYPE, but a panel entry can additionally pin
 * an orientation (triangle up/down, arrow left/right), an Advanced-tier icon
 * glyph, and a label override (the glyph's display name instead of the
 * generic "Icon"). Carried through the place gesture into canvas.addObject
 * and into the ghost preview so both match the picked entry exactly.
 */
export type ArmedShapeVariant = {
  direction?: CanvasShapeDirection;
  icon?: CanvasIconGlyph;
  label?: string;
};

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
   * known). The editor should open its inline label textarea for this id and
   * then let the overlay go stale on the next interaction event (this field is
   * not "current state", just an edge-triggered request).
   */
  editObjectLabelId?: string;
  /**
   * Seed label text for editObjectLabelId when the target object won't exist
   * in the document yet at the time the editor processes this overlay.
   * Existing-object double-click omits this; the editor reads the current
   * label from the document instead.
   */
  editObjectLabelSeed?: string;
  /** Ghost preview rect for an in-progress armed-tool placement drag (4.2.2). */
  placePreview?: CanvasBounds;
  /**
   * Full draft of the object an armed-tool placement will create (built by
   * draftPlacedObject — same builder canvas.addObject uses), so the ghost can
   * render the ACTUAL shape (glyph, direction, label, tone) instead of a
   * generic dashed box. Always accompanies placePreview on the armed-tool
   * paths; the bounds stay for consumers that only need geometry.
   */
  placePreviewObject?: InteractiveCanvasObject;
};

export type PressPending = {
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

export type MoveGesture = {
  kind: "move";
  startWorld: CanvasPoint;
  objectIds: string[];
  startGeometries: Record<string, CanvasGeometry>;
  hasEmitted: boolean;
  /** Section currently under the drag probe (drop target), tracked for release-time canvas.setParent. */
  dropTargetId: string | null;
};

export type ResizeGesture = {
  kind: "resize";
  startWorld: CanvasPoint;
  objectId: string;
  handle: ResizeHandle;
  startGeometry: CanvasGeometry;
  hasEmitted: boolean;
};

export type MarqueeGesture = {
  kind: "marquee";
  startWorld: CanvasPoint;
  currentWorld: CanvasPoint;
  additive: boolean;
};

/**
 * Armed-tool object creation (4.2.2): pointer-down with a creatable tool armed
 * (rectangle/process/decision/sticky/annotation-marker)
 * starts this gesture over empty canvas. A sub-threshold release creates a
 * default-size object centered at the point; a drag creates an object sized
 * to the normalized, min-size-clamped dragged rect. Either way, on completion
 * the tool reverts to "select" and the new object becomes the selection.
 */
export type PlaceGesture = {
  kind: "place";
  tool: CanvasTool;
  objectType: InteractiveCanvasObjectType;
  /** Catalog-entry variant (direction/icon/label) captured from ctx.armedShape at gesture start. */
  variant?: ArmedShapeVariant;
  startWorld: CanvasPoint;
  currentWorld: CanvasPoint;
};

/** Dragging an existing connection's endpoint handle to reconnect it (3.2.2). */
export type ConnectorEndpointDragGesture = {
  kind: "connector-endpoint-drag";
  connectionId: string;
  end: "from" | "to";
  /** The other (unmoved) endpoint's objectId — excluded from candidate hit-testing to prevent self-loops. */
  otherObjectId: string;
  point: CanvasPoint;
  candidate?: ConnectorAnchorCandidate;
};

/** Dragging a brand-new connector from an object's edge port (3.3.2). */
export type ConnectorCreateGesture = {
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
   * Repeat-placement mode (Shapes panel flow): when true, completing a place
   * gesture keeps the creation tool armed instead of reverting to "select",
   * so the user can keep clicking to place more of the same shape. The host
   * sets this while the Shapes panel is open; exiting the mode (closing the
   * panel, picking a dock tool, Escape) is the host's responsibility.
   */
  stickyPlacement?: boolean;
  /** Catalog-entry variant of the armed tool (Shapes panel pick) — see ArmedShapeVariant. */
  armedShape?: ArmedShapeVariant;
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

export function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

export function worldDistance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function emptyOverlay(): InteractionOverlay {
  return {};
}

export function toIdle(): InteractionResult {
  return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
}
