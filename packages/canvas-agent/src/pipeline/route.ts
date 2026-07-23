import { routeConnectors, simplifyOrthogonalPoints } from "./router";
import type {
  CompileSettings,
  CompiledGutter,
  CompiledObject,
  Point,
  Rect,
  RoutedConnectionInput,
  RuntimeMetrics,
} from "./compiler-types";
import type { ExpandedSketch, SketchEdge, SketchRect } from "./types";

export type RoutingMode = "corridors" | "direct";

export interface RoutableObject {
  id: string;
  type: string;
  geometry: SketchRect;
}

export interface RoutedSketchEdge {
  from: string;
  to: string;
  points: Point[];
}

const ROUTE_GRID = 16;
const STUB = 12;
const OBSTACLE_CLEARANCE = 6;

interface Endpoints {
  start: Point;
  end: Point;
  startNormal: Point;
  endNormal: Point;
}

function rectOf(object: RoutableObject): SketchRect {
  return object.geometry;
}

function center(rect: SketchRect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function inflate(rect: SketchRect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

type BoxSide = "N" | "S" | "E" | "W";

const BOX_SIDES: readonly BoxSide[] = ["N", "S", "E", "W"];

function sideEndpoint(rect: SketchRect, side: BoxSide): { point: Point; normal: Point } {
  const mid = center(rect);
  if (side === "E") return { point: { x: rect.x + rect.width, y: mid.y }, normal: { x: 1, y: 0 } };
  if (side === "W") return { point: { x: rect.x, y: mid.y }, normal: { x: -1, y: 0 } };
  if (side === "S") return { point: { x: mid.x, y: rect.y + rect.height }, normal: { x: 0, y: 1 } };
  return { point: { x: mid.x, y: rect.y }, normal: { x: 0, y: -1 } };
}

function endpointsForSides(
  source: SketchRect,
  target: SketchRect,
  sourceSide: BoxSide,
  targetSide: BoxSide,
): Endpoints {
  const start = sideEndpoint(source, sourceSide);
  const end = sideEndpoint(target, targetSide);
  return {
    start: start.point,
    end: end.point,
    startNormal: start.normal,
    endNormal: end.normal,
  };
}

/** The facing sides of the two boxes, from their center offset. */
function facingSides(source: SketchRect, target: SketchRect): [BoxSide, BoxSide] {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["E", "W"] : ["W", "E"];
  return dy >= 0 ? ["S", "N"] : ["N", "S"];
}

function segmentCrossesRect(a: Point, b: Point, rect: Rect): boolean {
  if (a.y === b.y) {
    if (!(a.y > rect.y && a.y < rect.y + rect.height)) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi > rect.x && lo < rect.x + rect.width;
  }
  if (a.x === b.x) {
    if (!(a.x > rect.x && a.x < rect.x + rect.width)) return false;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return hi > rect.y && lo < rect.y + rect.height;
  }
  return false;
}

function crossingCount(points: readonly Point[], obstacles: readonly Rect[]): number {
  let crossings = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (!a || !b) continue;
    obstacles.forEach((rect) => {
      if (segmentCrossesRect(a, b, rect)) crossings += 1;
    });
  }
  return crossings;
}

function pathLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (a && b) length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return length;
}

/**
 * Candidate detour positions for a Z elbow: the midline, every obstacle
 * bounding-box edge (pushed out by the clearance), and the centers of the
 * gaps between consecutive edges. Distant candidates are allowed — the
 * path-length score keeps detours as tight as the boxes permit.
 */
function detourCandidates(mid: number, obstacles: readonly Rect[], axis: "x" | "y"): number[] {
  const edges = new Set<number>([mid]);
  obstacles.forEach((rect) => {
    const start = axis === "x" ? rect.x : rect.y;
    const extent = axis === "x" ? rect.width : rect.height;
    edges.add(start - OBSTACLE_CLEARANCE);
    edges.add(start + extent + OBSTACLE_CLEARANCE);
  });
  const sorted = [...edges].sort((a, b) => a - b);
  const candidates = new Set<number>(sorted);
  for (let index = 1; index < sorted.length; index += 1) {
    candidates.add((sorted[index - 1]! + sorted[index]!) / 2);
  }
  return [...candidates].sort((a, b) => a - b);
}

/**
 * A clean 2-3 segment orthogonal elbow between facing sides, avoiding boxes
 * via midline detours through bounding-box gaps. Never a straight diagonal.
 * Crossing a box outright is heavily penalized; merely entering a box's
 * clearance halo costs a little, so tight-but-legal squeezes stay available.
 */
