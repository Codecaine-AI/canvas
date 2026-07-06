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
  sectionCaptureMembers,
  type CanvasBounds,
  type CanvasPoint,
} from "../model/geometry";
import { gridBackground } from "./grid";
import { RESIZE_HANDLES, resizeCursorFor, type InteractionOverlay, type ResizeHandle } from "../interaction/interaction";
import {
  arrowShapePoints,
  chevronPoints,
  getConnectionAnchors,
  hexagonPoints,
  manualInputPoints,
  octagonPoints,
  offPageConnectorPoints,
  parallelogramPoints,
  pentagonPoints,
  plusPoints,
  starPoints,
  trapezoidPoints,
  trianglePoints,
} from "../routing/connection-overlay";
import { pointForAnchor, routeConnection, type Anchor } from "../routing/routing";
import type { DistributionGuideSegment, SnapGuide, SpacingHint } from "../interaction/snapping";
import {
  DISTRIBUTION_GUIDE_COLOR,
  DISTRIBUTION_TICK_BAR,
} from "../vendor/blocksuite/snap-distribution";
import {
  canvasSurfaceStyle,
  resolveObjectColors,
  resolveObjectStrokeWidth,
  resolveSectionColors,
  type CanvasToneStyle,
} from "./theme";
import { worldToScreen, type ViewportState } from "../editor/viewport";
import { tokenizeCodeBlock } from "./code-tokenizer";
import { IconShapeBody } from "./IconShapeBody";
import type { CanvasTool } from "../model/actions";
import {
  ARROW_SHAPE_GEOMETRY,
  CANVAS_BG,
  CANVAS_FONT_FAMILY,
  CHAT_ICON_COLORS,
  CHEVRON_GEOMETRY,
  CHROME,
  CHIP_ICON_COLORS,
  CODE_BLOCK,
  CONNECTOR_ARROWHEAD_LENGTH_TO_STROKE_RATIO,
  CONNECTOR_ARROWHEAD_WIDTH_TO_STROKE_RATIO,
  CONNECTOR_DASH_PATTERN_PX,
  CONNECTOR_DEFAULT_COLOR,
  DOCUMENT_GEOMETRY,
  DOCUMENT_STACK_GEOMETRY,
  FOLDER_GEOMETRY,
  SECTION_CAPTURE_OVERLAP_THRESHOLD,
  CONNECTOR_STROKE_WIDTH_PX,
  GRID_DOT_COLOR,
  MANUAL_INPUT_GEOMETRY,
  OFF_PAGE_CONNECTOR_GEOMETRY,
  PERSON_ICON_COLORS,
  PREDEFINED_PROCESS_GEOMETRY,
  SECTION_GEOMETRY,
  STICKY_COLORS,
  STICKY_GEOMETRY,
  TEXT_SIZES_PX,
} from "./figjam-tokens";
import type {
  CanvasAnnotationTarget,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../model/schema";

const HANDLE_SIZE = 10;
const CONNECTION_HIT_WIDTH = 14;
const ENDPOINT_HANDLE_RADIUS = 6;
/** Side length of the render-only bend-affordance square at elbow corners (W3b stub). */
const BEND_STUB_SIZE = 12;
const EDGE_PORT_ANCHORS: Anchor[] = ["top", "right", "bottom", "left"];
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
   * Fired on native dblclick anywhere on the stage (4.2.1) — the editor's
   * adapter builds a "double" CanvasPointerEvent (same resolveHit pipeline as
   * onStagePointerEvent) and feeds it into stepInteraction, which resolves it
   * to either "start editing this object's label" or "create + edit a new
   * text object here". Connector double-click keeps its own dedicated
   * onConnectionDoubleClick path (stopPropagation there prevents this handler
   * from double-firing for that case).
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

function objectStyle(object: InteractiveCanvasObject): CSSProperties {
  const colors = resolveObjectColors(object.style);
  const style: CSSProperties = {
    left: `${object.geometry.x}px`,
    top: `${object.geometry.y}px`,
    width: `${object.geometry.width}px`,
    height: `${object.geometry.height}px`,
    background: colors.fill,
    borderColor: colors.border,
    color: colors.text,
    // W4 z-layering (see the connector <svg> comment in CanvasStage): non-
    // section shapes paint above the connector layer (z 1); sections render
    // via SectionShape (explicit z 0) below it.
    zIndex: 2,
  };
  // W4 — explicit stroke gets FigJam's universal 4px chrome (or the object's
  // own strokeWidth); tone/token-only objects keep the legacy 2px CSS border.
  if (object.style?.stroke || object.style?.strokeWidth) {
    style.borderWidth = `${resolveObjectStrokeWidth(object.style)}px`;
  }
  return style;
}

/**
 * FigJam z-layering (W2): sections always render below every non-section
 * object, so shapes/stickies/etc. placed "on top of" a section visually sit
 * on its surface rather than being obscured by it. Among sections
 * themselves, nesting wins: a section fully/mostly inside another section
 * (per the same positional-containment reading used for drag-capture) should
 * render above its geometric parent, so the nested section's tint is visibly
 * layered on top rather than blended underneath. Stable otherwise (schema
 * order is preserved as the tiebreaker), so non-section-vs-non-section and
 * sibling-section-vs-sibling-section order never changes from the document's
 * natural order.
 *
 * Depth is computed purely from bounds-containment (a section "contains"
 * another section when the other's bounds are >=60% inside it, mirroring
 * sectionCaptureMembers' geometric reading) rather than any parentId, since
 * sections never use parentId for their nesting relationship.
 */
function renderOrderedObjects(objects: InteractiveCanvasObject[]): InteractiveCanvasObject[] {
  const sections = objects.filter((object) => object.type === "section");
  if (sections.length === 0) return objects;

  function sectionDepth(section: InteractiveCanvasObject): number {
    let depth = 0;
    for (const other of sections) {
      if (other.id === section.id) continue;
      const otherArea = other.geometry.width * other.geometry.height;
      if (otherArea <= 0) continue;
      // Is `section` positionally inside `other`? (other is the ancestor)
      const overlapWidth =
        Math.min(section.geometry.x + section.geometry.width, other.geometry.x + other.geometry.width) -
        Math.max(section.geometry.x, other.geometry.x);
      const overlapHeight =
        Math.min(section.geometry.y + section.geometry.height, other.geometry.y + other.geometry.height) -
        Math.max(section.geometry.y, other.geometry.y);
      if (overlapWidth <= 0 || overlapHeight <= 0) continue;
      const sectionArea = section.geometry.width * section.geometry.height;
      if (sectionArea <= 0) continue;
      const fractionOfSectionInsideOther = (overlapWidth * overlapHeight) / sectionArea;
      if (fractionOfSectionInsideOther >= 0.6 && otherArea > sectionArea) depth += 1;
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

function visibleObjectsForSections(
  objects: InteractiveCanvasObject[],
  document: InteractiveCanvasDocument,
): InteractiveCanvasObject[] {
  const hidden = new Set<string>();
  for (const section of objects) {
    if (section.type !== "section" || !section.contentHidden) continue;
    for (const memberId of sectionCaptureMembers(document, section.id, SECTION_CAPTURE_OVERLAP_THRESHOLD)) {
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

export { annotationTargetLabel, renderOrderedObjects };

/**
 * One routed connector: an invisible wide hit path (for click-to-select),
 * the visible routed path (elbow/smooth/straight per connection.style, with
 * forward/back/both arrowheads), and — when selected — small endpoint handles
 * at the routed start/end so 3.2.2's endpoint-drag gesture has a hit target.
 */
function Connector({
  document,
  connection,
  fromObject,
  toObject,
  selected,
  dimmed,
  onDoubleClick,
}: {
  document: InteractiveCanvasDocument;
  connection: InteractiveCanvasConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  selected: boolean;
  /** True while this connector's own endpoint is mid-drag — visible path dims, hit path stays inert. */
  dimmed?: boolean;
  onDoubleClick?: (connectionId: string) => void;
}) {
  const routed = routeConnection(fromObject, toObject, connection, document.objects);
  // FigJam's dash pattern (figjam-tokens.ts, CONNECTOR_DASH_PATTERN_PX).
  const strokeDasharray =
    connection.style === "dotted" ? CONNECTOR_DASH_PATTERN_PX.join(" ") : undefined;
  const arrow = connection.arrow ?? "forward";
  const showForwardArrow = arrow === "forward" || arrow === "both";
  const showBackArrow = arrow === "back" || arrow === "both";
  // Per-connection color (W4) falling back to FigJam's chunky neutral gray —
  // selection still recolors to the selection blue. Arrowheads inherit via the
  // markers' fill="context-stroke" (see the <defs> block).
  const stroke = selected ? "var(--primary)" : (connection.color ?? CONNECTOR_DEFAULT_COLOR);
  // Bend-affordance stubs (W3b, render-only): the routed polyline's interior
  // corners. Reroute editing is a later wave — these only show the affordance
  // (translucent gray square + crosshair cursor) on the selected connector.
  const bendPoints = selected ? (routed.points ?? []).slice(1, -1) : [];

  return (
    <g data-canvas-connection-group={connection.id}>
      <path
        d={routed.path}
        fill="none"
        stroke="transparent"
        strokeWidth={CONNECTION_HIT_WIDTH}
        strokeLinecap="round"
        data-canvas-connection-id={connection.id}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onDoubleClick?.(connection.id);
        }}
      />
      <path
        d={routed.path}
        fill="none"
        stroke={stroke}
        strokeWidth={CONNECTOR_STROKE_WIDTH_PX}
        strokeLinecap="butt"
        strokeDasharray={strokeDasharray}
        opacity={dimmed ? 0.35 : 1}
        pointerEvents="none"
        markerEnd={showForwardArrow ? `url(#${document.id}-arrow-forward)` : undefined}
        markerStart={showBackArrow ? `url(#${document.id}-arrow-back)` : undefined}
      />
      {selected && (
        <>
          {/* Bend-affordance stubs (W3b, render-only): translucent gray square +
              crosshair cursor at each elbow corner. No reroute editing yet. */}
          {bendPoints.map((point, index) => (
            <rect
              key={`bend-${index}`}
              x={point.x - BEND_STUB_SIZE / 2}
              y={point.y - BEND_STUB_SIZE / 2}
              width={BEND_STUB_SIZE}
              height={BEND_STUB_SIZE}
              rx={2}
              fill="rgba(120, 120, 120, 0.35)"
              data-canvas-bend-stub={connection.id}
              style={{ pointerEvents: "all", cursor: "crosshair" }}
            />
          ))}
          {/* Hollow FigJam-blue endpoint circles (W3b): white fill + selection-
              blue ring at both routed terminals — the endpoint-drag hit targets. */}
          <circle
            cx={routed.start.x}
            cy={routed.start.y}
            r={ENDPOINT_HANDLE_RADIUS}
            fill="#FFFFFF"
            stroke={CHROME.selectionBlue}
            strokeWidth={1.5}
            data-canvas-endpoint="from"
            data-canvas-connection-id={connection.id}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
          />
          <circle
            cx={routed.end.x}
            cy={routed.end.y}
            r={ENDPOINT_HANDLE_RADIUS}
            fill="#FFFFFF"
            stroke={CHROME.selectionBlue}
            strokeWidth={1.5}
            data-canvas-endpoint="to"
            data-canvas-connection-id={connection.id}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
          />
        </>
      )}
    </g>
  );
}

/**
 * Pill chip rendered at a connector's routed label point (world layer, so it
 * pans/zooms with the canvas). Double-clicking opens the inline label editor
 * (owned by the editor via `onConnectionDoubleClick`/`worldOverlay`).
 */
function ConnectionLabelChip({
  connection,
  fromObject,
  toObject,
  obstacles,
  onDoubleClick,
}: {
  connection: InteractiveCanvasConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  /** Full document object list so the label sits on the same obstacle-avoiding route the connector renders. */
  obstacles: ReadonlyArray<InteractiveCanvasObject>;
  onDoubleClick?: (connectionId: string) => void;
}) {
  if (!connection.label) return null;
  const routed = routeConnection(fromObject, toObject, connection, obstacles);
  return (
    <div
      data-canvas-connection-label={connection.id}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.(connection.id);
      }}
      style={{
        position: "absolute",
        left: `${routed.labelPoint.x}px`,
        top: `${routed.labelPoint.y}px`,
        transform: "translate(-50%, -50%)",
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
    >
      {connection.label}
    </div>
  );
}

/**
 * Live preview rendered while a connector endpoint is being dragged (3.2.2
 * reconnect) or a brand-new connector is being pulled from a port (3.3.2
 * create): a dashed path from the fixed end to either the hovered candidate's
 * anchor point or the raw pointer position, plus 4 anchor dots on the
 * currently-hovered candidate object (the snapped one emphasized).
 */
function ConnectorDragPreview({
  document,
  viewport,
  drag,
}: {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  drag: NonNullable<InteractionOverlay["connectorDrag"]>;
}) {
  let fixedWorld: CanvasPoint | null = null;

  if (drag.connectionId) {
    const connection = document.connections.find((item) => item.id === drag.connectionId);
    if (connection) {
      const fromObject = objectById(document, connection.from.objectId);
      const toObject = objectById(document, connection.to.objectId);
      if (fromObject && toObject) {
        const routed = routeConnection(fromObject, toObject, connection, document.objects);
        fixedWorld = drag.end === "from" ? routed.end : routed.start;
      }
    }
  } else if (drag.fromObjectId && drag.fromAnchor) {
    const fromObject = objectById(document, drag.fromObjectId);
    if (fromObject) {
      fixedWorld = pointForAnchor(fromObject.geometry, drag.fromAnchor);
    }
  }

  if (!fixedWorld) return null;

  // The dashed preview aims at the exact snapped point (anchor or outline —
  // W3b cascade) when one exists, else the coarse anchor side, else the raw
  // pointer.
  const candidateObject = drag.candidate ? objectById(document, drag.candidate.objectId) : undefined;
  const targetWorld =
    drag.candidate?.point ??
    (candidateObject ? pointForAnchor(candidateObject.geometry, drag.candidate!.anchor) : drag.point);

  const start = worldToScreen(viewport, fixedWorld);
  const end = worldToScreen(viewport, targetWorld);
  // True-outline port anchors (connection-overlay.ts getConnectionAnchors) in
  // a stable top/bottom/left/right order (matching its candidates array).
  const portAnchors = candidateObject ? getConnectionAnchors(candidateObject) : [];
  const PORT_ANCHOR_NAMES: Anchor[] = ["top", "bottom", "left", "right"];
  const snappedWorld = drag.candidate?.snapKind === "outline" ? drag.candidate.point : undefined;

  return (
    <>
      <svg
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        aria-hidden="true"
      >
        <path
          d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
          fill="none"
          stroke={CHROME.selectionBlue}
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
      </svg>
      {/* FigJam-style hover ports (W3b): 4 white-fill, selection-blue-ring
          circles on the hovered object's true outline; the anchor the cascade
          snapped to renders emphasized (bigger, filled blue). */}
      {portAnchors.map((portAnchor, index) => {
        const screenPoint = worldToScreen(viewport, portAnchor.point);
        const isSnapped =
          drag.candidate?.snapKind === "anchor" &&
          !!drag.candidate.point &&
          Math.abs(drag.candidate.point.x - portAnchor.point.x) < 0.5 &&
          Math.abs(drag.candidate.point.y - portAnchor.point.y) < 0.5;
        return (
          <div
            key={PORT_ANCHOR_NAMES[index]}
            data-canvas-anchor-dot={PORT_ANCHOR_NAMES[index]}
            data-canvas-anchor-snapped={isSnapped ? "" : undefined}
            style={{
              position: "absolute",
              left: `${screenPoint.x}px`,
              top: `${screenPoint.y}px`,
              width: isSnapped ? "12px" : "8px",
              height: isSnapped ? "12px" : "8px",
              transform: "translate(-50%, -50%)",
              borderRadius: "999px",
              background: isSnapped ? CHROME.selectionBlue : "#FFFFFF",
              border: `1.5px solid ${CHROME.selectionBlue}`,
              pointerEvents: "none",
            }}
          />
        );
      })}
      {/* Off-anchor outline snap: a filled dot at the exact outline point the
          endpoint will attach to (stored as `position` on drop). */}
      {snappedWorld && (
        <div
          data-canvas-outline-snap-dot=""
          style={{
            position: "absolute",
            left: `${worldToScreen(viewport, snappedWorld).x}px`,
            top: `${worldToScreen(viewport, snappedWorld).y}px`,
            width: "10px",
            height: "10px",
            transform: "translate(-50%, -50%)",
            borderRadius: "999px",
            background: CHROME.selectionBlue,
            border: "1.5px solid #FFFFFF",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function documentWavyPath(x = 0, y = 0, width = 100, height = 100): string {
  const top = y;
  const left = x;
  const right = x + width;
  const waveShoulderY = y + height * DOCUMENT_GEOMETRY.waveShoulderYRatio;
  const waveCrestY = y + height * DOCUMENT_GEOMETRY.waveCrestYRatio;
  return [
    `M ${left} ${top}`,
    `L ${right} ${top}`,
    `L ${right} ${waveShoulderY}`,
    `C ${x + width * 0.83} ${waveShoulderY} ${x + width * 0.83} ${waveCrestY} ${x + width * 0.66} ${waveCrestY}`,
    `C ${x + width * 0.5} ${waveCrestY} ${x + width * 0.5} ${waveShoulderY} ${x + width * 0.33} ${waveShoulderY}`,
    `C ${x + width * 0.16} ${waveShoulderY} ${x + width * 0.16} ${waveCrestY} ${left} ${waveCrestY}`,
    "Z",
  ].join(" ");
}

/**
 * Inline SVG background layer for silhouettes CSS clip-path can't express
 * (person's head+shoulders, database's cylinder, chat's tail, chip-icon's
 * CPU pins). Rendered absolutely-positioned behind the label/body content.
 * viewBox tracks the object's own aspect ratio (0 0 100 100 scaled non-
 * uniformly via preserveAspectRatio="none") so the silhouette always fills
 * its box regardless of the object's actual width/height.
 *
 * W2 restyle: chat/person/chip-icon are FILLED, SATURATED, borderless icon
 * glyphs per the V2 Flow reference (figjam-tokens.ts CHAT_ICON_COLORS /
 * PERSON_ICON_COLORS / CHIP_ICON_COLORS) — an explicit paletteToken/tone on
 * the object still overrides these defaults (falls back to `colors`, the
 * resolveObjectColors result) so the semantic-palette system keeps working
 * for anyone who deliberately recolors one of these. `database` keeps the
 * older tone-driven pastel-pair styling (not named in the W2 restyle scope).
 */
function ShapeSilhouette({
  shape,
  colors,
  hasExplicitColor,
  strokeWidth,
}: {
  shape: "person" | "database" | "chat" | "chip-icon" | "document" | "folder" | "document-stack" | "cylinder-horizontal";
  colors: CanvasToneStyle;
  /** True when the object has an explicit paletteToken/tone — overrides the shape's default fixed fill. */
  hasExplicitColor?: boolean;
  strokeWidth?: number;
}) {
  const common = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none" as const,
  };
  const silhouetteStrokeWidth = strokeWidth ?? 2;

  if (shape === "person") {
    const fill = hasExplicitColor ? colors.fill : PERSON_ICON_COLORS.fill;
    const stroke = hasExplicitColor ? colors.border : PERSON_ICON_COLORS.stroke;
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="person"
      >
        {/* Rounded-shoulders body first (so the head overlaps its top edge). */}
        <path
          d="M 50 52 C 20 52 10 68 8 100 L 92 100 C 90 68 80 52 50 52 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
        <circle cx="50" cy="30" r="22" fill={fill} stroke={stroke} strokeWidth={2} />
      </svg>
    );
  }

  if (shape === "database") {
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="database"
      >
        <path
          d="M 4 22 C 4 12 96 12 96 22 L 96 78 C 96 88 4 88 4 78 Z"
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={2}
        />
        <ellipse cx="50" cy="22" rx="46" ry="12" fill={colors.fill} stroke={colors.border} strokeWidth={2} />
      </svg>
    );
  }

  if (shape === "document") {
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="document"
      >
        <path
          d={documentWavyPath()}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "folder") {
    const tabWidth = FOLDER_GEOMETRY.tabWidthRatio * 100;
    const tabTop = 8;
    const tabBottom = 24;
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="folder"
      >
        <path
          d={`M 0 ${tabTop} H ${tabWidth} V ${tabBottom} H 100 V 100 H 0 Z`}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "document-stack") {
    const offset = DOCUMENT_STACK_GEOMETRY.offsetPx;
    const pageSize = 100 - offset;
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="document-stack"
      >
        <path
          d={documentWavyPath(0, 0, pageSize, pageSize)}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
          opacity={0.82}
        />
        <path
          d={documentWavyPath(offset, offset, pageSize, pageSize)}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "cylinder-horizontal") {
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="cylinder-horizontal"
      >
        <path
          d="M 18 5 H 82 C 92 5 98 25 98 50 C 98 75 92 95 82 95 H 18 C 8 95 2 75 2 50 C 2 25 8 5 18 5 Z"
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M 18 5 C 28 5 34 25 34 50 C 34 75 28 95 18 95"
          fill="none"
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
        />
        <path
          d="M 82 5 C 72 5 66 25 66 50 C 66 75 72 95 82 95"
          fill="none"
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
        />
      </svg>
    );
  }

  if (shape === "chip-icon") {
    const fill = hasExplicitColor ? colors.fill : CHIP_ICON_COLORS.fill;
    const stroke = hasExplicitColor ? colors.border : CHIP_ICON_COLORS.stroke;
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="chip-icon"
      >
        {/* CPU/chip glyph: square body with 4 pins per side. */}
        {[22, 42, 62].map((pos) => (
          <g key={pos}>
            <line x1={pos} y1={4} x2={pos} y2={16} stroke={stroke} strokeWidth={4} />
            <line x1={pos} y1={84} x2={pos} y2={96} stroke={stroke} strokeWidth={4} />
            <line x1={4} y1={pos} x2={16} y2={pos} stroke={stroke} strokeWidth={4} />
            <line x1={84} y1={pos} x2={96} y2={pos} stroke={stroke} strokeWidth={4} />
          </g>
        ))}
        <rect x="16" y="16" width="68" height="68" rx="10" fill={fill} stroke={stroke} strokeWidth={4} />
        <rect x="34" y="34" width="32" height="32" rx="4" fill="none" stroke={stroke} strokeWidth={3} />
      </svg>
    );
  }

  // chat: rounded speech bubble with a small tail at bottom-left.
  const chatFill = hasExplicitColor ? colors.fill : CHAT_ICON_COLORS.fill;
  const chatStroke = hasExplicitColor ? colors.border : CHAT_ICON_COLORS.stroke;
  return (
    <svg
      style={common}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-canvas-shape-silhouette="chat"
    >
      <path
        d="M 8 6 L 92 6 C 96.4 6 100 9.6 100 14 L 100 74 C 100 78.4 96.4 82 92 82
           L 26 82 L 12 98 L 15 82 L 8 82 C 3.6 82 0 78.4 0 74
           L 0 14 C 0 9.6 3.6 6 8 6 Z"
        fill={chatFill}
        stroke={chatStroke}
        strokeWidth={2}
      />
    </svg>
  );
}

/**
 * FigJam section render (W2) — a large tinted backdrop with a floating
 * title chip in the top-left corner, per SECTION_GEOMETRY. Deliberately NOT
 * built on the generic button/label/body layout the other shapes share:
 * sections have no centered label, no shadow, and their "border" is
 * literally the title chip's fill color (per spec, border = chip fill).
 */
function SectionShape({
  object,
  selected,
  dropTarget,
  bounds,
  editable,
  hideTitle,
  onObjectSelect,
  onObjectContextMenu,
}: {
  object: InteractiveCanvasObject;
  selected: boolean;
  dropTarget?: boolean;
  bounds: CanvasBounds;
  editable?: boolean;
  hideTitle?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}) {
  const family = resolveSectionColors(object.tint);
  const borderColor = object.style?.stroke ?? family.chipBorder ?? "transparent";
  const borderStyle = object.style?.strokeStyle ?? "solid";
  const borderWidth =
    borderStyle === "none" || borderStyle === "dashed"
      ? 0
      : (object.style?.strokeWidth ?? SECTION_GEOMETRY.borderWidthPx);
  const renderedStrokeWidth = object.style?.strokeWidth ?? SECTION_GEOMETRY.borderWidthPx;
  const title = object.title ?? object.label;
  return (
    <button
      type="button"
      className="interactive-canvas-object interactive-canvas-object-section"
      data-docs-target="true"
      data-docs-target-type="canvas-section"
      data-source-id={object.id}
      data-docs-target-label={`canvas: ${title}`}
      data-canvas-object-id={object.id}
      data-canvas-object-type={object.type}
      data-canvas-object-shape="section"
      data-selected={selected ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      data-editable={(editable ?? Boolean(onObjectSelect)) ? "true" : undefined}
      style={{
        left: `${object.geometry.x}px`,
        top: `${object.geometry.y}px`,
        width: `${object.geometry.width}px`,
        height: `${object.geometry.height}px`,
        background: object.style?.fill ?? family.tint,
        borderColor,
        borderStyle,
        borderWidth,
        borderRadius: SECTION_GEOMETRY.cornerRadiusPx,
        // W4 z-layering: section backdrops stay below the connector layer (z 1).
        zIndex: 0,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(object.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, object, bounds);
      }}
    >
      {borderStyle === "dashed" ? (
        <svg
          aria-hidden="true"
          data-section-border-dash=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <rect
            x={renderedStrokeWidth / 2}
            y={renderedStrokeWidth / 2}
            width={`calc(100% - ${renderedStrokeWidth}px)`}
            height={`calc(100% - ${renderedStrokeWidth}px)`}
            rx={SECTION_GEOMETRY.cornerRadiusPx}
            ry={SECTION_GEOMETRY.cornerRadiusPx}
            fill="none"
            stroke={borderColor}
            strokeWidth={renderedStrokeWidth}
            strokeDasharray={CONNECTOR_DASH_PATTERN_PX.join(" ")}
          />
        </svg>
      ) : null}
      {!hideTitle && (
        <span
          className="interactive-canvas-section-title-chip"
          data-canvas-section-title-chip={object.id}
          style={{
            background: family.chipFill ?? "transparent",
            borderColor: family.chipBorder ?? "transparent",
          }}
        >
          {title}
        </span>
      )}
    </button>
  );
}

type RenderObjectShape = NonNullable<InteractiveCanvasObject["style"]>["shape"] | "label";

function classNameForObjectShape(shape: RenderObjectShape): string {
  const base = "interactive-canvas-object";
  switch (shape) {
    case "diamond":
    case "marker":
    case "note":
    case "document":
    case "person":
    case "database":
    case "chat":
    case "chip-icon":
    case "pill":
    case "arrow-shape":
    case "predefined-process":
    case "code-block":
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
      return `${base} interactive-canvas-object-${shape}`;
    case "label":
      return `${base} interactive-canvas-object-text-shape`;
    default:
      return base;
  }
}

export function ObjectShape({
  object,
  selected,
  changed,
  dropTarget,
  compact,
  bounds,
  editable,
  showPorts,
  zoom = 1,
  hideLabel,
  onObjectSelect,
  onObjectContextMenu,
}: {
  object: InteractiveCanvasObject;
  selected: boolean;
  changed: boolean;
  dropTarget?: boolean;
  compact?: boolean;
  bounds: CanvasBounds;
  /** Shows the grab-cursor affordance; defaults to true when any select/pointer handler is wired. */
  editable?: boolean;
  /** Renders quick-connect edge ports — only true in the interactive editor. */
  showPorts?: boolean;
  /** Current viewport zoom — used to counter-scale edge ports to a constant screen size. */
  zoom?: number;
  /** True while this object's label is being edited inline (4.2.1) — hides the static label span. */
  hideLabel?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}) {
  if (object.type === "section") {
    return (
      <SectionShape
        object={object}
        selected={selected}
        dropTarget={dropTarget}
        bounds={bounds}
        editable={editable}
        hideTitle={hideLabel}
        onObjectSelect={onObjectSelect}
        onObjectContextMenu={onObjectContextMenu}
      />
    );
  }
  // W2 — standalone text objects render as a bold, borderless FigJam label
  // rather than the generic rounded-rect chrome (no explicit style.shape
  // value existed for "text" before this wave; it silently fell through to
  // rounded-rect, which is what the W2 brief asked to restyle).
  const shape = object.style?.shape ?? (object.type === "text" ? "label" : "rounded-rect");
  const className = classNameForObjectShape(shape);
  const colors = resolveObjectColors(object.style);
  const hasExplicitColor = Boolean(
    object.style?.paletteToken || object.style?.tone || object.style?.fill || object.style?.stroke,
  );
  const shapeStrokeWidth = resolveObjectStrokeWidth(object.style);
  // person/chat/chip-icon lean on the SVG silhouette for the shape itself, so
  // body copy (and, below a compact height, even the label) is dropped to
  // keep the silhouette legible rather than overrun with text. Their label
  // renders BELOW the icon (bold black), not overlaid on it (W2 restyle).
  const isCompactSilhouette = (shape === "person" || shape === "chat") && object.geometry.height < 100;
  const svgShape =
    shape === "person" ||
    shape === "database" ||
    shape === "chat" ||
    shape === "chip-icon" ||
    shape === "document" ||
    shape === "folder" ||
    shape === "document-stack" ||
    shape === "cylinder-horizontal"
      ? shape
      : null;
  const labelBelowIcon = shape === "person" || shape === "chat" || shape === "chip-icon";
  // W5/Wave C — the `icon` type (Advanced-tier glyph family) renders its own
  // self-contained glyph+label body via IconShapeBody (bbox outline tier, no
  // silhouette/polygon overlay) rather than composing through the
  // svgShape/labelBelowIcon paths above, since IconShapeBody already bundles
  // the label-below-glyph layout internally (see render/IconShapeBody.tsx).
  const isIconShape = shape === "icon";
  const hidesVisibleText = shape === "plus" || shape === "or-junction" || shape === "summing-junction";
  const localShapeBounds = { x: 0, y: 0, width: object.geometry.width, height: object.geometry.height };

  // W2/W4 — arrow-shape (fat chevron): a single SVG polygon tracing the full
  // 7-point silhouette (body + head + notch) — the same outline connector
  // attachment uses (connection-overlay.ts arrowShapePoints) — so an explicit
  // stroke traces the whole chevron, not just a body rect.
  const arrowDirection: "left" | "right" = object.direction === "left" ? "left" : "right";
  const arrowSilhouettePoints =
    shape === "arrow-shape"
      ? pointsAttribute(arrowShapePoints(localShapeBounds, arrowDirection))
      : null;
  const horizontalDirection: "left" | "right" = object.direction === "left" ? "left" : "right";
  const triangleDirection: "up" | "down" = object.direction === "down" ? "down" : "up";
  const trueOutlinePolygonPoints =
    shape === "triangle"
      ? pointsAttribute(trianglePoints(localShapeBounds, triangleDirection))
      : shape === "parallelogram"
        ? pointsAttribute(parallelogramPoints(localShapeBounds, horizontalDirection))
        : shape === "pentagon"
          ? pointsAttribute(pentagonPoints(localShapeBounds))
          : shape === "octagon"
            ? pointsAttribute(octagonPoints(localShapeBounds))
            : shape === "star"
              ? pointsAttribute(starPoints(localShapeBounds))
              : shape === "plus"
                ? pointsAttribute(plusPoints(localShapeBounds))
                : shape === "chevron"
                  ? pointsAttribute(chevronPoints(localShapeBounds, horizontalDirection))
                  : shape === "off-page-connector"
                    ? pointsAttribute(offPageConnectorPoints(localShapeBounds))
                    : shape === "trapezoid"
                      ? pointsAttribute(trapezoidPoints(localShapeBounds))
                      : shape === "manual-input"
                        ? pointsAttribute(manualInputPoints(localShapeBounds))
                        : shape === "hexagon"
                          ? pointsAttribute(hexagonPoints(localShapeBounds))
                          : null;
  const ellipseSilhouette = shape === "ellipse" || shape === "or-junction" || shape === "summing-junction";
  const labelStyle: CSSProperties | undefined =
    shape === "arrow-shape"
      ? {
          // Center the label within the chevron BODY (the head side carries no
          // text in FigJam), not the full bounding box.
          [arrowDirection === "left" ? "marginLeft" : "marginRight"]: `${
            ARROW_SHAPE_GEOMETRY.headWidthRatio * 100
          }%`,
        }
      : shape === "chevron"
        ? {
            [horizontalDirection === "left" ? "marginLeft" : "marginRight"]: `${
              CHEVRON_GEOMETRY.notchWidthRatio * 100
            }%`,
          }
        : undefined;

  // W2 — predefined-process: rect with two inner vertical bars inset from
  // each edge (PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width).
  const barInsetPct = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio * 100;

  // W2 — code-block: tokenized per-line rendering with an optional
  // right-aligned line-number gutter.
  const codeLines = shape === "code-block" ? tokenizeCodeBlock(object.body ?? "", object.language) : null;

  // W2 — sticky upgrade: author chip + "- " bullet rendering in the body text.
  const isSticky = shape === "note";
  const bodyLines = isSticky ? (object.body ?? "").split("\n") : null;

  return (
    <button
      type="button"
      className={className}
      data-docs-target="true"
      data-docs-target-type={`canvas-${object.type}`}
      data-source-id={object.id}
      data-docs-target-label={`canvas: ${object.label}`}
      data-canvas-object-id={object.id}
      data-canvas-object-type={object.type}
      data-canvas-object-shape={shape}
      data-selected={selected ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      data-editable={(editable ?? Boolean(onObjectSelect)) ? "true" : undefined}
      aria-label={object.label}
      style={objectStyle(object)}
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(object.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, object, bounds);
      }}
    >
      {svgShape && (
        <ShapeSilhouette
          shape={svgShape}
          colors={colors}
          hasExplicitColor={hasExplicitColor}
          strokeWidth={
            shape === "document" ||
            shape === "folder" ||
            shape === "document-stack" ||
            shape === "cylinder-horizontal"
              ? shapeStrokeWidth
              : undefined
          }
        />
      )}
      {ellipseSilhouette && (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette={shape}
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <ellipse
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={shapeStrokeWidth}
          />
        </svg>
      )}
      {trueOutlinePolygonPoints && (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette={shape}
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={trueOutlinePolygonPoints}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={shapeStrokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )}
      {shape === "arrow-shape" && arrowSilhouettePoints && (
        <svg
          aria-hidden="true"
          className="interactive-canvas-arrow-shape-silhouette"
          data-canvas-arrow-direction={arrowDirection}
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={arrowSilhouettePoints}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={shapeStrokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )}
      {shape === "predefined-process" && (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ left: `${barInsetPct}%` }}
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ right: `${barInsetPct}%`, left: "auto" }}
          />
        </>
      )}
      {shape === "internal-storage" && (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-vertical"
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-horizontal"
          />
        </>
      )}
      {shape === "code-block" && codeLines && (
        <div className="interactive-canvas-code-block-body">
          {codeLines.map((line, lineIndex) => (
            // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
            <div key={lineIndex} className="interactive-canvas-code-block-line">
              <span className="interactive-canvas-code-block-line-number">{lineIndex + 1}</span>
              <span className="interactive-canvas-code-block-line-code">
                {line.map((token, tokenIndex) => (
                  // eslint-disable-next-line react/no-array-index-key -- tokens are position-stable within a single render
                  <span key={tokenIndex} style={{ color: token.color }}>
                    {token.text}
                  </span>
                ))}
                {line.length === 0 && " "}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* W4 — code-blocks render body-only (FigJam code blocks carry no label chrome). */}
      {!hideLabel &&
        !(isCompactSilhouette && shape === "person") &&
        !labelBelowIcon &&
        shape !== "code-block" &&
        !isIconShape &&
        !hidesVisibleText && (
        <span className="interactive-canvas-object-label" style={labelStyle}>
          {object.label}
        </span>
      )}
      {isSticky && bodyLines && (
        <span className="interactive-canvas-object-body interactive-canvas-sticky-body">
          {bodyLines.map((line, index) => {
            const isBullet = line.startsWith("- ");
            return (
              // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
              <span key={index} className="interactive-canvas-sticky-line" data-bullet={isBullet ? "true" : undefined}>
                {isBullet ? line.slice(2) : line}
              </span>
            );
          })}
        </span>
      )}
      {object.body &&
        !compact &&
        !isCompactSilhouette &&
        shape !== "code-block" &&
        !isIconShape &&
        !isSticky &&
        !hidesVisibleText && (
        <span className="interactive-canvas-object-body">{object.body}</span>
      )}
      {isSticky && object.author && (
        <span className="interactive-canvas-sticky-author">{object.author}</span>
      )}
      {labelBelowIcon && !hideLabel && !(isCompactSilhouette && shape === "person") && (
        <span className="interactive-canvas-object-label interactive-canvas-label-below-icon">
          {object.label}
        </span>
      )}
      {/* W5/Wave C — `icon` shape: glyph + label-below-glyph, entirely composed
          by IconShapeBody (mirrors chip-icon/person's label-below-icon layout
          but as a single self-contained body rather than a silhouette +
          separate label span). Colors: an explicit fill/stroke on the object
          wins (same `hasExplicitColor` precedent as chip-icon/person/chat);
          otherwise the glyph uses a neutral dark stroke with no fill, per the
          brief's "bbox" outline tier (no chip background behind the glyph). */}
      {isIconShape && (
        <IconShapeBody
          object={object}
          colors={hasExplicitColor ? { stroke: colors.border, fill: colors.fill } : undefined}
          hideLabel={hideLabel}
        />
      )}
      {showPorts &&
        EDGE_PORT_ANCHORS.map((anchor) => {
          const { fx, fy } = PORT_POSITIONS[anchor];
          return (
            <span
              key={anchor}
              className="interactive-canvas-edge-port"
              data-canvas-port={anchor}
              data-canvas-object-id={object.id}
              style={{
                position: "absolute",
                left: `${fx * 100}%`,
                top: `${fy * 100}%`,
                // Counter-scale against the world layer's zoom transform so the
                // port dot stays a constant screen size regardless of zoom.
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              }}
              onClick={(event) => event.stopPropagation()}
            />
          );
        })}
    </button>
  );
}

/** Edge-port fractional offsets within an object's box, matching HANDLE_POSITIONS' side midpoints. */
const PORT_POSITIONS: Record<Anchor, { fx: number; fy: number }> = {
  top: { fx: 0.5, fy: 0 },
  right: { fx: 1, fy: 0.5 },
  bottom: { fx: 0.5, fy: 1 },
  left: { fx: 0, fy: 0.5 },
};

/** Handle position expressed as fractional offsets (0/0.5/1) within the bounds. */
const HANDLE_POSITIONS: Record<ResizeHandle, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  n: { fx: 0.5, fy: 0 },
  ne: { fx: 1, fy: 0 },
  e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 },
  s: { fx: 0.5, fy: 1 },
  sw: { fx: 0, fy: 1 },
  w: { fx: 0, fy: 0.5 },
};

/**
 * Screen-space selection chrome rendered in CanvasStage's overlay slot.
 *
 * Single selection: outline + all 8 resize handles at a fixed screen size
 * (independent of zoom). Multi-selection: outline only — group scaling is
 * deferred beyond M1.
 */
export function SelectionBox({
  document,
  viewport,
  selectedObjectIds,
  interactiveHandles = true,
}: {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  selectedObjectIds: string[];
  interactiveHandles?: boolean;
}) {
  if (selectedObjectIds.length === 0) return null;
  const objects = document.objects.filter((object) => selectedObjectIds.includes(object.id));
  if (objects.length === 0) return null;

  const minX = Math.min(...objects.map((object) => object.geometry.x));
  const minY = Math.min(...objects.map((object) => object.geometry.y));
  const maxX = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const maxY = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));

  const topLeft = worldToScreen(viewport, { x: minX, y: minY });
  const bottomRight = worldToScreen(viewport, { x: maxX, y: maxY });
  const screenBounds = {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };

  const isSingle = objects.length === 1;
  const objectId = objects[0]!.id;
  // W2 — sections show corner handles only (no edge midpoints); resizing a
  // section never moves its captured members (that's a drag-gesture-only
  // behavior, handled entirely in interaction.ts and orthogonal to resize).
  const isSection = isSingle && objects[0]!.type === "section";
  const handles = isSection ? RESIZE_HANDLES.filter((handle) => handle.length === 2) : RESIZE_HANDLES;

  return (
    <div
      className="interactive-canvas-selection-box"
      data-canvas-selection-box="true"
      style={{
        position: "absolute",
        left: `${screenBounds.left}px`,
        top: `${screenBounds.top}px`,
        width: `${screenBounds.width}px`,
        height: `${screenBounds.height}px`,
        border: "1.5px solid var(--primary)",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      {isSingle &&
        handles.map((handle) => {
          const { fx, fy } = HANDLE_POSITIONS[handle];
          return (
            <div
              key={handle}
              data-canvas-handle={handle}
              data-canvas-object-id={objectId}
              style={{
                position: "absolute",
                left: `${fx * screenBounds.width}px`,
                top: `${fy * screenBounds.height}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
                transform: "translate(-50%, -50%)",
                background: "var(--background)",
                border: "1.5px solid var(--primary)",
                borderRadius: "2px",
                cursor: resizeCursorFor(handle),
                pointerEvents: interactiveHandles ? "auto" : "none",
                touchAction: "none",
              }}
            />
          );
        })}
    </div>
  );
}

function Marquee({ viewport, bounds }: { viewport: ViewportState; bounds: CanvasBounds }) {
  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y });
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  return (
    <div
      data-canvas-marquee="true"
      style={{
        position: "absolute",
        left: `${topLeft.x}px`,
        top: `${topLeft.y}px`,
        width: `${bottomRight.x - topLeft.x}px`,
        height: `${bottomRight.y - topLeft.y}px`,
        border: "1px solid var(--primary)",
        background: "color-mix(in oklab, var(--primary) 12%, transparent)",
        pointerEvents: "none",
      }}
    />
  );
}

/** Ghost preview outline for an in-progress armed-tool placement (4.2.2). */
function PlacePreview({ viewport, bounds }: { viewport: ViewportState; bounds: CanvasBounds }) {
  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y });
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  return (
    <div
      data-canvas-place-preview="true"
      style={{
        position: "absolute",
        left: `${topLeft.x}px`,
        top: `${topLeft.y}px`,
        width: `${bottomRight.x - topLeft.x}px`,
        height: `${bottomRight.y - topLeft.y}px`,
        border: "1.5px dashed var(--primary)",
        borderRadius: "8px",
        background: "color-mix(in oklab, var(--primary) 8%, transparent)",
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Screen-space 1px alignment guide line, projected from a world-space
 * SnapGuide (position + perpendicular span). Rendered in the untransformed
 * overlay slot so the line stays crisp at any zoom level.
 */
function SnapGuideLine({ viewport, guide }: { viewport: ViewportState; guide: SnapGuide }) {
  if (guide.axis === "x") {
    const top = worldToScreen(viewport, { x: guide.position, y: guide.span.start });
    const bottom = worldToScreen(viewport, { x: guide.position, y: guide.span.end });
    return (
      <div
        data-canvas-snap-guide="x"
        style={{
          position: "absolute",
          left: `${top.x}px`,
          top: `${Math.min(top.y, bottom.y)}px`,
          width: "1px",
          height: `${Math.abs(bottom.y - top.y)}px`,
          background: "var(--interactive-canvas-guide)",
          pointerEvents: "none",
        }}
      />
    );
  }
  const left = worldToScreen(viewport, { x: guide.span.start, y: guide.position });
  const right = worldToScreen(viewport, { x: guide.span.end, y: guide.position });
  return (
    <div
      data-canvas-snap-guide="y"
      style={{
        position: "absolute",
        left: `${Math.min(left.x, right.x)}px`,
        top: `${left.y}px`,
        width: `${Math.abs(right.x - left.x)}px`,
        height: "1px",
        background: "var(--interactive-canvas-guide)",
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Equal-spacing ("distribution") guide segment from the ported AFFiNE
 * snap-overlay algorithm (W3b): a magenta line spanning one equalized gap,
 * with short perpendicular tick bars at both ends (upstream's end-tick style,
 * DISTRIBUTION_TICK_BAR view px). Segments arrive in world space on
 * InteractionOverlay.distributionGuides; rendered here as one small SVG per
 * segment so they pan/zoom with the stage.
 */
function DistributionGuideLine({
  viewport,
  segment,
}: {
  viewport: ViewportState;
  segment: DistributionGuideSegment;
}) {
  const a = worldToScreen(viewport, { x: segment.x1, y: segment.y1 });
  const b = worldToScreen(viewport, { x: segment.x2, y: segment.y2 });
  const horizontal = Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
  const half = DISTRIBUTION_TICK_BAR / 2;
  const tickA = horizontal
    ? `M ${a.x} ${a.y - half} L ${a.x} ${a.y + half}`
    : `M ${a.x - half} ${a.y} L ${a.x + half} ${a.y}`;
  const tickB = horizontal
    ? `M ${b.x} ${b.y - half} L ${b.x} ${b.y + half}`
    : `M ${b.x - half} ${b.y} L ${b.x + half} ${b.y}`;
  return (
    <svg
      data-canvas-distribution-guide=""
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
    >
      <path
        d={`M ${a.x} ${a.y} L ${b.x} ${b.y} ${tickA} ${tickB}`}
        fill="none"
        stroke={DISTRIBUTION_GUIDE_COLOR}
        strokeWidth={2}
      />
    </svg>
  );
}

/**
 * Small pill chip showing the px gap value, centered on an equal-gap segment
 * (FigJam-style spacing hint). One chip per segment in the hint.
 */
function SpacingChips({ viewport, hint }: { viewport: ViewportState; hint: SpacingHint }) {
  return (
    <>
      {hint.segments.map((segment, index) => {
        const mid = (segment.start + segment.end) / 2;
        const center =
          hint.axis === "x"
            ? worldToScreen(viewport, { x: mid, y: segment.cross })
            : worldToScreen(viewport, { x: segment.cross, y: mid });
        return (
          <div
            key={`${hint.axis}-${index}`}
            data-canvas-spacing-chip="true"
            style={{
              position: "absolute",
              left: `${center.x}px`,
              top: `${center.y}px`,
              transform: "translate(-50%, -50%)",
              background: "var(--interactive-canvas-highlight)",
              color: "var(--foreground)",
              border: "1px solid var(--interactive-canvas-guide)",
              borderRadius: "999px",
              padding: "1px 6px",
              fontSize: "10px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {Math.round(hint.gap)}
          </div>
        );
      })}
    </>
  );
}

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
  const stageCursor = style?.cursor ?? (handToolActive ? "grab" : selectToolActive ? CHROME.selectCursor : undefined);

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
        // FigJam-parity board surface (figjam-tokens.ts CANVAS_BG /
        // GRID_DOT_COLOR): fixed light values in BOTH app themes — FigJam's
        // board is light-only, it never dark-themes the canvas surface
        // itself (only chrome around it changes). Flagged in figjam-tokens.ts
        // as a call worth user feedback once seen live.
        backgroundImage: `radial-gradient(circle, ${GRID_DOT_COLOR} ${grid.dotRadius}px, transparent ${grid.dotRadius}px)`,
        backgroundPosition: grid.backgroundPosition,
        backgroundSize: grid.backgroundSize,
        backgroundColor: CANVAS_BG,
        fontFamily: CANVAS_FONT_FAMILY,
        ...style,
        cursor: stageCursor,
      }}
      onPointerDown={onStagePointerEvent}
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
        .interactive-canvas-object:hover,
        .interactive-canvas-object[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 3px;
        }
        .interactive-canvas-object[data-editable="true"] {
          cursor: inherit;
          touch-action: none;
        }
        .interactive-canvas-stage[data-canvas-select-tool="true"] .interactive-canvas-object[data-editable="true"] {
          cursor: ${CHROME.selectCursor};
        }
        .interactive-canvas-object[data-changed="true"] {
          box-shadow: 0 0 0 5px color-mix(in oklab, var(--primary) 18%, transparent);
        }
        .interactive-canvas-object[data-drop-target="true"] {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
          box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 22%, transparent);
        }
        .interactive-canvas-object-diamond {
          align-items: center;
          text-align: center;
          clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
          padding: 18px 28px;
        }
        /*
         * W2 — sticky is the ONLY object type with a shadow (per spec, every
         * other shape is flat/shadowless). Square corners (STICKY_GEOMETRY.
         * cornerRadiusPx = 0), the measured down-biased shadow, and
         * body/author typography all live here.
         */
        .interactive-canvas-object-note {
          justify-content: flex-start;
          border-radius: ${STICKY_GEOMETRY.cornerRadiusPx}px;
          box-shadow: ${STICKY_GEOMETRY.shadow};
        }
        .interactive-canvas-object-note[data-changed="true"] {
          box-shadow:
            0 0 0 5px color-mix(in oklab, var(--primary) 18%, transparent),
            ${STICKY_GEOMETRY.shadow};
        }
        .interactive-canvas-sticky-body {
          display: flex !important;
          flex-direction: column;
          -webkit-line-clamp: unset !important;
          color: ${STICKY_GEOMETRY.bodyTextColor};
          font-size: ${STICKY_GEOMETRY.bodyFontSizePx}px;
          line-height: ${STICKY_GEOMETRY.bodyLineHeightPx}px;
        }
        .interactive-canvas-sticky-line[data-bullet="true"] {
          position: relative;
          padding-left: 1em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"]::before {
          content: "•";
          position: absolute;
          left: 0;
        }
        .interactive-canvas-sticky-author {
          position: absolute;
          left: ${STICKY_GEOMETRY.author.insetLeftPx}px;
          bottom: ${STICKY_GEOMETRY.author.baselineFromBottomPx - STICKY_GEOMETRY.author.fontSizePx}px;
          font-size: ${STICKY_GEOMETRY.author.fontSizePx}px;
          color: ${STICKY_GEOMETRY.author.color};
        }
        .interactive-canvas-object-marker {
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0;
        }
        .interactive-canvas-object-page-corner {
          clip-path: polygon(0 0, 76% 0, 100% 24%, 100% 100%, 0 100%);
          border-radius: 2px 8px 8px 8px;
        }
        .interactive-canvas-object-document,
        .interactive-canvas-object-folder,
        .interactive-canvas-object-document-stack,
        .interactive-canvas-object-cylinder-horizontal,
        .interactive-canvas-object-ellipse,
        .interactive-canvas-object-triangle,
        .interactive-canvas-object-parallelogram,
        .interactive-canvas-object-pentagon,
        .interactive-canvas-object-octagon,
        .interactive-canvas-object-star,
        .interactive-canvas-object-plus,
        .interactive-canvas-object-chevron,
        .interactive-canvas-object-off-page-connector,
        .interactive-canvas-object-trapezoid,
        .interactive-canvas-object-manual-input,
        .interactive-canvas-object-hexagon,
        .interactive-canvas-object-or-junction,
        .interactive-canvas-object-summing-junction {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
        .interactive-canvas-true-outline-silhouette {
          z-index: 0;
        }
        .interactive-canvas-object-folder {
          padding-top: 26%;
        }
        .interactive-canvas-object-document-stack {
          padding-top: calc(12px + ${DOCUMENT_STACK_GEOMETRY.offsetPx}px);
          padding-left: calc(14px + ${DOCUMENT_STACK_GEOMETRY.offsetPx}px);
        }
        .interactive-canvas-object-triangle {
          justify-content: flex-end;
          padding: 18% 18% 10%;
        }
        .interactive-canvas-object-off-page-connector {
          padding-bottom: ${(1 - OFF_PAGE_CONNECTOR_GEOMETRY.shoulderRatio) * 70}%;
        }
        .interactive-canvas-object-manual-input {
          padding-top: ${MANUAL_INPUT_GEOMETRY.dropRatio * 80}%;
        }
        .interactive-canvas-object-star .interactive-canvas-object-label {
          font-size: 12px;
        }
        .interactive-canvas-object-internal-storage {
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 18% 12% 12% 22%;
        }
        .interactive-canvas-internal-storage-rule {
          position: absolute;
          background: currentColor;
          opacity: 0.6;
          pointer-events: none;
          z-index: 0;
        }
        .interactive-canvas-internal-storage-rule-vertical {
          top: 0;
          bottom: 0;
          left: 15%;
          width: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx / 2}px;
        }
        .interactive-canvas-internal-storage-rule-horizontal {
          left: 0;
          right: 0;
          top: 15%;
          height: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx / 2}px;
        }
        .interactive-canvas-object-person,
        .interactive-canvas-object-database,
        .interactive-canvas-object-chat,
        .interactive-canvas-object-chip-icon {
          /* The SVG silhouette (ShapeSilhouette) paints the fill/border-free
             shape itself — the button chrome stays fully transparent so only
             one outline is visible. */
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          padding: 8px;
        }
        .interactive-canvas-object-person,
        .interactive-canvas-object-chip-icon {
          align-items: center;
          justify-content: flex-end;
          text-align: center;
          padding-bottom: 10%;
        }
        .interactive-canvas-object-database {
          align-items: center;
          justify-content: center;
          text-align: center;
          padding-top: 14%;
        }
        .interactive-canvas-object-chat {
          align-items: center;
          justify-content: flex-end;
          text-align: center;
          padding-bottom: 10%;
        }
        .interactive-canvas-object-person:hover,
        .interactive-canvas-object-person[data-selected="true"],
        .interactive-canvas-object-database:hover,
        .interactive-canvas-object-database[data-selected="true"],
        .interactive-canvas-object-chat:hover,
        .interactive-canvas-object-chat[data-selected="true"],
        .interactive-canvas-object-chip-icon:hover,
        .interactive-canvas-object-chip-icon[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }
        .interactive-canvas-label-below-icon {
          position: relative;
          z-index: 1;
          font-weight: 700;
          color: #000000;
        }
        /* W2 — standalone text/"label" objects: bold black FigJam label, no box. */
        .interactive-canvas-object-text-shape {
          border: none;
          background: transparent !important;
          box-shadow: none;
          padding: 4px;
        }
        .interactive-canvas-object-text-shape .interactive-canvas-object-label {
          font-weight: 700;
          font-size: ${TEXT_SIZES_PX.boldLabel}px;
          color: #000000;
        }
        .interactive-canvas-object-text-shape:hover,
        .interactive-canvas-object-text-shape[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 3px;
        }
        /* W2 — pill: true stadium shape, radius = height/2 (computed inline via CSS calc). */
        .interactive-canvas-object-pill {
          align-items: center;
          justify-content: center;
          text-align: center;
          border-radius: 999px;
        }
        /* W2/W4 — arrow-shape: the SVG silhouette (interactive-canvas-arrow-
           shape-silhouette) paints the full 7-point chevron (fill + stroke),
           so the button chrome stays fully transparent — one outline only. */
        .interactive-canvas-object-arrow-shape {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: ${ARROW_SHAPE_GEOMETRY.bodyCornerRadiusPx}px;
          background: transparent !important;
          overflow: visible;
        }
        .interactive-canvas-arrow-shape-silhouette {
          z-index: 0;
        }
        .interactive-canvas-object-arrow-shape .interactive-canvas-object-label {
          position: relative;
          z-index: 1;
        }
        /* W2 — predefined-process: rect + two inner vertical bars near each edge. */
        .interactive-canvas-object-predefined-process {
          align-items: center;
          justify-content: center;
          text-align: center;
          border-radius: ${PREDEFINED_PROCESS_GEOMETRY.cornerRadiusPx}px;
        }
        .interactive-canvas-predefined-process-bar {
          position: absolute;
          top: 0;
          bottom: 0;
          width: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx}px;
          background: currentColor;
          opacity: 0.6;
        }
        /* W2 — code-block: Dracula theme, mono font, right-aligned line-number gutter. */
        .interactive-canvas-object-code-block {
          align-items: stretch;
          justify-content: flex-start;
          background: ${CODE_BLOCK.bg} !important;
          border: none;
          border-radius: ${CODE_BLOCK.cornerRadiusPx}px;
          padding: ${CODE_BLOCK.paddingTopPx}px 16px 16px 0;
          box-shadow: none;
        }
        .interactive-canvas-code-block-body {
          display: flex;
          flex-direction: column;
          width: 100%;
          overflow: hidden;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 13px;
          line-height: 1.5;
          color: ${CODE_BLOCK.syntax.fg};
        }
        .interactive-canvas-code-block-line {
          display: flex;
          gap: 12px;
          white-space: pre;
        }
        .interactive-canvas-code-block-line-number {
          flex: 0 0 auto;
          width: 24px;
          text-align: right;
          color: ${CODE_BLOCK.gutter.lineNumberColor};
          user-select: none;
        }
        .interactive-canvas-code-block-line-code {
          flex: 1 1 auto;
          min-width: 0;
        }
        /* W2 — section: tint fill, subtle border (= chip fill), no shadow, no
           button-style chrome; the floating title chip is a separate
           absolutely-positioned child. */
        .interactive-canvas-object-section {
          border-style: solid;
          border-width: ${SECTION_GEOMETRY.borderWidthPx}px;
          border-radius: ${SECTION_GEOMETRY.cornerRadiusPx}px;
          padding: 0;
          box-shadow: none;
          align-items: stretch;
          justify-content: flex-start;
        }
        .interactive-canvas-object-section:hover,
        .interactive-canvas-object-section[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .interactive-canvas-section-title-chip {
          position: absolute;
          left: ${SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px;
          top: ${SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px;
          height: ${SECTION_GEOMETRY.titleChip.heightPx}px;
          display: flex;
          align-items: center;
          border-style: solid;
          border-width: ${SECTION_GEOMETRY.titleChip.borderWidthPx}px;
          border-radius: 6px;
          padding: 0 ${SECTION_GEOMETRY.titleChip.paddingXPx}px;
          font-size: ${SECTION_GEOMETRY.titleChip.fontSizePx}px;
          font-weight: ${SECTION_GEOMETRY.titleChip.fontWeight};
          color: ${SECTION_GEOMETRY.titleChip.textColor};
          white-space: nowrap;
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
          background: var(--primary);
          border: 1.5px solid var(--background);
          box-shadow: 0 1px 4px color-mix(in oklab, var(--foreground) 20%, transparent);
          cursor: crosshair;
          opacity: 0;
          pointer-events: none;
          touch-action: none;
          transition: opacity 120ms ease;
          z-index: 1;
        }
        .interactive-canvas-object:hover .interactive-canvas-edge-port {
          opacity: 1;
          pointer-events: auto;
        }
        .interactive-canvas-stage[data-canvas-hand-tool="true"] .interactive-canvas-object {
          cursor: inherit;
        }
        .interactive-canvas-stage[data-canvas-hand-tool="true"] .interactive-canvas-object:hover:not([data-selected="true"]) {
          outline: none;
        }
        .interactive-canvas-stage[data-canvas-hand-tool="true"] .interactive-canvas-object:hover .interactive-canvas-edge-port {
          opacity: 0;
          pointer-events: none;
        }
      `}</style>
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
              5x/4.5x-of-stroke arrowhead (figjam-tokens.ts,
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
        {interactionOverlay?.placePreview && (
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
