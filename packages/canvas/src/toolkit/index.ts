/**
 * The layout editor's toolkit, bound to a canvas file.
 *
 * A board is edited through one surface: the 25 gesture tools
 * (`operationTools`) and the workflow tools (`workflowTools`), dispatched
 * through a `LayoutToolRuntime` bound to a `LayoutSession`.
 * `createToolRuntime(host)` asks its host for "the current session" and every
 * tool body works from there. This module is that host: a session opened
 * straight from a `canvases/<id>.canvas.json` file, whose edits are written
 * back to that file after every applied change. External agents (the canvas
 * MCP, anything else that edits boards) get the exact tool declarations,
 * validation, and code paths.
 *
 * The lifecycle around the tools:
 *
 * - **Open** reads the file, hashes its bytes, resolves the whole board as the
 *   scope (there is no operator selection), and builds the draft:
 *   page-frame injection, lint baseline, request-queue sync. No container,
 *   session directory, or registry entry is created: nothing on this path
 *   reads them.
 * - **Persist** saves every edit immediately, through the same patch path
 *   Studio's save uses: the diff since the last write replays onto the
 *   on-disk document through the canvas reducer's `canvas.applyAgentPatch`.
 *   A file that changed underneath the session is never clobbered — the
 *   caller must re-open it.
 * - **finalize** is not on the surface: there is no proposal to commit.
 *
 * Import discipline: this module and everything it reaches must load without
 * React, so the canvas package's object definitions are reached only through
 * type-only imports.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { validateToolArguments, type TSchema } from "@mariozechner/pi-ai";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAgentPatchOperation,
} from "../state/actions";
import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "../state/schema";

import { diffDocuments } from "../board/doc-diff";
import { layoutBlock, layoutNumbers } from "../board/layout-numbers";
import {
  FINISHING_RULES,
  diagnosticLines,
  sessionDiagnostics,
  type Diagnostic,
} from "../lints";
import { rasterizeSvgToPng } from "../render/rasterize";
import { BOARD_VIEW_WIDTH, renderBoardView } from "../session/perception/views";
import { resolveScope } from "../board/scope";
import { canvasStyleOverrides } from "../theme/canvas-style";
import { loadCanvasStyle, type CanvasStyle } from "../session/canvas-style";
import {
  boardStateSnapshot,
  draftWithPageFrame,
  injectedPageFrame,
  syncSessionRequests,
} from "../session/snapshots/context";
import type { LayoutSession } from "../session/session";
import { createToolRuntime } from "../session/tools/create-runtime";
import { closeNames } from "../session/tools/glyph-names";
import { operationTools, type OperationTool } from "../session/tools/operations";
import type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
} from "../session/tools/runtime";
import { workflowTools } from "../session/tools/workflow";
import type { WorkflowTool } from "../session/tools/workflow/workflow-tool";

export { boardStateSnapshot, operationTools, workflowTools };
export { canvasStyleOverrides, loadCanvasStyle };
export type { CanvasStyle, LayoutSession, LayoutToolRenderResult, LayoutToolRuntime, OperationTool, WorkflowTool };

/**
 * Workflow tools with no meaning outside an agent run. `finalize` ends a run
 * and turns the draft into a proposal for operator review; a file session has
 * neither a run nor a proposal, because every applied change is already on
 * disk.
 */
const RUN_ONLY_WORKFLOW_TOOLS = new Set(["finalize"]);

/**
 * One tool on the file-session surface: the agent's own descriptor, unchanged,
 * tagged with the roster it came from. `parameters` is the same TypeBox object
 * the agent registers, which is JSON Schema already.
 */
export interface ToolkitTool {
  readonly kind: "operation" | "workflow";
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
}

/**
 * The file-session surface, in the agent's registration order: the 25 gestures
 * first, then every workflow tool except the run-only ones. `resolve_request`
 * stays — its disposition is a reply and a status change on the annotation
 * thread, which is document content and persists like any edit.
 */
