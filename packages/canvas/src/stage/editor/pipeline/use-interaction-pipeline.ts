"use client";

/**
 * Editor pipeline hook: adapts DOM pointer streams, hover state, and edge-pan
 * into calls to the stage/editor gesture dispatcher.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { computeEdgePan } from "../../../interaction/edge-pan";
import { outlineContainsPoint } from "../../../objects/geometry";
import { cancelInteraction, stepInteraction } from "./core";
import {
  createFrameCoalescer,
  hitTestObjects,
  type CanvasHit,
  type CanvasPointerEvent,
  type FrameCoalescer,
  type ResizeHandle,
} from "../../../interaction/interaction";
import {
  defaultGeometryForPlacement,
  objectTypeForTool,
  placePreviewColorFor,
  placePreviewOverlayFor,
  type ArmedShapeVariant,
} from "../features/place/place";
import {
  IDLE_INTERACTION_STATE,
  type InteractionContext,
  type InteractionOverlay,
  type InteractionState,
} from "./state";
import type { CanvasAction, CanvasSelection, CanvasTool } from "../../../state/actions";
import { type CanvasPoint } from "../../../state/geometry";
import { type Anchor } from "../../../connectors/routing";
import { stageFromEventTarget, stageScreenPointFromClient } from "./stage-dom";
import { panBy, worldToScreen, type ViewportState } from "../../viewport";
import {
  ANCHOR_DOTS_MIN_ZOOM,
  ANCHOR_NAMES,
  HIT_TARGET_PX as ANCHOR_DOT_HIT_TARGET_PX,
  anchorScreenPoint,
} from "../../../connectors/AnchorDots";
import type { InteractiveCanvasDocument } from "../../../state/schema";
import { animateSectionFitToChildren } from "../features/section-fit/animate-section-fit";
import { useHoverTarget } from "./use-hover-target";

/** Width of the stage-edge band (screen px) where drag auto-pan kicks in (T1.2.1). */
const EDGE_PAN_BAND_PX = 36;
/** Max auto-pan speed in screen px per animation frame, reached right at the stage edge. */
const EDGE_PAN_MAX_SPEED_PX = 14;
/**
 * Interaction kinds that represent a continuous pointer-drag where edge
 * auto-pan should engage. "pressing" is deliberately excluded (sub-threshold —
 * panning before the 3px drag threshold is crossed would feel jumpy), and
 * "idle" never has an active gesture.
 */
const EDGE_PAN_DRAG_KINDS = new Set<InteractionState["kind"]>([
  "move",
  "resize",
  "drag-select",
  "place",
  "connector-endpoint-drag",
  "connector-create",
  "connector-bend-drag",
]);

export const SELECTION_DRAG_KINDS: ReadonlySet<string> = new Set([
  "move",
  "resize",
  "connector-endpoint-drag",
  "connector-bend-drag",
  "connector-create",
]);

type ResolveHitOptions = {
  zoom?: number;
  viewport?: ViewportState;
  screen?: CanvasPoint;
  portProximityObjectIds?: readonly string[];
};

/**
 * Latest raw pointer sample for the active gesture: enough of the native event
 * for buildPointerEvent (position/buttons/modifiers/DOM target for hit
 * resolution) plus the stage element it belongs to. Stored per pointermove for
 * the frame coalescer, and re-used by the edge-pan loop to synthesize move
 * re-steps while the pointer sits still inside the edge band.
 */
type DragPointerSnapshot = {
  event: Pick<
    PointerEvent,
    "clientX" | "clientY" | "button" | "shiftKey" | "altKey" | "metaKey" | "target"
  >;
  stage: HTMLElement;
};

