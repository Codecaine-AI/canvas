import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import type {
  Compass,
  FanDeclaration,
  FitSketchOptions,
  GridNode,
  LeafNode,
  PlacedItem,
  SectionNode,
  SizeClass,
  Sketch,
  SketchNode,
  TierDeclaration,
} from "./types";

const DEFAULT_CORRIDOR_THRESHOLD = 24;
const CONNECTION_CUT_PENALTY = 48;
const MAX_LEAF_ITEMS = 6;
const LEAF_TERMINATION_COUNT = 3;

/** Register tolerance for grid lattice detection, in px. */
const GRID_REGISTER_TOLERANCE = 8;
/** Cell-size tolerance for grid template members, in px. */
const GRID_SIZE_TOLERANCE = 2;
/** Cross-axis center tolerance for tier registration, in px. */
const TIER_REGISTER_TOLERANCE = 8;
/** Cross-axis center tolerance for fan children sharing a register, in px. */
const FAN_REGISTER_TOLERANCE = 16;

type Axis = "row" | "column";

interface Entity {
  object: InteractiveCanvasObject;
  documentIndex: number;
  descendantIds: ReadonlySet<string>;
}

interface CutCandidate {
  axis: Axis;
  left: Entity[];
  right: Entity[];
  corridorWidth: number;
  crossingConnections: number;
  score: number;
  splitIndex: number;
}

function area(geometry: CanvasGeometry): number {
  return Math.max(0, geometry.width) * Math.max(0, geometry.height);
}

function centerX(geometry: CanvasGeometry): number {
  return geometry.x + geometry.width / 2;
}

function centerY(geometry: CanvasGeometry): number {
  return geometry.y + geometry.height / 2;
}

function containsCenter(container: CanvasGeometry, child: CanvasGeometry): boolean {
  const x = centerX(child);
  const y = centerY(child);
  return x >= container.x
    && x <= container.x + container.width
    && y >= container.y
    && y <= container.y + container.height;
}

function geometryStart(geometry: CanvasGeometry, axis: Axis): number {
  return axis === "row" ? geometry.x : geometry.y;
}

function geometryEnd(geometry: CanvasGeometry, axis: Axis): number {
  return geometryStart(geometry, axis)
    + (axis === "row" ? geometry.width : geometry.height);
}

function geometryCenter(geometry: CanvasGeometry, axis: Axis): number {
  return axis === "row" ? centerX(geometry) : centerY(geometry);
}

function entityOrder(left: Entity, right: Entity, axis: Axis): number {
  const startDifference = geometryStart(left.object.geometry, axis)
    - geometryStart(right.object.geometry, axis);
  if (startDifference !== 0) return startDifference;

  const endDifference = geometryEnd(left.object.geometry, axis)
    - geometryEnd(right.object.geometry, axis);
  if (endDifference !== 0) return endDifference;

  const crossAxis: Axis = axis === "row" ? "column" : "row";
  const crossDifference = geometryStart(left.object.geometry, crossAxis)
    - geometryStart(right.object.geometry, crossAxis);
  if (crossDifference !== 0) return crossDifference;

  const idDifference = left.object.id.localeCompare(right.object.id);
  return idDifference || left.documentIndex - right.documentIndex;
}