export const toolkitTools: readonly ToolkitTool[] = [
  ...operationTools.map((tool) => ({
    kind: "operation" as const,
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
  })),
  ...workflowTools
    .filter((tool) => !RUN_ONLY_WORKFLOW_TOOLS.has(tool.name))
    .map((tool) => ({
      kind: "workflow" as const,
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
    })),
];

const toolkitToolsByName = new Map(toolkitTools.map((tool) => [tool.name, tool]));
const workflowToolsByName = new Map(workflowTools.map((tool) => [tool.name, tool]));

/**
 * Raised when the canvas file changed on disk since this session last read or
 * wrote it. The message is written for the calling agent: it names the fix.
 */
export class CanvasFileConflictError extends Error {
  constructor(readonly canvasPath: string) {
    super(
      `The canvas file ${basename(canvasPath)} changed on disk since it was opened `
      + "(another editor saved it). This edit was NOT saved. Call canvas_open again "
      + "to reload the current board, then redo the edit against it.",
    );
    this.name = "CanvasFileConflictError";
  }
}

/**
 * A layout session whose authority is a file on disk.
 *
 * `session` is a complete `LayoutSession`, so every tool, perception block,
 * and snapshot helper takes it as-is. The fields beside it track the file:
 * the bytes' hash and parsed document as last read or written (the conflict
 * guard and the next diff's base), and the id of the page frame injected into
 * the draft, which is draft-only scaffolding and never written back.
 */
export interface CanvasFileSession {
  readonly canvasId: string;
  readonly canvasPath: string;
  readonly session: LayoutSession;
  readonly runtime: LayoutToolRuntime;
  /** sha256 of the file bytes as last read or written by this session. */
  diskHash: string;
  /** The on-disk document as last read or written: the base of the next persist diff. */
  persisted: InteractiveCanvasDocument;
  /** Id of the page frame `draftWithPageFrame` injected at open, or null when the board had one. */
  readonly injectedFrameId: string | null;
  /**
   * Set when a persist found the file changed underneath the session. The
   * draft then holds an edit the file never received, so every further call
   * is refused until the caller re-opens.
   */
  conflicted: boolean;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** `<id>.canvas.json` → `<id>`; any other file name keeps its base name. */
function canvasIdOf(canvasPath: string): string {
  return basename(canvasPath).replace(/\.canvas\.json$/, "");
}

/**
 * Open a canvas file as a layout session bound to a fresh tool runtime.
 *
 * The session is built from the file: the file is the
 * baseline, the draft carries an injected page frame when the board has no
 * root section, the lint baseline is seeded so the first edit reports a delta,
 * and the request queue is synced from the document's annotation threads.
 * Scope is the whole board — every object in the draft, the injected frame
 * included — since an external caller edits the board rather than a selection.
 * `containerId` and `sessionDir` are inert labels: nothing reads them.
 *
 * The workspace canvas style is read here too, from `canvas-style.json` beside
 * the canvas file (defaults when it is missing or malformed), so every render
 * and lint the session makes matches what Studio draws. Opening again re-reads
 * it — that is how a style change made in Studio reaches an open session.
 * `options.canvasStyle` overrides the file.
 */
export function openCanvasFile(
  canvasPath: string,
  options: { canvasStyle?: CanvasStyle } = {},
): CanvasFileSession {
  const raw = readFileSync(canvasPath);
  const baseline = JSON.parse(raw.toString("utf8")) as InteractiveCanvasDocument;
  const validation = validateInteractiveCanvasDocument(baseline);
  if (!validation.ok) {
    const issues = validation.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`${basename(canvasPath)} is not a valid canvas document: ${issues.join("; ")}`);
  }
  const baselineHash = sha256(raw);
  const frame = injectedPageFrame(baseline);
  const draft = draftWithPageFrame(baseline);
  const scopeResolution = resolveScope(draft, draft.objects.map((object) => object.id));
  const canvasId = canvasIdOf(canvasPath);
  const id = randomUUID();

  const session: LayoutSession = {
    id,
    canvasId,
    canvasPath,
    baseline,
    baselineHash,
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "",
    annotations: [],
    viewport: undefined,
    containerId: `canvas-file:${canvasId}`,
    sessionDir: "",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    requests: [],
    views: [],
    viewCount: 0,
    changeRenders: [],
    canvasStyle: options.canvasStyle ?? loadCanvasStyle(dirname(canvasPath)),
  };
  session.lastDiagnostics = sessionDiagnostics(session);
  syncSessionRequests(session);

