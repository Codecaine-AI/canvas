import { mulberry32, shuffle, type RandomSource } from "./rng";
import type { Point, Region } from "./types";

export type InhabitedRole = "flow" | "cluster" | "single" | "thin" | "polygon";

export type ContentAppearance =
  | "section"
  | "chip"
  | "sticky"
  | "process"
  | "decision"
  | "note"
  | "pill"
  | "satellite";

export type ContentBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FakeTextLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type InhabitedShape = ContentBox & {
  id: string;
  kind: "shape";
  regionIndex: number;
  appearance: ContentAppearance;
  lines: FakeTextLine[];
};

export type InhabitedConnector = {
  id: string;
  kind: "connector";
  fromRegion: number;
  toRegion: number;
  points: Point[];
  crossCell: boolean;
};

export type InhabitedCell = {
  regionIndex: number;
  role: InhabitedRole;
  contentBounds: ContentBox;
  shapes: InhabitedShape[];
};

export type InhabitedScene = {
  cells: InhabitedCell[];
  connectors: InhabitedConnector[];
};

export type InhabitOptions = {
  /** Visual gutter width. Cross-cell connectors use its center as a quiet lane. */
  gutter?: number;
  /** Minimum breathing room between content and a cell boundary. */
  inset?: number;
  /** Upper bound for cross-cell connectors. Local flow connectors are unaffected. */
  maxCrossConnectors?: number;
};

type RankedRegion = {
  index: number;
  region: Region;
  area: number;
  bounds: ContentBox;
  aspect: number;
};

type Adjacency = {
  first: number;
  second: number;
  axis: "x" | "y" | "free";
  start: Point;
  end: Point;
};

const EPSILON = 1e-7;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function boxArea(box: ContentBox): number {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

function regionBounds(region: Region): ContentBox {
  if (region.kind === "rect") {
    return { x: region.x, y: region.y, w: region.w, h: region.h };
  }

  const xs = region.points.map((point) => point.x);
  const ys = region.points.map((point) => point.y);
  if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const minimumX = Math.min(...xs);
  const minimumY = Math.min(...ys);
  return {
    x: minimumX,
    y: minimumY,
    w: Math.max(...xs) - minimumX,
    h: Math.max(...ys) - minimumY,
  };
}

function polygonArea(points: readonly Point[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function regionArea(region: Region): number {
  return region.kind === "rect" ? region.w * region.h : polygonArea(region.points);
}

function pointOnSegment(point: Point, start: Point, end: Point, tolerance = EPSILON): boolean {
  const cross = (point.x - start.x) * (end.y - start.y)
    - (point.y - start.y) * (end.x - start.x);
  if (Math.abs(cross) > tolerance) return false;
  return point.x >= Math.min(start.x, end.x) - tolerance
    && point.x <= Math.max(start.x, end.x) + tolerance
    && point.y >= Math.min(start.y, end.y) - tolerance
    && point.y <= Math.max(start.y, end.y) + tolerance;
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const crossesRay = (current.y > point.y) !== (previous.y > point.y)
      && point.x < (previous.x - current.x) * (point.y - current.y)
        / (previous.y - current.y) + current.x;
    if (crossesRay) inside = !inside;
  }
  return inside;
}

function orientation(first: Point, second: Point, third: Point): number {
  return (second.x - first.x) * (third.y - first.y)
    - (second.y - first.y) * (third.x - first.x);
}

function segmentsProperlyIntersect(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
): boolean {
  const firstSide = orientation(firstStart, firstEnd, secondStart);
  const secondSide = orientation(firstStart, firstEnd, secondEnd);
  const thirdSide = orientation(secondStart, secondEnd, firstStart);
  const fourthSide = orientation(secondStart, secondEnd, firstEnd);
  return firstSide * secondSide < -EPSILON && thirdSide * fourthSide < -EPSILON;
}

function boxInsidePolygon(box: ContentBox, polygon: readonly Point[]): boolean {
  if (box.w <= 0 || box.h <= 0) return false;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  if (!corners.every((corner) => pointInPolygon(corner, polygon))) return false;

  for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
    const polygonStart = polygon[polygonIndex];
    const polygonEnd = polygon[(polygonIndex + 1) % polygon.length];
    for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex += 1) {
      if (segmentsProperlyIntersect(
        polygonStart,
        polygonEnd,
        corners[cornerIndex],
        corners[(cornerIndex + 1) % corners.length],
      )) return false;
    }
  }
  return true;
}

