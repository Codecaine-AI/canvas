"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildSelectionContext,
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAction,
  type CanvasSelection,
  type CanvasTool,
} from "../model/actions";
import { CanvasStage } from "../render/CanvasStage";
import { FigJamDock, type ToolId } from "../chrome/FigJamDock";
import { ShapesPanel } from "../chrome/ShapesPanel";
import { ZoomControls } from "../chrome/ZoomControls";
import { computeEdgePan } from "../interaction/edge-pan";
import { type CanvasPoint } from "../model/geometry";
import {
  cancelInteraction,
  createFrameCoalescer,
  hitTestObjects,
  IDLE_INTERACTION_STATE,
  stepInteraction,
  type CanvasHit,
  type CanvasPointerEvent,
  type FrameCoalescer,
  type InteractionContext,
  type InteractionOverlay,
  type InteractionState,
  type ResizeHandle,
} from "../interaction/interaction";
import { type Anchor } from "../routing/routing";
import { CanvasContextMenu } from "./features/context-menu/CanvasContextMenu";
import { useCanvasContextMenu } from "./features/context-menu/use-canvas-context-menu";
import { ContextToolbarLayer } from "./features/context-toolbar/ContextToolbarLayer";
import { useContextToolbar } from "./features/context-toolbar/use-context-toolbar";
import { Inspector } from "./features/inspector/Inspector";
import { LabelEditingOverlay } from "./features/label-editing/LabelEditingOverlay";
import { useLabelEditing } from "./features/label-editing/use-label-editing";
import { TopBar } from "./features/top-bar/TopBar";
import { stageFromEventTarget, stageScreenPointFromClient } from "./stage-dom";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useCanvasViewport } from "./use-canvas-viewport";
import { panBy, worldToScreen } from "./viewport";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "../model/schema";

export interface InteractiveCanvasEditorProps {
  document: InteractiveCanvasDocument;
  onSave?: (document: InteractiveCanvasDocument) => void | Promise<void>;
  onCancel?: () => void;
  onDocumentChange?: (document: InteractiveCanvasDocument) => void;
  title?: string;
  titleContent?: ReactNode;
  editableTitle?: boolean;
  showInspector?: boolean;
  topBarLeading?: ReactNode;
  topBarActions?: ReactNode;
}

function reducer(state: ReturnType<typeof createInteractiveCanvasState>, action: CanvasAction) {
  return reduceInteractiveCanvasState(state, action);
}

function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

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
  "marquee",
  "place",
  "connector-endpoint-drag",
  "connector-create",
]);

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

/**
 * Wave 3a — FigJamDock ↔ CanvasTool mapping.
 *
 * The dock speaks a small fixed vocabulary of chrome-level tool ids
 * (ToolId, from chrome/FigJamDock.tsx) while the reducer speaks the much
 * larger CanvasTool vocabulary (one entry per placeable object type, plus
 * select/hand/annotation). Most dock ids map 1:1 to an editor tool; "shapes"
 * is special-cased (it opens ShapesPanel instead of arming a single type —
 * see `shapesPanelOpen` state below).
 */
const DOCK_TOOL_TO_CANVAS_TOOL: Partial<Record<ToolId, CanvasTool>> = {
  select: "select",
  hand: "hand",
  text: "text",
  section: "section",
  sticky: "sticky",
  connector: "select", // quick-connect is driven by hovering a port while in "select", not a distinct tool.
};

/** Inverse of DOCK_TOOL_TO_CANVAS_TOOL, for reflecting reducer tool state back onto the dock's activeTool. */
const CANVAS_TOOL_TO_DOCK_TOOL: Partial<Record<CanvasTool, ToolId>> = {
  select: "select",
  hand: "hand",
  text: "text",
  section: "section",
  sticky: "sticky",
};

/**
 * Every other CanvasTool value (container/process/decision/source-node/
 * document/person/database/chat/pill/arrow-shape/predefined-process/
 * code-block/chip-icon/annotation) is armed exclusively via the Shapes panel
 * or the shape-search swap popover now — the dock's "shapes" button opens
 * that surface (see ShapesPanel wiring below) rather than exposing 16
 * individual per-type buttons as the old toolbar did.
 */
