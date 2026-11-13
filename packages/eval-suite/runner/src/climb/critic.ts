/**
 * One review of a board, a round of the critic loop (critic-loop.ts): the
 * lints canvas_check runs, then the reviewers, a fuzzy lint beside the strict
 * one. Ford: "we run all of the reviewers in parallel for a given board. Then
 * it comes back as a list to the kind of writer essentially."
 *
 * 6 kinds of reviewer run at once on one snapshot (review-inputs.ts and
 * gaps.ts cut the board into their units): one per section, the gaps between
 * sections at full size, the wires between sections, where the sections sit,
 * the choices of colour, shape and icon against the brief, and the items in
 * no section. Every reviewer is GPT-6.1 Sol through the Codex CLI in fast
 * mode, at medium effort, or high on a large board (reviewerEffort).
 *
 * An answer is JSON findings, each a blocker, a should or a nit. A finding
 * says what is wrong and marks where, and never how to fix it. Ford: "I feel
 * like the reviewers should just be saying what's wrong And then the drawer
 * is just it's their decision on how to fix it". A reviewer can ask to look
 * further once: the runner sends the crops it named and it answers again.
 * The findings merge across the units, so one fault that two reviewers see
 * reaches the drawer once.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import { isRateLimitText, retryRateLimited } from "./backoff.ts";
import { CROP_MAX_WIDTH, renderCropPng } from "./crop.ts";
import { gapCoverage, gapCropLines, gapCrops, gapUnits, wiresIn } from "./gaps.ts";
import { CANVAS_REPO_ROOT } from "./paths.ts";
import { loadCanvas, renderBoardPng, type CanvasFile, type CanvasModules, type Lint, type WorldRect } from "./render.ts";
import {
  BORDER_NEAR_PX, BORDER_RUN_MIN_PX, CHOICES_UNIT, FONT, GAP_PX_PER_WIRE, LANE_NEAR_PX, LONG_WIRE_PX, LOOSE_UNIT, OWN, REVIEWER_KINDS, SPACE_UNIT, WIRE_UNIT,
  boardWireSheet, choicesLines, fadeMarks, grow, linkedSections, lookFrame, markBox, measuresOf, neighbourhoodFrame, objectLines, outline, reviewUnits,
  routesOf, rulerMarks, scaleText, sectionFrame, sectionLines, sectionMapSvg, spaceLines, touches, wholeBoardMarks, wireMarks, wireMeasureLines, wireSheet,
  untagWires, wireSheetLines,
  type Board, type Mark, type ReviewUnit, type ReviewerKind, type WireRow,
} from "./review-inputs.ts";
import { boardTotals, loadWireModules, sectionHeaders, wireFacts, type WireFact, type WireModules } from "./wires.ts";

export const CRITIC_MODEL = "gpt-6.1-sol";

export const EFFORTS = ["medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];
/** A board with this many wires or more, or this many objects or more (sections included), gets high effort. */
export const HIGH_EFFORT_WIRES = 30;
export const HIGH_EFFORT_OBJECTS = 40;

/**
 * The reasoning effort of a board's reviewers. Ford: "I definitely think we
 * need to bump up the reviewers to be medium and high reasoning for GPT 6.1
 * sole, where then the larger boards get higher reasoning. Smaller ones would
 * then be on medium".
 */
export function reviewerEffort(board: { objects: unknown[]; connections: unknown[] }): Effort {
  return board.connections.length >= HIGH_EFFORT_WIRES || board.objects.length >= HIGH_EFFORT_OBJECTS ? "high" : "medium";
}

/**
 * One answer's time, from its own start. A reviewer that runs out gives no
 * answer, and a round with a lost answer is not clean. Measured in the round
 * 5 gate runs, 8 reviewers at once: the slowest at medium (board 03, 8
 * reviewers) took 21 s, the slowest at high (board h1, 14 reviewers) 108 s.
 * Each limit is over 5 times the slowest, for a reviewer that looks further
 * (a second answer) on a loaded day.
 */
export const CRITIC_TIMEOUT_MS: Record<Effort, number> = { medium: 300_000, high: 600_000 };
/** The first wait after a reviewer hits a rate limit. It doubles: 20, 40, 80, 160 s. */
const REVIEWER_FIRST_WAIT_MS = 20_000;
/**
 * Ford: "this goes until It ends And, like, I'm definitely thinking we, like,
 * max out at 20".
 */
export const DEFAULT_ROUNDS = 20;
/**
 * One revise pass. The slowest of round 4's 219 took 12.5 minutes (median 67 s).
 * A pass that moves whole sections and routes again has more to do.
 */
export const DEFAULT_REVISE_MINUTES = 30;
/**
 * One board's loop, from its first review. When it is spent, the loop starts
 * no new revise pass: the round then reviewed is its last. Sized for 20
 * rounds: 19 revise passes of 5 minutes and 20 reviews of 7.
 */
export const DEFAULT_LOOP_MINUTES = 240;
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

export const FINDING_KINDS = ["placement", "spacing", "routing", "label_chip", "nesting", "colour", "icon", "missing"] as const;
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
  /** What is wrong, with the measured numbers. Never how to fix it. */
  problem: string;
  /** blocker: a reader misreads it, or it is broken or hidden; should: clearly off; nit: polish. */
  severity: Severity;
}
/** One reviewer's finding, with its highlight of the fault. */
export interface UnitFinding extends Finding { marks: Mark[] }
export interface MergedFinding extends Finding {
  /** The units whose reviewers reported it. */
  regions: string[];
  /** Each of those reviewers' highlights. */
  marks: Array<{ unit: string; marks: Mark[] }>;
}

