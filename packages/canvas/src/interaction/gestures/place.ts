"use client";

/**
 * Place gesture: armed-tool object creation (4.2.2). Owns the tool→object-type
 * mapping, the default-size placement geometry shared with double-click
 * creation (4.2.1), and the ghost-preview sizing for click-vs-drag placement.
 */
import {
  colorKindForType,
  defaultGeometryFor,
  draftPlacedObject,
  type CanvasAction,
  type CanvasTool,
} from "../../state/actions";
import { normalizeBounds, type CanvasPoint } from "../../state/geometry";
import type { CanvasColor, CanvasGeometry, InteractiveCanvasObjectType } from "../../state/schema";
import {
  DRAG_THRESHOLD,
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  worldDistance,
  type ArmedShapeVariant,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionOverlay,
  type InteractionResult,
  type PlaceGesture,
} from "../types";

/** Synthetic id carried by the ghost-preview draft object — never enters the document. */
export const PLACE_PREVIEW_GHOST_ID = "__place-preview-ghost__";

/**
 * Ghost-preview overlay for an armed-tool placement: the geometry bounds plus
 * a full draft of the object the placement will create (same draftPlacedObject
 * builder canvas.addObject uses), so the stage renders the real shape —
 * glyph, direction, label — semi-transparent under the cursor.
 */
export function placePreviewOverlayFor(
  objectType: InteractiveCanvasObjectType,
  geometry: CanvasGeometry,
  variant?: ArmedShapeVariant,
  /** Last-picked color for the type's kind (D17) so the ghost matches the object the click will create. */
  color?: CanvasColor,
): InteractionOverlay {
  return {
    placePreview: geometry,
    placePreviewObject: draftPlacedObject(objectType, geometry, {
      id: PLACE_PREVIEW_GHOST_ID,
      color,
      ...variant,
    }),
  };
}

/** The ghost color for an armed type: the context's last-picked memory for its kind (D17). */
export function placePreviewColorFor(
  objectType: InteractiveCanvasObjectType,
  ctx: Pick<InteractionContext, "lastPickedColor">,
): CanvasColor | undefined {
  return ctx.lastPickedColor?.[colorKindForType(objectType)];
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

/** Maps an "armed" creation tool to the object type it creates; null for select/hand (and the stale "annotation" tool). */
export function objectTypeForTool(tool: CanvasTool): InteractiveCanvasObjectType | null {
  switch (tool) {
    case "rectangle":
    case "process":
    case "decision":
    case "sticky":
    case "annotation-marker":
    // D16 — these were previously missing from this switch, meaning an
    // armed document/database tool silently failed to start a PlaceGesture.
    case "document":
    case "database":
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    case "section":
    case "pill":
    case "arrow-shape":
    case "predefined-process":
    case "code-block":
    // W5 — FigJam parity shape set (Wave A added the tools; the Shapes-panel
    // creation-flow work wires them here). Same 1:1 tool<->type pattern as
    // every case above; without these an armed ellipse/triangle/… tool
    // silently failed to start a PlaceGesture.
    case "ellipse":
    case "triangle":
    case "parallelogram":
    case "pentagon":
    case "octagon":
    case "star":
    case "plus":
    case "chevron":
    case "folder":
    case "document-stack":
    case "off-page-connector":
    case "trapezoid":
    case "manual-input":
    case "hexagon":
    case "internal-storage":
    case "or-junction":
    case "summing-junction":
    case "cylinder-horizontal":
    case "page-corner":
    case "icon":
      return tool;
    default:
      return null;
  }
}

export const MIN_PLACE_DRAG_SIZE = 24;

/**
 * Sizes/positions the ghost preview (and eventual created object) for a place
 * gesture: below the drag threshold it's the default-size box centered on the
 * start point (so a plain click still shows/creates a sensible default-sized
 * shape); past the threshold it's the normalized drag rect, clamped so neither
 * dimension collapses below MIN_PLACE_DRAG_SIZE.
 */
export function placeGeometryFor(state: PlaceGesture): CanvasGeometry {
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
 * rect), dispatches the creation, reverts the tool to "select"
 * (canvas.addObject's reducer already selects the new object) unless
 * ctx.stickyPlacement keeps it armed for repeat placement, and returns to
 * idle. The reducer assigns section membership from the final geometry.
 */
export function stepFromPlace(
  state: PlaceGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") {
    return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
  }

  if (event.type === "up") {
    const geometry = placeGeometryFor(state);
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.addObject",
          objectType: state.objectType,
          geometry,
          // Catalog-entry variant (Shapes panel pick): orientation, Advanced
          // glyph, and glyph-name text ride along so the created object
          // matches the picked entry, not just its bare type.
          ...(state.variant?.direction ? { direction: state.variant.direction } : null),
          ...(state.variant?.icon ? { icon: state.variant.icon } : null),
          ...(state.variant?.text ? { text: state.variant.text } : null),
        },
        // Repeat-placement mode (ctx.stickyPlacement — Shapes panel flow)
        // keeps the tool armed so the next click places another one; the
        // default single-shot mode reverts to "select" as before.
        ...(ctx.stickyPlacement
          ? []
          : ([{ type: "canvas.setTool", tool: "select" }] as CanvasAction[])),
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") {
    return {
      state,
      dispatch: [],
      overlay: placePreviewOverlayFor(
        state.objectType,
        placeGeometryFor(state),
        state.variant,
        placePreviewColorFor(state.objectType, ctx),
      ),
    };
  }

  const nextState: PlaceGesture = { ...state, currentWorld: event.world };
  return {
    state: nextState,
    dispatch: [],
    overlay: placePreviewOverlayFor(
      nextState.objectType,
      placeGeometryFor(nextState),
      nextState.variant,
      placePreviewColorFor(nextState.objectType, ctx),
    ),
  };
}
