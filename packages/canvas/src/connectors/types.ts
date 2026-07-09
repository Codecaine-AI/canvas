"use client";

/**
 * Connector gesture and overlay vocabulary shared by the interaction state
 * machine and connector gesture steppers.
 */
import type { CanvasPoint } from "../state/geometry";
import type { Anchor } from "../state/schema/connections";

/**
 * Connect-target candidate hovered by an in-progress connector drag/create
 * gesture, resolved through the ported AFFiNE connection cascade (W3b -
 * connection-cascade.ts's resolveConnectionCascade):
 *
 *  - `snapKind: "anchor"` - the pointer snapped to one of the 4 cardinal port
 *    anchors (within 8 view px). `point` is the exact outline point;
 *    `position` is set only when that point is NOT the plain bbox side
 *    midpoint (true-outline shapes like arrow-shape), so rect-family anchors
 *    commit as pure `anchor` sides exactly as before.
 *  - `snapKind: "outline"` - snapped to the nearest point on the shape's real
 *    outline (within 8 world px), off-anchor. `position` carries the exact
 *    [0..1, 0..1] relative attach point that gets stored on the endpoint.
 *  - `snapKind: "inside"` - pointer is inside an eligible non-section shape
 *    beyond both snap radii; commits the coarse nearest `anchor` side only
 *    (pre-W3b behavior).
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
 * (3.3.2, a brand-new connector is dragged from an object's edge port or
 * object body). `connectionId` is set only for the reconnect case;
 * `fromObjectId`/`fromAnchor` are set only for the create case, and
 * `fromAnchor` is absent when Connector Mode started from an object body.
 */
export type ConnectorDragOverlay = {
  connectionId?: string;
  end?: "from" | "to";
  fromObjectId?: string;
  fromAnchor?: Anchor;
  bendSegmentIndex?: number;
  points?: CanvasPoint[];
  point: CanvasPoint;
  candidate?: ConnectorAnchorCandidate;
};

/** Dragging an existing connection's endpoint handle to reconnect it (3.2.2). */
export type ConnectorEndpointDragGesture = {
  kind: "connector-endpoint-drag";
  connectionId: string;
  end: "from" | "to";
  /** The other (unmoved) endpoint's objectId - excluded from candidate hit-testing to prevent self-loops. */
  otherObjectId: string;
  point: CanvasPoint;
  candidate?: ConnectorAnchorCandidate;
};

/** Dragging a brand-new connector from an object's edge port or body (3.3.2). */
export type ConnectorCreateGesture = {
  kind: "connector-create";
  fromObjectId: string;
  fromAnchor?: Anchor;
  startWorld: CanvasPoint;
  point: CanvasPoint;
  hasDragged: boolean;
  candidate?: ConnectorAnchorCandidate;
};

/** Dragging one selected connector segment perpendicular to its axis. */
export type ConnectorBendDragGesture = {
  kind: "connector-bend-drag";
  connectionId: string;
  segmentIndex: number;
  startWorld: CanvasPoint;
  point: CanvasPoint;
  startPoints: CanvasPoint[];
  currentPoints: CanvasPoint[];
};