function resolvePortProximityHit(
  document: InteractiveCanvasDocument,
  world: CanvasPoint,
  options: ResolveHitOptions,
): CanvasHit | null {
  const objectIds = options.portProximityObjectIds;
  if (!objectIds?.length || !options.viewport) return null;

  const screen = options.screen ?? worldToScreen(options.viewport, world);
  const selected = new Set(objectIds);
  const radius = ANCHOR_DOT_HIT_TARGET_PX / 2;
  const radiusSq = radius * radius;
  let nearest: { objectId: string; anchor: Anchor; distanceSq: number } | null = null;

  for (const object of document.objects) {
    if (!selected.has(object.id)) continue;
    for (const anchor of ANCHOR_NAMES) {
      const center = anchorScreenPoint(options.viewport, object, anchor);
      const dx = screen.x - center.x;
      const dy = screen.y - center.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusSq) continue;
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { objectId: object.id, anchor, distanceSq };
      }
    }
  }

  return nearest ? { kind: "port", objectId: nearest.objectId, anchor: nearest.anchor } : null;
}

/**
 * Resolves a raw pointer event's target into a CanvasHit by walking the DOM:
 * resize handles carry data-canvas-handle + data-canvas-object-id; connector
 * endpoint handles carry data-canvas-endpoint + data-canvas-connection-id;
 * object edge ports carry data-canvas-port + data-canvas-object-id; selected
 * objects also get a screen-space anchor-dot proximity pass for their rendered
 * 28px hit targets; connector bend pills carry data-canvas-bend-segment +
 * data-canvas-connection-id;
 * connector hit paths carry data-canvas-connection-id (checked after trim
 * elements, since they render as siblings, not inside, the hit path); section
 * title chips carry data-canvas-section-title-chip + data-canvas-object-id;
 * object shapes carry data-canvas-object-id; everything else falls through to
 * a pure world-space hitTestObjects (topmost-first, including section chips).
 *
 * D16 (P3): a DOM-matched object is VETOED when the pointer is outside its
 * def-declared outline (objects/geometry.ts outlineContainsPoint) — the
 * object button covers the full bbox, so a click in a diamond's empty corner
 * lands on the button but must not hit the object. The vetoed event falls
 * through to the world-space hitTestObjects (which applies the same outline
 * rule, so the vetoed object is naturally skipped) and finds the object
 * behind, or resolves to canvas. This one veto covers click-select,
 * drag-start, drag-select-from-corner, and double-click-to-edit, since every
 * pointer path funnels through here. Section title chips bypass this veto:
 * their zoom-counter-scaled DOM may extend outside the section outline, but a
 * chip press still belongs to that section. Exported for unit tests.
 */
export function resolveHit(
  target: Element,
  document: InteractiveCanvasDocument,
  world: CanvasPoint,
  options: ResolveHitOptions = {},
): CanvasHit {
  const handleElement = target.closest("[data-canvas-handle]");
  if (handleElement instanceof HTMLElement) {
    const objectId = handleElement.getAttribute("data-canvas-object-id");
    const handle = handleElement.getAttribute("data-canvas-handle") as ResizeHandle | null;
    if (objectId && handle) {
      return { kind: "handle", objectId, handle };
    }
  }
  // NOTE: endpoint circles and connector hit paths are SVG elements
  // (SVGCircleElement/SVGPathElement), so these two branches must check
  // `instanceof Element`, not HTMLElement — an HTMLElement check silently
  // never matches and every connector click used to fall through to the
  // world-space object hit test (W3b fix).
  const endpointElement = target.closest("[data-canvas-endpoint]");
  if (endpointElement instanceof Element) {
    const connectionId = endpointElement.getAttribute("data-canvas-connection-id");
    const end = endpointElement.getAttribute("data-canvas-endpoint") as "from" | "to" | null;
    if (connectionId && end) {
      return { kind: "endpoint", connectionId, end };
    }
  }
  const portElement = target.closest("[data-canvas-port]");
  if (portElement instanceof HTMLElement) {
    const objectId = portElement.getAttribute("data-canvas-object-id");
    const anchor = portElement.getAttribute("data-canvas-port") as Anchor | null;
    if (objectId && anchor) {
      return { kind: "port", objectId, anchor };
    }
  }
  const proximityPort = resolvePortProximityHit(document, world, options);
  if (proximityPort) return proximityPort;
  const bendSegmentElement = target.closest("[data-canvas-bend-segment]");
  if (bendSegmentElement instanceof Element) {
    const connectionId = bendSegmentElement.getAttribute("data-canvas-connection-id");
    const rawSegmentIndex = bendSegmentElement.getAttribute("data-canvas-bend-segment");
    const segmentIndex = rawSegmentIndex === null ? NaN : Number(rawSegmentIndex);
    if (connectionId && Number.isInteger(segmentIndex) && segmentIndex >= 0) {
      return { kind: "bend-segment", connectionId, segmentIndex };
    }
  }
  const connectionElement = target.closest("[data-canvas-connection-id]");
  if (connectionElement instanceof Element) {
    const connectionId = connectionElement.getAttribute("data-canvas-connection-id");
    if (connectionId) return { kind: "connection", connectionId };
  }
  const sectionChipElement = target.closest("[data-canvas-section-title-chip]");
  if (sectionChipElement instanceof HTMLElement) {
    const objectId = sectionChipElement.getAttribute("data-canvas-section-title-chip");
    const object = objectId ? document.objects.find((item) => item.id === objectId) : null;
    if (object?.type === "section") {
      return { kind: "object", objectId: object.id };
    }
  }
  const objectElement = target.closest("[data-canvas-object-id]");
  if (objectElement instanceof HTMLElement) {
    const objectId = objectElement.getAttribute("data-canvas-object-id");
    if (objectId) {
      const object = document.objects.find((item) => item.id === objectId);
      // D16 outline veto (see doc comment above). An id with no matching
      // document object (stale DOM) keeps the pre-D16 behavior.
      if (!object || outlineContainsPoint(object, world)) {
        return { kind: "object", objectId };
      }
    }
  }
  const hit = hitTestObjects(document, world, options);
  if (hit) return { kind: "object", objectId: hit.id };
  return { kind: "canvas" };
}