function polygonCentroid(points: readonly Point[]): Point {
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    weightedX += (current.x + next.x) * cross;
    weightedY += (current.y + next.y) * cross;
  }
  if (Math.abs(twiceArea) > EPSILON) {
    return { x: weightedX / (3 * twiceArea), y: weightedY / (3 * twiceArea) };
  }
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
}

function candidateInteriorPoints(points: readonly Point[], bounds: ContentBox): Point[] {
  const preferred = [polygonCentroid(points), {
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  }, {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  }].filter((point) => pointInPolygon(point, points));
  if (preferred.length > 0) return preferred;

  const candidates: Point[] = [];
  for (let row = 1; row <= 5; row += 1) {
    for (let column = 1; column <= 5; column += 1) {
      candidates.push({
        x: bounds.x + bounds.w * column / 6,
        y: bounds.y + bounds.h * row / 6,
      });
    }
  }
  return candidates.filter((point) => pointInPolygon(point, points));
}

function fitBoxAtPoint(
  center: Point,
  polygon: readonly Point[],
  bounds: ContentBox,
  aspect: number,
  margin: number,
): ContentBox | null {
  const maximumWidth = Math.min(bounds.w, bounds.h * aspect);
  const maximumHeight = maximumWidth / aspect;
  let low = 0;
  let high = 1;
  let best: ContentBox | null = null;

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const scale = (low + high) / 2;
    const w = maximumWidth * scale;
    const h = maximumHeight * scale;
    const expanded = {
      x: center.x - w / 2 - margin,
      y: center.y - h / 2 - margin,
      w: w + margin * 2,
      h: h + margin * 2,
    };
    if (boxInsidePolygon(expanded, polygon)) {
      best = { x: center.x - w / 2, y: center.y - h / 2, w, h };
      low = scale;
    } else {
      high = scale;
    }
  }
  return best;
}

/** A conservative axis-aligned box that remains inside even concave polygon cells. */
function inscribedPolygonBox(region: Region & { kind: "polygon" }, requestedInset: number): ContentBox {
  const bounds = regionBounds(region);
  const margin = Math.min(requestedInset, bounds.w * 0.08, bounds.h * 0.08);
  const naturalAspect = clamp(bounds.w / Math.max(EPSILON, bounds.h), 0.55, 1.8);
  const aspects = Math.abs(naturalAspect - 1) < 0.08 ? [1] : [naturalAspect, 1];
  let best: ContentBox | null = null;

  for (const center of candidateInteriorPoints(region.points, bounds).slice(0, 4)) {
    for (const aspect of aspects) {
      const candidate = fitBoxAtPoint(center, region.points, bounds, aspect, margin);
      if (candidate && (!best || boxArea(candidate) > boxArea(best))) best = candidate;
    }
  }

  if (best) return best;
  const center = candidateInteriorPoints(region.points, bounds)[0] ?? {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
  return { x: center.x, y: center.y, w: 0, h: 0 };
}

function contentBounds(region: Region, requestedInset: number, gutter: number): ContentBox {
  if (region.kind === "polygon") return inscribedPolygonBox(region, requestedInset + gutter / 2);
  const inset = Math.min(
    requestedInset + gutter / 2,
    Math.max(0, region.w / 2 - EPSILON),
    Math.max(0, region.h / 2 - EPSILON),
  );
  return {
    x: region.x + inset,
    y: region.y + inset,
    w: Math.max(0, region.w - inset * 2),
    h: Math.max(0, region.h - inset * 2),
  };
}

function fakeLines(box: ContentBox): FakeTextLine[] {
  if (box.w < 15 || box.h < 12) return [];
  const paddingX = Math.min(10, box.w * 0.16);
  const usableWidth = Math.max(0, box.w - paddingX * 2);
  const lineGap = Math.min(6, box.h * 0.16);
  const centerY = box.y + box.h / 2;
  const widths = [0.78, 0.52, 0.65];
  return widths.map((width, index) => {
    const y = centerY + (index - 1) * lineGap;
    return {
      x1: box.x + paddingX,
      y1: y,
      x2: box.x + paddingX + usableWidth * width,
      y2: y,
    };
  });
}

function shape(
  regionIndex: number,
  id: string,
  appearance: ContentAppearance,
  box: ContentBox,
): InhabitedShape {
  const showsText = appearance === "sticky"
    || appearance === "process"
    || appearance === "note"
    || appearance === "satellite";
  return {
    id,
    kind: "shape",
    regionIndex,
    appearance,
    ...box,
    lines: showsText ? fakeLines(box) : [],
  };
}

function innerBox(box: ContentBox, amount: number): ContentBox {
  const inset = Math.min(amount, box.w * 0.2, box.h * 0.2);
  return {
    x: box.x + inset,
    y: box.y + inset,
    w: Math.max(0, box.w - inset * 2),
    h: Math.max(0, box.h - inset * 2),
  };
}

function chipBox(box: ContentBox): ContentBox {
  const height = Math.min(18, Math.max(5, box.h * 0.09));
  return {
    x: box.x + Math.min(10, box.w * 0.06),
    y: box.y + Math.min(10, box.h * 0.06),
    w: Math.min(68, Math.max(12, box.w * 0.26)),
    h: height,
  };
}

function nodeEdgePoint(node: InhabitedShape, toward: Point): Point {
  const center = { x: node.x + node.w / 2, y: node.y + node.h / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) * node.h >= Math.abs(dy) * node.w) {
    return { x: dx >= 0 ? node.x + node.w : node.x, y: center.y };
  }
  return { x: center.x, y: dy >= 0 ? node.y + node.h : node.y };
}

