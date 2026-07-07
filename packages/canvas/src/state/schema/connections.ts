"use client";

export type CanvasConnectionStyle = "solid" | "dotted" | "elbow" | "smooth";

export type CanvasArrowDirection = "none" | "forward" | "back" | "both";

export type CanvasConnectionEndpoint = {
  objectId: string;
  anchor?: "top" | "right" | "bottom" | "left" | "center";
  /**
   * Relative anchor point on the endpoint object's bounds, as
   * [0..1, 0..1] fractions of (width, height) from the top-left corner.
   * Optional — when present, used by A* routing (D33 thread B) as a more
   * precise anchor than the coarse `anchor` side; when absent, routing
   * falls back to `anchor` / auto-picked sides.
   */
  position?: [number, number];
};

export type InteractiveCanvasConnection = {
  id: string;
  from: CanvasConnectionEndpoint;
  to: CanvasConnectionEndpoint;
  label?: string;
  style?: CanvasConnectionStyle;
  arrow?: CanvasArrowDirection;
  role?: string;
  /**
   * Stroke color for this connector (W3b/W4). Any non-empty string is
   * accepted (hex expected in practice — see theme/tokens.ts's
   * CONNECTOR_COLORS in objects/connector/def.ts for the sampled FigJam set). Absent means the default
   * neutral gray (CONNECTOR_DEFAULT_COLOR); arrowheads inherit the stroke.
   */
  color?: string;
  /**
   * Optional world-space polyline override (D33 thread B). When present,
   * `routeConnection` honors these points verbatim instead of recomputing
   * an obstacle-avoiding route. Each entry is a [x, y] world coordinate.
   */
  waypoints?: Array<[number, number]>;
};
