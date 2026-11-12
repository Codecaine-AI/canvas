/**
 * One review of a board, a round of the critic loop (critic-loop.ts): the
 * lints canvas_check runs, then the region critics, a fuzzy lint beside the
 * strict one. Ford's idea: "having a secondary agent, like, look at in detail
 * at pieces and then kind of, like, provide feedback could be good."
 *
 * The board renders once as an overview and once per region: overlapping
 * rectangles at 1:1 world scale that cover the whole board. One critic per
 * region (GPT-6.1 Sol through the Codex CLI, low effort, fast mode) reads the
 * region crop, the same crop with the smart guides drawn on it (the pink
 * lines Studio shows in a drag: what is in line, and what sits a few px off)
 * and the overview with its region outlined. It returns JSON findings on
 * layout and structure, each a blocker, a should or a nit. The findings merge
 * across regions, so a fault two overlapping regions both see reaches the
 * drawer once.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import { CANVAS_REPO_ROOT } from "./paths.ts";
import { loadCanvas, renderBoardPng, type CanvasFile, type CanvasModules, type Lint, type WorldRect } from "./render.ts";

export const CRITIC_MODEL = "gpt-6.1-sol";
export const CRITIC_EFFORT = "low";
/** One critic's time, from its own start. Rounds 1 and 2 took 24 s at most. A critic that runs out gives no answer. */
const CRITIC_TIMEOUT_MS = 70_000;
/**
 * Ford, on the 3 rounds of round 2: "we need, like, more time for it to kind
 * of hone in on what's working and what's not", "like we should do like 10
 * rounds or something".
 */
export const DEFAULT_ROUNDS = 10;
/** The lint whose findings the guide crop tags (G1, G2, ...). */
const NEAR_MISS_RULE = "near-miss";
/**
 * The long edge of an "auto" grid region, and the overlap between neighbour
 * regions, in world px. Ford: "increase the grid breakdown we do so we get
 * more detail".
 */
export const DEFAULT_REGION_MAX = 900;
const REGION_OVERLAP = 120;
/** A region must hold more than the overlap it shares with its neighbours. */
const MIN_REGION_MAX = 300;
/**
 * The critics one review runs at once. The 900 px grid cuts a big board into
 * 20 or more regions, and `climb draw` reviews 5 boards at a time. Rounds 1
 * and 2 ran at most 9 critics a board, 587 in all, and none failed. 8 a board
 * keeps a draw near that load: at most 40 Codex processes.
 */
export const DEFAULT_COUNT = 8;
/** The overview outline of the critic's own region, in overview px. */
const OUTLINE_PX = 4;
const MAX_FINDINGS_PER_REGION = 10;

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
export interface MergedFinding extends Finding { regions: string[] }

export interface Region extends WorldRect { id: string }
export type GridSpec = "auto" | { cols: number; rows: number };

export interface CriticOptions { grid: GridSpec; regionMax: number; count: number; rounds: number }

/** The canvas modules a review calls: loadCanvas's, and this checkout's guide overlay. */
export interface ReviewCanvas extends CanvasModules {
  overlay: {
    renderGuideOverlay(board: unknown, options: { canvasStyle?: unknown; region?: WorldRect }): { png: Buffer; legend: string[] };
  };
}

export async function loadReviewCanvas(): Promise<ReviewCanvas> {
  const overlay = resolve(CANVAS_REPO_ROOT, "packages/canvas/src/session/perception/guide-overlay.ts");
  return { ...(await loadCanvas(CANVAS_REPO_ROOT)), overlay: (await import(overlay)) as ReviewCanvas["overlay"] };
}

/** `--critic-grid auto` or `<cols>x<rows>` (3x2). */
export function parseGrid(value: string | undefined): GridSpec {
  if (value === undefined || value === "auto") return "auto";
  const match = /^(\d+)x(\d+)$/.exec(value);
  const cols = Number(match?.[1]);
  const rows = Number(match?.[2]);
  if (!match || cols < 1 || rows < 1) throw new Error(`--critic-grid must be auto or <cols>x<rows> (3x2), not ${value}`);
  return { cols, rows };
}