function orthogonalPoints(start: Point, end: Point, horizontalFirst: boolean): Point[] {
  if (horizontalFirst) {
    const middleX = (start.x + end.x) / 2;
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
  }
  const middleY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
}

function flowCell(
  regionIndex: number,
  bounds: ContentBox,
  random: RandomSource,
  totalArea: number,
): { shapes: InhabitedShape[]; connectors: InhabitedConnector[] } {
  const shapes: InhabitedShape[] = [shape(regionIndex, `cell-${regionIndex}-section`, "section", bounds)];
  const connectors: InhabitedConnector[] = [];
  if (bounds.w < 18 || bounds.h < 18) return { shapes, connectors };

  const chip = chipBox(bounds);
  shapes.push(shape(regionIndex, `cell-${regionIndex}-chip`, "chip", chip));
  const padding = Math.min(13, bounds.w * 0.06, bounds.h * 0.06);
  const body = {
    x: bounds.x + padding,
    y: chip.y + chip.h + padding,
    w: Math.max(0, bounds.w - padding * 2),
    h: Math.max(0, bounds.y + bounds.h - (chip.y + chip.h + padding * 2)),
  };
  if (body.w < 8 || body.h < 8) return { shapes, connectors };

  const alongX = body.w >= body.h;
  const longSide = alongX ? body.w : body.h;
  const shortSide = alongX ? body.h : body.w;
  const requestedCount = 3 + Math.floor(random() * 3);
  const gap = Math.min(18, longSide * 0.055);
  const minimumNodeLong = Math.min(48, Math.max(14, shortSide * 0.25));
  const maximumCount = Math.max(1, Math.floor((longSide + gap) / (minimumNodeLong + gap)));
  const count = Math.min(requestedCount, maximumCount);
  const slot = Math.max(1, (longSide - gap * Math.max(0, count - 1)) / count);
  const nodeLong = Math.min(slot, Math.max(18, slot * 0.82));
  const nodeShort = Math.min(shortSide * 0.7, Math.max(12, shortSide - 4));
  const decisionIndex = count > 1 ? Math.floor(random() * count) : -1;
  const nodes: InhabitedShape[] = [];

  for (let index = 0; index < count; index += 1) {
    const longPosition = (alongX ? body.x : body.y) + index * (slot + gap)
      + (slot - nodeLong) / 2;
    const shortPosition = (alongX ? body.y : body.x) + (shortSide - nodeShort) / 2;
    const nodeBox = alongX
      ? { x: longPosition, y: shortPosition, w: nodeLong, h: nodeShort }
      : { x: shortPosition, y: longPosition, w: nodeShort, h: nodeLong };
    const node = shape(
      regionIndex,
      `cell-${regionIndex}-flow-${index}`,
      index === decisionIndex ? "decision" : "process",
      nodeBox,
    );
    nodes.push(node);
    shapes.push(node);
  }

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    const previousCenter = { x: previous.x + previous.w / 2, y: previous.y + previous.h / 2 };
    const currentCenter = { x: current.x + current.w / 2, y: current.y + current.h / 2 };
    const start = nodeEdgePoint(previous, currentCenter);
    const end = nodeEdgePoint(current, previousCenter);
    connectors.push({
      id: `cell-${regionIndex}-flow-connector-${index - 1}`,
      kind: "connector",
      fromRegion: regionIndex,
      toRegion: regionIndex,
      points: orthogonalPoints(start, end, alongX),
      crossCell: false,
    });
  }

  if (boxArea(bounds) > Math.max(70_000, totalArea * 0.22) && bounds.w > 170 && bounds.h > 115) {
    const satellite = {
      x: bounds.x + bounds.w - Math.min(76, bounds.w * 0.24) - padding,
      y: bounds.y + padding,
      w: Math.min(76, bounds.w * 0.24),
      h: Math.min(43, bounds.h * 0.18),
    };
    shapes.push(shape(regionIndex, `cell-${regionIndex}-satellite`, "satellite", satellite));
  }

  return { shapes, connectors };
}