  // Run-UX events (proposal/delta/annotations) feed Studio's live agent panel;
  // a file session has no subscriber, so they are dropped rather than buffered
  // for the life of the process. Renders arrive in `look`'s own result.
  const runtime = createToolRuntime({
    currentSession: () => session,
    emit: () => {},
    onRender: () => {},
  });

  return {
    canvasId,
    canvasPath,
    session,
    runtime,
    diskHash: baselineHash,
    persisted: baseline,
    injectedFrameId: frame?.id ?? null,
    conflicted: false,
  };
}

/**
 * Write a new board to `canvasPath` and open it. The board holds only its page
 * frame, titled like the board, as a board Studio creates does. The write
 * refuses a file that already exists, so a create never replaces a board.
 */
export function createCanvasFile(canvasPath: string, title: string): CanvasFileSession {
  const validation = validateInteractiveCanvasDocument(draftWithPageFrame({
    schemaVersion: 1,
    id: canvasIdOf(canvasPath),
    title,
    mode: "diagram",
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [],
    connections: [],
    annotations: [],
  }));
  if (!validation.ok) {
    const issues = validation.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`The new board failed canvas validation: ${issues.join("; ")}`);
  }
  writeFileSync(canvasPath, `${JSON.stringify(validation.document, null, 2)}\n`, { flag: "wx" });
  return openCanvasFile(canvasPath);
}

const SEVERITY_GROUPS: ReadonlyArray<[Diagnostic["severity"], string]> = [
  ["error", "ERRORS"],
  ["warning", "WARNINGS"],
  ["note", "NOTES"],
];

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The whole-board check: every lint, the finishing rules included, grouped
 * by severity, the node and edge counts, one render of the board's full
 * painted bounds, and the LAYOUT numbers (wire length, crossings, section
 * traversals, longest wires — board/layout-numbers.ts). `look` frames one region; this is the one view of all of it.
 * Counts and the render read the board as saved, so a page frame injected at
 * open is not counted. The lints read the draft, as every edit's LINTS line does.
 * A conflicted session is refused as every gesture is: its draft holds an
 * edit the file never received. A file saved elsewhere since the session
 * last read or wrote it conflicts the session here too, so the check never
 * approves a board the file no longer holds.
 */
export function checkCanvasFile(file: CanvasFileSession, label: string): LayoutToolRenderResult {
  if (!file.conflicted && sha256(readFileSync(file.canvasPath)) !== file.diskHash) file.conflicted = true;
  if (file.conflicted) {
    return { isError: true, text: new CanvasFileConflictError(file.canvasPath).message };
  }
  const diagnostics = sessionDiagnostics(file.session, FINISHING_RULES);
  const board = draftForDisk(file);
  const sections = board.objects.filter((object) => object.type === "section").length;
  const stickies = board.objects.filter((object) => object.type === "sticky").length;
  const nodes = board.objects.length - sections - stickies;
  const groups = SEVERITY_GROUPS.map(([severity, name]) =>
    ({ severity, name, found: diagnostics.filter((diagnostic) => diagnostic.severity === severity) }));

  const lines = [
    `CHECKED · ${label} · ${plural(nodes, "node")} · ${plural(board.connections.length, "edge")}`
    + ` · ${plural(sections, "section")} · ${plural(stickies, "sticky", "stickies")}`,
  ];
  const pngs: Buffer[] = [];
  try {
    const view = renderBoardView(board, { width: BOARD_VIEW_WIDTH, canvasStyle: file.session.canvasStyle });
    const png = rasterizeSvgToPng(view.svg);
    pngs.push(png.png);
    const { x, y, width, height } = view.camera;
    lines.push(
      `RENDER · whole board · ${png.width}×${png.height} px`
      + ` · bounds x ${Math.floor(x)}..${Math.ceil(x + width)} · y ${Math.floor(y)}..${Math.ceil(y + height)}`,
    );
  } catch (error) {
    lines.push(`RENDER · failed · ${error instanceof Error ? error.message : String(error)}`);
  }
  lines.push(
    `LINTS · ${diagnostics.length === 0 ? "clean · " : ""}`
    + groups.map(({ severity, found }) => plural(found.length, severity)).join(" · "),
  );
  for (const { name, found } of groups) {
    if (found.length === 0) continue;
    lines.push(`  ${name} (${found.length})`);
    for (const diagnostic of found) lines.push(...diagnosticLines(diagnostic).map((line) => `    ${line}`));
  }
  lines.push(layoutBlock(layoutNumbers(board, file.session.canvasStyle)));
  return { text: lines.join("\n"), pngs };
}

