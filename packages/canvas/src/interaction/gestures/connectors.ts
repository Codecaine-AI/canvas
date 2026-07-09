"use client";

/**
 * Connector gestures: reconnecting an existing connection's endpoint
 * (connector-endpoint-drag, 3.2.2) and dragging a brand-new connector out of
 * an object's edge port (connector-create, 3.3.2). Both resolve their hover
 * candidate through the ported AFFiNE connection cascade (W3b).
 */
import { resolveConnectionCascade } from "../../routing/connection-overlay";
import {
  bendSimplifyToleranceForZoom,
  bendSnapToleranceForZoom,
  commitBendPolyline,
  dragOrthogonalSegment,
  polylinesAlmostEqual,
} from "../../routing/bend-editing";
import { nearestObjectAnchor, pointForAnchor, pointForObjectAnchor } from "../../routing/routing";
import { connectionBoundsForObject } from "../../objects/geometry";
import { isBelowTextType } from "../../objects/text-slots";
import { createObjectId, type CanvasPoint } from "../../state/geometry";
import { objectTypeLabel } from "../../state/schema/object-defaults";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { paintOrderedObjects } from "../../state/z-order";
import type { CanvasAction } from "../../state/actions";
import {
  DRAG_THRESHOLD,
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  toIdle,
  worldDistance,
  type CanvasPointerEvent,
  type ConnectorAnchorCandidate,
  type ConnectorBendDragGesture,
  type ConnectorCreateGesture,
  type ConnectorEndpointDragGesture,
  type InteractionContext,
  type InteractionResult,
} from "../types";

const QUICK_CONNECT_MIN_GAP_PX = 120;
const BEND_ENDPOINT_POSITION_EPSILON_PX = 0.5;
const UNIT_INTERVAL_EPSILON = 0.000001;

