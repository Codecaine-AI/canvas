"use client";

/**
 * Full interactive canvas editor shell: state, gestures, chrome, and stage slots.
 * The stage renders document content; editor-owned feedback is passed as overlays.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildSelectionContext,
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAction,
  type CanvasSelection,
  type CanvasTool,
} from "../state/actions";
import { CanvasStage } from "../render/CanvasStage";
import { objectTypeForTool } from "../interaction/interaction";
import type { ShapeCatalogEntry } from "../objects/catalog";
import { CanvasDock, type ToolId } from "./components/CanvasDock";
import { ShapesPanel } from "./components/ShapesPanel";
import { ZoomControls } from "./components/ZoomControls";
import { CanvasContextMenu } from "./features/context-menu/CanvasContextMenu";
import { useCanvasContextMenu } from "./features/context-menu/use-canvas-context-menu";
import { SelectionToolbarLayer } from "./features/selection-toolbar/SelectionToolbarLayer";
import { useSelectionToolbar } from "./features/selection-toolbar/use-selection-toolbar";
import { useInteractionPipeline } from "./features/drag-pipeline/use-interaction-pipeline";
import { Inspector } from "./features/inspector/Inspector";
import { TextEditingOverlay } from "./features/text-editing/TextEditingOverlay";
import { useTextEditing } from "./features/text-editing/use-text-editing";
import {
  InteractionFeedbackScreen,
  InteractionFeedbackWorld,
} from "./features/drag-pipeline/InteractionFeedback";
import { TopBar } from "./components/TopBar";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useCanvasViewport } from "./use-canvas-viewport";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "../state/schema";

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

type ShapesPanelPhase = "closed" | "open" | "closing";

/**
 * Wave 3a — CanvasDock ↔ CanvasTool mapping.
 *
 * The dock speaks a small fixed vocabulary of chrome-level tool ids
 * (ToolId, from editor/components/CanvasDock.tsx) while the reducer speaks the much
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
 * Every other CanvasTool value (rectangle/process/decision/
 * document/database/pill/arrow-shape/predefined-process/
 * annotation) is armed exclusively via the Shapes panel or the shape-search
 * swap popover now — the dock's "shapes" button opens
 * that surface (see ShapesPanel wiring below) rather than exposing 16
 * individual per-type buttons as the old toolbar did.
 */
function dockToolForCanvasTool(tool: CanvasTool): ToolId | null {
  return CANVAS_TOOL_TO_DOCK_TOOL[tool] ?? null;
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
  // In-place text editing (connector labels + the unified object text) —
  // state and callbacks live in editor/features/text-editing.
  const textEditing = useTextEditing({ document: state.document, dispatch });
  const {
    labelEditConnectionId,
    objectTextEditId,
    setObjectTextEditId,
    setObjectTextEditValue,
    openConnectionLabelEditor,
    openObjectTextEditor,
  } = textEditing;
  // While the Shapes panel is open, keep the dock's Shapes button highlighted
  // so the bottom chrome reflects the active shape-adding mode.
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
    panOnPlainDrag: state.tool === "hand",
  });
  // Right-click context menu (canvas + object variants) — state and actions
  // live in editor/features/context-menu.
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
  const selectedObject = state.document.objects.find((object) => object.id === selectedIds[0]);
  const selectedConnectionId = state.selection.kind === "connection" ? state.selection.connectionId : null;
  const selectedConnection = state.document.connections.find(
    (connection) => connection.id === selectedConnectionId,
  );
  // Floating SelectionToolbar (selection-derived variant/position, flyouts,
  // style-apply actions) — state and actions live in
  // editor/features/selection-toolbar.
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
  const { applyColorToSelection } = selectionToolbar;
  const selectionContext = useMemo(
    () => buildSelectionContext(state.document, state.selection),
    [state.document, state.selection],
  );

  const didReportInitialDocumentRef = useRef(false);

  useEffect(() => {
    if (!didReportInitialDocumentRef.current) {
      didReportInitialDocumentRef.current = true;
      return;
    }
    onDocumentChange?.(state.document);
  }, [onDocumentChange, state.document]);

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
  // state and handlers live in editor/features/drag-pipeline.
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
    tool: state.tool,
    stickyPlacement: shapesPanelOpen,
    armedShape,
    lastPickedColor: state.lastPickedColor,
    viewport,
    dispatch,
    setViewport,
    screenToWorld,
    closeContextMenu,
    onOpenObjectTextEditor: handleOpenObjectTextEditorFromInteraction,
    openObjectTextEditor,
  });

  const isTypingContextActive = useCallback(
    () => labelEditConnectionId !== null || objectTextEditId !== null,
    [labelEditConnectionId, objectTextEditId],
  );

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
    document: state.document,
    selection: state.selection,
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
        selectedConnectionId={selectedConnectionId}
        dropTargetId={interactionOverlay.dropTargetId}
        onCanvasContextMenu={openCanvasContextMenu}
        onObjectContextMenu={openObjectContextMenu}
        onConnectionDoubleClick={openConnectionLabelEditor}
        onStagePointerEvent={handleStagePointerDown}
        onStagePointerMove={handleStagePointerMove}
        onStagePointerLeave={handleStagePointerLeave}
        onStageDoubleClick={handleStageDoubleClick}
        editingTextObjectId={objectTextEditId}
        activeTool={state.tool}
        connectorDragActive={Boolean(interactionOverlay.connectorDrag)}
        className="h-full"
        style={{
          cursor: isPanning
            ? "grabbing"
            : state.tool === "hand"
              ? "grab"
              : undefined,
        }}
        overlay={
          <InteractionFeedbackScreen
            document={state.document}
            viewport={viewport}
            selectedObjectIds={selectedIds}
            interactionOverlay={interactionOverlay}
            hoveredObjectId={hoveredObjectId}
            activeTool={state.tool}
            interactionEnabled
          />
        }
        worldOverlay={
          <InteractionFeedbackWorld
            document={state.document}
            viewport={viewport}
            interactionOverlay={interactionOverlay}
            activeTool={state.tool}
          >
            <TextEditingOverlay textEditing={textEditing} zoom={viewport.zoom} />
          </InteractionFeedbackWorld>
        }
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
          document={state.document}
          lastChange={state.lastChange}
          selectedObject={selectedObject}
          selectedConnection={selectedConnection}
          selectionContext={selectionContext}
          dispatch={dispatch}
          applyColorToSelection={applyColorToSelection}
        />
      ) : null}

      <SelectionToolbarLayer
        toolbar={selectionToolbar}
        selectedConnection={selectedConnection}
        dispatch={dispatch}
        activeTool={state.tool}
        hidden={selectionDragActive}
      />

      {shapesPanelVisible && (
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
          activeTool={shapesPanelOpen ? "shapes" : dockToolForCanvasTool(state.tool)}
          onSelectTool={handleDockSelectTool}
          onOpenShapes={toggleShapesPanel}
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