/**
 * The draft as the file should hold it: the injected page frame removed, with
 * any connection or annotation anchored to it, since neither can outlive its
 * endpoint on disk. Membership (`parentId`) needs no rewrite — the diff omits
 * it and the reducer re-derives it from geometry.
 */
function draftForDisk(file: CanvasFileSession): InteractiveCanvasDocument {
  const draft = file.session.draft;
  const frameId = file.injectedFrameId;
  if (frameId === null || !draft.objects.some((object) => object.id === frameId)) return draft;
  return {
    ...draft,
    objects: draft.objects.filter((object) => object.id !== frameId),
    connections: draft.connections.filter((connection) =>
      connection.from.objectId !== frameId && connection.to.objectId !== frameId),
    annotations: draft.annotations?.filter((annotation) =>
      annotation.target.kind !== "object" || annotation.target.objectId !== frameId),
  };
}

/** Write through a sibling temp file and rename — atomic on one filesystem, as Studio saves. */
function writeFileAtomic(filePath: string, contents: string): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, contents);
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch { /* the rename error is the one worth reporting */ }
    throw error;
  }
}

export interface PersistResult {
  /** False when the draft already matched the file, so nothing was written. */
  written: boolean;
  /** The patch replayed onto the file (empty when nothing was written). */
  operations: CanvasAgentPatchOperation[];
  /**
   * Patch operations still separating the saved file from the draft after the
   * replay — normally zero. Non-zero means the reducer derived something the
   * draft did not predict (e.g. membership or waypoints the gesture pipeline
   * reconciled differently), and the file is the truth.
   */
  residual: number;
}

/**
 * Save the session's edits since the last persist to its canvas file.
 *
 * 1. Re-read the file. If its bytes hash differently from what this session
 *    last read or wrote, someone else saved it: throw `CanvasFileConflictError`
 *    and mark the session conflicted rather than overwrite their work.
 * 2. Diff the last-persisted document against the disk form of the draft
 *    (`diffDocuments`, the differ `finalize` builds proposals with).
 * 3. Replay that patch onto the on-disk document through the canvas reducer's
 *    `canvas.applyAgentPatch` — the path Studio's Accept dispatches — so the
 *    file ends exactly where an accepted proposal would leave it.
 * 4. Validate, write atomically in Studio's format, and advance the stored
 *    hash and persisted base. `session.baseline` stays the document as opened,
 *    so the cumulative diff `look` reports reads "since canvas_open".
 */
export function persistCanvasFile(
  file: CanvasFileSession,
  summary = "Agent edit",
): PersistResult {
  const raw = readFileSync(file.canvasPath);
  if (sha256(raw) !== file.diskHash) {
    file.conflicted = true;
    throw new CanvasFileConflictError(file.canvasPath);
  }
  const target = draftForDisk(file);
  const operations = diffDocuments(file.persisted, target);
  if (operations.length === 0) return { written: false, operations, residual: 0 };

  const onDisk = JSON.parse(raw.toString("utf8")) as InteractiveCanvasDocument;
  const next = reduceInteractiveCanvasState(createInteractiveCanvasState(onDisk), {
    type: "canvas.applyAgentPatch",
    operations,
    summary,
  }).document;
  const validation = validateInteractiveCanvasDocument(next);
  if (!validation.ok) {
    const issues = validation.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`The edited board failed canvas validation and was not saved: ${issues.join("; ")}`);
  }
  const contents = `${JSON.stringify(validation.document, null, 2)}\n`;
  writeFileAtomic(file.canvasPath, contents);
  file.diskHash = sha256(contents);
  file.persisted = JSON.parse(contents) as InteractiveCanvasDocument;
  file.session.baselineHash = file.diskHash;
  return {
    written: true,
    operations,
    residual: diffDocuments(file.persisted, target).length,
  };
}

