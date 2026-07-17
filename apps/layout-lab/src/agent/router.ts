import type {
  CompileSettings,
  CompiledConnector,
  CompiledGutter,
  CompiledObject,
  Point,
  Rect,
  RoutedConnectionInput,
  RuntimeMetrics,
} from "./types";

type RouteAxis = "h" | "v";
type SearchDirection = "n" | RouteAxis;

interface Corridor {
  id: string;
  kind: "gutter" | "ring";
  axis: RouteAxis;
  fixed: number;
  lo: number;
  hi: number;
  width: number;
}

interface GraphEdge {
  to: number;
  axis: RouteAxis;
  length: number;
  cost: number;
  corridorId: string | null;
}

interface GraphNode extends Point {
  id: number;
  edges: GraphEdge[];
}

interface QueueEntry {
  nodeId: number;
  direction: SearchDirection;
  cost: number;
  bends: number;
}

interface FacingEndpoints {
  start: Point;
  end: Point;
  startNormal: Point;
  endNormal: Point;
}

interface ShiftedSegment {
  axis: RouteAxis;
  a: Point;
  b: Point;
}

function snapNearest(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function samePoint(a: Point | undefined, b: Point | undefined): boolean {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

/** Route connectors deterministically, preferring subdivision gutters and their lanes. */
export function routeConnectors(
  connectionOps: readonly RoutedConnectionInput[],
  objectById: ReadonlyMap<string, CompiledObject>,
  objects: readonly CompiledObject[],
  gutters: readonly CompiledGutter[],
  rootBox: Rect,
  settings: CompileSettings,
  metrics: RuntimeMetrics,
): CompiledConnector[] {
  const routeObjects = objects.filter((object) => object.type !== "section");
  const corridors = buildCorridors(gutters, rootBox, settings, metrics);
  const laneUse = new Map<string, number>();
  const connectors: CompiledConnector[] = [];

  connectionOps.forEach((connection) => {
    const source = objectById.get(connection.from);
    const target = objectById.get(connection.to);
    if (!source || !target) return;
    const endpoints = facingEndpoints(source, target);
    const startStub = {
      x: endpoints.start.x + endpoints.startNormal.x * settings.grid,
      y: endpoints.start.y + endpoints.startNormal.y * settings.grid,
    };
    const endStub = {
      x: endpoints.end.x + endpoints.endNormal.x * settings.grid,
      y: endpoints.end.y + endpoints.endNormal.y * settings.grid,
    };
    const obstacles = routeObjects
      .filter((object) => object.id !== source.id && object.id !== target.id)
      .map((object) => inflateRect(object, 8));
    let points: Point[];

    if (metrics.gutter === 0) {
      points = samePoint(startStub, endStub)
        ? [endpoints.start, startStub, endpoints.end]
        : [endpoints.start, ...fallbackElbow(startStub, endStub, obstacles), endpoints.end];
    } else {
      const graphPoints = samePoint(startStub, endStub)
        ? [startStub]
        : graphRoute(startStub, endStub, obstacles, corridors, rootBox, settings);
      points = graphPoints?.length ? graphPoints : fallbackElbow(startStub, endStub, obstacles);
      points = [endpoints.start, ...points, endpoints.end];
      points = applyCorridorLanes(points, corridors, laneUse, metrics.gutter);
    }

    points = simplifyOrthogonalPoints(points);
    connectors.push({
      id: `connector-${connection.opIndex}`,
      opIndex: connection.opIndex,
      from: connection.from,
      to: connection.to,
      label: connection.label,
      points,
      labelPoint: polylineMidpoint(points),
    });
  });
  return connectors;
}

function buildCorridors(
  gutters: readonly CompiledGutter[],
  rootBox: Rect,
  settings: CompileSettings,
  metrics: RuntimeMetrics,
): Corridor[] {
  const corridors: Corridor[] = gutters
    .filter(() => metrics.gutter > 0)
    .map((gutter) => gutter.orientation === "vertical"
      ? {
        id: gutter.id,
        kind: "gutter",
        axis: "v",
        fixed: gutter.x + gutter.width / 2,
        lo: gutter.y,
        hi: gutter.y + gutter.height,
        width: gutter.width,
      }
      : {
        id: gutter.id,
        kind: "gutter",
        axis: "h",
        fixed: gutter.y + gutter.height / 2,
        lo: gutter.x,
        hi: gutter.x + gutter.width,
        width: gutter.height,
      });
  const ringInset = settings.grid;
  corridors.push(
    { id: "ring:top", kind: "ring", axis: "h", fixed: rootBox.y + ringInset, lo: rootBox.x + ringInset, hi: rootBox.x + rootBox.width - ringInset, width: settings.grid },
    { id: "ring:bottom", kind: "ring", axis: "h", fixed: rootBox.y + rootBox.height - ringInset, lo: rootBox.x + ringInset, hi: rootBox.x + rootBox.width - ringInset, width: settings.grid },
    { id: "ring:left", kind: "ring", axis: "v", fixed: rootBox.x + ringInset, lo: rootBox.y + ringInset, hi: rootBox.y + rootBox.height - ringInset, width: settings.grid },
    { id: "ring:right", kind: "ring", axis: "v", fixed: rootBox.x + rootBox.width - ringInset, lo: rootBox.y + ringInset, hi: rootBox.y + rootBox.height - ringInset, width: settings.grid },
  );
  return corridors;
}

function facingEndpoints(source: CompiledObject, target: CompiledObject): FacingEndpoints {
  if (source.id === target.id) {
    return {
      start: { x: source.x + source.width, y: source.y + source.height / 2 },
      end: { x: source.x + source.width / 2, y: source.y },
      startNormal: { x: 1, y: 0 },
      endNormal: { x: 0, y: -1 },
    };
  }
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? {
        start: { x: source.x + source.width, y: sourceCenter.y },
        end: { x: target.x, y: targetCenter.y },
        startNormal: { x: 1, y: 0 },
        endNormal: { x: -1, y: 0 },
      }
      : {
        start: { x: source.x, y: sourceCenter.y },
        end: { x: target.x + target.width, y: targetCenter.y },
        startNormal: { x: -1, y: 0 },
        endNormal: { x: 1, y: 0 },
      };
  }
  return dy >= 0
    ? {
      start: { x: sourceCenter.x, y: source.y + source.height },
      end: { x: targetCenter.x, y: target.y },
      startNormal: { x: 0, y: 1 },
      endNormal: { x: 0, y: -1 },
    }
    : {
      start: { x: sourceCenter.x, y: source.y },
      end: { x: targetCenter.x, y: target.y + target.height },
      startNormal: { x: 0, y: -1 },
      endNormal: { x: 0, y: 1 },
    };
}

function inflateRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function graphRoute(
  start: Point,
  end: Point,
  obstacles: readonly Rect[],
  corridors: readonly Corridor[],
  rootBox: Rect,
  settings: CompileSettings,
): Point[] | null {
  const xs = new Set<number>([start.x, end.x]);
  const ys = new Set<number>([start.y, end.y]);
  corridors.forEach((corridor) => {
    if (corridor.axis === "v") {
      xs.add(corridor.fixed);
      ys.add(corridor.lo);
      ys.add(corridor.hi);
    } else {
      ys.add(corridor.fixed);
      xs.add(corridor.lo);
      xs.add(corridor.hi);
    }
  });
  obstacles.forEach((rect) => {
    xs.add(rect.x);
    xs.add(rect.x + rect.width);
    ys.add(rect.y);
    ys.add(rect.y + rect.height);
  });
  xs.add(rootBox.x + settings.grid);
  xs.add(rootBox.x + rootBox.width - settings.grid);
  ys.add(rootBox.y + settings.grid);
  ys.add(rootBox.y + rootBox.height - settings.grid);

  const xValues = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  const yValues = [...ys].filter(Number.isFinite).sort((a, b) => a - b);
  const nodeMap = new Map<string, GraphNode>();
  const nodes: GraphNode[] = [];
  const insideObstacle = (point: Point): boolean => obstacles.some((rect) =>
    point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height);

  yValues.forEach((y) => xValues.forEach((x) => {
    const point = { x, y };
    if (insideObstacle(point) && !samePoint(point, start) && !samePoint(point, end)) return;
    const node: GraphNode = { id: nodes.length, x, y, edges: [] };
    nodes.push(node);
    nodeMap.set(pointKey(point), node);
  }));

  const addEdge = (a: GraphNode | undefined, b: GraphNode | undefined): void => {
    if (!a || !b || !segmentClear(a, b, obstacles)) return;
    const axis: RouteAxis = a.y === b.y ? "h" : "v";
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (!length) return;
    const corridor = corridorForSegment(a, b, corridors);
    const baseCost = corridor ? length * (corridor.kind === "gutter" ? 0.62 : 0.78) : length + 92;
    a.edges.push({ to: b.id, axis, length, cost: baseCost, corridorId: corridor?.id ?? null });
    b.edges.push({ to: a.id, axis, length, cost: baseCost, corridorId: corridor?.id ?? null });
  };

  yValues.forEach((y) => {
    const row = xValues.map((x) => nodeMap.get(`${x},${y}`)).filter((node): node is GraphNode => Boolean(node));
    for (let index = 1; index < row.length; index += 1) addEdge(row[index - 1], row[index]);
  });
  xValues.forEach((x) => {
    const column = yValues.map((y) => nodeMap.get(`${x},${y}`)).filter((node): node is GraphNode => Boolean(node));
    for (let index = 1; index < column.length; index += 1) addEdge(column[index - 1], column[index]);
  });
  nodes.forEach((node) => node.edges.sort((a, b) => a.to - b.to || a.axis.localeCompare(b.axis)));

  const startNode = nodeMap.get(pointKey(start));
  const endNode = nodeMap.get(pointKey(end));
  if (!startNode || !endNode) return null;
  const directions: readonly SearchDirection[] = ["n", "h", "v"];
  const distances = new Map<string, number>([[`${startNode.id}:n`, 0]]);
  const previous = new Map<string, string>();
  const queue: QueueEntry[] = [{ nodeId: startNode.id, direction: "n", cost: 0, bends: 0 }];
  let finalState: string | null = null;

  while (queue.length) {
    queue.sort((a, b) =>
      a.cost - b.cost ||
      a.bends - b.bends ||
      a.nodeId - b.nodeId ||
      directions.indexOf(a.direction) - directions.indexOf(b.direction));
    const current = queue.shift();
    if (!current) break;
    const currentKey = `${current.nodeId}:${current.direction}`;
    if (current.cost !== distances.get(currentKey)) continue;
    if (current.nodeId === endNode.id) {
      finalState = currentKey;
      break;
    }
    const currentNode = nodes[current.nodeId];
    if (!currentNode) continue;
    currentNode.edges.forEach((edge) => {
      const bend = current.direction !== "n" && current.direction !== edge.axis ? 40 : 0;
      const nextCost = current.cost + edge.cost + bend;
      const nextKey = `${edge.to}:${edge.axis}`;
      const existing = distances.get(nextKey);
      if (existing == null || nextCost < existing - 0.001) {
        distances.set(nextKey, nextCost);
        previous.set(nextKey, currentKey);
        queue.push({
          nodeId: edge.to,
          direction: edge.axis,
          cost: nextCost,
          bends: current.bends + (bend ? 1 : 0),
        });
      }
    });
  }

  if (!finalState) return null;
  const reversed: Point[] = [];
  let cursor: string | undefined = finalState;
  while (cursor) {
    const nodeId = Number(cursor.split(":")[0]);
    const node = nodes[nodeId];
    if (!node) return null;
    reversed.push({ x: node.x, y: node.y });
    cursor = previous.get(cursor);
  }
  return reversed.reverse();
}

function segmentClear(a: Point, b: Point, obstacles: readonly Rect[]): boolean {
  return !obstacles.some((rect) => {
    if (a.y === b.y) {
      if (!(a.y > rect.y && a.y < rect.y + rect.height)) return false;
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      return hi > rect.x && lo < rect.x + rect.width;
    }
    if (!(a.x > rect.x && a.x < rect.x + rect.width)) return false;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return hi > rect.y && lo < rect.y + rect.height;
  });
}

function corridorForSegment(a: Point, b: Point, corridors: readonly Corridor[]): Corridor | undefined {
  if (a.y === b.y) {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return corridors.find((corridor) => corridor.axis === "h" && corridor.fixed === a.y && lo >= corridor.lo && hi <= corridor.hi);
  }
  const lo = Math.min(a.y, b.y);
  const hi = Math.max(a.y, b.y);
  return corridors.find((corridor) => corridor.axis === "v" && corridor.fixed === a.x && lo >= corridor.lo && hi <= corridor.hi);
}

function fallbackElbow(start: Point, end: Point, obstacles: readonly Rect[]): Point[] {
  if (samePoint(start, end)) {
    return [
      start,
      { x: start.x + 32, y: start.y },
      { x: start.x + 32, y: start.y - 32 },
      { x: start.x, y: start.y - 32 },
      end,
    ];
  }
  const midX = snapNearest((start.x + end.x) / 2, 8);
  const midY = snapNearest((start.y + end.y) / 2, 8);
  const candidates: Point[][] = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end],
    [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end],
  ].map(simplifyOrthogonalPoints);
  const score = (points: readonly Point[]): number => {
    let length = 0;
    let crossings = 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) continue;
      length += Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
      obstacles.forEach((rect) => {
        if (!segmentClear(previous, current, [rect])) crossings += 1;
      });
    }
    return length + Math.max(0, points.length - 2) * 40 + crossings * 10_000;
  };
  const ranked = candidates
    .map((points, index) => ({ points, index, score: score(points) }))
    .sort((a, b) => a.score - b.score || a.index - b.index);
  return ranked[0]?.points ?? [start, end];
}

