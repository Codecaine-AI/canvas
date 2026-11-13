/**
 * What the runner measures on the plan of a board, in code: the empty blocks
 * in the board frame and in each section, and each gap between neighbour
 * sections against the gap rule of topic `rules`. Ford: "this is done, like,
 * a programmatic way".
 *
 * A measure that fails is a computed fault (computedFaults). The critic loop
 * sends it as a finding (critic-loop.ts), the space reviewer and the rethink
 * turn read it as a fact (critic.ts, rethink.ts). Round 5 cycle 1: the judges
 * faulted an empty block on every weak board, and no reviewer was allowed to
 * report one.
 *
 * A gutter within its rule number is not empty: it is the room of its wires.
 * So a board that spreads its sections to the rule gets no block for it, and
 * a gap too wide shows up once, as the block that covers it.
 */
import type { WorldRect } from "./render.ts";
import { reviewUnits, runsOf, runsThrough, sectionGaps, segmentsOf, touches, type Board, type BoardObject, type Mark, type ReviewUnit, type SectionGap } from "./review-inputs.ts";
import type { WireFact, WireModules } from "./wires.ts";

/** An empty block in the board frame is a fault past this size, or past this share of the frame when its short side is past `strip`: a thin margin is no block. */
export const FRAME_BLOCK = { width: 400, height: 400, share: 0.05, strip: 300 } as const;
/** An empty block in a section is a fault past this size, either way up. */
export const SECTION_BLOCK = { long: 400, short: 300 } as const;
/** A gap is too wide past its rule number plus this. */
export const GAP_SLACK_PX = 120;
/** The most empty blocks one frame or section reports. */
const MAX_BLOCKS = 2;
/** The most empty blocks a board reports. */
export const MAX_BOARD_BLOCKS = 4;

const area = (rect: WorldRect) => rect.width * rect.height;
/** Whether `rect` holds half of `other` or more. */
const covers = (rect: WorldRect, other: WorldRect) =>
  Math.max(0, Math.min(rect.x + rect.width, other.x + other.width) - Math.max(rect.x, other.x)) * Math.max(0, Math.min(rect.y + rect.height, other.y + other.height) - Math.max(rect.y, other.y)) >= area(other) / 2;
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
export function emptyRects(region: WorldRect, filled: WorldRect[], big: (rect: WorldRect) => boolean, max = MAX_BLOCKS): WorldRect[] {
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
  /** Its share of the frame or section that holds it. */
  share: number;
}

/**
 * The empty blocks of a board over the limits. In the board frame, the
 * sections, the loose nodes and the stickies are filled. In a section, its
 * direct children are. A wire fills nothing. A board holds MAX_BOARD_BLOCKS
 * at most: the frame's first, then the largest.
 */
