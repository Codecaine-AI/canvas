/**
 * What the runner measures on the plan of a board, in code. Ford: "this is
 * done, like, a programmatic way".
 *
 * Space: the empty blocks in the board frame and in each section, by area; a
 * section its content fills too little of; a band wider than its need
 * allows. Wires: a band too narrow for its lanes; a wire through a section
 * that holds neither of its ends; a long wire between 2 sections that are
 * not neighbours.
 *
 * A measure that fails is a computed fault (planOf). The critic loop
 * sends it as a finding (critic-loop.ts), the space reviewer and the rethink
 * turn read it as a fact (critic.ts, rethink.ts).
 *
 * A band is the gap between 2 neighbour sections, over the span the 2 share
 * (topic `rules`). It gets one finding at most: too narrow or too wide. It is
 * never an empty block as well. Round 5 cycle 3 read a band the rule asked
 * for as an empty block of 120,000 px², and the drawer could settle neither
 * (stuck stops on 10, 14, h1 and h3).
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
/** A wire longer than this between 2 sections that are not neighbours is a fault. */
export const FAR_WIRE_PX = 1500;
/** A band that needs more than this holds too many lanes: its finding says to reorder sections, not to widen. The engine's BAND_NEED_MAX wins when it has one. */
const BAND_NEED_MAX_PX = 400;
/** The most empty blocks one frame or section gives. */
const MAX_HOLDER_BLOCKS = 4;
/** The most space faults a board reports: empty blocks, thin sections and bands too wide. */
export const MAX_SPACE_FAULTS = 4;
/** The most wire faults a board reports: narrow bands, wires through a section and far wires. */
export const MAX_WIRE_FAULTS = 6;
/** What fixes an empty block or a thin section, and what does not. Round 5 cycle 2: the drawer widened a section (h6), turned a column into a row (06) and added stickies (08). Cycle 3: it moved 2 notes and the key into gaps (03). */
export const SPACE_FIXES = "The allowed fixes: shrink the section or the frame, or move a neighbour in. Not a fix: widen a section, add a sticky, reverse a chain. Never move a note or the key into a gap.";