/** A unit as the record names it: its id and the board rect its images frame. */
export interface Region extends WorldRect { id: string }

export interface CriticOptions {
  count: number;
  /** The most review rounds of a loop. */
  rounds: number;
  /** A forced effort, or null for reviewerEffort's choice. */
  effort: Effort | null;
  /** The time one revise pass may take. */
  reviseTimeoutMs: number;
  /** The time after which a loop starts no new revise pass. */
  loopTimeoutMs: number;
}

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

/** `--critic-rounds <n>`: the most review rounds the critic loop runs. */
export function parseRounds(value: string | undefined): number {
  if (value === undefined) return DEFAULT_ROUNDS;
  const rounds = Number(value);
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`--critic-rounds must be a whole number of rounds (20, ...), not ${value}`);
  return rounds;
}

/** `--critic-effort auto|medium|high`: auto (the default) lets the board's size decide. */
export function parseEffort(value: string | undefined): Effort | null {
  if (value === undefined || value === "auto") return null;
  if (!EFFORTS.includes(value as Effort)) throw new Error(`--critic-effort must be auto, medium or high, not ${value}`);
  return value as Effort;
}

/** `--revise-timeout-min <n>` and `--loop-timeout-min <n>`. */
function parseMinutes(flag: string, value: string | undefined, fallback: number): number {
  const minutes = Number(value ?? fallback);
  if (!(minutes > 0)) throw new Error(`${flag} must be a positive number of minutes, not ${value}`);
  return minutes * 60_000;
}

/** The critic flags `climb draw` and `climb critic` share. */
export const CRITIC_FLAGS = ["--critic-count", "--critic-rounds", "--critic-effort", "--revise-timeout-min", "--loop-timeout-min"] as const;

export function parseCritic(flags: Map<string, string>): CriticOptions {
  return {
    count: parseCount(flags.get("--critic-count")),
    rounds: parseRounds(flags.get("--critic-rounds")),
    effort: parseEffort(flags.get("--critic-effort")),
    reviseTimeoutMs: parseMinutes("--revise-timeout-min", flags.get("--revise-timeout-min"), DEFAULT_REVISE_MINUTES),
    loopTimeoutMs: parseMinutes("--loop-timeout-min", flags.get("--loop-timeout-min"), DEFAULT_LOOP_MINUTES),
  };
}

/** What a reviewer is told beside its unit's numbers. */
export interface UnitNotes {
  /** What canvas_check already gave the drawer on this unit. */
  checked: string[];
  /** Earlier rounds' findings on this unit's items that the drawer declined, each with its reason. */
  declined: string[];
  /** Faults the drawer declined twice. */
  settled: string[];
}

const KIND_LINES: Record<FindingKind, string> = {
  placement: "items off-centre or out of line in their section, uneven gaps, an item in the wrong group.",
  spacing: "sections or items packed too close for what lies between them, or far apart when wires join them.",
  routing: "wires that cross, take detours, bend more than they need to, run along a border, or hide their arrowhead or each other.",
  label_chip: "a wire label on or near a border, on a corner, a junction or an arrowhead, on another wire, far from its wire, or on a wire too short for it.",
  nesting: "an item in the wrong container, a container that adds nothing, or a group with no container.",
  colour: "a colour choice that does not help a reader tell items and groups apart.",
  icon: "a plain box where the kind has a shape or an icon, or an icon that does not fit its meaning.",
  missing: "an object or a relation the brief names that the board lacks.",
};

/** What every prompt says about an answer. */
function answerRules(): string[] {
  return [
    "Kinds:",
    ...FINDING_KINDS.map((kind) => `- ${kind}: ${KIND_LINES[kind]}`),
    "Out of scope: the exact shade the theme paints each colour, border widths, corner radius and fonts.",
    "",
    "Severity:",
    "- blocker: a reader misreads the board, or something is broken, hidden or cut off.",
    "- should: clearly off to a careful designer.",
    "- nit: polish or taste. The board can ship with it.",
    "",
    "Be strict. Report every fault you can see and measure. Do not stop at the first few.",
    "Name items by the ids below. Put the visible text in labels when no id matches."
    + " In `problem`, name each wire by its id, never by a tag of an image (W3, G1) alone: the drawer does not see the tags.",
    "State each fault as a problem: what is wrong, where, and by how much, with the numbers you measured.",
    "Do not say how to fix it. Do not propose a tool call, a new position, a new size or a new route. The drawer decides the fix.",
    "`marks` highlights the fault as the board is now, in board coordinates from the text below: `box` round the items or the area at fault, `path` along the stretch of wire at fault."
    + " Set the one a mark does not use to null. Give each finding 1 to 3 marks.",
    "",
    `Look further: when you cannot judge a fault without a closer view, list up to ${MAX_LOOKS} views in \`look\`, each a list of the ids to frame together (["executor", "capabilities", "e_preflight"]).`
    + " The runner then sends those crops with their measured routes, and you answer once more. Else set `look` to [].",
    `Give at most ${MAX_FINDINGS_PER_UNIT} findings, most severe first.`,
    "Do not run commands or read files.",
  ];
}

/** Ford kept merged junctions. Every reviewer that reads wires is told so. */
const MERGED_TRUNK = "Never report a merged trunk as a fault: wires that share a source or a target and run on one line into one port, with one arrowhead, read as one trunk."
  + ` Ford kept them: "The lines just appear more aesthetic."`;
const MEASURED = "A \"measured\" line is a fact the runner measured on the board file. Judge it on the images: report it when it reads as a fault, with its numbers.";