function directElbow(source: SketchRect, target: SketchRect, rawObstacles: readonly Rect[]): Point[] {
  const inflated = rawObstacles.map((rect) => inflate(rect, OBSTACLE_CLEARANCE));
  const [facingSource, facingTarget] = facingSides(source, target);

  interface Candidate {
    points: Point[];
    sidePenalty: number;
  }
  const candidates: Candidate[] = [];
  // The facing side pair is preferred (zero penalty); every other exit/entry
  // side stays available so a box whose facing side is walled in (a flush
  // grid cell, a tightly packed row) can still leave through a free side.
  for (const sourceSide of BOX_SIDES) {
    for (const targetSide of BOX_SIDES) {
      const sidePenalty = (sourceSide === facingSource ? 0 : 24)
        + (targetSide === facingTarget ? 0 : 24);
      const { start, end, startNormal, endNormal } = endpointsForSides(
        source, target, sourceSide, targetSide,
      );
      const s = { x: start.x + startNormal.x * STUB, y: start.y + startNormal.y * STUB };
      const e = { x: end.x + endNormal.x * STUB, y: end.y + endNormal.y * STUB };
      const push = (points: Point[]) => candidates.push({ points, sidePenalty });
      push([start, s, { x: e.x, y: s.y }, e, end]);
      push([start, s, { x: s.x, y: e.y }, e, end]);
      detourCandidates((s.x + e.x) / 2, inflated, "x").forEach((mx) => {
        push([start, s, { x: mx, y: s.y }, { x: mx, y: e.y }, e, end]);
      });
      detourCandidates((s.y + e.y) / 2, inflated, "y").forEach((my) => {
        push([start, s, { x: s.x, y: my }, { x: e.x, y: my }, e, end]);
      });
    }
  }

  const scored = candidates
    .map(({ points, sidePenalty }) => ({ points: simplifyOrthogonalPoints(points), sidePenalty }))
    .map(({ points, sidePenalty }, index) => ({
      points,
      index,
      score: crossingCount(points, rawObstacles) * 10_000
        + crossingCount(points, inflated) * 120
        + Math.max(0, points.length - 2) * 40
        + sidePenalty
        + pathLength(points),
    }))
    .sort((a, b) => a.score - b.score || a.index - b.index);
  return scored[0]?.points ?? [center(source), center(target)];
}

function selfLoop(rect: SketchRect): Point[] {
  const right = { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  const top = { x: rect.x + rect.width / 2, y: rect.y };
  return [
    right,
    { x: right.x + 24, y: right.y },
    { x: right.x + 24, y: top.y - 24 },
    { x: top.x, y: top.y - 24 },
    top,
  ];
}

/**
 * Route edges as clean orthogonal elbows over fixed geometry (the Original
 * pane, or the Reconstruction pane in "direct" mode).
 */
export function directElbowEdges(
  objects: readonly RoutableObject[],
  edges: readonly SketchEdge[],
): RoutedSketchEdge[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const boxes = objects.filter((object) => object.type !== "section");
  return edges.flatMap((edge) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target) return [];
    if (source.id === target.id) {
      return [{ from: edge.from, to: edge.to, points: selfLoop(rectOf(source)) }];
    }
    const overlapsEndpoint = (rect: SketchRect): boolean => [source, target].some((endpoint) => {
      const other = rectOf(endpoint);
      return rect.x < other.x + other.width
        && other.x < rect.x + rect.width
        && rect.y < other.y + other.height
        && other.y < rect.y + rect.height;
    });
    const obstacles = boxes
      .filter((object) => object.id !== source.id && object.id !== target.id)
      // A box overlapping an endpoint (fixed original geometry stacks boxes)
      // cannot be avoided by any path from that endpoint; routing around it
      // would only produce pointless detours.
      .filter((object) => !overlapsEndpoint(rectOf(object)))
      .map((object) => rectOf(object) as Rect);
    return [{
      from: edge.from,
      to: edge.to,
      points: directElbow(rectOf(source), rectOf(target), obstacles),
    }];
  });
}

/**
 * Route the expanded sketch's edges through its reserved corridors with the
 * compiler's gutter-preferring router. Falls back to the direct elbow (never
 * a straight diagonal) when the corridor graph has no path.
 */
