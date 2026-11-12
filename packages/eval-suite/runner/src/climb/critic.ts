/**
 * One review of a board, a round of the critic loop (critic-loop.ts): the
 * lints canvas_check runs, then the reviewers, a fuzzy lint beside the strict
 * one. Ford: "I think the reviewer should definitely see the whole board so
 * it gets context. I think it should be able to see each of the sections
 * cropped", "Instead of just giving it a, like, flat nine."
 *
 * Two kinds of reviewer run at once on one snapshot (review-inputs.ts cuts
 * the board into their units). Stage A, one reviewer, has the whole board:
 * where the sections sit and the wires between them. Stage B has one
 * reviewer per section, and one for the items in no section. Each stage B
 * reviewer reads 4 images the runner makes (the whole board, its section
 * with the smart guides and a ruler, its neighbourhood, its wires tagged)
 * and the numbers of its objects and wires. Every reviewer is GPT-6.1 Sol
 * through the Codex CLI, low effort, fast mode.
 *
 * An answer is JSON findings, each a blocker, a should or a nit. A finding
 * can carry one canvas tool call that fixes it and a sketch of the result:
 * Ford: "give very direct feedback if it's like, hey, like, this pixel thing
 * here should be moved, like, 10 pixels to the right". A reviewer can ask to
 * look further once: the runner sends the crops it named and it answers
 * again. The findings merge across the units, so one fault that two
 * reviewers see reaches the drawer once, with every distinct call.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import { CROP_MAX_WIDTH, renderCropPng } from "./crop.ts";
import { CANVAS_REPO_ROOT } from "./paths.ts";
import { loadCanvas, renderBoardPng, type CanvasFile, type CanvasModules, type Lint, type WorldRect } from "./render.ts";
import {
  TOOL_FACTS, boardWireSheet, fadeMarks, linkedSections, lookFrame, measuresOf, neighbourhoodFrame, objectLines, reviewUnits, routesOf,
  rulerMarks, scaleText, sectionFrame, sectionLines, sectionMapSvg, wholeBoardMarks, wireMarks, wireSheet, wireSheetLines,
  type Board, type ReviewUnit, type WireRow,
} from "./review-inputs.ts";
import { BOARD_CALL_TOOLS, BOARD_UNIT, LOOSE_UNIT, SECTION_CALL_TOOLS, type Mark, type ProposedCall, type ReviewCall } from "./review-types.ts";
import { boardTotals, loadWireModules, wireFacts, type WireFact, type WireModules } from "./wires.ts";

export const CRITIC_MODEL = "gpt-6.1-sol";
export const CRITIC_EFFORT = "low";
/** One answer's time, from its own start. A reviewer that runs out gives no answer. */
const CRITIC_TIMEOUT_MS = 150_000;
/**
 * Ford, on the 3 rounds of round 2: "we need, like, more time for it to kind
 * of hone in on what's working and what's not", "like we should do like 10
 * rounds or something".
 */
export const DEFAULT_ROUNDS = 10;
/** The lint whose findings the guide crop tags (G1, G2, ...). */
const NEAR_MISS_RULE = "near-miss";
/**
 * The reviewers one review runs at once. `climb draw` reviews 5 boards at a
 * time, so 8 a board is at most 40 Codex processes: the load of round 3,
 * where none of 3,397 tile reviews failed to start.
 */
export const DEFAULT_COUNT = 8;
const MAX_FINDINGS_PER_UNIT = 10;
/** Design 4.4: "up to 5 extra views per review". */
const MAX_LOOKS = 5;

export const FINDING_KINDS = ["placement", "empty_space", "routing", "label_chip", "nesting", "colour", "icon"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** Most severe first, as the Sol loop grades a code review. */
export const SEVERITIES = ["blocker", "should", "nit"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Finding {
  kind: FindingKind;
  /** Board object or connection ids. */
  ids: string[];
  /** Visible labels, for items the critic could not match to an id. */
  labels: string[];
  problem: string;
  fix: string;
  /** blocker: a reader misreads it, or it is broken or hidden; should: clearly off, and a tool call fixes it; nit: polish. */
  severity: Severity;
}
/** One reviewer's finding: the tool call that fixes it, when one does, and the reviewer's sketch of the result. */
export interface UnitFinding extends Finding { call: ReviewCall | null; marks: Mark[] }
export interface MergedFinding extends Finding {
  /** The units whose reviewers reported it. */
  regions: string[];
  /** Every distinct call the reviewers of this fault proposed, each with the reviewer that sent it. */
  calls: ProposedCall[];
}

/** A unit as the record names it: its id and the board rect its images frame. */
export interface Region extends WorldRect { id: string }

export interface CriticOptions { count: number; rounds: number }

/** The canvas modules a review calls: loadCanvas's, this checkout's guide overlay, the tool entry and the wire facts. */
export interface ReviewCanvas extends CanvasModules {
  toolkit: CanvasModules["toolkit"] & {
    callToolkitTool(file: CanvasFile, name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }>;
  };
  overlay: {
    renderGuideOverlay(board: unknown, options: { canvasStyle?: unknown; region?: WorldRect }): { png: Buffer; legend: string[] };
    renderGuideOverlaySvg(board: unknown, options: { canvasStyle?: unknown; region?: WorldRect }): { svg: string; legend: string[] };
  };
  wires: WireModules;
}

export async function loadReviewCanvas(): Promise<ReviewCanvas> {
  const overlay = resolve(CANVAS_REPO_ROOT, "packages/canvas/src/session/perception/guide-overlay.ts");
  const canvas = await loadCanvas(CANVAS_REPO_ROOT);
  return {
    ...canvas,
    toolkit: canvas.toolkit as ReviewCanvas["toolkit"],
    overlay: (await import(overlay)) as ReviewCanvas["overlay"],
    wires: await loadWireModules(),
  };
}

/** `--critic-count <n>`: how many reviewers one review runs at once. */
export function parseCount(value: string | undefined): number {
  if (value === undefined) return DEFAULT_COUNT;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) throw new Error(`--critic-count must be a whole number of critics (6, ...), not ${value}`);
  return count;
}

/** `--critic-rounds <n>`: the most rounds the critic loop runs. */
export function parseRounds(value: string | undefined): number {
  if (value === undefined) return DEFAULT_ROUNDS;
  const rounds = Number(value);
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`--critic-rounds must be a whole number of rounds (10, ...), not ${value}`);
  return rounds;
}