function boundsFor(entities: readonly Entity[]): CanvasGeometry {
  if (!entities.length) return { x: 0, y: 0, width: 1, height: 1 };

  const x = Math.min(...entities.map((entity) => entity.object.geometry.x));
  const y = Math.min(...entities.map((entity) => entity.object.geometry.y));
  const right = Math.max(...entities.map((entity) => (
    entity.object.geometry.x + entity.object.geometry.width
  )));
  const bottom = Math.max(...entities.map((entity) => (
    entity.object.geometry.y + entity.object.geometry.height
  )));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function crossingConnectionCount(
  left: readonly Entity[],
  right: readonly Entity[],
  document: InteractiveCanvasDocument,
): number {
  const leftIds = new Set<string>();
  const rightIds = new Set<string>();
  left.forEach((entity) => entity.descendantIds.forEach((id) => leftIds.add(id)));
  right.forEach((entity) => entity.descendantIds.forEach((id) => rightIds.add(id)));

  let count = 0;
  document.connections.forEach((connection) => {
    const from = connection.from.objectId;
    const to = connection.to.objectId;
    if ((leftIds.has(from) && rightIds.has(to))
      || (rightIds.has(from) && leftIds.has(to))) {
      count += 1;
    }
  });
  return count;
}

function cutOrder(left: CutCandidate, right: CutCandidate): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.corridorWidth !== right.corridorWidth) {
    return right.corridorWidth - left.corridorWidth;
  }
  if (left.crossingConnections !== right.crossingConnections) {
    return left.crossingConnections - right.crossingConnections;
  }
  if (left.axis !== right.axis) return left.axis === "row" ? -1 : 1;
  return left.splitIndex - right.splitIndex;
}

function corridorCandidates(
  entities: readonly Entity[],
  document: InteractiveCanvasDocument,
): CutCandidate[] {
  const candidates: CutCandidate[] = [];

  (["row", "column"] as const).forEach((axis) => {
    const sorted = [...entities].sort((left, right) => entityOrder(left, right, axis));
    let prefixEnd = geometryEnd(sorted[0]!.object.geometry, axis);

    for (let index = 0; index < sorted.length - 1; index += 1) {
      prefixEnd = Math.max(prefixEnd, geometryEnd(sorted[index]!.object.geometry, axis));
      const nextStart = geometryStart(sorted[index + 1]!.object.geometry, axis);
      const corridorWidth = nextStart - prefixEnd;
      if (corridorWidth <= 0) continue;

      const left = sorted.slice(0, index + 1);
      const right = sorted.slice(index + 1);
      const crossingConnections = crossingConnectionCount(left, right, document);
      candidates.push({
        axis,
        left,
        right,
        corridorWidth,
        crossingConnections,
        score: corridorWidth - crossingConnections * CONNECTION_CUT_PENALTY,
        splitIndex: index,
      });
    }
  });

  return candidates.sort(cutOrder);
}

function fallbackCut(
  entities: readonly Entity[],
  document: InteractiveCanvasDocument,
): CutCandidate {
  const candidates: CutCandidate[] = [];

  (["row", "column"] as const).forEach((axis) => {
    const sorted = [...entities].sort((left, right) => {
      const centerDifference = geometryCenter(left.object.geometry, axis)
        - geometryCenter(right.object.geometry, axis);
      return centerDifference || entityOrder(left, right, axis);
    });

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const left = sorted.slice(0, index + 1);
      const right = sorted.slice(index + 1);
      const centerGap = geometryCenter(sorted[index + 1]!.object.geometry, axis)
        - geometryCenter(sorted[index]!.object.geometry, axis);
      const crossingConnections = crossingConnectionCount(left, right, document);
      const imbalance = Math.abs(left.length - right.length);
      candidates.push({
        axis,
        left,
        right,
        corridorWidth: Math.max(0, centerGap),
        crossingConnections,
        // A small balancing term keeps coincident/overlapping objects from
        // degenerating into a long chain while graph edges still discourage
        // cuts through tightly related groups.
        score: centerGap
          - crossingConnections * CONNECTION_CUT_PENALTY
          - imbalance * 0.001,
        splitIndex: index,
      });
    }
  });

  candidates.sort(cutOrder);
  return candidates[0]!;
}

