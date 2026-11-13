/**
 * What the runner measures on the plan of a board, in code. Ford: "this is
 * done, like, a programmatic way".
 *
 * Space: the empty blocks in the board frame and in each section, by area; a
 * section its content fills too little of; a gap wider than its rule number
 * allows. Wires: a band between rows or columns of sections too narrow for
 * the wires in it; a wire through a section that holds neither of its ends; a
 * long wire between 2 sections that are not neighbours.
 *
 * A measure that fails is a computed fault (computedFaults). The critic loop
 * sends it as a finding (critic-loop.ts), the space reviewer and the rethink
 * turn read it as a fact (critic.ts, rethink.ts).
 *
 * A band between sections no wider than its rule number is the room of its
 * wires: it is filled, so a board that spreads its sections to the rule gets
 * no empty block for it. A wider band is empty space like any other. Round 5
 * cycle 2 took every gutter up to 120 px over its number out as filled, and
 * the hole round one fell under the limit in pieces (h1: 1270 × 340 px).
 */
import type { WorldRect } from "./render.ts";
import {
  LONG_WIRE_PX, bounds, reviewUnits, runsOf, runsThrough, sectionGaps, segmentsOf, touches,
  type Board, type BoardObject, type Mark, type ReviewUnit, type SectionGap,
} from "./review-inputs.ts";
import type { Point, WireFact, WireModules } from "./wires.ts";

/** An empty block is a fault at this area or more with its short side this long or more, in the board frame and inside a section. */
export const EMPTY_BLOCK = { area: 120_000, short: 200 } as const;
/** A section is thin when its items fill under this share of the room inside its padding. */
export const THIN_FILL = 0.35;
/** A gap is too wide past its rule number plus this. */
export const GAP_SLACK_PX = 120;
/** A wire longer than this between 2 sections that are not neighbours is a fault. */
export const FAR_WIRE_PX = 1500;
/** A wire runs along a band when one straight run of it lies in the band for this many px. */
const ALONG_MIN_PX = 40;
/** The most empty blocks one frame or section gives. */
const MAX_HOLDER_BLOCKS = 4;
/** The most space faults a board reports: empty blocks, thin sections and gaps too wide. */
export const MAX_SPACE_FAULTS = 4;
/** The most wire faults a board reports: narrow bands, wires through a section and far wires. */
export const MAX_WIRE_FAULTS = 6;
/** What fixes an empty block or a thin section, and what does not. Round 5 cycle 2: the drawer widened a section (h6), turned a column into a row (06) and added stickies (08). */
export const SPACE_FIXES = "The allowed fixes: shrink the section or the frame, or move a neighbour in. Not a fix: widen a section, add a sticky, reverse a chain.";

