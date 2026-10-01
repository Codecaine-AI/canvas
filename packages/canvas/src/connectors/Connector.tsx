"use client";

/**
 * Connector rendering components draw routed connection paths plus selection
 * trim for endpoint and bend editing.
 */
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
import { connectorBendSegments } from "./bend-editing";
import { labelPointFor, routeConnection } from "./routing";
import { connectorDashArray } from "./def";
import { CONNECTION_LABEL_CHIP, connectionLabelChipMetrics } from "./label-chip";
import { resolveConnectorPaint } from "../theme/palette";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import { CANVAS_MONO_FONT_STACK } from "../theme/fonts";
import { useCanvasStyle } from "../theme/canvas-style-context";
import { useArrowMarkerUrl } from "./arrow-markers";

// Connector stroke width, ink, label chip (size, font, colors, corner radius)
// and elbow bend radius come from the workspace canvas style
// (theme/canvas-style.ts) via useCanvasStyle; the chip's geometry is shared
// with the static renderer and the agent lints (./label-chip.ts).
/** Selection outline/handle color — inlined from the old TRIM.selectionBlue (stage must not import stage/editor/components/editor-style). */
const SELECTION_BLUE = "#0D99FF";

const CONNECTION_HIT_WIDTH = 14;
const ENDPOINT_HANDLE_RADIUS_PX = 7.5;
const ENDPOINT_HANDLE_STROKE_WIDTH_PX = 2.5;
const BEND_HANDLE_LENGTH_PX = 26;
const BEND_HANDLE_THICKNESS_PX = 8;
const BEND_HANDLE_RADIUS_PX = 4;
export const BEND_HANDLES_MIN_ZOOM = 0.4;

/**
 * One routed connector: an invisible wide hit path (for click-to-select),
 * the visible routed path (elbow, with forward/back/both arrowheads), and an
 * optional label chip. Selection trim (endpoint handles, bend pills) is NOT
 * rendered here — CanvasStage mounts ConnectorSelectionTrim in a dedicated
 * layer ABOVE the object layer, so shape bodies/borders can never paint over
 * the blue affordances.
 */