function snapWeights(firstExtent: number, secondExtent: number): [number, number] {
  const first = Math.max(Number.EPSILON, firstExtent);
  const second = Math.max(Number.EPSILON, secondExtent);
  const targetRatio = first / second;
  let best: [number, number] = [1, 1];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let left = 1; left <= 6; left += 1) {
    for (let right = 1; right <= 6; right += 1) {
      // Equivalent multiples carry no information, so favor their reduced,
      // simpler spelling. The tiny complexity term also makes near ties land
      // on the useful 1:1, golden-ish, 1:2, and 1:3 families.
      const ratioError = Math.abs(Math.log((left / right) / targetRatio));
      const complexity = (left + right - 2) * 0.01;
      const score = ratioError + complexity;
      if (score < bestScore - 1e-12
        || (Math.abs(score - bestScore) <= 1e-12
          && (left + right < best[0] + best[1]
            || (left + right === best[0] + best[1] && left < best[0])))) {
        best = [left, right];
        bestScore = score;
      }
    }
  }

  return best;
}

function exactIntegerWeights(shares: readonly number[]): number[] | null {
  if (!shares.length || shares.some((share) => !Number.isFinite(share) || share <= 0)) {
    return null;
  }
  let best: number[] | null = null;
  for (let first = 1; first <= 6; first += 1) {
    const scale = first / shares[0]!;
    const candidate = shares.map((share) => Math.round(share * scale));
    const exact = candidate.every((weight, index) => (
      weight >= 1
      && weight <= 6
      && Math.abs(weight - shares[index]! * scale) <= 1e-9
    ));
    if (exact && (!best
      || candidate.reduce((sum, weight) => sum + weight, 0)
        < best.reduce((sum, weight) => sum + weight, 0))) {
      best = candidate;
    }
  }
  return best;
}

function compactSameAxisSplit(
  axis: Axis,
  initialWeights: readonly number[],
  initialChildren: readonly SketchNode[],
  initialHugs?: readonly (Compass | null)[],
): SketchNode {
  let weights = [...initialWeights];
  let children = [...initialChildren];
  const hugged = initialHugs?.some((hug) => hug !== null)
    ? [...initialHugs]
    : null;
  let changed = !hugged;

  while (changed) {
    changed = false;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      if (child.kind !== "split"
        || child.axis !== axis
        || child.hugs !== undefined
        || child.weights.length !== child.children.length) continue;
      const childWeightTotal = child.weights.reduce((sum, weight) => sum + weight, 0);
      if (!(childWeightTotal > 0)) continue;

      const effectiveShares = weights.flatMap((weight, weightIndex) => (
        weightIndex === index
          ? child.weights.map((childWeight) => weight * childWeight / childWeightTotal)
          : [weight]
      ));
      const exactWeights = exactIntegerWeights(effectiveShares);
      if (!exactWeights) continue;

      children = children.flatMap((candidate, childIndex) => (
        childIndex === index ? child.children : [candidate]
      ));
      weights = exactWeights;
      changed = true;
      break;
    }
  }

  return {
    kind: "split",
    axis,
    weights,
    ...(hugged ? { hugs: hugged } : {}),
    children,
  };
}

/** Lane thresholds: how small a split side must be to read as a margin rail. */
const LANE_MAX_MAIN_FRACTION = 0.4;
const LANE_MAX_MAIN_EXTENT = 640;
const LANE_MAX_CROSS_FILL = 0.66;

/**
 * Detect a margin rail: a thin edge-adjacent split side whose content extent
 * is far smaller than the band the split would hand it. Returns the corner
 * the rail's content registers against, or null when the side genuinely
 * fills its band.
 */