const area = (rect: WorldRect) => rect.width * rect.height;
/** The area 2 rectangles share. */
const shared = (a: WorldRect, b: WorldRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** Whether 2 empty blocks of different rounds are one fault: one holds half of the other. */
export const sameBlock = (a: WorldRect, b: WorldRect) => shared(a, b) >= Math.min(area(a), area(b)) / 2;
/** Whether 2 rectangles overlap or share an edge or a corner. */
const meets = (a: WorldRect, b: WorldRect) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
const centre = (rect: WorldRect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const SECTION = "section";
/** A note or the key. It fills no space: round 5 cycle 3 closed 3 findings on board 03 with stickies moved into gaps. */
const STICKY = "sticky";

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
 * board frame, the sections and the loose nodes are filled. In a section, its
 * direct children are. A wire and a sticky fill nothing.
 */
export function emptyBlocks(board: Board, pageFrame: BoardObject | null, gaps: GapMeasure[]): EmptyBlock[] {
  const placed = board.objects.filter((object) => object.geometry && object.type !== STICKY);
  // A band inside its legal width is the room of its lanes, whatever its area. One with a fault has that finding, and no second one for the same space.
  // Where a band between 2 columns meets a band between 2 rows, the corner is as wide as the one and as high as the other: room too (board 14, 540 × 340 px).
  const room = (holder: string | null) => {
    const bands = gaps.filter((gap) => gap.parent === holder && (gap.fault || gap.gap <= gap.most));
    const columns = bands.filter((gap) => gap.side !== "stacked");
    const corners = bands.filter((gap) => gap.side === "stacked").flatMap((row) => columns.filter((column) => meets(column.gutter, row.gutter))
      .map((column) => ({ x: column.gutter.x, width: column.gutter.width, y: row.gutter.y, height: row.gutter.height })));
    return [...bands.map((gap) => gap.gutter), ...corners];
  };
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
  /** Its direct children. */
  items: number;
  /** The share of `inner` they fill. */
  fill: number;
  /** The px² of `inner` they leave empty. */
  empty: number;
}

/**
 * The sections whose direct children fill under THIN_FILL of the room inside
 * them, emptiest first. A sticky fills nothing here either: a note moved in
 * closes no thin section. The room is the section less the frame padding on
 * each side and one more padding for the title band: the margins `arrange`
 * leaves. Against the whole area, a fitted row of 3 nodes at the engine's row
 * gap fills 29%, and 47 of the 161 sections of round 5 cycle 2 fall under
 * 35%. Against the room, one does: the section of h6 that 3 nodes fill 29% of.
 */
export function thinSections(board: Board, pageFrame: BoardObject | null, padding: number): ThinSection[] {
  return board.objects.filter((object) => object.type === SECTION && object.geometry && object !== pageFrame).flatMap((section): ThinSection[] => {
    const items = board.objects.filter((object) => object.geometry && object.parentId === section.id && object.type !== STICKY);
    const inner = { width: section.geometry.width - 2 * padding, height: section.geometry.height - 3 * padding };
    if (items.length === 0 || inner.width <= 0 || inner.height <= 0) return [];
    const filled = items.reduce((sum, object) => sum + area(object.geometry), 0);
    const fill = filled / area({ x: 0, y: 0, ...inner });
    return fill < THIN_FILL ? [{ id: section.id, rect: section.geometry, inner, items: items.length, fill, empty: area({ x: 0, y: 0, ...inner }) - filled }] : [];
  }).sort((a, b) => b.empty - a.empty);
}

/** The numbers of the band rule (packages/canvas authoring/rules.ts, topic `rules`). */
export interface GapRule {
  /** The width a band needs with one lane or none: CRAFT_TARGETS.sectionGutterSideBySide. */
  base: number;
  /** SECTION_GAP_PER_WIRE: the room of each lane after the first. */
  perWire: number;
  /** LABEL_LEG: the length a leg needs for its label, horizontal (by its characters) and vertical. */
  labelBase: number;
  labelPerCharacter: number;
  labelVertical: number;
  /** SECTION_GAP_SLACK: a band is legal from its need to this much over. */
  slack: number;
  /** A band that needs more than this is a section-order fault. */
  needMax: number;
  /** CRAFT_TARGETS.framePadding: what a section leaves round its content. */
  padding: number;
}

export const gapRule = ({ rules, craft }: Pick<WireModules, "rules" | "craft">): GapRule => ({
  base: craft.CRAFT_TARGETS.sectionGutterSideBySide, perWire: rules.SECTION_GAP_PER_WIRE,
  labelBase: rules.LABEL_LEG.base, labelPerCharacter: rules.LABEL_LEG.perCharacter, labelVertical: rules.LABEL_LEG.vertical,
  slack: rules.SECTION_GAP_SLACK, needMax: rules.BAND_NEED_MAX ?? BAND_NEED_MAX_PX,
  padding: craft.CRAFT_TARGETS.framePadding,
});

/** A band: the gap between 2 neighbour sections over the span they share (SectionGap), against the band rule. `wires` are its lanes. */
export interface GapMeasure extends SectionGap {
  /** The section that holds the pair, or null at the root. */
  parent: string | null;
  /** The longest label leg that crosses the band with its chip in it, or 0. */
  leg: number;
  /** The width the rule asks: the base or `leg`, plus the room of each lane after the first. */
  need: number;
  /** Whether the band rule sets this gap: the pair sits in the board frame. `arrange_section` sets a gap inside a section. */
  ruled: boolean;
  /** The most it may be: the slack over `need`, or over the need of a band it shares a strip with when that is more. */
  most: number;
  /** under: narrower than `need`. over: wider than `most` with no node in it. Null inside the legal width, and for a gap the rule does not set. */
  fault: "under" | "over" | null;
}

/**
 * Each band against the band rule of topic `rules`: need = the base, or the
 * longest label leg of a chip that sits in the band when that is more, plus
 * the step for each lane after the first. A lane is a wire that runs along
 * the band inside the span the 2 sections share (sectionGaps). A wire that
 * only crosses it takes no width: round 5 cycle 3 counted those, and 11 of
 * them set a band of 820 px on board 09. The rule sets the gaps of the
 * sections in the board frame (`pageFrame`, or the root): topic `rules`
 * leaves a gap inside a section to `arrange_section`.
 *
 * 2 bands share a strip when one section faces 2 neighbours across one gap
 * (3 sections in a column beside a tall one, board 14). One move sets both,
 * so the widest need of the strip sets the most each may be.
 */
export function gapMeasures(board: Board, units: ReviewUnit[], facts: WireFact[], rule: GapRule, pageFrame: string | null): GapMeasure[] {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const parentOf = (id: string) => byId.get(id)?.parentId ?? null;
  // The rule is for sections that share a parent: a subsection and a section outside its parent are not a row.
  const needs = sectionGaps(units, facts).filter((gap) => parentOf(gap.a) === parentOf(gap.b)).map((gap) => {
    const parent = parentOf(gap.a);
    const across = gap.side === "stacked" ? "v" : "h";
    // A leg takes the band's width when it runs across the band and its chip sits in the band.
    const legs = facts.filter((fact) => {
      if (!fact.chip || !fact.labelAt || !touches(fact.chip, gap.gutter)) return false;
      const [off, along] = across === "h" ? [fact.labelAt.y, fact.labelAt.x] : [fact.labelAt.x, fact.labelAt.y];
      return runsOf(fact.points).some((run) => run.axis === across && Math.abs(off - run.fixed) <= 1 && along >= run.from && along <= run.to);
    });
    const leg = Math.max(0, ...legs.map((fact) => across === "h" ? rule.labelBase + rule.labelPerCharacter * fact.label.length : rule.labelVertical));
    return { ...gap, parent, leg, need: Math.max(rule.base, leg) + rule.perWire * Math.max(0, gap.wires.length - 1), ruled: parent === pageFrame };
  });
  // Where a band lies across its width: 2 bands of one strip overlap there.
  const depth = (gap: SectionGap): [number, number] => gap.side === "stacked" ? [gap.gutter.y, gap.gutter.y + gap.gutter.height] : [gap.gutter.x, gap.gutter.x + gap.gutter.width];
  const strip = (a: SectionGap, b: SectionGap) => a.side === b.side && [a.a, a.b].some((id) => id === b.a || id === b.b) && depth(a)[0] < depth(b)[1] && depth(b)[0] < depth(a)[1];
  return needs.map((gap): GapMeasure => {
    const { parent, need, ruled } = gap;
    const most = Math.max(need, ...needs.filter((other) => other.ruled === ruled && strip(gap, other)).map((other) => other.need)) + rule.slack;
    // A sticky in the band does not use it: a note moved into a band leaves the band as wide.
    const clear = !board.objects.some((object) => object.geometry && object.type !== STICKY && (object.parentId ?? null) === parent && object.id !== gap.a && object.id !== gap.b && touches(object.geometry, gap.gutter));
    return { ...gap, most, fault: !ruled ? null : gap.gap < need ? "under" : clear && gap.gap > most ? "over" : null };
  });
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

const list = (ids: string[]) => ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;

/** A wire between 2 sections as one line of facts: its length now, its 2 sections and the sections between them. */
export function linkLine(link: Link): string {
  return `${link.fact.id} is ${link.fact.length} px now, ${link.a} → ${link.b}`
    + (link.neighbours ? ", neighbours" : `, not neighbours${link.between.length ? `: ${list(link.between)} ${link.between.length === 1 ? "lies" : "lie"} between them` : ""}`)
    + (link.through.length ? `; it runs through ${list(link.through)}` : "");
}

/** A wire through a section as one line of facts: linkLine when it joins 2 sections, and its 2 ends when it joins none. */
function throughLine({ fact, sections }: Through, links: Link[]): string {
  const link = links.find((each) => each.fact === fact);
  return link ? linkLine(link) : `${fact.id} is ${fact.length} px now, ${fact.from} → ${fact.to}; it runs through ${list(sections)}`;
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
  /**
   * Each section's place among the sections of its parent: its neighbours, and the side each one is on.
   * A section that changes its row, its column or a neighbour changes its place. A move of a few px does not.
   */
  places: Record<string, string>;
  /** Each section's centre, to tell a section that moved from one a few px off. */
  centres: Record<string, [number, number]>;
  /** The numbers a decline is held against, where less is better: each wire's length and crossings by id, and each wire fault's own number by key, before the cap. */
  numbers: { length: Record<string, number>; crossings: Record<string, number>; faults: Record<string, number> };
}

export function layoutFacts(
  board: Board, facts: WireFact[], links: Link[], through: Through[], pageFrame: BoardObject | null, gaps: GapMeasure[], faults: ComputedFault[],
): LayoutFacts {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const holders = (id: string): string[] => {
    const ids: string[] = [];
    for (let at = byId.get(id); at && !ids.includes(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) if (at.type === SECTION && at !== pageFrame) ids.push(at.id);
    return ids;
  };
  const linkOf = new Map(links.map((link) => [link.fact.id, link]));
  const throughOf = new Map(through.map((each) => [each.fact.id, each.sections]));
  const sections = board.objects.filter((object) => object.type === SECTION && object !== pageFrame);
  /** Where `other` is from `id`, across the band they share. */
  const sideOf = (gap: GapMeasure, id: string, other: string) => {
    const [from, to] = [byId.get(id)!.geometry, byId.get(other)!.geometry];
    return gap.side === "stacked" ? (to.y > from.y ? "below" : "above") : to.x > from.x ? "right" : "left";
  };
  const place = (id: string) => JSON.stringify(gaps.flatMap((gap) => gap.a === id ? [`${gap.b} ${sideOf(gap, id, gap.b)}`] : gap.b === id ? [`${gap.a} ${sideOf(gap, id, gap.a)}`] : []).sort());
  return {
    sections: Object.fromEntries(sections.map((section) => [section.id, section.text ?? ""])),
    holders: Object.fromEntries<string[]>([
      ...board.objects.map((object): [string, string[]] => [object.id, holders(object.id)]),
      ...facts.map((fact): [string, string[]] => {
        const link = linkOf.get(fact.id);
        return [fact.id, [...new Set([...holders(fact.from), ...holders(fact.to), ...(link?.between ?? []), ...(throughOf.get(fact.id) ?? [])])]];
      }),
    ]),
    wires: Object.fromEntries([
      ...through.map((each): [string, string] => [each.fact.id, throughLine(each, links)]),
      ...links.filter(({ fact }) => fact.crosses.length > 0 || fact.length > LONG_WIRE_PX).map((link): [string, string] => [link.fact.id, linkLine(link)]),
    ]),
    places: Object.fromEntries(sections.filter((section) => section.geometry).map((section) => [section.id, place(section.id)])),
    centres: Object.fromEntries(sections.filter((section) => section.geometry).map(({ id, geometry: at }) => [id, [at.x + at.width / 2, at.y + at.height / 2]])),
    numbers: {
      length: Object.fromEntries(facts.map((fact) => [fact.id, fact.length])),
      crossings: Object.fromEntries(facts.map((fact) => [fact.id, fact.crosses.length])),
      faults: Object.fromEntries(faults.flatMap((fault) => fault.number === undefined ? [] : [[fault.key, fault.number]])),
    },
  };
}

/** A measure of the board that fails: a finding the loop holds until the measure passes. */
export interface ComputedFault {
  /** space: an empty block, a thin section, a band too wide. wire: a band too narrow, a wire through a section, a far wire. A decline closes a wire fault only with a real section move or a better number (critic-loop.ts). */
  kind: "space" | "wire";
  /** What makes it the same fault in a later round: the measure and the items, never the numbers. 2 empty blocks of one frame or section share it: `block` tells them apart. */
  key: string;
  /** An empty block's place in its frame or section. A later round's is the same fault when one of the 2 holds half of the other (critic-loop.ts). */
  block?: WorldRect;
  /** The sections it names, then the wires. */
  ids: string[];
  problem: string;
  /** A wire fault as it stands this round, in one line: the loop adds it when the fault comes back after a decline that closed nothing. */
  facts?: string;
  /** A wire fault's own number, where less is better: a band's px short, a section's wires through it, a pair's longest far wire. A decline closes the fault when it fell by a fifth (critic-loop.ts). */
  number?: number;
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

/** A band's lanes and label leg, as its findings say them. */
const lanesOf = (gap: GapMeasure) => `${count(gap.wires.length, "wire runs", "wires run")} along it${gap.wires.length ? ` (${gap.wires.join(", ")})` : ""}`;
/** How the rule gets a band's need, in words. */
const needOf = (gap: GapMeasure, rule: GapRule) =>
  `${gap.leg > rule.base ? `${gap.leg} px for the longest label leg in it` : `${rule.base} px`}${gap.wires.length > 1 ? `, plus ${rule.perWire} px for each lane after the first` : ""}`;

/** A band as one line of facts, with its need. */
export function gapLine(gap: GapMeasure, rule: GapRule): string {
  const verdict = gap.fault === "under" ? `TOO NARROW by ${gap.need - gap.gap} px` : gap.fault === "over" ? `TOO WIDE by ${gap.gap - gap.most} px` : "inside its legal width";
  return [
    `${gap.a} ↔ ${gap.b}`, gap.side, `gap ${gap.gap} px`, `band ${span(gap.gutter)}`, lanesOf(gap), count(gap.chips, "label chip in it", "label chips in it"),
    ...(gap.ruled
      ? [`needs ${gap.need} px, legal to ${gap.most} px${gap.most > gap.need + rule.slack ? " (a band of its strip needs more)" : ""}`, verdict]
      : [`inside section ${gap.parent}: \`arrange_section\` sets it, not the band rule`]),
  ].join(" · ");
}

/** What the runner measured on a board, before the caps. */
interface Measures { board: Board; rule: GapRule; gaps: GapMeasure[]; blocks: EmptyBlock[]; thin: ThinSection[]; links: Link[]; through: Through[] }

/** The space faults, most empty px² first: the thin sections and the empty blocks outside them, then the bands too wide. */
function spaceFaults({ rule, gaps, blocks, thin }: Measures): ComputedFault[] {
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
        + ` ${percent(block.share)} of the ${block.frame ? "frame holds no section or node" : "section holds no node or subsection"}. ${limit} ${SPACE_FIXES}`,
      marks: [{ box: block.rect }],
    } })),
  ];
  const wide = gaps.filter((gap) => gap.fault === "over").sort((a, b) => b.gap - b.most - (a.gap - a.most)).map((gap): ComputedFault => ({
    kind: "space", key: JSON.stringify(["gap", "over", [gap.a, gap.b].sort()]), ids: [gap.a, gap.b],
    problem: `The band between ${gap.a} and ${gap.b} (${gap.side}), ${span(gap.gutter)}, is ${gap.gap} px wide and ${lanesOf(gap)}:`
      + ` it needs ${gap.need} px (${needOf(gap, rule)}) and is legal to ${gap.most} px, so it is ${gap.gap - gap.most} px too wide.`
      + ` Move one of the 2 sections in. A wire that only crosses a band takes no width`,
    marks: [{ box: gap.gutter }],
  }));
  return [...empty.sort((a, b) => b.px - a.px).map(({ fault }) => fault), ...wide].slice(0, MAX_SPACE_FAULTS);
}