function dockToolForCanvasTool(tool: CanvasTool): ToolId | null {
  return CANVAS_TOOL_TO_DOCK_TOOL[tool] ?? null;
}

/**
 * Resolves a raw pointer event's target into a CanvasHit by walking the DOM:
 * resize handles carry data-canvas-handle + data-canvas-object-id; connector
 * endpoint handles carry data-canvas-endpoint + data-canvas-connection-id;
 * object edge ports carry data-canvas-port + data-canvas-object-id; connector
 * hit paths carry data-canvas-connection-id (checked after endpoint, since an
 * endpoint circle is rendered as a sibling, not inside, the hit path — order
 * here matters only for elements nested under one another); object shapes
 * carry data-canvas-object-id; everything else falls through to a pure
 * world-space hitTestObjects (topmost-first, container border band).
 */
function resolveHit(
  target: Element,
  document: InteractiveCanvasDocument,
  world: CanvasPoint,
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
  const connectionElement = target.closest("[data-canvas-connection-id]");
  if (connectionElement instanceof Element) {
    const connectionId = connectionElement.getAttribute("data-canvas-connection-id");
    if (connectionId) return { kind: "connection", connectionId };
  }
  const objectElement = target.closest("[data-canvas-object-id]");
  if (objectElement instanceof HTMLElement) {
    const objectId = objectElement.getAttribute("data-canvas-object-id");
    if (objectId) return { kind: "object", objectId };
  }
  const hit = hitTestObjects(document, world);
  if (hit) return { kind: "object", objectId: hit.id };
  return { kind: "canvas" };
}

