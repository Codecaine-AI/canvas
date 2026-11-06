/**
 * The canvas MCP's tool surface and dispatch, independent of any transport.
 *
 * Five tools belong to this server: `canvas_list`, `canvas_open`, and
 * `canvas_create` choose the board (an id under canvases/, or for open, any
 * board file inside the workspace such as a docs page's sidecar), `canvas_check` lints and renders
 * the whole board, and `canvas_guidance` serves the authoring standards.
 * Everything else is the layout-editor agent's own toolkit, re-exposed
 * verbatim from `@codecaine-ai/canvas/toolkit`: the same names, the same
 * descriptions, the same parameter schemas, and the same code behind them. A
 * toolkit call runs against the one active canvas and is saved to its file as
 * soon as it applies (see `callToolkitTool`), so there is no commit step.
 *
 * The service holds a single active canvas per server process. Opening another
 * canvas — or the same one again — replaces it with a fresh read of the file,
 * which is also how a caller recovers after an external save made the session
 * stale.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";
import { getCanvasAuthoringGuidance } from "@codecaine-ai/canvas/authoring";
import { JUDGE_PNG_MAX_EDGE } from "@codecaine-ai/canvas/render";
import {
  boardStateSnapshot,
  brokenWiresLine,
  callToolkitTool,
  canvasStyleOverrides,
  checkCanvasFile,
  createCanvasFile,
  openCanvasFile,
  toolkitTools,
  type CanvasFileSession,
  type CanvasStyle,
} from "@codecaine-ai/canvas/toolkit";

export type CanvasToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/**
 * One MCP tool result, shaped for `tools/call`. `_meta.canvasId` names the board the call acted on:
 * the one a successful open or create landed on, or the open board an edit or check ran against.
 */
export interface CanvasToolResult {
  [key: string]: unknown;
  content: CanvasToolContent[];
  isError?: boolean;
  _meta?: { canvasId: string };
}

/** One MCP tool declaration, shaped for `tools/list`. */
export interface CanvasToolDeclaration {
  name: string;
  title?: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
}

export interface CanvasServiceOptions {
  /** Containment root: canvas_open opens a board file only inside it. */
  workspace: string;
  /** Project root: a relative board path resolves against it first, then against the workspace. Default the workspace. */
  project?: string;
  /** The standalone boards folder that ids, canvas_list, and canvas_create use. Default `<project>/canvases`. */
  canvasesDir?: string;
}

/** The id grammar the layout session store accepts for a canvas file. */
const CANVAS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const CANVAS_SUFFIX = ".canvas.json";

const NO_ACTIVE_CANVAS =
  "No canvas is open. Call canvas_open { \"canvas\": \"<id>\" } first — canvas_list shows the ids — or canvas_create for a new board.";

/** True when `path` lies strictly inside the folder `root` (both absolute). */
function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Rewrite draft-07 tuples into a form every MCP client accepts.
 *
 * TypeBox emits a tuple as `items: [a, b]` with `additionalItems: false`. The
 * Anthropic API requires `items` to be a schema or a boolean and rejects the
 * whole tool otherwise, which silently drops every gesture that takes a point.
 * A tuple whose members share one schema (every `[x, y]` on this surface)
 * becomes a fixed-length array of that schema; a mixed tuple becomes the
 * 2020-12 `prefixItems` spelling. Both accept exactly the values the original
 * did, and the call is still validated against the agent's own schema.
 */
function normalizeTuples(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeTuples);
  if (node === null || typeof node !== "object") return node;
  const { items, additionalItems, ...rest } = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) out[key] = normalizeTuples(value);
  if (!Array.isArray(items)) {
    if (items !== undefined) out.items = normalizeTuples(items);
    if (additionalItems !== undefined) out.additionalItems = additionalItems;
    return out;
  }
  const members = items.map(normalizeTuples);
  const first = JSON.stringify(members[0]);
  if (members.length > 0 && members.every((member) => JSON.stringify(member) === first)) {
    out.items = members[0];
  } else {
    out.prefixItems = members;
    out.items = false;
  }
  out.minItems = members.length;
  if (additionalItems === false) out.maxItems = members.length;
  return out;
}

