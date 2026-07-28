"use client";

/**
 * Connection schema vocabulary: endpoint anchors, connector style/arrow
 * options, and persisted InteractiveCanvasConnection records.
 */
import type { CanvasColor } from "./colors";

export type Anchor = "top" | "right" | "bottom" | "left";

export type CanvasConnectionStyle = "solid" | "dashed";

export type CanvasArrowDirection = "none" | "forward" | "back" | "both";

export type CanvasConnectionEndpoint = {
  objectId: string;
  anchor?: Anchor | "center";
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
  /**
   * Optional pin for the label chip along the ROUTED path (S1.1). Absent —
   * the default — leaves the chip at the route's arc-length midpoint, which
   * is what every board drew before this field existed.
   *
   * - `along` is a fraction in [0, 1] of the routed polyline's total arc
   *   length: 0 is the start anchor, 1 the end anchor, 0.5 the midpoint.
   * - `offset` (optional, finite px, default 0) pushes the chip
   *   perpendicular to the local segment direction at `along`. **Sign
   *   convention: positive is LEFT of the travel direction** (from → to).
   *   In the canvas's y-down world that is the unit vector `(dy, -dx)` of
   *   the normalized segment direction — so on a left-to-right horizontal
   *   run a positive offset lifts the chip upward.
   *
   * Written by the agent's `move_label` gesture; the UI has no editor for it
   * yet. Out-of-range `along` is dropped by the validator (warning), never
   * clamped, so a malformed pin falls back to the midpoint rather than
   * silently landing somewhere the author did not ask for.
   */
  labelPosition?: { along: number; offset?: number };
};