function applyCorridorLanes(
  points: readonly Point[],
  corridors: readonly Corridor[],
  laneUse: Map<string, number>,
  gutterWidth: number,
): Point[] {
  if (points.length < 2) return [...points];
  const routeLane = new Map<string, number>();
  const laneSequence = (width: number): number[] => {
    const maxLane = Math.max(0, width / 2 - 6);
    const sequence = [0];
    for (let offset = 12; offset <= maxLane; offset += 12) sequence.push(offset, -offset);
    return sequence;
  };

  const segments: ShiftedSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (!a || !b) continue;
    const corridor = corridorForSegment(a, b, corridors);
    let offset = 0;
    if (corridor?.kind === "gutter") {
      if (!routeLane.has(corridor.id)) {
        // Lanes never exceed what the narrowest of the requested gutter width
        // and this corridor's own physical width can hold.
        const sequence = laneSequence(Math.min(gutterWidth, corridor.width));
        const use = laneUse.get(corridor.id) ?? 0;
        routeLane.set(corridor.id, sequence[use % sequence.length] ?? 0);
        laneUse.set(corridor.id, use + 1);
      }
      offset = routeLane.get(corridor.id) ?? 0;
    }
    const axis: RouteAxis = a.y === b.y ? "h" : "v";
    const shiftedA = axis === "h" ? { x: a.x, y: a.y + offset } : { x: a.x + offset, y: a.y };
    const shiftedB = axis === "h" ? { x: b.x, y: b.y + offset } : { x: b.x + offset, y: b.y };
    segments.push({ axis, a: shiftedA, b: shiftedB });
  }

  const firstPoint = points[0];
  if (!firstPoint) return [];
  const output: Point[] = [firstPoint];
  const append = (point: Point): void => {
    if (!samePoint(output[output.length - 1], point)) output.push(point);
  };
  segments.forEach((segment, index) => {
    if (index === 0) append(segment.a);
    else {
      const previous = segments[index - 1];
      const currentPoint = output[output.length - 1];
      if (previous && currentPoint && !samePoint(currentPoint, segment.a)) {
        if (previous.axis !== segment.axis) {
          append(previous.axis === "h"
            ? { x: segment.a.x, y: currentPoint.y }
            : { x: currentPoint.x, y: segment.a.y });
        }
        append(segment.a);
      }
    }
    append(segment.b);
  });
  const lastPoint = points[points.length - 1];
  if (lastPoint) append(lastPoint);
  return simplifyOrthogonalPoints(output);
}

