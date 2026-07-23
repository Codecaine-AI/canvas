"use client";

/**
 * Interactive editor is the editing layer on top of the stage core.
 * The stage core draws persisted document content and accepts overlay slots.
 * The viewer is the read-only face that fits and mounts the stage.
 * This editor adds tools, gestures, trim, text editing, and inspector state.
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAction,
  type CanvasAgentPatchOperation,
  type CanvasChangeSummary,
  type CanvasSelection,
  type CanvasTool,
} from "../../state/actions";
import { fitBounds, type ViewportState } from "../viewport";
import { CanvasStage } from "../CanvasStage";
import { objectTypeForTool } from "./features/place/place";
import type { ShapeCatalogEntry } from "../../objects/catalog";
import { CanvasDock, type ToolId } from "./components/CanvasDock";
import { ShapesPanel } from "./components/ShapesPanel";
import { ZoomControls } from "./components/ZoomControls";
import { CanvasContextMenu } from "./features/context-menu/CanvasContextMenu";
import { useCanvasContextMenu } from "./features/context-menu/use-canvas-context-menu";
import { AnnotateFeedback } from "./features/annotate/AnnotateFeedback";
import { AnnotationPins } from "./features/annotate/AnnotationPins";
import { AnnotationHint, AnnotationPopup } from "./features/annotate/AnnotationPopup";
import { annotationTargetLabel } from "./features/annotate/target-label";
import { useAnnotateMode } from "./features/annotate/use-annotate-mode";
import { SelectionToolbarLayer } from "./features/selection-toolbar/SelectionToolbarLayer";
import { useSelectionToolbar } from "./features/selection-toolbar/use-selection-toolbar";
import { useInteractionPipeline } from "./pipeline/use-interaction-pipeline";
import { TextEditingOverlay } from "./features/text-editing/TextEditingOverlay";
import { useTextEditing } from "./features/text-editing/use-text-editing";
import {
  InteractionFeedbackScreen,
  InteractionFeedbackWorld,
} from "./pipeline/InteractionFeedback";
import { TopBar } from "./components/TopBar";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useCanvasViewport } from "../../navigation/use-canvas-viewport";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "../../state/schema";

/** Point-in-time editor state a caller can pull through the imperative handle. */
export interface InteractiveCanvasEditorSnapshot {
  selection: CanvasSelection;
  /** The LIVE pan/zoom camera (useCanvasViewport), not anything persisted on the document. */
  viewport: ViewportState;
}

/** Payload for `onEditorStateChange` — the snapshot plus current tool and last change summary. */
export interface InteractiveCanvasEditorState extends InteractiveCanvasEditorSnapshot {
  tool: CanvasTool;
  lastChange?: CanvasChangeSummary;
}

/**
 * Imperative handle exposed via the `ref` prop — the agent apply path's
 * doorway into an open (uncontrolled) editor: pull selection/viewport for
 * invoke context, push a committed patch as one canvas.applyAgentPatch
 * dispatch (one undo step, `source: "agent"` halo).
 */
export interface InteractiveCanvasEditorHandle {
  getEditorSnapshot(): InteractiveCanvasEditorSnapshot;
  dispatchAgentPatch(operations: CanvasAgentPatchOperation[], summary?: string): void;
  setTool(tool: CanvasTool): void;
  revealRect(rect: { x: number; y: number; width: number; height: number }): void;
}

export interface InteractiveCanvasEditorProps {
  document: InteractiveCanvasDocument;
  onSave?: (document: InteractiveCanvasDocument) => void | Promise<void>;
  onCancel?: () => void;
  onDocumentChange?: (document: InteractiveCanvasDocument) => void;
  /**
   * Fired (post-render effect) whenever selection, viewport, tool, or
   * lastChange changes — the dev rail / agent-context subscription. Not
   * called for unrelated re-renders.
   */
  onEditorStateChange?: (state: InteractiveCanvasEditorState) => void;
  /** Imperative handle (React 19 ref-as-prop): see InteractiveCanvasEditorHandle. */
  ref?: Ref<InteractiveCanvasEditorHandle>;
  title?: string;
  titleContent?: ReactNode;
  editableTitle?: boolean;
  topBarLeading?: ReactNode;
  topBarActions?: ReactNode;
  /** Caller-owned content appended after editor feedback in the transformed world layer. */
  worldOverlay?: ReactNode;
  /** Caller-owned content appended after editor feedback in the screen-space overlay. */
  screenOverlay?: ReactNode;
  /** Locks document and selection editing while keeping viewport navigation active. */
  cameraOnly?: boolean;
}

