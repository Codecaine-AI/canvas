import { OBJECT_TYPE_DEFAULTS } from "@codecaine-ai/canvas";

import { allocateWeightedUnits } from "./units";
import type {
  Compass,
  ExpandSketchOptions,
  ExpandedGutter,
  ExpandedRegion,
  ExpandedSketch,
  ExpandedSketchObject,
  FanDeclaration,
  GridItem,
  GridNode,
  LeafNode,
  PlacedItem,
  Sketch,
  SketchNode,
  SketchRect,
  SolveMode,
  TierDeclaration,
} from "./types";

const GRID = 16;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
/** Corpus-mined defaults (LAYOUT-RULEBOOK.md): section side/bottom padding. */
const DEFAULT_PADDING = 48;
/** Corpus-mined section header band (label chip + breathing room). */
const SECTION_HEADER = 64;
const LEAF_PADDING = 16;
/** Corpus-mined sibling item gap inside a leaf. */
const ITEM_GAP = 64;

/** Smallest useful empty section: placeholder cell plus standard trim. */
export const MINIMUM_SECTION_DIMENSIONS = {
  width: GRID + DEFAULT_PADDING * 2,
  height: GRID + SECTION_HEADER + DEFAULT_PADDING * 2,
} as const;

/**
 * Corridor widths between sibling regions, by tree depth. Depth 0 separates
 * clusters (corpus floor 128); deeper siblings use the 96/64/32 ladder.
 */
const GUTTER_LADDER = [128, 96, 64, 32] as const;

/** The corpus spacing ladder every sibling gap snaps down to. */
const GAP_LADDER = [128, 96, 64, 32, 0] as const;

/** The corpus spacing ladder, exported for lint (single source of truth). */
export const SPACING_LADDER = GAP_LADDER;
/** The 16px layout grid the expansion allocator works on, exported for lint. */
export const LAYOUT_GRID = GRID;

function snapToGapLadder(value: number): number {
  for (const gap of GAP_LADDER) {
    if (value >= gap) return gap;
  }
  return 0;
}

const SIZE_SCALE = {
  S: 0.72,
  M: 1,
  L: 1.35,
} as const;

/**
 * Corpus-mined base extents that override the canvas drop defaults for the
 * sketch round trip. Corpus stickies run 336-608 wide and 112-688 tall
 * (median ~= 400x320); the 176x128 drop default under-represents them so
 * badly that every vertical relation through a sticky rail collapses.
 */
const SKETCH_TYPE_SIZE_OVERRIDES: Partial<
  Record<PlacedItem["type"], { width: number; height: number }>
> = {
  sticky: { width: 384, height: 288 },
};

const COMPASS_CELL: Readonly<Record<Compass, readonly [number, number]>> = {
  NW: [0, 0],
  N: [1, 0],
  NE: [2, 0],
  W: [0, 1],
  C: [1, 1],
  E: [2, 1],
  SW: [0, 2],
  S: [1, 2],
  SE: [2, 2],
};

interface ExpandContext {
  mode: SolveMode;
  objects: ExpandedSketchObject[];
  gutters: ExpandedGutter[];
  /** Split bands recorded verbatim for the structure overlay (never read back). */
  regions: ExpandedRegion[];
  padding: number;
  rootGutter: number;
  /** Sections currently being expanded, outermost first. */
  sectionStack: string[];
  /** Section id -> ids of every object expanded inside it. */
  sectionDescendants: Map<string, string[]>;
  /** Object id -> leaf/grid group index, for order-preserving tier shifts. */
  groupOf: Map<string, number>;
  groupCounter: number;
  /** Object id -> innermost enclosing section id (null at the root). */
  sectionOf: Map<string, string | null>;
  /** Ids laid by a grid lattice: immovable anchors for tier solving. */
  gridIds: Set<string>;
}

function assignGroup(context: ExpandContext, ids: readonly string[]): void {
  const group = context.groupCounter;
  context.groupCounter += 1;
  for (const id of ids) context.groupOf.set(id, group);
}

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function snapDown(value: number, grid: number): number {
  return Math.floor(value / grid) * grid;
}

function gutterForDepth(depth: number, rootGutter: number): number {
  const ladder = GUTTER_LADDER[Math.min(Math.max(0, depth), GUTTER_LADDER.length - 1)]
    ?? GUTTER_LADDER[GUTTER_LADDER.length - 1]!;
  return Math.min(ladder, rootGutter);
}

function insetRect(rect: SketchRect, horizontal: number, top: number, bottom = top): SketchRect {
  const width = Math.max(1, rect.width - horizontal * 2);
  const height = Math.max(1, rect.height - top - bottom);
  return {
    x: rect.x + Math.min(horizontal, Math.max(0, (rect.width - 1) / 2)),
    y: rect.y + Math.min(top, Math.max(0, rect.height - 1)),
    width,
    height,
  };
}

/**
 * Divide a rect between weighted children, reserving a real corridor between
 * each pair of siblings and recording it so the router can travel through it.
 */