export function simplifyOrthogonalPoints(points: readonly Point[]): Point[] {
  const clean: Point[] = [];
  points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .forEach((point) => {
      if (!samePoint(clean[clean.length - 1], point)) clean.push({ x: point.x, y: point.y });
    });
  let changed = true;
  while (changed && clean.length > 2) {
    changed = false;
    for (let index = 1; index < clean.length - 1; index += 1) {
      const previous = clean[index - 1];
      const current = clean[index];
      const next = clean[index + 1];
      if (!previous || !current || !next) continue;
      if ((previous.x === current.x && current.x === next.x) || (previous.y === current.y && current.y === next.y)) {
        clean.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return clean;
}

export function polylineMidpoint(points: readonly Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  let total = 0;
  const lengths: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = a && b ? Math.abs(b.x - a.x) + Math.abs(b.y - a.y) : 0;
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] ?? 0;
    if (remaining <= length) {
      const a = points[index];
      const b = points[index + 1];
      if (!a || !b) break;
      const ratio = length ? remaining / length : 0;
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

/** Produce an SVG path with small rounded corners from an orthogonal polyline. */
export function roundedPath(points: readonly Point[], radius = 6): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || !next) continue;
    const incoming = Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
    const outgoing = Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
    const cornerRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + Math.sign(previous.x - current.x) * cornerRadius,
      y: current.y + Math.sign(previous.y - current.y) * cornerRadius,
    };
    const after = {
      x: current.x + Math.sign(next.x - current.x) * cornerRadius,
      y: current.y + Math.sign(next.y - current.y) * cornerRadius,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const end = points[points.length - 1];
  return end ? `${path} L ${end.x} ${end.y}` : path;
}

export const roundedOrthogonalPath = roundedPath;

