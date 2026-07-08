"use client";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { connectorBendSegments } from "../../routing/bend-editing";
import { routeConnection } from "../../routing/routing";
import { CONNECTOR_DASH_PATTERN_PX } from "../../objects/connector/def";
import { resolveConnectorStroke } from "../../palette";
import { FIRST_USE_COLORS } from "../../state/schema/object-defaults";

/** Default connector stroke width, logical px (moved from theme/tokens.ts in the theme dispersal). */
const CONNECTOR_STROKE_WIDTH_PX = 4;
/** Selection outline/handle color — inlined from the old CHROME.selectionBlue (render must not import editor/components/editor-style). */
const SELECTION_BLUE = "#0D99FF";

const CONNECTION_HIT_WIDTH = 14;
const ENDPOINT_HANDLE_RADIUS_PX = 7.5;
const ENDPOINT_HANDLE_STROKE_WIDTH_PX = 2.5;
const BEND_HANDLE_LENGTH_PX = 26;
const BEND_HANDLE_THICKNESS_PX = 8;
const BEND_HANDLE_RADIUS_PX = 4;
const CONNECTION_LABEL_HEIGHT_PX = 30;
const CONNECTION_LABEL_PADDING_X_PX = 12;
const CONNECTION_LABEL_FONT_SIZE_PX = 16;
const CONNECTION_LABEL_FONT_WEIGHT = 700;
const CONNECTION_LABEL_RADIUS_PX = 15;
const CONNECTION_LABEL_AVERAGE_CHAR_WIDTH_PX = 9.6;
const CONNECTION_LABEL_MIN_WIDTH_PX = 41;
const CONNECTION_LABEL_BACKGROUND = "#F5F5F5";
const CONNECTION_LABEL_BORDER = "#D9D9D9";
export const BEND_HANDLES_MIN_ZOOM = 0.4;

function connectionLabelWidth(label: string): number {
  return Math.max(
    CONNECTION_LABEL_MIN_WIDTH_PX,
    label.length * CONNECTION_LABEL_AVERAGE_CHAR_WIDTH_PX + CONNECTION_LABEL_PADDING_X_PX * 2,
  );
}

/**
 * One routed connector: an invisible wide hit path (for click-to-select),
 * the visible routed path (elbow, with forward/back/both arrowheads), and —
 * when selected — small endpoint handles at the routed start/end so 3.2.2's
 * endpoint-drag gesture has a hit target.
 */
export function Connector({
  document,
  connection,
  fromObject,
  toObject,
  selected,
  dimmed,
  zoom,
  onDoubleClick,
}: {
  document: InteractiveCanvasDocument;
  connection: InteractiveCanvasConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  selected: boolean;
  /** True while this connector's own endpoint is mid-drag — visible path dims, hit path stays inert. */
  dimmed?: boolean;
  zoom: number;
  onDoubleClick?: (connectionId: string) => void;
}) {
  const routed = routeConnection(fromObject, toObject, connection, document.objects);
  const safeZoom = Math.max(zoom, 0.001);
  // FigJam's dash pattern (theme/tokens.ts, CONNECTOR_DASH_PATTERN_PX).
  const strokeDasharray =
    connection.style === "dashed" ? CONNECTOR_DASH_PATTERN_PX.join(" ") : undefined;
  const arrow = connection.arrow ?? "forward";
  const showForwardArrow = arrow === "forward" || arrow === "both";
  const showBackArrow = arrow === "back" || arrow === "both";
  // Per-connection color pick (P1) resolved through the palette's connector
  // role cells, falling back to the neutral "gray" pick.
  // Arrowheads inherit via the markers' fill="context-stroke" (see <defs>).
  const stroke = resolveConnectorStroke(connection.color ?? FIRST_USE_COLORS.connector);
  const label = connection.label?.trim() ? connection.label : null;
  const endpointRadius = ENDPOINT_HANDLE_RADIUS_PX / safeZoom;
  const endpointStrokeWidth = ENDPOINT_HANDLE_STROKE_WIDTH_PX / safeZoom;
  const bendHandleLength = BEND_HANDLE_LENGTH_PX / safeZoom;
  const bendHandleThickness = BEND_HANDLE_THICKNESS_PX / safeZoom;
  const bendHandleRadius = BEND_HANDLE_RADIUS_PX / safeZoom;
  const labelWidth = label ? connectionLabelWidth(label) : 0;
  const bendSegments =
    selected && safeZoom >= BEND_HANDLES_MIN_ZOOM
      ? connectorBendSegments(routed.points ?? [], {
          labelPoint: label ? routed.labelPoint : null,
          labelClearancePx: label ? labelWidth / 2 + bendHandleLength / 2 : undefined,
        })
      : [];

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
      {label ? (
        <g
          data-canvas-connection-label={connection.id}
          data-canvas-connection-id={connection.id}
          transform={`translate(${routed.labelPoint.x} ${routed.labelPoint.y})`}
          opacity={dimmed ? 0.35 : 1}
          style={{ pointerEvents: "all", cursor: "pointer" }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onDoubleClick?.(connection.id);
          }}
        >
          <rect
            x={-labelWidth / 2}
            y={-CONNECTION_LABEL_HEIGHT_PX / 2}
            width={labelWidth}
            height={CONNECTION_LABEL_HEIGHT_PX}
            rx={CONNECTION_LABEL_RADIUS_PX}
            fill={CONNECTION_LABEL_BACKGROUND}
            stroke={CONNECTION_LABEL_BORDER}
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--foreground)"
            fontSize={CONNECTION_LABEL_FONT_SIZE_PX}
            fontWeight={CONNECTION_LABEL_FONT_WEIGHT}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
        </g>
      ) : null}
      {selected && (
        <>
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
        </>
      )}
    </g>
  );
}