function splitRects(
  rect: SketchRect,
  axis: "row" | "column",
  weights: readonly number[],
  minimumExtents: readonly number[],
  childCount: number,
  gutter: number,
  context: ExpandContext,
  gutterPrefix: string,
): SketchRect[] {
  if (childCount === 0) return [];
  const safeWeights = Array.from({ length: childCount }, (_, index) => {
    const weight = weights[index];
    return Number.isFinite(weight) && (weight ?? 0) > 0 ? weight as number : 1;
  });
  const along = axis === "row" ? rect.width : rect.height;
  // Keep the requested ladder width when it fits; degrade gracefully (still
  // grid-snapped when possible) inside cramped regions.
  let effectiveGutter = Math.min(gutter, Math.max(0, along / Math.max(1, childCount * 3)));
  if (effectiveGutter >= 32) effectiveGutter = snapToGapLadder(effectiveGutter);
  else if (effectiveGutter >= GRID) effectiveGutter = snapDown(effectiveGutter, GRID);
  const minimumUnits = context.mode === "natural"
    ? Array.from({ length: childCount }, (_, index) => (
      Math.max(1, Math.ceil((minimumExtents[index] ?? GRID) / GRID))
    ))
    : new Array<number>(childCount).fill(1);
  const minimumTotal = minimumUnits.reduce((sum, units) => sum + units, 0);
  const distributable = context.mode === "natural"
    ? Math.max(
      minimumTotal * GRID,
      along - effectiveGutter * (childCount - 1),
    )
    : Math.max(childCount, along - effectiveGutter * (childCount - 1));
  const totalUnits = Math.max(minimumTotal, Math.floor(distributable / GRID));
  const units = allocateWeightedUnits(
    totalUnits,
    minimumUnits,
    safeWeights,
  );
  const extentFor = (index: number): number => {
    const unit = units[index] ?? 1;
    return Math.max(GRID, unit * Math.min(GRID, distributable / totalUnits));
  };

  const result: SketchRect[] = [];
  let cursor = axis === "row" ? rect.x : rect.y;
  for (let index = 0; index < childCount; index += 1) {
    const extent = extentFor(index);
    result.push(axis === "row"
      ? { x: cursor, y: rect.y, width: extent, height: rect.height }
      : { x: rect.x, y: cursor, width: rect.width, height: extent });
    cursor += extent;
    if (index < childCount - 1 && effectiveGutter > 0) {
      context.gutters.push(axis === "row"
        ? {
          id: `${gutterPrefix}:g${index}`,
          orientation: "vertical",
          x: cursor,
          y: rect.y,
          width: effectiveGutter,
          height: rect.height,
        }
        : {
          id: `${gutterPrefix}:g${index}`,
          orientation: "horizontal",
          x: rect.x,
          y: cursor,
          width: rect.width,
          height: effectiveGutter,
        });
      cursor += effectiveGutter;
    }
  }
  return result;
}

interface Sized<Item extends GridItem> {
  item: Item;
  width: number;
  height: number;
}

type SizedItem = Sized<PlacedItem>;

/** The natural pixel dimensions guaranteed by an item's type and size class. */
export function minimumDimensionsForItem(
  item: Pick<GridItem, "type" | "size">,
): { width: number; height: number } {
  const defaults = SKETCH_TYPE_SIZE_OVERRIDES[item.type]
    ?? OBJECT_TYPE_DEFAULTS[item.type].geometry;
  const scale = SIZE_SCALE[item.size];
  return {
    width: Math.round(defaults.width * scale),
    height: Math.round(defaults.height * scale),
  };
}

function dimensionsForItem<Item extends GridItem>(item: Item, mode: SolveMode): Sized<Item> {
  if (mode === "natural") return { item, ...minimumDimensionsForItem(item) };
  const defaults = SKETCH_TYPE_SIZE_OVERRIDES[item.type]
    ?? OBJECT_TYPE_DEFAULTS[item.type].geometry;
  const scale = SIZE_SCALE[item.size];
  return {
    item,
    width: defaults.width * scale,
    height: defaults.height * scale,
  };
}

function registerInSections(context: ExpandContext, id: string): void {
  for (const sectionId of context.sectionStack) {
    context.sectionDescendants.get(sectionId)?.push(id);
  }
  context.sectionOf.set(id, context.sectionStack[context.sectionStack.length - 1] ?? null);
}

function pushObject(context: ExpandContext, sized: Sized<GridItem>, centerX: number, centerY: number, scale: number): void {
  const width = Math.max(2, sized.width * scale);
  const height = Math.max(2, sized.height * scale);
  registerInSections(context, sized.item.id);
  context.objects.push({
    id: sized.item.id,
    type: sized.item.type,
    geometry: {
      x: Math.round(centerX - width / 2),
      y: Math.round(centerY - height / 2),
      width: Math.round(width),
      height: Math.round(height),
    },
  });
}

/**
 * How far placement eases from the compact centered layout (0) toward the
 * compass third-center anchors (1). Values were swept against the eight
 * fixture canvases for the best relation/adjacency fidelity without
 * regressing any of them.
 */
const SPREAD_BLEND = {
  spine: 0.5,
  spineCross: 0.25,
  bandVertical: 0.25,
  bandHorizontal: 0.25,
  single: 0.5,
} as const;

/**
 * A single item sits calmly at its natural size, eased from the leaf center
 * toward its compass third-center (a "C" item stays exactly centered).
 */
function placeSingle(sized: SizedItem, area: SketchRect, context: ExpandContext): void {
  const scale = context.mode === "natural"
    ? 1
    : Math.min(1, area.width / sized.width, area.height / sized.height);
  const [cellX, cellY] = COMPASS_CELL[sized.item.at];
  const width = sized.width * scale;
  const height = sized.height * scale;
  const x = layoutLine([width], [cellX], area.x, area.width, 0, SPREAD_BLEND.single)[0]
    ?? area.x + (area.width - width) / 2;
  const y = layoutLine([height], [cellY], area.y, area.height, 0, SPREAD_BLEND.single)[0]
    ?? area.y + (area.height - height) / 2;
  pushObject(context, sized, x + width / 2, y + height / 2, scale);
}

/** Where a compact group sits inside the leftover room, from compass consensus. */
function anchorOffset(mean: number, areaExtent: number, blockExtent: number): number {
  if (mean <= 0.75) return 0;
  if (mean >= 1.25) return Math.max(0, areaExtent - blockExtent);
  return Math.max(0, (areaExtent - blockExtent) / 2);
}

/**
 * Lay a line of blocks along one axis. Every block's ideal position is a
 * blend of the compact centered layout and its compass third-center anchor;
 * a relaxation pass then restores strict order, minimum gaps, and the area
 * bounds. The blocks always share the cross-axis centerline of the caller.
 */