/** The critic flags `climb draw` and `climb critic` share. */
export const CRITIC_FLAGS = ["--critic-count", "--critic-rounds"] as const;

export function parseCritic(flags: Map<string, string>): CriticOptions {
  return { count: parseCount(flags.get("--critic-count")), rounds: parseRounds(flags.get("--critic-rounds")) };
}

/** What a reviewer is told beside its unit's numbers. */
export interface UnitNotes {
  /** What canvas_check already gave the drawer on this unit: the tagged guides of image 2, then the other lints. */
  checked: string[];
  /** Earlier rounds' findings on this unit's items, each with the drawer's answer. */
  earlier: string[];
}

const KINDS_AND_SEVERITIES = [
  "Kinds:",
  "- placement: items off-centre or out of line in their section, uneven gaps, an item in the wrong group.",
  "- empty_space: large empty areas, or items crushed together.",
  "- routing: wires that cross, take detours, bend more than they need to, overlap each other, or hide their arrowhead.",
  "- label_chip: a wire label on a section border, on another wire or far from its wire, or a wire too short for its label.",
  "- nesting: an item in the wrong container, or a container that adds nothing.",
  "- colour: a colour choice that does not help a reader tell items and groups apart.",
  "- icon: a plain box where a real icon or brand logo would read better, or an icon that does not fit its meaning.",
  "Out of scope: the exact shade the theme paints each colour, border widths, corner radius and fonts.",
  "",
  "Severity:",
  "- blocker: a reader misreads the board, or something is broken, hidden or cut off.",
  "- should: clearly off to a careful designer, and a tool call or two fixes it.",
  "- nit: polish or taste. The board can ship with it.",
];

/** The arguments each call tool takes, as the answer schema spells them (decodeCall turns them into the tool's own). */
const CALL_HELP: Record<(typeof BOARD_CALL_TOOLS)[number], string> = {
  move: "move {id, to: {x, y}} puts a box's top-left corner at a board point. move {id, by: {dx, dy}} shifts it. Set exactly one of to and by. A section's contents move with it.",
  resize: "resize {id, width, height} sets one or both sizes and holds the top-left corner. resize {id, like} copies the size of the box with that id.",
  change_connection: "change_connection {id, from: {objectId, anchor}, to: {objectId, anchor}} gives a wire another side (anchor: top, right, bottom, left or center, or null for the router's choice) or another end. Set the end that stays as it is to null.",
  route: "route {id, points: [{x, y}, ...]} sets a wire's corners: the corners between its 2 ports only, in order, every leg horizontal or vertical."
    + " route {id, shift: {segment, to}} slides one numbered segment of the route (s1 is segment 1) to x or y = to."
    + " route {id, reset: true} hands the wire back to the router. Set exactly one of points, shift and reset."
    + " To slide one leg, use shift: the tool refuses a corner list more often.",
  move_label: "move_label {id, along, offset} pins a wire's label chip: along is 0 to 1 along the wire (null for the middle), offset pushes it sideways in px (null for none).",
  arrange_section: "arrange_section {section, rows: [[id, ...], ...]} lays a section's shapes and icons out in rows, in that order.",
  fit_section: "fit_section {id} sizes a section to its contents.",
};

function answerHelp(tools: readonly (typeof BOARD_CALL_TOOLS)[number][]): string[] {
  return [
    "Name items by the ids below. Put the visible text in labels when no id matches.",
    "Give each finding a one-line fix the drawer can make with the canvas tools.",
    "When one tool call fixes the fault, also give that call in `call`. The runner tries each call on a copy of the board and shows the drawer the result, so a call must be exact:"
    + " take ids and coordinates from the text below, not from an image alone. Set the fields a call does not use to null. Else set `call` to null.",
    "The call tools:",
    ...tools.map((tool) => `- ${CALL_HELP[tool]}`),
    "A finding carries one call. When a fault takes more, give the call that does most and write the rest in `fix`.",
    "For wires that share a trunk, give the call that takes one wire off it: another side with change_connection, or its own lane with a route shift.",
    "A fault in colour, text or shape, a missing wire or an item to delete has no call: write the fix as text.",
    "`marks` is your sketch of what a call gives, in board coordinates: `path` for a wire's new route, `box` for a box's new place. Send marks only with a call. Else [].",
    "",
    "Tool facts:",
    ...TOOL_FACTS.map((fact) => `- ${fact}`),
    "",
    `Look further: when you cannot judge a fault without a closer view, list up to ${MAX_LOOKS} views in \`look\`, each a list of the ids to frame together (["executor", "capabilities", "e_preflight"]).`
    + " The runner then sends those crops with their measured routes, and you answer once more. Else set `look` to [].",
    `Give at most ${MAX_FINDINGS_PER_UNIT} findings, most severe first.`,
    "Do not run commands or read files.",
  ];
}

const block = (title: string, lines: string[]) => ["", title, ...(lines.length ? lines : ["(none)"])];
const notesBlocks = (notes: UnitNotes) => [
  ...(notes.checked.length ? ["", "The strict lint already gave the drawer these. Do not report them again:", ...notes.checked] : []),
  ...(notes.earlier.length ? [
    "",
    "Earlier rounds reported these, and the drawer answered each. Report one again only when the images still show it and the drawer's reason does not hold:",
    ...notes.earlier,
  ] : []),
];