function gridBoxes(box: ContentBox, count: number): ContentBox[] {
  const columns = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count * box.w / Math.max(1, box.h)))));
  const rows = Math.ceil(count / columns);
  const gap = Math.min(9, box.w / Math.max(6, columns * 6), box.h / Math.max(6, rows * 6));
  const itemWidth = Math.max(0, (box.w - gap * Math.max(0, columns - 1)) / columns);
  const itemHeight = Math.max(0, (box.h - gap * Math.max(0, rows - 1)) / rows);
  return Array.from({ length: count }, (_, index) => ({
    x: box.x + (index % columns) * (itemWidth + gap),
    y: box.y + Math.floor(index / columns) * (itemHeight + gap),
    w: itemWidth,
    h: itemHeight,
  }));
}

function listBoxes(box: ContentBox, count: number): ContentBox[] {
  const gap = Math.min(8, box.h / Math.max(8, count * 5));
  const itemHeight = Math.max(0, (box.h - gap * Math.max(0, count - 1)) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: box.x,
    y: box.y + index * (itemHeight + gap),
    w: box.w,
    h: itemHeight,
  }));
}

function clusterCell(regionIndex: number, bounds: ContentBox, random: RandomSource): InhabitedShape[] {
  const shapes = [shape(regionIndex, `cell-${regionIndex}-section`, "section", bounds)];
  if (bounds.w < 16 || bounds.h < 16) return shapes;
  const chip = chipBox(bounds);
  shapes.push(shape(regionIndex, `cell-${regionIndex}-chip`, "chip", chip));
  const padding = Math.min(11, bounds.w * 0.06, bounds.h * 0.06);
  const body = {
    x: bounds.x + padding,
    y: chip.y + chip.h + padding,
    w: Math.max(0, bounds.w - padding * 2),
    h: Math.max(0, bounds.y + bounds.h - chip.y - chip.h - padding * 2),
  };
  if (body.w < 6 || body.h < 6) return shapes;

  const isGrid = random() < 0.55;
  const requestedCount = isGrid ? 2 + Math.floor(random() * 5) : 3 + Math.floor(random() * 2);
  const capacity = Math.max(1, Math.floor(boxArea(body) / 850));
  const count = Math.min(requestedCount, capacity);
  const boxes = isGrid ? gridBoxes(body, count) : listBoxes(body, count);
  boxes.forEach((box, index) => shapes.push(shape(
    regionIndex,
    `cell-${regionIndex}-cluster-${index}`,
    isGrid ? "sticky" : "process",
    box,
  )));
  return shapes;
}

function singleCell(regionIndex: number, bounds: ContentBox, random: RandomSource): InhabitedShape[] {
  if (bounds.w <= EPSILON || bounds.h <= EPSILON) return [];
  const width = Math.min(bounds.w, Math.max(4, bounds.w * 0.68));
  const height = Math.min(bounds.h, Math.max(4, bounds.h * 0.58));
  const box = {
    x: bounds.x + (bounds.w - width) / 2,
    y: bounds.y + (bounds.h - height) / 2,
    w: width,
    h: height,
  };
  return [shape(
    regionIndex,
    `cell-${regionIndex}-single`,
    random() < 0.58 ? "sticky" : "note",
    box,
  )];
}