function reducer(state: ReturnType<typeof createInteractiveCanvasState>, action: CanvasAction) {
  return reduceInteractiveCanvasState(state, action);
}

function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

type ShapesPanelPhase = "closed" | "open" | "closing";

/**
 * Wave 3a — CanvasDock ↔ CanvasTool mapping.
 *
 * The dock speaks a small fixed vocabulary of trim-level tool ids
 * (ToolId, from stage/editor/components/CanvasDock.tsx) while the reducer speaks the much
 * larger CanvasTool vocabulary (one entry per placeable object type, plus
 * select/hand/annotation/connector). Most dock ids map 1:1 to an editor tool;
 * "shapes" is special-cased (it opens ShapesPanel instead of arming a single
 * type — see `shapesPanelOpen` state below).
 */
const DOCK_TOOL_TO_CANVAS_TOOL: Partial<Record<ToolId, CanvasTool>> = {
  select: "select",
  hand: "hand",
  section: "section",
  sticky: "sticky",
  connector: "connector", // The dock button arms the dedicated connector tool.
};

/** Inverse of DOCK_TOOL_TO_CANVAS_TOOL, for reflecting reducer tool state back onto the dock's activeTool. */
const CANVAS_TOOL_TO_DOCK_TOOL: Partial<Record<CanvasTool, ToolId>> = {
  select: "select",
  hand: "hand",
  section: "section",
  sticky: "sticky",
  connector: "connector",
};

/**
 * Placeable tools outside this map are armed through the Shapes panel or its
 * search popover. The non-placeable annotation tool is keyboard-only (E), so
 * it deliberately has no dock mapping or active dock button.
 */
function dockToolForCanvasTool(tool: CanvasTool): ToolId | null {
  return CANVAS_TOOL_TO_DOCK_TOOL[tool] ?? null;
}