/** What a stage B prompt prints: the scale of each image and the unit's text blocks. */
export interface SectionText {
  /** Image px per board px of image 1, image 2, and images 3 and 4. */
  scales: { board: number; section: number; neighbourhood: number };
  /** False in a run with no ruler on image 2 (gate 1). */
  ruler: boolean;
  objects: string[];
  measures: string[];
  wires: string[];
  totals: string;
  notes: UnitNotes;
}

export function sectionPrompt(unit: ReviewUnit, text: SectionText): string {
  const { x, y, width, height } = unit.rect;
  const part = unit.section ? "section" : "items";
  return [
    unit.section
      ? `You review one section of a diagram board: ${unit.id} ${JSON.stringify(unit.section.text ?? "")}, at board x ${x} to ${x + width}, y ${y} to ${y + height}.`
        + " It is yours: its objects, where they sit, and every wire that starts in it, ends in it or passes through it."
      : `You review the items of a diagram board that sit in no section: ${unit.owned.map((object) => object.id).join(", ")}.`
        + " They are yours: where they sit, and every wire that starts or ends on one.",
    "Another reviewer has each other section, and one has the whole board: where the sections sit is theirs.",
    "",
    `Image 1 is the whole board (${scaleText(text.scales.board)}). Your ${part} ${unit.section ? "is" : "are"} outlined in red, the sections wired to ${unit.section ? "it" : "them"} in blue.`,
    `Image 2 is your ${part} (${scaleText(text.scales.section)}), with the board's smart guides drawn in pink.`
    + " A faint line runs along edges and centres that are in line. A strong line with a tag (G1, G2, ...) is a near-miss: the line an item, a gap or an arrowhead sits a few px off."
    + (text.ruler ? " The ruler on its top and left edges gives board coordinates: the numbers the text below and the tools use." : ""),
    `Image 3 is your ${part} with every object wired to ${unit.section ? "it" : "them"} and the full path of every wire on your wire sheet (${scaleText(text.scales.neighbourhood)}). The rest of the board is faded.`,
    "Image 4 is image 3 with each wire tagged as on the wire sheet (W1, W2, ...): a ring on each bend, a square on each port. A grey tag (W5+W6+W7) names the wires that share that trunk.",
    "",
    `List every layout and structure fault of your ${part} and your wires. You are a fuzzy lint: a strict lint already ran, so look for what it misses.`,
    "Look at each item, wire and wire label in turn. Report a fault the moment it looks wrong to a careful designer. Do not stop at the first few.",
    "Use image 2 to judge what is in line: an item on none of the lines its neighbours share, a row with unequal gaps, a wire that bends because its two ends are off one line.",
    "Use image 4 and the wire sheet to judge each wire: a bend it does not need, a detour, a port on the wrong side, a trunk that hides which wire goes where, a label off its wire.",
    "",
    ...KINDS_AND_SEVERITIES,
    "",
    ...answerHelp(SECTION_CALL_TOOLS),
    ...notesBlocks(text.notes),
    ...block("Objects:", [...text.objects, ...text.measures]),
    ...block("Wire sheet (tag id · from → to · kind · ports · length · bends · route · style colour · arrow · label; then the route with the segment numbers `route` takes, the corner points, the boxes it runs through, the wires it crosses, shared trunks):", text.wires),
    ...block("Board totals:", [text.totals]),
  ].join("\n");
}

/** What the stage A prompt prints. */
export interface BoardText { scale: number; sections: string[]; wires: string[]; totals: string; notes: UnitNotes }

export function boardPrompt(text: BoardText): string {
  return [
    "You review a whole diagram board: where its sections sit, the reading order, the long wires between sections and the empty areas.",
    "One reviewer has the inside of each section. Leave the inside of a section to them.",
    "",
    `Image 1 is the whole board at the size its judges see (${scaleText(text.scale)}).`,
    "Image 2 is a map of the board's sections, made from the board file, in the same frame as image 1: a box for each section, and a line between 2 sections that wires join, with the number of wires.",
    "",
    "List every fault in how the board is laid out. You are a fuzzy lint: a strict lint already ran, so look for what it misses.",
    "Look at each section and each wire between sections in turn: a section far from the sections it is wired to, a reading order that jumps, a wire that runs around a section or the long way, sections out of line or with unequal gaps, a large empty area.",
    "",
    ...KINDS_AND_SEVERITIES,
    "",
    ...answerHelp(BOARD_CALL_TOOLS),
    ...notesBlocks(text.notes),
    ...block("Sections (id · parent · x · y of the top-left corner · width · height · title):", text.sections),
    ...block("Wires between sections (tag id · from → to · the 2 parts it joins · ports · length · bends · route · style colour · arrow · label; then the route with the segment numbers `route` takes, the corner points, the boxes it runs through, the wires it crosses, shared trunks):", text.wires),
    ...block("Board totals:", [text.totals]),
  ].join("\n");
}

/** One "look further" view as the second prompt prints it. */
export interface LookView { ids: string[]; frame: WorldRect; scale: number; routes: string[]; measures: string[] }