function thinCell(regionIndex: number, bounds: ContentBox, random: RandomSource): InhabitedShape[] {
  if (bounds.w <= EPSILON || bounds.h <= EPSILON) return [];
  const alongX = bounds.w >= bounds.h;
  const count = 2 + Math.floor(random() * 2);
  const padding = Math.min(8, bounds.w * 0.08, bounds.h * 0.08);
  const body = innerBox(bounds, padding);
  const gap = Math.min(8, (alongX ? body.w : body.h) * 0.05);
  const longSide = alongX ? body.w : body.h;
  const shortSide = alongX ? body.h : body.w;
  const itemLong = Math.max(0, (longSide - gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, index) => {
    const box = alongX
      ? { x: body.x + index * (itemLong + gap), y: body.y, w: itemLong, h: shortSide }
      : { x: body.x, y: body.y + index * (itemLong + gap), w: shortSide, h: itemLong };
    return shape(regionIndex, `cell-${regionIndex}-pill-${index}`, "pill", box);
  });
}

function polygonCell(regionIndex: number, bounds: ContentBox, random: RandomSource): InhabitedShape[] {
  if (bounds.w <= EPSILON || bounds.h <= EPSILON) return [];
  const requestedCount = 1 + Math.floor(random() * 3);
  const capacity = Math.max(1, Math.floor(boxArea(bounds) / 900));
  const count = Math.min(requestedCount, capacity);
  const body = innerBox(bounds, Math.min(5, bounds.w * 0.08, bounds.h * 0.08));
  return gridBoxes(body, count).map((box, index) => shape(
    regionIndex,
    `cell-${regionIndex}-polygon-${index}`,
    "sticky",
    box,
  ));
}

function rectAdjacencies(regions: readonly Region[]): Adjacency[] {
  const result: Adjacency[] = [];
  for (let first = 0; first < regions.length; first += 1) {
    const left = regions[first];
    if (left.kind !== "rect") continue;
    for (let second = first + 1; second < regions.length; second += 1) {
      const right = regions[second];
      if (right.kind !== "rect") continue;
      const sharedX = Math.abs(left.x + left.w - right.x) <= EPSILON
        ? left.x + left.w
        : Math.abs(right.x + right.w - left.x) <= EPSILON
          ? right.x + right.w
          : null;
      const overlapYStart = Math.max(left.y, right.y);
      const overlapYEnd = Math.min(left.y + left.h, right.y + right.h);
      if (sharedX !== null && overlapYEnd - overlapYStart > EPSILON) {
        result.push({
          first,
          second,
          axis: "x",
          start: { x: sharedX, y: overlapYStart },
          end: { x: sharedX, y: overlapYEnd },
        });
        continue;
      }
      const sharedY = Math.abs(left.y + left.h - right.y) <= EPSILON
        ? left.y + left.h
        : Math.abs(right.y + right.h - left.y) <= EPSILON
          ? right.y + right.h
          : null;
      const overlapXStart = Math.max(left.x, right.x);
      const overlapXEnd = Math.min(left.x + left.w, right.x + right.w);
      if (sharedY !== null && overlapXEnd - overlapXStart > EPSILON) {
        result.push({
          first,
          second,
          axis: "y",
          start: { x: overlapXStart, y: sharedY },
          end: { x: overlapXEnd, y: sharedY },
        });
      }
    }
  }
  return result;
}

function pointKey(point: Point): string {
  return `${Math.round(point.x * 1e5)},${Math.round(point.y * 1e5)}`;
}

