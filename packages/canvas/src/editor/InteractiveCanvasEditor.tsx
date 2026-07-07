"use client";

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
import { CanvasDock, type ToolId } from "./components/CanvasDock";
import { ShapesPanel } from "./components/ShapesPanel";
import { ZoomControls } from "./components/ZoomControls";
import { CanvasContextMenu } from "./features/context-menu/CanvasContextMenu";
import { useCanvasContextMenu } from "./features/context-menu/use-canvas-context-menu";
import { SelectionToolbarLayer } from "./features/selection-toolbar/SelectionToolbarLayer";
import { useSelectionToolbar } from "./features/selection-toolbar/use-selection-toolbar";
import { useInteractionPipeline } from "./features/drag-pipeline/use-interaction-pipeline";
import { Inspector } from "./features/inspector/Inspector";
import { LabelEditingOverlay } from "./features/label-editing/LabelEditingOverlay";
import { useLabelEditing } from "./features/label-editing/use-label-editing";
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

/**
 * Wave 3a — CanvasDock ↔ CanvasTool mapping.
 *
 * The dock speaks a small fixed vocabulary of chrome-level tool ids
 * (ToolId, from editor/components/CanvasDock.tsx) while the reducer speaks the much
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
 * Every other CanvasTool value (rectangle/process/decision/source-node/
 * document/person/database/chat/pill/arrow-shape/predefined-process/
 * code-block/chip-icon/annotation) is armed exclusively via the Shapes panel
 * or the shape-search swap popover now — the dock's "shapes" button opens
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
  // CanvasDock modal rule (Wave 3a scope item 1): while the Shapes panel is
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
    controls,
    setObjectLabelEditId,
    setObjectLabelEditValue,
  });
  const { applyPaletteTokenToSelection } = selectionToolbar;
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
  // label-edit intent — seeds the inline object label editor via the raw
  // setters with the value the pipeline computed, keeping the pre-extraction
  // wiring byte-identical.
  const handleOpenObjectLabelEditorFromInteraction = useCallback(
    (objectId: string, value: string) => {
      setObjectLabelEditId(objectId);
      setObjectLabelEditValue(value);
    },
    [setObjectLabelEditId, setObjectLabelEditValue],
  );

  // Pointer-interaction / rAF drag pipeline (hit resolution, interaction
  // machine stepping, frame coalescer, edge-pan loop, window listeners) —
  // state and handlers live in editor/features/drag-pipeline.
  const {
    interactionOverlay,
    interactionStateRef,
    handleStagePointerDown,
    handleStageDoubleClick,
    applyCancelInteraction,
  } = useInteractionPipeline({
    document: state.document,
    selection: state.selection,
    tool: state.tool,
    viewport,
    dispatch,
    setViewport,
    screenToWorld,
    closeContextMenu,
    onOpenObjectLabelEditor: handleOpenObjectLabelEditorFromInteraction,
    openObjectLabelEditor,
  });

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

      <SelectionToolbarLayer
        toolbar={selectionToolbar}
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
        <CanvasDock
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