/** The second prompt of a reviewer that asked to look further: everything it had, its first answer and the views. */
export function lookPrompt(prompt: string, firstAnswer: string, views: LookView[], imagesBefore: number): string {
  return [
    prompt,
    "",
    "You asked to look further. Your first answer was:",
    firstAnswer.trim(),
    "",
    "The views you asked for:",
    ...views.flatMap((view, index) => [
      `Image ${imagesBefore + index + 1}: ${view.ids.join(", ")}. Board x ${Math.round(view.frame.x)} to ${Math.round(view.frame.x + view.frame.width)}, y ${Math.round(view.frame.y)} to ${Math.round(view.frame.y + view.frame.height)} (${scaleText(view.scale)}).`,
      ...(view.routes.length ? ["ROUTES", ...view.routes] : []),
      ...view.measures,
    ]),
    "",
    "Answer again in full, with every finding you still hold. This answer replaces your first. Set `look` to [].",
  ].join("\n");
}

// ---- The answer: the Codex `--output-schema` (OpenAI strict structured output) and its parse. ----

const ANCHORS = ["top", "right", "bottom", "left", "center"] as const;
const STRING = { type: "string" };
const NUMBER = { type: "number" };
const MAYBE_NUMBER = { type: ["number", "null"] };
const shape = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const maybe = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const XY = shape({ x: NUMBER, y: NUMBER });
const BOX = shape({ x: NUMBER, y: NUMBER, width: NUMBER, height: NUMBER });
const END = shape({ objectId: STRING, anchor: { type: ["string", "null"], enum: [...ANCHORS, null] } });
const toolName = (tool: string) => ({ type: "string", enum: [tool] });

/**
 * One typed shape a tool. Strict output takes no open object, so a call's
 * arguments cannot be free JSON: each tool spells its own, every field
 * required, the unused ones null.
 */
const CALL_SHAPES: Record<(typeof BOARD_CALL_TOOLS)[number], object> = {
  move: shape({ tool: toolName("move"), id: STRING, to: maybe(XY), by: maybe(shape({ dx: NUMBER, dy: NUMBER })) }),
  resize: shape({ tool: toolName("resize"), id: STRING, width: MAYBE_NUMBER, height: MAYBE_NUMBER, like: { type: ["string", "null"] } }),
  change_connection: shape({ tool: toolName("change_connection"), id: STRING, from: maybe(END), to: maybe(END) }),
  route: shape({
    tool: toolName("route"), id: STRING, points: maybe({ type: "array", items: XY }),
    shift: maybe(shape({ segment: { type: "integer" }, to: NUMBER })), reset: { type: ["boolean", "null"] },
  }),
  move_label: shape({ tool: toolName("move_label"), id: STRING, along: MAYBE_NUMBER, offset: MAYBE_NUMBER }),
  arrange_section: shape({ tool: toolName("arrange_section"), section: STRING, rows: { type: "array", items: { type: "array", items: STRING } } }),
  fit_section: shape({ tool: toolName("fit_section"), id: STRING }),
};

/** The answer schema of a reviewer whose calls can name `tools`. */
export function answerSchema(tools: readonly (typeof BOARD_CALL_TOOLS)[number][]): object {
  return shape({
    findings: {
      type: "array",
      items: shape({
        kind: { type: "string", enum: FINDING_KINDS },
        ids: { type: "array", items: STRING },
        labels: { type: "array", items: STRING },
        problem: STRING,
        fix: STRING,
        severity: { type: "string", enum: SEVERITIES },
        call: { anyOf: [...tools.map((tool) => CALL_SHAPES[tool]), { type: "null" }] },
        marks: { type: "array", items: shape({ path: maybe({ type: "array", items: XY }), box: maybe(BOX) }) },
      }),
    },
    look: { type: "array", items: { type: "array", items: STRING } },
  });
}

type Fields = Record<string, unknown>;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isName = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const fields = (value: unknown): Fields | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Fields : null;
const pointOf = (value: unknown): [number, number] | null => {
  const point = fields(value);
  return point && isNumber(point.x) && isNumber(point.y) ? [point.x, point.y] : null;
};
const pointsOf = (value: unknown): Array<[number, number]> | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points = value.map(pointOf);
  return points.every((point) => point !== null) ? points as Array<[number, number]> : null;
};

/** A call's fields as the schema spells them, as the tool's own arguments. Null when they do not make one call. */
const CALL_ARGS: Record<(typeof BOARD_CALL_TOOLS)[number], (call: Fields) => Record<string, unknown> | null> = {
  move: (call) => {
    const [to, by] = [pointOf(call.to), fields(call.by)];
    const shift = by && isNumber(by.dx) && isNumber(by.dy) ? { dx: by.dx, dy: by.dy } : null;
    if (!isName(call.id) || (to === null) === (shift === null)) return null;
    return to ? { id: call.id, to: { x: to[0], y: to[1] } } : { id: call.id, by: shift };
  },
  resize: (call) => {
    if (!isName(call.id)) return null;
    if (isName(call.like)) return { id: call.id, like: call.like };
    if (!isNumber(call.width) && !isNumber(call.height)) return null;
    return { id: call.id, ...(isNumber(call.width) ? { width: call.width } : {}), ...(isNumber(call.height) ? { height: call.height } : {}) };
  },
  change_connection: (call) => {
    const end = (value: unknown) => {
      const raw = fields(value);
      if (!raw || !isName(raw.objectId)) return null;
      return { objectId: raw.objectId, ...(ANCHORS.includes(raw.anchor as (typeof ANCHORS)[number]) ? { anchor: raw.anchor } : {}) };
    };
    const [from, to] = [end(call.from), end(call.to)];
    if (!isName(call.id) || (!from && !to)) return null;
    return { id: call.id, patch: { ...(from ? { from } : {}), ...(to ? { to } : {}) } };
  },
  route: (call) => {
    const points = pointsOf(call.points);
    const raw = fields(call.shift);
    const shift = raw && Number.isInteger(raw.segment) && isNumber(raw.to) ? { segment: raw.segment, to: raw.to } : null;
    const modes = [points ? { points } : null, shift ? { shift } : null, call.reset === true ? { reset: true } : null].filter((mode) => mode !== null);
    return isName(call.id) && modes.length === 1 ? { id: call.id, ...modes[0] } : null;
  },
  move_label: (call) => isName(call.id)
    ? { id: call.id, along: isNumber(call.along) ? call.along : "auto", ...(isNumber(call.offset) ? { offset: call.offset } : {}) }
    : null,
  arrange_section: (call) => {
    const rows = Array.isArray(call.rows) ? call.rows.filter((row) => Array.isArray(row) && row.length > 0) : [];
    return isName(call.section) && rows.length > 0 && rows.every((row) => (row as unknown[]).every(isName)) ? { section: call.section, rows } : null;
  },
  fit_section: (call) => isName(call.id) ? { id: call.id } : null,
};