/** `--critic-region-max <px>`: the long edge of an "auto" grid region. A `<cols>x<rows>` grid does not read it. */
export function parseRegionMax(value: string | undefined): number {
  if (value === undefined) return DEFAULT_REGION_MAX;
  const regionMax = Number(value);
  if (!Number.isInteger(regionMax) || regionMax < MIN_REGION_MAX) {
    throw new Error(`--critic-region-max must be a whole number of px, ${MIN_REGION_MAX} or more (900, ...), not ${value}`);
  }
  return regionMax;
}

/** `--critic-count <n>`: how many critics one review runs at once. */
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
export const CRITIC_FLAGS = ["--critic-grid", "--critic-region-max", "--critic-count", "--critic-rounds"] as const;

export function parseCritic(flags: Map<string, string>): CriticOptions {
  return {
    grid: parseGrid(flags.get("--critic-grid")),
    regionMax: parseRegionMax(flags.get("--critic-region-max")),
    count: parseCount(flags.get("--critic-count")),
    rounds: parseRounds(flags.get("--critic-rounds")),
  };
}

/** Equal spans of `count` along `length`, neighbours overlapping by REGION_OVERLAP. */
function spans(start: number, length: number, count: number): Array<{ start: number; size: number }> {
  const size = count === 1 ? length : Math.ceil((length + (count - 1) * REGION_OVERLAP) / count);
  return Array.from({ length: count }, (_, index) => ({
    start: Math.round(start + (count === 1 ? 0 : (index * (length - size)) / (count - 1))),
    size: Math.min(size, Math.ceil(length)),
  }));
}

/**
 * Overlapping regions that cover the board camera, row by row. "auto" takes
 * the fewest regions whose long edge is at most `regionMax`.
 */
export function regionGrid(camera: WorldRect, grid: GridSpec, regionMax = DEFAULT_REGION_MAX): Region[] {
  const fit = (length: number) => length <= regionMax ? 1 : Math.ceil((length - REGION_OVERLAP) / (regionMax - REGION_OVERLAP));
  const { cols, rows } = grid === "auto" ? { cols: fit(camera.width), rows: fit(camera.height) } : grid;
  const regions: Region[] = [];
  for (const y of spans(camera.y, camera.height, rows)) for (const x of spans(camera.x, camera.width, cols)) {
    regions.push({ id: `r${String(regions.length + 1).padStart(2, "0")}`, x: x.start, y: y.start, width: x.size, height: y.size });
  }
  return regions;
}

interface BoardObject { id: string; type: string; text?: string; color?: string; icon?: unknown; parentId?: string | null; geometry: WorldRect }
interface BoardConnection { id: string; from: { objectId: string }; to: { objectId: string }; label?: string }
interface Board { objects: BoardObject[]; connections: BoardConnection[] }

