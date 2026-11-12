/**
 * The trial run: before the drawer sees a finding, the runner applies each
 * call a reviewer proposed to a copy of the board, with the tool code the
 * drawer uses, and measures what it did. Ford: "So we can, like, do some
 * heavy lifting where it's like, hey, like, here is what I think should be
 * done."
 *
 * Two trials. Each call alone, on its own copy of the board. Then every call
 * that applied alone, in order, on one copy: the whole-board reviewer's
 * calls, the section reviewers' by section id, the loose-items reviewer's.
 * The trial takes any canvas tool. It reports numbers and five flags (a new
 * lint error, a new crossing, a new `through`, a refusal, a conflict), and
 * never picks between two calls.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

import { JUDGE_PNG_MAX_EDGE } from "../../../../canvas/src/render/judge-size.ts";
import { loadReviewCanvas, type ReviewCanvas } from "./critic.ts";
import { PANEL_BAR, PANEL_GAP, joinPanels, renderCropPng, type Panel } from "./crop.ts";
import { parseFlags } from "./paths.ts";
import type { CanvasFile, Lint, WorldRect } from "./render.ts";
import { BOARD_UNIT, LOOSE_UNIT, type FindingAdvice, type Mark, type ProposedCall, type ReviewCall } from "./review-types.ts";
import { boardTotals, loadWireModules, wireFacts, type Point, type WireFact, type WireModules } from "./wires.ts";

/** The toolkit calls a trial makes: an open with the board's own style, and the tool call the canvas MCP makes. */
interface TrialToolkit {
  openCanvasFile(path: string, options?: { canvasStyle?: unknown }): CanvasFile;
  callToolkitTool(file: CanvasFile, name: string, args: Record<string, unknown>): Promise<{ isError?: boolean; text: string; persisted?: { written: boolean } }>;
}

/** The board's numbers at one state: its lint results, and the totals canvas_check prints. */
export interface BoardNumbers { lints: Lint[]; wireLength: number; crossings: number }

/** A wire the call changed. A side is null when the call made or deleted the wire. A wire that only moved with its boxes is not a change. */
export interface WireChange { id: string; before: WireFact | null; after: WireFact | null }

/** A box the call moved, resized, made or deleted. */
export interface BoxChange {
  id: string;
  before: WorldRect | null;
  /** Where the box landed. Every agent geometry write lands on the 20 px grid. */
  after: WorldRect | null;
  /** What the call's arguments asked for this box, or null when they name no geometry for it. */
  asked: Partial<WorldRect> | null;
  /** The box it travelled with (its section, moved by the same offset), or null when it changed by itself. */
  movedWith: string | null;
}

export type FlagKind = "refused" | "lint" | "crossing" | "through" | "conflict";
export interface Flag { kind: FlagKind; text: string }

/** What one call did to one copy of the board. */
export interface TrialStep {
  applied: boolean;
  /** The tool's reply: what it changed, or why it refused. */
  text: string;
  wires: WireChange[];
  boxes: BoxChange[];
  board: { before: BoardNumbers; after: BoardNumbers };
  flags: Flag[];
  ms: number;
}

export interface CallTrial {
  /** `<finding id> call <n>`: how the lines and the flags name the call. */
  name: string;
  finding: string;
  unit: string;
  call: ReviewCall;
  marks: Mark[];
  alone: TrialStep;
  /** The before and after image, or the sketch of a refused call, as a file name in the record's folder. */
  image: string | null;
  imageMs: number;
  /** The call's turn among the applied calls on one copy. Null when the call was refused alone. */
  sequence: (TrialStep & { turn: number; conflictsWith: string[] }) | null;
}

/** `trial.json`: every number of every trial. */
export interface TrialRecord {
  board: string;
  calls: CallTrial[];
  /** The calls of the sequence trial, in the order they ran, and the board's numbers at its end. */
  sequence: { order: string[]; end: BoardNumbers };
  ms: { total: number; alone: number; images: number; sequence: number };
}

interface Box extends WorldRect { parent: string | null }
interface BoardState { file: CanvasFile; wires: Map<string, WireFact>; boxes: Map<string, Box>; numbers: BoardNumbers }

