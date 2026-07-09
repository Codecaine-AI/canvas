"use client";

/**
 * Stage core draws the document: grid, world transform, persisted objects/connectors,
 * and caller-owned overlay slots. Editor feedback is composed outside.
 */
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  documentBounds,
  objectById,
  type CanvasBounds,
} from "../state/geometry";
import { gridBackground } from "./grid";
import { canvasSurfaceStyle } from "../theme";
import type { ViewportState } from "./viewport";
import { ObjectShape } from "./ObjectShape";
import { Connector, ConnectorSelectionChrome } from "../connectors/Connector";
import { SectionTitleChip } from "../objects/section/SectionTitleChip";
import type { CanvasTool } from "../state/actions";

// ---------------------------------------------------------------------------
// Stage surface constants (moved from theme/tokens.ts in the theme dispersal
// — this stage is their consumer). The board surface is light-only: even the
// app's dark theme renders the canvas SURFACE with these light values.
// ---------------------------------------------------------------------------

/** Board background. */
const CANVAS_BG = "#F5F5F5";
/** Dot color; this alpha reads as #B8B8B8 over the board background. */
const GRID_DOT_COLOR = "rgba(0, 0, 0, 0.25)";
/**
 * Canvas content font. Applied to canvas OBJECTS/labels/stickies via the
 * stage's content root class — never to app chrome (toolbars, panels, etc.
 * keep the app's existing font stack).
 */
const CANVAS_FONT_FAMILY =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Arrowhead geometry as multiples of the connector's stroke width. We use 5x
 * for BOTH base width and length — a slightly long, visually "solid" head.
 */
const CONNECTOR_ARROWHEAD_WIDTH_TO_STROKE_RATIO = 5;
const CONNECTOR_ARROWHEAD_LENGTH_TO_STROKE_RATIO = 5;

// Same kite-shaped pointer as the dock's Select glyph (Nucleo
// maps-location/pointer), filled for cursor use — the tool icon and the
// on-canvas cursor are literally the same form. Inlined from the old
// CHROME.selectCursor (stage core must not import stage/editor/components/editor-style).
// Rendered with a soft drop shadow (padded viewBox so it is not clipped).
/** FigJam selection blue — matches SelectionBox and the connector chrome. */
const SELECTION_BLUE = "#0D99FF";

