/**
 * Shared chip/polyline geometry for the graph lints. All path geometry comes
 * from the production `routeConnection` router — anchors, waypoints, and
 * obstacles honored — so lint verdicts and renders can never disagree
 * (pinned by test/lints-routing-truth.test.ts).
 *
 * Chip rects are the RENDERER's chips, not an estimate: the canvas
 * package's shared chip geometry (packages/canvas/src/connectors/
 * label-chip.ts — what connectors/Connector.tsx draws on the stage and
 * render/static-svg.ts draws in the headless preview export) under the
 * board's canvas style, centered on the route's own effective label point
 * (`labelPointFor`: the arc-length midpoint, or the connection's
 * `labelPosition` pin), and no chip at all for empty/whitespace labels.
 * The chip is the label's measured width (text-measure, the chip font) plus
 * its padding: under the figjam style Inter 16/700 + 2×12px, at least 41px
 * wide and 30 high — the CHIP_* constants below; the schematic themes (the
 * default is schematic-light) draw a shorter IBM Plex Mono chip. Pinned to
 * the static renderer's actual SVG output by test/lints-chip-parity.test.ts
 * — drift fails that test.
 *
 * CHIP_CLEARANCE: chips physically kissing boxes or wires read as merged
 * even without true overlap, so contact within 16px of a chip is a finding
 * too (warning tier; true overlap stays error tier).
 *
 * A measured width is only as good as the measurement: within
 * TEXT_FIT_TOLERANCE_PX of the chip's edge the browser's chip may be a hair
 * narrower or wider, and a label holding characters the chip font lacks is
 * an estimate. Every chip finding is therefore judged on the chip's
 * guaranteed footprint (`narrowRect`: the label a tolerance narrower, any
 * character the font lacks at zero width, never under the minimum chip);
 * what only the measured full-width chip shows is a note, never a blocker.
 */
import { labelPointFor, routeConnection } from "../../../../canvas/src/connectors/routing.ts";
import { connectionLabelChipMetrics, connectionLabelFontSpec } from "../../../../canvas/src/connectors/label-chip.ts";
import { iconGlyphBoxPx } from "../../../../canvas/src/objects/text-slots.ts";
import {
  graphemeClusters,
  fitText,
  measureWidth,
} from "../../../../canvas/src/theme/text-measure.ts";