function layoutLine(
  extents: readonly number[],
  cells: readonly number[],
  areaStart: number,
  areaExtent: number,
  gap: number,
  blend: number,
): number[] {
  const count = extents.length;
  if (count === 0) return [];
  const total = extents.reduce((sum, extent) => sum + extent, 0) + gap * (count - 1);
  const positions: number[] = [];
  let compactCursor = areaStart + Math.max(0, (areaExtent - total) / 2);
  for (let index = 0; index < count; index += 1) {
    const extent = extents[index] ?? 0;
    const compact = compactCursor;
    const anchored = areaStart + ((cells[index] ?? 1) + 0.5) / 3 * areaExtent - extent / 2;
    positions.push(compact * (1 - blend) + anchored * blend);
    compactCursor += extent + gap;
  }
  // Forward pass: keep order and minimum gaps, stay inside the area start.
  positions[0] = Math.max(positions[0] ?? areaStart, areaStart);
  for (let index = 1; index < count; index += 1) {
    positions[index] = Math.max(
      positions[index] ?? areaStart,
      (positions[index - 1] ?? areaStart) + (extents[index - 1] ?? 0) + gap,
    );
  }
  // Backward pass: pull everything back inside the far edge.
  const areaEnd = areaStart + areaExtent;
  positions[count - 1] = Math.min(
    positions[count - 1] ?? areaStart,
    areaEnd - (extents[count - 1] ?? 0),
  );
  for (let index = count - 2; index >= 0; index -= 1) {
    positions[index] = Math.min(
      positions[index] ?? areaStart,
      (positions[index + 1] ?? areaStart) - gap - (extents[index] ?? 0),
    );
  }
  positions[0] = Math.max(positions[0] ?? areaStart, areaStart);
  return positions;
}

/**
 * Two or three items form a spine: one shared row or column with the axis
 * chosen from the compass spread, the order along it from the compass
 * positions, and spacing eased toward the compass third-centers so a N-to-S
 * pair still reads as top and bottom.
 */
function placeSpine(sized: readonly SizedItem[], area: SketchRect, context: ExpandContext): void {
  const columns = new Set(sized.map(({ item }) => COMPASS_CELL[item.at][0])).size;
  const rows = new Set(sized.map(({ item }) => COMPASS_CELL[item.at][1])).size;
  const axis: "row" | "column" = columns > rows
    ? "row"
    : rows > columns
      ? "column"
      : area.width >= area.height ? "row" : "column";
  const primary = axis === "row" ? 0 : 1;

  const ordered = sized
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => (
      COMPASS_CELL[left.entry.item.at][primary] - COMPASS_CELL[right.entry.item.at][primary]
      || left.index - right.index
    ))
    .map(({ entry }) => entry);

  const mainExtent = (entry: SizedItem): number => (axis === "row" ? entry.width : entry.height);
  const crossExtent = (entry: SizedItem): number => (axis === "row" ? entry.height : entry.width);
  const mainTotal = ordered.reduce((sum, entry) => sum + mainExtent(entry), 0)
    + ITEM_GAP * (ordered.length - 1);
  const crossMax = Math.max(...ordered.map(crossExtent));
  const areaMain = axis === "row" ? area.width : area.height;
  const areaCross = axis === "row" ? area.height : area.width;
  const scale = context.mode === "natural"
    ? 1
    : Math.min(1, areaMain / mainTotal, areaCross / crossMax);

  const positions = layoutLine(
    ordered.map((entry) => mainExtent(entry) * scale),
    ordered.map(({ item }) => COMPASS_CELL[item.at][primary]),
    axis === "row" ? area.x : area.y,
    areaMain,
    ITEM_GAP * scale,
    SPREAD_BLEND.spine,
  );

  // The spine's cross position honors the compass consensus (a N/N pair sits
  // in the top third of its band), eased the same way the main axis is.
  const cross = 1 - primary;
  const meanCross = ordered.reduce(
    (sum, { item }) => sum + COMPASS_CELL[item.at][cross],
    0,
  ) / ordered.length;
  const areaCrossStart = axis === "row" ? area.y : area.x;
  const anchoredCross = areaCrossStart
    + anchorOffset(meanCross, areaCross, crossMax * scale)
    + crossMax * scale / 2;
  const centeredCross = areaCrossStart + areaCross / 2;
  const crossCenter = centeredCross * (1 - SPREAD_BLEND.spineCross)
    + anchoredCross * SPREAD_BLEND.spineCross;
  ordered.forEach((entry, index) => {
    const mainCenter = (positions[index] ?? 0) + mainExtent(entry) * scale / 2;
    if (axis === "row") pushObject(context, entry, mainCenter, crossCenter, scale);
    else pushObject(context, entry, crossCenter, mainCenter, scale);
  });
}

/**
 * Four or more items in a single compass band pack into a tidy grid (the
 * compiler's column heuristic); the compass consensus decides which side of
 * the leaf the block hugs.
 */
function placePackedGrid(sized: readonly SizedItem[], area: SketchRect, context: ExpandContext): void {
  const count = sized.length;
  const cellWidth = Math.max(...sized.map((entry) => entry.width));
  const cellHeight = Math.max(...sized.map((entry) => entry.height));
  const columns = Math.min(
    count,
    Math.max(1, Math.round(Math.sqrt((count * cellHeight) / cellWidth))),
  );
  const rows = Math.ceil(count / columns);
  const blockWidth = columns * cellWidth + (columns - 1) * ITEM_GAP;
  const blockHeight = rows * cellHeight + (rows - 1) * ITEM_GAP;
  const scale = context.mode === "natural"
    ? 1
    : Math.min(1, area.width / blockWidth, area.height / blockHeight);

  const meanColumn = sized.reduce((sum, { item }) => sum + COMPASS_CELL[item.at][0], 0) / count;
  const meanRow = sized.reduce((sum, { item }) => sum + COMPASS_CELL[item.at][1], 0) / count;
  const blockX = area.x + anchorOffset(meanColumn, area.width, blockWidth * scale);
  const blockY = area.y + anchorOffset(meanRow, area.height, blockHeight * scale);

  sized.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    pushObject(
      context,
      entry,
      blockX + (column + 0.5) * cellWidth * scale + column * ITEM_GAP * scale,
      blockY + (row + 0.5) * cellHeight * scale + row * ITEM_GAP * scale,
      scale,
    );
  });
}