const SELECT_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-3 -3 24 24"><filter id="cs" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="#000" flood-opacity="0.35"/></filter><path filter="url(#cs)" d="M3.474,2.784L14.897,6.958c.481,.176,.467,.861-.021,1.018l-5.228,1.673-1.673,5.228c-.156,.488-.842,.502-1.018,.021L2.784,3.474c-.157-.43,.26-.847,.69-.69Z" fill="#111" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>';
const SELECT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(SELECT_CURSOR_SVG)}") 8 8, default`;
const CONNECTOR_CURSOR = "crosshair"; // Single sanctioned crosshair use: Connector Mode wiring cursor; pinned by the anchor-dots policy test.
import { OBJECT_DEFS_CSS } from "../objects/object-def";
import type {
  CanvasAnnotationTarget,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
import { paintOrderedObjects } from "../state/z-order";

/** Arrowhead marker geometry, expressed in units of the connector's own stroke width (see marker `<defs>` below). */
const ARROW_LENGTH_RATIO = CONNECTOR_ARROWHEAD_LENGTH_TO_STROKE_RATIO;
const ARROW_WIDTH_RATIO = CONNECTOR_ARROWHEAD_WIDTH_TO_STROKE_RATIO;

export interface CanvasStageProps {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  selectedObjectIds?: string[];
  changedObjectIds?: string[];
  /** Object currently styled as an interaction drop target via ObjectShape props. */
  dropTargetId?: string | null;
  /** Connection currently selected — renders endpoint handles and bend pills. */
  selectedConnectionId?: string | null;
  compact?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onCanvasSelect?: () => void;
  onCanvasContextMenu?: (event: ReactMouseEvent<HTMLElement>, bounds: CanvasBounds) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
  /** Double-click on a connector's hit path or label chip — surfaces the editConnectionLabel intent (3.3.1). */
  onConnectionDoubleClick?: (connectionId: string) => void;
  /**
   * Fired on pointerdown anywhere on the stage — the editor's adapter builds a
   * CanvasPointerEvent from this and feeds it into stepInteraction to start a
   * gesture; subsequent move/up/cancel are tracked via window-level listeners
   * (see InteractiveCanvasEditor) so fast drags that leave the stage bounds
   * keep working. The read-only viewer omits this and gets no interactivity.
   */
  onStagePointerEvent?: (event: ReactPointerEvent<HTMLElement>) => void;
  /**
   * Fired on pointermove over the stage while NO gesture is active — the
   * editor uses it to render the hover ghost (PlacePreview) that follows the
   * cursor while a creation tool is armed via the Shapes panel, before any
   * pointerdown. Gesture moves stay on the window-level listener path.
   */
  onStagePointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Fired when the pointer leaves the stage — clears the armed-tool hover ghost. */
  onStagePointerLeave?: (event: ReactPointerEvent<HTMLElement>) => void;
  /**
   * Fired on native dblclick anywhere on the stage (4.2.1) — the editor's
   * adapter builds a "double" CanvasPointerEvent (same resolveHit pipeline as
   * onStagePointerEvent) and feeds it into stepInteraction, which resolves it
   * to "start editing this object's label". Connector double-click keeps its
   * own dedicated onConnectionDoubleClick path (stopPropagation there prevents
   * this handler from double-firing for that case).
   */
  onStageDoubleClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  /** Object whose text is currently being edited in place (D14) — its at-rest text is hidden while the slot editor is the visible copy. */
  editingTextObjectId?: string | null;
  /** Untransformed screen-space overlay (marquee, guides, handles). */
  overlay?: ReactNode;
  /**
   * World-space overlay rendered inside the transformed world layer (e.g. the
   * inline connector-label editor input) — content here pans/zooms with the
   * canvas; callers scale-compensate manually if they want constant screen size.
   */
  worldOverlay?: ReactNode;
  /** Current editor tool, used to make canvas content inert while panning with the hand tool. */
  activeTool?: CanvasTool;
  /** True while connector drag feedback is active; keeps stage/object cursors byte-compatible. */
  connectorDragActive?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Ref to the root stage element (`[data-canvas-stage="true"]`), e.g. for useCanvasViewport. */
  stageRef?: Ref<HTMLDivElement>;
}

/**
 * FigJam z-layering (W2): sections always render below every non-section
 * object, so shapes/stickies/etc. placed "on top of" a section visually sit
 * on its surface rather than being obscured by it. Among sections
 * themselves, nesting wins: a section nested inside another (sections nest
 * via the same persisted, auto-managed `parentId` membership as every other
 * section child) renders above its ancestors, so the nested section's tint
 * is visibly layered on top rather than blended underneath. Equal-depth
 * sections paint by area descending (larger further back), then schema order,
 * while non-section-vs-non-section order never changes from the document's
 * natural order.
 *
 * CanvasStage splits that paint order into a five-layer world stack:
 * section 0 < connector 1 < object 2 < section header 3 < world overlay 4.
 *
 * Depth is the length of a section's `parentId` ancestor chain (root
 * sections are depth 0). Sections are the only legal parent type, so every
 * ancestor on the chain is a section.
 */
/**
 * Connections in render order: the selected one moves to the end so its
 * selection chrome (endpoint rings, bend pills) and line paint above every
 * sibling connector path — SVG stacks strictly by document order.
 */
function orderedConnections(
  connections: readonly InteractiveCanvasConnection[],
  selectedConnectionId: string | null | undefined,
): readonly InteractiveCanvasConnection[] {
  if (!selectedConnectionId) return connections;
  const selected = connections.filter((connection) => connection.id === selectedConnectionId);
  if (selected.length === 0) return connections;
  return [
    ...connections.filter((connection) => connection.id !== selectedConnectionId),
    ...selected,
  ];
}

function renderOrderedObjects(objects: InteractiveCanvasObject[]): InteractiveCanvasObject[] {
  return paintOrderedObjects(objects);
}

function annotationTargetLabel(target: CanvasAnnotationTarget): string {
  if (target.kind === "object") return target.objectId;
  if (target.kind === "connection") return target.connectionId;
  return "region";
}

// ObjectShape and SelectionBox moved to sibling modules but were part of this
// module's public surface (index.ts re-exports * from here) — keep re-exporting.
export { annotationTargetLabel, renderOrderedObjects, ObjectShape };
export { SelectionBox } from "./overlays/SelectionBox";

/**
 * Shared world-space renderer used by both the read-only viewer (static/fit or
 * view-cropped) and the interactive editor (viewport + overlays).
 *
 * DOM structure:
 *  - `data-canvas-stage` full-size stage div: dot-grid background whose
 *    position/size track the viewport so the grid pans/scales with the world.
 *    Grid metrics come from gridBackground (grid.ts, pure) which density-steps
 *    the effective world spacing (halving/doubling at screen-space thresholds)
 *    so the dot pitch stays legible whether zoomed far out or in close.
 *  - a single transformed "world layer" (`translate(-x*zoom, -y*zoom) scale(zoom)`,
 *    transform-origin 0 0) containing:
 *      - section backdrops at z 0
 *      - an SVG connector layer at z 1 (overflow visible, absolutely
 *        positioned, drawn in raw world units — the parent transform handles
 *        scaling)
 *      - non-section DOM object shapes at z 2
 *      - section title chips at z 3
 *      - world overlays/editors at z 4
 *  - an untransformed screen-space `overlay` slot for caller-owned feedback.
 */
export function CanvasStage({
  document,
  viewport,
  selectedObjectIds = [],
  changedObjectIds = [],
  dropTargetId = null,
  selectedConnectionId = null,
  compact,
  onObjectSelect,
  onCanvasSelect,
  onCanvasContextMenu,
  onObjectContextMenu,
  onConnectionDoubleClick,
  onStagePointerEvent,
  onStagePointerMove,
  onStagePointerLeave,
  onStageDoubleClick,
  editingTextObjectId = null,
  overlay,
  worldOverlay,
  activeTool,
  connectorDragActive,
  className,
  style,
  stageRef,
}: CanvasStageProps) {
  const selected = new Set(selectedObjectIds);
  const changed = new Set(changedObjectIds);
  const zoom = viewport.zoom;
  // Bounds passed to interaction callbacks are the document's world bounds.
  // Callers that have migrated to world-space (screenToWorld) can ignore this;
  // it is kept only for backward-compatible callback signatures this checkpoint.
  const bounds: CanvasBounds = documentBounds(document);

  // Zoom-aware dot grid (checkpoint 1, T1.3.1): gridBackground (pure, grid.ts)
  // density-steps the effective world spacing so the rendered dot pitch stays
  // legible at both extremes instead of the fixed-32px grid disappearing when
  // zoomed out or turning into a dense hatch when zoomed in.
  const grid = gridBackground(zoom, { x: viewport.x, y: viewport.y });
  const orderedObjects = renderOrderedObjects(document.objects);
  const orderedSections = orderedObjects.filter((object) => object.type === "section");

  const handToolActive = activeTool === "hand";
  const selectToolActive = activeTool === "select";
  const connectorToolActive = activeTool === "connector";
  const renderedSelectedConnectionId = connectorToolActive ? null : selectedConnectionId;
  const stageCursor =
    style?.cursor ??
    (connectorToolActive
      ? CONNECTOR_CURSOR
      : connectorDragActive
        ? "default"
        : handToolActive
          ? "grab"
          : selectToolActive
            ? SELECT_CURSOR
            : undefined);

  return (
    <div
      ref={stageRef}
      className={`interactive-canvas-stage${className ? ` ${className}` : ""}`}
      data-canvas-stage="true"
      data-canvas-hand-tool={handToolActive ? "true" : undefined}
      data-canvas-select-tool={selectToolActive ? "true" : undefined}
      data-canvas-connector-tool={connectorToolActive ? "true" : undefined}
      data-canvas-connector-drag={connectorDragActive ? "true" : undefined}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        // FigJam-parity board surface (theme/tokens.ts CANVAS_BG /
        // GRID_DOT_COLOR): fixed light values in BOTH app themes — FigJam's
        // board is light-only, it never dark-themes the canvas surface
        // itself (only chrome around it changes).
        backgroundImage: `radial-gradient(circle, ${GRID_DOT_COLOR} ${grid.dotRadius}px, transparent ${grid.dotRadius}px)`,
        backgroundPosition: grid.backgroundPosition,
        backgroundSize: grid.backgroundSize,
        backgroundColor: CANVAS_BG,
        fontFamily: CANVAS_FONT_FAMILY,
        // Board text (labels, section titles, captions) is chrome, not
        // document text — drags must never sweep a native DOM selection
        // across it. Text-editing surfaces opt back in with user-select:
        // text.
        userSelect: "none",
        WebkitUserSelect: "none",
        ...style,
        cursor: stageCursor,
      }}
      onPointerDown={onStagePointerEvent}
      onPointerMove={onStagePointerMove}
      onPointerLeave={onStagePointerLeave}
      onDoubleClick={onStageDoubleClick}
    >
      <style>{`
        .interactive-canvas-stage {
          --interactive-canvas-grid: ${canvasSurfaceStyle["--interactive-canvas-grid"]};
          --interactive-canvas-guide: ${canvasSurfaceStyle["--interactive-canvas-guide"]};
          --interactive-canvas-highlight: ${canvasSurfaceStyle["--interactive-canvas-highlight"]};
        }
        .interactive-canvas-object {
          position: absolute;
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 6px;
          overflow: hidden;
          border: 2px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          text-align: left;
          font: inherit;
          transform-origin: center;
        }
        .interactive-canvas-object[data-editable="true"] {
          cursor: inherit;
          touch-action: none;
        }
        .interactive-canvas-stage[data-canvas-select-tool="true"] .interactive-canvas-object[data-editable="true"] {
          cursor: ${SELECT_CURSOR};
        }
        .interactive-canvas-stage[data-canvas-connector-drag="true"] .interactive-canvas-object[data-editable="true"] {
          cursor: default;
        }
        .interactive-canvas-object[data-changed="true"] {
          box-shadow: 0 0 0 5px color-mix(in oklab, var(--primary) 18%, transparent);
        }
        .interactive-canvas-object[data-drop-target="true"] {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
          box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 22%, transparent);
        }
        /* Shared z-plumbing for every def-rendered true-outline SVG silhouette
           (polygon shapes, junctions) — infrastructure, not per-shape CSS. */
        .interactive-canvas-true-outline-silhouette {
          z-index: 0;
        }
        .interactive-canvas-stage[data-canvas-hand-tool="true"] .interactive-canvas-object {
          cursor: inherit;
        }
      ${
        /* Two-tier registry (RESTRUCTURE.md step 4): per-kind CSS lives on the
           registered ObjectDefs and is appended after the legacy block above.
           Moved rules only ever ADD specificity over the base rules they
           override (same relative order: base first, per-kind after), so
           relocating them to the tail changes no cascade outcome. */
        OBJECT_DEFS_CSS
      }`}</style>
      <div
        className="interactive-canvas-world-layer"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${-viewport.x * zoom}px, ${-viewport.y * zoom}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/*
          W4 z-layering: section fills (z 0) < connectors (z 1) <
          non-section objects (z 2) < section title chips (z 3) < world
          overlays/editors (z 4). Connectors stay visible over section tint,
          ordinary objects stay above connectors, and section headers float
          FigJam-style above all canvas objects.
        */}
        <svg
          className="interactive-canvas-layer pointer-events-none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            zIndex: 1,
            pointerEvents: handToolActive ? "none" : undefined,
          }}
          aria-hidden="true"
        >
          <defs>
            {/*
              Arrowhead geometry: markerUnits defaults to "strokeWidth", so
              this viewBox is expressed in units of the connector's own
              stroke width — a solid triangle ARROW_LENGTH_RATIO units long
              and ARROW_WIDTH_RATIO units at the base reproduces FigJam's
              5x/4.5x-of-stroke arrowhead (theme/tokens.ts,
              CONNECTOR_ARROWHEAD_*_TO_STROKE_RATIO) regardless of the
              connector's stroke color/width.
            */}
            <marker
              id={`${document.id}-arrow-forward`}
              markerHeight={ARROW_WIDTH_RATIO}
              markerWidth={ARROW_LENGTH_RATIO}
              orient="auto"
              refX={ARROW_LENGTH_RATIO - 0.5}
              refY={ARROW_WIDTH_RATIO / 2}
            >
              {/* context-stroke: the arrowhead inherits the referencing path's
                  stroke, so per-connection colors (connection.color, W4) and
                  selection recoloring apply without per-color marker defs. */}
              <path
                d={`M 0 0 L ${ARROW_LENGTH_RATIO} ${ARROW_WIDTH_RATIO / 2} L 0 ${ARROW_WIDTH_RATIO} Z`}
                fill="context-stroke"
              />
            </marker>
            <marker
              id={`${document.id}-arrow-back`}
              markerHeight={ARROW_WIDTH_RATIO}
              markerWidth={ARROW_LENGTH_RATIO}
              orient="auto-start-reverse"
              refX={ARROW_LENGTH_RATIO - 0.5}
              refY={ARROW_WIDTH_RATIO / 2}
            >
              <path
                d={`M 0 0 L ${ARROW_LENGTH_RATIO} ${ARROW_WIDTH_RATIO / 2} L 0 ${ARROW_WIDTH_RATIO} Z`}
                fill="context-stroke"
              />
            </marker>
          </defs>
          {/* SVG paints in document order, so the selected connection renders
              last: its blue endpoint rings/bend pills (and its own line) must
              not be crossed by sibling connector paths drawn after it. */}
          {orderedConnections(document.connections, renderedSelectedConnectionId).map((connection) => {
            const fromObject = objectById(document, connection.from.objectId);
            const toObject = objectById(document, connection.to.objectId);
            if (!fromObject || !toObject) return null;
            return (
              <Connector
                key={connection.id}
                document={document}
                connection={connection}
                fromObject={fromObject}
                toObject={toObject}
                zoom={zoom}
                onDoubleClick={onConnectionDoubleClick}
              />
            );
          })}
        </svg>
        <div
          className="interactive-canvas-layer"
          data-canvas-object-layer="true"
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: handToolActive ? "none" : undefined }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onCanvasSelect?.();
            }
          }}
          onContextMenu={(event) => {
            if (!onCanvasContextMenu || event.target !== event.currentTarget) return;
            event.preventDefault();
            event.stopPropagation();
            onCanvasContextMenu(event, bounds);
          }}
        >
          {orderedObjects.map((object) => (
            <ObjectShape
              key={object.id}
              object={object}
              selected={selected.has(object.id)}
              changed={changed.has(object.id)}
              dropTarget={dropTargetId === object.id}
              compact={compact}
              bounds={bounds}
              editable={Boolean(onObjectSelect || onStagePointerEvent)}
              zoom={zoom}
              hideText={editingTextObjectId === object.id}
              onObjectSelect={onObjectSelect}
              onObjectContextMenu={onObjectContextMenu}
            />
          ))}
        </div>
        {/* Selected-connection chrome (endpoint rings + bend pills) in its own
            SVG layer ABOVE the object layer (z2) and below section headers:
            shape bodies/borders paint over connector lines by design, but must
            never cover the blue selection affordances. */}
        {(() => {
          if (!renderedSelectedConnectionId) return null;
          const connection = document.connections.find(
            (item) => item.id === renderedSelectedConnectionId,
          );
          if (!connection) return null;
          const fromObject = objectById(document, connection.from.objectId);
          const toObject = objectById(document, connection.to.objectId);
          if (!fromObject || !toObject) return null;
          return (
            <svg
              className="interactive-canvas-layer"
              data-canvas-connection-chrome-layer="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                overflow: "visible",
                zIndex: 3,
                pointerEvents: handToolActive ? "none" : undefined,
              }}
            >
              <ConnectorSelectionChrome
                document={document}
                connection={connection}
                fromObject={fromObject}
                toObject={toObject}
                zoom={zoom}
              />
            </svg>
          );
        })()}
        <div
          className="interactive-canvas-layer"
          data-canvas-section-header-layer="true"
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 3 }}
        >
          {orderedSections.map((section) =>
            editingTextObjectId === section.id ? null : (
              <SectionTitleChip
                key={section.id}
                section={section}
                zoom={zoom}
                bounds={bounds}
                onObjectSelect={onObjectSelect}
                onObjectContextMenu={onObjectContextMenu}
              />
            ),
          )}
        </div>
        <div
          className="interactive-canvas-layer"
          data-canvas-world-overlay-layer="true"
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 4 }}
        >
          {worldOverlay}
        </div>
      </div>
      <div
        className="interactive-canvas-overlay"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        {overlay}
      </div>
    </div>
  );
}