function measure(canvas: ReviewCanvas, modules: WireModules, file: CanvasFile): BoardState {
  const board = file.persisted as { objects: Array<{ id: string; parentId?: string | null; geometry: WorldRect }> };
  const { totals } = boardTotals(modules, file);
  return {
    file,
    wires: new Map(wireFacts(modules, file).map((wire) => [wire.id, wire])),
    boxes: new Map(board.objects.map(({ id, parentId, geometry: { x, y, width, height } }) => [id, { x, y, width, height, parent: parentId ?? null }])),
    numbers: {
      lints: canvas.lints.sessionDiagnostics(file.session, canvas.lints.FINISHING_RULES)
        .map(({ rule, severity, at, message, suggestion }): Lint => ({ rule, severity, at, message, suggestion })),
      wireLength: Math.round(totals.wireLength),
      crossings: totals.crossings,
    },
  };
}

const rectOf = ({ x, y, width, height }: WorldRect): WorldRect => ({ x, y, width, height });
const sameRect = (a: WorldRect, b: WorldRect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** A wire's facts with its place on the board taken out: a wire that moved with its section keeps its shape. */
function shapeOf(wire: WireFact): string {
  const origin = wire.points[0]!;
  const from = (point: Point | null) => point && [point.x - origin.x, point.y - origin.y];
  const { points, labelAt, route: _route, ...rest } = wire;
  return JSON.stringify([rest, points.map(from), from(labelAt)]);
}

const field = (value: unknown, key: string): number | undefined => {
  const item = (value as Record<string, unknown> | null | undefined)?.[key];
  return typeof item === "number" ? item : undefined;
};

/**
 * The geometry a call asks for its box, for the tools whose arguments state
 * one. Every other tool is trialled the same way: it has a landed geometry
 * and no asked one.
 */
const ASKED: Record<string, (args: Record<string, unknown>, box: Box, boxes: Map<string, Box>) => Partial<WorldRect>> = {
  move: (args, box) => ({
    x: field(args.to, "x") ?? box.x + (field(args.by, "dx") ?? 0),
    y: field(args.to, "y") ?? box.y + (field(args.by, "dy") ?? 0),
  }),
  resize: (args, box, boxes) => {
    const like = typeof args.like === "string" ? boxes.get(args.like) : undefined;
    return { width: field(args, "width") ?? like?.width ?? box.width, height: field(args, "height") ?? like?.height ?? box.height };
  },
};

const lintKey = (lint: Lint) => JSON.stringify([lint.rule, [...lint.at].sort()]);
const crossingPairs = (state: BoardState) =>
  new Set([...state.wires.values()].flatMap((wire) => wire.crosses.map((other) => [wire.id, other].sort().join(" × "))));

/** What changed between two states of the board, and the flags the change raises. */
function changesOf(before: BoardState, after: BoardState, call: ReviewCall): Pick<TrialStep, "wires" | "boxes" | "flags"> {
  const wires = [...new Set([...before.wires.keys(), ...after.wires.keys()])].flatMap((id): WireChange[] => {
    const [was, now] = [before.wires.get(id) ?? null, after.wires.get(id) ?? null];
    return was && now && shapeOf(was) === shapeOf(now) ? [] : [{ id, before: was, after: now }];
  });
  // The wires the call names come first.
  const named = new Set(namedIds(call.args, before));
  wires.sort((a, b) => Number(named.has(b.id)) - Number(named.has(a.id)));

  const offset = (id: string) => {
    const [was, now] = [before.boxes.get(id), after.boxes.get(id)];
    return was && now ? { dx: now.x - was.x, dy: now.y - was.y, resized: was.width !== now.width || was.height !== now.height } : null;
  };
  /** The outermost box above `id` that moved by the same offset. */
  const carrier = (id: string): string | null => {
    const own = offset(id);
    if (!own || own.resized) return null;
    let top: string | null = null;
    for (let parent = after.boxes.get(id)!.parent; parent; parent = after.boxes.get(parent)?.parent ?? null) {
      const moved = offset(parent);
      if (!moved || moved.dx !== own.dx || moved.dy !== own.dy) break;
      top = parent;
    }
    return top;
  };
  const askedId = typeof call.args.id === "string" ? call.args.id : null;
  const boxes = [...new Set([...before.boxes.keys(), ...after.boxes.keys()])].flatMap((id): BoxChange[] => {
    const [was, now] = [before.boxes.get(id), after.boxes.get(id)];
    if (was && now && sameRect(was, now)) return [];
    const asked = was && id === askedId ? ASKED[call.tool]?.(call.args, was, before.boxes) ?? null : null;
    return [{ id, before: was ? rectOf(was) : null, after: now ? rectOf(now) : null, asked, movedWith: carrier(id) }];
  });

  const hadLint = new Set(before.numbers.lints.map(lintKey));
  const hadCrossing = crossingPairs(before);
  const crossings = [...crossingPairs(after)].filter((pair) => !hadCrossing.has(pair));
  // A pair that crosses a second time is a new crossing too.
  if (crossings.length === 0 && after.numbers.crossings > before.numbers.crossings) {
    crossings.push(`the board has ${after.numbers.crossings} crossings, and had ${before.numbers.crossings}`);
  }
  const flags: Flag[] = [
    ...after.numbers.lints.filter((lint) => lint.severity === "error" && !hadLint.has(lintKey(lint)))
      .map((lint): Flag => ({ kind: "lint", text: `new lint error ${lint.rule} at ${lint.at.join(", ")}: ${lint.message}` })),
    ...crossings.map((pair): Flag => ({ kind: "crossing", text: `new crossing ${pair}` })),
    ...[...after.wires.values()].flatMap((wire) => {
      const had = before.wires.get(wire.id)?.through ?? [];
      return wire.through.filter((box) => !had.includes(box)).map((box): Flag => ({ kind: "through", text: `new through: ${wire.id} runs through ${box}` }));
    }),
  ];
  return { wires, boxes, flags };
}

/** Every string in a call's arguments that names a box or a wire of the board. */
function namedIds(args: unknown, state: BoardState): string[] {
  if (typeof args === "string") return state.boxes.has(args) || state.wires.has(args) ? [args] : [];
  if (args === null || typeof args !== "object") return [];
  return Object.values(args).flatMap((value) => namedIds(value, state));
}

const RED = "#d92d20";
const GREEN = "#16803c";
const BLUE = "#1d4ed8";
const GREY = "#475569";
/** Board px around the changed items. */
const FRAME_PAD = 60;
/** The smallest frame: a small change still shows what stands around it. */
const FRAME_MIN = { width: 560, height: 380 };

function frameAround(rects: WorldRect[]): WorldRect {
  const left = Math.min(...rects.map((rect) => rect.x)) - FRAME_PAD;
  const top = Math.min(...rects.map((rect) => rect.y)) - FRAME_PAD;
  const width = Math.max(...rects.map((rect) => rect.x + rect.width)) + FRAME_PAD - left;
  const height = Math.max(...rects.map((rect) => rect.y + rect.height)) + FRAME_PAD - top;
  const grow = { x: Math.max(0, FRAME_MIN.width - width), y: Math.max(0, FRAME_MIN.height - height) };
  return { x: Math.floor(left - grow.x / 2), y: Math.floor(top - grow.y / 2), width: Math.ceil(width + grow.x), height: Math.ceil(height + grow.y) };
}

const pointsRect = (points: Array<{ x: number; y: number }>): WorldRect => {
  const [xs, ys] = [points.map((point) => point.x), points.map((point) => point.y)];
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};
const markRect = (mark: Mark): WorldRect => "box" in mark ? mark.box : pointsRect(mark.path.map(([x, y]) => ({ x, y })));

/** A wire's label chip. The engine gives the chip's centre: its size is an estimate from its text. */
function labelRect(wire: WireFact): WorldRect[] {
  const half = wire.label.length * 4.5 + 9;
  return wire.label && wire.labelAt ? [{ x: wire.labelAt.x - half, y: wire.labelAt.y - 13, width: half * 2, height: 26 }] : [];
}

/** The rects a wire takes up: its route, its ends and its label chip. */
const wireRects = (wire: WireFact, state: BoardState): WorldRect[] =>
  [pointsRect(wire.points), ...[wire.from, wire.to].flatMap((id) => state.boxes.get(id) ?? []), ...labelRect(wire)];

/** A see-through band over a route, with a ring on each bend: the wire, its dashes and its label chip stay readable under it. */
function routeMark(points: Point[], colour: string, k: number): string {
  const bends = points.slice(1, -1).filter((point, index) => (points[index]!.x === point.x) !== (point.x === points[index + 2]!.x));
  return `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="${colour}" stroke-opacity="0.35" stroke-width="${18 * k}" stroke-linejoin="round" stroke-linecap="round"/>`
    + bends.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${12 * k}" fill="none" stroke="${colour}" stroke-width="${4 * k}"/>`).join("");
}

/** An outline just outside a box, so the box's own border stays visible. */
const boxMark = (rect: WorldRect, colour: string, k: number, stroke = 4, dash = "") =>
  `<rect x="${rect.x - 5 * k}" y="${rect.y - 5 * k}" width="${rect.width + 10 * k}" height="${rect.height + 10 * k}" fill="none" stroke="${colour}" stroke-width="${stroke * k}"${dash}/>`;

/** The reviewer's sketch, dashed: it is the reviewer's guess, never the engine's result. */
function sketchMarks(marks: Mark[], k: number): string {
  const dash = ` stroke-dasharray="${14 * k} ${9 * k}"`;
  return marks.map((mark) => "box" in mark
    ? boxMark(mark.box, BLUE, k, 4, dash)
    : `<polyline points="${mark.path.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${BLUE}" stroke-width="${4 * k}"${dash}/>`).join("");
}

/** Side by side, or one above the other: the layout that scales the frame down least inside the largest image the drawer's model reads at full size. */
function layoutOf(frame: WorldRect): { layout: "row" | "column"; scale: number } {
  const row = Math.min(1, (JUDGE_PNG_MAX_EDGE - PANEL_GAP) / (2 * frame.width), (JUDGE_PNG_MAX_EDGE - PANEL_BAR) / frame.height);
  const column = Math.min(1, JUDGE_PNG_MAX_EDGE / frame.width, (JUDGE_PNG_MAX_EDGE - PANEL_GAP - 2 * PANEL_BAR) / (2 * frame.height));
  return column > row ? { layout: "column", scale: column } : { layout: "row", scale: row };
}

function panelOf(canvas: ReviewCanvas, state: BoardState, frame: WorldRect, scale: number, marks: string, title: string, colour: string): Panel {
  const crop = renderCropPng(canvas, state.file, frame, { marks, maxWidth: Math.round(frame.width * scale) });
  return { png: crop.png, width: crop.width, height: crop.height, title, colour };
}

const wireTitle = (id: string, wire: WireFact | null) =>
  wire ? `${id} ${wire.length} px · ${wire.bends} bend${wire.bends === 1 ? "" : "s"} · ports ${wire.ports.from}→${wire.ports.to}` : `${id} is not on the board`;
const boxTitle = (id: string, box: WorldRect | null) =>
  box ? `${id} at (${box.x}, ${box.y}) · ${box.width} × ${box.height}` : `${id} is not on the board`;

/**
 * The frame around what an applied call changed, before and after. Red marks
 * the old route and the old place, green the route and the place the engine
 * gave, and the dashed blue is the reviewer's sketch.
 */
function changeImage(canvas: ReviewCanvas, before: BoardState, after: BoardState, trial: Pick<CallTrial, "call" | "marks" | "alone">): Buffer {
  const { wires, boxes } = trial.alone;
  const own = boxes.filter((box) => box.movedWith === null);
  const named = new Set(namedIds(trial.call.args, before));
  const states = { before, after };
  const sides = ["before", "after"] as const;
  // A wire gets a mark for what moved: its route, its label chip, or both. A wire that only shares a new trunk or gets a new crossing has its numbers in the lines.
  const moved = (wire: WireChange, part: "points" | "labelAt") => JSON.stringify(wire.before?.[part] ?? null) !== JSON.stringify(wire.after?.[part] ?? null);
  const changed = [
    ...wires.flatMap((wire) => sides.flatMap((side) => {
      const fact = wire[side];
      return !fact ? [] : moved(wire, "points") ? wireRects(fact, states[side]) : moved(wire, "labelAt") ? labelRect(fact) : [];
    })),
    ...own.flatMap((box) => sides.flatMap((side) => box[side] ?? [])),
    ...trial.marks.map(markRect),
  ];
  // A call that moved no wire and no box (a colour, a text): the items it names, or the whole board.
  const shown = changed.length > 0 ? changed : [...named].flatMap((id) => before.boxes.get(id) ?? (before.wires.has(id) ? wireRects(before.wires.get(id)!, before) : []));
  const frame = frameAround(shown.length > 0 ? shown : [...before.boxes.values()]);
  const { layout, scale } = layoutOf(frame);
  const k = 1 / scale;
  // The title bar holds the numbers of the item the call names.
  const wire = wires.find((item) => named.has(item.id)) ?? (boxes.some((item) => named.has(item.id)) ? undefined : wires[0]);
  const box = boxes.find((item) => named.has(item.id)) ?? own[0];
  const title = (side: "before" | "after") => wire ? wireTitle(wire.id, wire[side]) : box ? boxTitle(box.id, box[side]) : trial.call.tool;
  const marks = (side: "before" | "after", colour: string) =>
    wires.map((item) => {
      const fact = item[side];
      if (!fact) return "";
      return (moved(item, "points") ? routeMark(fact.points, colour, k) : "") + (moved(item, "labelAt") ? labelRect(fact).map((rect) => boxMark(rect, colour, k, 3)).join("") : "");
    }).join("")
    + own.map((item) => item[side] ? boxMark(item[side], colour, k) : "").join("");
  // The old place stays on the trial panel as a thin red outline: a 20 px move is hard to see across two panels.
  const oldPlaces = own.map((item) => item.before && item.after ? boxMark(item.before, RED, k, 2) : "").join("");
  return joinPanels(canvas, [
    panelOf(canvas, before, frame, scale, marks("before", RED), `Now: ${title("before")}`, RED),
    panelOf(canvas, after, frame, scale, oldPlaces + marks("after", GREEN) + sketchMarks(trial.marks, k), `Trial: ${title("after")}`, GREEN),
  ], layout).png;
}

/** A refused call's sketch on the board as it is: the items the call names, and the sketch. */
function sketchImage(canvas: ReviewCanvas, board: BoardState, trial: Pick<CallTrial, "call" | "marks">): Buffer {
  const named = namedIds(trial.call.args, board).flatMap((id) => board.boxes.get(id) ?? wireRects(board.wires.get(id)!, board));
  const frame = frameAround([...trial.marks.map(markRect), ...named]);
  const scale = Math.min(1, JUDGE_PNG_MAX_EDGE / frame.width, (JUDGE_PNG_MAX_EDGE - PANEL_BAR) / frame.height);
  return joinPanels(canvas, [
    panelOf(canvas, board, frame, scale, sketchMarks(trial.marks, 1 / scale), `Sketch, not trialled: the ${trial.call.tool} call was refused`, GREY),
  ], "row").png;
}

const UNIT_RANK = (unit: string) => unit === BOARD_UNIT ? 0 : unit === LOOSE_UNIT ? 2 : 1;
const reviewerOf = (unit: string) => unit === BOARD_UNIT ? "the whole-board reviewer" : unit === LOOSE_UNIT ? "the loose-items reviewer" : `the reviewer of ${unit}`;
const fileName = (name: string) => `trial-${name.replace(/ call /, "-").replace(/[^A-Za-z0-9_.-]/g, "_")}.png`;

const refusedStep = (state: BoardState, text: string, reason: string, ms: number): TrialStep =>
  ({ applied: false, text, wires: [], boxes: [], board: { before: state.numbers, after: state.numbers }, flags: [{ kind: "refused", text: reason }], ms });

/** Trials every call of `findings` on copies of `boardPath`, and writes the images into `outDir`. */
async function runTrials(options: Parameters<typeof trialFindings>[0]): Promise<TrialRecord> {
  const { canvas, boardPath, outDir } = options;
  const started = performance.now();
  const modules = await loadWireModules();
  const toolkit = canvas.toolkit as unknown as TrialToolkit;
  mkdirSync(outDir, { recursive: true });
  const copies = mkdtempSync(resolve(tmpdir(), "climb-trial-"));
  // Reads the board, never writes it. Each copy opens with the board's own style, which lives beside the board file.
  const base = measure(canvas, modules, toolkit.openCanvasFile(boardPath));
  const openCopy = (folder: string, from = boardPath) => {
    mkdirSync(resolve(copies, folder));
    const copy = resolve(copies, folder, basename(boardPath));
    copyFileSync(from, copy);
    return { copy, file: toolkit.openCanvasFile(copy, { canvasStyle: base.file.session.canvasStyle }) };
  };
  /** One call on an open copy, measured from the copy's file as the call left it. */
  const step = async (on: { copy: string; file: CanvasFile }, before: BoardState, call: ReviewCall): Promise<{ step: TrialStep; after: BoardState }> => {
    const from = performance.now();
    const result = await toolkit.callToolkitTool(on.file, call.tool, call.args)
      .catch((error: unknown) => ({ isError: true, text: `ERROR · ${call.tool} — ${error instanceof Error ? error.message : String(error)}`, persisted: undefined }));
    const ms = () => Math.round(performance.now() - from);
    if (result.isError) return { step: refusedStep(before, result.text, "the tool returned an error", ms()), after: before };
    if (!result.persisted?.written) return { step: refusedStep(before, result.text, "the call changes nothing on the board", ms()), after: before };
    const after = measure(canvas, modules, toolkit.openCanvasFile(on.copy, { canvasStyle: base.file.session.canvasStyle }));
    const changes = changesOf(before, after, call);
    return { step: { applied: true, text: result.text, ...changes, board: { before: before.numbers, after: after.numbers }, ms: ms() }, after };
  };

  try {
    const calls: CallTrial[] = [];
    const left = new Map<CallTrial, { copy: string; after: BoardState }>();
    for (const finding of options.findings) {
      for (const [index, proposed] of finding.calls.entries()) {
        const name = `${finding.id} call ${index + 1}`;
        const on = openCopy(String(calls.length));
        const alone = await step(on, base, proposed.call);
        const trial: CallTrial = { name, finding: finding.id, unit: proposed.unit, call: proposed.call, marks: proposed.marks, alone: alone.step, image: null, imageMs: 0, sequence: null };
        const from = performance.now();
        const png = alone.step.applied ? changeImage(canvas, base, alone.after, trial) : proposed.marks.length > 0 ? sketchImage(canvas, base, trial) : null;
        if (png) {
          trial.image = fileName(name);
          writeFileSync(resolve(outDir, trial.image), png);
          trial.imageMs = Math.round(performance.now() - from);
        }
        calls.push(trial);
        left.set(trial, { copy: on.copy, after: alone.after });
      }
    }

    // The sort is stable: inside one unit the calls keep the order of the findings.
    const order = calls.filter((trial) => trial.alone.applied)
      .sort((a, b) => UNIT_RANK(a.unit) - UNIT_RANK(b.unit) || (UNIT_RANK(a.unit) === 1 ? a.unit.localeCompare(b.unit) : 0));
    // The first call of the sequence runs on the board as it is, which is its trial alone:
    // the sequence starts from the copy that trial left, and does not run the call again.
    const first = order[0] && left.get(order[0])!;
    const sequence = first && openCopy("sequence", first.copy);
    let state = base;
    const earlier: CallTrial[] = [];
    for (const [turn, trial] of order.entries()) {
      const ran = turn === 0 ? { step: { ...trial.alone, flags: [...trial.alone.flags], ms: 0 }, after: first!.after } : await step(sequence!, state, trial.call);
      const alone = new Set(trial.alone.flags.map((flag) => flag.text));
      const conflict = earlier.length > 0 && (!ran.step.applied || ran.step.flags.some((flag) => !alone.has(flag.text)));
      const touched = new Set(touchedIds(trial, base));
      const sharing = earlier.filter((other) => touchedIds(other, base).some((id) => touched.has(id)));
      const conflictsWith = conflict ? (sharing.length > 0 ? sharing : earlier).map((other) => other.name) : [];
      if (conflict) ran.step.flags.push({ kind: "conflict", text: `conflicts after earlier calls: ${conflictsWith.join(", ")}` });
      trial.sequence = { ...ran.step, turn: turn + 1, conflictsWith };
      if (ran.step.applied) earlier.push(trial);
      state = ran.after;
    }

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    return {
      board: boardPath,
      calls,
      sequence: { order: order.map((trial) => trial.name), end: state.numbers },
      ms: {
        total: Math.round(performance.now() - started),
        alone: sum(calls.map((trial) => trial.alone.ms)),
        images: sum(calls.map((trial) => trial.imageMs)),
        sequence: sum(calls.map((trial) => trial.sequence?.ms ?? 0)),
      },
    };
  } finally {
    rmSync(copies, { recursive: true, force: true });
  }
}

/** The ids a call touches: the ones its arguments name, and every wire and box it changed alone. */
const touchedIds = (trial: CallTrial, board: BoardState): string[] =>
  [...namedIds(trial.call.args, board), ...trial.alone.wires.map((wire) => wire.id), ...trial.alone.boxes.map((box) => box.id)];

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const names = (ids: string[]) => ids.length > 0 ? ids.join(", ") : "none";
const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n)}`;

function wireLine(wire: WireFact | null): string {
  if (!wire) return "not on the board";
  return [
    `${wire.length} px`, count(wire.bends, "bend"), `ports ${wire.ports.from}→${wire.ports.to}`,
    ...(wire.label ? [`label at (${wire.labelAt!.x}, ${wire.labelAt!.y})`] : []),
    `crosses ${names(wire.crosses)}`, `through ${names(wire.through)}`,
    `shared trunk ${names(wire.trunks.map((trunk) => `${trunk.wire} ${trunk.length} px`))}`,
  ].join(" · ");
}

const boxLine = (box: WorldRect | null) => box ? `x ${box.x} · y ${box.y} · ${box.width} × ${box.height}` : "not on the board";

function boardLine(numbers: BoardNumbers): string {
  const of = (severity: string) => numbers.lints.filter((lint) => lint.severity === severity).length;
  return `${count(of("error"), "lint error")} · ${count(of("warning"), "lint warning")} · wire length ${numbers.wireLength} px · ${count(numbers.crossings, "crossing")}`;
}

/** At most this many changed wires get their two lines. The rest are named. */
const WIRE_LINES_MAX = 8;
/** The tool's reply without its echo of the arguments: the call is printed above it. */
const toolText = (text: string) => text.split("\n\nReceived arguments:")[0]!.split("\n").map((line) => `    ${line}`);

/** The lines of one step: what changed, in numbers, then the flags. */
function stepLines(step: TrialStep): string[] {
  const own = step.boxes.filter((box) => box.movedWith === null);
  const geometry = own.flatMap((box) => {
    const carried = step.boxes.filter((other) => other.movedWith === box.id).map((other) => other.id);
    const landed = (["x", "y", "width", "height"] as const).flatMap((key) => {
      const asked = box.asked?.[key];
      if (asked === undefined || !box.before || !box.after) return [];
      const [was, now] = [box.before[key], box.after[key]];
      return asked === was && now === was ? [] : [`asked ${key} ${asked} (${signed(asked - was)}), landed ${key} ${now} (${signed(now - was)})`];
    });
    return [
      `  ${box.id} before: ${boxLine(box.before)}`,
      `  ${box.id} after:  ${boxLine(box.after)}${landed.length > 0 ? ` · ${landed.join(" · ")}` : ""}`,
      ...(carried.length > 0 ? [`  ${box.id} carried ${count(carried.length, "item")} by the same offset: ${carried.join(", ")}`] : []),
    ];
  });
  const more = step.wires.slice(WIRE_LINES_MAX).map((wire) => wire.id);
  const added = step.board.after.lints.filter((lint) => lint.severity !== "error" && !step.board.before.lints.some((had) => lintKey(had) === lintKey(lint)));
  return [
    ...geometry,
    ...step.wires.slice(0, WIRE_LINES_MAX).flatMap((wire) => [`  ${wire.id} before: ${wireLine(wire.before)}`, `  ${wire.id} after:  ${wireLine(wire.after)}`]),
    ...(more.length > 0 ? [`  ${count(more.length, "more wire")} changed: ${more.join(", ")}`] : []),
    `  board before: ${boardLine(step.board.before)}`,
    `  board after:  ${boardLine(step.board.after)}`,
    ...added.map((lint) => `  lint ${lint.severity} added: ${lint.rule} at ${lint.at.join(", ")}: ${lint.message}`),
    `  flags: ${names(step.flags.map((flag) => flag.text))}`,
  ];
}

/** What the drawer reads under one finding: each call, what its trials did, and its image. */
function adviceOf(record: TrialRecord, finding: string, outDir: string): FindingAdvice {
  const calls = record.calls.filter((trial) => trial.finding === finding);
  const lines = calls.flatMap((trial, index) => {
    const head = `call ${index + 1} of ${calls.length}, from ${reviewerOf(trial.unit)}: ${JSON.stringify(trial.call)}`;
    if (!trial.alone.applied) {
      return [
        head,
        `  refused: ${trial.alone.flags[0]!.text}. The tool said:`,
        ...toolText(trial.alone.text),
        ...(trial.image ? [`  image ${trial.image}: sketch, not trialled. The dashed blue marks are the reviewer's sketch on the board as it is.`] : []),
      ];
    }
    const turn = trial.sequence!;
    const others = turn.flags.filter((flag) => flag.kind !== "conflict").map((flag) => flag.text);
    return [
      head,
      "  applied alone on a copy of the board:",
      ...stepLines(trial.alone).map((line) => `  ${line}`),
      `  with the other calls, turn ${turn.turn} of ${record.sequence.order.length}: ${turn.applied ? "applied" : `refused: ${turn.flags[0]!.text}`}`
        + ` · flags: ${names(turn.applied ? others : [])}${turn.conflictsWith.length > 0 ? ` · conflicts after earlier calls: ${turn.conflictsWith.join(", ")}` : ""}`,
      ...(turn.applied ? [`    board after this turn: ${boardLine(turn.board.after)}`] : toolText(turn.text)),
      `  image ${trial.image}: now, then the trial. Red marks the old route, label and place, green the ones the engine gave`
        + `${trial.marks.length > 0 ? ", dashed blue the reviewer's sketch" : ""}.`,
    ];
  });
  return { finding, lines, images: calls.flatMap((trial) => trial.image ? [resolve(outDir, trial.image)] : []) };
}

