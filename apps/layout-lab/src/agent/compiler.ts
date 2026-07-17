import { routeConnectors } from "./router";
import type {
  CompileError,
  CompileResult,
  CompileSettings,
  CompileSettingsInput,
  CompiledGutter,
  CompiledObject,
  CompiledRegion,
  LayoutObjectType,
  PackMode,
  Rect,
  RegionAddress,
  RoutedConnectionInput,
  RuntimeMetrics,
  SplitAxis,
} from "./types";

export const DEFAULT_COMPILE_SETTINGS: Readonly<CompileSettings> = Object.freeze({
  grid: 16,
  gutter: 48,
  gap: 24,
  width: 1280,
  height: 800,
});

const DEFAULT_ITEM_SIZES: Readonly<Record<Exclude<LayoutObjectType, "section">, Readonly<Pick<Rect, "width" | "height">>>> =
  Object.freeze({
    sticky: { width: 176, height: 128 },
    rect: { width: 184, height: 96 },
    diamond: { width: 160, height: 112 },
  });

const VALID_TYPES: ReadonlySet<string> = new Set(["section", "sticky", "rect", "diamond"]);
const VALID_PACKS: ReadonlySet<string> = new Set(["grid", "row", "column", "center"]);

interface PlacementIdentity {
  id: string;
  label: string;
}

interface InternalPlacement {
  type: LayoutObjectType;
  pack: PackMode;
  count: number;
  identities: PlacementIdentity[];
  opIndex: number;
}

interface InternalRegion extends Rect {
  address: RegionAddress;
  parent: InternalRegion | null;
  children: InternalRegion[];
  axis: SplitAxis | null;
  weights: number[];
  placements: InternalPlacement[];
  reserved: boolean;
  splitOpIndex?: number;
  reserveOpIndex?: number;
  minWidth: number;
  minHeight: number;
}

interface GroupMetrics {
  itemWidth: number;
  itemHeight: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
}

interface WeightedShare {
  weight: number;
  index: number;
  units: number;
  remainder: number;
}

function snapUp(value: number, grid: number): number {
  return Math.ceil(value / grid) * grid;
}

