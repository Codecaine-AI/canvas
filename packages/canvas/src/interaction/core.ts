"use client";

/**
 * Core of the pointer-interaction state machine: the stepInteraction
 * dispatcher, the idle + press-pending routers (the shared entry that decides
 * which gesture a press becomes), and explicit cancellation. The individual
 * gesture steppers live in ./gestures/*; the shared types/constants in
 * ./types. Consumers import everything through ./interaction (the barrel).
 */
import type { CanvasAction, CanvasSelection } from "../state/actions";
import { objectDefForType } from "../objects/object-def";
import { createMoveGesture, stepFromMove } from "./gestures/move";
import { stepFromResize } from "./gestures/resize";
import { stepFromMarquee } from "./gestures/marquee";
import {
  defaultGeometryForPlacement,
  objectTypeForTool,
  placePreviewOverlayFor,
  stepFromPlace,
} from "./gestures/place";
import { stepFromConnectorCreate, stepFromConnectorEndpointDrag } from "./gestures/connectors";
import {
  DRAG_THRESHOLD,
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  selectedObjectIds,
  toIdle,
  worldDistance,
  type CanvasPointerEvent,
  type ConnectorCreateGesture,
  type ConnectorEndpointDragGesture,
  type InteractionContext,
  type InteractionResult,
  type InteractionState,
  type MarqueeGesture,
  type PlaceGesture,
  type PressPending,
  type ResizeGesture,
} from "./types";

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

  if (ctx.tool === "hand") return toIdle();

  if (event.type === "double") {
    // Double-click on an existing object: start editing its label inline.
    if (event.hit.kind === "object") {
      return {
        state: IDLE_INTERACTION_STATE,
        dispatch: [],
        overlay: { editObjectLabelId: event.hit.objectId },
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
    // Locked sections refuse resize (W2). Section-ness is expressed through
    // the def's handle set — "corners" is the section-only handle behavior —
    // while `locked` stays a plain object property.
    if (objectDefForType(object.type)?.handles === "corners" && object.locked) return toIdle();
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
      variant: ctx.armedShape,
      startWorld: event.world,
      currentWorld: event.world,
    };
    return {
      state: pending,
      dispatch: [],
      overlay: placePreviewOverlayFor(
        armedObjectTypeForClick,
        defaultGeometryForPlacement(armedObjectTypeForClick, event.world),
        ctx.armedShape,
      ),
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
      variant: ctx.armedShape,
      startWorld: event.world,
      currentWorld: event.world,
    };
    return {
      state: pending,
      dispatch: [],
      overlay: placePreviewOverlayFor(
        armedObjectType,
        defaultGeometryForPlacement(armedObjectType, event.world),
        ctx.armedShape,
      ),
    };
  }

  // Canvas (empty space) pointer-down.
  if (ctx.tool === "select") {
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
    if (
      dragObjectIds.some((id) => {
        const object = ctx.document.objects.find((candidate) => candidate.id === id);
        // Locked sections refuse drag (W2); `locked` stays a plain object
        // property.
        return object && object.type === "section" && object.locked;
      })
    ) {
      return toIdle();
    }
    // Sections carry their persisted parentId-descendants — createMoveGesture
    // (gestures/move.ts) folds the expansion into the gesture's
    // objectIds/startGeometries at drag-start.
    const moveState = createMoveGesture(ctx.document, state.startWorld, dragObjectIds);
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