const overlaps = (a: WorldRect, b: WorldRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const short = (text: string | undefined) => {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
};

/** The board's objects and connections that touch a region, one line each, for the critic to name by id, and their ids. */
export function regionInventory(board: Board, region: WorldRect): { objects: string[]; connections: string[]; ids: Set<string> } {
  const inside = board.objects.filter((object) => object.geometry && overlaps(object.geometry, region));
  const ids = new Set(inside.map((object) => object.id));
  const colourOf = new Map(board.objects.map((object) => [object.id, object.color]));
  const parent = (id: string | null | undefined) => id ? `in ${id} (${colourOf.get(id) ?? "-"})` : "in board";
  const objects = inside.map((object) => [
    object.id,
    object.type,
    object.color ?? "-",
    object.icon === undefined ? null : "icon",
    parent(object.parentId),
    JSON.stringify(short(object.text)),
  ].filter(Boolean).join(" · "));
  const wires = board.connections.filter((wire) => ids.has(wire.from.objectId) || ids.has(wire.to.objectId));
  const connections = wires
    .map((wire) => `${wire.id} · ${wire.from.objectId} → ${wire.to.objectId}${wire.label ? ` · ${JSON.stringify(short(wire.label))}` : ""}`);
  return { objects, connections, ids: new Set([...ids, ...wires.map((wire) => wire.id)]) };
}

/** What a critic is told beside its region's inventory. */
export interface RegionNotes {
  /** What canvas_check already gave the drawer on this region: the tagged guides of image 2, then the other lints. */
  checked: string[];
  /** Earlier rounds' findings on this region's items, each with the drawer's answer. */
  earlier: string[];
}

export function criticPrompt(
  region: Region,
  inventory: { objects: string[]; connections: string[] },
  notes: RegionNotes = { checked: [], earlier: [] },
): string {
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  return [
    `Image 1 is region ${region.id} of a diagram board, at full size: board x ${region.x} to ${right}, y ${region.y} to ${bottom}.`,
    "Image 2 is image 1 with the board's smart guides drawn in pink. A faint line runs along edges and centres that are in line."
    + " A strong line with a tag (G1, G2, ...) is a near-miss: the line an item, a gap or an arrowhead sits a few px off.",
    "Image 3 is the whole board, scaled down, with that region outlined in red. Use image 3 for context only.",
    "",
    "List every layout and structure fault you see in image 1. You are a fuzzy lint: a strict lint already ran, so look for what it misses.",
    "Look at each section, item, wire and wire label in turn. Report a fault the moment it looks wrong to a careful designer. Do not stop at the first few.",
    "Use image 2 to judge what is in line: an item on none of the lines its neighbours share, a row with unequal gaps, a wire that bends because its two ends are off one line.",
    "",
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
    "",
    "Other critics review the neighbour regions. Review the part of a cut-off item that image 1 shows.",
    "Name items by the ids below. Put the visible text in labels when no id matches.",
    "Give each finding a one-line fix the drawer can make with the canvas tools (move, resize, arrange_section, route, change_color, change_shape, move_label and the rest).",
    `Give at most ${MAX_FINDINGS_PER_REGION} findings, most severe first.`,
    "Do not run commands or read files.",
    ...(notes.checked.length ? ["", "The strict lint already gave the drawer these. Do not report them again:", ...notes.checked] : []),
    ...(notes.earlier.length ? [
      "",
      "Earlier rounds reported these, and the drawer answered each. Report one again only when image 1 still shows it and the drawer's reason does not hold:",
      ...notes.earlier,
    ] : []),
    "",
    "Objects in this region (id · type · colour · icon · parent (its colour) · text):",
    ...(inventory.objects.length ? inventory.objects : ["(none)"]),
    "",
    "Wires that touch them (id · from → to · label):",
    ...(inventory.connections.length ? inventory.connections : ["(none)"]),
  ].join("\n");
}

/** The Codex `--output-schema`: OpenAI strict structured output, so every field is required. */
export const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "ids", "labels", "problem", "fix", "severity"],
        properties: {
          kind: { type: "string", enum: FINDING_KINDS },
          ids: { type: "array", items: { type: "string" } },
          labels: { type: "array", items: { type: "string" } },
          problem: { type: "string" },
          fix: { type: "string" },
          severity: { type: "string", enum: SEVERITIES },
        },
      },
    },
  },
} as const;

/** One critic's answer, refusing anything off FINDINGS_SCHEMA. */
export function parseFindings(text: string): Finding[] {
  const value = JSON.parse(text) as { findings?: unknown };
  if (!Array.isArray(value.findings)) throw new Error(`"findings" must be a list`);
  return value.findings.map((raw, index): Finding => {
    const finding = raw as Record<string, unknown>;
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
    return {
      kind: finding.kind as FindingKind,
      ids: strings("ids"),
      labels: strings("labels"),
      problem: (finding.problem as string).trim(),
      fix: (finding.fix as string).trim(),
      severity: finding.severity as Severity,
    };
  });
}

const rank = (finding: { severity: Severity }) => SEVERITIES.indexOf(finding.severity);
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * One list across regions. Two findings are the same fault when they share
 * a kind and an id (or, with no ids, a label): overlapping regions see the
 * same item. Ids not on the board move to labels. The merged finding keeps
 * the most severe finding's words, every id and label, and every region
 * that reported it; the list runs most severe first, then most regions.
 */
