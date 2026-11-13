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
 * sections, each gap against the gap rule, the longest wires, the empty
 * blocks and the board's size. The drawer writes 3 answers, then edits. An
 * answer can be "no change" only with its reason. The loop record keeps the
 * answers, the tool calls and the sections that moved.
 */
import type { DrawerRun } from "./drawer.ts";
import { transcriptMetrics } from "./render.ts";
import { SPACE_UNIT, ownerUnits, spaceLines, type Board } from "./review-inputs.ts";
import { FRAME_BLOCK, GAP_SLACK_PX, SECTION_BLOCK, blockLine, gapLine, type GapRule, type Plan } from "./space.ts";
import type { WireFact } from "./wires.ts";

/** A board file as the runner measured it. */
export interface Measured { board: Board; facts: WireFact[]; plan: Plan }

const QUESTIONS = {
  A1: "which section moves shorten the longest wires?",
  A2: "which gap is over or under its rule number?",
  A3: "would another board shape (aspect ratio) or another order of the sections read better?",
} as const;
type Tag = keyof typeof QUESTIONS;
const TAGS = Object.keys(QUESTIONS) as Tag[];
export type RethinkAnswers = Record<Tag, string>;
/** How many of the longest wires the turn lists. */
const LONGEST = 5;

const block = (title: string, lines: string[]) => ["", title, ...(lines.length ? lines : ["(none)"])];

/** The turn's message: what to answer and do, then the measured facts. */
export function rethinkMessage(board: string, { board: file, facts, plan }: Measured, rule: GapRule): string {
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
    `The canvas server restarted. Open the board again with canvas_open, canvas id "${board}", and read any guidance topic it asks for.`,
    "Run canvas_check when you are done.",
    ...block("Board:", [lines.shape]),
    ...block("Wires between sections (the 2 sections · wires · their total length · whether the 2 are neighbours), most wires first:", lines.pairs),
    ...block(
      `Gaps between neighbour sections, each against the gap rule: ${rule.base} px, plus ${rule.perWire} px for each wire after the first that crosses the gap or runs along it.`
      + ` A labelled wire that crosses a side-by-side gap needs ${rule.labelBase} px plus ${rule.labelPerCharacter} px a character of its label.`
      + ` A gap is off its number when it is under it, or over it by more than ${GAP_SLACK_PX} px with nothing in it:`,
      plan.gaps.map(gapLine),
    ),
    ...block(`The ${LONGEST} longest wires (id · from (its section) → to (its section) · length · bends):`, longest),
    ...block(
      `Empty blocks over the limit: ${FRAME_BLOCK.width} × ${FRAME_BLOCK.height} px or ${FRAME_BLOCK.share * 100}% of the board frame, ${SECTION_BLOCK.long} × ${SECTION_BLOCK.short} px inside a section.`
      + " A section, a node or a sticky fills space. A wire does not:",
      plan.blocks.map(blockLine),
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
 * The sections whose place differs between 2 boards. A section that went
 * along with a move of its parent is not listed, and neither is `skip`, the
 * board frame: it follows what it holds.
 */
export function sectionMoves(before: Board, after: Board, skip: string | null): SectionMove[] {
  const placeOf = new Map(before.objects.filter((object) => object.geometry).map((object) => [object.id, object.geometry]));
  const delta = (id: string | null | undefined, to: { x: number; y: number } | undefined) => {
    const from = id ? placeOf.get(id) : undefined;
    return from && to ? { dx: to.x - from.x, dy: to.y - from.y } : { dx: 0, dy: 0 };
  };
  const nowOf = new Map(after.objects.map((object) => [object.id, object]));
  return after.objects.filter((object) => object.type === "section" && object.geometry && object.id !== skip && placeOf.has(object.id)).flatMap((section) => {
    const own = delta(section.id, section.geometry);
    const parent = delta(section.parentId === skip ? null : section.parentId, section.parentId ? nowOf.get(section.parentId)?.geometry : undefined);
    return (own.dx !== 0 || own.dy !== 0) && (own.dx !== parent.dx || own.dy !== parent.dy) ? [{ id: section.id, ...own }] : [];
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
  /** How many measures of the board failed before and after (space.ts computedFaults). */
  faults: { before: number; after: number };
}

export function rethinkRecord(turn: {
  run: DrawerRun; transcript: string; answers: RethinkAnswers; reask: RethinkRecord["reask"]; before: Measured; after: Measured;
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
  };
}