export function Connector({
  document,
  connection,
  fromObject,
  toObject,
  dimmed,
  zoom,
  onDoubleClick,
}: {
  document: InteractiveCanvasDocument;
  connection: InteractiveCanvasConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  /** True while this connector's own endpoint is mid-drag — visible path dims, hit path stays inert. */
  dimmed?: boolean;
  zoom: number;
  onDoubleClick?: (connectionId: string) => void;
}) {
  const canvasStyle = useCanvasStyle();
  const forwardMarkerUrl = useArrowMarkerUrl(document.id, "forward");
  const backMarkerUrl = useArrowMarkerUrl(document.id, "back");
  const routed = routeConnection(fromObject, toObject, connection, document.objects, canvasStyle);
  // FigJam's dash pattern scaled with the style's line width (./def.ts).
  const strokeDasharray = connection.style === "dashed" ? connectorDashArray(canvasStyle) : undefined;
  const arrow = connection.arrow ?? "forward";
  const showForwardArrow = arrow === "forward" || arrow === "both";
  const showBackArrow = arrow === "back" || arrow === "both";
  // Per-connection color pick (P1) resolved to the theme's ink, falling back
  // to the neutral "gray" pick. Arrowheads inherit via the markers'
  // fill="context-stroke" (see <defs>).
  const stroke = resolveConnectorPaint(connection.color ?? FIRST_USE_COLORS.connector, canvasStyle).stroke;
  const label = connection.label?.trim() ? connection.label : null;
  // The pinned chip center (S1.1) — `routed.labelPoint` unless the connection
  // carries a `labelPosition`.
  const labelPoint = labelPointFor(routed, connection);
  const chip = label ? connectionLabelChipMetrics(label, canvasStyle) : null;

  return (
    <g data-canvas-connection-group={connection.id}>
      <path
        d={routed.path}
        fill="none"
        stroke="transparent"
        strokeWidth={CONNECTION_HIT_WIDTH}
        strokeLinecap="round"
        data-canvas-connection-id={connection.id}
        // No cursor override: hovering a line keeps the stage's own cursor.
        style={{ pointerEvents: "stroke" }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onDoubleClick?.(connection.id);
        }}
      />
      <path
        d={routed.path}
        fill="none"
        stroke={stroke}
        strokeWidth={canvasStyle.connectorStrokeWidthPx}
        strokeLinecap="butt"
        strokeDasharray={strokeDasharray}
        opacity={dimmed ? 0.35 : 1}
        pointerEvents="none"
        markerEnd={showForwardArrow ? forwardMarkerUrl : undefined}
        markerStart={showBackArrow ? backMarkerUrl : undefined}
      />
      {label && chip ? (
        <g
          data-canvas-connection-label={connection.id}
          data-canvas-connection-id={connection.id}
          transform={`translate(${labelPoint.x} ${labelPoint.y})`}
          opacity={dimmed ? 0.35 : 1}
          style={{ pointerEvents: "all" }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onDoubleClick?.(connection.id);
          }}
        >
          <rect
            x={-chip.width / 2}
            y={-chip.height / 2}
            width={chip.width}
            height={chip.height}
            rx={canvasStyle.labelChipCornerRadiusPx}
            fill={canvasStyle.connectorLabelBackground}
            stroke={canvasStyle.hairlineColor}
            strokeWidth={CONNECTION_LABEL_CHIP.borderWidthPx}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={canvasStyle.connectorLabelTextColor}
            fontSize={chip.fontSizePx}
            fontWeight={chip.fontWeight}
            fontFamily={chip.font === "mono" ? CANVAS_MONO_FONT_STACK : undefined}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/**
 * Selection trim for the selected connection: blue bend pills on every
 * segment plus endpoint handles at the routed start/end (3.2.2's endpoint-drag
 * hit targets). Rendered by CanvasStage in its own world-space SVG layer ABOVE
 * the object layer — shapes paint over connector LINES by design (W4 z-cake),
 * but the selection affordances must never be covered by a shape body/border.
 */
export function ConnectorSelectionTrim({
  document,
  connection,
  fromObject,
  toObject,
  zoom,
}: {
  document: InteractiveCanvasDocument;
  connection: InteractiveCanvasConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  zoom: number;
}) {
  const canvasStyle = useCanvasStyle();
  const routed = routeConnection(fromObject, toObject, connection, document.objects, canvasStyle);
  const safeZoom = Math.max(zoom, 0.001);
  const label = connection.label?.trim() ? connection.label : null;
  const endpointRadius = ENDPOINT_HANDLE_RADIUS_PX / safeZoom;
  const endpointStrokeWidth = ENDPOINT_HANDLE_STROKE_WIDTH_PX / safeZoom;
  const bendHandleLength = BEND_HANDLE_LENGTH_PX / safeZoom;
  const bendHandleThickness = BEND_HANDLE_THICKNESS_PX / safeZoom;
  const bendHandleRadius = BEND_HANDLE_RADIUS_PX / safeZoom;
  const labelWidth = label ? connectionLabelChipMetrics(label, canvasStyle).width : 0;
  const bendSegments =
    safeZoom >= BEND_HANDLES_MIN_ZOOM
      ? connectorBendSegments(routed.points ?? [], {
          // Handles dodge the chip where it actually sits (S1.1 pin), not the
          // route midpoint.
          labelPoint: label ? labelPointFor(routed, connection) : null,
          labelClearancePx: label ? labelWidth / 2 + bendHandleLength / 2 : undefined,
        })
      : [];

  return (
    <g data-canvas-connection-trim={connection.id}>
      {bendSegments.map((segment) => (
        <rect
          key={`bend-segment-${segment.index}`}
          x={segment.handlePoint.x - bendHandleLength / 2}
          y={segment.handlePoint.y - bendHandleThickness / 2}
          width={bendHandleLength}
          height={bendHandleThickness}
          rx={bendHandleRadius}
          fill={SELECTION_BLUE}
          data-canvas-bend-segment={segment.index}
          data-canvas-connection-id={connection.id}
          transform={
            segment.axis === "vertical"
              ? `rotate(90 ${segment.handlePoint.x} ${segment.handlePoint.y})`
              : undefined
          }
          style={{
            pointerEvents: "all",
            cursor: segment.axis === "horizontal" ? "ns-resize" : "ew-resize",
          }}
        />
      ))}
      <circle
        cx={routed.start.x}
        cy={routed.start.y}
        r={endpointRadius}
        fill="#FFFFFF"
        stroke={SELECTION_BLUE}
        strokeWidth={endpointStrokeWidth}
        data-canvas-endpoint="from"
        data-canvas-connection-id={connection.id}
        style={{ pointerEvents: "all", cursor: "default" }}
      />
      <circle
        cx={routed.end.x}
        cy={routed.end.y}
        r={endpointRadius}
        fill="#FFFFFF"
        stroke={SELECTION_BLUE}
        strokeWidth={endpointStrokeWidth}
        data-canvas-endpoint="to"
        data-canvas-connection-id={connection.id}
        style={{ pointerEvents: "all", cursor: "default" }}
      />
    </g>
  );
}