const block = (title: string, lines: string[]) => ["", title, ...(lines.length ? lines : ["(none)"])];
const notesBlocks = (notes: UnitNotes) => [
  ...(notes.checked.length ? ["", "The strict lint already gave the drawer these. Do not report them again:", ...notes.checked] : []),
  ...(notes.declined.length ? [
    "",
    "The drawer declined these findings of earlier rounds, each with its reason. Raise one again only when its reason is wrong on the current images, and say why it is wrong. Name the same ids. Else do not report it:",
    ...notes.declined,
  ] : []),
  ...(notes.settled.length ? ["", "These faults are settled: the drawer declined them twice. Do not report them:", ...notes.settled] : []),
];
const WIRE_SHEET_KEY = "tag id · from → to · kind · ports · length · bends · route · style colour · arrow · label; then the route, the corner points, the boxes it runs through, the wires it crosses, shared trunks";

/** What a section or loose-items prompt prints: the scale of each image and the unit's text blocks. */
export interface SectionText {
  /** Image px per board px of image 1, image 2, and images 3 and 4. */
  scales: { board: number; section: number; neighbourhood: number };
  objects: string[];
  measures: string[];
  wires: string[];
  /** wireMeasureLines of the unit's wire sheet. */
  wireMeasures: string[];
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
    "Another reviewer has each other section. Others have the gaps between sections, the wires between sections, and where the sections sit.",
    "",
    `Image 1 is the whole board (${scaleText(text.scales.board)}). Your ${part} ${unit.section ? "is" : "are"} outlined in red, the sections wired to ${unit.section ? "it" : "them"} in blue.`,
    `Image 2 is your ${part} (${scaleText(text.scales.section)}), with the board's smart guides drawn in pink.`
    + " A faint line runs along edges and centres that are in line. A strong line with a tag (G1, G2, ...) is a near-miss: the line an item, a gap or an arrowhead sits a few px off."
    + " The ruler on its top and left edges gives board coordinates: the numbers the text below uses.",
    `Image 3 is your ${part} with every object wired to ${unit.section ? "it" : "them"} and the full path of every wire on your wire sheet (${scaleText(text.scales.neighbourhood)}). The rest of the board is faded.`,
    "Image 4 is image 3 with each wire tagged as on the wire sheet (W1, W2, ...): a ring on each bend, a square on each port. A grey tag (W5+W6+W7) names the wires that share that trunk.",
    "",
    `List every layout and structure fault of your ${part} and your wires. You are a fuzzy lint: a strict lint already ran, so look for what it misses.`,
    "Look at each item, wire and wire label in turn.",
    "Use image 2 to judge what is in line: an item on none of the lines its neighbours share, a row with unequal gaps, a wire that bends because its two ends are off one line.",
    "Use image 4 and the wire sheet to judge each wire: a bend it does not need, a detour, a port on the wrong side, a trunk that hides which wire goes where, a label off its wire.",
    ...(unit.section ? ["Judge the nesting too: nodes that form clear sub-groups with no subsection round them, or a subsection that adds nothing."] : []),
    MERGED_TRUNK,
    MEASURED,
    "",
    ...answerRules(),
    ...notesBlocks(text.notes),
    ...block("Objects:", [...text.objects, ...text.measures]),
    ...block(`Wire sheet (${WIRE_SHEET_KEY}):`, text.wires),
    ...block("Measured on your wires:", text.wireMeasures.map((line) => `measured: ${line}`)),
    ...block("Board totals:", [text.totals]),
  ].join("\n");
}

/** What a gap prompt prints: the scale of image 1 and the lines of each crop. */
export interface GapText { scale: number; crops: Array<{ rect: WorldRect; lines: string[] }>; notes: UnitNotes }

export function gapPrompt(text: GapText): string {
  const count = text.crops.length;
  return [
    "You review the gaps of a diagram board: the space between its sections and along their borders, where wires and their label chips run.",
    "Another reviewer has the inside of each section, and others have the route of each long wire and where the sections sit. Yours is what a reader sees at full size in the crops below.",
    "",
    `Image 1 is the whole board (${scaleText(text.scale)}). Your ${count === 1 ? "crop is" : `${count} crops are`} outlined in red, each with its number.`,
    `${count === 1 ? "Image 2 is your crop" : `Images 2 to ${count + 1} are your crops, in order,`} at full size: 1 image px is 1 board px.`,
    "",
    "Look at each label chip, each wire and each section border of each crop in turn. The faults to look for:",
    "- a label chip on a section border, or a few px from one;",
    "- a label chip on a corner of a wire, on a junction or on an arrowhead;",
    "- a label chip that covers most of a short wire;",
    "- label chips that crowd each other or a node;",
    "- a wire that runs along a section border;",
    "- two wires too close to tell apart.",
    MERGED_TRUNK,
    MEASURED,
    "",
    ...answerRules(),
    ...notesBlocks(text.notes),
    ...text.crops.flatMap((crop, index) => block(
      `Crop ${index + 1} (image ${index + 2}): board x ${crop.rect.x} to ${crop.rect.x + crop.rect.width}, y ${crop.rect.y} to ${crop.rect.y + crop.rect.height}.`,
      crop.lines,
    )),
  ].join("\n");
}

/** What the wire prompt prints. */
export interface WireText { scale: number; wires: string[]; wireMeasures: string[]; totals: string; notes: UnitNotes }

