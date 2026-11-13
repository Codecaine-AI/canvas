/**
 * The gap reviewers of a board: 1:1 crops of the gutters between sections,
 * with the label chips and wires in them. Round 4's label chip score fell
 * from 7.44 to 7.22: no reviewer saw the space between sections at full size.
 *
 * The crops are cut so that every label chip that lies outside all sections,
 * or within GAP_NEAR_PX of a section border, is whole in one crop or more.
 */
import type { WorldRect } from "./render.ts";
import {
  BORDER_NEAR_PX, borderRuns, bounds, closeLanes, grow, runsThrough, segmentsOf, sectionGaps, short, touches,
  type Board, type BoardObject, type ReviewUnit,
} from "./review-inputs.ts";
import type { WireFact } from "./wires.ts";

/** A chip this near a section border, inside or outside it, is a gap reviewer's. */
export const GAP_NEAR_PX = 40;
/** The most a crop spans, either way round: it is read at 1:1, so it stays near one screen. */
const WINDOW = { long: 1600, short: 1200 };
/** The board a crop shows round a chip. */
const RING = 48;
/** The least a crop spans: a chip alone says nothing about the border beside it. */
const MIN_CROP = { width: 480, height: 360 };
/** A gutter longer than this is cut into pieces before the crops are packed. */
const GUTTER_PIECE = 1000;
/** A gutter is cropped when this many wires or more run along it: its lanes are judged at full size. */
const GUTTER_WIRES_MIN = 2;
/** The crops one gap reviewer reads, and the most gap reviewers a board gets: a board with more crops gives each reviewer more. */
export const GAP_CROPS_PER_REVIEWER = 4;
export const GAP_MAX_REVIEWERS = 8;
/** Wires nearer than this on 2 lines are hard to tell apart, and so are chips nearer than this. */
const CLOSE_PX = 12;

const inside = (inner: WorldRect, outer: WorldRect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const between = (a: WorldRect, b: WorldRect) =>
  Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)));

/** The px from a box to the border of `section`: 0 when it lies on the border, else the distance from inside or outside. */
export function borderDistance(box: WorldRect, section: WorldRect): number {
  if (inside(box, section)) {
    return Math.min(box.x - section.x, box.y - section.y, section.x + section.width - (box.x + box.width), section.y + section.height - (box.y + box.height));
  }
  return touches(box, section) ? 0 : between(box, section);
}

const sectionsOf = (board: Board) => board.objects.filter((object) => object.type === "section" && object.geometry);

/**
 * The wires whose label chip a gap reviewer must see: the chip lies outside
 * every reviewed section (the page frame is not one), or within GAP_NEAR_PX of
 * the border of any section.
 */
export function gapChips(board: Board, pageFrame: BoardObject | null, facts: WireFact[]): WireFact[] {
  const sections = sectionsOf(board);
  const reviewed = sections.filter((section) => section !== pageFrame);
  return facts.filter((fact) => fact.chip && (
    !reviewed.some((section) => inside(fact.chip!, section.geometry))
    || sections.some((section) => borderDistance(fact.chip!, section.geometry) <= GAP_NEAR_PX)
  ));
}

const fits = (rect: WorldRect) =>
  (rect.width <= WINDOW.long && rect.height <= WINDOW.short) || (rect.width <= WINDOW.short && rect.height <= WINDOW.long);

/**
 * Pack `items` into as few crops as a greedy merge finds: the 2 groups whose
 * joint box is smallest join, while that box fits the window. The crops come
 * back in reading order.
 */
export function packCrops(items: WorldRect[]): WorldRect[] {
  const groups = items.map((item) => ({ ...item }));
  for (;;) {
    let best: { i: number; j: number; box: WorldRect; area: number } | null = null;
    for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) {
      const box = bounds([groups[i]!, groups[j]!]);
      const area = box.width * box.height;
      if (fits(box) && (!best || area < best.area)) best = { i, j, box, area };
    }
    if (!best) break;
    groups[best.i] = best.box;
    groups.splice(best.j, 1);
  }
  const grown = groups.map((group) => {
    const [width, height] = [Math.max(group.width, MIN_CROP.width), Math.max(group.height, MIN_CROP.height)];
    return { x: Math.round(group.x - (width - group.width) / 2), y: Math.round(group.y - (height - group.height) / 2), width: Math.round(width), height: Math.round(height) };
  });
  return grown.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The crops of a board's gap reviewers: one box round each chip of gapChips,
 * and each gutter between neighbour sections that 2 wires or more run along,
 * packed into windows.
 */
export function gapCrops(board: Board, pageFrame: BoardObject | null, units: ReviewUnit[], facts: WireFact[]): WorldRect[] {
  const chips = gapChips(board, pageFrame, facts).map((fact) => grow(fact.chip!, RING));
  const gutters = sectionGaps(units, facts).filter((gap) => gap.wires.length >= GUTTER_WIRES_MIN).flatMap((gap): WorldRect[] => {
    // The gutter with a strip of each section beside it, cut along its length.
    const box = gap.side === "side by side"
      ? { x: gap.gutter.x - RING, y: gap.gutter.y, width: gap.gutter.width + 2 * RING, height: gap.gutter.height }
      : { x: gap.gutter.x, y: gap.gutter.y - RING, width: gap.gutter.width, height: gap.gutter.height + 2 * RING };
    const length = gap.side === "side by side" ? box.height : box.width;
    const pieces = Math.max(1, Math.ceil(length / GUTTER_PIECE));
    return Array.from({ length: pieces }, (_, index) => gap.side === "side by side"
      ? { ...box, y: box.y + index * length / pieces, height: length / pieces }
      : { ...box, x: box.x + index * length / pieces, width: length / pieces });
  }).filter(fits);
  return packCrops([...chips, ...gutters]);
}

