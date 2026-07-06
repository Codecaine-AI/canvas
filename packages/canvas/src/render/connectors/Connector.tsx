"use client";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { routeConnection } from "../../routing/routing";
import {
  CHROME,
  CONNECTOR_DASH_PATTERN_PX,
  CONNECTOR_DEFAULT_COLOR,
  CONNECTOR_STROKE_WIDTH_PX,
} from "../../theme/tokens";

const CONNECTION_HIT_WIDTH = 14;
const ENDPOINT_HANDLE_RADIUS = 6;
/** Side length of the render-only bend-affordance square at elbow corners (W3b stub). */
const BEND_STUB_SIZE = 12;

/**
 * One routed connector: an invisible wide hit path (for click-to-select),
 * the visible routed path (elbow/smooth/straight per connection.style, with
 * forward/back/both arrowheads), and — when selected — small endpoint handles
 * at the routed start/end so 3.2.2's endpoint-drag gesture has a hit target.
 */
export function Connector({
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
  // FigJam's dash pattern (theme/tokens.ts, CONNECTOR_DASH_PATTERN_PX).
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
