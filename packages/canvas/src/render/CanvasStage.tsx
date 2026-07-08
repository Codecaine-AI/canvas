"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  useState,
} from "react";
import {
  documentBounds,
  objectById,
  type CanvasBounds,
} from "../state/geometry";
import { gridBackground } from "./grid";
import type { InteractionOverlay } from "../interaction/interaction";
import { canvasSurfaceStyle } from "../theme";
import type { ViewportState } from "./viewport";
import { ObjectShape } from "./ObjectShape";
import { Connector } from "./connectors/Connector";
import { ConnectionLabelChip } from "./connectors/ConnectionLabelChip";
import { ConnectorDragPreview } from "./connectors/ConnectorDragPreview";
import { SelectionBox } from "./overlays/SelectionBox";
import { AnchorDots, type ActivePort } from "./overlays/AnchorDots";
import { Marquee } from "./overlays/Marquee";
import { PlacePreview } from "./overlays/PlacePreview";
import { SnapGuideLine } from "./overlays/SnapGuideLine";
import { DistributionGuideLine } from "./overlays/DistributionGuideLine";
import { SpacingChips } from "./overlays/SpacingChips";
import type { CanvasTool } from "../state/actions";
import { quickConnectClickPoint } from "../interaction/gestures/connectors";

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
// CHROME.selectCursor (render must not import editor/components/editor-style).
/** FigJam selection blue — matches SelectionBox and the connector chrome. */
const SELECTION_BLUE = "#0D99FF";

const SELECT_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 18 18"><path d="M3.474,2.784L14.897,6.958c.481,.176,.467,.861-.021,1.018l-5.228,1.673-1.673,5.228c-.156,.488-.842,.502-1.018,.021L2.784,3.474c-.157-.43,.26-.847,.69-.69Z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const SELECT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(SELECT_CURSOR_SVG)}") 3 3, default`;
import { OBJECT_DEFS_CSS } from "../objects/object-def";
import type {
  CanvasAnnotationTarget,
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
  /** Ephemeral interaction overlay (marquee, guides, spacing, drop target, connector drag preview). */
  interactionOverlay?: InteractionOverlay;
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
 * Depth is the length of a section's `parentId` ancestor chain (root
 * sections are depth 0). Sections are the only legal parent type, so every
 * ancestor on the chain is a section.
 */
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
export { annotationTargetLabel, renderOrderedObjects, ObjectShape, SelectionBox };

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
 *      - an SVG connector layer (overflow visible, absolutely positioned,
 *        drawn in raw world units — the parent transform handles scaling)
 *      - DOM object shapes positioned with raw world px left/top/width/height
 *  - an untransformed screen-space `overlay` slot: SelectionBox (handles),
 *    marquee rect, and (future) snap guides / spacing chips / drop-target glow.
 */