function snapNearest(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLayoutObjectType(value: unknown): value is LayoutObjectType {
  return typeof value === "string" && VALID_TYPES.has(value);
}

function isPackMode(value: unknown): value is PackMode {
  return typeof value === "string" && VALID_PACKS.has(value);
}

function isSplitAxis(value: unknown): value is SplitAxis {
  return value === "row" || value === "column";
}

function normalizeSettings(raw: CompileSettingsInput): CompileSettings {
  const numericGrid = Number(raw.grid);
  const grid: CompileSettings["grid"] = numericGrid === 8 || numericGrid === 16 || numericGrid === 32
    ? numericGrid
    : DEFAULT_COMPILE_SETTINGS.grid;
  return {
    grid,
    gutter: clamp(Number(raw.gutter) || 0, 0, 96),
    gap: clamp(Number(raw.gap) || DEFAULT_COMPILE_SETTINGS.gap, 16, 48),
    width: clamp(Number(raw.width) || DEFAULT_COMPILE_SETTINGS.width, 320, 4096),
    height: clamp(Number(raw.height) || DEFAULT_COMPILE_SETTINGS.height, 240, 4096),
  };
}

export function runtimeMetrics(settings: CompileSettings): RuntimeMetrics {
  const grid = settings.grid;
  return {
    margin: grid,
    padX: snapUp(24, grid),
    padTop: snapUp(48, grid),
    padBottom: snapUp(24, grid),
    gap: Math.max(grid, snapNearest(settings.gap, grid)),
    gutter: Math.max(0, snapNearest(settings.gutter, grid)),
  };
}

function itemSize(type: LayoutObjectType, grid: number): Pick<Rect, "width" | "height"> {
  const source = type === "section" ? { width: 160, height: 96 } : DEFAULT_ITEM_SIZES[type];
  return { width: snapUp(source.width, grid), height: snapUp(source.height, grid) };
}

function placementIdentity(
  source: Record<string, unknown>,
  type: LayoutObjectType,
  opIndex: number,
  itemIndex: number,
  count: number,
): PlacementIdentity {
  const base = typeof source.id === "string" && source.id.trim() ? source.id.trim() : `${type}-${opIndex}`;
  const id = count > 1 ? `${base}.${itemIndex}` : base;
  const ordinal = itemIndex + 1;
  const baseLabel = typeof source.label === "string" && source.label ? source.label : type;
  const label = count > 1
    ? (baseLabel.includes("{i}") ? baseLabel.replaceAll("{i}", String(ordinal)) : `${baseLabel} ${ordinal}`)
    : baseLabel.replaceAll("{i}", "1");
  return { id, label };
}

function groupMetrics(placement: InternalPlacement, settings: CompileSettings, metrics: RuntimeMetrics): GroupMetrics {
  const { count } = placement;
  const size = itemSize(placement.type, settings.grid);
  let columns = 1;
  let rows = count;
  if (placement.pack === "row") {
    columns = count;
    rows = 1;
  } else if (placement.pack === "grid") {
    columns = Math.max(1, Math.round(Math.sqrt((count * size.height) / size.width)));
    rows = Math.ceil(count / columns);
  } else if (placement.pack === "center" && count === 1) {
    rows = 1;
  }
  return {
    itemWidth: size.width,
    itemHeight: size.height,
    columns,
    rows,
    width: columns * size.width + Math.max(0, columns - 1) * metrics.gap,
    height: rows * size.height + Math.max(0, rows - 1) * metrics.gap,
  };
}

/**
 * Compile a coordinate-free layout program into deterministic, grid-snapped
 * canvas geometry. Invalid operations are reported and skipped so callers can
 * keep rendering the valid prefix/portion while an editor is being changed.
 */
export function compile(ops: unknown, rawSettings: CompileSettingsInput = {}): CompileResult {
  const settings = normalizeSettings(rawSettings);
  const metrics = runtimeMetrics(settings);
  const errors: CompileError[] = [];
  const root = makeRegion("r", null);
  const regionMap = new Map<RegionAddress, InternalRegion>([["r", root]]);
  const usedIds = new Map<string, number>();
  const connectionOps: RoutedConnectionInput[] = [];
  const program: unknown[] = Array.isArray(ops) ? ops : [];

  const fail = (opIndex: number | null, message: string): void => {
    errors.push({ opIndex, message });
  };
  if (!Array.isArray(ops)) fail(null, "Program must be a JSON array of operations.");

  program.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      fail(index, "Operation must be a JSON object.");
      return;
    }

    if (candidate.op === "split") {
      const region = typeof candidate.region === "string" ? regionMap.get(candidate.region as RegionAddress) : undefined;
      if (!region) { fail(index, `Unknown region address “${String(candidate.region)}”.`); return; }
      if (region.children.length) { fail(index, `Region “${String(candidate.region)}” is already split.`); return; }
      if (region.placements.length || region.reserved) { fail(index, `Region “${String(candidate.region)}” already contains content and cannot be split.`); return; }
      if (!isSplitAxis(candidate.axis)) { fail(index, "Split axis must be “row” or “column”."); return; }
      if (!Array.isArray(candidate.weights) || candidate.weights.length < 2 || candidate.weights.some((weight) => !finiteNumber(weight) || Number(weight) <= 0)) {
        fail(index, "Split weights must contain at least two positive numbers.");
        return;
      }
      region.axis = candidate.axis;
      region.weights = candidate.weights.map(Number);
      region.splitOpIndex = index;
      region.children = region.weights.map((_weight, childIndex) => {
        const child = makeRegion(`${region.address}.${childIndex}`, region);
        regionMap.set(child.address, child);
        return child;
      });
      return;
    }

    if (candidate.op === "place") {
      const region = typeof candidate.region === "string" ? regionMap.get(candidate.region as RegionAddress) : undefined;
      if (!region) { fail(index, `Unknown region address “${String(candidate.region)}”.`); return; }
      if (region.children.length) { fail(index, `Cannot place into split region “${String(candidate.region)}”; choose one of its leaf children.`); return; }
      if (region.reserved) { fail(index, `Region “${String(candidate.region)}” is reserved and must remain empty.`); return; }
      if (!isLayoutObjectType(candidate.type)) { fail(index, `Unknown object type “${String(candidate.type)}”.`); return; }
      const packValue = candidate.pack == null ? "grid" : candidate.pack;
      if (!isPackMode(packValue)) { fail(index, `Unknown pack mode “${String(packValue)}”.`); return; }
      const count = candidate.count == null ? 1 : Number(candidate.count);
      if (!Number.isInteger(count) || count < 1 || count > 100) { fail(index, "Place count must be an integer from 1 to 100."); return; }
      if (candidate.type === "section" && count !== 1) { fail(index, "A section fills its region and must have count 1."); return; }
      if (candidate.type === "section" && region.placements.some((item) => item.type === "section")) {
        fail(index, `Region “${String(candidate.region)}” already has a section.`);
        return;
      }

      const identities: PlacementIdentity[] = [];
      let duplicate = false;
      for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
        const identity = placementIdentity(candidate, candidate.type, index, itemIndex, count);
        const firstOpIndex = usedIds.get(identity.id);
        if (firstOpIndex !== undefined) {
          fail(index, `Duplicate object id “${identity.id}” (first used by op ${firstOpIndex}).`);
          duplicate = true;
        }
        identities.push(identity);
      }
      if (duplicate) return;
      identities.forEach((identity) => usedIds.set(identity.id, index));
      region.placements.push({ type: candidate.type, pack: packValue, count, identities, opIndex: index });
      return;
    }

    if (candidate.op === "reserve") {
      const region = typeof candidate.region === "string" ? regionMap.get(candidate.region as RegionAddress) : undefined;
      if (!region) { fail(index, `Unknown region address “${String(candidate.region)}”.`); return; }
      if (region.children.length) { fail(index, `Cannot reserve split region “${String(candidate.region)}”; reserve a leaf.`); return; }
      if (region.placements.length) { fail(index, `Region “${String(candidate.region)}” already contains content and cannot be reserved.`); return; }
      if (region.reserved) { fail(index, `Region “${String(candidate.region)}” is already reserved.`); return; }
      region.reserved = true;
      region.reserveOpIndex = index;
      return;
    }

    if (candidate.op === "connect") {
      if (typeof candidate.from !== "string" || typeof candidate.to !== "string") {
        fail(index, "Connect requires string “from” and “to” ids.");
        return;
      }
      connectionOps.push({
        from: candidate.from,
        to: candidate.to,
        label: typeof candidate.label === "string" ? candidate.label : "",
        opIndex: index,
      });
      return;
    }

    fail(index, `Unknown operation “${String(candidate.op)}”.`);
  });

  connectionOps.forEach((connection) => {
    if (!usedIds.has(connection.from)) fail(connection.opIndex, `Unknown connector endpoint “${connection.from}”.`);
    if (!usedIds.has(connection.to)) fail(connection.opIndex, `Unknown connector endpoint “${connection.to}”.`);
  });

  measureRegion(root, settings, metrics);
  const requestedWidth = snapUp(settings.width, settings.grid);
  const requestedHeight = snapUp(settings.height, settings.grid);
  const rootWidth = Math.max(requestedWidth, root.minWidth);
  const rootHeight = Math.max(requestedHeight, root.minHeight);
  const regions: CompiledRegion[] = [];
  const gutters: CompiledGutter[] = [];
  allocateRegion(root, { x: 0, y: 0, width: rootWidth, height: rootHeight }, settings, metrics, regions, gutters);

  const objects: CompiledObject[] = [];
  placeRegionContents(root, settings, metrics, objects);
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const validConnections = connectionOps.filter((connection) => objectById.has(connection.from) && objectById.has(connection.to));
  const connectors = routeConnectors(
    validConnections,
    objectById,
    objects,
    gutters,
    { x: 0, y: 0, width: rootWidth, height: rootHeight },
    settings,
    metrics,
  );

  return {
    objects,
    connectors,
    regions,
    gutters,
    errors,
    canvas: {
      requestedWidth,
      requestedHeight,
      width: rootWidth,
      height: rootHeight,
      grew: rootWidth > requestedWidth || rootHeight > requestedHeight,
      effectiveGrid: settings.grid,
      effectiveGutter: metrics.gutter,
      effectiveGap: metrics.gap,
    },
  };
}