/**
 * Four or more items spanning several compass rows compose as banded rows:
 * every band is one aligned row (items ordered by compass column), bands
 * stack top-to-bottom, and both axes ease toward the compass third-centers
 * so the block leans the way the compass consensus points.
 */
function placeBandedRows(sized: readonly SizedItem[], area: SketchRect, context: ExpandContext): void {
  const bandRows = [...new Set(sized.map(({ item }) => COMPASS_CELL[item.at][1]))]
    .sort((a, b) => a - b);
  const bands = bandRows.map((row) => sized
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => COMPASS_CELL[entry.item.at][1] === row)
    .sort((left, right) => (
      COMPASS_CELL[left.entry.item.at][0] - COMPASS_CELL[right.entry.item.at][0]
      || left.index - right.index
    ))
    .map(({ entry }) => entry));

  const bandWidth = (band: readonly SizedItem[]): number =>
    band.reduce((sum, entry) => sum + entry.width, 0) + ITEM_GAP * (band.length - 1);
  const bandHeight = (band: readonly SizedItem[]): number =>
    Math.max(...band.map((entry) => entry.height));
  const blockWidth = Math.max(...bands.map(bandWidth));
  const blockHeight = bands.reduce((sum, band) => sum + bandHeight(band), 0)
    + ITEM_GAP * (bands.length - 1);
  const scale = context.mode === "natural"
    ? 1
    : Math.min(1, area.width / blockWidth, area.height / blockHeight);

  const bandPositions = layoutLine(
    bands.map((band) => bandHeight(band) * scale),
    bandRows,
    area.y,
    area.height,
    ITEM_GAP * scale,
    SPREAD_BLEND.bandVertical,
  );

  bands.forEach((band, bandIndex) => {
    const height = bandHeight(band) * scale;
    const bandCenter = (bandPositions[bandIndex] ?? area.y) + height / 2;
    const itemPositions = layoutLine(
      band.map((entry) => entry.width * scale),
      band.map(({ item }) => COMPASS_CELL[item.at][0]),
      area.x,
      area.width,
      ITEM_GAP * scale,
      SPREAD_BLEND.bandHorizontal,
    );
    band.forEach((entry, itemIndex) => {
      const itemWidth = entry.width * scale;
      pushObject(context, entry, (itemPositions[itemIndex] ?? area.x) + itemWidth / 2, bandCenter, scale);
    });
  });
}

function placeLeaf(leaf: LeafNode, rect: SketchRect, context: ExpandContext): void {
  if (leaf.items.length === 0) return;
  assignGroup(context, leaf.items.map((item) => item.id));
  const pad = Math.min(LEAF_PADDING, rect.width * 0.06, rect.height * 0.06);
  const area = insetRect(rect, pad, pad);
  const sized = leaf.items.map((item) => dimensionsForItem(item, context.mode));
  const bandCount = new Set(sized.map(({ item }) => COMPASS_CELL[item.at][1])).size;
  const columnCount = new Set(sized.map(({ item }) => COMPASS_CELL[item.at][0])).size;
  if (sized.length === 1) placeSingle(sized[0]!, area, context);
  // A small leaf spanning both compass axes is two stacked rows, not a
  // single spine (a spine would collapse the vertical registers).
  else if (sized.length <= 3 && !(bandCount > 1 && columnCount > 1)) {
    placeSpine(sized, area, context);
  } else if (bandCount > 1) placeBandedRows(sized, area, context);
  else placePackedGrid(sized, area, context);
}

/**
 * Lay a repeated-cell grid as an exact lattice: identical cell extents,
 * row-major cell identity, with the declared ladder gap between cells.
 * The block centers in its region and scales down only when it must.
 */
function placeGrid(node: GridNode, rect: SketchRect, context: ExpandContext): void {
  if (node.items.length === 0) return;
  assignGroup(context, node.items.map((item) => item.id));
  for (const item of node.items) context.gridIds.add(item.id);
  const sized = node.items.map((item) => dimensionsForItem(item, context.mode));
  const cellWidth = Math.max(...sized.map((entry) => entry.width));
  const cellHeight = Math.max(...sized.map((entry) => entry.height));
  const gap = node.gap;
  const blockWidth = node.columns * cellWidth + (node.columns - 1) * gap;
  const blockHeight = node.rows * cellHeight + (node.rows - 1) * gap;
  const scale = context.mode === "natural"
    ? 1
    : Math.min(1, rect.width / blockWidth, rect.height / blockHeight);
  const blockX = rect.x + Math.max(0, (rect.width - blockWidth * scale) / 2);
  const blockY = rect.y + Math.max(0, (rect.height - blockHeight * scale) / 2);
  sized.forEach((entry, index) => {
    const column = index % node.columns;
    const row = Math.floor(index / node.columns);
    // Template members stay pixel-identical: every cell shares one extent
    // and one scale, so registers survive the round trip exactly.
    pushObject(
      context,
      { ...entry, width: cellWidth, height: cellHeight },
      blockX + (column + 0.5) * cellWidth * scale + column * gap * scale,
      blockY + (row + 0.5) * cellHeight * scale + row * gap * scale,
      scale,
    );
  });
}

interface IntrinsicSize {
  width: number;
  height: number;
}