function laneHugFor(
  side: readonly Entity[],
  parentBounds: CanvasGeometry,
  axis: Axis,
  isFirst: boolean,
): Compass | null {
  if (!side.length) return null;
  const bounds = boundsFor(side);
  const mainExtent = axis === "row" ? bounds.width : bounds.height;
  const crossExtent = axis === "row" ? bounds.height : bounds.width;
  const parentMain = axis === "row" ? parentBounds.width : parentBounds.height;
  const parentCross = axis === "row" ? parentBounds.height : parentBounds.width;
  if (mainExtent > LANE_MAX_MAIN_EXTENT) return null;
  if (mainExtent / parentMain > LANE_MAX_MAIN_FRACTION) return null;
  if (crossExtent / parentCross >= LANE_MAX_CROSS_FILL) return null;

  const crossStart = axis === "row" ? parentBounds.y : parentBounds.x;
  const crossCenter = (axis === "row"
    ? bounds.y + bounds.height / 2
    : bounds.x + bounds.width / 2);
  const relative = (crossCenter - crossStart) / parentCross;
  const crossToken = relative < 0.42 ? (axis === "row" ? "N" : "W")
    : relative > 0.58 ? (axis === "row" ? "S" : "E")
      : "";
  const mainToken = axis === "row"
    ? (isFirst ? "W" : "E")
    : (isFirst ? "N" : "S");
  const corner = axis === "row"
    ? `${crossToken}${mainToken}`
    : `${mainToken}${crossToken}`;
  return (corner || "C") as Compass;
}

function sizeClasses(entities: readonly Entity[]): Map<string, SizeClass> {
  const result = new Map<string, SizeClass>();
  if (!entities.length) return result;

  const ranked = entities
    .map((entity) => ({ entity, area: area(entity.object.geometry) }))
    .sort((left, right) => (
      left.area - right.area
      || left.entity.object.id.localeCompare(right.entity.object.id)
      || left.entity.documentIndex - right.entity.documentIndex
    ));
  let start = 0;
  while (start < ranked.length) {
    let end = start + 1;
    while (end < ranked.length && ranked[end]!.area === ranked[start]!.area) end += 1;
    // Tied areas receive the class at their shared average rank; consequently
    // a leaf of identically sized objects remains uniformly medium.
    const percentile = ((start + end - 1) / 2 + 0.5) / ranked.length;
    const size: SizeClass = percentile <= 1 / 3 ? "S" : percentile >= 2 / 3 ? "L" : "M";
    for (let index = start; index < end; index += 1) {
      result.set(ranked[index]!.entity.object.id, size);
    }
    start = end;
  }
  return result;
}

/** Cluster scalar values into registers no further apart than `tolerance`. */
function clusterRegisters(values: readonly number[], tolerance: number): number[] {
  const sorted = [...new Set(values)].sort((left, right) => left - right);
  const registers: number[] = [];
  for (const value of sorted) {
    const last = registers[registers.length - 1];
    if (last === undefined || value - last > tolerance) registers.push(value);
  }
  return registers;
}

function registerIndex(value: number, registers: readonly number[], tolerance: number): number {
  for (let index = 0; index < registers.length; index += 1) {
    if (Math.abs(value - registers[index]!) <= tolerance) return index;
  }
  return -1;
}

function uniformPitch(registers: readonly number[], tolerance: number): number | null {
  if (registers.length < 2) return null;
  const pitches = registers.slice(1).map((value, index) => value - registers[index]!);
  const first = pitches[0]!;
  return pitches.every((pitch) => Math.abs(pitch - first) <= tolerance) ? first : null;
}

/**
 * Snap a raw cell gap onto the spacing ladder, or null when it's off-scale.
 * Classes follow the adjacency semantics of the ladder rather than nearest
 * distance: anything under 16 reads flush, under 64 reads packed (still
 * adjacent), under 96 reads spaced, up to 112 reads loose.
 */
function gapClass(rawGap: number): number | null {
  if (rawGap < -GRID_REGISTER_TOLERANCE || rawGap > 112) return null;
  if (rawGap < 16) return 0;
  if (rawGap < 64) return 32;
  if (rawGap < 96) return 64;
  return 96;
}

/**
 * Detect a repeated-cell table: same-size items occupying a complete
 * row/column lattice with uniform pitch — at least four cells for a 2D
 * lattice, three for a single row or column. Emits one `grid` node in place
 * of the compass leaves the lattice would otherwise shatter into.
 */
