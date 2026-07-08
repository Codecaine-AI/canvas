"use client";

import type { CanvasColor } from "./colors";

export type CanvasConnectionStyle = "solid" | "dashed";

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
   * Stroke color pick for this connector (P1, OBJECT-DEF-OVERHAUL.md D1/D12)
   * — a swatch id from the closed 10-id roster, resolved to a stroke hex via
   * palette.ts's connector role cells. Absent means the default neutral gray
   * pick ("gray"); arrowheads inherit the stroke.
   */
  color?: CanvasColor;
  /**
   * Optional world-space polyline override (D33 thread B). When present,
   * `routeConnection` honors these points verbatim instead of recomputing
   * an obstacle-avoiding route. Each entry is a [x, y] world coordinate.
   */
  waypoints?: Array<[number, number]>;
};
