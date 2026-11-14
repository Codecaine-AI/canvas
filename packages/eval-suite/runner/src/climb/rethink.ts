/**
 * The rethink turn: one turn the runner sends the drawer after its first draw
 * and before review round 1, in the drawer's own session (critic-loop.ts).
 * Ford: "once the board size is set, the drawer agent isn't being like, would
 * it be better if I adjusted the aspect ratio Or Then, like, splayed things
 * out in a different manner."
 *
 * Round 5 cycle 1 left the rethink to the drawer's guidance, and the drawer
 * skipped it on 5 of 8 boards. So the runner asks, with the numbers it
 * measured on the board file (space.ts): the wires between each pair of
 * sections, each band against the band rule, the longest wires,
 * the computed findings and the board's size. The drawer writes 3 answers, then edits. An
 * answer can be "no change" only with its reason. The loop record keeps the
 * answers, the tool calls and the sections that moved.
 *
 * Round 5 cycle 4: A3 asked for another order and no drawer had one to
 * weigh. So the turn also reads the best 2 orders of the order search
 * (order.ts), when the best is ORDER_GAIN cheaper than the board's own.
 */
import type { DrawerRun } from "./drawer.ts";
import { ORDER_COSTS, orderLines, type Order, type OrderSearch } from "./order.ts";
import { transcriptMetrics } from "./render.ts";
import { SPACE_UNIT, ownerUnits, spaceLines, type Board } from "./review-inputs.ts";
import { gapLine, type GapRule, type Plan } from "./space.ts";
import type { WireFact } from "./wires.ts";

/** A board file as the runner measured it. */
export interface Measured { board: Board; facts: WireFact[]; plan: Plan }

const QUESTIONS = {
  A1: "which section moves shorten the longest wires?",
  A2: "which band is too narrow or too wide?",
  A3: "would another board shape (aspect ratio) or another order of the sections read better?",
} as const;
type Tag = keyof typeof QUESTIONS;
const TAGS = Object.keys(QUESTIONS) as Tag[];
export type RethinkAnswers = Record<Tag, string>;
/** How many of the longest wires the turn lists. */
const LONGEST = 5;

const block = (title: string, lines: string[]) => ["", title, ...(lines.length ? lines : ["(none)"])];

/** The turn's message: what to answer and do, then the measured facts. `order`: the order search of the board, read only when it found a cheaper order (`shown`). */
export function rethinkMessage(board: string, { board: file, facts, plan }: Measured, rule: GapRule, order: OrderSearch | null = null): string {
  const lines = spaceLines(plan.units, facts, file);
  const owner = ownerUnits(plan.units);
  const named = (id: string) => `${id} (${owner.get(id) ?? "board"})`;
  const longest = [...facts].sort((a, b) => b.length - a.length).slice(0, LONGEST)
    .map((fact) => `${fact.id} · ${named(fact.from)} → ${named(fact.to)} · ${fact.length} px · ${fact.bends} bends`);
  return [
    "Your first draw is done. Before the reviewers read the board, rethink its plan: where the sections sit, the gaps between them, and the shape of the board.",
    `Ford: "once the board size is set, the drawer agent isn't being like, would it be better if I adjusted the aspect ratio Or Then, like, splayed things out in a different manner."`,
    "The runner measured the numbers below on the board file.",
    "",
    "Write 3 answers before your first edit, each on a line that starts with its tag:",
    ...TAGS.map((tag) => `${tag}: ${QUESTIONS[tag]}`),
    `An answer can be "no change", but only with its reason from the numbers below. "No change" alone is no answer.`,
    "Then make the edits your answers ask for. Move whole sections (`arrange`, `move`, `place_section`, `fit_section`): a section takes everything it holds with it."
    + " After you move a section, close the space it left, then route the wires again.",
    "The room goes between sections, for the wires there. Do not spread the nodes inside a section, and do not resize a section past its content.",
    "Never narrow a band below its need, and never move a note or the key into a band.",
    `The canvas server restarted. Open the board again with canvas_open, canvas id "${board}", and read any guidance topic it asks for.`,
    "Run canvas_check when you are done.",
    ...block("Board:", [lines.shape]),
    ...block("Wires between sections (the 2 sections · wires · their total length · whether the 2 are neighbours), most wires first:", lines.pairs),
    ...(order?.shown ? block(
      "Section orders the runner measured for A3. It put the sections on a grid of rows and columns and searched the orders."
      + ` The cost of an order is the px of wire between the centres of its cells, plus ${ORDER_COSTS.back} px for each wire that runs back (to the left or up),`
      + ` plus ${ORDER_COSTS.far} px for each pair of cells with a wire that are not neighbours. It is an estimate from cell centres, and the runner forces no order.`
      + (order.kept ? ` The brief names a start, so the first row (${order.kept.join(", ")}) stayed.` : "")
      + " In A3, say which order you take, or why you keep yours, with numbers. When you take one, move the whole sections to it, then check the wires you get:",
      orderLines(order),
    ) : []),
    ...block(
      `Bands, each against the band rule. A band is the gap between 2 neighbour sections, over the span the 2 share. Its lanes are the wires that run along it for 40 px or more inside that span: a wire that only crosses it straight is no lane.`
      + ` A band needs ${rule.base} px, or the longest label leg of a chip that sits in it when that is more (${rule.labelBase} px plus ${rule.labelPerCharacter} px a character on a horizontal leg), plus ${rule.perWire} px for each lane after the first.`
      + ` From its need to ${rule.slack} px over, a band is right, and it is never empty space. A band that needs over ${rule.needMax} px is a section-order fault: reorder the sections, do not widen it:`,
      plan.gaps.map((gap) => gapLine(gap, rule)),
    ),
    ...block(`The ${LONGEST} longest wires (id · from (its section) → to (its section) · length · bends):`, longest),
    ...block(
      "Computed findings: the measures of the board that fail now. The review loop sends you each one that still fails after this turn, until it passes:",
      plan.faults.map((fault) => `- ${fault.problem.replace(/\.?$/, ".")}${fault.facts ? ` Facts: ${fault.facts}.` : ""}`),
    ),
  ].join("\n");
}