function polygonAdjacencies(regions: readonly Region[]): Adjacency[] {
  const edges = new Map<string, Array<{ regionIndex: number; start: Point; end: Point }>>();
  regions.forEach((region, regionIndex) => {
    if (region.kind !== "polygon") return;
    region.points.forEach((start, pointIndex) => {
      const end = region.points[(pointIndex + 1) % region.points.length];
      if (Math.hypot(end.x - start.x, end.y - start.y) <= EPSILON) return;
      const firstKey = pointKey(start);
      const secondKey = pointKey(end);
      const key = firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
      const owners = edges.get(key) ?? [];
      owners.push({ regionIndex, start, end });
      edges.set(key, owners);
    });
  });

  const byPair = new Map<string, Adjacency>();
  for (const owners of edges.values()) {
    for (let firstOwner = 0; firstOwner < owners.length; firstOwner += 1) {
      for (let secondOwner = firstOwner + 1; secondOwner < owners.length; secondOwner += 1) {
        const first = Math.min(owners[firstOwner].regionIndex, owners[secondOwner].regionIndex);
        const second = Math.max(owners[firstOwner].regionIndex, owners[secondOwner].regionIndex);
        if (first === second) continue;
        const candidate: Adjacency = {
          first,
          second,
          axis: "free",
          start: owners[firstOwner].start,
          end: owners[firstOwner].end,
        };
        const key = `${first}:${second}`;
        const previous = byPair.get(key);
        if (!previous || Math.hypot(candidate.end.x - candidate.start.x, candidate.end.y - candidate.start.y)
          > Math.hypot(previous.end.x - previous.start.x, previous.end.y - previous.start.y)) {
          byPair.set(key, candidate);
        }
      }
    }
  }
  return [...byPair.values()];
}

function nearestShape(cell: InhabitedCell, point: Point): InhabitedShape | null {
  const foreground = cell.shapes.filter((candidate) => (
    candidate.appearance !== "section" && candidate.appearance !== "chip"
  ));
  const candidates = foreground.length > 0 ? foreground : cell.shapes;
  return candidates.reduce<InhabitedShape | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    const candidateDistance = Math.hypot(
      candidate.x + candidate.w / 2 - point.x,
      candidate.y + candidate.h / 2 - point.y,
    );
    const nearestDistance = Math.hypot(
      nearest.x + nearest.w / 2 - point.x,
      nearest.y + nearest.h / 2 - point.y,
    );
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, null);
}

function crossConnector(
  adjacency: Adjacency,
  cells: readonly InhabitedCell[],
  gutter: number,
  connectorIndex: number,
): InhabitedConnector | null {
  const boundaryMidpoint = {
    x: (adjacency.start.x + adjacency.end.x) / 2,
    y: (adjacency.start.y + adjacency.end.y) / 2,
  };
  const firstNode = nearestShape(cells[adjacency.first], boundaryMidpoint);
  const secondNode = nearestShape(cells[adjacency.second], boundaryMidpoint);
  if (!firstNode || !secondNode) return null;
  const firstCenter = { x: firstNode.x + firstNode.w / 2, y: firstNode.y + firstNode.h / 2 };
  const secondCenter = { x: secondNode.x + secondNode.w / 2, y: secondNode.y + secondNode.h / 2 };
  const start = nodeEdgePoint(firstNode, boundaryMidpoint);
  const end = nodeEdgePoint(secondNode, boundaryMidpoint);
  const halfLane = Math.max(0, gutter) / 4;
  let points: Point[];

  if (adjacency.axis === "x") {
    const direction = firstCenter.x <= secondCenter.x ? 1 : -1;
    points = [
      start,
      { x: boundaryMidpoint.x - halfLane * direction, y: start.y },
      { x: boundaryMidpoint.x, y: start.y },
      { x: boundaryMidpoint.x, y: end.y },
      { x: boundaryMidpoint.x + halfLane * direction, y: end.y },
      end,
    ];
  } else if (adjacency.axis === "y") {
    const direction = firstCenter.y <= secondCenter.y ? 1 : -1;
    points = [
      start,
      { x: start.x, y: boundaryMidpoint.y - halfLane * direction },
      { x: start.x, y: boundaryMidpoint.y },
      { x: end.x, y: boundaryMidpoint.y },
      { x: end.x, y: boundaryMidpoint.y + halfLane * direction },
      end,
    ];
  } else {
    points = [
      start,
      { x: boundaryMidpoint.x, y: start.y },
      boundaryMidpoint,
      { x: end.x, y: boundaryMidpoint.y },
      end,
    ];
  }

  return {
    id: `cross-connector-${connectorIndex}`,
    kind: "connector",
    fromRegion: adjacency.first,
    toRegion: adjacency.second,
    points,
    crossCell: true,
  };
}