const area = (rect: WorldRect) => rect.width * rect.height;
/** The area 2 rectangles share. */
const shared = (a: WorldRect, b: WorldRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** Whether `rect` holds half of `other` or more. */
const covers = (rect: WorldRect, other: WorldRect) => shared(rect, other) >= area(other) / 2;
/** Whether 2 empty blocks, or 2 bands, of different rounds are one fault: one holds half of the other. */
export const sameBlock = (a: WorldRect, b: WorldRect) => shared(a, b) >= Math.min(area(a), area(b)) / 2;
const centre = (rect: WorldRect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const SECTION = "section";

/** The largest rectangle of `region` that touches none of `filled` and that `big` accepts, or null. */
function largestEmpty(region: WorldRect, filled: WorldRect[], big: (rect: WorldRect) => boolean): WorldRect | null {
  const [right, bottom] = [region.x + region.width, region.y + region.height];
  const inside = filled.filter((rect) => touches(rect, region));
  const xs = [...new Set([region.x, right, ...inside.flatMap((rect) => [rect.x, rect.x + rect.width])])].filter((x) => x >= region.x && x <= right).sort((a, b) => a - b);
  let best: WorldRect | null = null;
  for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) {
    const [x, width] = [xs[i]!, xs[j]! - xs[i]!];
    const spans = inside.filter((rect) => rect.x < x + width && rect.x + rect.width > x).map((rect): [number, number] => [rect.y, rect.y + rect.height]).sort((a, b) => a[0] - b[0]);
    let cursor = region.y;
    for (const [from, to] of [...spans, [bottom, bottom] as [number, number]]) {
      const rect = { x, y: cursor, width, height: Math.min(from, bottom) - cursor };
      if (rect.height > 0 && (!best || area(rect) > area(best)) && big(rect)) best = rect;
      cursor = Math.max(cursor, to);
    }
  }
  return best;
}

/**
 * The empty rectangles of `region` that `big` accepts, largest first, `max`
 * at most. Each is clear of `filled` and of the ones before it, so an
 * L-shaped hole gives 2 blocks that do not overlap.
 */
export function emptyRects(region: WorldRect, filled: WorldRect[], big: (rect: WorldRect) => boolean, max = MAX_HOLDER_BLOCKS): WorldRect[] {
  const found: WorldRect[] = [];
  while (found.length < max) {
    const next = largestEmpty(region, [...filled, ...found], big);
    if (!next) break;
    found.push(next);
  }
  return found;
}

export interface EmptyBlock {
  /** The section that holds it, or the board frame's id, or null on a board with no frame. */
  in: string | null;
  frame: boolean;
  rect: WorldRect;
  /** `rect` from the corner of the frame or section that holds it: a section that moves takes its block along. */
  local: WorldRect;
  /** Its share of the frame or section that holds it. */
  share: number;
}

const localIn = (holder: WorldRect, rect: WorldRect) => ({ ...rect, x: rect.x - holder.x, y: rect.y - holder.y });
const big = (rect: WorldRect) => area(rect) >= EMPTY_BLOCK.area && Math.min(rect.width, rect.height) >= EMPTY_BLOCK.short;
/** The frame of a board: the page frame, or the bounds of what sits at the root. */
function frameOf(board: Board, pageFrame: BoardObject | null): WorldRect | null {
  if (pageFrame) return pageFrame.geometry;
  const top = board.objects.filter((object) => object.geometry && !object.parentId);
  return top.length ? bounds(top.map((object) => object.geometry)) : null;
}

/**
 * The empty blocks of a board at the limit or over it, largest first. In the
 * board frame, the sections, the loose nodes and the stickies are filled. In
 * a section, its direct children are. A wire fills nothing.
 */
export function emptyBlocks(board: Board, pageFrame: BoardObject | null, gaps: GapMeasure[]): EmptyBlock[] {
  const placed = board.objects.filter((object) => object.geometry);
  // A band no wider than its rule number is the room of its wires, filled like a section. A wider one is empty, whatever runs in it.
  const room = (holder: string | null) => gaps.filter((gap) => gap.parent === holder && gap.gap <= gap.lineNeed).map((gap) => gap.band);
  const frame = frameOf(board, pageFrame);
  if (!frame) return [];
  const top = placed.filter((object) => object !== pageFrame && (!object.parentId || object.parentId === pageFrame?.id));
  const blockIn = (holder: WorldRect, rect: WorldRect) => ({ rect, local: localIn(holder, rect), share: area(rect) / area(holder) });
  const inFrame = emptyRects(frame, [...top.map((object) => object.geometry), ...room(pageFrame?.id ?? null)], big)
    .map((rect): EmptyBlock => ({ in: pageFrame?.id ?? null, frame: true, ...blockIn(frame, rect) }));
  const inSections = placed.filter((object) => object.type === SECTION && object !== pageFrame).flatMap((section) =>
    emptyRects(section.geometry, [...placed.filter((object) => object.parentId === section.id).map((object) => object.geometry), ...room(section.id)], big)
      .map((rect): EmptyBlock => ({ in: section.id, frame: false, ...blockIn(section.geometry, rect) })));
  return [...inFrame, ...inSections].sort((a, b) => area(b.rect) - area(a.rect));
}

/** A section its items fill too little of. */
export interface ThinSection {
  id: string;
  rect: WorldRect;
  /** The room inside its padding and under its title band. */
  inner: { width: number; height: number };
  /** Its direct children: nodes, subsections and stickies. */
  items: number;
  /** The share of `inner` they fill. */
  fill: number;
  /** The px² of `inner` they leave empty. */
  empty: number;
}

/**
 * The sections whose direct children fill under THIN_FILL of the room inside
 * them, emptiest first. The room is the section less the frame padding on
 * each side and one more padding for the title band: the margins `arrange`
 * leaves. Against the whole area, a fitted row of 3 nodes at the engine's row
 * gap fills 29%, and 47 of the 161 sections of round 5 cycle 2 fall under
 * 35%. Against the room, one does: the section of h6 that 3 nodes fill 29% of.
 */
export function thinSections(board: Board, pageFrame: BoardObject | null, padding: number): ThinSection[] {
  return board.objects.filter((object) => object.type === SECTION && object.geometry && object !== pageFrame).flatMap((section): ThinSection[] => {
    const items = board.objects.filter((object) => object.geometry && object.parentId === section.id);
    const inner = { width: section.geometry.width - 2 * padding, height: section.geometry.height - 3 * padding };
    if (items.length === 0 || inner.width <= 0 || inner.height <= 0) return [];
    const filled = items.reduce((sum, object) => sum + area(object.geometry), 0);
    const fill = filled / area({ x: 0, y: 0, ...inner });
    return fill < THIN_FILL ? [{ id: section.id, rect: section.geometry, inner, items: items.length, fill, empty: area({ x: 0, y: 0, ...inner }) - filled }] : [];
  }).sort((a, b) => b.empty - a.empty);
}

/** The numbers of the gap rule (packages/canvas authoring/rules.ts, topic `rules`). */
export interface GapRule {
  /** The gap for one plain wire: CRAFT_TARGETS.sectionGutterSideBySide. */
  base: number;
  /** SECTION_GAP_PER_WIRE: the room of each wire after the first. */
  perWire: number;
  /** LABEL_LEG: the length a horizontal leg needs for its label. */
  labelBase: number;
  labelPerCharacter: number;
  /**
   * The room a label adds to its wire's lane: the chip's height on the grid,
   * less the lane the wire has. Topic `rules` prints the same number.
   */
  perLabel: number;
  /** CRAFT_TARGETS.framePadding: what a section leaves round its content. */
  padding: number;
}

export const gapRule = ({ rules, craft, geometry, grid }: Pick<WireModules, "rules" | "craft" | "geometry" | "grid">): GapRule => ({
  base: craft.CRAFT_TARGETS.sectionGutterSideBySide, perWire: rules.SECTION_GAP_PER_WIRE, labelBase: rules.LABEL_LEG.base, labelPerCharacter: rules.LABEL_LEG.perCharacter,
  perLabel: Math.ceil(geometry.CHIP_HEIGHT / grid.AGENT_GRID) * grid.AGENT_GRID - rules.SECTION_GAP_PER_WIRE,
  padding: craft.CRAFT_TARGETS.framePadding,
});

export interface GapMeasure extends SectionGap {
  /** The section that holds the pair, or null at the root. */
  parent: string | null;
  /**
   * The gutter drawn out along its row (stacked) or column (side by side), to
   * the next section that reaches into it and no further than sections lie
   * on both sides. Every pair along a row of sections shares the band under it.
   */
  band: WorldRect;
  /** The wires that cross the band or run along it: the ones the rule counts. */
  counted: string[];
  /** How many of them carry a label. */
  labelled: number;
  /** The room the rule gives the first of them: its base, or the length a label leg needs. */
  first: number;
  /** The rule number of this gap for the wires of its band. */
  need: number;
  /** The widest need of the gaps in its row (side by side) or column (stacked): one `arrange` call sets one gap for them all. */
  lineNeed: number;
  /** Whether the gap rule sets this gap: the pair sits in the board frame. `arrange_section` sets a gap inside a section. */
  ruled: boolean;
  /** under: it is narrower than `need` by the room of one wire or more. over: nothing sits in it and it is wider than `lineNeed` + GAP_SLACK_PX. Null for a gap the rule does not set. */
  fault: "under" | "over" | null;
}

/**
 * Each gap between neighbour sections against the gap rule: the base, plus
 * the step for each wire after the first, plus the room of each label. The
 * count is every wire that crosses the band or runs along it, whichever
 * sections it joins and at whichever pair it crosses (topic `rules`: "every
 * wire that crosses it or runs along it, from every pair of sections"):
 * round 5 cycle 2 counted one pair's wires, and a band between 2 rows held
 * the wires of every pair (h1: 9 wires in 200 px). A side-by-side gap that a
 * labelled wire crosses starts from the length its label leg needs. The rule
 * sets the gaps of the sections in the board frame (`pageFrame`, or the
 * root): topic `rules` leaves a gap inside a section to `arrange_section`.
 */
export function gapMeasures(board: Board, units: ReviewUnit[], facts: WireFact[], rule: GapRule, pageFrame: string | null): GapMeasure[] {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const parentOf = (id: string) => byId.get(id)?.parentId ?? null;
  const sections = board.objects.filter((object) => object.type === SECTION && object.geometry);
  const bandOf = (gap: SectionGap, parent: string | null): WorldRect => {
    const stacked = gap.side === "stacked";
    // `low` to `high` across the band, `from` to `to` along it.
    const ranges = (rect: WorldRect) => stacked ? [rect.y, rect.y + rect.height, rect.x, rect.x + rect.width] as const : [rect.x, rect.x + rect.width, rect.y, rect.y + rect.height] as const;
    const [low, high, from, to] = ranges(gap.gutter);
    const holder = parent ? byId.get(parent)?.geometry : frameOf(board, null);
    let [start, end] = holder ? [Math.min(ranges(holder)[2], from), Math.max(ranges(holder)[3], to)] : [from, to];
    const siblings = sections.filter((other) => (other.parentId ?? null) === parent).map((other) => ranges(other.geometry));
    for (const [otherLow, otherHigh, otherFrom, otherTo] of siblings) {
      if (otherLow >= high || otherHigh <= low) continue;
      if (otherTo <= from) start = Math.max(start, otherTo);
      else if (otherFrom >= to) end = Math.min(end, otherFrom);
    }
    // A band runs as far as sections lie on both sides of it: past the last section of either side it is a corner of the frame, and no lane.
    const beside = (side: (range: readonly number[]) => boolean) => siblings.filter((range) => side(range) && range[2]! < end && range[3]! > start);
    const [before, after] = [beside((range) => range[1]! <= low), beside((range) => range[0]! >= high)];
    start = Math.max(start, Math.min(...before.map((range) => range[2]!)), Math.min(...after.map((range) => range[2]!)));
    end = Math.min(end, Math.max(...before.map((range) => range[3]!)), Math.max(...after.map((range) => range[3]!)));
    return stacked ? { x: start, y: low, width: end - start, height: high - low } : { x: low, y: start, width: high - low, height: end - start };
  };
  // The rule is for sections that share a parent: a subsection and a section outside its parent are not a row.
  const measured = sectionGaps(units, facts).filter((gap) => parentOf(gap.a) === parentOf(gap.b)).map((gap) => {
    const parent = parentOf(gap.a);
    const band = bandOf(gap, parent);
    const stacked = gap.side === "stacked";
    const [low, high, from, to] = stacked ? [band.y, band.y + band.height, band.x, band.x + band.width] : [band.x, band.x + band.width, band.y, band.y + band.height];
    // A run from one side of the band into it crosses it, at this pair or at another one. A run the other way runs along it.
    const counted = facts.filter((fact) => segmentsOf(fact.points).some((segment) => runsThrough(segment, gap.gutter))
      || runsOf(fact.points).some((run) => run.axis === (stacked ? "v" : "h") ? run.fixed > from && run.fixed < to && run.from < high - 1 && run.to > low + 1
        : run.fixed > low && run.fixed < high && Math.min(run.to, to) - Math.max(run.from, from) >= ALONG_MIN_PX));
    // A labelled wire crosses a side-by-side gap when one horizontal run of it spans the gutter and its chip sits in it.
    const labels = stacked ? [] : counted.filter((fact) => fact.label && fact.chip && touches(fact.chip, gap.gutter)
      && runsOf(fact.points).some((run) => run.axis === "h" && run.from <= low && run.to >= high));
    const first = Math.max(rule.base, ...labels.map((fact) => rule.labelBase + rule.labelPerCharacter * fact.label.length));
    const clear = !board.objects.some((object) => object.geometry && (object.parentId ?? null) === parent && object.id !== gap.a && object.id !== gap.b && touches(object.geometry, gap.gutter));
    const labelled = counted.filter((fact) => fact.label).length;
    return { ...gap, parent, band, clear, counted: counted.map((fact) => fact.id), labelled, first, need: first + rule.perWire * Math.max(0, counted.length - 1) + rule.perLabel * labelled };
  });
  return measured.map((gap): GapMeasure => {
    // The gaps of one row or column: the same way round, with gutters that share a stretch of the other axis.
    const line = measured.filter((other) => other.parent === gap.parent && other.side === gap.side && (gap.side === "side by side"
      ? other.gutter.y < gap.gutter.y + gap.gutter.height && other.gutter.y + other.gutter.height > gap.gutter.y
      : other.gutter.x < gap.gutter.x + gap.gutter.width && other.gutter.x + other.gutter.width > gap.gutter.x));
    const lineNeed = Math.max(...line.map((other) => other.need));
    const { clear, ...rest } = gap;
    const ruled = gap.parent === pageFrame;
    // A fitted section is off the grid by a few px: a band short by less than one wire's room has a lane for each wire.
    return { ...rest, lineNeed, ruled, fault: !ruled ? null : gap.need - gap.gap >= rule.perWire ? "under" : clear && gap.gap > lineNeed + GAP_SLACK_PX ? "over" : null };
  });
}

/** A band too narrow for its wires: the gaps under their number whose bands overlap, as one fault. */
export interface NarrowBand {
  /** The gap that is the most under its number. Its band, wires and numbers are the fault's. */
  worst: GapMeasure;
  /** The sections on the 2 sides of the band, over all its gaps. */
  sections: string[];
}

/** The bands under their rule number, most px short first. */
export function narrowBands(gaps: GapMeasure[]): NarrowBand[] {
  const short = (gap: GapMeasure) => gap.need - gap.gap;
  const bands: NarrowBand[] = [];
  for (const gap of gaps.filter((each) => each.fault === "under").sort((a, b) => short(b) - short(a))) {
    const same = bands.find(({ worst }) => worst.side === gap.side && worst.parent === gap.parent && shared(worst.band, gap.band) > 0);
    if (same) same.sections = [...new Set([...same.sections, gap.a, gap.b])];
    else bands.push({ worst: gap, sections: [gap.a, gap.b] });
  }
  return bands;
}

/** A wire between 2 sections, as the plan reads it. */
export interface Link {
  fact: WireFact;
  /** The 2 sections it joins: the ones that hold its ends and share a parent. */
  a: string;
  b: string;
  /** The section that holds both, or null at the root. */
  parent: string | null;
  /** Whether `a` and `b` face each other across one gap. */
  neighbours: boolean;
  /** The sections beside `a` and `b` that lie on the line between their centres. */
  between: string[];
  /** The sections it runs through that hold neither of its ends, outermost only (sectionsThrough). */
  through: string[];
}

/** An object's id, then the ids of the sections that hold it, innermost first. */
const chainIn = (byId: Map<string, BoardObject>) => (id: string): string[] => {
  const ids: string[] = [];
  for (let at = byId.get(id); at && !ids.includes(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) ids.push(at.id);
  return ids;
};

/**
 * The sections a wire runs through that hold neither of its ends, outermost
 * only. It reads any wire: one between 2 sections, one with a loose end, one
 * inside a section. The engine's own run of the wire against each section's
 * frame: wires.ts lists the boxes a wire breaks the routing rule on, and a
 * routed wire through a foreign section breaks none (h1 w-treespend).
 */
export function sectionsThrough(board: Board, pageFrame: BoardObject | null): (fact: WireFact) => string[] {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const chain = chainIn(byId);
  const sections = board.objects.filter((object) => object.type === SECTION && object.geometry && object !== pageFrame);
  return (fact) => {
    // An end that is no object of the board: the sections that hold it are unknown.
    if (!byId.has(fact.from) || !byId.has(fact.to)) return [];
    const held = new Set([...chain(fact.from), ...chain(fact.to)]);
    const crossed = sections.filter((section) => !held.has(section.id) && segmentsOf(fact.points).some((segment) => runsThrough(segment, section.geometry)));
    return crossed.filter((section) => !crossed.some((outer) => outer.id === section.parentId)).map((section) => section.id);
  };
}

/** A wire that runs through one section or more that hold neither of its ends. */
export interface Through { fact: WireFact; sections: string[] }

/**
 * Every wire that joins 2 sections. A wire with a loose end, or between a
 * section and one it holds, joins none.
 */
export function sectionLinks(board: Board, facts: WireFact[], gaps: GapMeasure[], pageFrame: BoardObject | null): Link[] {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const chain = chainIn(byId);
  const through = sectionsThrough(board, pageFrame);
  const sections = board.objects.filter((object) => object.type === SECTION && object.geometry && object !== pageFrame);
  const pair = (a: string, b: string) => [a, b].sort().join("\n");
  const facing = new Set(gaps.map((gap) => pair(gap.a, gap.b)));
  return facts.flatMap((fact): Link[] => {
    const [from, to] = [chain(fact.from), chain(fact.to)];
    let [i, j] = [from.length - 1, to.length - 1];
    while (i >= 0 && j >= 0 && from[i] === to[j]) [i, j] = [i - 1, j - 1];
    const [a, b] = [byId.get(from[i] ?? ""), byId.get(to[j] ?? "")];
    if (a?.type !== SECTION || b?.type !== SECTION || !a.geometry || !b.geometry) return [];
    const parent = from[i + 1] ?? null;
    const line = { a: centre(a.geometry), b: centre(b.geometry) };
    return [{
      fact, a: a.id, b: b.id, parent, neighbours: facing.has(pair(a.id, b.id)),
      between: sections.filter((section) => section !== a && section !== b && (section.parentId ?? null) === parent && runsThrough(line, section.geometry)).map((section) => section.id),
      through: through(fact),
    }];
  });
}

/** A swap of 2 sibling sections worth this many px of wire or more is named. */
const SWAP_MIN_PX = 200;

/**
 * The swap of one of a link's 2 sections with a sibling that shortens the
 * wires between sections the most, by section centres, or null when none
 * brings the 2 closer and saves SWAP_MIN_PX. An estimate: the sections differ
 * in size, and the router has the last word.
 */
function bestSwap(link: Link, links: Link[], board: Board): { a: string; b: string; saves: number } | null {
  const siblings = board.objects.filter((object) => object.type === SECTION && object.geometry && (object.parentId ?? null) === link.parent);
  const place = new Map(siblings.map((section) => [section.id, centre(section.geometry)]));
  const among = links.filter((each) => each.parent === link.parent);
  const far = (at: Map<string, Point>, a: string, b: string) => Math.abs(at.get(a)!.x - at.get(b)!.x) + Math.abs(at.get(a)!.y - at.get(b)!.y);
  const total = (at: Map<string, Point>) => among.reduce((sum, each) => sum + far(at, each.a, each.b), 0);
  let best: { a: string; b: string; saves: number } | null = null;
  for (const end of [link.a, link.b]) for (const other of siblings) {
    if (other.id === link.a || other.id === link.b) continue;
    const swapped = new Map(place).set(end, place.get(other.id)!).set(other.id, place.get(end)!);
    const saves = Math.round(total(place) - total(swapped));
    if (far(swapped, link.a, link.b) < far(place, link.a, link.b) && saves >= SWAP_MIN_PX && saves > (best?.saves ?? 0)) best = { a: end, b: other.id, saves };
  }
  return best;
}

const list = (ids: string[]) => ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;

/** A wire between 2 sections as one line of facts: its length now, its 2 sections, the sections between them, and the swap that shortens it. */
export function linkLine(link: Link, links: Link[], board: Board): string {
  const swap = link.neighbours ? null : bestSwap(link, links, board);
  return `${link.fact.id} is ${link.fact.length} px now, ${link.a} → ${link.b}`
    + (link.neighbours ? ", neighbours" : `, not neighbours${link.between.length ? `: ${list(link.between)} ${link.between.length === 1 ? "lies" : "lie"} between them` : ""}`)
    + (link.through.length ? `; it runs through ${list(link.through)}` : "")
    + (swap ? `; by section centres, a swap of ${swap.a} and ${swap.b} saves about ${swap.saves} px of wire between sections` : "");
}

/** A wire through a section as one line of facts: linkLine when it joins 2 sections, and its 2 ends when it joins none. */
function throughLine({ fact, sections }: Through, links: Link[], board: Board): string {
  const link = links.find((each) => each.fact === fact);
  return link ? linkLine(link, links, board) : `${fact.id} is ${fact.length} px now, ${fact.from} → ${fact.to}; it runs through ${list(sections)}`;
}

/**
 * What the loop needs to judge a decline of a layout finding (critic-loop.ts):
 * which sections a finding's items sit in, and the facts of each wire whose
 * fault is where the sections sit.
 */
export interface LayoutFacts {
  /** Each section's title, by id. */
  sections: Record<string, string>;
  /** Each object and wire on the board: the sections that hold it. A wire's are the sections that hold its ends, that lie between them and that it runs through. The board frame is none. */
  holders: Record<string, string[]>;
  /** Each wire between 2 sections that crosses a wire or is over LONG_WIRE_PX, and each wire that runs through a section that holds neither of its ends: its line of facts (linkLine, throughLine). */
  wires: Record<string, string>;
}

export function layoutFacts(board: Board, facts: WireFact[], links: Link[], through: Through[], pageFrame: BoardObject | null): LayoutFacts {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const holders = (id: string): string[] => {
    const ids: string[] = [];
    for (let at = byId.get(id); at && !ids.includes(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) if (at.type === SECTION && at !== pageFrame) ids.push(at.id);
    return ids;
  };
  const linkOf = new Map(links.map((link) => [link.fact.id, link]));
  const throughOf = new Map(through.map((each) => [each.fact.id, each.sections]));
  return {
    sections: Object.fromEntries(board.objects.filter((object) => object.type === SECTION && object !== pageFrame).map((section) => [section.id, section.text ?? ""])),
    holders: Object.fromEntries<string[]>([
      ...board.objects.map((object): [string, string[]] => [object.id, holders(object.id)]),
      ...facts.map((fact): [string, string[]] => {
        const link = linkOf.get(fact.id);
        return [fact.id, [...new Set([...holders(fact.from), ...holders(fact.to), ...(link?.between ?? []), ...(throughOf.get(fact.id) ?? [])])]];
      }),
    ]),
    wires: Object.fromEntries([
      ...through.map((each): [string, string] => [each.fact.id, throughLine(each, links, board)]),
      ...links.filter(({ fact }) => fact.crosses.length > 0 || fact.length > LONG_WIRE_PX).map((link): [string, string] => [link.fact.id, linkLine(link, links, board)]),
    ]),
  };
}

/** A measure of the board that fails: a finding the loop holds until the measure passes. */
export interface ComputedFault {
  /** space: an empty block, a thin section, a gap too wide. wire: a narrow band, a wire through a section, a far wire. A decline closes a wire fault only with a section move (critic-loop.ts). */
  kind: "space" | "wire";
  /** What makes it the same fault in a later round: the measure and the items, never the numbers. 2 empty blocks of one frame or section share it, and so do 2 bands: `block` tells them apart. */
  key: string;
  /** An empty block's or a band's place in its frame or section. A later round's is the same fault when one of the 2 holds half of the other (critic-loop.ts). */
  block?: WorldRect;
  /** The sections it names, then the wires. */
  ids: string[];
  problem: string;
  /** A wire fault as it stands this round, in one line: the loop adds it when the fault comes back after a decline with no section move. */
  facts?: string;
  marks: Mark[];
}

const span = (rect: WorldRect) => `x ${Math.round(rect.x)} to ${Math.round(rect.x + rect.width)}, y ${Math.round(rect.y)} to ${Math.round(rect.y + rect.height)}`;
const size = (rect: { width: number; height: number }) => `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pathOf = (fact: WireFact): Mark => ({ path: fact.points.map((point): [number, number] => [point.x, point.y]) });
/** The most wires a wire fault marks on the board. */
const MAX_MARKED = 4;

/** An empty block as one line of facts. */
export function blockLine(block: EmptyBlock): string {
  return `${size(block.rect)} empty at ${span(block.rect)}, ${block.frame ? `in the board frame (${percent(block.share)} of it)` : `inside section ${block.in} (${percent(block.share)} of it)`}`;
}

/** A gap as one line of facts, with its rule number. */
export function gapLine(gap: GapMeasure): string {
  const verdict = gap.fault === "under" ? `UNDER its number by ${gap.need - gap.gap} px`
    : gap.fault === "over" ? `OVER its number + ${GAP_SLACK_PX} by ${gap.gap - gap.lineNeed - GAP_SLACK_PX} px` : "within its number";
  const band = gap.side === "stacked" ? `x ${Math.round(gap.band.x)} to ${Math.round(gap.band.x + gap.band.width)}` : `y ${Math.round(gap.band.y)} to ${Math.round(gap.band.y + gap.band.height)}`;
  return [
    `${gap.a} ↔ ${gap.b}`, gap.side, `gap ${gap.gap} px`, `gutter ${span(gap.gutter)}`, `band ${band}`,
    `${count(gap.counted.length, "wire crosses it or runs", "wires cross it or run")} along its band`, count(gap.chips, "label chip in it", "label chips in it"),
    ...(gap.ruled
      ? [`rule number ${gap.need} px${gap.lineNeed > gap.need ? ` (its ${gap.side === "side by side" ? "row" : "column"}'s widest pair: ${gap.lineNeed} px)` : ""}`, verdict]
      : [`inside section ${gap.parent}: \`arrange_section\` sets it, not the gap rule`]),
  ].join(" · ");
}

