"use client";

/**
 * Gesture-machine vocabulary for pointer interaction: per-gesture state,
 * overlays, read-only step context/result shapes, and idle helpers.
 */
import type { CanvasAction, CanvasColorKind, CanvasSelection, CanvasTool } from "../state/actions";
import type { CanvasBounds, CanvasPoint } from "../state/geometry";
import type {
  CanvasColor,
  CanvasGeometry,
  CanvasIconGlyph,
  CanvasShapeDirection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../state/schema";
import type { ViewportState } from "../stage/viewport";
import type {
  ConnectorBendDragGesture,
  ConnectorCreateGesture,
  ConnectorDragOverlay,
  ConnectorEndpointDragGesture,
} from "../connectors/types";
import type { DistributionGuideSegment, SnapCorrection, SnapGuide, SpacingHint } from "./snapping";
import type { CanvasHit, ResizeHandle } from "./types";

export type {
  ConnectorAnchorCandidate,
  ConnectorBendDragGesture,
  ConnectorCreateGesture,
  ConnectorDragOverlay,
  ConnectorEndpointDragGesture,
} from "../connectors/types";

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
  /** Seed text for the created object (e.g. an icon entry's glyph name instead of the generic "Icon"). */
  text?: string;
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
   * object's text in place". Set for both the existing-object case (id
   * already known). The editor should open its in-place text editor for this
   * id and then let the overlay go stale on the next interaction event (this
   * field is not "current state", just an edge-triggered request).
   */
  editObjectTextId?: string;
  /**
   * Seed text for editObjectTextId when the target object won't exist in the
   * document yet at the time the editor processes this overlay.
   * Existing-object double-click omits this; the editor reads the current
   * text from the document instead.
   */
  editObjectTextSeed?: string;
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
  /** Section that the projected primary object would geometrically adopt. */
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

export type InteractionState =
  | { kind: "idle" }
  | PressPending
  | MoveGesture
  | ResizeGesture
  | MarqueeGesture
  | PlaceGesture
  | ConnectorEndpointDragGesture
  | ConnectorCreateGesture
  | ConnectorBendDragGesture;

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
   * Per-kind last-picked color memory (P1, D17 — the reducer's
   * state.lastPickedColor): lets the place gesture's ghost preview render
   * the same color the created object will take. The creation itself reads
   * the memory in the reducer, so this is preview-fidelity plumbing only.
   */
  lastPickedColor?: Readonly<Record<CanvasColorKind, CanvasColor>>;
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

export function emptyOverlay(): InteractionOverlay {
  return {};
}

export function toIdle(): InteractionResult {
  return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
}
