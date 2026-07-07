"use client";

/**
 * Move gesture: dragging one or more selected objects, with live snap
 * correction, spacing hints, and section drop-target tracking. Also owns the
 * drag-start "expansion" rule — section descendants ride along with the
 * pressed set (core.ts's press-pending router calls createMoveGesture when
 * the drag threshold is crossed). On release, only the drag ROOTS are
 * reparented onto the drop target: carried descendants keep their recorded
 * parentIds, so a dragged section's subtree moves as a unit instead of
 * flattening onto the target.
 */
import type { CanvasAction } from "../../state/actions";
import { boundsForGeometries, type CanvasPoint } from "../../state/geometry";
import type { CanvasGeometry, InteractiveCanvasDocument } from "../../state/schema";
import { objectDefForType } from "../../objects/object-def";
import {
  computeSnapCorrection,
  computeSpacingHints,
  type DistributionGuideSegment,
  type SnapCorrection,
} from "../snapping";
import { descendantIds, gatherSnapCandidates, hitTestDropTarget, objectGeometryMap } from "../hit-testing";
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
  for (const id of dragObjectIds) {
    const object = document.objects.find((candidate) => candidate.id === id);
    const dragCapture = object ? objectDefForType(object.type)?.dragCapture : undefined;
    if (dragCapture === "descendants") {
      for (const memberId of descendantIds(document, id)) {
        expandedObjectIds.add(memberId);
      }
    }
  }
  return Array.from(expandedObjectIds);
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

/**
 * The single shared parentId of the drag roots, or null if they don't share
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
    // state.objectIds is the EXPANDED set (pressed objects plus their
    // transitive descendants, see expandMoveObjectIds). Only the drag ROOTS —
    // objects whose current parent is null or is not itself being dragged —
    // get reparented onto the drop target; a carried descendant's parent is
    // also in the drag, so it must keep that parent or the dragged section's
    // nesting would flatten onto the target. Comparing against the roots'
    // shared parent (not the mixed expanded set's) also keeps a no-op section
    // drag from dispatching a spurious setParent.
    const draggedSet = new Set(state.objectIds);
    const rootIds = state.objectIds.filter((objectId) => {
      const object = ctx.document.objects.find((candidate) => candidate.id === objectId);
      const objectParentId = object?.parentId ?? null;
      return objectParentId === null || !draggedSet.has(objectParentId);
    });
    const parentId = currentParentId(ctx.document, rootIds);
    const dispatch: CanvasAction[] =
      state.dropTargetId !== parentId
        ? [{ type: "canvas.setParent", objectIds: rootIds, parentId: state.dropTargetId }]
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

  // Drop-target hit-testing: probe with the center of the PRIMARY dragged
  // object's current (snapped) bounds — not the pointer, and not the union of
  // a multi-selection — excluding the dragged objects and their own
  // descendants so a section can't be dropped into itself or a child it
  // contains. objectIds preserves press order, so [0] is the primary object.
  const excludeIds = new Set(state.objectIds);
  for (const objectId of state.objectIds) {
    for (const descendantId of descendantIds(ctx.document, objectId)) {
      excludeIds.add(descendantId);
    }
  }
  const primaryGeometry = state.objectIds[0] ? geometries[state.objectIds[0]] : undefined;
  const dropTargetCenter = primaryGeometry
    ? { x: primaryGeometry.x + primaryGeometry.width / 2, y: primaryGeometry.y + primaryGeometry.height / 2 }
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
