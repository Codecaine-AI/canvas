"use client";

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
  sectionDescendantIds,
  type CanvasBounds,
} from "../state/geometry";
import { gridBackground } from "./grid";
import type { InteractionOverlay } from "../interaction/interaction";
import { canvasSurfaceStyle, TEXT_SIZES_PX } from "../theme";
import type { ViewportState } from "./viewport";
import { ObjectShape } from "./ObjectShape";
import { Connector } from "./connectors/Connector";
import { ConnectionLabelChip } from "./connectors/ConnectionLabelChip";
import { ConnectorDragPreview } from "./connectors/ConnectorDragPreview";
import { SelectionBox } from "./overlays/SelectionBox";
import { Marquee } from "./overlays/Marquee";
import { PlacePreview } from "./overlays/PlacePreview";
import { SnapGuideLine } from "./overlays/SnapGuideLine";
import { DistributionGuideLine } from "./overlays/DistributionGuideLine";
import { SpacingChips } from "./overlays/SpacingChips";
import type { CanvasTool } from "../state/actions";
import { STICKY_GEOMETRY } from "../objects/sticky/def";

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

/** Arrowhead marker geometry, expressed in units of the connector's own stroke width (see marker `<defs>` below). */
const ARROW_LENGTH_RATIO = CONNECTOR_ARROWHEAD_LENGTH_TO_STROKE_RATIO;
const ARROW_WIDTH_RATIO = CONNECTOR_ARROWHEAD_WIDTH_TO_STROKE_RATIO;

export interface CanvasStageProps {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  selectedObjectIds?: string[];
  changedObjectIds?: string[];
  /** Connection currently selected — renders endpoint handles + primary-stroke styling. */
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
  /** Object whose label is currently being edited inline (4.2.1) — its static label span is hidden. */
  editingLabelObjectId?: string | null;
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
 * is visibly layered on top rather than blended underneath. Stable otherwise
 * (schema order is preserved as the tiebreaker), so
 * non-section-vs-non-section and sibling-section-vs-sibling-section order
 * never changes from the document's natural order.
 *
 * Depth is the length of a section's `parentId` ancestor chain (root
 * sections are depth 0). Sections are the only legal parent type, so every
 * ancestor on the chain is a section.
 */