/** The text the drawer wrote in a pass: the text blocks of its assistant messages, in order, a blank line between 2 blocks. */
function assistantText(jsonl: string): string {
  return jsonl.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    let event: { type?: string; message?: { content?: unknown } };
    try { event = JSON.parse(line); } catch { return []; }
    const content = event.type === "assistant" ? event.message?.content : null;
    return Array.isArray(content) ? (content as Array<{ type?: string; text?: string }>).flatMap((part) => part.type === "text" && part.text ? [part.text] : []) : [];
  }).join("\n\n");
}

/**
 * The drawer's 3 answers in a pass's transcript: for each tag, the first line
 * that starts with it (list marks and bold aside) and the lines under it up
 * to a blank line or the next tag. "" for a tag with no such line.
 */
export function rethinkAnswers(jsonl: string): RethinkAnswers {
  const answers: RethinkAnswers = { A1: "", A2: "", A3: "" };
  const seen = new Set<Tag>();
  let open: Tag | null = null;
  for (const line of assistantText(jsonl).split("\n")) {
    const match = /^\W*(A[123])\b\W*(.*)$/.exec(line);
    if (match) {
      const tag = match[1] as Tag;
      open = seen.has(tag) ? null : tag;
      seen.add(tag);
      if (open) answers[open] = match[2]!;
    } else if (!line.trim()) open = null;
    else if (open) answers[open] += ` ${line.trim()}`;
  }
  for (const tag of TAGS) answers[tag] = answers[tag].replace(/[\s*|]+$/, "").trim();
  return answers;
}

/** The tags with no answer: nothing, or "no change" with no reason. */
export const unanswered = (answers: RethinkAnswers): Tag[] => TAGS.filter((tag) => /^\W*(no change)?\W*$/i.test(answers[tag]));

/** The second ask, in the session of the rethink turn, for the answers its reply left out. */
export function rethinkReask(tags: string[]): string {
  return [
    `Your reply has no answer for ${tags.join(", ")}, or it says "no change" with no reason.`,
    "Make no new edits and call no tool. Reply with one line for each, and nothing else:",
    ...TAGS.filter((tag) => tags.includes(tag)).map((tag) => `${tag}: <${QUESTIONS[tag].replace(/\?$/, "")}: your answer, or "no change" and the reason>`),
  ].join("\n");
}