/**
 * Trials every call of `findings` on copies of the board at `boardPath`,
 * which it never writes. Writes its record and images into `outDir`. Returns
 * one advice per finding that has a call.
 */
export async function trialFindings(options: {
  canvas: ReviewCanvas;
  boardPath: string;
  outDir: string;
  findings: Array<{ id: string; calls: ProposedCall[] }>;
}): Promise<FindingAdvice[]> {
  const record = await runTrials(options);
  writeFileSync(resolve(options.outDir, "trial.json"), `${JSON.stringify(record, null, 2)}\n`);
  return options.findings.filter((finding) => finding.calls.length > 0).map((finding) => adviceOf(record, finding.id, options.outDir));
}

const USAGE = "Usage: climb trial --board <canvas.json> --calls <json file> --out <dir>. The calls file is a list of { id, calls: [{ unit, call: { tool, args }, marks }] }.";

/** The calls file of `climb trial`. `unit` defaults to the loose-items reviewer and `marks` to none. */
function parseCalls(text: string): Array<{ id: string; calls: ProposedCall[] }> {
  const findings: unknown = JSON.parse(text);
  if (!Array.isArray(findings)) throw new Error(USAGE);
  return findings.map((finding: { id?: unknown; calls?: unknown }) => {
    if (typeof finding?.id !== "string" || !Array.isArray(finding.calls)) throw new Error(USAGE);
    return {
      id: finding.id,
      calls: finding.calls.map((proposed: Partial<ProposedCall> | null): ProposedCall => {
        const call = proposed?.call;
        if (typeof call?.tool !== "string" || call.args === null || typeof call.args !== "object") throw new Error(`${finding.id}: each call needs { call: { tool, args } }. ${USAGE}`);
        return { unit: proposed?.unit ?? LOOSE_UNIT, call, marks: proposed?.marks ?? [] };
      }),
    };
  });
}

/** `climb trial --board <canvas.json> --calls <json file> --out <dir>`: the trial run by hand. Prints what the drawer would read. */
export async function runTrial(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--board", "--calls", "--out"]);
  const [board, calls, out] = [flags.get("--board"), flags.get("--calls"), flags.get("--out")];
  if (!board || !calls || !out) throw new Error(USAGE);
  const outDir = resolve(out);
  const advice = await trialFindings({ canvas: await loadReviewCanvas(), boardPath: resolve(board), outDir, findings: parseCalls(readFileSync(resolve(calls), "utf8")) });
  for (const item of advice) console.log([`${item.finding}`, ...item.lines, ...item.images.map((image) => `  ${image}`), ""].join("\n"));
  const record = JSON.parse(readFileSync(resolve(outDir, "trial.json"), "utf8")) as TrialRecord;
  console.log(`${count(record.calls.length, "call")} · ${record.ms.total} ms (alone ${record.ms.alone}, images ${record.ms.images}, sequence ${record.ms.sequence}) · ${resolve(outDir, "trial.json")}`);
}