export function wirePrompt(text: WireText): string {
  return [
    "You review the wires of a whole diagram board: every wire that leaves its section. On a board with no such wire, every wire.",
    "One reviewer has the inside of each section, and another has where the sections sit. Yours is how each wire runs between them.",
    `Ford: "it seems like the biggest issue is, like, line management."`,
    "",
    `Image 1 is the whole board (${scaleText(text.scale)}) with your wires and their ends drawn strong and the rest faded.`,
    "Image 2 is image 1 with each wire tagged as on the wire sheet (W1, W2, ...): a ring on each bend, a square on each port. A grey tag (W5+W6+W7) names the wires that share that trunk.",
    "",
    "Follow each wire from its source to its target in turn. The faults to look for:",
    "- a detour, a wire that wraps round a section, or a wire along the board's outer edge;",
    "- a crossing;",
    "- a shared trunk that hides a wire: wires with no common source or target on one line;",
    "- parallel wires that must merge, or merged wires that must stay apart;",
    "- a wire through a section it does not belong to, or through a section's header or header chip;",
    "- a wire that ends on a section frame and not on a node;",
    `- a wire within ${BORDER_NEAR_PX} px of a section border along ${BORDER_RUN_MIN_PX} px or more;`,
    "- many wires into one node from different sides;",
    `- wires that share a source or a target and run side by side in separate lanes, ${LANE_NEAR_PX} px apart or less: they must read as one trunk.`,
    MERGED_TRUNK,
    MEASURED,
    "",
    ...answerRules(),
    ...notesBlocks(text.notes),
    ...block(`Wire sheet (${WIRE_SHEET_KEY}; kind is the 2 parts the wire joins):`, text.wires),
    ...block("Measured on your wires:", text.wireMeasures.map((line) => `measured: ${line}`)),
    ...block("Board totals:", [text.totals]),
  ].join("\n");
}

/** What the space prompt prints (spaceLines). */
export interface SpaceText {
  scale: number; shape: string; sections: string[]; gaps: string[]; pairs: string[]; long: string[]; sinks: string[]; totals: string; notes: UnitNotes;
}

export function spacePrompt(text: SpaceText): string {
  return [
    "You review where the sections of a whole diagram board sit: which sections are neighbours, the gaps between them, the board's shape and its nesting.",
    "One reviewer has the inside of each section, and another has the route of each wire. Yours is the plan of the board.",
    `Ford: "it still seems like the the drawer agent is, like, not willing to spread things out more to just, like, give the board room to breathe."`,
    "",
    `Image 1 is the whole board at the size its judges see (${scaleText(text.scale)}).`,
    "Image 2 is a map of the board's sections, made from the board file, in the same frame as image 1: a box for each section, and a line between 2 sections that wires join, with the number of wires.",
    "",
    "Your first job is adjacency: sections that talk to each other must sit next to each other. Read the block \"Wires between sections\" first, then the images. The faults to look for:",
    "- two sections with many wires between them that are not neighbours;",
    "- a section that lies between two sections that talk to each other;",
    `- a gap with more than 1 wire per ${GAP_PX_PER_WIRE} px of its width (marked TIGHT), or a gap too narrow for the label chips in it;`,
    "- a sink or a store far from its sources;",
    "- a board shape (aspect ratio) that forces long wires;",
    "- ragged section edges: neighbour sections a few px out of line, or unequal gaps in one row or column;",
    "- a flat section whose nodes form clear sub-groups with no subsection, or a subsection that adds nothing.",
    "Never report an empty corner or an empty area as a fault on its own. Report wasted space only when a long wire or a tight gap exists at the same time, and name that wire or gap.",
    "",
    ...answerRules(),
    ...notesBlocks(text.notes),
    ...block("Board:", [text.shape]),
    ...block("Sections (id · parent · x · y of the top-left corner · width · height · items · subsections · title):", text.sections),
    ...block("Wires between sections (the 2 sections · wires · their total length · whether the 2 are neighbours), most wires first:", text.pairs),
    ...block("Gaps between neighbour sections:", text.gaps),
    ...block(`Wires longer than ${LONG_WIRE_PX} px (id · from (its section) → to (its section) · length · bends):`, text.long),
    ...block("Nodes that 3 or more wires from other sections end on (sinks and stores):", text.sinks),
    ...block("Board totals:", [text.totals]),
  ].join("\n");
}

/** What the choices prompt prints (choicesLines). `brief` is the board's brief, or null when the run has none. */
export interface ChoicesText { scale: number; brief: string | null; objects: string[]; wires: string[]; counts: string[]; notes: UnitNotes }