function detectGrid(entities: readonly Entity[]): GridNode | null {
  if (entities.length < 3) return null;
  if (entities.some((entity) => entity.object.type === "section")) return null;

  const first = entities[0]!.object.geometry;
  const sameSize = entities.every(({ object }) => (
    Math.abs(object.geometry.width - first.width) <= GRID_SIZE_TOLERANCE
    && Math.abs(object.geometry.height - first.height) <= GRID_SIZE_TOLERANCE
  ));
  if (!sameSize) return null;

  const columnRegisters = clusterRegisters(
    entities.map(({ object }) => object.geometry.x),
    GRID_REGISTER_TOLERANCE,
  );
  const rowRegisters = clusterRegisters(
    entities.map(({ object }) => object.geometry.y),
    GRID_REGISTER_TOLERANCE,
  );
  const rows = rowRegisters.length;
  const columns = columnRegisters.length;
  const singleFile = rows === 1 || columns === 1;
  if (singleFile ? entities.length < 3 : entities.length < 4) return null;
  if (rows * columns !== entities.length) return null;

  const columnPitch = uniformPitch(columnRegisters, GRID_REGISTER_TOLERANCE);
  const rowPitch = uniformPitch(rowRegisters, GRID_REGISTER_TOLERANCE);
  if (columns > 1 && columnPitch === null) return null;
  if (rows > 1 && rowPitch === null) return null;

  const occupancy = new Map<number, Entity>();
  for (const entity of entities) {
    const column = registerIndex(
      entity.object.geometry.x, columnRegisters, GRID_REGISTER_TOLERANCE,
    );
    const row = registerIndex(entity.object.geometry.y, rowRegisters, GRID_REGISTER_TOLERANCE);
    if (column < 0 || row < 0) return null;
    const cell = row * columns + column;
    if (occupancy.has(cell)) return null;
    occupancy.set(cell, entity);
  }

  // Both axes must agree on one ladder gap (single-file lattices only have
  // one gap to classify).
  const gaps: number[] = [];
  if (columnPitch !== null) {
    const gap = gapClass(columnPitch - first.width);
    if (gap === null) return null;
    gaps.push(gap);
  }
  if (rowPitch !== null) {
    const gap = gapClass(rowPitch - first.height);
    if (gap === null) return null;
    gaps.push(gap);
  }
  if (gaps.length === 0 || new Set(gaps).size > 1) return null;
  const gap = gaps[0]!;

  const classes = sizeClasses(entities);
  const items = Array.from({ length: rows * columns }, (_, cell) => {
    const entity = occupancy.get(cell)!;
    return {
      id: entity.object.id,
      type: entity.object.type,
      size: classes.get(entity.object.id) ?? "M" as SizeClass,
    };
  });
  return { kind: "grid", rows, columns, gap, items };
}

function compassFor(geometry: CanvasGeometry, bounds: CanvasGeometry): Compass {
  const relativeX = (centerX(geometry) - bounds.x) / bounds.width;
  const relativeY = (centerY(geometry) - bounds.y) / bounds.height;
  const horizontal = relativeX < 1 / 3 ? "W" : relativeX > 2 / 3 ? "E" : "";
  const vertical = relativeY < 1 / 3 ? "N" : relativeY > 2 / 3 ? "S" : "";
  if (!horizontal && !vertical) return "C";
  return `${vertical}${horizontal}` as Compass;
}

function makeLeaf(entities: readonly Entity[], context?: CanvasGeometry): LeafNode {
  // Compasses measure position within the enclosing region, not the leaf's
  // own bounding box: a pair hugging the top of a tall band must read as
  // N/N, not a centered W/E, or the register is lost on expansion.
  const bounds = context ?? boundsFor(entities);
  const classes = sizeClasses(entities);
  const items: PlacedItem[] = [...entities]
    .sort((left, right) => {
      const vertical = centerY(left.object.geometry) - centerY(right.object.geometry);
      if (vertical !== 0) return vertical;
      const horizontal = centerX(left.object.geometry) - centerX(right.object.geometry);
      if (horizontal !== 0) return horizontal;
      const idDifference = left.object.id.localeCompare(right.object.id);
      return idDifference || left.documentIndex - right.documentIndex;
    })
    .map((entity) => ({
      id: entity.object.id,
      type: entity.object.type,
      size: classes.get(entity.object.id) ?? "M",
      at: compassFor(entity.object.geometry, bounds),
    }));
  return { kind: "leaf", items };
}

