/**
 * Region measurement — the readout `look` returns whenever it frames a region
 * (`view`, `at`, or `diagnostic`).
 *
 * The model can see a crop, but it cannot count pixels off a raster. This
 * module measures the same region the camera framed and states it in world
 * units, so conformance against the craft targets is READ rather than
 * recomputed in context: the corridors between neighbouring boxes, the pitch
 * the rows and columns repeat on, how much of a frame is still free, and how
 * much of the region is actually covered in content.
 *
 * Pure and deterministic — document in, numbers out. Nothing here renders,
 * mutates, or looks at the session.
 *
 * It is also the shared home for `axisGap`, which the crowding and
 * unreadable-labels rules both need: a corridor width has exactly one
 * definition on this board, and every consumer reads it from here.
 */
import { objectPaintedBounds } from "../../../canvas/src/render/painted-bounds";
import { sectionFitGeometry } from "../../../canvas/src/state/geometry";

import { kindOf } from "./helpers";
import type { Rect } from "./types";

import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

export type Axis = "x" | "y";

/** Clear space between the two rects along `axis` (negative when they overlap). */
export function axisGap(a: Rect, b: Rect, axis: Axis): number {
  if (axis === "x") {
    return Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  }
  return Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
}

/** Area of the overlap between two rects; 0 when they miss each other. */
export function rectIntersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** One measured corridor between two boxes, along one axis. */
export interface PairGap {
  axis: Axis;
  a: string;
  b: string;
  /** Clear world units between the two boxes. Rounded. */
  gap: number;
}

/** The repeat interval of the rows (axis `y`) or columns (axis `x`). */
export interface AxisPitch {
  axis: Axis;
  /** Consecutive deltas between the sorted distinct leading edges. Rounded. */
  deltas: number[];
}

/** Unused margin on each side of a section frame, in world units. Rounded. */
export interface FreeRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RegionMeasurement {
  /** The region measured, exactly as handed in. */
  region: Rect;
  /** The section this region frames, when it frames one. */
  sectionId: string | null;
  /** Boxes counted as inside the region, in document order. */
  memberIds: string[];
  /** Neighbour corridors, x first then y, each ordered along its axis. */
  gaps: PairGap[];
  /** Column pitch then row pitch; an axis with fewer than two tracks is absent. */
  pitch: AxisPitch[];
  /** Per-side slack when the region is a section that fitting would shrink. */
  free: FreeRect | null;
  /** Painted content area over region area, 0..1. Sections are frames, not ink. */
  inkShare: number;
}

/** Corridors past this many per axis are noise in a readout; the rest is a count. */
const MAX_PAIRS_PER_AXIS = 12;
/** Deltas past this many are noise too. */
const MAX_PITCH_DELTAS = 8;

function area(rect: Rect): number {
  return rect.width > 0 && rect.height > 0 ? rect.width * rect.height : 0;
}

function contains(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height;
}

function sameRect(a: Rect, b: Rect): boolean {
  return Math.round(a.x) === Math.round(b.x)
    && Math.round(a.y) === Math.round(b.y)
    && Math.round(a.width) === Math.round(b.width)
    && Math.round(a.height) === Math.round(b.height);
}

/**
 * The boxes the region is about: everything painted inside it, minus the
 * containers the region sits in. A close-up of a section is a reading of what
 * is IN the section — the frame itself and the page around it are the walls,
 * not the contents.
 */
function membersOf(
  document: InteractiveCanvasDocument,
  region: Rect,
): InteractiveCanvasObject[] {
  if (area(region) <= 0) return [];
  return document.objects.filter((object) => {
    if (rectIntersectionArea(object.geometry, region) <= 0) return false;
    return !contains(object.geometry, region);
  });
}

function leadingEdge(object: InteractiveCanvasObject, axis: Axis): number {
  return axis === "x" ? object.geometry.x : object.geometry.y;
}

/** The axis a corridor is measured across is perpendicular to the one it runs along. */
function crossAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