import type {
  InteractiveCanvasConnection, InteractiveCanvasDocument, InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";
import type { Severity } from "./types";

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

/** Figjam-style chip height. */
export const CHIP_HEIGHT = 30;
/** Figjam-style horizontal text padding, per side. */
export const CHIP_PADDING_X = 12;
/** Figjam-style minimum chip width. */
export const CHIP_MIN_WIDTH = 41;
/** Clearance margin around a chip (nested-arch R1: kissing chips read merged). */
export const CHIP_CLEARANCE = 16;
/**
 * How much narrower the browser's chip may be than the measured one: the
 * label's measured width is trusted to TEXT_FIT_TOLERANCE_PX
 * (board/text-fit.ts — the same 1px band), the chip centered on it.
 */
export const CHIP_WIDTH_TOLERANCE = 1;

export interface Chip {
  edge: InteractiveCanvasConnection;
  label: string;
  rect: Rect;
  /**
   * The chip's guaranteed footprint, centered like `rect`: the measured label
   * CHIP_WIDTH_TOLERANCE narrower, every character the chip font lacks at
   * zero width, never narrower than the minimum chip — and just the minimum
   * chip when the font itself cannot be measured exactly. Findings that hold
   * for it hold for any chip the browser can paint.
   */
  narrowRect: Rect;
  /** The label measures exactly: an exact backend, the bundled chip font, every character covered. */
  reliable: boolean;
  /** Characters (grapheme clusters) the chip font lacks — their widths are estimates. */
  uncovered: string[];
}

/**
 * The severity of a chip finding whose test is `holds` (and holds for the
 * full chip): `base` when it holds for the chip's guaranteed footprint too;
 * otherwise a note — the finding hangs on a pixel the measurement cannot
 * promise, or on an estimated width.
 */
export function chipFindingSeverity(
  chip: Chip,
  holds: (rect: Rect) => boolean,
  base: "error" | "warning",
): Severity {
  return holds(chip.narrowRect) ? base : "note";
}

/** What a chip test found: overlap (`on`) and contact inside the clearance margin (`near`). */
export interface ChipContact {
  on: boolean;
  near: boolean;
}

/**
 * The finding a chip earns on the overlap → clearance ladder and its
 * severity: judged on the guaranteed footprint (overlap is an error, contact
 * inside the margin a warning); what only the measured full-width chip shows
 * is a note. Null when the full chip shows neither. A chip overlapping a box
 * by a fraction of a pixel is therefore a note about the overlap AND, since
 * the narrow chip still sits inside the margin, a warning about the margin —
 * the warning is what it reports.
 */
export function chipContactFinding(
  full: ChipContact,
  narrow: ChipContact,
): { kind: "on" | "near"; severity: Severity } | null {
  if (!full.on && !full.near) return null;
  if (narrow.on) return { kind: "on", severity: "error" };
  if (narrow.near) return { kind: "near", severity: "warning" };
  return { kind: full.on ? "on" : "near", severity: "note" };
}

/** The message tail a chip note carries ("" for a judged finding). */
export function chipNoteClause(chip: Chip, severity: Severity): string {
  if (severity !== "note") return "";
  if (!chip.reliable) {
    return chip.uncovered.length > 0
      ? ` (estimated: the chip font lacks ${chip.uncovered.map((g) => JSON.stringify(g)).join(" ")}, so the label's width is not exact)`
      : " (estimated: the label's width is not measured exactly here)";
  }
  return ` (within ${CHIP_WIDTH_TOLERANCE}px of the chip's measured width — can't promise)`;
}

/** The renderer's chip width for `label` under `canvasStyle` (default style when omitted), exactly. */
export function chipWidth(label: string, canvasStyle?: CanvasStyle): number {
  return connectionLabelChipMetrics(label, canvasStyle).width;
}

export function center(object: InteractiveCanvasObject): Point {
  const { x, y, width, height } = object.geometry;
  return { x: x + width / 2, y: y + height / 2 };
}

export function rectOf(object: InteractiveCanvasObject): Rect {
  return object.geometry;
}

/**
 * Where an object's box paints: its geometry, except a tile-style icon,
 * which paints only its tile (capped at the style's `iconTileMaxPx`,
 * centered in the box — the rect connectors meet and routes avoid).
 * Default style when `canvasStyle` is omitted.
 */
export function drawnRectOf(object: InteractiveCanvasObject, canvasStyle?: CanvasStyle): Rect {
  const local = iconGlyphBoxPx(object, canvasStyle);
  return {
    x: object.geometry.x + local.x,
    y: object.geometry.y + local.y,
    width: local.width,
    height: local.height,
  };
}

export function inflate(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

/** Strictly-positive rect intersection. */
export function intersects(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

/**
 * The edge's true renderer polyline, including stored anchors, endpoint
 * positions, waypoints, and all document objects as routing obstacles.
 * Empty when an endpoint is missing.
 */
export function routedPolyline(
  edge: InteractiveCanvasConnection, document: InteractiveCanvasDocument,
  canvasStyle?: CanvasStyle,
): Point[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const fromId = edge.from.objectId;
  const toId = edge.to.objectId;
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) return [];
  // The workspace style sizes icon captions, which set where edges attach.
  const routed = routeConnection(from, to, edge, document.objects, canvasStyle);
  return (routed.points ?? [routed.start, routed.end])
    .map((point) => ({ x: point.x, y: point.y }));
}

/**
 * Non-endpoint boxes whose interiors are crossed by a routed polyline.
 *
 * This preserves the long-standing broken-edge semantics: sections are not
 * violation boxes; endpoint ids and boxes overlapping a non-section endpoint
 * rect are ignored; samples land at most 4px apart and must be 0.5px inside.
 * A box is judged where it paints (drawnRectOf under `canvasStyle`): a
 * tile-style icon only by its tile, as the router avoids it.
 */
export function pathBoxViolationIds(
  points: readonly Point[],
  fromId: string,
  toId: string,
  objects: readonly InteractiveCanvasObject[],
  canvasStyle?: CanvasStyle,
): string[] {
  const boxes = objects.filter((object) => object.type !== "section");
  const byId = new Map(boxes.map((object) => [object.id, object]));
  const endpointRects = [byId.get(fromId), byId.get(toId)]
    .filter((object): object is InteractiveCanvasObject => object !== undefined)
    .map(rectOf);
  const obstacles = boxes
    .filter((object) => object.id !== fromId && object.id !== toId)
    .filter((object) => !endpointRects.some((endpoint) => overlaps(endpoint, rectOf(object))));
  const hits = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      for (const object of obstacles) {
        const rect = drawnRectOf(object, canvasStyle);
        if (
          x > rect.x + 0.5
          && x < rect.x + rect.width - 0.5
          && y > rect.y + 0.5
          && y < rect.y + rect.height - 0.5
        ) {
          hits.add(object.id);
        }
      }
    }
  }
  return [...hits].sort();
}