/**
 * A TypeBox schema is JSON Schema already, but it is a live object that may
 * carry non-enumerable or symbol-keyed metadata. A JSON round trip leaves
 * exactly the schema a model sees; the only rewrite on the way out is the
 * tuple spelling (`normalizeTuples`).
 */
export function jsonSchema(schema: unknown): CanvasToolDeclaration["inputSchema"] {
  return normalizeTuples(JSON.parse(JSON.stringify(schema))) as CanvasToolDeclaration["inputSchema"];
}

/**
 * Shape one `tools/call` result as content blocks only. Claude Code and Codex
 * show `structuredContent` instead of the text blocks when a result has both.
 */
function toolResult(content: CanvasToolContent[], isError = false): CanvasToolResult {
  return { content, ...(isError ? { isError: true } : {}) };
}

function text(value: string, isError = false): CanvasToolResult {
  return toolResult([{ type: "text", text: value }], isError);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Rough token count for a size hint — about four characters per token. */
function approximateTokens(chars: number): number {
  return Math.max(1, Math.round(chars / 4));
}

/**
 * The STYLE line `canvas_open` prints: the active theme always, then the
 * workspace's overrides of that theme's preset when there are any — palette
 * inks one per color (`palette.red=#C8402F`), every other token as `key=value`.
 */
export function styleLine(canvasStyle: CanvasStyle): string {
  const overrides: string[] = [];
  for (const [key, value] of Object.entries(canvasStyleOverrides(canvasStyle))) {
    if (key === "palette" && value && typeof value === "object") {
      for (const [color, ink] of Object.entries(value)) overrides.push(`palette.${color}=${ink}`);
    } else {
      overrides.push(`${key}=${value}`);
    }
  }
  return [
    `STYLE · theme ${canvasStyle.theme}`,
    ...(overrides.length > 0 ? [`workspace overrides: ${overrides.join(", ")}`] : []),
  ].join(" · ");
}

/** The server-owned tools, declared ahead of the toolkit roster. */
const SERVER_TOOLS: CanvasToolDeclaration[] = [
  {
    name: "canvas_list",
    title: "List canvases",
    description:
      "List the canvases in this project (canvases/<id>.canvas.json): each id, title, and object count, with the open one marked. Use an id with canvas_open.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "canvas_open",
    title: "Open canvas",
    description:
      "Open a canvas as the board every other canvas tool edits, reading it fresh from disk. Returns the board description, the full digest (every section, object, connection, and route with its id and geometry), and the open lint findings, plus the file hash. Also re-reads the workspace style settings (canvases/canvas-style.json: the visual theme — figjam, schematic-light, or schematic-dark — and its overrides) that renders and lints use; the STYLE line reports the active theme. The theme is the person's workspace choice: no tool changes it, and color still encodes what kind of thing an object is. Call it again to reload after the file changed elsewhere; any edit you make afterwards saves to the file immediately.",
    inputSchema: {
      type: "object",
      properties: {
        canvas: {
          type: "string",
          description:
            "The canvas id from canvas_list, e.g. \"v2-flow\" (the file name without .canvas.json), "
            + "or the path of a page's embedded board, e.g. \"<page>/assets/canvases/flow.canvas.json\" "
            + "(absolute, or relative to the project root). The file must lie inside the project root. "
            + "Edits save back to that file.",
        },
        thread_id: {
          type: "string",
          description: "Your T3 thread id, when the harness does not pass T3CODE_THREAD_ID. Binds this server run to that thread in the action log.",
        },
      },
      required: ["canvas"],
      additionalProperties: false,
    },
  },
  {
    name: "canvas_guidance",
    title: "Canvas design guidance",
    description:
      "Read the canvas authoring standards the layout editor designs by. With no topic, returns the topic list with approximate sizes; with a topic id, returns that topic in full. Read the relevant topics before building or restructuring a diagram.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "A topic id from the list, e.g. \"diagram_design\". Omit to list the topics.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "canvas_create",
    title: "Create canvas",
    description:
      "Create a new board at canvases/<id>.canvas.json holding only its page frame, and open it as canvas_open does. Refuses an id that already exists. Place, connect, and check it with the other canvas tools. "
      + `The whole board, padding included, reads at real size up to ${JUDGE_PNG_MAX_EDGE} × ${JUDGE_PNG_MAX_EDGE}px, so lay 4 or more sections out in 2 or 3 rows that grow down, not in one long row. `
      + "Build order: place_section with title and color for each section, place_shape with text, detail and color for each node, arrange_section for each section, space_out the sections, connect every wire, tighten_wires once, then canvas_check and fix its errors.",
    inputSchema: {
      type: "object",
      properties: {
        canvas: {
          type: "string",
          description: "The new canvas id: letters, digits, dot, dash, or underscore, e.g. \"checkout-states\".",
        },
        title: { type: "string", description: "The board title, also the page frame's name." },
      },
      required: ["canvas", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "canvas_check",
    title: "Check canvas",
    description:
      "Check the open board before you call it done: runs every lint and returns the findings grouped by severity with counts, the node and edge counts, and a PNG of the whole board at its full bounds. Overlap is the only lint: a box on a box, or a section on a section. Wire routes, label chips, text fit, and section fit are automatic: the LAYOUT block counts wire length, crossings, and label chips that found no clear spot, and a TEXT note names a sticky or section whose text clips. None of those block. The PNG shows the board at 1:1 world scale, scaled down only so its long edge is at most 2576px: the size the judges see. Read the flow, the grouping and the text in it, and use look to read one section up close. look frames one region; canvas_check shows all of it. Changes nothing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const TOOLKIT_DECLARATIONS: CanvasToolDeclaration[] = toolkitTools.map((tool) => ({
  name: tool.name,
  title: tool.label,
  description: tool.description,
  inputSchema: jsonSchema(tool.parameters),
}));

const TOOLKIT_NAMES = new Set(toolkitTools.map((tool) => tool.name));

/** Workspace-bound canvas service: tool declarations plus one active canvas session. */
export function createCanvasService(options: CanvasServiceOptions) {
  const project = resolve(options.project ?? options.workspace);
  const canvasesDir = resolve(options.canvasesDir ?? join(project, "canvases"));
  let active: CanvasFileSession | null = null;

  function canvasPath(id: string): string {
    return join(canvasesDir, `${id}${CANVAS_SUFFIX}`);
  }

  /** A path as the results print it: workspace-relative inside the workspace, absolute outside it. */
  function shownPath(path: string): string {
    const rel = relative(options.workspace, path);
    return rel.startsWith("..") || isAbsolute(rel) ? path : rel;
  }

  /** A root folder in canonical form, so a symlink cannot reach past it. */
  function realRoot(root: string): string {
    return existsSync(root) ? realpathSync(root) : resolve(root);
  }

  function workspaceRoot(): string {
    return realRoot(options.workspace);
  }

  /**
   * The file a `canvas` argument names: a bare id is canvases/<id>.canvas.json;
   * anything with a path separator is a .canvas.json file in any folder of the
   * workspace, such as a docs page's sidecar. A relative path resolves against
   * the project root when that file exists, else against the workspace; either
   * way it must lie inside the workspace. `openCanvas` then checks the real
   * path (`realBoard`).
   */
  function canvasTarget(tool: string, raw: string): { id: string; path: string } | { error: string } {
    if (/[\\/]/.test(raw)) {
      const inProject = resolve(project, raw);
      const path = existsSync(inProject) ? inProject : resolve(options.workspace, raw);
      if (!isInside(resolve(options.workspace), path) && !isInside(workspaceRoot(), path)) {
        return { error: outsideWorkspace(tool, raw) };
      }
      if (!path.endsWith(CANVAS_SUFFIX)) {
        return { error: `${tool} rejected: ${JSON.stringify(raw)} is not a ${CANVAS_SUFFIX} file.` };
      }
      return { id: basename(path, CANVAS_SUFFIX), path };
    }
    const id = raw.endsWith(CANVAS_SUFFIX) ? raw.slice(0, -CANVAS_SUFFIX.length) : raw;
    if (!CANVAS_ID_PATTERN.test(id)) {
      return { error: `${tool} rejected: ${JSON.stringify(raw)} is not a canvas id. Call canvas_list for the ids.` };
    }
    return { id, path: canvasPath(id) };
  }

  function outsideWorkspace(tool: string, raw: string): string {
    return `${tool} rejected: ${JSON.stringify(raw)} is outside the workspace ${workspaceRoot()}. `
      + `Open a ${CANVAS_SUFFIX} file inside it, or a canvas id from canvas_list.`;
  }

  /**
   * Refuse an existing board file unless its real path, every symlink
   * followed, is a .canvas.json file inside the real workspace root, or, for
   * an id, inside the real boards folder.
   */
  function realBoard(tool: string, raw: string, path: string, byId: boolean): string | null {
    const real = realpathSync(path);
    const roots = byId ? [workspaceRoot(), realRoot(canvasesDir)] : [workspaceRoot()];
    if (!roots.some((root) => isInside(root, real))) return outsideWorkspace(tool, raw);
    if (!real.endsWith(CANVAS_SUFFIX)) {
      return `${tool} rejected: ${JSON.stringify(raw)} is not a ${CANVAS_SUFFIX} file.`;
    }
    return null;
  }

  /** The OPENED digest: header line, style, then the board state with its lints. */
  function openedText(verb: "OPENED" | "CREATED", file: CanvasFileSession): string {
    const title = file.session.draft.title ?? "";
    const canvasStyle = file.session.canvasStyle;
    const broken = brokenWiresLine(file.session.draft);
    return [
      `${verb} · ${file.canvasId} ${JSON.stringify(title)} · ${shownPath(file.canvasPath)} · sha256:${file.diskHash}`,
      ...(canvasStyle ? [styleLine(canvasStyle)] : []),
      ...(broken ? [broken] : []),
      boardStateSnapshot(file.session),
    ].join("\n\n");
  }

  function listCanvases(): CanvasToolResult {
    if (!existsSync(canvasesDir)) {
      return text(`No canvases directory at ${canvasesDir}.`, true);
    }
    const canvases = readdirSync(canvasesDir)
      .filter((name) => name.endsWith(CANVAS_SUFFIX))
      .sort()
      .map((name) => {
        const id = name.slice(0, -CANVAS_SUFFIX.length);
        try {
          const document = JSON.parse(readFileSync(join(canvasesDir, name), "utf8")) as {
            title?: unknown;
            objects?: unknown;
          };
          return {
            id,
            title: typeof document.title === "string" ? document.title : "",
            objects: Array.isArray(document.objects) ? document.objects.length : 0,
            open: active?.canvasPath === join(canvasesDir, name),
          };
        } catch {
          return { id, title: "", objects: 0, open: active?.canvasPath === join(canvasesDir, name), unreadable: true };
        }
      });
    const lines = canvases.map((canvas) =>
      `${canvas.open ? "* " : "  "}${canvas.id}  ${JSON.stringify(canvas.title)}  ${canvas.objects} objects`
      + ("unreadable" in canvas ? "  (unreadable JSON)" : ""));
    return text(
      canvases.length === 0
        ? `No canvases in ${canvasesDir}.`
        : [`CANVASES · ${canvases.length} in ${shownPath(canvasesDir)}`, ...lines].join("\n"),
    );
  }

  function openCanvas(args: Record<string, unknown>): CanvasToolResult {
    const raw = typeof args.canvas === "string" ? args.canvas.trim() : "";
    const target = canvasTarget("canvas_open", raw);
    if ("error" in target) return text(target.error, true);
    if (!existsSync(target.path) || !statSync(target.path).isFile()) {
      return text(
        target.path === canvasPath(target.id)
          ? `canvas_open rejected: no canvas "${target.id}" in ${canvasesDir}. Call canvas_list for the ids.`
          : `canvas_open rejected: no board file at ${target.path}.`,
        true,
      );
    }
    const refused = realBoard("canvas_open", raw, target.path, target.path === canvasPath(target.id));
    if (refused) return text(refused, true);
    let file: CanvasFileSession;
    try {
      file = openCanvasFile(target.path);
    } catch (error) {
      return text(`canvas_open failed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
    active = file;
    return { ...text(openedText("OPENED", file)), _meta: { canvasId: file.canvasId } };
  }

  function createCanvas(args: Record<string, unknown>): CanvasToolResult {
    const raw = typeof args.canvas === "string" ? args.canvas.trim() : "";
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (/[\\/]/.test(raw)) {
      return text(`canvas_create rejected: ${JSON.stringify(raw)} is not a bare canvas id.`, true);
    }
    const target = canvasTarget("canvas_create", raw);
    if ("error" in target) return text(target.error, true);
    if (title === "") return text("canvas_create rejected: give the board a title.", true);
    if (existsSync(target.path)) {
      return text(
        `canvas_create rejected: canvas "${target.id}" already exists. Call canvas_open { "canvas": "${target.id}" } to edit it.`,
        true,
      );
    }
    mkdirSync(canvasesDir, { recursive: true });
    const file = createCanvasFile(target.path, title);
    active = file;
    return { ...text(`${openedText("CREATED", file)}\nSAVED · ${shownPath(file.canvasPath)}`), _meta: { canvasId: file.canvasId } };
  }

  function checkCanvas(): CanvasToolResult {
    if (!active) return text(NO_ACTIVE_CANVAS, true);
    const result = checkCanvasFile(active, `${active.canvasId} · ${shownPath(active.canvasPath)}`);
    return {
      ...toolResult([
        { type: "text", text: result.text },
        ...(result.pngs ?? []).map((png) =>
          ({ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" })),
      ], result.isError),
      _meta: { canvasId: active.canvasId },
    };
  }

  function guidance(args: Record<string, unknown>): CanvasToolResult {
    const snapshot = getCanvasAuthoringGuidance();
    const topic = typeof args.topic === "string" ? args.topic.trim() : "";
    if (topic === "") {
      const topics = snapshot.topics.map((entry) => ({
        id: entry.id,
        title: entry.title,
        approxTokens: approximateTokens(entry.text.length),
      }));
      return text(
        [
          `GUIDANCE · ${topics.length} topics · ${snapshot.snapshotId}`,
          ...topics.map((entry) => `  ${entry.id}  ${JSON.stringify(entry.title)}  ~${entry.approxTokens} tokens`),
          "Call canvas_guidance { \"topic\": \"<id>\" } to read one.",
          "Read diagram_design before the first place_section: it holds the build order and the board size the judge reads at real size.",
        ].join("\n"),
      );
    }
    const found = snapshot.topics.find((entry) => entry.id === topic);
    if (!found) {
      return text(
        `canvas_guidance rejected: no topic "${topic}". Topics: ${snapshot.topics.map((entry) => entry.id).join(", ")}.`,
        true,
      );
    }
    return text(`# ${found.title}\n\n${found.text}`);
  }

  async function toolkit(name: string, args: Record<string, unknown>): Promise<CanvasToolResult> {
    // The board this edit runs on: a canvas_open in flight can replace `active` during the await.
    const file = active;
    if (!file) return text(NO_ACTIVE_CANVAS, true);
    const result = await callToolkitTool(file, name, args);
    const lines = [result.text];
    if (result.persisted?.written) {
      lines.push(`SAVED · ${shownPath(file.canvasPath)}`);
      if (result.persisted.residual > 0) {
        lines.push(
          `NOTE · the saved file differs from the draft by ${result.persisted.residual} patch op(s) the canvas reducer derived; call canvas_open to re-read the board as saved.`,
        );
      }
    }
    const content: CanvasToolContent[] = [{ type: "text", text: lines.join("\n") }];
    for (const png of result.pngs ?? []) {
      content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
    }
    return { ...toolResult(content, result.isError), _meta: { canvasId: file.canvasId } };
  }

  return {
    /** Server tools first, then the toolkit roster in the agent's registration order. */
    listTools(): CanvasToolDeclaration[] {
      return [...SERVER_TOOLS, ...TOOLKIT_DECLARATIONS];
    },
    /** The open canvas session, or null before the first canvas_open. */
    activeCanvas(): CanvasFileSession | null {
      return active;
    },
    async call(name: string, rawArgs: unknown): Promise<CanvasToolResult> {
      const args = record(rawArgs);
      try {
        // Lints, text fit and renders measure through text-measure. startMcp
        // loads HarfBuzz up front; a service built directly (tests, other
        // hosts) loads it here. Idempotent: every call after the first load
        // shares it.
        await useHarfBuzz();
        switch (name) {
          case "canvas_list": return listCanvases();
          case "canvas_open": return openCanvas(args);
          case "canvas_guidance": return guidance(args);
          case "canvas_create": return createCanvas(args);
          case "canvas_check": return checkCanvas();
          default:
            if (TOOLKIT_NAMES.has(name)) return await toolkit(name, args);
            return text(`Unknown tool: ${name}.`, true);
        }
      } catch (error) {
        return text(`${name} failed: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    },
  };
}

export type CanvasService = ReturnType<typeof createCanvasService>;