export function emptyBlocks(board: Board, pageFrame: BoardObject | null, gaps: GapMeasure[], strip: number = FRAME_BLOCK.strip): EmptyBlock[] {
  const placed = board.objects.filter((object) => object.geometry);
  // A gutter within its number is the room of its wires, not an empty block.
  const gutters = (holder: string | null) => gaps.filter((gap) => gap.parent === holder && gap.fault !== "over").map((gap) => gap.gutter);
  const top = placed.filter((object) => object !== pageFrame && (!object.parentId || object.parentId === pageFrame?.id));
  if (top.length === 0) return [];
  const xs = top.flatMap((object) => [object.geometry.x, object.geometry.x + object.geometry.width]);
  const ys = top.flatMap((object) => [object.geometry.y, object.geometry.y + object.geometry.height]);
  const frame = pageFrame?.geometry ?? { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  const inFrame = emptyRects(frame, [...top.map((object) => object.geometry), ...gutters(pageFrame?.id ?? null)], (rect) =>
    (rect.width > FRAME_BLOCK.width && rect.height > FRAME_BLOCK.height)
    || (area(rect) > FRAME_BLOCK.share * area(frame) && Math.min(rect.width, rect.height) > strip))
    .map((rect): EmptyBlock => ({ in: pageFrame?.id ?? null, frame: true, rect, share: area(rect) / area(frame) }));
  const inSections = placed.filter((object) => object.type === SECTION && object !== pageFrame).flatMap((section) =>
    emptyRects(section.geometry, [...placed.filter((object) => object.parentId === section.id).map((object) => object.geometry), ...gutters(section.id)], (rect) =>
      Math.max(rect.width, rect.height) > SECTION_BLOCK.long && Math.min(rect.width, rect.height) > SECTION_BLOCK.short)
      .map((rect): EmptyBlock => ({ in: section.id, frame: false, rect, share: area(rect) / area(section.geometry) })));
  return [...inFrame, ...inSections.sort((a, b) => area(b.rect) - area(a.rect))].slice(0, MAX_BOARD_BLOCKS);
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
}

export const gapRule = ({ rules, craft }: Pick<WireModules, "rules" | "craft">): GapRule => ({
  base: craft.CRAFT_TARGETS.sectionGutterSideBySide, perWire: rules.SECTION_GAP_PER_WIRE, labelBase: rules.LABEL_LEG.base, labelPerCharacter: rules.LABEL_LEG.perCharacter,
});

export interface GapMeasure extends SectionGap {
  /** The section that holds the pair, or null at the root. */
  parent: string | null;
  /** The wires that cross the gutter or run along it: the ones the rule counts. */
  counted: string[];
  /** The rule number of this gap for its own wires. */
  need: number;
  /** The widest need of the gaps in its row (side by side) or column (stacked): one `arrange` call sets one gap for them all. */
  lineNeed: number;
  /** under: a wire is in it and it is narrower than `need`. over: nothing sits in it and it is wider than `lineNeed` + GAP_SLACK_PX. */
  fault: "under" | "over" | null;
}

/**
 * Each gap between neighbour sections against the gap rule: the base, plus
 * the step for each wire after the first, counting each wire that crosses the
 * gutter or runs along it. A side-by-side gap that a labelled wire crosses
 * starts from the length its label leg needs.
 */
export function gapMeasures(board: Board, units: ReviewUnit[], facts: WireFact[], rule: GapRule): GapMeasure[] {
  const parentOf = new Map(board.objects.map((object) => [object.id, object.parentId ?? null]));
  // The rule is for sections that share a parent: a subsection and a section outside its parent are not a row.
  const measured = sectionGaps(units, facts).filter((gap) => parentOf.get(gap.a) === parentOf.get(gap.b)).map((gap) => {
    const counted = facts.filter((fact) => segmentsOf(fact.points).some((segment) => runsThrough(segment, gap.gutter)));
    const across = gap.side === "side by side" ? "h" : "v";
    const [low, high] = gap.side === "side by side" ? [gap.gutter.x, gap.gutter.x + gap.gutter.width] : [gap.gutter.y, gap.gutter.y + gap.gutter.height];
    // A labelled wire crosses a side-by-side gap when one horizontal run of it spans the gutter and its chip sits in it.
    const labels = gap.side === "stacked" ? [] : counted.filter((fact) => fact.label && fact.chip && touches(fact.chip, gap.gutter)
      && runsOf(fact.points).some((run) => run.axis === across && run.from <= low && run.to >= high));
    const first = Math.max(rule.base, ...labels.map((fact) => rule.labelBase + rule.labelPerCharacter * fact.label.length));
    const parent = parentOf.get(gap.a) ?? null;
    const clear = !board.objects.some((object) => object.geometry && (object.parentId ?? null) === parent && object.id !== gap.a && object.id !== gap.b && touches(object.geometry, gap.gutter));
    return { ...gap, parent, clear, counted: counted.map((fact) => fact.id), need: first + rule.perWire * Math.max(0, counted.length - 1) };
  });
  return measured.map((gap): GapMeasure => {
    // The gaps of one row or column: the same way round, with gutters that share a stretch of the other axis.
    const line = measured.filter((other) => other.parent === gap.parent && other.side === gap.side && (gap.side === "side by side"
      ? other.gutter.y < gap.gutter.y + gap.gutter.height && other.gutter.y + other.gutter.height > gap.gutter.y
      : other.gutter.x < gap.gutter.x + gap.gutter.width && other.gutter.x + other.gutter.width > gap.gutter.x));
    const lineNeed = Math.max(...line.map((other) => other.need));
    const { clear, ...rest } = gap;
    return { ...rest, lineNeed, fault: gap.counted.length > 0 && gap.gap < gap.need ? "under" : clear && gap.gap > lineNeed + GAP_SLACK_PX ? "over" : null };
  });
}

/** A measure of the board that fails: a finding the loop holds until the measure passes. */
export interface ComputedFault {
  /** What makes it the same fault in a later round: the measure and the items, never the numbers. */
  key: string;
  /** The sections it names. */
  ids: string[];
  problem: string;
  marks: Mark[];
}

const span = (rect: WorldRect) => `x ${Math.round(rect.x)} to ${Math.round(rect.x + rect.width)}, y ${Math.round(rect.y)} to ${Math.round(rect.y + rect.height)}`;
const size = (rect: WorldRect) => `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
const percent = (share: number) => `${Math.round(share * 100)}%`;

/** An empty block as one line of facts. */
export function blockLine(block: EmptyBlock): string {
  return `${size(block.rect)} empty at ${span(block.rect)}, ${block.frame ? `in the board frame (${percent(block.share)} of it)` : `inside section ${block.in} (${percent(block.share)} of it)`}`;
}

/** A gap as one line of facts, with its rule number. */
export function gapLine(gap: GapMeasure): string {
  const verdict = gap.fault === "under" ? `UNDER its number by ${gap.need - gap.gap} px`
    : gap.fault === "over" ? `OVER its number + ${GAP_SLACK_PX} by ${gap.gap - gap.lineNeed - GAP_SLACK_PX} px` : "within its number";
  return [
    `${gap.a} ↔ ${gap.b}`, gap.side, `gap ${gap.gap} px`, `gutter ${span(gap.gutter)}`,
    `${gap.counted.length} ${gap.counted.length === 1 ? "wire crosses it or runs" : "wires cross it or run"} along it`, `${gap.chips} ${gap.chips === 1 ? "label chip" : "label chips"} in it`,
    `rule number ${gap.need} px${gap.lineNeed > gap.need ? ` (its ${gap.side === "side by side" ? "row" : "column"}'s widest pair: ${gap.lineNeed} px)` : ""}`, verdict,
  ].join(" · ");
}

/** The measures of a board that fail, as faults: the empty blocks, then the gaps off their rule number. */
export function computedFaults(blocks: EmptyBlock[], gaps: GapMeasure[]): ComputedFault[] {
  // 2 blocks of one frame or section are 2 faults: the larger is the first.
  const nth = new Map<string, number>();
  return [
    ...blocks.map((block): ComputedFault => {
      const holder = block.in ?? "board";
      const index = nth.get(holder) ?? 0;
      nth.set(holder, index + 1);
      return {
        key: JSON.stringify(["empty-block", holder, index]),
        ids: block.in ? [block.in] : [],
        problem: block.frame
          ? `An empty block of ${size(block.rect)} sits in the board frame at ${span(block.rect)}: ${percent(block.share)} of the frame holds no section, node or sticky.`
            + ` The limit is ${FRAME_BLOCK.width} × ${FRAME_BLOCK.height} px, or ${percent(FRAME_BLOCK.share)} of the frame`
          : `An empty block of ${size(block.rect)} sits inside section ${block.in} at ${span(block.rect)}: ${percent(block.share)} of the section holds nothing.`
            + ` The limit inside a section is ${SECTION_BLOCK.long} × ${SECTION_BLOCK.short} px`,
        marks: [{ box: block.rect }],
      };
    }),
    // An empty block that covers a gap too wide says it: the gap is not a second fault.
    ...gaps.filter((gap) => gap.fault === "under" || (gap.fault === "over" && !blocks.some((block) => covers(block.rect, gap.gutter)))).map((gap): ComputedFault => {
      const wires = `${gap.counted.length} ${gap.counted.length === 1 ? "wire crosses it or runs" : "wires cross it or run"} along it`;
      return {
        key: JSON.stringify(["gap", gap.fault, [gap.a, gap.b].sort()]),
        ids: [gap.a, gap.b],
        problem: gap.fault === "under"
          ? `The gap between ${gap.a} and ${gap.b} (${gap.side}) is ${gap.gap} px wide and ${wires}: the gap rule asks ${gap.need} px, so it is ${gap.need - gap.gap} px too narrow`
          : `The gap between ${gap.a} and ${gap.b} (${gap.side}) is ${gap.gap} px wide and ${wires}: the gap rule asks ${gap.lineNeed} px${gap.lineNeed > gap.need ? ` for the widest pair of its ${gap.side === "side by side" ? "row" : "column"}` : ""},`
            + ` so it is ${gap.gap - gap.lineNeed} px wider than its number, and the limit is ${GAP_SLACK_PX} px wider`,
        marks: [{ box: gap.gutter }],
      };
    }),
  ];
}

/** What the runner measures on the plan of a board. */
export interface Plan { pageFrame: BoardObject | null; units: ReviewUnit[]; gaps: GapMeasure[]; blocks: EmptyBlock[]; faults: ComputedFault[] }

export function planOf(board: Board, facts: WireFact[], rule: GapRule): Plan {
  const { pageFrame, units } = reviewUnits(board);
  const gaps = gapMeasures(board, units, facts, rule);
  const blocks = emptyBlocks(board, pageFrame, gaps);
  return { pageFrame, units, gaps, blocks, faults: computedFaults(blocks, gaps) };
}