/**
 * The renderer's label chip for an edge, or undefined when it draws none
 * (no label, whitespace-only label — the renderer's own `label?.trim()`
 * gate — or a missing endpoint). Centered on the route's EFFECTIVE label
 * point (`labelPointFor`) — the arc-length midpoint, or the connection's
 * `labelPosition` pin when it has one — i.e. exactly where Connector.tsx and
 * static-svg.ts hang the chip. A pinned chip is judged where it is drawn, so
 * `move_label` can actually clear an overlap the lints flagged.
 *
 * Every chip judgement in the lints goes through here, so the router's
 * `labelPointFor` is the single label-point implementation in the tree and
 * there is nothing for a lint to drift against.
 */
export function chipFor(
  edge: InteractiveCanvasConnection, document: InteractiveCanvasDocument,
  canvasStyle?: CanvasStyle,
): Chip | undefined {
  const label = edge.label;
  if (label === undefined || label.trim() === "") return undefined;
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const from = byId.get(edge.from.objectId);
  const to = byId.get(edge.to.objectId);
  if (!from || !to) return undefined;
  const routed = routeConnection(from, to, edge, document.objects, canvasStyle);
  const labelPoint = labelPointFor(routed, edge);
  const metrics = connectionLabelChipMetrics(label, canvasStyle);
  const { width, height } = metrics;
  const font = connectionLabelFontSpec(canvasStyle);
  // text-measure's own verdict on the label: exact unless a reason says otherwise.
  const fit = fitText(label, font, { width: Number.POSITIVE_INFINITY, lineHeight: 1 });
  const uncovered = fit.uncovered;
  // The least the label can measure: nothing when anything but missing glyphs
  // makes the measurement inexact, else its covered text with every missing glyph at zero width.
  const exact = fit.reasons.every((reason) => reason === "uncovered");
  const missing = new Set(uncovered);
  const leastText = !exact
    ? 0
    : missing.size === 0
      ? metrics.textWidthPx
      : measureWidth(graphemeClusters(label).filter((grapheme) => !missing.has(grapheme)).join(""), font);
  const narrowWidth = Math.max(
    metrics.minWidthPx,
    Math.min(width, Math.max(0, leastText - CHIP_WIDTH_TOLERANCE) + metrics.paddingXPx * 2),
  );
  return {
    edge,
    label,
    rect: {
      x: labelPoint.x - width / 2,
      y: labelPoint.y - height / 2,
      width,
      height,
    },
    narrowRect: {
      x: labelPoint.x - narrowWidth / 2,
      y: labelPoint.y - height / 2,
      width: narrowWidth,
      height,
    },
    reliable: fit.reliable,
    uncovered,
  };
}

/** Length of segment a→b that lies inside `rect` (Liang–Barsky clip). */
export function segmentLengthInRect(a: Point, b: Point, rect: Rect): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clips: Array<[number, number]> = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return 0;  // parallel and outside
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return 0;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return 0;
      if (r < t1) t1 = r;
    }
  }
  if (t1 <= t0) return 0;
  return Math.hypot(dx, dy) * (t1 - t0);
}

/** Total polyline length inside `rect`. */
export function polylineLengthInRect(points: readonly Point[], rect: Rect): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += segmentLengthInRect(points[i - 1]!, points[i]!, rect);
  }
  return total;
}

/**
 * Axis-aligned rendering of a polyline: diagonal legs become
 * horizontal-then-vertical elbows (connectors render elbow-only); already
 * axis-aligned legs pass through untouched.
 */
export function elbowize(points: readonly Point[]): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1]!;
    const next = points[i]!;
    if (prev.x !== next.x && prev.y !== next.y) {
      out.push({ x: next.x, y: prev.y });
    }
    out.push(next);
  }
  return out;
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distancePointToSegment(p, points[i - 1]!, points[i]!));
  }
  return best;
}