function assertContained(scene: InhabitedScene, regions: readonly Region[]): void {
  if (!import.meta.env.DEV) return;
  for (const cell of scene.cells) {
    const region = regions[cell.regionIndex];
    for (const item of cell.shapes) {
      const containedByBox = item.x >= cell.contentBounds.x - EPSILON
        && item.y >= cell.contentBounds.y - EPSILON
        && item.x + item.w <= cell.contentBounds.x + cell.contentBounds.w + EPSILON
        && item.y + item.h <= cell.contentBounds.y + cell.contentBounds.h + EPSILON;
      if (!containedByBox || item.w < 0 || item.h < 0) {
        throw new Error(`inhabit: ${item.id} escapes region ${cell.regionIndex}'s content bounds.`);
      }
      if (region.kind === "polygon" && !boxInsidePolygon(item, region.points)) {
        throw new Error(`inhabit: ${item.id} escapes polygon region ${cell.regionIndex}.`);
      }
      for (const line of item.lines) {
        if (line.x1 < item.x - EPSILON || line.x2 > item.x + item.w + EPSILON
          || line.y1 < item.y - EPSILON || line.y1 > item.y + item.h + EPSILON
          || line.y2 < item.y - EPSILON || line.y2 > item.y + item.h + EPSILON) {
          throw new Error(`inhabit: fake text in ${item.id} escapes its shape.`);
        }
      }
    }
  }
}

/**
 * Deterministically pours quiet FigJam-like mock content into partition cells.
 * It has no global state: equal regions, seed, and options produce equal scenes.
 */
export function inhabit(
  regions: readonly Region[],
  seed: number,
  opts: InhabitOptions = {},
): InhabitedScene {
  const random = mulberry32(seed);
  const gutter = Math.max(0, opts.gutter ?? 0);
  const inset = Math.max(0, opts.inset ?? 10);
  const maxCrossConnectors = Math.max(0, Math.trunc(opts.maxCrossConnectors ?? 4));
  const ranked: RankedRegion[] = regions.map((region, index) => {
    const bounds = regionBounds(region);
    return {
      index,
      region,
      area: regionArea(region),
      bounds,
      aspect: Math.max(bounds.w, bounds.h) / Math.max(EPSILON, Math.min(bounds.w, bounds.h)),
    };
  }).sort((left, right) => right.area - left.area || left.index - right.index);
  const rankByIndex = new Map(ranked.map((item, rank) => [item.index, rank] as const));
  const clusterTiers = Math.min(Math.max(0, regions.length - 1), 2 + Math.floor(random() * 2));
  const totalArea = ranked.reduce((sum, item) => sum + item.area, 0);
  const localConnectors: InhabitedConnector[] = [];

  const cells: InhabitedCell[] = regions.map((region, regionIndex) => {
    const rankedRegion = ranked[rankByIndex.get(regionIndex) ?? 0];
    const bounds = contentBounds(region, inset, gutter);
    const rank = rankByIndex.get(regionIndex) ?? regions.length;
    const role: InhabitedRole = region.kind === "polygon"
      ? "polygon"
      : rank === 0
          ? "flow"
          : rankedRegion.aspect > 3
            ? "thin"
            : rank <= clusterTiers
              ? "cluster"
              : "single";
    let shapes: InhabitedShape[];

    if (role === "flow") {
      const flow = flowCell(regionIndex, bounds, random, totalArea);
      shapes = flow.shapes;
      localConnectors.push(...flow.connectors);
    } else if (role === "cluster") {
      shapes = clusterCell(regionIndex, bounds, random);
    } else if (role === "thin") {
      shapes = thinCell(regionIndex, bounds, random);
    } else if (role === "polygon") {
      shapes = polygonCell(regionIndex, bounds, random);
    } else {
      shapes = singleCell(regionIndex, bounds, random);
    }

    return { regionIndex, role, contentBounds: bounds, shapes };
  });

  const adjacencies = [...rectAdjacencies(regions), ...polygonAdjacencies(regions)];
  const desiredCrossConnectors = Math.min(
    maxCrossConnectors,
    adjacencies.length,
    adjacencies.length > 0 ? 2 + Math.floor(random() * 3) : 0,
  );
  const crossConnectors = shuffle(random, adjacencies)
    .slice(0, desiredCrossConnectors)
    .map((adjacency, index) => crossConnector(adjacency, cells, gutter, index))
    .filter((connector): connector is InhabitedConnector => connector !== null);
  const scene = { cells, connectors: [...crossConnectors, ...localConnectors] };
  assertContained(scene, regions);
  return scene;
}