/**
 * Neighbour corridors along one axis: pairs that share a band on the other
 * axis (so a wire between them would have to thread the gap), face each other
 * cleanly, and have nothing intruding between them. Pairs that overlap on both
 * axes are covered content, not a corridor, and are left to that rule.
 */
function axisGaps(members: InteractiveCanvasObject[], axis: Axis): PairGap[] {
  const cross = crossAxis(axis);
  const found: PairGap[] = [];
  const ordered = [...members].sort((left, right) =>
    leadingEdge(left, axis) - leadingEdge(right, axis)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i]!;
      const b = ordered[j]!;
      if (axisGap(a.geometry, b.geometry, cross) >= 0) continue;
      const gap = axisGap(a.geometry, b.geometry, axis);
      if (gap < 0) continue;
      const near = axis === "x"
        ? Math.min(a.geometry.x + a.geometry.width, b.geometry.x + b.geometry.width)
        : Math.min(a.geometry.y + a.geometry.height, b.geometry.y + b.geometry.height);
      const far = axis === "x"
        ? Math.max(a.geometry.x, b.geometry.x)
        : Math.max(a.geometry.y, b.geometry.y);
      const blocked = ordered.some((other) => {
        if (other.id === a.id || other.id === b.id) return false;
        if (axisGap(other.geometry, a.geometry, cross) >= 0) return false;
        if (axisGap(other.geometry, b.geometry, cross) >= 0) return false;
        const start = axis === "x" ? other.geometry.x : other.geometry.y;
        const end = start + (axis === "x" ? other.geometry.width : other.geometry.height);
        return end > near && start < far;
      });
      if (blocked) continue;
      const first = leadingEdge(a, axis) <= leadingEdge(b, axis) ? a : b;
      const second = first === a ? b : a;
      found.push({ axis, a: first.id, b: second.id, gap: Math.round(gap) });
    }
  }
  return found;
}

/**
 * The tracks along one axis: distinct leading edges, which is what collapses an
 * aligned row (or column) into one track. The pitch is the deltas between
 * consecutive tracks — uniform deltas are the grid the region repeats on.
 */
function axisPitch(members: InteractiveCanvasObject[], axis: Axis): AxisPitch | null {
  const tracks = [...new Set(members.map((object) => Math.round(leadingEdge(object, axis))))]
    .sort((left, right) => left - right);
  if (tracks.length < 2) return null;
  const deltas: number[] = [];
  for (let i = 1; i < tracks.length; i += 1) deltas.push(tracks[i]! - tracks[i - 1]!);
  return { axis, deltas };
}

/**
 * The slack a fit would reclaim, per side — the frame-slack rule's arithmetic
 * without its reporting thresholds, because a readout states the number and
 * lets the model judge it.
 */
function freeRectFor(
  document: InteractiveCanvasDocument,
  sectionId: string,
): FreeRect | null {
  const section = document.objects.find((object) => object.id === sectionId);
  if (!section || kindOf(section) !== "section") return null;
  const fit = sectionFitGeometry(document, sectionId);
  if (!fit) return null;
  const frame = section.geometry;
  const sides = {
    left: fit.x - frame.x,
    right: frame.x + frame.width - (fit.x + fit.width),
    top: fit.y - frame.y,
    bottom: frame.y + frame.height - (fit.y + fit.height),
  };
  if (Object.values(sides).some((value) => !Number.isFinite(value))) return null;
  return {
    left: Math.round(Math.max(0, sides.left)),
    right: Math.round(Math.max(0, sides.right)),
    top: Math.round(Math.max(0, sides.top)),
    bottom: Math.round(Math.max(0, sides.bottom)),
  };
}

export interface MeasureRegionOptions {
  /** The section the region frames, when the caller already knows it. */
  sectionId?: string;
}

/**
 * Measure one world-space region: neighbour corridors on each axis, the row
 * and column pitch, the framing section's free margins, and the share of the
 * region carrying painted content.
 */