/** What the runner measured on a board, before the caps. */
interface Measures { board: Board; rule: GapRule; gaps: GapMeasure[]; blocks: EmptyBlock[]; thin: ThinSection[]; bands: NarrowBand[]; links: Link[]; through: Through[] }

/** The space faults, most empty px² first: the thin sections and the empty blocks outside them, then the gaps too wide. */
function spaceFaults({ gaps, blocks, thin }: Measures): ComputedFault[] {
  const limit = `The limit is ${EMPTY_BLOCK.area.toLocaleString("en-US")} px² with a short side of ${EMPTY_BLOCK.short} px.`;
  const empty: Array<{ px: number; fault: ComputedFault }> = [
    ...thin.map((section) => {
      // The blocks of a thin section are its own fault, named once.
      const largest = blocks.find((block) => block.in === section.id);
      return { px: section.empty, fault: {
        kind: "space" as const, key: JSON.stringify(["thin", section.id]), ids: [section.id],
        problem: `Section ${section.id} is ${size(section.rect)} and its ${count(section.items, "item fills", "items fill")} ${percent(section.fill)} of the ${size(section.inner)} inside its padding and title band:`
          + ` the limit is ${percent(THIN_FILL)}.${largest ? ` Its largest empty block is ${size(largest.rect)} at ${span(largest.rect)}.` : ""} ${SPACE_FIXES}`,
        marks: [{ box: largest?.rect ?? section.rect }],
      } };
    }),
    ...blocks.filter((block) => !thin.some((section) => section.id === block.in)).map((block) => ({ px: area(block.rect), fault: {
      kind: "space" as const, key: JSON.stringify(["empty-block", block.in ?? "board"]), block: block.local, ids: block.in ? [block.in] : [],
      problem: `An empty block of ${size(block.rect)} sits ${block.frame ? "in the board frame" : `inside section ${block.in}`} at ${span(block.rect)}:`
        + ` ${percent(block.share)} of the ${block.frame ? "frame holds no section, node or sticky" : "section holds nothing"}. ${limit} ${SPACE_FIXES}`,
      marks: [{ box: block.rect }],
    } })),
  ];
  // An empty block that covers a gap too wide says it: the gap is not a second fault.
  const wide = gaps.filter((gap) => gap.fault === "over" && !blocks.some((block) => covers(block.rect, gap.gutter))).sort((a, b) => b.gap - b.lineNeed - (a.gap - a.lineNeed))
    .map((gap): ComputedFault => ({
      kind: "space", key: JSON.stringify(["gap", "over", [gap.a, gap.b].sort()]), ids: [gap.a, gap.b],
      problem: `The gap between ${gap.a} and ${gap.b} (${gap.side}) is ${gap.gap} px wide and ${count(gap.counted.length, "wire crosses it or runs", "wires cross it or run")} along its band:`
        + ` the gap rule asks ${gap.lineNeed} px${gap.lineNeed > gap.need ? ` for the widest pair of its ${gap.side === "side by side" ? "row" : "column"}` : ""},`
        + ` so it is ${gap.gap - gap.lineNeed} px wider than its number, and the limit is ${GAP_SLACK_PX} px wider`,
      marks: [{ box: gap.gutter }],
    }));
  return [...empty.sort((a, b) => b.px - a.px).map(({ fault }) => fault), ...wide].slice(0, MAX_SPACE_FAULTS);
}