export function InteractiveCanvasEditor({
  document,
  onSave,
  onCancel,
  onDocumentChange,
  title,
  titleContent,
  editableTitle = false,
  showInspector = false,
  topBarLeading,
  topBarActions,
}: InteractiveCanvasEditorProps) {
  const [state, dispatch] = useReducer(reducer, document, createInteractiveCanvasState);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Inline label editing (connector labels + object labels/section titles) —
  // state and callbacks live in editor/features/label-editing.
  const labelEditing = useLabelEditing({ document: state.document, dispatch });
  const {
    labelEditConnectionId,
    objectLabelEditId,
    setObjectLabelEditId,
    setObjectLabelEditValue,
    openConnectionLabelEditor,
    openObjectLabelEditor,
  } = labelEditing;
  // FigJamDock modal rule (Wave 3a scope item 1): while the Shapes panel is
  // open, the dock shows no active tool (activeTool=null) — the panel owns
  // placement-arming until a shape is picked or the panel is dismissed.
  const [shapesPanelOpen, setShapesPanelOpen] = useState(false);
  const { viewport, setViewport, isPanning, controls, screenToWorld } = useCanvasViewport({
    document: state.document,
    stageRef,
    panOnPlainDrag: state.tool === "hand",
  });
  // Right-click context menu (canvas + object variants) — state and actions
  // live in editor/features/context-menu.
  const canvasContextMenu = useCanvasContextMenu({
    document: state.document,
    dispatch,
    screenToWorld,
  });
  const {
    isContextMenuOpen,
    closeContextMenu,
    openCanvasContextMenu,
    openObjectContextMenu,
  } = canvasContextMenu;
  const selectedIds = selectedObjectIds(state.selection);
  const selectedObject = state.document.objects.find((object) => object.id === selectedIds[0]);
  const selectedConnectionId = state.selection.kind === "connection" ? state.selection.connectionId : null;
  const selectedConnection = state.document.connections.find(
    (connection) => connection.id === selectedConnectionId,
  );
  const selectedLinks = selectedObject
    ? (state.document.links ?? []).filter((link) => link.objectId === selectedObject.id)
    : [];
  // Floating ContextToolbar (selection-derived variant/position, flyouts,
  // style-apply actions) — state and actions live in
  // editor/features/context-toolbar.
  const contextToolbar = useContextToolbar({
    document: state.document,
    dispatch,
    selection: state.selection,
    selectedIds,
    selectedConnection,
    selectedConnectionId,
    viewport,
    stageRef,
    controls,
    setObjectLabelEditId,
    setObjectLabelEditValue,
  });
  const { applyPaletteTokenToSelection } = contextToolbar;
  const selectionContext = useMemo(
    () => buildSelectionContext(state.document, state.selection),
    [state.document, state.selection],
  );

  // Interaction machine: a ref holds the current InteractionState (gestures
  // happen faster than React state updates should be trusted for), while
  // overlay is mirrored into useState so CanvasStage's overlay slot re-renders.
  const interactionStateRef = useRef<InteractionState>(IDLE_INTERACTION_STATE);
  const [interactionOverlay, setInteractionOverlay] = useState<InteractionOverlay>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const didReportInitialDocumentRef = useRef(false);

  useEffect(() => {
    if (!didReportInitialDocumentRef.current) {
      didReportInitialDocumentRef.current = true;
      return;
    }
    onDocumentChange?.(state.document);
  }, [onDocumentChange, state.document]);

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
      const hit = resolveHit(target, stateRef.current.document, world);
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
      const ctx: InteractionContext = {
        document: stateRef.current.document,
        selection: stateRef.current.selection,
        tool: stateRef.current.tool,
        viewport: viewportRef.current,
      };
      const result = stepInteraction(interactionStateRef.current, canvasEvent, ctx);
      interactionStateRef.current = result.state;
      setInteractionOverlay(result.overlay);
      for (const action of result.dispatch) {
        dispatch(action);
      }
      // One-shot signal (4.2.1): the machine resolved a double-click to "open
      // the inline label editor for this object id" — for a freshly created
      // object the id was predicted via the same createObjectId() call the
      // canvas.addObject reducer makes, so it's already correct even though
      // the dispatch above hasn't been reflected in `state` yet this tick.
      if (result.overlay.editObjectLabelId) {
        const objectId = result.overlay.editObjectLabelId;
        const existing = stateRef.current.document.objects.find((item) => item.id === objectId);
        setObjectLabelEditId(objectId);
        setObjectLabelEditValue(existing?.label ?? result.overlay.editObjectLabelSeed ?? "");
      }
    },
    [dispatch],
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
      if (stateRef.current.tool === "hand") return;
      const stage = stageFromEventTarget(event.currentTarget);
      if (!stage) return;
      const target = event.target instanceof Element ? event.target : null;
      const sectionChip = target?.closest("[data-canvas-section-title-chip]");
      if (sectionChip instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const objectId = sectionChip.getAttribute("data-canvas-section-title-chip");
        if (objectId) openObjectLabelEditor(objectId);
        return;
      }
      const sectionObject = target?.closest('[data-canvas-object-type="section"]');
      if (sectionObject) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      runInteraction(buildPointerEvent("double", event.nativeEvent, stage));
    },
    [buildPointerEvent, openObjectLabelEditor, runInteraction],
  );

  const onWindowPointerMove = useCallback(
    (event: PointerEvent) => {
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
    },
    [buildPointerEvent, closeContextMenu, runInteraction, startEdgePanLoop],
  );

  const applyCancelInteraction = useCallback((result: ReturnType<typeof cancelInteraction>) => {
    // Drop any coalesced-but-uncommitted move and stop edge-panning first: a
    // queued move committing one frame AFTER Escape restored the pre-drag
    // geometry would re-step a gesture the user just cancelled.
    moveCoalescer.cancel();
    stopEdgePanLoop();
    lastDragPointerRef.current = null;
    interactionStateRef.current = result.state;
    setInteractionOverlay(result.overlay);
    activeGestureRef.current = null;
    for (const action of result.dispatch) {
      dispatch(action);
    }
  }, [dispatch, moveCoalescer, stopEdgePanLoop]);

  const isTypingContextActive = useCallback(
    () => labelEditConnectionId !== null || objectLabelEditId !== null,
    [labelEditConnectionId, objectLabelEditId],
  );

  useCanvasHotkeys({
    document: state.document,
    selection: state.selection,
    dispatch,
    isTypingContextActive,
    interactionStateRef,
    onCancelInteraction: applyCancelInteraction,
    isContextMenuOpen,
    onCloseContextMenu: closeContextMenu,
    controls,
  });

  const handleShapePick = useCallback(
    (shapeType: InteractiveCanvasObjectType) => {
      dispatch({ type: "canvas.setTool", tool: shapeType });
      setShapesPanelOpen(false);
    },
    [dispatch],
  );

  const closeShapesPanel = useCallback(() => setShapesPanelOpen(false), []);

  const handleDockSelectTool = useCallback(
    (tool: ToolId) => {
      if (tool === "shapes") return;
      setShapesPanelOpen(false);
      const canvasTool = DOCK_TOOL_TO_CANVAS_TOOL[tool];
      if (canvasTool) dispatch({ type: "canvas.setTool", tool: canvasTool });
    },
    [dispatch],
  );

  const openShapesPanel = useCallback(() => setShapesPanelOpen(true), []);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      <CanvasStage
        stageRef={stageRef}
        document={state.document}
        viewport={viewport}
        selectedObjectIds={selectedIds}
        changedObjectIds={state.lastChange?.changedObjectIds}
        selectedConnectionId={selectedConnectionId}
        onCanvasContextMenu={openCanvasContextMenu}
        onObjectContextMenu={openObjectContextMenu}
        onConnectionDoubleClick={openConnectionLabelEditor}
        onStagePointerEvent={handleStagePointerDown}
        onStageDoubleClick={handleStageDoubleClick}
        interactionOverlay={interactionOverlay}
        editingLabelObjectId={objectLabelEditId}
        activeTool={state.tool}
        className="h-full"
        style={{
          cursor: isPanning
            ? "grabbing"
            : state.tool === "hand"
              ? "grab"
              : state.tool !== "select"
                ? "crosshair"
                : undefined,
        }}
        worldOverlay={<LabelEditingOverlay labelEditing={labelEditing} zoom={viewport.zoom} />}
      />

      <CanvasContextMenu menu={canvasContextMenu} />

      <TopBar
        title={title}
        titleContent={titleContent}
        editableTitle={editableTitle}
        documentTitle={state.document.title}
        documentId={state.document.id}
        historyPastLength={state.history.past.length}
        historyFutureLength={state.history.future.length}
        dispatch={dispatch}
        onSave={onSave ? () => void onSave(state.document) : undefined}
        onCancel={onCancel}
        topBarLeading={topBarLeading}
        topBarActions={topBarActions}
      />

      {showInspector ? (
        <Inspector
          lastChange={state.lastChange}
          selectedObject={selectedObject}
          selectedConnection={selectedConnection}
          selectedLinks={selectedLinks}
          selectionContext={selectionContext}
          dispatch={dispatch}
          applyPaletteTokenToSelection={applyPaletteTokenToSelection}
        />
      ) : null}

      <ContextToolbarLayer
        toolbar={contextToolbar}
        selectedConnection={selectedConnection}
        dispatch={dispatch}
      />

      {shapesPanelOpen && (
        <div className="pointer-events-auto absolute bottom-4 left-4 top-20 z-30">
          <ShapesPanel
            className="h-full"
            onPick={handleShapePick}
            onClose={closeShapesPanel}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <FigJamDock
          className="pointer-events-auto"
          activeTool={shapesPanelOpen ? null : dockToolForCanvasTool(state.tool)}
          onSelectTool={handleDockSelectTool}
          onOpenShapes={openShapesPanel}
        />
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex items-center justify-end gap-2">
        <ZoomControls
          className="pointer-events-auto"
          zoomPercent={viewport.zoom}
          onZoomIn={controls.zoomIn}
          onZoomOut={controls.zoomOut}
          onZoomPercentClick={controls.zoomTo100}
        />
      </div>
    </div>
  );
}