export function corridorRoutedEdges(expanded: ExpandedSketch): RoutedSketchEdge[] {
  const objects: CompiledObject[] = expanded.objects.map((object, index) => ({
    id: object.id,
    type: object.type === "section" ? "section" : "rect",
    label: object.label ?? "",
    region: "r",
    opIndex: index,
    x: object.geometry.x,
    y: object.geometry.y,
    width: object.geometry.width,
    height: object.geometry.height,
  }));
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const gutters: CompiledGutter[] = expanded.gutters.map((gutter) => ({
    id: gutter.id,
    parent: "r",
    orientation: gutter.orientation,
    x: gutter.x,
    y: gutter.y,
    width: gutter.width,
    height: gutter.height,
  }));
  const rootBox: Rect = {
    x: expanded.bounds.x,
    y: expanded.bounds.y,
    width: expanded.bounds.width,
    height: expanded.bounds.height,
  };
  const settings: CompileSettings = {
    grid: ROUTE_GRID,
    gutter: 48,
    gap: 24,
    width: rootBox.width,
    height: rootBox.height,
  };
  const metrics: RuntimeMetrics = {
    margin: ROUTE_GRID,
    padX: 24,
    padTop: 48,
    padBottom: 24,
    gap: 24,
    gutter: expanded.gutters.length
      ? Math.max(...expanded.gutters.map((gutter) => (
        gutter.orientation === "vertical" ? gutter.width : gutter.height
      )))
      : 48,
  };
  const inputs: RoutedConnectionInput[] = expanded.edges
    .filter((edge) => objectById.has(edge.from) && objectById.has(edge.to))
    .map((edge, index) => ({ from: edge.from, to: edge.to, label: "", opIndex: index }));
  const boxes = expanded.objects.filter((object) => object.type !== "section");
  return routeConnectors(inputs, objectById, objects, gutters, rootBox, settings, metrics)
    .map((connector) => {
      // When boxes sit closer together than the router's endpoint stubs, the
      // corridor graph can have no path and its simple fallback may cut
      // through a neighbor. Detect that and prefer the gap-aware elbow.
      const nonEndpoints = boxes
        .filter((object) => object.id !== connector.from && object.id !== connector.to);
      const crossed = crossingCount(
        connector.points,
        nonEndpoints.map((object) => rectOf(object) as Rect),
      );
      let points = connector.points;
      if (crossed > 0) {
        const source = objectById.get(connector.from);
        const target = objectById.get(connector.to);
        if (source && target) {
          const alternative = directElbow(
            source,
            target,
            nonEndpoints.map((object) => rectOf(object) as Rect),
          );
          const alternativeCrossed = crossingCount(
            alternative,
            nonEndpoints.map((object) => rectOf(object) as Rect),
          );
          if (alternativeCrossed < crossed) points = alternative;
        }
      }
      return { from: connector.from, to: connector.to, points };
    });
}

export function routeSketchEdges(
  expanded: ExpandedSketch,
  mode: RoutingMode,
): RoutedSketchEdge[] {
  if (mode === "corridors") return corridorRoutedEdges(expanded);
  return directElbowEdges(
    expanded.objects.map((object) => ({
      id: object.id,
      type: object.type,
      geometry: object.geometry,
    })),
    expanded.edges,
  );
}

/**
 * Dev-assertion helper: sample points along every routed path and count hits
 * strictly inside boxes that are not the path's own endpoints. Boxes that
 * physically overlap an endpoint box are excluded — no path leaving that
 * endpoint can avoid them, so they carry no routing signal.
 */
export function countPathBoxViolations(
  routed: readonly RoutedSketchEdge[],
  objects: readonly RoutableObject[],
  sampleStep = 4,
): number {
  const boxes = objects.filter((object) => object.type !== "section");
  const byId = new Map(boxes.map((object) => [object.id, object]));
  const rectsOverlap = (a: SketchRect, b: SketchRect): boolean => (
    a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
  );
  let violations = 0;
  routed.forEach((edge) => {
    const endpoints = [byId.get(edge.from), byId.get(edge.to)]
      .filter((object): object is RoutableObject => object !== undefined)
      .map(rectOf);
    const obstacles = boxes
      .filter((object) => object.id !== edge.from && object.id !== edge.to)
      .filter((object) => !endpoints.some((rect) => rectsOverlap(rectOf(object), rect)))
      .map(rectOf);
    let hit = false;
    for (let index = 1; index < edge.points.length && !hit; index += 1) {
      const a = edge.points[index - 1]!;
      const b = edge.points[index]!;
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const steps = Math.max(1, Math.ceil(length / sampleStep));
      for (let step = 0; step <= steps && !hit; step += 1) {
        const t = step / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        hit = obstacles.some((rect) => (
          x > rect.x + 0.5
          && x < rect.x + rect.width - 0.5
          && y > rect.y + 0.5
          && y < rect.y + rect.height - 0.5
        ));
      }
    }
    if (hit) violations += 1;
  });
  return violations;
}
