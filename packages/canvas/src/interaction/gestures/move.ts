"use client";

/**
 * Move gesture: dragging one or more selected objects, with live snap
 * correction, spacing hints, and section drop-target tracking. Also owns the
 * drag-start "expansion" rule — section descendants ride along with the
 * pressed set (core.ts's press-pending router calls createMoveGesture when the
 * drag threshold is crossed). On release, section membership is reconciled
 * from the committed geometry without adding another history entry.
 */
import { boundsForGeometries, type CanvasPoint } from "../../state/geometry";
import type { CanvasGeometry, InteractiveCanvasDocument } from "../../state/schema";
import { resolveSectionParent } from "../../state/section-membership";
import { connectionBoundsForObject } from "../../objects/geometry";
import { objectDefForType } from "../../objects/object-def";
import {
  computeSnapCorrection,
  computeSpacingHints,
  type DistributionGuideSegment,
  type SnapCorrection,
} from "../snapping";
import { gatherSnapCandidates, objectGeometryMap } from "../hit-testing";
import {
  IDLE_INTERACTION_STATE,
  SNAP_THRESHOLD_SCREEN_PX,
  emptyOverlay,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionResult,
  type MoveGesture,
} from "../types";

/**
 * Dragging a section also carries its persisted parentId-descendants
 * (recursively, including nested sections' own members) — computed once, at
 * drag-start, and simply folded into the same objectIds/startGeometries the
 * generic move machinery already drags/snaps/undoes as a single unit. No new
 * gesture kind or history plumbing needed.
 */
export function expandMoveObjectIds(
  document: InteractiveCanvasDocument,
  dragObjectIds: string[],
): string[] {
  const expandedObjectIds = new Set(dragObjectIds);
  const descendantsByParent = buildDescendantsByParent(document);
  for (const id of dragObjectIds) {
    const object = document.objects.find((candidate) => candidate.id === id);
    const dragCapture = object ? objectDefForType(object.type)?.dragCapture : undefined;
    if (dragCapture === "descendants") {
      addDescendantIds(descendantsByParent, id, expandedObjectIds);
    }
  }
  return Array.from(expandedObjectIds);
}

function buildDescendantsByParent(document: InteractiveCanvasDocument): Map<string, string[]> {
  const descendantsByParent = new Map<string, string[]>();
  for (const object of document.objects) {
    if (!object.parentId) continue;
    const list = descendantsByParent.get(object.parentId);
    if (list) list.push(object.id);
    else descendantsByParent.set(object.parentId, [object.id]);
  }
  return descendantsByParent;
}

function addDescendantIds(
  descendantsByParent: ReadonlyMap<string, readonly string[]>,
  parentId: string,
  result: Set<string>,
) {
  const stack = [...(descendantsByParent.get(parentId) ?? [])];
  while (stack.length > 0) {
    const descendantId = stack.pop()!;
    if (descendantId === parentId || result.has(descendantId)) continue;
    result.add(descendantId);
    stack.push(...(descendantsByParent.get(descendantId) ?? []));
  }
}

/**
 * Builds the MoveGesture state for a threshold-crossing drag of
 * `dragObjectIds`: expands the set (section descendants, see
 * expandMoveObjectIds) and captures start geometries for cancel-restore.
 */
export function createMoveGesture(
  document: InteractiveCanvasDocument,
  startWorld: CanvasPoint,
  dragObjectIds: string[],
): MoveGesture {
  const finalObjectIds = expandMoveObjectIds(document, dragObjectIds);
  const startGeometries = objectGeometryMap(document, finalObjectIds);
  return {
    kind: "move",
    startWorld,
    objectIds: finalObjectIds,
    startGeometries,
    hasEmitted: false,
    dropTargetId: null,
  };
}

export function stepFromMove(
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
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [{ type: "canvas.reconcileSectionMembership", recordHistory: false }],
      overlay: emptyOverlay(),
    };
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
  // + sections, then apply the resulting correction uniformly to every
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
  const movingBounds = boundsForGeometries(
    ctx.document.objects
      .filter((object) => state.objectIds.includes(object.id))
      .map((object) =>
        connectionBoundsForObject({
          ...object,
          geometry: rawGeometries[object.id] ?? object.geometry,
        }),
      ),
  );
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

  // Drop-target preview: run the same bounds-overlap resolver the reducer
  // uses at commit time against the PRIMARY dragged object's projected
  // geometry, excluding the dragged roots/descendants as section candidates.
  // objectIds preserves press order, so [0] is the primary object.
  const excludeIds = new Set(state.objectIds);
  const descendantsByParent = buildDescendantsByParent(ctx.document);
  for (const objectId of state.objectIds) {
    addDescendantIds(descendantsByParent, objectId, excludeIds);
  }
  const primaryObjectId = state.objectIds[0];
  const primaryObject = primaryObjectId
    ? ctx.document.objects.find((object) => object.id === primaryObjectId)
    : null;
  const primaryGeometry = primaryObjectId ? geometries[primaryObjectId] : undefined;
  const dropTargetId =
    primaryObject && primaryGeometry
      ? resolveSectionParent({ ...primaryObject, geometry: primaryGeometry }, ctx.document, excludeIds)
      : null;

  const nextState: MoveGesture = {
    ...state,
    hasEmitted: true,
    dropTargetId,
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
      dropTargetId,
    },
  };
}