/**
 * A finding's `call` as a ReviewCall, or null: no call, a tool this reviewer
 * cannot name, or fields that do not make one call. The finding then goes on
 * as text.
 */
export function decodeCall(value: unknown, tools: readonly string[]): ReviewCall | null {
  const call = fields(value);
  if (!call || typeof call.tool !== "string" || !tools.includes(call.tool) || !(call.tool in CALL_ARGS)) return null;
  const args = CALL_ARGS[call.tool as keyof typeof CALL_ARGS](call);
  return args && { tool: call.tool, args };
}

function decodeMarks(value: unknown): Mark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): Mark[] => {
    const mark = fields(raw);
    const path = pointsOf(mark?.path);
    const box = fields(mark?.box);
    return [
      ...(path && path.length > 1 ? [{ style: "sketch" as const, path }] : []),
      ...(box && [box.x, box.y, box.width, box.height].every(isNumber)
        ? [{ style: "sketch" as const, box: { x: box.x as number, y: box.y as number, width: box.width as number, height: box.height as number } }] : []),
    ];
  });
}

/** One reviewer's answer. */
export interface Answer { findings: UnitFinding[]; look: string[][] }

/**
 * One reviewer's answer, refusing a finding off the schema. A call the
 * reviewer cannot make is dropped, and its finding stays: `tools` is
 * SECTION_CALL_TOOLS or BOARD_CALL_TOOLS.
 */
export function parseAnswer(text: string, tools: readonly string[]): Answer {
  const value = JSON.parse(text) as { findings?: unknown; look?: unknown };
  if (!Array.isArray(value.findings)) throw new Error(`"findings" must be a list`);
  const findings = value.findings.map((raw, index): UnitFinding => {
    const finding = raw as Fields;
    const where = (detail: string) => new Error(`findings[${index}]: ${detail}`);
    const strings = (key: string) => {
      const list = finding[key];
      if (!Array.isArray(list) || !list.every((item) => typeof item === "string")) throw where(`"${key}" must be a list of strings`);
      return list.map((item) => item.trim()).filter(Boolean);
    };
    if (!FINDING_KINDS.includes(finding.kind as FindingKind)) throw where(`unknown kind ${JSON.stringify(finding.kind)}`);
    if (!SEVERITIES.includes(finding.severity as Severity)) throw where(`severity must be blocker, should or nit`);
    for (const key of ["problem", "fix"]) {
      if (typeof finding[key] !== "string" || !(finding[key] as string).trim()) throw where(`"${key}" must be a non-empty string`);
    }
    const call = decodeCall(finding.call, tools);
    return {
      kind: finding.kind as FindingKind,
      ids: strings("ids"),
      labels: strings("labels"),
      problem: (finding.problem as string).trim(),
      fix: (finding.fix as string).trim(),
      severity: finding.severity as Severity,
      call,
      // A sketch shows what a call gives, so it goes with one.
      marks: call ? decodeMarks(finding.marks) : [],
    };
  });
  const look = (Array.isArray(value.look) ? value.look : [])
    .map((view) => Array.isArray(view) ? [...new Set(view.filter(isName).map((id) => id.trim()))] : [])
    .filter((view) => view.length > 0)
    .slice(0, MAX_LOOKS);
  return { findings, look };
}

const rank = (finding: { severity: Severity }) => SEVERITIES.indexOf(finding.severity);
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether two units' findings name one fault: one kind, and the ids of one
 * hold every id of the other (or, with no ids, they share a label). One
 * shared id is not enough: on a dense board every wire shares an item with
 * the next, and round 2 folded 16 routing faults of one board into a single
 * finding that kept the words of one.
 */
function sameFault(a: Finding, b: Finding): boolean {
  if (a.kind !== b.kind || (a.ids.length === 0) !== (b.ids.length === 0)) return false;
  const within = (few: string[], many: string[]) => few.every((item) => many.includes(item));
  if (a.ids.length > 0) return within(a.ids, b.ids) || within(b.ids, a.ids);
  const labels = (finding: Finding) => finding.labels.length > 0 ? finding.labels.map(normal) : [`fix ${normal(finding.fix)}`];
  return labels(a).some((label) => labels(b).includes(label));
}

/** A value as JSON with its keys in order, so one call written two ways compares equal. */
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Fields)[key])}`).join(",")}}`
    : JSON.stringify(value);

/**
 * One list across the units of both stages: a fault two reviewers both see
 * reaches the drawer once. A finding joins a group when it is the same fault
 * as each member (sameFault), so no chain of part matches joins two faults.
 * One unit's findings stay apart, because its reviewer listed them as
 * separate faults. Ids not on the board move to labels. The merged finding
 * keeps the most severe finding's words, every id and label, every unit that
 * reported it, and every distinct call of the group with the unit that sent
 * it and that unit's sketch. Identical calls collapse to the first. The list
 * runs most severe first, then most units.
 */