export function measureRegion(
  document: InteractiveCanvasDocument,
  region: Rect,
  options?: MeasureRegionOptions,
): RegionMeasurement {
  const members = membersOf(document, region);
  const explicit = options?.sectionId;
  const framed = explicit !== undefined
    ? document.objects.find((object) =>
      object.id === explicit && kindOf(object) === "section")
    : document.objects.find((object) =>
      kindOf(object) === "section" && sameRect(object.geometry, region));
  const sectionId = framed?.id ?? null;

  const regionArea = area(region);
  const painted = members
    .filter((object) => kindOf(object) !== "section")
    .reduce(
      (total, object) => total + rectIntersectionArea(objectPaintedBounds(object), region),
      0,
    );

  return {
    region,
    sectionId,
    memberIds: members.map((object) => object.id),
    gaps: [...axisGaps(members, "x"), ...axisGaps(members, "y")],
    pitch: [axisPitch(members, "x"), axisPitch(members, "y")]
      .filter((entry): entry is AxisPitch => entry !== null),
    free: sectionId === null ? null : freeRectFor(document, sectionId),
    inkShare: regionArea > 0 ? Math.min(1, painted / regionArea) : 0,
  };
}

function formatRect(rect: Rect): string {
  return `${Math.round(rect.x)},${Math.round(rect.y)} `
    + `${Math.round(rect.width)}×${Math.round(rect.height)}`;
}

function formatDeltas(deltas: number[]): string {
  const uniform = deltas.every((delta) => delta === deltas[0]);
  if (uniform && deltas.length > 1) return `${deltas[0]}×${deltas.length}`;
  const shown = deltas.slice(0, MAX_PITCH_DELTAS).join(" · ");
  return deltas.length > MAX_PITCH_DELTAS
    ? `${shown} · +${deltas.length - MAX_PITCH_DELTAS} more`
    : shown;
}

function row(key: string, value: string): string {
  return `  ${key.padEnd(8)}${value}`;
}

function gapsRow(gaps: PairGap[], axis: Axis): string | null {
  const forAxis = gaps.filter((gap) => gap.axis === axis);
  if (forAxis.length === 0) return null;
  const shown = forAxis
    .slice(0, MAX_PAIRS_PER_AXIS)
    .map((gap) => `${gap.a}↔${gap.b} ${gap.gap}`)
    .join(" · ");
  const rest = forAxis.length - MAX_PAIRS_PER_AXIS;
  return row(`gaps ${axis}`, rest > 0 ? `${shown} · +${rest} more` : shown);
}

/**
 * The MEASURES block, in the grammar the tests pin:
 *
 * ```
 * MEASURES · section home 0,0 480×320
 *   gaps x  alpha↔beta 80
 *   gaps y  alpha↔gamma 48
 *   pitch x 200×3
 *   pitch y 240 · 180
 *   free    left 32 · right 288 · top 64 · bottom 32
 *   ink     38%
 * ```
 *
 * `label` names what framed the region — `section <id>`, `at`, or a finding
 * id. Empty categories are omitted: a region with no corridors prints no gaps
 * row, and a region that is not a section prints no free row.
 */
export function formatRegionMeasures(
  label: string,
  measurement: RegionMeasurement,
): string {
  const lines = [`MEASURES · ${label} ${formatRect(measurement.region)}`];
  if (measurement.memberIds.length === 0) {
    lines.push(row("empty", "no boxes in this region"));
    return lines.join("\n");
  }
  for (const axis of ["x", "y"] as const) {
    const line = gapsRow(measurement.gaps, axis);
    if (line !== null) lines.push(line);
  }
  for (const entry of measurement.pitch) {
    lines.push(row(`pitch ${entry.axis}`, formatDeltas(entry.deltas)));
  }
  if (measurement.free) {
    const { left, right, top, bottom } = measurement.free;
    lines.push(row(
      "free",
      `left ${left} · right ${right} · top ${top} · bottom ${bottom}`,
    ));
  }
  lines.push(row("ink", `${Math.round(measurement.inkShare * 100)}%`));
  return lines.join("\n");
}