/**
 * "Did you mean" lines for every string argument that missed its enum.
 *
 * The schema refusal names the field and says the value is not allowed; it
 * does not say what was close. Walking the arguments beside the schema finds
 * each string an enum rejected (top-level, or inside a patch object) and offers
 * the nearest members, so `place_shape {type: "postgres"}` comes back pointing
 * at "brand-postgres" instead of at a hundred-name list.
 */
function enumMissHints(schema: unknown, args: unknown, path = ""): string[] {
  if (schema === null || typeof schema !== "object") return [];
  const node = schema as { enum?: unknown; properties?: Record<string, unknown>; anyOf?: unknown[] };
  const members = Array.isArray(node.enum)
    ? node.enum
    : (node.anyOf ?? []).flatMap((option) => {
        const values = (option as { enum?: unknown } | null)?.enum;
        return Array.isArray(values) ? values : [];
      });
  const roster = members.filter((member): member is string => typeof member === "string");
  if (typeof args === "string" && roster.length > 0 && !roster.includes(args)) {
    const close = closeNames(args, roster);
    return close.length > 0
      ? [`${path} "${args}": did you mean ${close.map((name) => `"${name}"`).join(", ")}?`]
      : [];
  }
  if (node.properties === undefined || args === null || typeof args !== "object" || Array.isArray(args)) {
    return [];
  }
  const record = args as Record<string, unknown>;
  return Object.entries(node.properties).flatMap(([key, child]) =>
    key in record ? enumMissHints(child, record[key], path === "" ? key : `${path}.${key}`) : []);
}

/** The result of one toolkit call, with what the persist step did. */
export interface ToolkitCallResult extends LayoutToolRenderResult {
  persisted?: PersistResult;
}

/**
 * Run one toolkit tool against a file session, then save.
 *
 * Arguments are validated against the tool's own schema with pi-ai's
 * `validateToolArguments`, the same check the agent runtime applies before
 * `execute`. A call that changed the draft (an APPLIED operation, a
 * description, a thread reply) is persisted immediately; errors, no-ops, and
 * `look` leave the draft untouched and write nothing. A failed save comes back
 * as an error result — the edit is not on disk, whatever the tool text said.
 */
export async function callToolkitTool(
  file: CanvasFileSession,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolkitCallResult> {
  const tool = toolkitToolsByName.get(name);
  if (!tool) {
    return { isError: true, text: `ERROR · ${name} — not a canvas toolkit tool.` };
  }
  if (file.conflicted) {
    return { isError: true, text: new CanvasFileConflictError(file.canvasPath).message };
  }
  let params: Record<string, unknown>;
  try {
    params = validateToolArguments(
      { name: tool.name, description: tool.description, parameters: tool.parameters },
      { type: "toolCall", id: randomUUID(), name: tool.name, arguments: args },
    ) as Record<string, unknown>;
  } catch (error) {
    const hints = enumMissHints(tool.parameters, args);
    return {
      isError: true,
      text: [
        `ERROR · ${name} — ${error instanceof Error ? error.message : String(error)}`,
        ...hints.map((hint) => `  hint · ${hint}`),
      ].join("\n"),
    };
  }

  const before = file.session.draft;
  const result: LayoutToolRenderResult = tool.kind === "operation"
    ? file.runtime.operation(name, params)
    : await workflowToolsByName.get(name)!.invoke(file.runtime, params);
  if (result.isError || file.session.draft === before) return result;

  try {
    const persisted = persistCanvasFile(file, `${name} (canvas toolkit)`);
    return { ...result, persisted };
  } catch (error) {
    return {
      ...result,
      isError: true,
      text: `${result.text}\n\nSAVE FAILED · ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