/** Record which leaf/grid group every placed object landed in. */
function collectGroups(
  node: SketchNode,
  groups: Map<string, number>,
  gridIds: Set<string>,
  counter: { count: number },
): void {
  if (node.kind === "split") {
    node.children.forEach((child) => collectGroups(child, groups, gridIds, counter));
    return;
  }
  if (node.kind === "section") {
    collectGroups(node.child, groups, gridIds, counter);
    return;
  }
  const group = counter.count;
  counter.count += 1;
  for (const item of node.items) {
    groups.set(item.id, group);
    if (node.kind === "grid") gridIds.add(item.id);
  }
}

interface RegisterCluster {
  register: number;
  members: InteractiveCanvasObject[];
}

/** Greedy chain clustering of center values into tight registers. */
function clusterByCenter(
  objects: readonly InteractiveCanvasObject[],
  center: (geometry: CanvasGeometry) => number,
  tolerance: number,
): RegisterCluster[] {
  const sorted = [...objects].sort((left, right) => (
    center(left.geometry) - center(right.geometry)
    || left.id.localeCompare(right.id)
  ));
  const clusters: RegisterCluster[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    const base = center(sorted[start]!.geometry);
    while (end < sorted.length && center(sorted[end]!.geometry) - base <= tolerance) end += 1;
    const members = sorted.slice(start, end);
    clusters.push({
      register: members.reduce((sum, member) => sum + center(member.geometry), 0)
        / members.length,
      members,
    });
    start = end;
  }
  return clusters;
}

/**
 * Detect hub-over-children fans: a node whose outgoing edges target at least
 * two same-register siblings on one side of it, with the hub roughly centered
 * over their midpoint. Grid members stay out — their lattice already pins them.
 */