function makeRegion(address: RegionAddress, parent: InternalRegion | null): InternalRegion {
  return {
    address,
    parent,
    children: [],
    axis: null,
    weights: [],
    placements: [],
    reserved: false,
    minWidth: 0,
    minHeight: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

function measureRegion(region: InternalRegion, settings: CompileSettings, metrics: RuntimeMetrics): void {
  if (region.children.length) {
    region.children.forEach((child) => measureRegion(child, settings, metrics));
    if (region.axis === "row") {
      region.minWidth = region.children.reduce((sum, child) => sum + child.minWidth, 0) + metrics.gutter * (region.children.length - 1);
      region.minHeight = Math.max(...region.children.map((child) => child.minHeight));
    } else {
      region.minWidth = Math.max(...region.children.map((child) => child.minWidth));
      region.minHeight = region.children.reduce((sum, child) => sum + child.minHeight, 0) + metrics.gutter * (region.children.length - 1);
    }
    return;
  }

  const section = region.placements.find((placement) => placement.type === "section");
  const groups = region.placements
    .filter((placement) => placement.type !== "section")
    .map((placement) => groupMetrics(placement, settings, metrics));
  const contentWidth = groups.length ? Math.max(...groups.map((group) => group.width)) : 0;
  const contentHeight = groups.reduce((sum, group) => sum + group.height, 0) + Math.max(0, groups.length - 1) * metrics.gap;
  const horizontalInset = metrics.margin * 2 + (section ? metrics.padX * 2 : 0);
  const verticalInset = metrics.margin * 2 + (section ? metrics.padTop + metrics.padBottom : 0);
  const emptyMinimum = settings.grid * 4;
  region.minWidth = snapUp(Math.max(emptyMinimum, contentWidth + horizontalInset, section ? settings.grid * 12 : 0), settings.grid);
  region.minHeight = snapUp(Math.max(emptyMinimum, contentHeight + verticalInset, section ? settings.grid * 8 : 0), settings.grid);
}

/** Allocate integer grid units by weight while honoring child minimums. */
export function allocateWeightedUnits(totalUnits: number, minimumUnits: readonly number[], weights: readonly number[]): number[] {
  const result = new Array<number>(weights.length).fill(0);
  let remaining = totalUnits;
  let active = weights.map((weight, index) => ({ weight, index }));

  while (active.length) {
    const weightSum = active.reduce((sum, item) => sum + item.weight, 0);
    const clamped = active.filter((item) => (remaining * item.weight) / weightSum < (minimumUnits[item.index] ?? 0));
    if (!clamped.length) break;
    clamped.forEach((item) => {
      result[item.index] = minimumUnits[item.index] ?? 0;
      remaining -= result[item.index] ?? 0;
    });
    const clampedIds = new Set(clamped.map((item) => item.index));
    active = active.filter((item) => !clampedIds.has(item.index));
  }

  if (!active.length) return result;
  const weightSum = active.reduce((sum, item) => sum + item.weight, 0);
  const shares: WeightedShare[] = active.map((item) => {
    const exact = (remaining * item.weight) / weightSum;
    return { ...item, units: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let distributed = shares.reduce((sum, item) => sum + item.units, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let cursor = 0; distributed < remaining; cursor += 1, distributed += 1) {
    const share = shares[cursor % shares.length];
    if (share) share.units += 1;
  }
  shares.forEach((item) => { result[item.index] = item.units; });
  return result;
}

function allocateRegion(
  region: InternalRegion,
  box: Rect,
  settings: CompileSettings,
  metrics: RuntimeMetrics,
  regions: CompiledRegion[],
  gutters: CompiledGutter[],
): void {
  region.x = box.x;
  region.y = box.y;
  region.width = box.width;
  region.height = box.height;
  regions.push({
    address: region.address,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    leaf: region.children.length === 0,
    reserved: region.reserved,
    minWidth: region.minWidth,
    minHeight: region.minHeight,
  });
  if (!region.children.length || !region.axis) return;

  const along = region.axis === "row" ? box.width : box.height;
  const totalUnits = Math.round((along - metrics.gutter * (region.children.length - 1)) / settings.grid);
  const minimumUnits = region.children.map((child) =>
    Math.round((region.axis === "row" ? child.minWidth : child.minHeight) / settings.grid));
  const allocatedUnits = allocateWeightedUnits(totalUnits, minimumUnits, region.weights);
  let cursor = region.axis === "row" ? box.x : box.y;

  region.children.forEach((child, index) => {
    const childExtent = (allocatedUnits[index] ?? 0) * settings.grid;
    const childBox: Rect = region.axis === "row"
      ? { x: cursor, y: box.y, width: childExtent, height: box.height }
      : { x: box.x, y: cursor, width: box.width, height: childExtent };
    allocateRegion(child, childBox, settings, metrics, regions, gutters);
    cursor += childExtent;
    if (index < region.children.length - 1) {
      const gutter: CompiledGutter = region.axis === "row"
        ? { id: `${region.address}:g${index}`, parent: region.address, orientation: "vertical", x: cursor, y: box.y, width: metrics.gutter, height: box.height }
        : { id: `${region.address}:g${index}`, parent: region.address, orientation: "horizontal", x: box.x, y: cursor, width: box.width, height: metrics.gutter };
      gutters.push(gutter);
      cursor += metrics.gutter;
    }
  });
}

function placeRegionContents(
  region: InternalRegion,
  settings: CompileSettings,
  metrics: RuntimeMetrics,
  objects: CompiledObject[],
): void {
  if (region.children.length) {
    region.children.forEach((child) => placeRegionContents(child, settings, metrics, objects));
    return;
  }

  const section = region.placements.find((placement) => placement.type === "section");
  if (section) {
    const identity = section.identities[0];
    if (identity) {
      objects.push({
        id: identity.id,
        type: "section",
        label: identity.label,
        region: region.address,
        opIndex: section.opIndex,
        x: region.x + metrics.margin,
        y: region.y + metrics.margin,
        width: region.width - metrics.margin * 2,
        height: region.height - metrics.margin * 2,
      });
    }
  }

  let area: Rect = {
    x: region.x + metrics.margin,
    y: region.y + metrics.margin,
    width: region.width - metrics.margin * 2,
    height: region.height - metrics.margin * 2,
  };
  if (section) {
    area = {
      x: area.x + metrics.padX,
      y: area.y + metrics.padTop,
      width: area.width - metrics.padX * 2,
      height: area.height - metrics.padTop - metrics.padBottom,
    };
  }

  const placements = region.placements.filter((placement) => placement.type !== "section");
  const groups = placements.map((placement) => ({ placement, geometry: groupMetrics(placement, settings, metrics) }));
  const totalHeight = groups.reduce((sum, group) => sum + group.geometry.height, 0) + Math.max(0, groups.length - 1) * metrics.gap;
  let groupY = area.y + snapNearest((area.height - totalHeight) / 2, settings.grid);

  groups.forEach(({ placement, geometry }) => {
    const groupX = area.x + snapNearest((area.width - geometry.width) / 2, settings.grid);
    for (let itemIndex = 0; itemIndex < placement.count; itemIndex += 1) {
      const column = placement.pack === "row" ? itemIndex : placement.pack === "grid" ? itemIndex % geometry.columns : 0;
      const row = placement.pack === "row" ? 0 : placement.pack === "grid" ? Math.floor(itemIndex / geometry.columns) : itemIndex;
      const identity = placement.identities[itemIndex];
      if (!identity) continue;
      objects.push({
        id: identity.id,
        type: placement.type,
        label: identity.label,
        region: region.address,
        opIndex: placement.opIndex,
        x: groupX + column * (geometry.itemWidth + metrics.gap),
        y: groupY + row * (geometry.itemHeight + metrics.gap),
        width: geometry.itemWidth,
        height: geometry.itemHeight,
      });
    }
    groupY += geometry.height + metrics.gap;
  });
}