/**
 * Resolves the connect-target under the pointer through the ported AFFiNE
 * connection cascade (W3b — connection-overlay.ts): anchor snap within 8 view
 * px, else nearest-outline-point snap within 8 world px, else inside-the-
 * shape, else no candidate. Candidates are passed topmost-first by shared
 * paint order, matching hitTestObjects, so an overlapping upper object wins,
 * and `excludeId` (the connector's other endpoint's object) can never
 * candidate-snap into a self-loop.
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
  const candidates = [...paintOrderedObjects(document)].reverse();
  const cascade = resolveConnectionCascade(
    worldPoint,
    candidates,
    zoom,
    new Set(excludeId ? [excludeId] : []),
  );
  if (cascade.kind === "free") return undefined;

  const object = document.objects.find((item) => item.id === cascade.objectId);
  if (!object) return undefined;

  if (cascade.kind === "inside") {
    return {
      objectId: cascade.objectId,
      anchor: nearestObjectAnchor(object, worldPoint),
      snapKind: "inside",
    };
  }

  const anchor = nearestObjectAnchor(object, cascade.point);
  const plainBboxCanonical = pointForAnchor(object.geometry, anchor);
  const objectCanonical = pointForObjectAnchor(object, anchor);
  const isPlainBboxAnchor =
    Math.abs(plainBboxCanonical.x - cascade.point.x) < 0.5 &&
    Math.abs(plainBboxCanonical.y - cascade.point.y) < 0.5;
  const isBelowSlotAnchor =
    isBelowTextType(object.type) &&
    Math.abs(objectCanonical.x - cascade.point.x) < 0.5 &&
    Math.abs(objectCanonical.y - cascade.point.y) < 0.5;
  const isCanonicalAnchorPoint =
    cascade.kind === "anchor" && (isPlainBboxAnchor || isBelowSlotAnchor);

  return {
    objectId: cascade.objectId,
    anchor,
    point: cascade.point,
    ...(isCanonicalAnchorPoint ? {} : { position: cascade.coord }),
    snapKind: cascade.kind,
  };
}

export function quickConnectClickPoint(
  fromObject: InteractiveCanvasObject,
  fromAnchor: ConnectorCreateGesture["fromAnchor"],
): CanvasPoint {
  const { x, y, width, height } = connectionBoundsForObject(fromObject);
  // Half a shape-width edge-to-edge (min 60px): the original full-width gap
  // read as "way too far" in review — the spawned duplicate should sit close
  // enough to feel attached to its source.
  const gap = Math.max(width, QUICK_CONNECT_MIN_GAP_PX) / 2;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  if (fromAnchor === "top") return { x: centerX, y: y - gap - height / 2 };
  if (fromAnchor === "bottom") return { x: centerX, y: y + height + gap + height / 2 };
  if (fromAnchor === "left") return { x: x - gap - width / 2, y: centerY };
  return { x: x + width + gap + width / 2, y: centerY };
}

function quickConnectNewObjectId(
  document: InteractiveCanvasDocument,
  fromObject: InteractiveCanvasObject,
): string {
  return createObjectId(document, fromObject.text.trim() || objectTypeLabel(fromObject.type));
}

function bendPointsForEvent(
  state: ConnectorBendDragGesture,
  event: CanvasPointerEvent,
  zoom: number,
): CanvasPoint[] {
  return dragOrthogonalSegment(state.startPoints, state.segmentIndex, {
    dx: event.world.x - state.startWorld.x,
    dy: event.world.y - state.startWorld.y,
  }, {
    snapTolerance: bendSnapToleranceForZoom(zoom),
    simplifyTolerance: bendSimplifyToleranceForZoom(zoom),
  });
}

function bendDragOverlay(state: ConnectorBendDragGesture) {
  return {
    connectorDrag: {
      connectionId: state.connectionId,
      bendSegmentIndex: state.segmentIndex,
      point: state.point,
      points: state.currentPoints,
    },
  };
}

function sameEndpointPosition(
  a: InteractiveCanvasConnection["from"]["position"],
  b: InteractiveCanvasConnection["from"]["position"],
): boolean {
  if (!a || !b) return !a && !b;
  return a[0] === b[0] && a[1] === b[1];
}

function endpointChanged(
  previous: InteractiveCanvasConnection["from"],
  next: InteractiveCanvasConnection["from"],
): boolean {
  return (
    next.objectId !== previous.objectId ||
    next.anchor !== previous.anchor ||
    !sameEndpointPosition(next.position, previous.position)
  );
}

function bendEndpointPatch(
  endpoint: InteractiveCanvasConnection["from"],
  object: InteractiveCanvasObject,
  point: CanvasPoint,
): InteractiveCanvasConnection["from"] | undefined {
  const existingPoint = endpoint.position
    ? pointForEndpointPosition(object, endpoint.position)
    : pointForCanonicalEndpoint(object, endpoint.anchor, point);
  if (existingPoint && worldPointsAlmostEqual(existingPoint, point, BEND_ENDPOINT_POSITION_EPSILON_PX)) {
    return undefined;
  }

  const position = relativeEndpointPosition(object, point);
  return position ? { ...endpoint, position } : undefined;
}

function pointForEndpointPosition(
  object: InteractiveCanvasObject,
  position: [number, number],
): CanvasPoint {
  const bounds = connectionBoundsForObject(object);
  return {
    x: bounds.x + position[0] * bounds.width,
    y: bounds.y + position[1] * bounds.height,
  };
}

function pointForCanonicalEndpoint(
  object: InteractiveCanvasObject,
  anchor: InteractiveCanvasConnection["from"]["anchor"],
  point: CanvasPoint,
): CanvasPoint | undefined {
  const explicit = explicitEndpointAnchor(anchor);
  if (explicit) return pointForObjectAnchor(object, explicit);

  const anchors = ["top", "right", "bottom", "left"] as const;
  return anchors
    .map((candidate) => pointForObjectAnchor(object, candidate))
    .find((candidate) => worldPointsAlmostEqual(candidate, point, BEND_ENDPOINT_POSITION_EPSILON_PX));
}

function explicitEndpointAnchor(
  anchor: InteractiveCanvasConnection["from"]["anchor"],
): "top" | "right" | "bottom" | "left" | null {
  return anchor === "top" || anchor === "right" || anchor === "bottom" || anchor === "left"
    ? anchor
    : null;
}

function relativeEndpointPosition(
  object: InteractiveCanvasObject,
  point: CanvasPoint,
): [number, number] | undefined {
  const bounds = connectionBoundsForObject(object);
  if (Math.abs(bounds.width) <= UNIT_INTERVAL_EPSILON || Math.abs(bounds.height) <= UNIT_INTERVAL_EPSILON) {
    return undefined;
  }
  return [
    clampUnit((point.x - bounds.x) / bounds.width),
    clampUnit((point.y - bounds.y) / bounds.height),
  ];
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function worldPointsAlmostEqual(a: CanvasPoint, b: CanvasPoint, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export function stepFromConnectorEndpointDrag(
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
    const connection = ctx.document.connections.find(
      (candidateConnection) => candidateConnection.id === state.connectionId,
    );
    const previousEndpoint = state.end === "from" ? connection?.from : connection?.to;
    const clearsWaypoints =
      !!connection?.waypoints &&
      !!previousEndpoint &&
      endpointChanged(previousEndpoint, endpoint);
    const patch = {
      ...(state.end === "from" ? { from: endpoint } : { to: endpoint }),
      ...(clearsWaypoints ? { waypoints: undefined } : {}),
    };
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

export function stepFromConnectorCreate(
  state: ConnectorCreateGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") return toIdle();

  if (event.type === "up") {
    const fromObject = ctx.document.objects.find((object) => object.id === state.fromObjectId);
    const isClick =
      !state.hasDragged && worldDistance(state.startWorld, event.world) < DRAG_THRESHOLD;
    const candidate = state.candidate;
    if (!isClick && candidate) {
      const addConnectionAction: Extract<CanvasAction, { type: "canvas.addConnection" }> = {
        type: "canvas.addConnection",
        fromObjectId: state.fromObjectId,
        toObjectId: candidate.objectId,
        ...(state.fromAnchor ? { fromAnchor: state.fromAnchor } : {}),
        toAnchor: candidate.anchor,
        // Off-anchor drop: store the exact relative attach point (W3b).
        ...(candidate.position ? { toPosition: candidate.position } : {}),
      };
      return {
        state: IDLE_INTERACTION_STATE,
        dispatch: [addConnectionAction],
        overlay: emptyOverlay(),
      };
    }
    if (isClick && !state.fromAnchor) {
      return toIdle();
    }
    // Released on empty canvas: create-and-connect as a single history entry.
    const point = isClick && fromObject
      ? quickConnectClickPoint(fromObject, state.fromAnchor)
      : event.world;
    const editObjectTextId = fromObject
      ? quickConnectNewObjectId(ctx.document, fromObject)
      : undefined;
    const quickConnectAction: Extract<CanvasAction, { type: "canvas.quickConnect" }> = {
      type: "canvas.quickConnect",
      fromObjectId: state.fromObjectId,
      ...(state.fromAnchor ? { fromAnchor: state.fromAnchor } : {}),
      drop: { point },
    };
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [quickConnectAction],
      overlay: editObjectTextId
        ? { editObjectTextId, editObjectTextSeed: "" }
        : emptyOverlay(),
    };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: { connectorDrag: state } };

  const hasDragged =
    state.hasDragged || worldDistance(state.startWorld, event.world) >= DRAG_THRESHOLD;
  const candidate = hasDragged
    ? connectorCandidateAt(ctx.document, event.world, state.fromObjectId, ctx.viewport.zoom)
    : undefined;
  const nextState: ConnectorCreateGesture = { ...state, point: event.world, hasDragged, candidate };
  return { state: nextState, dispatch: [], overlay: { connectorDrag: nextState } };
}

export function stepFromConnectorBendDrag(
  state: ConnectorBendDragGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") return toIdle();

  if (event.type === "up") {
    const tolerance = bendSimplifyToleranceForZoom(ctx.viewport.zoom);
    const finalPoints = bendPointsForEvent(state, event, ctx.viewport.zoom);
    if (polylinesAlmostEqual(finalPoints, state.startPoints)) {
      return toIdle();
    }
    const commit = commitBendPolyline(finalPoints, tolerance);
    if (polylinesAlmostEqual(commit.points, state.startPoints)) {
      return toIdle();
    }
    const connection = ctx.document.connections.find((candidate) => candidate.id === state.connectionId);
    const fromObject = connection
      ? ctx.document.objects.find((object) => object.id === connection.from.objectId)
      : undefined;
    const toObject = connection
      ? ctx.document.objects.find((object) => object.id === connection.to.objectId)
      : undefined;
    if (!connection || !fromObject || !toObject) return toIdle();

    const patch: Partial<Omit<InteractiveCanvasConnection, "id">> = commit.clearedWaypoints
      ? { waypoints: undefined }
      : { waypoints: commit.waypoints };
    if (!commit.clearedWaypoints) {
      const firstPoint = commit.points[0];
      const lastPoint = commit.points[commit.points.length - 1];
      const from = firstPoint ? bendEndpointPatch(connection.from, fromObject, firstPoint) : undefined;
      const to = lastPoint ? bendEndpointPatch(connection.to, toObject, lastPoint) : undefined;
      if (from) patch.from = from;
      if (to) patch.to = to;
    }

    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.updateConnection",
          connectionId: state.connectionId,
          patch,
        },
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: bendDragOverlay(state) };

  const nextState: ConnectorBendDragGesture = {
    ...state,
    point: event.world,
    currentPoints: bendPointsForEvent(state, event, ctx.viewport.zoom),
  };
  return { state: nextState, dispatch: [], overlay: bendDragOverlay(nextState) };
}
