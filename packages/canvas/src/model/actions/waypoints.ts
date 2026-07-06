"use client";

import type { InteractiveCanvasDocument } from "../schema";

/** Float tolerance for comparing endpoint-owner movement deltas (world px). */
const WAYPOINT_DELTA_EPSILON = 0.01;

/**
 * W4 stale-waypoint reconciliation — explicit `connection.waypoints` are
 * absolute world coordinates, so any action that moves objects must keep them
 * coherent. Compares each waypointed connection's endpoint owners between the
 * pre- and post-action documents:
 *
 *  - BOTH owners translated by the SAME delta (rigid case — e.g. both riding a
 *    carried section, a multi-select drag, or a nudge) → translate every
 *    waypoint by that delta, preserving trunk-and-branch fan shapes.
 *  - Only one owner moved, deltas differ, or either owner resized → DROP the
 *    waypoints (undefined) so the connector falls back to auto-routing rather
 *    than sweeping through stale space (FigJam's re-route-on-asymmetric-move).
 *
 * Runs inside the reducer choke point (see reduceInteractiveCanvasState), so
 * the waypoint change shares the action's history entry — one undo restores
 * both geometry and waypoints.
 */
export function reconcileConnectionWaypoints(
  previous: InteractiveCanvasDocument,
  next: InteractiveCanvasDocument,
): InteractiveCanvasDocument {
  if (!next.connections.some((connection) => connection.waypoints?.length)) return next;

  const previousById = new Map(previous.objects.map((object) => [object.id, object]));
  const nextById = new Map(next.objects.map((object) => [object.id, object]));

  type OwnerMove = { dx: number; dy: number; resized: boolean } | null;
  const ownerMove = (objectId: string): OwnerMove => {
    const before = previousById.get(objectId);
    const after = nextById.get(objectId);
    // Newly-created or deleted owners have no movement to reconcile against
    // (duplicate/paste translate their cloned waypoints at creation time).
    if (!before || !after) return null;
    return {
      dx: after.geometry.x - before.geometry.x,
      dy: after.geometry.y - before.geometry.y,
      resized:
        Math.abs(after.geometry.width - before.geometry.width) > WAYPOINT_DELTA_EPSILON ||
        Math.abs(after.geometry.height - before.geometry.height) > WAYPOINT_DELTA_EPSILON,
    };
  };

  let changed = false;
  const connections = next.connections.map((connection) => {
    if (!connection.waypoints || connection.waypoints.length === 0) return connection;
    const fromMove = ownerMove(connection.from.objectId);
    const toMove = ownerMove(connection.to.objectId);
    if (!fromMove || !toMove) return connection;

    const moved =
      Math.abs(fromMove.dx) > WAYPOINT_DELTA_EPSILON ||
      Math.abs(fromMove.dy) > WAYPOINT_DELTA_EPSILON ||
      Math.abs(toMove.dx) > WAYPOINT_DELTA_EPSILON ||
      Math.abs(toMove.dy) > WAYPOINT_DELTA_EPSILON ||
      fromMove.resized ||
      toMove.resized;
    if (!moved) return connection;

    const rigid =
      !fromMove.resized &&
      !toMove.resized &&
      Math.abs(fromMove.dx - toMove.dx) < WAYPOINT_DELTA_EPSILON &&
      Math.abs(fromMove.dy - toMove.dy) < WAYPOINT_DELTA_EPSILON;

    changed = true;
    if (rigid) {
      return {
        ...connection,
        waypoints: connection.waypoints.map(
          ([x, y]) => [x + fromMove.dx, y + fromMove.dy] as [number, number],
        ),
      };
    }
    return { ...connection, waypoints: undefined };
  });

  if (!changed) return next;
  return { ...next, connections };
}