function detectFans(
  document: InteractiveCanvasDocument,
  groups: ReadonlyMap<string, number>,
  gridIds: ReadonlySet<string>,
): FanDeclaration[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const eligible = (id: string): boolean => {
    const object = byId.get(id);
    return !!object && object.type !== "section" && groups.has(id) && !gridIds.has(id);
  };

  const targetsByHub = new Map<string, InteractiveCanvasObject[]>();
  const seen = new Set<string>();
  for (const connection of document.connections) {
    const from = connection.from.objectId;
    const to = connection.to.objectId;
    if (from === to || !eligible(from) || !eligible(to)) continue;
    const key = `${from} ${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const targets = targetsByHub.get(from) ?? [];
    targets.push(byId.get(to)!);
    targetsByHub.set(from, targets);
  }

  const hubs = [...targetsByHub.keys()].sort((left, right) => left.localeCompare(right));
  const fans: FanDeclaration[] = [];
  const claimedChildren = new Set<string>();

  for (const hub of hubs) {
    const hubGeometry = byId.get(hub)!.geometry;
    const targets = targetsByHub.get(hub)!;
    for (const dir of ["S", "N", "E", "W"] as const) {
      const vertical = dir === "S" || dir === "N";
      const mainCenter = vertical ? centerX : centerY;
      const crossCenter = vertical ? centerY : centerX;
      const beyond = (geometry: CanvasGeometry): boolean => {
        if (dir === "S") return geometry.y >= hubGeometry.y + hubGeometry.height - 8;
        if (dir === "N") return geometry.y + geometry.height <= hubGeometry.y + 8;
        if (dir === "E") return geometry.x >= hubGeometry.x + hubGeometry.width - 8;
        return geometry.x + geometry.width <= hubGeometry.x + 8;
      };
      const sideTargets = targets.filter((target) => (
        beyond(target.geometry) && !claimedChildren.has(target.id)
      ));
      if (sideTargets.length < 2) continue;
      const clusters = clusterByCenter(sideTargets, crossCenter, FAN_REGISTER_TOLERANCE)
        .filter((cluster) => cluster.members.length >= 2)
        .sort((left, right) => right.members.length - left.members.length);
      const cluster = clusters[0];
      if (!cluster) continue;
      const centers = cluster.members.map((member) => mainCenter(member.geometry));
      const low = Math.min(...centers);
      const high = Math.max(...centers);
      const midpoint = (low + high) / 2;
      const slack = Math.max(64, (high - low) * 0.25);
      if (Math.abs(mainCenter(hubGeometry) - midpoint) > slack) continue;
      const children = [...cluster.members]
        .sort((left, right) => (
          mainCenter(left.geometry) - mainCenter(right.geometry)
          || left.id.localeCompare(right.id)
        ))
        .map((member) => member.id);
      children.forEach((child) => claimedChildren.add(child));
      fans.push({ hub, children, dir });
    }
  }
  return fans;
}

/**
 * Detect cross-branch registers: at least three nodes from at least two
 * different leaf groups whose cross-axis centers sit on one register. Grid
 * cells may anchor a tier (their lattice is immovable; other members align
 * to them), but a tier needs at least one movable non-grid member. Complete
 * fan-children sets are excluded (the fan already registers them).
 */
function detectTiers(
  document: InteractiveCanvasDocument,
  groups: ReadonlyMap<string, number>,
  gridIds: ReadonlySet<string>,
  fans: readonly FanDeclaration[],
): TierDeclaration[] {
  const candidates = document.objects.filter((object) => (
    object.type !== "section" && groups.has(object.id)
  ));
  const fanChildSets = fans.map((fan) => new Set(fan.children));
  const tiers: TierDeclaration[] = [];

  for (const axis of ["y", "x"] as const) {
    const crossCenter = axis === "y" ? centerY : centerX;
    const mainCenter = axis === "y" ? centerX : centerY;
    const clusters = clusterByCenter(candidates, crossCenter, TIER_REGISTER_TOLERANCE);
    for (const cluster of clusters) {
      if (cluster.members.length < 3) continue;
      if (cluster.members.every((member) => gridIds.has(member.id))) continue;
      const memberGroups = new Set(cluster.members.map((member) => groups.get(member.id)));
      if (memberGroups.size < 2) continue;
      const ids = new Set(cluster.members.map((member) => member.id));
      const coveredByFan = fanChildSets.some((children) => (
        ids.size <= children.size && [...ids].every((id) => children.has(id))
      ));
      if (coveredByFan) continue;
      const members = [...cluster.members]
        .sort((left, right) => (
          mainCenter(left.geometry) - mainCenter(right.geometry)
          || left.id.localeCompare(right.id)
        ))
        .map((member) => member.id);
      tiers.push({ name: `t${tiers.length + 1}`, axis, members });
    }
  }
  return tiers;
}

/**
 * Fit a canvas document into a deliberately small, coordinate-free spatial
 * sketch. Containment and every tie-break are derived from document data;
 * the fitter has no mutable global state and uses no randomness.
 */
export function fitSketch(
  document: InteractiveCanvasDocument,
  options: FitSketchOptions = {},
): Sketch {
  const rawThreshold = options.corridorThreshold;
  const corridorThreshold = typeof rawThreshold === "number"
    && Number.isFinite(rawThreshold)
    && rawThreshold >= 0
    ? rawThreshold
    : DEFAULT_CORRIDOR_THRESHOLD;
  const objectIndex = new Map(document.objects.map((object, index) => [object.id, index]));
  const sections = document.objects.filter((object) => object.type === "section");
  const directChildren = new Map<string | null, InteractiveCanvasObject[]>();

  document.objects.forEach((object) => {
    const objectArea = area(object.geometry);
    const possibleParents = sections
      .filter((section) => section.id !== object.id)
      .filter((section) => containsCenter(section.geometry, object.geometry))
      // Requiring a section parent to be geometrically larger establishes a
      // strict nesting order for overlapping section centers and prevents
      // ambiguous mutual-containment cycles.
      .filter((section) => object.type !== "section" || area(section.geometry) > objectArea)
      .sort((left, right) => {
        const areaDifference = area(left.geometry) - area(right.geometry);
        if (areaDifference !== 0) return areaDifference;
        const idDifference = left.id.localeCompare(right.id);
        return idDifference
          || (objectIndex.get(left.id) ?? 0) - (objectIndex.get(right.id) ?? 0);
      });
    const parentId = possibleParents[0]?.id ?? null;
    const siblings = directChildren.get(parentId) ?? [];
    siblings.push(object);
    directChildren.set(parentId, siblings);
  });

  const descendantCache = new Map<string, ReadonlySet<string>>();
  const descendantIds = (object: InteractiveCanvasObject): ReadonlySet<string> => {
    const cached = descendantCache.get(object.id);
    if (cached) return cached;
    const ids = new Set<string>([object.id]);
    (directChildren.get(object.id) ?? []).forEach((child) => {
      descendantIds(child).forEach((id) => ids.add(id));
    });
    descendantCache.set(object.id, ids);
    return ids;
  };

  const entitiesFor = (parentId: string | null): Entity[] => (
    (directChildren.get(parentId) ?? []).map((object) => ({
      object,
      documentIndex: objectIndex.get(object.id) ?? 0,
      descendantIds: descendantIds(object),
    }))
  );

  const fitEntities = (entities: readonly Entity[], context?: CanvasGeometry): SketchNode => {
    if (!entities.length) return { kind: "leaf", items: [] };

    if (entities.length === 1 && entities[0]!.object.type === "section") {
      const section = entities[0]!.object;
      const node: SectionNode = {
        kind: "section",
        id: section.id,
        ...(section.text ? { label: section.text } : {}),
        child: fitEntities(entitiesFor(section.id), section.geometry),
      };
      return node;
    }

    const containsSection = entities.some((entity) => entity.object.type === "section");
    const grid = detectGrid(entities);
    if (grid) return grid;
    if (entities.length <= LEAF_TERMINATION_COUNT && !containsSection) {
      return makeLeaf(entities, context);
    }

    const bestCorridor = corridorCandidates(entities, document)[0];
    const cut = bestCorridor && bestCorridor.corridorWidth >= corridorThreshold
      ? bestCorridor
      : (containsSection || entities.length > MAX_LEAF_ITEMS
        ? fallbackCut(entities, document)
        : null);

    if (!cut) return makeLeaf(entities, context);

    const bounds = boundsFor(entities);
    const leftBounds = boundsFor(cut.left);
    const rightBounds = boundsFor(cut.right);
    const leftExtent = cut.axis === "row" ? leftBounds.width : leftBounds.height;
    const rightExtent = cut.axis === "row" ? rightBounds.width : rightBounds.height;
    const hugs: (Compass | null)[] = [
      laneHugFor(cut.left, bounds, cut.axis, true),
      laneHugFor(cut.right, bounds, cut.axis, false),
    ];
    return compactSameAxisSplit(
      cut.axis,
      snapWeights(leftExtent, rightExtent),
      [fitEntities(cut.left, bounds), fitEntities(cut.right, bounds)],
      hugs,
    );
  };

  const root = fitEntities(entitiesFor(null));
  const groups = new Map<string, number>();
  const gridIds = new Set<string>();
  collectGroups(root, groups, gridIds, { count: 0 });
  const fans = detectFans(document, groups, gridIds);
  const tiers = detectTiers(document, groups, gridIds, fans);
  return {
    root,
    tiers,
    fans,
    edges: document.connections.map((connection) => ({
      from: connection.from.objectId,
      to: connection.to.objectId,
    })),
  };
}