export interface UseInteractionPipelineArgs {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  tool: CanvasTool;
  /** Suppresses editor gestures while leaving viewport navigation to useCanvasViewport. */
  readOnly?: boolean;
  /** Repeat-placement mode (Shapes panel open): completing a place gesture keeps the tool armed — see InteractionContext.stickyPlacement. */
  stickyPlacement?: boolean;
  /** Catalog-entry variant of the armed tool (Shapes panel pick) — flows into placements and the ghost preview. */
  armedShape?: ArmedShapeVariant;
  /** Per-kind last-picked color memory (D17, reducer state) — ghost-preview fidelity, see InteractionContext.lastPickedColor. */
  lastPickedColor?: InteractionContext["lastPickedColor"];
  viewport: ViewportState;
  dispatch: (action: CanvasAction) => void;
  /** Ungated dispatch used only to restore speculative geometry while entering read-only mode. */
  cancelDispatch?: (action: CanvasAction) => void;
  setViewport: (updater: ViewportState | ((viewport: ViewportState) => ViewportState)) => void;
  screenToWorld: (point: CanvasPoint) => CanvasPoint;
  /** Context-menu feature: any primary pointerdown on the stage closes an open menu. */
  closeContextMenu: () => void;
  /**
   * One-shot signal sink (4.2.1): the interaction machine resolved a
   * double-click to "open the in-place text editor for this object id"; the
   * seed value (existing text ?? machine seed ?? "") is computed here so the
   * text-editing wiring stays byte-identical.
   */
  onOpenObjectTextEditor: (objectId: string, value: string) => void;
  /** Text-editing feature's open fn — section title chip double-clicks route here. */
  openObjectTextEditor: (objectId: string) => void;
}

export interface InteractionPipelineApi {
  /** Mirrored into state so CanvasStage's overlay slot re-renders. */
  interactionOverlay: InteractionOverlay;
  /** Connector-tool hover target whose anchor dots should be shown while idle. */
  hoveredObjectId: string | null;
  /**
   * True while the interaction machine is in a gesture that manipulates the
   * current selection's geometry (`move`, `resize`, `connector-endpoint-drag`,
   * `connector-bend-drag`, `connector-create`); the selection toolbar hides
   * during these so the canvas stays visible mid-drag (FigJam parity).
   */
  selectionDragActive: boolean;
  /** Current machine state — read (not subscribed) by useCanvasHotkeys' Escape handling. */
  interactionStateRef: RefObject<InteractionState>;
  handleStagePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Hover ghost for an armed creation tool: idle-only, no-op during gestures. */
  handleStagePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  handleStagePointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  handleStageDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
  applyCancelInteraction: (result: ReturnType<typeof cancelInteraction>) => void;
}