/** A section the turn moved as a whole: it holds what it held, at another place. */
export interface SectionMove { id: string; dx: number; dy: number }

/**
 * The sections whose place differs between 2 boards, with what they hold. A
 * section that went along with a move of its parent is not listed, and
 * neither is `skip`, the board frame: it follows what it holds. A frame that
 * changed place round items that stayed is not one either: `fit_section`
 * draws a frame in, and no item of the section moved.
 */
export function sectionMoves(before: Board, after: Board, skip: string | null): SectionMove[] {
  const wasOf = new Map(before.objects.filter((object) => object.geometry).map((object) => [object.id, object]));
  const delta = (id: string | null | undefined, to: { x: number; y: number } | undefined) => {
    const from = id ? wasOf.get(id)?.geometry : undefined;
    return from && to ? { dx: to.x - from.x, dy: to.y - from.y } : { dx: 0, dy: 0 };
  };
  const corner = (rects: Array<{ x: number; y: number }>) => ({ x: Math.min(...rects.map((rect) => rect.x)), y: Math.min(...rects.map((rect) => rect.y)) });
  const nowOf = new Map(after.objects.map((object) => [object.id, object]));
  return after.objects.filter((object) => object.type === "section" && object.geometry && object.id !== skip && wasOf.has(object.id)).flatMap((section) => {
    const own = delta(section.id, section.geometry);
    const parent = delta(section.parentId === skip ? null : section.parentId, section.parentId ? nowOf.get(section.parentId)?.geometry : undefined);
    // What it held and holds: the top left corner of those items says whether they moved, however the turn arranged them again.
    const held = after.objects.filter((object) => object.parentId === section.id && object.geometry && wasOf.get(object.id)?.parentId === section.id);
    const [from, to] = [corner(held.map((object) => wasOf.get(object.id)!.geometry)), corner(held.map((object) => object.geometry))];
    const inside = held.length ? { dx: to.x - from.x, dy: to.y - from.y } : own;
    const moved = (shift: { dx: number; dy: number }) => (shift.dx !== 0 || shift.dy !== 0) && (shift.dx !== parent.dx || shift.dy !== parent.dy);
    return moved(own) && moved(inside) ? [{ id: section.id, ...own }] : [];
  });
}

/** The rethink turn as loop.json keeps it. */
export interface RethinkRecord extends DrawerRun {
  /** The drawer's 3 written answers. "" for one it never gave. */
  answers: RethinkAnswers;
  /** The pass that asked again for the answers the turn left out, or null when there was none. */
  reask: (DrawerRun & { asked: string[] }) | null;
  /** The turn's tool calls, by tool. */
  toolCalls: { total: number; byTool: Record<string, number> };
  /** The sections it moved as a whole. */
  moved: SectionMove[];
  /** The board's size before and after. */
  frame: { before: string; after: string };
  /** How many measures of the board failed before and after (space.ts planOf). */
  faults: { before: number; after: number };
  /** The order search of the first draw, or null when the board has no orders to search. The turn read it when `shown`. */
  order: OrderSearch | null;
  /** The board's own order after the turn, at the same model's cost: what the drawer did with the orders. */
  orderAfter: Order | null;
}

export function rethinkRecord(turn: {
  run: DrawerRun; transcript: string; answers: RethinkAnswers; reask: RethinkRecord["reask"]; before: Measured; after: Measured;
  order?: { before: OrderSearch | null; after: OrderSearch | null };
}): RethinkRecord {
  const { before, after } = turn;
  const frame = ({ plan }: Measured) => {
    const rect = plan.pageFrame?.geometry ?? plan.units.find((unit) => unit.id === SPACE_UNIT)!.rect;
    return `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
  };
  return {
    ...turn.run,
    answers: turn.answers,
    reask: turn.reask,
    toolCalls: transcriptMetrics(turn.transcript).toolCalls,
    moved: sectionMoves(before.board, after.board, after.plan.pageFrame?.id ?? null),
    frame: { before: frame(before), after: frame(after) },
    faults: { before: before.plan.faults.length, after: after.plan.faults.length },
    order: turn.order?.before ?? null,
    orderAfter: turn.order?.after?.current ?? null,
  };
}