/** The gap reviewers of a board: GAP_CROPS_PER_REVIEWER crops each, or more when that gives over GAP_MAX_REVIEWERS reviewers. */
export function gapUnits(crops: WorldRect[]): ReviewUnit[] {
  const per = Math.max(GAP_CROPS_PER_REVIEWER, Math.ceil(crops.length / GAP_MAX_REVIEWERS));
  const units: ReviewUnit[] = [];
  for (let start = 0; start < crops.length; start += per) {
    const own = crops.slice(start, start + per);
    units.push({ id: `gap-${units.length + 1}`, kind: "gap", section: null, owned: [], inside: new Set(), rect: bounds(own), crops: own });
  }
  return units;
}

/** How many of a board's gap chips are whole in one crop or more. */
export function gapCoverage(board: Board, pageFrame: BoardObject | null, facts: WireFact[], crops: WorldRect[]): { chips: number; covered: number } {
  const chips = gapChips(board, pageFrame, facts);
  return { chips: chips.length, covered: chips.filter((fact) => crops.some((crop) => inside(fact.chip!, crop))).length };
}

/** The wires a crop shows: a part of the route or the label chip lies in it. */
export const wiresIn = (crop: WorldRect, facts: WireFact[]): WireFact[] =>
  facts.filter((fact) => (fact.chip && touches(fact.chip, crop)) || segmentsOf(fact.points).some((segment) => runsThrough(segment, crop)));

const box = (rect: WorldRect) => `x ${Math.round(rect.x)} to ${Math.round(rect.x + rect.width)}, y ${Math.round(rect.y)} to ${Math.round(rect.y + rect.height)}`;

/**
 * What a gap reviewer reads under one crop: the section borders in it, each
 * chip with its box and its distance to the nearest border, each wire with
 * its corners, and what the runner measured: wires along a border, wires too
 * close to tell apart, chips that crowd.
 */
export function gapCropLines(crop: WorldRect, board: Board, pageFrame: BoardObject | null, facts: WireFact[]): string[] {
  const sections = sectionsOf(board);
  const shown = wiresIn(crop, facts);
  const frame = (section: BoardObject) => section === pageFrame ? `board frame ${section.id}` : `section ${section.id}`;
  const chips = shown.filter((fact) => fact.chip && touches(fact.chip, crop));
  const chipLine = (fact: WireFact) => {
    const chip = fact.chip!;
    const nearest = sections.map((section) => ({ section, distance: borderDistance(chip, section.geometry) })).sort((a, b) => a.distance - b.distance)[0];
    const where = !nearest ? "no section on the board"
      : nearest.distance === 0 ? `ON the border of ${frame(nearest.section)}`
      : `${Math.round(nearest.distance)} px ${inside(chip, nearest.section.geometry) ? "inside" : "outside"} the border of ${frame(nearest.section)}`;
    return `chip ${JSON.stringify(short(fact.label, 40))} of ${fact.id} · ${box(chip)} (${Math.round(chip.width)}×${Math.round(chip.height)}) · ${where} · its wire is ${fact.length} px long`;
  };
  const crowded = chips.flatMap((a, index) => chips.slice(index + 1).filter((b) => between(a.chip!, b.chip!) < CLOSE_PX)
    .map((b) => `chips of ${a.id} and ${b.id} are ${Math.round(between(a.chip!, b.chip!))} px apart`));
  const within = (point: { x: number; y: number }) => touches({ x: point.x, y: point.y, width: 1, height: 1 }, crop);
  const stretchIn = (run: { from: { x: number; y: number }; to: { x: number; y: number } }) => runsThrough({ a: run.from, b: run.to }, crop);
  return [
    ...sections.filter((section) => touches(section.geometry, crop)).map((section) => `${frame(section)} ${JSON.stringify(short(section.text, 40))} · ${box(section.geometry)}`),
    ...chips.map(chipLine),
    ...shown.map((fact) => `wire ${fact.id} · ${fact.from} → ${fact.to} · corners ${fact.points.map((point) => `(${point.x}, ${point.y})`).join(" ")}${fact.points.some(within) ? "" : " (it passes through the crop)"}`),
    ...borderRuns(shown, sections).filter(stretchIn)
      .map((run) => `measured: ${run.wire} runs ${run.length} px at ${run.distance} px from the ${run.side} border of ${run.section} (a wire within ${BORDER_NEAR_PX} px of a border runs along it)`),
    ...closeLanes(shown, CLOSE_PX, 40).filter(stretchIn).map((lane) => `measured: ${lane.wire} and ${lane.other} run ${lane.length} px on 2 lines ${lane.distance} px apart`),
    ...crowded.map((line) => `measured: ${line}`),
  ];
}