/**
 * The wire faults: the narrow bands (most px short first), the sections a
 * wire runs through (most wires first) and the far wires by section pair
 * (longest first), one of each in turn, MAX_WIRE_FAULTS at most.
 */
function wireFaults({ board, rule, bands, links, through }: Measures): ComputedFault[] {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const factOf = new Map(links.map((link) => [link.fact.id, link]));
  const longest = (a: { fact: WireFact }, b: { fact: WireFact }) => b.fact.length - a.fact.length;
  const narrow = bands.map(({ worst, sections }): ComputedFault => {
    const stacked = worst.side === "stacked";
    const holder = worst.parent ? byId.get(worst.parent)?.geometry : undefined;
    const before = (id: string) => { const rect = byId.get(id)!.geometry; return stacked ? rect.y + rect.height <= worst.band.y : rect.x + rect.width <= worst.band.x; };
    const [near, far] = [sections.filter(before), sections.filter((id) => !before(id))];
    const across = stacked ? `y ${Math.round(worst.band.y)} to ${Math.round(worst.band.y + worst.band.height)}` : `x ${Math.round(worst.band.x)} to ${Math.round(worst.band.x + worst.band.width)}`;
    // A wire of the band that joins no section beside it: its sections sit apart, and the band pays for it.
    const passing = worst.counted.filter((id) => { const link = factOf.get(id); return link && !(sections.includes(link.a) && sections.includes(link.b)); });
    return {
      kind: "wire", key: JSON.stringify(["band", worst.side, worst.parent ?? "board"]), block: holder ? localIn(holder, worst.band) : worst.band, ids: [...sections, ...worst.counted],
      problem: `The band between ${list(near)} (${stacked ? "above" : "left"}) and ${list(far)} (${stacked ? "below" : "right"}), ${across}, is ${worst.gap} px wide and`
        + ` ${count(worst.counted.length, "wire crosses it or runs", "wires cross it or run")} along it: ${worst.counted.join(", ")}.`
        + ` The gap rule asks ${worst.need} px for them (${worst.first} px, plus ${rule.perWire} px for each wire after the first${worst.labelled ? `, plus ${rule.perLabel} px for each of the ${worst.labelled} with a label` : ""}), so the band is ${worst.need - worst.gap} px too narrow`,
      facts: `the band is ${worst.gap} px wide now with ${count(worst.counted.length, "wire", "wires")}, and it needs ${worst.need} px`
        + (passing.length ? `; ${count(passing.length, "of them joins", "of them join")} a section that is not beside the band: ${passing.map((id) => `${id} (${factOf.get(id)!.a} → ${factOf.get(id)!.b})`).join(", ")}` : ""),
      marks: [{ box: worst.band }],
    };
  });
  // Each key's items, longest wire first: a wire through 2 sections is under both.
  const group = <T extends { fact: WireFact }>(among: T[], keys: (item: T) => string[]): Array<[string, T[]]> => {
    const groups = new Map<string, T[]>();
    for (const item of among) for (const key of keys(item)) groups.set(key, [...(groups.get(key) ?? []), item]);
    return [...groups].map(([key, items]) => [key, items.sort(longest)]);
  };
  const wire = ({ fact }: Through) => { const link = factOf.get(fact.id); return `${fact.id} (${link ? `${link.a} → ${link.b}` : `${fact.from} → ${fact.to}`}, ${fact.length} px)`; };
  const crossed = group(through, (each) => each.sections).sort(([, a], [, b]) => b.length - a.length || longest(a[0]!, b[0]!)).map(([section, group]): ComputedFault => ({
    kind: "wire", key: JSON.stringify(["through", section]), ids: [section, ...group.map(({ fact }) => fact.id)],
    problem: `${count(group.length, "wire runs", "wires run")} through section ${section}, which holds neither end of ${group.length === 1 ? "it" : "them"}: ${group.map(wire).join(", ")}`,
    facts: throughLine(group[0]!, links, board),
    marks: [{ box: byId.get(section)!.geometry }, ...group.slice(0, MAX_MARKED).map(({ fact }) => pathOf(fact))],
  }));
  const far = group(links.filter((link) => link.fact.length > FAR_WIRE_PX && !link.neighbours), (link) => [[link.a, link.b].sort().join("\n")])
    .sort(([, a], [, b]) => longest(a[0]!, b[0]!)).map(([, group]): ComputedFault => {
      const { a, b, between } = group[0]!;
      return {
        kind: "wire", key: JSON.stringify(["long", [a, b].sort()]), ids: [...[a, b].sort(), ...group.map((link) => link.fact.id)],
        problem: `${count(group.length, "wire", "wires")} over ${FAR_WIRE_PX} px ${group.length === 1 ? "joins" : "join"} sections ${a} and ${b}, which are not neighbours`
          + `${between.length ? ` (${list(between)} ${between.length === 1 ? "lies" : "lie"} between them)` : ""}: ${group.map((link) => `${link.fact.id} (${link.fact.length} px)`).join(", ")}`,
        facts: linkLine(group[0]!, links, board),
        marks: group.slice(0, MAX_MARKED).map((link) => pathOf(link.fact)),
      };
    });
  const kinds = [narrow, crossed, far];
  const turns = Math.max(...kinds.map((faults) => faults.length));
  return Array.from({ length: turns }, (_, turn) => kinds.flatMap((faults) => faults[turn] ?? [])).flat().slice(0, MAX_WIRE_FAULTS);
}