export function mergeFindings(byUnit: Array<{ region: string; findings: UnitFinding[] }>, boardIds: ReadonlySet<string>): MergedFinding[] {
  interface Entry { finding: Finding; region: string; call: ProposedCall | null }
  const groups: Entry[][] = [];
  for (const { region, findings } of byUnit) {
    for (const { call, marks, ...finding } of findings) {
      const ids = finding.ids.filter((id) => boardIds.has(id));
      const labels = [...finding.labels, ...finding.ids.filter((id) => !boardIds.has(id))];
      const entry: Entry = { finding: { ...finding, ids, labels }, region, call: call && { unit: region, call, marks } };
      const group = groups.find((members) => members.every((member) => member.region !== region && sameFault(member.finding, entry.finding)));
      if (group) group.push(entry);
      else groups.push([entry]);
    }
  }
  const unique = (items: string[]) => [...new Set(items)];
  return groups.map((group): MergedFinding => {
    const lead = group.reduce((best, entry) => rank(entry.finding) < rank(best.finding) ? entry : best);
    const calls = new Map<string, ProposedCall>();
    for (const { call } of group) if (call && !calls.has(canonical(call.call))) calls.set(canonical(call.call), call);
    return {
      ...lead.finding,
      ids: unique(group.flatMap((entry) => entry.finding.ids)),
      labels: unique(group.flatMap((entry) => entry.finding.labels)),
      regions: unique(group.map((entry) => entry.region)).sort(),
      calls: [...calls.values()],
    };
  }).sort((a, b) => rank(a) - rank(b) || b.regions.length - a.regions.length);
}

export function criticArgs(dir: string, prompt: string, images: string[], schemaPath: string, outputPath: string): string[] {
  return [
    "exec",
    "-m", CRITIC_MODEL,
    "-c", `model_reasoning_effort="${CRITIC_EFFORT}"`,
    "-c", `service_tier="fast"`,
    "--enable", "fast_mode",
    "--skip-git-repo-check",
    "--ephemeral",
    "-s", "read-only",
    "-C", dir,
    ...images.flatMap((image) => ["-i", image]),
    "--output-schema", schemaPath,
    "-o", outputPath,
    prompt,
  ];
}

export interface UnitRecord {
  /** The unit, where the tile grid had a tile: BOARD_UNIT, a section's id or LOOSE_UNIT, and the board rect its images frame. */
  region: Region;
  stage: "A" | "B";
  /** The unit's folder under the review's, with its images, prompts and raw answers. */
  dir: string;
  /** The images of its first prompt, in order. */
  images: string[];
  objects: number;
  wires: number;
  /** Both answers, when it looked further. */
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  /** Why the answer did not parse, or null when it did. */
  error: string | null;
  /** The views it asked to look at. */
  look: string[][];
  /** Why its second answer did not replace the first, or null when it did or it asked for no view. */
  lookError: string | null;
  findings: UnitFinding[];
}
export interface CritiqueRecord {
  board: string;
  model: string;
  effort: string;
  count: number;
  startedAt: string;
  /** Wall clock for the whole review: lints, renders, every reviewer and the merge. */
  durationMs: number;
  /** The lints, the wire facts and the renders. */
  renderMs: number;
  /** What canvas_check finds on the board. */
  lints: Lint[];
  /** One record a unit: the whole board, each section, the loose items. */
  regions: UnitRecord[];
  /** The reviewers' findings, merged. */
  findings: MergedFinding[];
}

/** An earlier round's finding as a reviewer reads it: the finding and the drawer's answer, in one line. */
export interface EarlierFinding { ids: string[]; regions: string[]; line: string }