function renderOrderedObjects(objects: InteractiveCanvasObject[]): InteractiveCanvasObject[] {
  const sections = objects.filter((object) => object.type === "section");
  if (sections.length === 0) return objects;

  const byId = new Map(objects.map((object) => [object.id, object]));

  function sectionDepth(section: InteractiveCanvasObject): number {
    let depth = 0;
    // Guard against dangling parentIds and (invalid) cycles.
    const visited = new Set<string>([section.id]);
    let parentId = section.parentId ?? null;
    while (parentId && !visited.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      visited.add(parent.id);
      depth += 1;
      parentId = parent.parentId ?? null;
    }
    return depth;
  }

  const indexOf = new Map(objects.map((object, index) => [object.id, index]));
  const sectionDepths = new Map(sections.map((section) => [section.id, sectionDepth(section)]));

  return [...objects].sort((a, b) => {
    const aIsSection = a.type === "section";
    const bIsSection = b.type === "section";
    if (aIsSection !== bIsSection) return aIsSection ? -1 : 1;
    if (aIsSection && bIsSection) {
      const depthDelta = (sectionDepths.get(a.id) ?? 0) - (sectionDepths.get(b.id) ?? 0);
      if (depthDelta !== 0) return depthDelta;
    }
    return (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
  });
}

/** contentHidden hides a section's RECORDED members — its transitive parentId descendants — while nested section backdrops stay visible. */
function visibleObjectsForSections(
  objects: InteractiveCanvasObject[],
  document: InteractiveCanvasDocument,
): InteractiveCanvasObject[] {
  const hidden = new Set<string>();
  for (const section of objects) {
    if (section.type !== "section" || !section.contentHidden) continue;
    for (const memberId of sectionDescendantIds(document, section.id)) {
      hidden.add(memberId);
    }
  }
  return hidden.size === 0 ? objects : objects.filter((object) => object.type === "section" || !hidden.has(object.id));
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
  editingLabelObjectId = null,
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
  const stageCursor = style?.cursor ?? (handToolActive ? "grab" : selectToolActive ? SELECT_CURSOR : undefined);

  return (
    <div
      ref={stageRef}
      className={`interactive-canvas-stage${className ? ` ${className}` : ""}`}
      data-canvas-stage="true"
      data-canvas-hand-tool={handToolActive ? "true" : undefined}
      data-canvas-select-tool={selectToolActive ? "true" : undefined}
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
        .interactive-canvas-object[data-changed="true"] {
          box-shadow: 0 0 0 5px color-mix(in oklab, var(--primary) 18%, transparent);
        }
        .interactive-canvas-object[data-drop-target="true"] {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
          box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 22%, transparent);
        }
        /* Sticky rules live on the sticky def (objects/sticky/def.tsx) — except
           this one: the sticky body span carries BOTH .interactive-canvas-object-body
           and .interactive-canvas-sticky-body (same specificity), and this rule's
           non-!important declarations must keep LOSING to .interactive-canvas-object-body
           below by source order. It cannot move into the appended def CSS without
           flipping the color/font-size/line-height winners. */
        .interactive-canvas-sticky-body {
          display: flex !important;
          flex-direction: column;
          -webkit-line-clamp: unset !important;
          color: ${STICKY_GEOMETRY.bodyTextColor};
          font-size: ${STICKY_GEOMETRY.bodyFontSizePx}px;
          line-height: ${STICKY_GEOMETRY.bodyLineHeightPx}px;
        }
        /* Shared z-plumbing for every def-rendered true-outline SVG silhouette
           (polygon shapes, junctions) — infrastructure, not per-shape CSS. */
        .interactive-canvas-true-outline-silhouette {
          z-index: 0;
        }
        .interactive-canvas-label-below-icon {
          position: relative;
          z-index: 1;
          font-weight: 700;
          color: #000000;
        }
        .interactive-canvas-object-label {
          position: relative;
          z-index: 1;
          display: block;
          max-width: 100%;
          overflow-wrap: anywhere;
          font-weight: 650;
          font-size: ${TEXT_SIZES_PX.shapeText}px;
          line-height: 1.2;
        }
        .interactive-canvas-object-body {
          position: relative;
          z-index: 1;
          display: -webkit-box;
          max-width: 100%;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          color: var(--muted-foreground);
          font-size: ${TEXT_SIZES_PX.stickyAuthor}px;
          line-height: 1.35;
        }
        .interactive-canvas-edge-port {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: ${SELECTION_BLUE};
          border: 1.5px solid var(--background);
          box-shadow: 0 1px 4px color-mix(in oklab, var(--foreground) 20%, transparent);
          cursor: crosshair;
          opacity: 0;
          pointer-events: none;
          touch-action: none;
          transition: opacity 120ms ease;
          z-index: 1;
        }
        /* Ports stay invisible (FigJam-style — no circles on the selection
           chrome) but remain draggable on the selected object: quick-connect
           is the only way to start a connector, and the crosshair cursor
           still advertises it at the edge midpoints. */
        .interactive-canvas-object[data-selected="true"] .interactive-canvas-edge-port {
          pointer-events: auto;
        }
        .interactive-canvas-stage[data-canvas-hand-tool="true"] .interactive-canvas-object {
          cursor: inherit;
        }
        .interactive-canvas-stage[data-canvas-hand-tool="true"] .interactive-canvas-object[data-selected="true"] .interactive-canvas-edge-port {
          pointer-events: none;
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
          {renderOrderedObjects(visibleObjectsForSections(document.objects, document)).map((object) => (
            <ObjectShape
              key={object.id}
              object={object}
              selected={selected.has(object.id)}
              changed={changed.has(object.id)}
              dropTarget={dropTargetId === object.id}
              compact={compact}
              bounds={bounds}
              editable={Boolean(onObjectSelect || onStagePointerEvent)}
              showPorts={Boolean(onStagePointerEvent) && !handToolActive}
              zoom={zoom}
              hideLabel={editingLabelObjectId === object.id}
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
                showPorts={false}
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
        {interactionOverlay?.connectorDrag && (
          <ConnectorDragPreview
            document={document}
            viewport={viewport}
            drag={interactionOverlay.connectorDrag}
          />
        )}
        {overlay}
      </div>
    </div>
  );
}