/** The measures of a board that fail, as faults: the space faults, then the wire faults, each under its cap. */
export function computedFaults(measures: Measures): ComputedFault[] {
  return [...spaceFaults(measures), ...wireFaults(measures)];
}

/** What the runner measures on the plan of a board. `blocks`, `thin` and `bands` are whole: `faults` holds the ones under the caps. */
export interface Plan extends Omit<Measures, "board" | "rule"> { pageFrame: BoardObject | null; units: ReviewUnit[]; faults: ComputedFault[]; layout: LayoutFacts }

export function planOf(board: Board, facts: WireFact[], rule: GapRule): Plan {
  const { pageFrame, units } = reviewUnits(board);
  const gaps = gapMeasures(board, units, facts, rule, pageFrame?.id ?? null);
  const links = sectionLinks(board, facts, gaps, pageFrame);
  const throughOf = sectionsThrough(board, pageFrame);
  const through = facts.flatMap((fact): Through[] => { const sections = throughOf(fact); return sections.length ? [{ fact, sections }] : []; });
  const measures: Measures = { board, rule, gaps, blocks: emptyBlocks(board, pageFrame, gaps), thin: thinSections(board, pageFrame, rule.padding), bands: narrowBands(gaps), links, through };
  const { board: _, rule: __, ...rest } = measures;
  return { pageFrame, units, ...rest, faults: computedFaults(measures), layout: layoutFacts(board, facts, links, through, pageFrame) };
}