export function choicesPrompt(text: ChoicesText): string {
  return [
    "You review the choices a diagram board makes against its brief: colour, shape and icon, and whether the board holds what the brief names.",
    "Other reviewers have the layout and the wires. Leave those to them.",
    "",
    `Image 1 is the whole board (${scaleText(text.scale)}).`,
    "",
    text.brief === null
      ? "No brief came with this board. Judge colour, shape and icon from the board alone, and report nothing as missing."
      : "Read the brief, then each section and each node in turn.",
    "The faults to look for:",
    "- a gray or colourless section;",
    "- sibling sections that all have one colour;",
    "- a plain rectangle where the brief names a kind that has a shape or an icon (a store, a queue, a person, a decision, a brand);",
    "- one icon repeated on many unlike nodes;",
    "- colour that carries no meaning: nodes of one kind in several colours, or unlike kinds in one colour;",
    ...(text.brief === null ? [] : [
      "- an object or a relation in the brief that the board lacks (kind `missing`);",
      "- a hierarchy in the brief that the board shows flat (kind `nesting`).",
    ]),
    "",
    ...answerRules(),
    ...notesBlocks(text.notes),
    ...(text.brief === null ? [] : ["", "<brief>", text.brief.trim(), "</brief>"]),
    ...block("Objects (id · type · shape · icon · colour · parent (its colour) · text):", text.objects),
    ...block("Wires (id · from → to · label · style colour):", text.wires),
    ...block("Counted:", text.counts),
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

const STRING = { type: "string" };
const NUMBER = { type: "number" };
const shape = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const maybe = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const XY = shape({ x: NUMBER, y: NUMBER });
const BOX = shape({ x: NUMBER, y: NUMBER, width: NUMBER, height: NUMBER });

/** The answer schema of every reviewer. Strict output takes no optional field: a mark sets `path` or `box`, and the other to null. */
export function answerSchema(): object {
  return shape({
    findings: {
      type: "array",
      items: shape({
        kind: { type: "string", enum: FINDING_KINDS },
        ids: { type: "array", items: STRING },
        labels: { type: "array", items: STRING },
        problem: STRING,
        severity: { type: "string", enum: SEVERITIES },
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

function decodeMarks(value: unknown): Mark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): Mark[] => {
    const mark = fields(raw);
    const points = Array.isArray(mark?.path) ? mark.path.map(fields) : [];
    const path = points.flatMap((point): Array<[number, number]> => point && isNumber(point.x) && isNumber(point.y) ? [[point.x, point.y]] : []);
    const box = fields(mark?.box);
    return [
      ...(path.length > 1 && path.length === points.length ? [{ path }] : []),
      ...(box && isNumber(box.x) && isNumber(box.y) && isNumber(box.width) && isNumber(box.height) && box.width > 0 && box.height > 0
        ? [{ box: { x: box.x, y: box.y, width: box.width, height: box.height } }] : []),
    ];
  });
}

/** One reviewer's answer. */
export interface Answer { findings: UnitFinding[]; look: string[][] }

/**
 * One reviewer's answer, refusing a finding off the schema. A finding holds
 * a problem and its highlight only: any other field an answer carries (a fix,
 * a call) is not read.
 */
export function parseAnswer(text: string): Answer {
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
    if (typeof finding.problem !== "string" || !finding.problem.trim()) throw where(`"problem" must be a non-empty string`);
    return {
      kind: finding.kind as FindingKind,
      ids: strings("ids"),
      labels: strings("labels"),
      problem: finding.problem.trim(),
      severity: finding.severity as Severity,
      marks: decodeMarks(finding.marks),
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
  const labels = (finding: Finding) => finding.labels.length > 0 ? finding.labels.map(normal) : [`problem ${normal(finding.problem)}`];
  return labels(a).some((label) => labels(b).includes(label));
}

/**
 * One list across the units: a fault two reviewers both see reaches the
 * drawer once. A finding joins a group when it is the same fault as each
 * member (sameFault), so no chain of part matches joins two faults. One
 * unit's findings stay apart, because its reviewer listed them as separate
 * faults. Ids not on the board move to labels. The merged finding keeps the
 * most severe finding's words, every id and label, every unit that reported
 * it and each unit's highlight. The list runs most severe first, then most
 * units.
 */
export function mergeFindings(byUnit: Array<{ region: string; findings: UnitFinding[] }>, boardIds: ReadonlySet<string>): MergedFinding[] {
  interface Entry { finding: Finding; region: string; marks: Mark[] }
  const groups: Entry[][] = [];
  for (const { region, findings } of byUnit) {
    for (const { marks, ...finding } of findings) {
      const ids = finding.ids.filter((id) => boardIds.has(id));
      const labels = [...finding.labels, ...finding.ids.filter((id) => !boardIds.has(id))];
      const entry: Entry = { finding: { ...finding, ids, labels }, region, marks };
      const group = groups.find((members) => members.every((member) => member.region !== region && sameFault(member.finding, entry.finding)));
      if (group) group.push(entry);
      else groups.push([entry]);
    }
  }
  const unique = (items: string[]) => [...new Set(items)];
  return groups.map((group): MergedFinding => {
    const lead = group.reduce((best, entry) => rank(entry.finding) < rank(best.finding) ? entry : best);
    return {
      ...lead.finding,
      ids: unique(group.flatMap((entry) => entry.finding.ids)),
      labels: unique(group.flatMap((entry) => entry.finding.labels)),
      regions: unique(group.map((entry) => entry.region)).sort(),
      marks: group.filter((entry) => entry.marks.length > 0).map((entry) => ({ unit: entry.region, marks: entry.marks })),
    };
  }).sort((a, b) => rank(a) - rank(b) || b.regions.length - a.regions.length);
}

export function criticArgs(dir: string, prompt: string, images: string[], schemaPath: string, outputPath: string, effort: Effort): string[] {
  return [
    "exec",
    "-m", CRITIC_MODEL,
    "-c", `model_reasoning_effort="${effort}"`,
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
  /** The unit: its id (space, wires, choices, a section's id, gap-<n> or loose) and the board rect its images frame. */
  region: Region;
  kind: ReviewerKind;
  /** A gap reviewer's crops. */
  crops: WorldRect[];
  /** The unit's folder under the review's, with its images, prompts and raw answers. */
  dir: string;
  /** The images of its first prompt, in order. */
  images: string[];
  objects: number;
  wires: number;
  /** Both answers, when it looked further, and the waits after a rate limit. */
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  /** How many times Codex ran for its last answer: over 1 after a rate limit or an overload. */
  tries: number;
  /** Why the answer did not parse, or null when it did. */
  error: string | null;
  /** The views it asked to look at. */
  look: string[][];
  /** Why its second answer did not replace the first, or null when it did or it asked for no view. */
  lookError: string | null;
  findings: UnitFinding[];
}

/** A lint with the state of the items it names: it changes when one of them moves, resizes or takes another route. */
export interface ReviewLint extends Lint { state: string }

export interface CritiqueRecord {
  board: string;
  model: string;
  /** The reasoning effort of every reviewer of this review. */
  effort: Effort;
  count: number;
  startedAt: string;
  /** Wall clock for the whole review: lints, renders, every reviewer and the merge. */
  durationMs: number;
  /** The lints, the wire facts and the renders. */
  renderMs: number;
  /** What canvas_check finds on the board. */
  lints: ReviewLint[];
  /** One record a reviewer. */
  regions: UnitRecord[];
  /** The label chips the gap reviewers must see (gaps.ts gapChips), how many are whole in a crop, and the crops. */
  gap: { chips: number; covered: number; crops: number };
  /** The reviewers' findings, merged. */
  findings: MergedFinding[];
}

/** An earlier round's finding the drawer declined, as a reviewer reads it: the finding and the drawer's reason, in one line. */
export interface EarlierFinding {
  ids: string[];
  regions: string[];
  line: string;
  /** Declined twice: no reviewer reports it again. */
  settled: boolean;
}

interface CriticRun { exitCode: number | null; timedOut: boolean; stderr: string }

async function runCritic(args: string[], timeoutMs: number): Promise<CriticRun> {
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

/**
 * One reviewer's answer, asked again while Codex fails on a rate limit or an
 * overload (HTTP 429, 529): it wrote no answer, did not time out, and its
 * error names the limit. `call` runs Codex once.
 */
export function askReviewer(options: { call(): Promise<CriticRun>; answered(): boolean; sleep?(ms: number): Promise<void>; onWait?(tries: number, waitMs: number): void }) {
  return retryRateLimited({
    attempt: options.call,
    limited: (run) => !run.timedOut && !options.answered() && isRateLimitText(run.stderr),
    firstWaitMs: REVIEWER_FIRST_WAIT_MS,
    sleep: options.sleep,
    onWait: options.onWait,
  });
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

/** A unit's folder name: its id, kept clear of the units that are not sections. */
const unitDir = (unit: ReviewUnit) => {
  const name = unit.id.replace(/[^A-Za-z0-9._-]/g, "_");
  return unit.section && ([SPACE_UNIT, WIRE_UNIT, CHOICES_UNIT, LOOSE_UNIT].includes(name) || /^gap-\d+$/.test(name)) ? `section-${name}` : name;
};
/** The scale that holds the long edge of a crop of `rect` to CROP_MAX_WIDTH px. */
const cropScale = (rect: WorldRect) => Math.min(1, CROP_MAX_WIDTH / Math.max(rect.width, rect.height));
const lintLine = (lint: Lint) => `${lint.rule}: ${lint.message}${lint.suggestion ? ` (${lint.suggestion})` : ""}`;

/** Each crop of a gap reviewer on the whole board: a red outline and its number. */
function cropMarks(crops: WorldRect[], scale: number): string {
  const px = (value: number) => value / scale;
  return crops.map((crop, index) => outline(crop, OWN, 4, scale)
    + `<rect x="${crop.x}" y="${crop.y}" width="${px(30)}" height="${px(30)}" fill="${OWN}"/>`
    + `<text x="${crop.x + px(15)}" y="${crop.y + px(22)}" ${FONT} font-size="${px(20)}" font-weight="700" text-anchor="middle" fill="#ffffff">${index + 1}</text>`).join("");
}

/** A finding's highlight when its reviewer drew none: the box of each object it names and the path of each wire, 4 at most. */
export function marksOf(ids: string[], board: Board, facts: WireFact[]): Mark[] {
  const objects = new Map(board.objects.map((object) => [object.id, object]));
  const wires = new Map(facts.map((fact) => [fact.id, fact]));
  return ids.flatMap((id): Mark[] => {
    const object = objects.get(id);
    if (object?.geometry) return [{ box: object.geometry }];
    const wire = wires.get(id);
    return wire ? [{ path: wire.points.map((point): [number, number] => [point.x, point.y]) }] : [];
  }).slice(0, 4);
}

/** One reviewer's work order: its images and its first prompt. */
/** `rows` is the wire sheet the reviewer reads, when it has one. */
interface Job { unit: ReviewUnit; dir: string; images: string[]; prompt: string; wires: number; rows?: WireRow[] }

/**
 * Lint and render `boardPath`, run every reviewer at once, and merge the
 * findings. Writes into `outDir`: overview.png, guides.png (the overview with
 * the smart guides), critique.json (a CritiqueRecord), and per unit under
 * `units/<id>/`: its images, prompt-1.md and answer-1.json, and when it
 * looked further look-<n>.png, prompt-2.md and answer-2.json.
 */
export async function critiqueBoard(options: {
  canvas: ReviewCanvas;
  boardPath: string;
  outDir: string;
  critic: CriticOptions;
  /** The board's brief, for the choices reviewer. Null or undefined: the run has none. */
  brief?: string | null;
  /** Earlier rounds' findings the drawer declined. Each goes to the units that hold one of its items, or that reported it. */
  earlier?: EarlierFinding[];
}): Promise<CritiqueRecord> {
  const { canvas, boardPath, outDir } = options;
  const earlier = options.earlier ?? [];
  const started = Date.now();
  const unitsDir = resolve(outDir, "units");
  rmSync(unitsDir, { recursive: true, force: true });
  mkdirSync(unitsDir, { recursive: true });
  const schemaPath = resolve(outDir, "answer.schema.json");
  writeFileSync(schemaPath, `${JSON.stringify(answerSchema(), null, 2)}\n`);

  const file: CanvasFile = canvas.toolkit.openCanvasFile(boardPath);
  const board = file.persisted as Board;
  const style = file.session.canvasStyle;
  const effort = options.critic.effort ?? reviewerEffort(board);
  const facts = wireFacts(canvas.wires, file);
  const factOf = new Map(facts.map((fact) => [fact.id, fact]));
  const objectOf = new Map(board.objects.map((object) => [object.id, object]));
  /** The place of each item a lint names. A lint the drawer declined comes back only when this changes. */
  const stateOf = (ids: string[]) => createHash("sha1")
    .update(JSON.stringify(ids.map((id) => [id, objectOf.get(id)?.geometry ?? null, factOf.get(id)?.points ?? null, factOf.get(id)?.labelAt ?? null]))).digest("hex").slice(0, 12);
  const lints = canvas.lints.sessionDiagnostics(file.session, canvas.lints.FINISHING_RULES)
    .map(({ rule, severity, at, message, suggestion }): ReviewLint => ({ rule, severity, at, message, suggestion, state: stateOf(at) }));
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

  const { pageFrame, units: fixed } = reviewUnits(board);
  const crops = gapCrops(board, pageFrame, fixed, facts);
  const units = [...fixed, ...gapUnits(crops)];
  const wireContext = { board, pageFrame, headers: sectionHeaders(canvas.wires, file) };
  const boardIds = new Set([...board.objects.map((object) => object.id), ...board.connections.map((wire) => wire.id)]);
  const onBoard = grow(camera, 400);

  /** One prompt to one reviewer, and its answer parsed. */
  const ask = async (job: Job, turn: 1 | 2, prompt: string, images: string[]) => {
    const answerPath = resolve(job.dir, `answer-${turn}.json`);
    writeFileSync(resolve(job.dir, `prompt-${turn}.md`), `${prompt}\n`);
    const args = criticArgs(job.dir, prompt, images, schemaPath, answerPath, effort);
    const { result: run, tries } = await askReviewer({
      call: () => runCritic(args, CRITIC_TIMEOUT_MS[effort]),
      answered: () => existsSync(answerPath),
      onWait: (tried, waitMs) => process.stdout.write(`reviewer ${job.unit.id}: rate limited on try ${tried}, waits ${waitMs / 1000} s\n`),
    });
    try {
      const text = readFileSync(answerPath, "utf8");
      return { run, tries, text, answer: parseAnswer(text), error: null };
    } catch (failure) {
      const error = run.timedOut ? "timed out" : `${failure instanceof Error ? failure.message : String(failure)}\n${run.stderr.slice(-2000)}`;
      return { run, tries, text: "", answer: null, error };
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
    let { run, tries, answer, error } = first;
    let lookError: string | null = null;
    const asked = first.answer?.look ?? [];
    if (first.answer && asked.length > 0) {
      const { views, images } = await lookViews(job, asked);
      if (views.length === 0) lookError = "no id of the views is on the board";
      else {
        const second = await ask(job, 2, lookPrompt(job.prompt, first.text, views, job.images.length), [...job.images, ...images]);
        // The second answer replaces the first. A second answer that fails keeps the first, so a look never loses findings.
        if (second.answer) ({ run, tries, answer } = second);
        else lookError = second.error;
      }
    }
    return {
      region: { id: job.unit.id, ...job.unit.rect },
      kind: job.unit.kind,
      crops: job.unit.crops,
      dir: relative(outDir, job.dir),
      images: job.images.map((image) => relative(outDir, image)),
      objects: job.unit.owned.length,
      wires: job.wires,
      durationMs: Date.now() - begun,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      tries,
      error,
      look: asked,
      lookError,
      // A mark far off the board is a slip. A finding with no mark left gets the boxes and paths of the items it names.
      // The drawer never sees a wire sheet: a tag in the problem (W3) becomes the wire's id.
      findings: (answer?.findings ?? []).map((finding) => {
        const marks = finding.marks.filter((mark) => touches(markBox(mark), onBoard));
        return { ...finding, problem: untagWires(finding.problem, job.rows ?? []), marks: marks.length ? marks : marksOf(finding.ids, board, facts) };
      }),
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
    /** The earlier findings this unit reads: the ones on items it holds, or that its own reviewer reported. */
    const notes = (holds: ReadonlySet<string>, checked: string[]): UnitNotes => {
      const mine = earlier.filter((finding) => finding.regions.includes(unit.id) || finding.ids.some((id) => holds.has(id)));
      return { checked, declined: mine.filter((finding) => !finding.settled).map((finding) => finding.line), settled: mine.filter((finding) => finding.settled).map((finding) => finding.line) };
    };
    const lintsAt = (holds: ReadonlySet<string>) => lints.filter((lint) => lint.at.some((id) => holds.has(id)));
    const scale = overview.size.scale;

    if (unit.kind === "space") {
      const images = [save("1-board.png", overview.png), save("2-map.png", png(sectionMapSvg(units, facts, camera, overview.size.width)))];
      const prompt = spacePrompt({ scale, ...spaceLines(units, facts, board), sections: sectionLines(units), totals, notes: notes(new Set(), []) });
      return { unit, dir, images, prompt, wires: facts.length };
    }
    if (unit.kind === "choices") {
      const prompt = choicesPrompt({ scale, brief: options.brief ?? null, ...choicesLines(board, facts), notes: notes(new Set(), []) });
      return { unit, dir, images: [save("1-board.png", overview.png)], prompt, wires: facts.length };
    }
    if (unit.kind === "wire") {
      const rows = boardWireSheet(units, facts);
      const fade = fadeMarks(unit, rows, board, camera, scale);
      const images = [
        save("1-wires.png", png(markedSvg(overviewSvg, fade))),
        save("2-tagged.png", png(markedSvg(overviewSvg, `${fade}${wireMarks(rows, scale)}`))),
      ];
      const holds = new Set(rows.map((row) => row.fact.id));
      const prompt = wirePrompt({ scale, wires: wireSheetLines(rows), wireMeasures: wireMeasureLines(rows, wireContext), totals, notes: notes(holds, lintsAt(holds).map(lintLine)) });
      return { unit, dir, images, prompt, wires: rows.length, rows };
    }
    if (unit.kind === "gap") {
      const shown = unit.crops.map((crop) => wiresIn(crop, facts));
      const images = [
        save("1-board.png", png(markedSvg(overviewSvg, cropMarks(unit.crops, scale)))),
        ...unit.crops.map((crop, index) => save(`crop-${index + 1}.png`, renderCropPng(canvas, file, crop, { maxWidth: crop.width }).png)),
      ];
      const holds = new Set(shown.flat().map((fact) => fact.id));
      const prompt = gapPrompt({
        scale,
        crops: unit.crops.map((crop) => ({ rect: crop, lines: gapCropLines(crop, board, pageFrame, facts) })),
        notes: notes(holds, lintsAt(holds).map(lintLine)),
      });
      return { unit, dir, images, prompt, wires: holds.size };
    }
    const rows = wireSheet(unit, facts);
    const own = unit.section ? [unit.rect] : unit.owned.map((object) => object.geometry);
    const section = sectionFrame(unit.rect, CROP_MAX_WIDTH, true);
    const guides = canvas.overlay.renderGuideOverlaySvg(board, { canvasStyle: style, region: section.frame });
    const sectionSize = { width: Math.round(section.frame.width * section.scale), height: Math.round(section.frame.height * section.scale) };
    const neighbourhood = neighbourhoodFrame(unit, rows, board);
    const near = cropScale(neighbourhood);
    const fade = fadeMarks(unit, rows, board, neighbourhood, near);
    const crop = (marks: string) => renderCropPng(canvas, file, neighbourhood, { marks, maxWidth: Math.round(neighbourhood.width * near) }).png;
    const images = [
      save("1-board.png", png(markedSvg(overviewSvg, wholeBoardMarks(own, linkedSections(unit, rows, board, units), scale)))),
      save("2-section.png", png(markedSvg(guides.svg, rulerMarks(section.frame, section.scale), sectionSize))),
      save("3-neighbourhood.png", crop(fade)),
      save("4-wires.png", crop(`${fade}${wireMarks(rows, near)}`)),
    ];
    const holds = new Set([unit.id, ...unit.owned.map((object) => object.id), ...rows.map((row) => row.fact.id)]);
    const measures = await look(unit.section ? unit.id : unit.owned.map((object) => object.id));
    const prompt = sectionPrompt(unit, {
      scales: { board: scale, section: section.scale, neighbourhood: near },
      objects: objectLines(unit, rows, board),
      measures: measures.isError ? [] : measuresOf(measures.text),
      wires: wireSheetLines(rows),
      wireMeasures: wireMeasureLines(rows, wireContext),
      totals,
      notes: notes(holds, [...guides.legend, ...lintsAt(holds).filter((lint) => lint.rule !== NEAR_MISS_RULE).map(lintLine)]),
    });
    return { unit, dir, images, prompt, wires: rows.length, rows };
  };

  const gate = new Semaphore(options.critic.count);
  const running: Array<Promise<UnitRecord>> = [];
  try {
    // A reviewer starts when its images are ready, so it reads while the runner renders the next unit's.
    for (const unit of units) {
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
    effort,
    count: options.critic.count,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    renderMs,
    lints,
    regions,
    gap: { ...gapCoverage(board, pageFrame, facts, crops), crops: crops.length },
    findings,
  };
  writeFileSync(resolve(outDir, "critique.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function critiqueSummary(record: CritiqueRecord): string {
  const failed = record.regions.filter((region) => region.error !== null);
  const raw = record.regions.reduce((sum, region) => sum + region.findings.length, 0);
  const looked = record.regions.filter((region) => region.look.length > 0).length;
  const slowest = Math.max(0, ...record.regions.map((region) => region.durationMs));
  const ofKind = (kind: ReviewerKind) => record.regions.filter((region) => region.kind === kind);
  const kinds = REVIEWER_KINDS.map((kind) => `${ofKind(kind).length} ${kind}`).join(", ");
  const found = REVIEWER_KINDS.map((kind) => `${kind} ${ofKind(kind).reduce((sum, region) => sum + region.findings.length, 0)}`).join(", ");
  return `${record.lints.length} lints · ${record.regions.length} reviewers at ${record.effort} (${kinds}) · ${raw} findings (${found}), ${record.findings.length} after merge`
    + ` · gap chips ${record.gap.covered}/${record.gap.chips} in ${record.gap.crops} crops · ${looked} looked further`
    + ` · ${(record.durationMs / 1000).toFixed(1)} s wall (render ${(record.renderMs / 1000).toFixed(1)} s, slowest reviewer ${(slowest / 1000).toFixed(1)} s)`
    + `${failed.length ? ` · ${failed.length} unparsed: ${failed.map((region) => region.region.id).join(", ")}` : ""}`;
}