/**
 * The wire faults: the bands too narrow (most px short first), the sections a
 * wire runs through (most wires first) and the far wires by section pair
 * (longest first), one of each in turn. A board's findings hold the first
 * MAX_WIRE_FAULTS of them (planOf).
 */
function wireFaults({ board, rule, gaps, links, through }: Measures): ComputedFault[] {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const factOf = new Map(links.map((link) => [link.fact.id, link]));
  const longest = (a: { fact: WireFact }, b: { fact: WireFact }) => b.fact.length - a.fact.length;
  const narrow = gaps.filter((gap) => gap.fault === "under").sort((a, b) => b.need - b.gap - (a.need - a.gap)).map((gap): ComputedFault => {
    // A lane that joins no section beside the band: its sections sit apart, and the band pays for it.
    const passing = gap.wires.filter((id) => { const link = factOf.get(id); return link && !([gap.a, gap.b].includes(link.a) && [gap.a, gap.b].includes(link.b)); });
    return {
      kind: "wire", key: JSON.stringify(["band", [gap.a, gap.b].sort()]), ids: [gap.a, gap.b, ...gap.wires], number: gap.need - gap.gap,
      problem: `The band between ${gap.a} and ${gap.b} (${gap.side}), ${span(gap.gutter)}, is ${gap.gap} px wide and ${lanesOf(gap)}:`
        + ` it needs ${gap.need} px (${needOf(gap, rule)}), so it is ${gap.need - gap.gap} px too narrow.`
        // Past the most a band may need, a wider band is no fix: the lanes are there because the sections sit in the wrong order.
        + (gap.need > rule.needMax
          ? ` A band that needs over ${rule.needMax} px is a section-order fault: reorder the sections so fewer wires run along this band${gap.leg > rule.base ? ", or shorten the label" : ""}. Do not widen it`
          : ` Move the 2 sections apart to ${gap.need} px, and no more than ${gap.most} px`),
      facts: `the band is ${gap.gap} px wide now with ${count(gap.wires.length, "lane", "lanes")}, and it needs ${gap.need} px`
        + (passing.length ? `; ${count(passing.length, "of them joins", "of them join")} a section that is not beside the band: ${passing.map((id) => `${id} (${factOf.get(id)!.a} → ${factOf.get(id)!.b})`).join(", ")}` : ""),
      marks: [{ box: gap.gutter }],
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
    kind: "wire", key: JSON.stringify(["through", section]), ids: [section, ...group.map(({ fact }) => fact.id)], number: group.length,
    problem: `${count(group.length, "wire runs", "wires run")} through section ${section}, which holds neither end of ${group.length === 1 ? "it" : "them"}: ${group.map(wire).join(", ")}`,
    facts: throughLine(group[0]!, links),
    marks: [{ box: byId.get(section)!.geometry }, ...group.slice(0, MAX_MARKED).map(({ fact }) => pathOf(fact))],
  }));
  const far = group(links.filter((link) => link.fact.length > FAR_WIRE_PX && !link.neighbours), (link) => [[link.a, link.b].sort().join("\n")])
    .sort(([, a], [, b]) => longest(a[0]!, b[0]!)).map(([, group]): ComputedFault => {
      const { a, b, between } = group[0]!;
      return {
        kind: "wire", key: JSON.stringify(["long", [a, b].sort()]), ids: [...[a, b].sort(), ...group.map((link) => link.fact.id)], number: group[0]!.fact.length,
        problem: `${count(group.length, "wire", "wires")} over ${FAR_WIRE_PX} px ${group.length === 1 ? "joins" : "join"} sections ${a} and ${b}, which are not neighbours`
          + `${between.length ? ` (${list(between)} ${between.length === 1 ? "lies" : "lie"} between them)` : ""}: ${group.map((link) => `${link.fact.id} (${link.fact.length} px)`).join(", ")}`,
        facts: linkLine(group[0]!),
        marks: group.slice(0, MAX_MARKED).map((link) => pathOf(link.fact)),
      };
    });
  const kinds = [narrow, crossed, far];
  const turns = Math.max(...kinds.map((faults) => faults.length));
  return Array.from({ length: turns }, (_, turn) => kinds.flatMap((faults) => faults[turn] ?? [])).flat();
}