/**
 * Estimate the natural extent of a subtree. Split allocation uses this as a
 * hard minimum, while hugged lanes use it as their exact content footprint.
 */
function intrinsicSize(
  node: SketchNode,
  band: SketchRect,
  depth: number,
  rootGutter: number,
  padding: number,
  mode: SolveMode,
): IntrinsicSize {
  if (node.kind === "split") {
    const parts = node.children.map((child) => (
      intrinsicSize(child, band, depth + 1, rootGutter, padding, mode)
    ));
    const gap = (mode === "natural" ? gutterForDepth(depth, rootGutter) : 32)
      * Math.max(0, parts.length - 1);
    if (node.axis === "row") {
      return {
        width: parts.reduce(
          (sum, part) => sum + (mode === "natural" ? snapUp(part.width, GRID) : part.width),
          0,
        ) + gap,
        height: Math.max(GRID, ...parts.map((part) => part.height)),
      };
    }
    return {
      width: Math.max(GRID, ...parts.map((part) => part.width)),
      height: parts.reduce(
        (sum, part) => sum + (mode === "natural" ? snapUp(part.height, GRID) : part.height),
        0,
      ) + gap,
    };
  }

  if (node.kind === "section") {
    const inner = intrinsicSize(node.child, band, depth + 1, rootGutter, padding, mode);
    const sectionPadding = mode === "natural" ? padding : DEFAULT_PADDING;
    return {
      width: inner.width + sectionPadding * 2,
      height: inner.height + SECTION_HEADER + sectionPadding * 2,
    };
  }

  if (node.kind === "grid") {
    if (node.items.length === 0) return { width: GRID, height: GRID };
    const sized = node.items.map((item) => dimensionsForItem(item, mode));
    const cellWidth = Math.max(...sized.map((entry) => entry.width));
    const cellHeight = Math.max(...sized.map((entry) => entry.height));
    const gap = node.gap;
    return {
      width: node.columns * cellWidth + (node.columns - 1) * gap + LEAF_PADDING * 2,
      height: node.rows * cellHeight + (node.rows - 1) * gap + LEAF_PADDING * 2,
    };
  }

  if (node.items.length === 0) return { width: GRID, height: GRID };
  const sized = node.items.map((item) => dimensionsForItem(item, mode));
  const bandRows = [...new Set(sized.map(({ item }) => COMPASS_CELL[item.at][1]))];
  const bandColumns = [...new Set(sized.map(({ item }) => COMPASS_CELL[item.at][0]))];
  if (sized.length === 1) {
    return {
      width: sized[0]!.width + LEAF_PADDING * 2,
      height: sized[0]!.height + LEAF_PADDING * 2,
    };
  }
  if (sized.length <= 3
    && (mode === "fit" || !(bandRows.length > 1 && bandColumns.length > 1))) {
    // Mirror placeSpine's axis choice so the hugged rect matches placement.
    const columns = new Set(sized.map(({ item }) => COMPASS_CELL[item.at][0])).size;
    const rows = new Set(sized.map(({ item }) => COMPASS_CELL[item.at][1])).size;
    const axis: "row" | "column" = columns > rows
      ? "row"
      : rows > columns
        ? "column"
        : band.width >= band.height ? "row" : "column";
    const mainTotal = sized.reduce(
      (sum, entry) => sum + (axis === "row" ? entry.width : entry.height),
      0,
    ) + ITEM_GAP * (sized.length - 1);
    const crossMax = Math.max(
      ...sized.map((entry) => (axis === "row" ? entry.height : entry.width)),
    );
    return axis === "row"
      ? { width: mainTotal + LEAF_PADDING * 2, height: crossMax + LEAF_PADDING * 2 }
      : { width: crossMax + LEAF_PADDING * 2, height: mainTotal + LEAF_PADDING * 2 };
  }
  if (bandRows.length > 1) {
    const bands = bandRows.map((row) => sized
      .filter(({ item }) => COMPASS_CELL[item.at][1] === row));
    const width = Math.max(...bands.map((group) => (
      group.reduce((sum, entry) => sum + entry.width, 0) + ITEM_GAP * (group.length - 1)
    )));
    const height = bands.reduce(
      (sum, group) => sum + Math.max(...group.map((entry) => entry.height)),
      0,
    ) + ITEM_GAP * (bands.length - 1);
    return { width: width + LEAF_PADDING * 2, height: height + LEAF_PADDING * 2 };
  }
  const cellWidth = Math.max(...sized.map((entry) => entry.width));
  const cellHeight = Math.max(...sized.map((entry) => entry.height));
  const columns = Math.min(
    sized.length,
    Math.max(1, Math.round(Math.sqrt((sized.length * cellHeight) / cellWidth))),
  );
  const rows = Math.ceil(sized.length / columns);
  return {
    width: columns * cellWidth + (columns - 1) * ITEM_GAP + LEAF_PADDING * 2,
    height: rows * cellHeight + (rows - 1) * ITEM_GAP + LEAF_PADDING * 2,
  };
}

function snapUp(value: number, grid: number): number {
  return Math.ceil(value / grid) * grid;
}

/**
 * Register a hugged lane child inside its weighted band: the content keeps
 * its intrinsic extent (16px-snapped, clamped to the band) and pins to the
 * declared corner instead of stretching to fill the band.
 */
function hugRect(
  node: SketchNode,
  band: SketchRect,
  corner: Compass,
  depth: number,
  context: ExpandContext,
): SketchRect {
  const natural = intrinsicSize(
    node,
    band,
    depth,
    context.rootGutter,
    context.padding,
    context.mode,
  );
  const width = context.mode === "natural"
    ? snapUp(natural.width, GRID)
    : Math.min(band.width, snapUp(natural.width, GRID));
  const height = context.mode === "natural"
    ? snapUp(natural.height, GRID)
    : Math.min(band.height, snapUp(natural.height, GRID));
  const [cellX, cellY] = COMPASS_CELL[corner];
  const x = cellX === 0
    ? band.x
    : cellX === 2
      ? band.x + band.width - width
      : band.x + (band.width - width) / 2;
  const y = cellY === 0
    ? band.y
    : cellY === 2
      ? band.y + band.height - height
      : band.y + (band.height - height) / 2;
  return { x, y, width, height };
}