export function mergeFindings(byRegion: Array<{ region: string; findings: Finding[] }>, boardIds: ReadonlySet<string>): MergedFinding[] {
  const groups: MergedFinding[][] = [];
  const keyOwner = new Map<string, MergedFinding[]>();
  for (const { region, findings } of byRegion) {
    for (const finding of findings) {
      const ids = finding.ids.filter((id) => boardIds.has(id));
      const labels = [...finding.labels, ...finding.ids.filter((id) => !boardIds.has(id))];
      const entry: MergedFinding = { ...finding, ids, labels, regions: [region] };
      const keys = ids.length > 0 ? ids.map((id) => `${finding.kind} id ${id}`) : labels.map((label) => `${finding.kind} label ${normal(label)}`);
      if (keys.length === 0) keys.push(`${finding.kind} fix ${normal(finding.fix)}`);
      // Join every group this finding shares a key with.
      const hit = [...new Set(keys.map((key) => keyOwner.get(key)).filter((group): group is MergedFinding[] => group !== undefined))];
      const group = hit[0] ?? [];
      if (hit.length === 0) groups.push(group);
      for (const other of hit.slice(1)) {
        group.push(...other);
        groups.splice(groups.indexOf(other), 1);
        for (const [key, owner] of keyOwner) if (owner === other) keyOwner.set(key, group);
      }
      group.push(entry);
      for (const key of keys) keyOwner.set(key, group);
    }
  }
  const unique = (items: string[]) => [...new Set(items)];
  return groups.map((group) => {
    const lead = group.reduce((best, entry) => rank(entry) < rank(best) ? entry : best);
    return {
      ...lead,
      ids: unique(group.flatMap((entry) => entry.ids)),
      labels: unique(group.flatMap((entry) => entry.labels)),
      regions: unique(group.flatMap((entry) => entry.regions)).sort(),
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

export interface RegionRecord {
  region: Region;
  png: string;
  objects: number;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  /** Why the answer did not parse, or null when it did. */
  error: string | null;
  findings: Finding[];
}
export interface CritiqueRecord {
  board: string;
  model: string;
  effort: string;
  grid: { cols: number; rows: number } | "auto";
  /** The long edge an "auto" grid held its regions to. */
  regionMax: number;
  count: number;
  startedAt: string;
  /** Wall clock for the whole review: lints, renders, every critic and the merge. */
  durationMs: number;
  /** The lints and the renders. */
  renderMs: number;
  /** What canvas_check finds on the board. */
  lints: Lint[];
  regions: RegionRecord[];
  /** The critics' findings, merged. */
  findings: MergedFinding[];
}

/** An earlier round's finding as a critic reads it: the finding and the drawer's answer, in one line. */
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

/** The overview with one region outlined: a rect drawn into the board SVG's world-coordinate viewBox. */
function outlinedSvg(svg: string, region: WorldRect, scale: number): string {
  const stroke = OUTLINE_PX / scale;
  const rect = `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="none" stroke="#e5243b" stroke-width="${stroke}"/>`;
  const end = svg.lastIndexOf("</svg>");
  return `${svg.slice(0, end)}${rect}${svg.slice(end)}`;
}

/**
 * Lint and render `boardPath`, run one critic per non-empty region and merge
 * the findings. Writes into `outDir`: overview.png, guides.png (the overview
 * with the smart guides), regions/<id>.png, regions/<id>-guides.png,
 * regions/<id>-overview.png, regions/<id>.json (the raw answer) and
 * critique.json (a CritiqueRecord).
 */
export async function critiqueBoard(options: {
  canvas: ReviewCanvas;
  boardPath: string;
  outDir: string;
  critic: CriticOptions;
  /** Earlier rounds' findings. Each goes to the critics whose region holds one of its items, or with no ids, to the regions that reported it. */
  earlier?: EarlierFinding[];
}): Promise<CritiqueRecord> {
  const { canvas, boardPath, outDir } = options;
  const started = Date.now();
  const regionsDir = resolve(outDir, "regions");
  rmSync(regionsDir, { recursive: true, force: true });
  mkdirSync(regionsDir, { recursive: true });
  const schemaPath = resolve(outDir, "findings.schema.json");
  writeFileSync(schemaPath, `${JSON.stringify(FINDINGS_SCHEMA, null, 2)}\n`);

  const file: CanvasFile = canvas.toolkit.openCanvasFile(boardPath);
  const board = file.persisted as Board;
  const style = file.session.canvasStyle;
  const lints = canvas.lints.sessionDiagnostics(file.session, canvas.lints.FINISHING_RULES)
    .map(({ rule, severity, at, message, suggestion }): Lint => ({ rule, severity, at, message, suggestion }));
  const overview = renderBoardPng(canvas, file, undefined);
  writeFileSync(resolve(outDir, "overview.png"), overview.png);
  writeFileSync(resolve(outDir, "guides.png"), canvas.overlay.renderGuideOverlay(board, { canvasStyle: style }).png);
  const overviewSvg = canvas.render.renderBoardView(board, { width: overview.size.width, canvasStyle: style }).svg;

  const camera = canvas.render.boardCameraAtWorldScale(board, style);
  const jobs = regionGrid(camera, options.critic.grid, options.critic.regionMax).flatMap((region) => {
    const inventory = regionInventory(board, region);
    if (inventory.objects.length === 0) return [];
    const png = resolve(regionsDir, `${region.id}.png`);
    const scene = { bounds: region, objects: board.objects, connections: board.connections, obstacles: board.objects, chipZoom: 1 };
    const crop = canvas.render.renderSceneToSvg(board, scene, { width: region.width, height: region.height, canvasStyle: style });
    writeFileSync(png, canvas.rasterize.rasterizeSvgToPng(crop.svg).png);
    const guides = canvas.overlay.renderGuideOverlay(board, { canvasStyle: style, region });
    const guided = resolve(regionsDir, `${region.id}-guides.png`);
    writeFileSync(guided, guides.png);
    const context = resolve(regionsDir, `${region.id}-overview.png`);
    writeFileSync(context, canvas.rasterize.rasterizeSvgToPng(outlinedSvg(overviewSvg, region, overview.size.scale)).png);
    const here = (ids: string[]) => ids.some((id) => inventory.ids.has(id));
    const notes: RegionNotes = {
      checked: [
        ...guides.legend,
        ...lints.filter((lint) => lint.rule !== NEAR_MISS_RULE && here(lint.at))
          .map((lint) => `${lint.rule}: ${lint.message}${lint.suggestion ? ` (${lint.suggestion})` : ""}`),
      ],
      earlier: (options.earlier ?? [])
        .filter((finding) => finding.ids.length ? here(finding.ids) : finding.regions.includes(region.id))
        .map((finding) => finding.line),
    };
    return [{ region, inventory, images: [png, guided, context], notes }];
  });
  const renderMs = Date.now() - started;

  const { count } = options.critic;
  const gate = new Semaphore(count);
  const regions = await Promise.all(jobs.map((job) => gate.run(async (): Promise<RegionRecord> => {
    const answer = resolve(regionsDir, `${job.region.id}.json`);
    const begun = Date.now();
    const prompt = criticPrompt(job.region, job.inventory, job.notes);
    const run = await runCritic(criticArgs(regionsDir, prompt, job.images, schemaPath, answer), CRITIC_TIMEOUT_MS);
    let findings: Finding[] = [];
    let error: string | null = null;
    try {
      findings = parseFindings(readFileSync(answer, "utf8"));
    } catch (failure) {
      error = run.timedOut ? "timed out" : `${failure instanceof Error ? failure.message : String(failure)}\n${run.stderr.slice(-2000)}`;
    }
    return {
      region: job.region,
      png: `regions/${job.region.id}.png`,
      objects: job.inventory.objects.length,
      durationMs: Date.now() - begun,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      error,
      findings,
    };
  })));

  const boardIds = new Set([...board.objects.map((object) => object.id), ...board.connections.map((wire) => wire.id)]);
  const findings = mergeFindings(regions.map((record) => ({ region: record.region.id, findings: record.findings })), boardIds);
  const record: CritiqueRecord = {
    board: boardPath,
    model: CRITIC_MODEL,
    effort: CRITIC_EFFORT,
    grid: options.critic.grid,
    regionMax: options.critic.regionMax,
    count,
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
  const slowest = Math.max(0, ...record.regions.map((region) => region.durationMs));
  return `${record.lints.length} lints · ${record.regions.length} regions · ${raw} findings, ${record.findings.length} after merge`
    + ` · ${(record.durationMs / 1000).toFixed(1)} s wall (render ${(record.renderMs / 1000).toFixed(1)} s, slowest critic ${(slowest / 1000).toFixed(1)} s)`
    + `${failed.length ? ` · ${failed.length} unparsed: ${failed.map((region) => region.region.id).join(", ")}` : ""}`;
}