export function CanvasStage({
  document,
  viewport,
  selectedObjectIds = [],
  changedObjectIds = [],
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
  interactionOverlay,
  editingTextObjectId = null,
  overlay,
  worldOverlay,
  activeTool,
  className,
  style,
  stageRef,
}: CanvasStageProps) {
  const selected = new Set(selectedObjectIds);
  const changed = new Set(changedObjectIds);
  const zoom = viewport.zoom;
  const [hoveredAnchorDot, setHoveredAnchorDot] = useState<ActivePort | null>(null);
  // Bounds passed to interaction callbacks are the document's world bounds.
  // Callers that have migrated to world-space (screenToWorld) can ignore this;
  // it is kept only for backward-compatible callback signatures this checkpoint.
  const bounds: CanvasBounds = documentBounds(document);

  // Zoom-aware dot grid (checkpoint 1, T1.3.1): gridBackground (pure, grid.ts)
  // density-steps the effective world spacing so the rendered dot pitch stays
  // legible at both extremes instead of the fixed-32px grid disappearing when
  // zoomed out or turning into a dense hatch when zoomed in.
  const grid = gridBackground(zoom, { x: viewport.x, y: viewport.y });

  const dropTargetId = interactionOverlay?.dropTargetId;
  const handToolActive = activeTool === "hand";
  const selectToolActive = activeTool === "select";
  const activeConnectorDrag = interactionOverlay?.connectorDrag ?? null;
  const stageCursor =
    style?.cursor ??
    (activeConnectorDrag ? "default" : handToolActive ? "grab" : selectToolActive ? SELECT_CURSOR : undefined);
  const connectorDragSourceObjectId = interactionOverlay?.connectorDrag?.fromObjectId ?? null;
  const connectorDragSourceAnchor = interactionOverlay?.connectorDrag?.fromAnchor ?? null;
  const documentObjectIds = new Set(document.objects.map((object) => object.id));
  const anchorDotObjectIds = [...selectedObjectIds];
  for (const objectId of [connectorDragSourceObjectId]) {
    if (objectId && documentObjectIds.has(objectId) && !anchorDotObjectIds.includes(objectId)) {
      anchorDotObjectIds.push(objectId);
    }
  }
  const hoveredQuickConnectDrag =
    !activeConnectorDrag &&
    Boolean(onStagePointerEvent) &&
    !handToolActive &&
    hoveredAnchorDot &&
    anchorDotObjectIds.includes(hoveredAnchorDot.objectId)
      ? (() => {
          const object = objectById(document, hoveredAnchorDot.objectId);
          if (!object) return null;
          return {
            fromObjectId: hoveredAnchorDot.objectId,
            fromAnchor: hoveredAnchorDot.anchor,
            point: quickConnectClickPoint(object, hoveredAnchorDot.anchor),
          } satisfies NonNullable<InteractionOverlay["connectorDrag"]>;
        })()
      : null;

  return (
    <div
      ref={stageRef}
      className={`interactive-canvas-stage${className ? ` ${className}` : ""}`}
      data-canvas-stage="true"
      data-canvas-hand-tool={handToolActive ? "true" : undefined}
      data-canvas-select-tool={selectToolActive ? "true" : undefined}
      data-canvas-connector-drag={activeConnectorDrag ? "true" : undefined}
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
          W4 z-layering: connectors paint ABOVE section fills (z 1 vs the
          sections' z 0) but BELOW every non-section shape (z 2) — matching
          FigJam, where a connector crossing a section/card backdrop stays
          visible instead of being buried under the tint. See objectStyle.
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
          {document.connections.map((connection) => {
            const fromObject = objectById(document, connection.from.objectId);
            const toObject = objectById(document, connection.to.objectId);
            if (!fromObject || !toObject) return null;
            const isSelected = selectedConnectionId === connection.id;
            const isDragging =
              interactionOverlay?.connectorDrag?.connectionId === connection.id;
            return (
              <Connector
                key={connection.id}
                document={document}
                connection={connection}
                fromObject={fromObject}
                toObject={toObject}
                selected={isSelected}
                dimmed={isDragging}
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
          {renderOrderedObjects(document.objects).map((object) => (
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
        <div
          className="interactive-canvas-layer"
          data-canvas-world-overlay-layer="true"
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 3 }}
        >
          {/*
            Armed-tool ghost preview: the full draft object the placement will
            create (overlay.placePreviewObject, built by the same
            draftPlacedObject the canvas.addObject reducer uses), rendered
            through the real ObjectShape registry semi-transparent — so the
            cursor ghost IS the shape (glyph, direction, label), not a generic
            box. Lives in this pointer-events-none world layer so it pans/zooms
            with the canvas and can never intercept the placement click.
          */}
          {interactionOverlay?.placePreviewObject && (
            <div data-canvas-place-ghost="true" style={{ opacity: 0.55 }}>
              <ObjectShape
                object={interactionOverlay.placePreviewObject}
                selected={false}
                changed={false}
                compact={compact}
                bounds={bounds}
                editable={false}
                zoom={zoom}
              />
            </div>
          )}
          {document.connections.map((connection) => {
            const fromObject = objectById(document, connection.from.objectId);
            const toObject = objectById(document, connection.to.objectId);
            if (!fromObject || !toObject) return null;
            return (
              <ConnectionLabelChip
                key={connection.id}
                connection={connection}
                fromObject={fromObject}
                toObject={toObject}
                obstacles={document.objects}
                onDoubleClick={onConnectionDoubleClick}
              />
            );
          })}
          {!handToolActive && worldOverlay}
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
        <SelectionBox
          document={document}
          viewport={viewport}
          selectedObjectIds={selectedObjectIds}
          interactiveHandles={!handToolActive}
        />
        {/* Anchor dots (D5/D15): def-derived connection anchors on every
            selected object — editor-only (same gate as the old edge ports:
            pointer events wired + not the hand tool). Rendered in this
            screen-space overlay, NOT in object chrome: the object button
            clips overflow, and true-outline anchors sit off the bbox edge. */}
        {Boolean(onStagePointerEvent) && !handToolActive && (
          <AnchorDots
            document={document}
            viewport={viewport}
            selectedObjectIds={anchorDotObjectIds}
            activePort={
              connectorDragSourceObjectId && connectorDragSourceAnchor
                ? { objectId: connectorDragSourceObjectId, anchor: connectorDragSourceAnchor }
                : null
            }
            interactive
            onHoveredAnchorChange={setHoveredAnchorDot}
          />
        )}
        {interactionOverlay?.marquee && (
          <Marquee viewport={viewport} bounds={interactionOverlay.marquee} />
        )}
        {/* Dashed-box fallback only when no full draft object accompanies the
            bounds (all armed-tool paths now provide one — see placePreviewObject). */}
        {interactionOverlay?.placePreview && !interactionOverlay.placePreviewObject && (
          <PlacePreview viewport={viewport} bounds={interactionOverlay.placePreview} />
        )}
        {interactionOverlay?.guides?.map((guide, index) => (
          <SnapGuideLine key={`guide-${guide.axis}-${index}`} viewport={viewport} guide={guide} />
        ))}
        {interactionOverlay?.distributionGuides?.map((segment, index) => (
          <DistributionGuideLine key={`distribution-${index}`} viewport={viewport} segment={segment} />
        ))}
        {interactionOverlay?.spacing?.map((hint, index) => (
          <SpacingChips key={`spacing-${hint.axis}-${index}`} viewport={viewport} hint={hint} />
        ))}
        {hoveredQuickConnectDrag && (
          <ConnectorDragPreview
            document={document}
            viewport={viewport}
            drag={hoveredQuickConnectDrag}
          />
        )}
        {activeConnectorDrag && (
          <ConnectorDragPreview
            document={document}
            viewport={viewport}
            drag={activeConnectorDrag}
          />
        )}
        {overlay}
      </div>
    </div>
  );
}