function expandNode(
  node: SketchNode,
  rect: SketchRect,
  depth: number,
  context: ExpandContext,
  address: string,
): void {
  if (node.kind === "split") {
    const gutter = gutterForDepth(depth, context.rootGutter);
    const naturalChildren = context.mode === "natural"
      ? node.children.map((child) => intrinsicSize(
        child,
        rect,
        depth + 1,
        context.rootGutter,
        context.padding,
        context.mode,
      ))
      : [];
    const regions = splitRects(
      rect,
      node.axis,
      node.weights,
      naturalChildren.map((size) => node.axis === "row" ? size.width : size.height),
      node.children.length,
      gutter,
      context,
      address,
    );
    node.children.forEach((child, index) => {
      const region = regions[index];
      if (!region) return;
      const hug = node.hugs?.[index];
      const childRect = hug ? hugRect(child, region, hug, depth + 1, context) : region;
      context.regions.push({
        id: `${address}.${index}`,
        depth,
        axis: node.axis,
        rect: { ...region },
        hug: hug ?? null,
        hugRect: hug ? { ...childRect } : null,
      });
      expandNode(child, childRect, depth + 1, context, `${address}.${index}`);
    });
    return;
  }

  if (node.kind === "section") {
    registerInSections(context, node.id);
    context.objects.push({
      id: node.id,
      type: "section",
      ...(node.label === undefined ? {} : { label: node.label }),
      geometry: { ...rect },
    });
    context.sectionDescendants.set(node.id, []);
    context.sectionStack.push(node.id);
    const childRect = context.mode === "natural"
      ? insetRect(
        rect,
        context.padding,
        context.padding + SECTION_HEADER,
        context.padding,
      )
      : (() => {
        const padding = Math.min(context.padding, rect.width * 0.12, rect.height * 0.12);
        const header = Math.min(SECTION_HEADER, Math.max(0, rect.height * 0.16));
        return insetRect(rect, padding, padding + header, padding);
      })();
    expandNode(node.child, childRect, depth + 1, context, address);
    context.sectionStack.pop();
    return;
  }

  if (node.kind === "grid") {
    placeGrid(node, rect, context);
    return;
  }

  placeLeaf(node, rect, context);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function geometryCenter(geometry: SketchRect, axis: "x" | "y"): number {
  return axis === "x" ? geometry.x + geometry.width / 2 : geometry.y + geometry.height / 2;
}

function setGeometryCenter(geometry: SketchRect, axis: "x" | "y", center: number): void {
  if (axis === "x") geometry.x = Math.round(center - geometry.width / 2);
  else geometry.y = Math.round(center - geometry.height / 2);
}

/**
 * Solve tier constraints after the split pass: every member's cross-axis
 * center shifts onto the shared register (the members' median center). When
 * a member crosses a leaf-sibling on its way to the register, the sibling is
 * carried along so the leaf's internal ordering survives.
 */
function applyTiers(
  tiers: readonly TierDeclaration[],
  byId: ReadonlyMap<string, ExpandedSketchObject>,
  groupOf: ReadonlyMap<string, number>,
  gridIds: ReadonlySet<string>,
): void {
  const pinned = { x: new Set<string>(), y: new Set<string>() };
  for (const tier of tiers) {
    for (const member of tier.members) pinned[tier.axis].add(member);
  }
  // The fitter declares same-axis tiers in ascending register order; keep
  // that order on expansion so one register can never leapfrog another.
  const floors = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
  for (const tier of tiers) {
    const memberIds = new Set(tier.members);
    const members = tier.members
      .map((id) => byId.get(id))
      .filter((object): object is ExpandedSketchObject => object !== undefined);
    if (members.length < 2) continue;
    // Grid cells are immovable lattice anchors: when present, the register
    // is theirs and only the free members travel to it.
    const anchors = members.filter((member) => gridIds.has(member.id));
    const registerSources = anchors.length > 0 ? anchors : members;
    const register = Math.round(Math.max(
      median(registerSources.map((member) => geometryCenter(member.geometry, tier.axis))),
      floors[tier.axis] + 32,
    ));
    floors[tier.axis] = Math.max(floors[tier.axis], register);
    for (const member of members) {
      if (gridIds.has(member.id)) continue;
      const before = geometryCenter(member.geometry, tier.axis);
      const delta = register - before;
      setGeometryCenter(member.geometry, tier.axis, register);
      if (Math.abs(delta) < 1) continue;
      const group = groupOf.get(member.id);
      if (group === undefined) continue;
      const low = Math.min(before, register) - 4;
      const high = Math.max(before, register) + 4;
      for (const [id, otherGroup] of groupOf) {
        if (otherGroup !== group || id === member.id || memberIds.has(id)) continue;
        // Members of any tier on this axis are register-pinned; carrying
        // them along would drag them off their own register.
        if (pinned[tier.axis].has(id)) continue;
        const other = byId.get(id);
        if (!other) continue;
        const center = geometryCenter(other.geometry, tier.axis);
        if (center < low || center > high) continue;
        setGeometryCenter(other.geometry, tier.axis, center + delta);
      }
    }
  }
}

/**
 * Solve fan constraints bottom-up: each fan's children land on one shared
 * register, evenly pitched across their existing span (a moved child carries
 * its own fan subtree rigidly), and the hub centers over their midpoint.
 */
function applyFans(
  fans: readonly FanDeclaration[],
  byId: ReadonlyMap<string, ExpandedSketchObject>,
  sectionOf: ReadonlyMap<string, string | null>,
  pinnedOnAxis: (id: string, axis: "x" | "y") => boolean,
): void {
  const fansByHub = new Map<string, FanDeclaration[]>();
  for (const fan of fans) {
    const list = fansByHub.get(fan.hub) ?? [];
    list.push(fan);
    fansByHub.set(fan.hub, list);
  }

  const subtreeIds = (id: string, into: Set<string>): Set<string> => {
    if (into.has(id)) return into;
    into.add(id);
    for (const fan of fansByHub.get(id) ?? []) {
      for (const child of fan.children) subtreeIds(child, into);
    }
    return into;
  };

  const solved = new Set<FanDeclaration>();
  const solving = new Set<FanDeclaration>();
  const solve = (fan: FanDeclaration): void => {
    if (solved.has(fan) || solving.has(fan)) return;
    solving.add(fan);
    for (const child of fan.children) {
      for (const childFan of fansByHub.get(child) ?? []) solve(childFan);
    }
    solving.delete(fan);
    solved.add(fan);

    const hub = byId.get(fan.hub);
    const children = fan.children
      .map((id) => byId.get(id))
      .filter((object): object is ExpandedSketchObject => object !== undefined);
    if (!hub || children.length < 2) return;

    const vertical = fan.dir === "S" || fan.dir === "N";
    const mainAxis = vertical ? "x" : "y";
    const crossAxis = vertical ? "y" : "x";

    const translateSubtree = (rootId: string, axis: "x" | "y", delta: number): void => {
      if (delta === 0) return;
      for (const id of subtreeIds(rootId, new Set())) {
        const object = byId.get(id);
        if (!object) continue;
        object.geometry[axis] += delta;
      }
    };

    // Children share one register on the fan side of the hub. The register
    // starts at the children's median center but always clears the hub:
    // hubs bottom-anchor onto their children's top-anchors, never overlap.
    const crossExtent = (object: ExpandedSketchObject): number => (
      crossAxis === "y" ? object.geometry.height : object.geometry.width
    );
    const maxChildCross = Math.max(...children.map(crossExtent));
    const hubStart = hub.geometry[crossAxis];
    const hubEnd = hubStart + crossExtent(hub);
    const medianRegister = median(
      children.map((child) => geometryCenter(child.geometry, crossAxis)),
    );
    const register = Math.round(
      fan.dir === "S" || fan.dir === "E"
        ? Math.max(medianRegister, hubEnd + ITEM_GAP + maxChildCross / 2)
        : Math.min(medianRegister, hubStart - ITEM_GAP - maxChildCross / 2),
    );
    for (const child of children) {
      translateSubtree(
        child.id,
        crossAxis,
        register - Math.round(geometryCenter(child.geometry, crossAxis)),
      );
    }

    // Even pitch around the children's current midpoint. The pitch derives
    // from the widest solved child subtree plus one ladder gap, so nested
    // fan trees compose compactly (corpus pitch band: 192-320 for chips).
    const ordered = [...children].sort((left, right) => (
      geometryCenter(left.geometry, mainAxis) - geometryCenter(right.geometry, mainAxis)
      || left.id.localeCompare(right.id)
    ));
    const centers = ordered.map((child) => geometryCenter(child.geometry, mainAxis));
    const midpoint = (centers[0]! + centers[centers.length - 1]!) / 2;
    const subtreeMainExtent = (child: ExpandedSketchObject): number => {
      const rects = [...subtreeIds(child.id, new Set())]
        .map((id) => byId.get(id)?.geometry)
        .filter((geometry): geometry is SketchRect => geometry !== undefined);
      const start = Math.min(...rects.map((rect) => rect[mainAxis]));
      const end = Math.max(...rects.map((rect) => (
        rect[mainAxis] + (mainAxis === "x" ? rect.width : rect.height)
      )));
      return end - start;
    };
    // Tier pins on the fan's main axis outrank even pitching: a child locked
    // to a cross-branch register must not be dragged off it.
    const pinned = ordered.some((child) => pinnedOnAxis(child.id, mainAxis));
    if (!pinned) {
      // A fan whose members all live in one section is a local template: its
      // pitch normalizes to the solved subtree extents. When the children
      // straddle section boundaries (or the root), never compress the spread
      // past unrelated content between them; only widen when subtrees need
      // the room.
      const local = fan.children.every((id) => (
        sectionOf.get(id) === sectionOf.get(fan.hub)
      ));
      const spanPitch = ordered.length > 1
        ? (centers[centers.length - 1]! - centers[0]!) / (ordered.length - 1)
        : 0;
      const extentPitch = snapUp(
        Math.max(...ordered.map(subtreeMainExtent)) + ITEM_GAP,
        GRID,
      );
      const pitch = local ? extentPitch : Math.max(extentPitch, spanPitch);
      ordered.forEach((child, index) => {
        const target = Math.round(midpoint + (index - (ordered.length - 1) / 2) * pitch);
        translateSubtree(
          child.id,
          mainAxis,
          target - Math.round(geometryCenter(child.geometry, mainAxis)),
        );
      });
    }

    // The hub centers over the children's midpoint.
    if (!pinnedOnAxis(fan.hub, mainAxis)) {
      setGeometryCenter(hub.geometry, mainAxis, midpoint);
    }
  };

  for (const fan of fans) solve(fan);
}

/**
 * Separate residual box-box overlaps after tier/fan solving. Boxes push
 * apart along the axis of least penetration; grid cells never move (their
 * lattice is exact), so their partner takes the whole correction.
 */
function separateOverlaps(
  objects: readonly ExpandedSketchObject[],
  gridIds: ReadonlySet<string>,
): void {
  const boxes = objects.filter((object) => object.type !== "section");
  const GAP = 8;
  for (let round = 0; round < 8; round += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!.geometry;
        const b = boxes[j]!.geometry;
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const axis: "x" | "y" = overlapX <= overlapY ? "x" : "y";
        const push = (axis === "x" ? overlapX : overlapY) + GAP;
        const aFixed = gridIds.has(boxes[i]!.id);
        const bFixed = gridIds.has(boxes[j]!.id);
        if (aFixed && bFixed) continue;
        const sign = geometryCenter(a, axis) <= geometryCenter(b, axis) ? 1 : -1;
        if (aFixed) b[axis] += Math.round(sign * push);
        else if (bFixed) a[axis] -= Math.round(sign * push);
        else {
          a[axis] -= Math.round(sign * push / 2);
          b[axis] += Math.round(sign * (push - Math.round(push / 2)));
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/**
 * Grow section rects (innermost first) so every object expanded inside a
 * section still sits inside it after tier and fan solving moved things.
 */
function growSections(context: ExpandContext, byId: ReadonlyMap<string, ExpandedSketchObject>): void {
  const entries = [...context.sectionDescendants.entries()].reverse();
  for (const [sectionId, descendantIds] of entries) {
    const section = byId.get(sectionId);
    if (!section || descendantIds.length === 0) continue;
    const rects = descendantIds
      .map((id) => byId.get(id)?.geometry)
      .filter((geometry): geometry is SketchRect => geometry !== undefined);
    if (rects.length === 0) continue;
    const sidePadding = context.mode === "natural" ? context.padding : GRID;
    const topPadding = context.mode === "natural"
      ? context.padding + SECTION_HEADER
      : GRID;
    const left = Math.min(...rects.map((rect) => rect.x)) - sidePadding;
    const top = Math.min(...rects.map((rect) => rect.y)) - topPadding;
    const right = Math.max(...rects.map((rect) => rect.x + rect.width)) + sidePadding;
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height)) + sidePadding;
    const geometry = section.geometry;
    const newX = Math.min(geometry.x, left);
    const newY = Math.min(geometry.y, top);
    geometry.width = Math.max(geometry.x + geometry.width, right) - newX;
    geometry.height = Math.max(geometry.y + geometry.height, bottom) - newY;
    geometry.x = newX;
    geometry.y = newY;
  }
}

/** Include any post-constraint movement and section growth in the solve frame. */
function growBounds(bounds: SketchRect, objects: readonly ExpandedSketchObject[]): void {
  if (objects.length === 0) return;
  const left = Math.min(bounds.x, ...objects.map((object) => object.geometry.x));
  const top = Math.min(bounds.y, ...objects.map((object) => object.geometry.y));
  const right = Math.max(
    bounds.x + bounds.width,
    ...objects.map((object) => object.geometry.x + object.geometry.width),
  );
  const bottom = Math.max(
    bounds.y + bounds.height,
    ...objects.map((object) => object.geometry.y + object.geometry.height),
  );
  bounds.x = left;
  bounds.y = top;
  bounds.width = right - left;
  bounds.height = bottom - top;
}

/**
 * Expand the discrete sketch into deterministic geometry. Splits use the
 * compiler's weighted integer allocator over the 16px grid and reserve real
 * corridors between siblings (emitted for the connector router); leaf items
 * compose into centered spines or tidy grids sized from canvas type defaults.
 * Grid nodes lay exact lattices, hugged lane children keep their intrinsic
 * extent, and tier/fan declarations are solved as constraints afterwards.
 */
export function expandSketch(sketch: Sketch, options: ExpandSketchOptions = {}): ExpandedSketch {
  // Fit requires an explicit opt-in; omitted or invalid runtime values stay natural.
  const mode: SolveMode = options.mode === "fit" ? "fit" : "natural";
  const rootGutter = Math.max(
    0,
    Number.isFinite(options.gutter) ? options.gutter as number : GUTTER_LADDER[0],
  );
  const padding = Math.max(
    0,
    Number.isFinite(options.padding) ? options.padding as number : DEFAULT_PADDING,
  );
  const requestedBounds: SketchRect = {
    x: 0,
    y: 0,
    width: finitePositive(options.width, DEFAULT_WIDTH),
    height: finitePositive(options.height, DEFAULT_HEIGHT),
  };
  const natural = mode === "natural"
    ? intrinsicSize(sketch.root, requestedBounds, 0, rootGutter, padding, mode)
    : requestedBounds;
  const bounds: SketchRect = mode === "natural"
    ? {
      ...requestedBounds,
      width: Math.max(requestedBounds.width, snapUp(natural.width, GRID)),
      height: Math.max(requestedBounds.height, snapUp(natural.height, GRID)),
    }
    : { ...requestedBounds };
  const context: ExpandContext = {
    mode,
    objects: [],
    gutters: [],
    regions: [],
    padding,
    rootGutter,
    sectionStack: [],
    sectionDescendants: new Map(),
    groupOf: new Map(),
    groupCounter: 0,
    sectionOf: new Map(),
    gridIds: new Set(),
  };
  expandNode(sketch.root, bounds, 0, context, "r");
  const byId = new Map(context.objects.map((object) => [object.id, object]));
  applyTiers(sketch.tiers, byId, context.groupOf, context.gridIds);
  const pinnedAxes = new Map<string, Set<"x" | "y">>();
  for (const tier of sketch.tiers) {
    for (const member of tier.members) {
      const axes = pinnedAxes.get(member) ?? new Set<"x" | "y">();
      axes.add(tier.axis);
      pinnedAxes.set(member, axes);
    }
  }
  applyFans(
    sketch.fans,
    byId,
    context.sectionOf,
    (id, axis) => pinnedAxes.get(id)?.has(axis) ?? false,
  );
  separateOverlaps(context.objects, context.gridIds);
  growSections(context, byId);
  if (mode === "natural") growBounds(bounds, context.objects);
  return {
    objects: context.objects,
    edges: sketch.edges.map((edge) => ({ ...edge })),
    bounds,
    gutters: context.gutters,
    regions: context.regions,
  };
}