async function runCritic(args: string[], timeoutMs: number): Promise<{ exitCode: number | null; timedOut: boolean; stderr: string }> {
  // Codex reads a piped stdin into the prompt, so stdin is closed.
  const child = spawn("codex", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
  const exitCode = await new Promise<number | null>((done, fail) => {
    child.on("error", fail);
    child.on("close", (code) => done(code));
  });
  clearTimeout(timer);
  return { exitCode, timedOut, stderr };
}

/** `svg` with marks painted on top, at `size` px when given: the viewBox stays in board coordinates. */
function markedSvg(svg: string, marks: string, size?: { width: number; height: number }): string {
  const end = svg.lastIndexOf("</svg>");
  const marked = `${svg.slice(0, end)}${marks}${svg.slice(end)}`;
  if (!size) return marked;
  const root = /^\s*<svg\b[^>]*>/.exec(marked)![0];
  const sized = root.replace(/(\bwidth\s*=\s*")[^"]*"/, `$1${size.width}"`).replace(/(\bheight\s*=\s*")[^"]*"/, `$1${size.height}"`);
  return marked.replace(root, sized);
}

/** A unit's folder name: its id, kept clear of the two units that are not sections. */
const unitDir = (unit: ReviewUnit) => {
  const name = unit.id.replace(/[^A-Za-z0-9._-]/g, "_");
  return unit.section && (name === BOARD_UNIT || name === LOOSE_UNIT) ? `section-${name}` : name;
};
/** The scale that holds the long edge of a crop of `rect` to CROP_MAX_WIDTH px. */
const cropScale = (rect: WorldRect) => Math.min(1, CROP_MAX_WIDTH / Math.max(rect.width, rect.height));
const lintLine = (lint: Lint) => `${lint.rule}: ${lint.message}${lint.suggestion ? ` (${lint.suggestion})` : ""}`;

/** One reviewer's work order: its images and its first prompt. */
interface Job { unit: ReviewUnit; dir: string; images: string[]; prompt: string; rows: WireRow[] }

/**
 * Lint and render `boardPath`, run the whole-board reviewer and one reviewer
 * per section (and one for the loose items) at once, and merge the findings.
 * Writes into `outDir`: overview.png, guides.png (the overview with the smart
 * guides), critique.json (a CritiqueRecord), and per unit under
 * `units/<id>/`: its images (1-board.png, 2-section.png, 3-neighbourhood.png
 * and 4-wires.png, or 1-board.png and 2-map.png for the whole board),
 * prompt-1.md and answer-1.json, and when it looked further look-<n>.png,
 * prompt-2.md and answer-2.json.
 */
export async function critiqueBoard(options: {
  canvas: ReviewCanvas;
  boardPath: string;
  outDir: string;
  critic: CriticOptions;
  /** Earlier rounds' findings. Each goes to the units that hold one of its items (with no ids: the units that reported it), and to the whole-board reviewer. */
  earlier?: EarlierFinding[];
  /** Review these units only. The gate runs review one section. */
  only?: string[];
  /** False leaves the ruler off image 2 (gate 1 compares the calls with and without it). */
  ruler?: boolean;
}): Promise<CritiqueRecord> {
  const { canvas, boardPath, outDir } = options;
  const ruler = options.ruler ?? true;
  const earlier = options.earlier ?? [];
  const started = Date.now();
  const unitsDir = resolve(outDir, "units");
  rmSync(unitsDir, { recursive: true, force: true });
  mkdirSync(unitsDir, { recursive: true });
  const schemas = { A: resolve(outDir, "answer-board.schema.json"), B: resolve(outDir, "answer-section.schema.json") };
  writeFileSync(schemas.A, `${JSON.stringify(answerSchema(BOARD_CALL_TOOLS), null, 2)}\n`);
  writeFileSync(schemas.B, `${JSON.stringify(answerSchema(SECTION_CALL_TOOLS), null, 2)}\n`);

  const file: CanvasFile = canvas.toolkit.openCanvasFile(boardPath);
  const board = file.persisted as Board;
  const style = file.session.canvasStyle;
  const lints = canvas.lints.sessionDiagnostics(file.session, canvas.lints.FINISHING_RULES)
    .map(({ rule, severity, at, message, suggestion }): Lint => ({ rule, severity, at, message, suggestion }));
  const facts = wireFacts(canvas.wires, file);
  const totals = boardTotals(canvas.wires, file).text;
  const overview = renderBoardPng(canvas, file, undefined);
  writeFileSync(resolve(outDir, "overview.png"), overview.png);
  writeFileSync(resolve(outDir, "guides.png"), canvas.overlay.renderGuideOverlay(board, { canvasStyle: style }).png);
  const overviewSvg = canvas.render.renderBoardView(board, { width: overview.size.width, canvasStyle: style }).svg;
  const camera = canvas.render.boardCameraAtWorldScale(board, style);
  const png = (svg: string) => canvas.rasterize.rasterizeSvgToPng(svg).png;
  // `look` reads the board through one session, so its calls run one at a time.
  const lookGate = new Semaphore(1);
  const look = (view: string | string[]) => lookGate.run(() => canvas.toolkit.callToolkitTool(file, "look", { view }));

  const { units } = reviewUnits(board);
  const reviewed = units.filter((unit) => !options.only || options.only.includes(unit.id));
  const boardIds = new Set([...board.objects.map((object) => object.id), ...board.connections.map((wire) => wire.id)]);
  /** One prompt to one reviewer, and its answer parsed. */
  const ask = async (job: Job, turn: 1 | 2, prompt: string, images: string[]) => {
    const tools = job.unit.stage === "A" ? BOARD_CALL_TOOLS : SECTION_CALL_TOOLS;
    const answerPath = resolve(job.dir, `answer-${turn}.json`);
    writeFileSync(resolve(job.dir, `prompt-${turn}.md`), `${prompt}\n`);
    const run = await runCritic(criticArgs(job.dir, prompt, images, schemas[job.unit.stage], answerPath), CRITIC_TIMEOUT_MS);
    try {
      const text = readFileSync(answerPath, "utf8");
      return { run, text, answer: parseAnswer(text, tools), error: null };
    } catch (failure) {
      const error = run.timedOut ? "timed out" : `${failure instanceof Error ? failure.message : String(failure)}\n${run.stderr.slice(-2000)}`;
      return { run, text: "", answer: null, error };
    }
  };
  /** The crops and the measured text of the views a reviewer asked for. */
  const lookViews = async (job: Job, asked: string[][]): Promise<{ views: LookView[]; images: string[] }> => {
    const views: LookView[] = [];
    const images: string[] = [];
    for (const view of asked) {
      const ids = view.filter((id) => boardIds.has(id));
      const frame = lookFrame(ids, board, facts);
      if (!frame) continue;
      const scale = cropScale(frame);
      const image = resolve(job.dir, `look-${views.length + 1}.png`);
      writeFileSync(image, renderCropPng(canvas, file, frame, { maxWidth: Math.round(frame.width * scale) }).png);
      const text = await look(ids);
      const wires = new Set(facts.filter((fact) => ids.includes(fact.id) || ids.includes(fact.from) || ids.includes(fact.to)).map((fact) => fact.id));
      views.push({ ids, frame, scale, routes: text.isError ? [] : routesOf(text.text, wires), measures: text.isError ? [] : measuresOf(text.text) });
      images.push(image);
    }
    return { views, images };
  };

  /** One unit's review: the first answer, and the second when the reviewer asked to look further. */
  const review = async (job: Job): Promise<UnitRecord> => {
    const begun = Date.now();
    const first = await ask(job, 1, job.prompt, job.images);
    let { run, answer, error } = first;
    let lookError: string | null = null;
    const asked = first.answer?.look ?? [];
    if (first.answer && asked.length > 0) {
      const { views, images } = await lookViews(job, asked);
      if (views.length === 0) lookError = "no id of the views is on the board";
      else {
        const second = await ask(job, 2, lookPrompt(job.prompt, first.text, views, job.images.length), [...job.images, ...images]);
        // The second answer replaces the first. A second answer that fails keeps the first, so a look never loses findings.
        if (second.answer) ({ run, answer } = second);
        else lookError = second.error;
      }
    }
    return {
      region: { id: job.unit.id, ...job.unit.rect },
      stage: job.unit.stage,
      dir: relative(outDir, job.dir),
      images: job.images.map((image) => relative(outDir, image)),
      objects: job.unit.owned.length,
      wires: job.rows.length,
      durationMs: Date.now() - begun,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      error,
      look: asked,
      lookError,
      findings: answer?.findings ?? [],
    };
  };

  /** One unit's images and its first prompt. */
  const jobFor = async (unit: ReviewUnit): Promise<Job> => {
    const dir = resolve(unitsDir, unitDir(unit));
    mkdirSync(dir, { recursive: true });
    const save = (name: string, data: Buffer) => {
      writeFileSync(resolve(dir, name), data);
      return resolve(dir, name);
    };
    if (unit.stage === "A") {
      const rows = boardWireSheet(units, facts);
      const images = [save("1-board.png", overview.png), save("2-map.png", png(sectionMapSvg(units, facts, camera, overview.size.width)))];
      const prompt = boardPrompt({
        scale: overview.size.scale,
        sections: sectionLines(units),
        wires: wireSheetLines(rows),
        totals,
        notes: { checked: lints.map(lintLine), earlier: earlier.map((finding) => finding.line) },
      });
      return { unit, dir, images, prompt, rows };
    }
    const rows = wireSheet(unit, facts);
    const own = unit.section ? [unit.rect] : unit.owned.map((object) => object.geometry);
    const section = sectionFrame(unit.rect, CROP_MAX_WIDTH, ruler);
    const guides = canvas.overlay.renderGuideOverlaySvg(board, { canvasStyle: style, region: section.frame });
    const sectionSize = { width: Math.round(section.frame.width * section.scale), height: Math.round(section.frame.height * section.scale) };
    const neighbourhood = neighbourhoodFrame(unit, rows, board);
    const scale = cropScale(neighbourhood);
    const fade = fadeMarks(unit, rows, board, neighbourhood, scale);
    const crop = (marks: string) => renderCropPng(canvas, file, neighbourhood, { marks, maxWidth: Math.round(neighbourhood.width * scale) }).png;
    const images = [
      save("1-board.png", png(markedSvg(overviewSvg, wholeBoardMarks(own, linkedSections(unit, rows, board, units), overview.size.scale)))),
      save("2-section.png", png(markedSvg(guides.svg, ruler ? rulerMarks(section.frame, section.scale) : "", sectionSize))),
      save("3-neighbourhood.png", crop(fade)),
      save("4-wires.png", crop(`${fade}${wireMarks(rows, scale)}`)),
    ];
    const holds = new Set([unit.id, ...unit.owned.map((object) => object.id), ...rows.map((row) => row.fact.id)]);
    const here = (ids: string[]) => ids.some((id) => holds.has(id));
    const measures = await look(unit.section ? unit.id : unit.owned.map((object) => object.id));
    const prompt = sectionPrompt(unit, {
      scales: { board: overview.size.scale, section: section.scale, neighbourhood: scale },
      ruler,
      objects: objectLines(unit, rows, board),
      measures: measures.isError ? [] : measuresOf(measures.text),
      wires: wireSheetLines(rows),
      totals,
      notes: {
        checked: [...guides.legend, ...lints.filter((lint) => lint.rule !== NEAR_MISS_RULE && here(lint.at)).map(lintLine)],
        earlier: earlier.filter((finding) => finding.ids.length ? here(finding.ids) : finding.regions.includes(unit.id)).map((finding) => finding.line),
      },
    });
    return { unit, dir, images, prompt, rows };
  };

  const gate = new Semaphore(options.critic.count);
  const running: Array<Promise<UnitRecord>> = [];
  try {
    // A reviewer starts when its images are ready, so it reads while the runner renders the next unit's.
    for (const unit of reviewed) {
      const job = await jobFor(unit);
      running.push(gate.run(() => review(job)));
    }
  } catch (failure) {
    await Promise.allSettled(running);
    throw failure;
  }
  const renderMs = Date.now() - started;
  const regions = await Promise.all(running);

  const findings = mergeFindings(regions.map((record) => ({ region: record.region.id, findings: record.findings })), boardIds);
  const record: CritiqueRecord = {
    board: boardPath,
    model: CRITIC_MODEL,
    effort: CRITIC_EFFORT,
    count: options.critic.count,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    renderMs,
    lints,
    regions,
    findings,
  };
  writeFileSync(resolve(outDir, "critique.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function critiqueSummary(record: CritiqueRecord): string {
  const failed = record.regions.filter((region) => region.error !== null);
  const raw = record.regions.reduce((sum, region) => sum + region.findings.length, 0);
  const calls = record.findings.reduce((sum, finding) => sum + finding.calls.length, 0);
  const looked = record.regions.filter((region) => region.look.length > 0).length;
  const slowest = Math.max(0, ...record.regions.map((region) => region.durationMs));
  const sections = record.regions.filter((region) => region.stage === "B" && region.region.id !== LOOSE_UNIT).length;
  return `${record.lints.length} lints · ${record.regions.length} units (${sections} sections) · ${raw} findings, ${record.findings.length} after merge`
    + ` · ${calls} calls · ${looked} looked further`
    + ` · ${(record.durationMs / 1000).toFixed(1)} s wall (render ${(record.renderMs / 1000).toFixed(1)} s, slowest reviewer ${(slowest / 1000).toFixed(1)} s)`
    + `${failed.length ? ` · ${failed.length} unparsed: ${failed.map((region) => region.region.id).join(", ")}` : ""}`;
}