export function InteractiveCanvasEditor({
  document,
  onSave,
  onCancel,
  onDocumentChange,
  onEditorStateChange,
  ref,
  title,
  titleContent,
  editableTitle = false,
  topBarLeading,
  topBarActions,
  worldOverlay,
  screenOverlay,
  cameraOnly = false,
}: InteractiveCanvasEditorProps) {
  const [state, dispatchCanvasAction] = useReducer(reducer, document, createInteractiveCanvasState);
  const cameraOnlyRef = useRef(cameraOnly);
  cameraOnlyRef.current = cameraOnly;
  const dispatch = useCallback(
    (action: CanvasAction) => {
      if (!cameraOnlyRef.current) dispatchCanvasAction(action);
    },
    [],
  );
  const activeTool: CanvasTool = cameraOnly ? "hand" : state.tool;
  const stageRef = useRef<HTMLDivElement | null>(null);
  // In-place text editing (connector labels + the unified object text) —
  // state and callbacks live in stage/editor/features/text-editing.
  const textEditing = useTextEditing({ document: state.document, dispatch });
  const {
    labelEditConnectionId,
    objectTextEditId,
    setObjectTextEditId,
    setObjectTextEditValue,
    openConnectionLabelEditor,
    openObjectTextEditor,
    cancelConnectionLabelEdit,
    cancelObjectTextEdit,
  } = textEditing;
  // While the Shapes panel is open, keep the dock's Shapes button highlighted
  // so the bottom trim reflects the active shape-adding mode.
  const [shapesPanelPhase, setShapesPanelPhase] = useState<ShapesPanelPhase>("closed");
  const shapesPanelOpen = shapesPanelPhase === "open";
  const shapesPanelVisible = shapesPanelPhase !== "closed";
  const shapesPanelClosing = shapesPanelPhase === "closing";
  // Last catalog entry picked in the Shapes panel — drives the panel's violet
  // highlight AND the armed variant (direction/icon/label) that placements and
  // the ghost preview carry. Both derive against state.tool below so they
  // clear the moment anything disarms or re-arms the tool (Escape, dock pick,
  // hotkey); a hotkey-armed tool has no entry and places the bare type.
  const [pickedShapeEntry, setPickedShapeEntry] = useState<ShapeCatalogEntry | null>(null);
  const armedShapeEntry =
    pickedShapeEntry && state.tool === pickedShapeEntry.objectType ? pickedShapeEntry : null;
  const selectedShapeEntryId = armedShapeEntry?.id ?? null;
  const armedShape = useMemo(
    () =>
      armedShapeEntry
        ? {
            direction: armedShapeEntry.direction,
            icon: armedShapeEntry.icon,
            // Advanced-tier icons read their glyph's display name ("Database"),
            // not the generic per-type default ("Icon").
            text: armedShapeEntry.objectType === "icon" ? armedShapeEntry.label : undefined,
          }
        : undefined,
    [armedShapeEntry],
  );
  const { viewport, setViewport, isPanning, controls, screenToWorld } = useCanvasViewport({
    document: state.document,
    stageRef,
    panOnPlainDrag: activeTool === "hand",
  });
  const annotateModeActive = activeTool === "annotation";
  const annotateMode = useAnnotateMode({
    document: state.document,
    enabled: annotateModeActive && !cameraOnly,
    dispatch,
    screenToWorld,
    zoom: viewport.zoom,
  });
  // Right-click context menu (canvas + object variants) — state and actions
  // live in stage/editor/features/context-menu.
  const canvasContextMenu = useCanvasContextMenu({
    document: state.document,
    dispatch,
    screenToWorld,
    zoom: viewport.zoom,
  });
  const {
    isContextMenuOpen,
    closeContextMenu,
    openCanvasContextMenu,
    openObjectContextMenu,
  } = canvasContextMenu;
  const selectedIds = selectedObjectIds(state.selection);
  const annotationPopupTarget = annotateMode.popup
    ? state.document.objects.find((object) => object.id === annotateMode.popup?.objectId)
    : undefined;
  const selectedConnectionId = state.selection.kind === "connection" ? state.selection.connectionId : null;
  const selectedConnection = state.document.connections.find(
    (connection) => connection.id === selectedConnectionId,
  );
  // Floating SelectionToolbar (selection-derived variant/position, flyouts,
  // style-apply actions) — state and actions live in
  // stage/editor/features/selection-toolbar.
  const selectionToolbar = useSelectionToolbar({
    document: state.document,
    dispatch,
    selection: state.selection,
    selectedIds,
    selectedConnection,
    selectedConnectionId,
    viewport,
    stageRef,
    openObjectTextEditor,
    openConnectionLabelEditor,
  });
  const { setOpenFlyout } = selectionToolbar;

  useEffect(() => {
    if (!annotateModeActive) return;
    closeContextMenu();
    setOpenFlyout(null);
    setShapesPanelPhase("closed");
    setPickedShapeEntry(null);
  }, [annotateModeActive, closeContextMenu, setOpenFlyout]);


  const didReportInitialDocumentRef = useRef(false);

  useEffect(() => {
    if (!didReportInitialDocumentRef.current) {
      didReportInitialDocumentRef.current = true;
      return;
    }
    onDocumentChange?.(state.document);
  }, [onDocumentChange, state.document]);

  // Imperative handle (agent apply path): getEditorSnapshot reads through
  // refs so the handle identity is stable while snapshots stay live —
  // selection from the reducer, viewport from useCanvasViewport (the live
  // camera; the document carries no viewport). dispatchAgentPatch funnels
  // into the same reducer as every human action (dispatch is stable).
  const selectionRef = useRef(state.selection);
  selectionRef.current = state.selection;
  const liveViewportRef = useRef(viewport);
  liveViewportRef.current = viewport;

  useImperativeHandle(
    ref,
    () => ({
      getEditorSnapshot: () => ({
        selection: selectionRef.current,
        viewport: liveViewportRef.current,
      }),
      dispatchAgentPatch: (operations, summary) => {
        dispatchCanvasAction({ type: "canvas.applyAgentPatch", operations, summary });
      },
      setTool: (tool) => {
        dispatch({ type: "canvas.setTool", tool });
      },
      revealRect: (rect) => {
        const stageRect = stageRef.current?.getBoundingClientRect();
        if (!stageRect || stageRect.width <= 0 || stageRect.height <= 0) return;
        setViewport(
          fitBounds(rect, { width: stageRect.width, height: stageRect.height }),
        );
      },
    }),
    [],
  );

  // Editor-state subscription (dev rail / agent invoke context): fires only
  // when selection, viewport, tool, or lastChange actually change.
  useEffect(() => {
    onEditorStateChange?.({
      selection: state.selection,
      viewport,
      tool: state.tool,
      lastChange: state.lastChange,
    });
  }, [onEditorStateChange, state.selection, state.lastChange, state.tool, viewport]);

  // One-shot signal sink for the interaction machine's double-click
  // text-edit intent. Existing objects open through the editability-aware
  // useTextEditing opener; freshly created objects may not be present in
  // state.document yet, so that path keeps the pipeline's seed value.
  const handleOpenObjectTextEditorFromInteraction = useCallback(
    (objectId: string, value: string) => {
      const existing = state.document.objects.find((object) => object.id === objectId);
      if (existing) {
        openObjectTextEditor(objectId);
        return;
      }
      setObjectTextEditId(objectId);
      setObjectTextEditValue(value);
    },
    [openObjectTextEditor, setObjectTextEditId, setObjectTextEditValue, state.document.objects],
  );

  // Pointer-interaction / rAF drag pipeline (hit resolution, interaction
  // machine stepping, frame coalescer, edge-pan loop, window listeners) —
  // state and handlers live in stage/editor/pipeline.
  const {
    interactionOverlay,
    hoveredObjectId,
    selectionDragActive,
    interactionStateRef,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    handleStageDoubleClick,
    applyCancelInteraction,
  } = useInteractionPipeline({
    document: state.document,
    selection: state.selection,
    tool: activeTool,
    readOnly: cameraOnly || annotateModeActive,
    stickyPlacement: shapesPanelOpen,
    armedShape,
    lastPickedColor: state.lastPickedColor,
    viewport,
    dispatch,
    cancelDispatch: dispatchCanvasAction,
    setViewport,
    screenToWorld,
    closeContextMenu,
    onOpenObjectTextEditor: handleOpenObjectTextEditorFromInteraction,
    openObjectTextEditor,
  });

  const isTypingContextActive = useCallback(
    () => !cameraOnly && (labelEditConnectionId !== null || objectTextEditId !== null),
    [cameraOnly, labelEditConnectionId, objectTextEditId],
  );

  const previousCameraOnlyRef = useRef(false);
  useEffect(() => {
    if (previousCameraOnlyRef.current === cameraOnly) return;
    previousCameraOnlyRef.current = cameraOnly;
    dispatchCanvasAction({ type: "canvas.setTool", tool: cameraOnly ? "hand" : "select" });
    if (!cameraOnly) return;
    closeContextMenu();
    cancelConnectionLabelEdit();
    cancelObjectTextEdit();
    setOpenFlyout(null);
    setShapesPanelPhase("closed");
    setPickedShapeEntry(null);
  }, [
    cameraOnly,
    cancelConnectionLabelEdit,
    cancelObjectTextEdit,
    closeContextMenu,
    setOpenFlyout,
  ]);

  // Picking a shape arms its creation tool but keeps the panel open — the
  // Shapes creation flow is a mode: ghost preview follows the cursor, each
  // canvas click places another object (stickyPlacement below), and the mode
  // only ends via dock tool pick / panel close / Escape.
  const handleShapePick = useCallback(
    (shapeType: InteractiveCanvasObjectType) => {
      dispatch({ type: "canvas.setTool", tool: shapeType });
    },
    [dispatch],
  );

  const handleShapePickEntry = useCallback((entry: ShapeCatalogEntry) => {
    setPickedShapeEntry(entry);
  }, []);

  // Closing the panel exits placement mode: any panel-armed creation tool
  // reverts to select so no invisible armed tool outlives its highlight.
  const closeShapesPanel = useCallback(() => {
    setShapesPanelPhase((phase) => (phase === "closed" ? "closed" : "closing"));
    setPickedShapeEntry(null);
    if (objectTypeForTool(state.tool) && state.tool !== "sticky" && state.tool !== "section") {
      dispatch({ type: "canvas.setTool", tool: "select" });
    }
  }, [dispatch, state.tool]);

  const finishClosingShapesPanel = useCallback(() => {
    setShapesPanelPhase((phase) => (phase === "closing" ? "closed" : phase));
  }, []);

  const handleDockSelectTool = useCallback(
    (tool: ToolId) => {
      if (tool === "shapes") return;
      closeShapesPanel();
      const canvasTool = DOCK_TOOL_TO_CANVAS_TOOL[tool];
      if (canvasTool) dispatch({ type: "canvas.setTool", tool: canvasTool });
    },
    [closeShapesPanel, dispatch],
  );

  const openShapesPanel = useCallback(() => setShapesPanelPhase("open"), []);
  const toggleShapesPanel = useCallback(() => {
    if (shapesPanelOpen) {
      closeShapesPanel();
      return;
    }
    openShapesPanel();
  }, [closeShapesPanel, openShapesPanel, shapesPanelOpen]);

  const handleDockHotkeyTool = useCallback(
    (tool: ToolId) => {
      if (tool === "shapes") toggleShapesPanel();
      handleDockSelectTool(tool);
    },
    [handleDockSelectTool, toggleShapesPanel],
  );

  // Escape (via useCanvasHotkeys, after gesture-cancel and context-menu):
  // first press disarms the creation tool but leaves the panel open for
  // another pick; with nothing armed, it closes the panel. Returns false to
  // let Escape fall through to clear-selection when neither applies.
  const handleEscapeExitPlacement = useCallback(() => {
    if (objectTypeForTool(state.tool)) {
      dispatch({ type: "canvas.setTool", tool: "select" });
      setPickedShapeEntry(null);
      return true;
    }
    if (state.tool === "connector") {
      dispatch({ type: "canvas.setTool", tool: "select" });
      return true;
    }
    if (shapesPanelOpen) {
      closeShapesPanel();
      return true;
    }
    return false;
  }, [closeShapesPanel, dispatch, shapesPanelOpen, state.tool]);

  useCanvasHotkeys({
    cameraOnly,
    document: state.document,
    selection: state.selection,
    tool: activeTool,
    dispatch,
    onSelectDockTool: handleDockHotkeyTool,
    isTypingContextActive,
    interactionStateRef,
    onCancelInteraction: applyCancelInteraction,
    isContextMenuOpen,
    onCloseContextMenu: closeContextMenu,
    onEscapeExitPlacement: handleEscapeExitPlacement,
    controls,
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      <CanvasStage
        stageRef={stageRef}
        document={state.document}
        viewport={viewport}
        selectedObjectIds={selectedIds}
        changedObjectIds={
          // The data-changed halo exists to flag what an AGENT changed on the
          // board; a human's own direct manipulation (place/move/resize) must
          // not decorate itself — the ring lingered on every touched object
          // until the next action, reading as a stray gray border.
          state.lastChange?.source === "agent" ? state.lastChange.changedObjectIds : undefined
        }
        selectedConnectionId={annotateModeActive ? null : selectedConnectionId}
        dropTargetId={interactionOverlay.dropTargetId}
        onCanvasContextMenu={cameraOnly ? undefined : openCanvasContextMenu}
        onObjectContextMenu={cameraOnly ? undefined : openObjectContextMenu}
        onConnectionDoubleClick={
          cameraOnly || annotateModeActive ? undefined : openConnectionLabelEditor
        }
        onStagePointerEvent={
          cameraOnly
            ? undefined
            : annotateModeActive
              ? (event) => {
                  closeContextMenu();
                  annotateMode.handleStagePointerDown(event);
                }
              : handleStagePointerDown
        }
        onStagePointerMove={
          cameraOnly
            ? undefined
            : annotateModeActive
              ? annotateMode.handleStagePointerMove
              : handleStagePointerMove
        }
        onStagePointerLeave={
          cameraOnly
            ? undefined
            : annotateModeActive
              ? annotateMode.handleStagePointerLeave
              : handleStagePointerLeave
        }
        onStageDoubleClick={cameraOnly || annotateModeActive ? undefined : handleStageDoubleClick}
        editingTextObjectId={cameraOnly ? null : objectTextEditId}
        activeTool={activeTool}
        connectorDragActive={
          !cameraOnly && !annotateModeActive && Boolean(interactionOverlay.connectorDrag)
        }
        className="h-full"
        style={{
          cursor: isPanning
            ? "grabbing"
            : activeTool === "hand"
              ? "grab"
              : annotateModeActive
                ? "crosshair"
                : undefined,
        }}
        overlay={
          <>
            <InteractionFeedbackScreen
              document={state.document}
              viewport={viewport}
              selectedObjectIds={annotateModeActive ? [] : selectedIds}
              interactionOverlay={interactionOverlay}
              hoveredObjectId={hoveredObjectId}
              activeTool={activeTool}
              interactionEnabled={!cameraOnly && !annotateModeActive}
            />
            {annotateModeActive ? (
              <AnnotateFeedback
                document={state.document}
                viewport={viewport}
                hoveredObjectId={annotateMode.hoveredObjectId}
                selectedObjectIds={selectedIds}
              />
            ) : null}
            {annotateMode.popup && annotationPopupTarget ? (
              <AnnotationPopup
                key={`${annotateMode.popup.objectId}:${annotateMode.popup.anchor.x}:${annotateMode.popup.anchor.y}`}
                anchor={annotateMode.popup.anchor}
                targetLabel={annotationTargetLabel(annotationPopupTarget)}
                onSave={annotateMode.saveAnnotation}
                onCancel={annotateMode.cancelPopup}
              />
            ) : null}
            {annotateMode.hint ? (
              <AnnotationHint
                anchor={annotateMode.hint.anchor}
                message={annotateMode.hint.message}
              />
            ) : null}
            {screenOverlay}
          </>
        }
        worldOverlay={
          <>
            <InteractionFeedbackWorld
              document={state.document}
              viewport={viewport}
              interactionOverlay={interactionOverlay}
              activeTool={activeTool}
            >
              <TextEditingOverlay textEditing={textEditing} zoom={viewport.zoom} />
            </InteractionFeedbackWorld>
            {!cameraOnly ? (
              <AnnotationPins
                document={state.document}
                selection={state.selection}
                dispatch={dispatch}
                zoom={viewport.zoom}
              />
            ) : null}
            {worldOverlay}
          </>
        }
      />

      {cameraOnly ? null : <CanvasContextMenu menu={canvasContextMenu} />}

      <TopBar
        title={title}
        titleContent={titleContent}
        editableTitle={editableTitle && !cameraOnly}
        document={state.document}
        documentTitle={state.document.title}
        documentId={state.document.id}
        dispatch={dispatch}
        onSave={onSave ? () => void onSave(state.document) : undefined}
        onCancel={onCancel}
        topBarLeading={topBarLeading}
        topBarActions={topBarActions}
      />

      <SelectionToolbarLayer
        toolbar={selectionToolbar}
        selectedConnection={selectedConnection}
        dispatch={dispatch}
        activeTool={activeTool}
        hidden={cameraOnly || annotateModeActive || selectionDragActive}
      />

      {!cameraOnly && shapesPanelVisible && (
        <div className={`${shapesPanelClosing ? "pointer-events-none" : "pointer-events-auto"} absolute bottom-4 left-4 top-20 z-30`}>
          <ShapesPanel
            className="h-full"
            exiting={shapesPanelClosing}
            selectedEntryId={selectedShapeEntryId}
            onPick={handleShapePick}
            onPickEntry={handleShapePickEntry}
            onClose={closeShapesPanel}
            onExitComplete={finishClosingShapesPanel}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <CanvasDock
          className="pointer-events-auto"
          activeTool={shapesPanelOpen ? "shapes" : dockToolForCanvasTool(activeTool)}
          onSelectTool={handleDockSelectTool}
          onOpenShapes={toggleShapesPanel}
          disabled={cameraOnly}
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