/**
 * The pointer-interaction / rAF drag pipeline, extracted verbatim from
 * InteractiveCanvasEditor.tsx: hit resolution, the interaction-machine
 * stepping (buildPointerEvent/runInteraction), the frame coalescer, the
 * edge-pan loop, the window-level move/up listeners, and the stage
 * down/double-click handlers. Ref-stability is load-bearing throughout — the
 * rAF callbacks read the latest document/selection/tool/viewport and
 * runInteraction/buildPointerEvent through refs updated every render, never
 * through captured state.
 */
export function useInteractionPipeline({
  document,
  selection,
  tool,
  readOnly = false,
  stickyPlacement = false,
  armedShape,
  lastPickedColor,
  viewport,
  dispatch,
  cancelDispatch = dispatch,
  setViewport,
  screenToWorld,
  closeContextMenu,
  onOpenObjectTextEditor,
  openObjectTextEditor,
}: UseInteractionPipelineArgs): InteractionPipelineApi {
  // Interaction machine: a ref holds the current InteractionState (gestures
  // happen faster than React state updates should be trusted for), while
  // overlay is mirrored into useState so CanvasStage's overlay slot re-renders.
  const interactionStateRef = useRef<InteractionState>(IDLE_INTERACTION_STATE);
  const [interactionOverlay, setInteractionOverlay] = useState<InteractionOverlay>({});
  const [selectionDragActive, setSelectionDragActive] = useState<boolean>(false);
  const stateRef = useRef({
    document,
    selection,
    tool,
    readOnly,
    stickyPlacement,
    armedShape,
    lastPickedColor,
  });
  stateRef.current = {
    document,
    selection,
    tool,
    readOnly,
    stickyPlacement,
    armedShape,
    lastPickedColor,
  };
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const {
    hoveredObjectId,
    hoveredObjectIdRef,
    updateHoverTarget,
    clearHoverTarget,
  } = useHoverTarget({
    document,
    tool,
    zoom: viewport.zoom,
  });

  // Tracks the pointerId + stage element of an in-progress gesture so window-level
  // move/up listeners (attached only while a gesture is active) can keep receiving
  // events even when the pointer leaves the stage's bounding box during a fast drag.
  const activeGestureRef = useRef<{ pointerId: number; stage: HTMLElement } | null>(null);

  const buildPointerEvent = useCallback(
    (
      type: CanvasPointerEvent["type"],
      nativeEvent: Pick<
        PointerEvent,
        "clientX" | "clientY" | "button" | "shiftKey" | "altKey" | "metaKey" | "target"
      >,
      stage: HTMLElement,
    ): CanvasPointerEvent => {
      const screen = stageScreenPointFromClient(nativeEvent, stage);
      const world = screenToWorld(screen);
      const target = nativeEvent.target instanceof Element ? nativeEvent.target : stage;
      const selection = stateRef.current.selection;
      const currentTool = stateRef.current.tool;
      const connectorHoverTargetId = hoveredObjectIdRef.current;
      const portProximityObjectIds =
        currentTool === "select" && selection.kind === "objects"
          ? viewportRef.current.zoom >= ANCHOR_DOTS_MIN_ZOOM
            ? selection.objectIds
            : undefined
          : currentTool === "connector" && connectorHoverTargetId
            ? [connectorHoverTargetId]
          : undefined;
      const hit = resolveHit(target, stateRef.current.document, world, {
        zoom: viewportRef.current.zoom,
        viewport: viewportRef.current,
        screen,
        portProximityObjectIds,
      });
      return {
        type,
        world,
        screen,
        button: nativeEvent.button,
        shiftKey: nativeEvent.shiftKey,
        altKey: nativeEvent.altKey,
        metaKey: nativeEvent.metaKey,
        hit,
      };
    },
    [screenToWorld],
  );

  const runInteraction = useCallback(
    (canvasEvent: CanvasPointerEvent) => {
      if (stateRef.current.readOnly) return;
      const ctx: InteractionContext = {
        document: stateRef.current.document,
        selection: stateRef.current.selection,
        tool: stateRef.current.tool,
        stickyPlacement: stateRef.current.stickyPlacement,
        armedShape: stateRef.current.armedShape,
        lastPickedColor: stateRef.current.lastPickedColor,
        viewport: viewportRef.current,
      };
      const result = stepInteraction(interactionStateRef.current, canvasEvent, ctx);
      interactionStateRef.current = result.state;
      setInteractionOverlay(result.overlay);
      setSelectionDragActive(SELECTION_DRAG_KINDS.has(result.state.kind));
      for (const action of result.dispatch) {
        dispatch(action);
      }
      // One-shot signal (4.2.1): the machine resolved a double-click to "open
      // the in-place text editor for this object id" — for a freshly created
      // object the id was predicted via the same createObjectId() call the
      // canvas.addObject reducer makes, so it's already correct even though
      // the dispatch above hasn't been reflected in `state` yet this tick.
      if (result.overlay.editObjectTextId) {
        const objectId = result.overlay.editObjectTextId;
        const existing = stateRef.current.document.objects.find((item) => item.id === objectId);
        onOpenObjectTextEditor(objectId, existing?.text ?? result.overlay.editObjectTextSeed ?? "");
      }
    },
    [dispatch, onOpenObjectTextEditor],
  );

  // ——— rAF drag pipeline (checkpoint 1, T1.1.1 + T1.2.1) ————————————————————
  //
  // Two cooperating rAF mechanisms, deliberately structured so that at most ONE
  // stepInteraction move-commit happens per animation frame regardless of how
  // many sources produced input that frame:
  //
  //  1. `moveCoalescer` — pointermove events never call stepInteraction
  //     directly; they only record the latest DragPointerSnapshot and schedule
  //     one commit per frame (createFrameCoalescer, latest-wins). pointerup /
  //     pointercancel synchronously flush() a still-pending move BEFORE the
  //     up/cancel is stepped, so the final drag position is never dropped.
  //     Single-shot events (down / double / up / cancel) stay uncoalesced.
  //
  //  2. The edge-pan loop — a self-rescheduling rAF tick that runs for the
  //     whole life of a gesture (started on pointerdown, self-terminates when
  //     activeGestureRef clears). While the interaction is in a drag kind and
  //     the pointer sits inside the stage-edge band, each tick pans the
  //     viewport by computeEdgePan's delta and *pushes the last pointer
  //     snapshot into the same moveCoalescer* rather than stepping directly —
  //     the re-step against the moved viewport then lands on the next frame's
  //     single commit. This keeps geometry following the pan even when no new
  //     pointermove arrives (pointer parked in the band), without ever racing
  //     or double-stepping against real pointermove traffic.
  //
  // The coalescer commit and edge-pan tick read runInteraction/buildPointerEvent
  // through refs (updated every render) so both rAF callbacks — created once —
  // always see the latest document/selection/viewport-closing callbacks.
  const runInteractionRef = useRef(runInteraction);
  runInteractionRef.current = runInteraction;
  const buildPointerEventRef = useRef(buildPointerEvent);
  buildPointerEventRef.current = buildPointerEvent;

  const lastDragPointerRef = useRef<DragPointerSnapshot | null>(null);

  const moveCoalescerRef = useRef<FrameCoalescer<DragPointerSnapshot> | null>(null);
  if (moveCoalescerRef.current === null) {
    moveCoalescerRef.current = createFrameCoalescer<DragPointerSnapshot>(({ event, stage }) => {
      runInteractionRef.current(buildPointerEventRef.current("move", event, stage));
    });
  }
  const moveCoalescer = moveCoalescerRef.current;

  const edgePanFrameRef = useRef<number | null>(null);

  const stopEdgePanLoop = useCallback(() => {
    if (edgePanFrameRef.current !== null) {
      cancelAnimationFrame(edgePanFrameRef.current);
      edgePanFrameRef.current = null;
    }
  }, []);

  const startEdgePanLoop = useCallback(() => {
    if (edgePanFrameRef.current !== null) return;
    const tick = () => {
      edgePanFrameRef.current = null;
      const active = activeGestureRef.current;
      const last = lastDragPointerRef.current;
      // Gesture ended (pointerup/cancel/Escape cleared the refs) — loop stops.
      if (!active || !last) return;
      if (EDGE_PAN_DRAG_KINDS.has(interactionStateRef.current.kind)) {
        const rect = active.stage.getBoundingClientRect();
        const pointer = {
          x: last.event.clientX - rect.left,
          y: last.event.clientY - rect.top,
        };
        const pan = computeEdgePan(
          pointer,
          { width: rect.width, height: rect.height },
          EDGE_PAN_BAND_PX,
          EDGE_PAN_MAX_SPEED_PX,
        );
        if (pan.dx !== 0 || pan.dy !== 0) {
          setViewport((previous) => panBy(previous, pan.dx, pan.dy));
          // Re-step against the moved viewport via the shared coalescer: the
          // commit fires next frame, by which point React has re-rendered and
          // the viewport refs (here and inside useCanvasViewport) hold the
          // panned state — so the dragged geometry keeps following the pan.
          moveCoalescer.push(last);
        }
      }
      edgePanFrameRef.current = requestAnimationFrame(tick);
    };
    edgePanFrameRef.current = requestAnimationFrame(tick);
  }, [moveCoalescer, setViewport]);

  const handleStageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (stateRef.current.readOnly) return;
      if (stateRef.current.tool === "hand") return;
      const stage = stageFromEventTarget(event.currentTarget);
      if (!stage) return;
      const target = event.target instanceof Element ? event.target : null;
      const sectionChip = target?.closest("[data-canvas-section-title-chip]");
      if (sectionChip instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const objectId = sectionChip.getAttribute("data-canvas-section-title-chip");
        if (objectId) openObjectTextEditor(objectId);
        return;
      }
      const sectionObject = target?.closest('[data-canvas-object-type="section"]');
      if (sectionObject) {
        event.preventDefault();
        event.stopPropagation();
        const sectionId = sectionObject.getAttribute("data-canvas-object-id");
        if (sectionId) {
          animateSectionFitToChildren({
            getDocument: () => stateRef.current.document,
            dispatch,
            sectionId,
          });
        }
        return;
      }
      runInteraction(buildPointerEvent("double", event.nativeEvent, stage));
    },
    [buildPointerEvent, dispatch, openObjectTextEditor, runInteraction],
  );

  const onWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (stateRef.current.readOnly) return;
      const active = activeGestureRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      // T1.1.1: record + schedule only — the coalescer commits at most one
      // stepInteraction per animation frame with the latest position.
      const snapshot: DragPointerSnapshot = { event, stage: active.stage };
      lastDragPointerRef.current = snapshot;
      moveCoalescer.push(snapshot);
    },
    [moveCoalescer],
  );

  const onWindowPointerEnd = useCallback(
    (event: PointerEvent) => {
      const active = activeGestureRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      // Flush any coalesced-but-uncommitted move synchronously BEFORE stepping
      // the up/cancel so the final drag position is never dropped behind a
      // frame that will no longer fire.
      moveCoalescer.flush();
      const type = event.type === "pointercancel" ? "cancel" : "up";
      runInteraction(buildPointerEvent(type, event, active.stage));
      activeGestureRef.current = null;
      lastDragPointerRef.current = null;
      stopEdgePanLoop();
    },
    [buildPointerEvent, moveCoalescer, runInteraction, stopEdgePanLoop],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      // Unmount mid-gesture: drop any pending coalesced move (committing into
      // an unmounted tree would be wrong) and stop the edge-pan loop.
      moveCoalescer.cancel();
      stopEdgePanLoop();
    };
  }, [onWindowPointerMove, onWindowPointerEnd, moveCoalescer, stopEdgePanLoop]);

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (stateRef.current.readOnly) return;
      if (stateRef.current.tool === "hand") return;
      const stage = event.currentTarget;
      closeContextMenu();
      activeGestureRef.current = { pointerId: event.pointerId, stage };
      // Seed the pointer snapshot so the edge-pan loop has a position even
      // before the first pointermove, then start the per-gesture rAF loop
      // (it idles cheaply until the interaction enters a drag kind).
      lastDragPointerRef.current = { event: event.nativeEvent, stage };
      startEdgePanLoop();
      runInteraction(buildPointerEvent("down", event.nativeEvent, stage));
      clearHoverTarget();
    },
    [buildPointerEvent, clearHoverTarget, closeContextMenu, runInteraction, startEdgePanLoop],
  );

  // ——— Armed-tool hover ghost (Shapes panel creation flow) ————————————————
  //
  // While a creation tool is armed and NO gesture is in progress, the ghost
  // preview follows the bare cursor so the user can see what a click will
  // place. Gesture-time ghosts stay on the interaction machine's overlay path
  // (stepFromPlace), so both handlers hard-gate on the machine being idle —
  // a stage pointermove firing mid-gesture must never clobber the gesture
  // overlay. Cheap math (no hit-testing/snapping), so no rAF coalescing.
  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (stateRef.current.readOnly) return;
      if (interactionStateRef.current.kind !== "idle") return;
      const stage = event.currentTarget;
      if (stateRef.current.tool === "connector") {
        const screen = stageScreenPointFromClient(event.nativeEvent, stage);
        updateHoverTarget(screenToWorld(screen));
        return;
      }
      const armedType = objectTypeForTool(stateRef.current.tool);
      if (!armedType) return;
      const screen = stageScreenPointFromClient(event.nativeEvent, stage);
      const world = screenToWorld(screen);
      setInteractionOverlay(
        placePreviewOverlayFor(
          armedType,
          defaultGeometryForPlacement(armedType, world),
          stateRef.current.armedShape,
          placePreviewColorFor(armedType, { lastPickedColor: stateRef.current.lastPickedColor }),
        ),
      );
    },
    [screenToWorld, updateHoverTarget],
  );

  const handleStagePointerLeave = useCallback((_event: ReactPointerEvent<HTMLElement>) => {
    clearHoverTarget();
    if (interactionStateRef.current.kind !== "idle") return;
    setInteractionOverlay((previous) => (previous.placePreview ? {} : previous));
  }, [clearHoverTarget]);

  // Disarming the tool (Escape, dock tool pick, panel close) while idle must
  // drop any lingering hover ghost — the pointermove that painted it won't
  // re-fire until the cursor moves again.
  useEffect(() => {
    if (objectTypeForTool(tool)) return;
    if (interactionStateRef.current.kind !== "idle") return;
    setInteractionOverlay((previous) => (previous.placePreview ? {} : previous));
  }, [tool]);

  const applyCancelInteraction = useCallback((result: ReturnType<typeof cancelInteraction>) => {
    // Drop any coalesced-but-uncommitted move and stop edge-panning first: a
    // queued move committing one frame AFTER Escape restored the pre-drag
    // geometry would re-step a gesture the user just cancelled.
    moveCoalescer.cancel();
    stopEdgePanLoop();
    lastDragPointerRef.current = null;
    interactionStateRef.current = result.state;
    setInteractionOverlay(result.overlay);
    setSelectionDragActive(SELECTION_DRAG_KINDS.has(result.state.kind));
    activeGestureRef.current = null;
    for (const action of result.dispatch) {
      cancelDispatch(action);
    }
  }, [cancelDispatch, moveCoalescer, stopEdgePanLoop]);

  useEffect(() => {
    if (!readOnly || interactionStateRef.current.kind === "idle") return;
    applyCancelInteraction(cancelInteraction(interactionStateRef.current));
  }, [applyCancelInteraction, readOnly]);

  return {
    interactionOverlay,
    hoveredObjectId,
    selectionDragActive,
    interactionStateRef,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    handleStageDoubleClick,
    applyCancelInteraction,
  };
}