/** What the runner measures on the plan of a board. `blocks`, `thin` and `gaps` are whole: `faults` holds the ones under the caps. */
export interface Plan extends Omit<Measures, "board" | "rule"> { pageFrame: BoardObject | null; units: ReviewUnit[]; faults: ComputedFault[]; layout: LayoutFacts }

export function planOf(board: Board, facts: WireFact[], rule: GapRule): Plan {
  const { pageFrame, units } = reviewUnits(board);
  const gaps = gapMeasures(board, units, facts, rule, pageFrame?.id ?? null);
  const links = sectionLinks(board, facts, gaps, pageFrame);
  const throughOf = sectionsThrough(board, pageFrame);
  const through = facts.flatMap((fact): Through[] => { const sections = throughOf(fact); return sections.length ? [{ fact, sections }] : []; });
  const measures: Measures = { board, rule, gaps, blocks: emptyBlocks(board, pageFrame, gaps), thin: thinSections(board, pageFrame, rule.padding), links, through };
  const { board: _, rule: __, ...rest } = measures;
  const wires = wireFaults(measures);
  // The space faults, then the wire faults, each under its cap.
  return { pageFrame, units, ...rest, faults: [...spaceFaults(measures), ...wires.slice(0, MAX_WIRE_FAULTS)], layout: layoutFacts(board, facts, links, through, pageFrame, gaps, wires) };
}
