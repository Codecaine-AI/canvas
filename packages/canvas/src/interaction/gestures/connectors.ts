"use client";

/**
 * Connector gestures: reconnecting an existing connection's endpoint
 * (connector-endpoint-drag, 3.2.2) and dragging a brand-new connector out of
 * an object's edge port (connector-create, 3.3.2). Both resolve their hover
 * candidate through the ported AFFiNE connection cascade (W3b).
 */
import { resolveConnectionCascade } from "../../routing/connection-overlay";
import { nearestObjectAnchor, pointForAnchor, pointForObjectAnchor } from "../../routing/routing";
import { isBelowTextType } from "../../objects/text-slots";
import type { CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasDocument } from "../../state/schema";
import { paintOrderedObjects } from "../../state/z-order";
import {
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  toIdle,
  type CanvasPointerEvent,
  type ConnectorAnchorCandidate,
  type ConnectorCreateGesture,
  type ConnectorEndpointDragGesture,
  type InteractionContext,
  type InteractionResult,
} from "../types";

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

export function stepFromConnectorCreate(
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
