/**
 * The canvas MCP's tool surface and dispatch, independent of any transport.
 *
 * Three tools belong to this server: `canvas_list` and `canvas_open` choose
 * the board, and `canvas_guidance` serves the authoring standards on demand.
 * Everything else is the layout-editor agent's own toolkit, re-exposed
 * verbatim from `@codecaine-ai/canvas-agent/toolkit`: the same names, the same
 * descriptions, the same parameter schemas, and the same code behind them. A
 * toolkit call runs against the one active canvas and is saved to its file as
 * soon as it applies (see `callToolkitTool`), so there is no commit step.
 *
 * The service holds a single active canvas per server process. Opening another
 * canvas — or the same one again — replaces it with a fresh read of the file,
 * which is also how a caller recovers after an external save made the session
 * stale.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { getCanvasAuthoringGuidance } from "@codecaine-ai/canvas-agent/authoring";
import {
  boardStateSnapshot,
  callToolkitTool,
  openCanvasFile,
  toolkitTools,
  type CanvasFileSession,
} from "@codecaine-ai/canvas-agent/toolkit";

export type CanvasToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** One MCP tool result, shaped for `tools/call`. */
export interface CanvasToolResult {
  [key: string]: unknown;
  content: CanvasToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** One MCP tool declaration, shaped for `tools/list`. */
export interface CanvasToolDeclaration {
  name: string;
  title?: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
}

export interface CanvasServiceOptions {
  /** Project root; canvases live in `<workspace>/canvases`. */
  workspace: string;
}

/** The id grammar the layout session store accepts for a canvas file. */
const CANVAS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const CANVAS_SUFFIX = ".canvas.json";

const NO_ACTIVE_CANVAS =
  "No canvas is open. Call canvas_open { \"canvas\": \"<id>\" } first — canvas_list shows the ids.";

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

function text(value: string, isError = false, structuredContent?: Record<string, unknown>): CanvasToolResult {
  return {
    content: [{ type: "text", text: value }],
    ...(structuredContent ? { structuredContent } : {}),
    ...(isError ? { isError: true } : {}),
  };
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

/** The three server-owned tools, declared ahead of the toolkit roster. */
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
      "Open a canvas as the board every other canvas tool edits, reading it fresh from disk. Returns the board description, the full digest (every section, object, connection, and route with its id and geometry), and the open lint findings, plus the file hash. Call it again to reload after the file changed elsewhere; any edit you make afterwards saves to the file immediately.",
    inputSchema: {
      type: "object",
      properties: {
        canvas: {
          type: "string",
          description: "The canvas id from canvas_list, e.g. \"v2-flow\" (the file name without .canvas.json).",
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
  const canvasesDir = join(options.workspace, "canvases");
  let active: CanvasFileSession | null = null;

  function canvasPath(id: string): string {
    return join(canvasesDir, `${id}${CANVAS_SUFFIX}`);
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
            open: active?.canvasId === id,
          };
        } catch {
          return { id, title: "", objects: 0, open: active?.canvasId === id, unreadable: true };
        }
      });
    const lines = canvases.map((canvas) =>
      `${canvas.open ? "* " : "  "}${canvas.id}  ${JSON.stringify(canvas.title)}  ${canvas.objects} objects`
      + ("unreadable" in canvas ? "  (unreadable JSON)" : ""));
    return text(
      canvases.length === 0
        ? `No canvases in ${canvasesDir}.`
        : [`CANVASES · ${canvases.length} in ${relative(options.workspace, canvasesDir) || canvasesDir}`, ...lines].join("\n"),
      false,
      { canvases },
    );
  }

  function openCanvas(args: Record<string, unknown>): CanvasToolResult {
    const raw = typeof args.canvas === "string" ? args.canvas.trim() : "";
    const id = raw.endsWith(CANVAS_SUFFIX) ? raw.slice(0, -CANVAS_SUFFIX.length) : raw;
    if (!CANVAS_ID_PATTERN.test(id)) {
      return text(`canvas_open rejected: ${JSON.stringify(raw)} is not a canvas id. Call canvas_list for the ids.`, true);
    }
    const path = canvasPath(id);
    if (!existsSync(path)) {
      return text(`canvas_open rejected: no canvas "${id}" in ${canvasesDir}. Call canvas_list for the ids.`, true);
    }
    let file: CanvasFileSession;
    try {
      file = openCanvasFile(path);
    } catch (error) {
      return text(`canvas_open failed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
    active = file;
    const title = file.session.draft.title ?? "";
    return text(
      [
        `OPENED · ${id} ${JSON.stringify(title)} · sha256:${file.diskHash}`,
        boardStateSnapshot(file.session),
      ].join("\n\n"),
      false,
      { canvas: id, title, hash: `sha256:${file.diskHash}`, path },
    );
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
        ].join("\n"),
        false,
        { snapshotId: snapshot.snapshotId, topics },
      );
    }
    const found = snapshot.topics.find((entry) => entry.id === topic);
    if (!found) {
      return text(
        `canvas_guidance rejected: no topic "${topic}". Topics: ${snapshot.topics.map((entry) => entry.id).join(", ")}.`,
        true,
      );
    }
    return text(`# ${found.title}\n\n${found.text}`, false, {
      snapshotId: snapshot.snapshotId,
      topic: found.id,
    });
  }

  async function toolkit(name: string, args: Record<string, unknown>): Promise<CanvasToolResult> {
    if (!active) return text(NO_ACTIVE_CANVAS, true);
    const result = await callToolkitTool(active, name, args);
    const lines = [result.text];
    if (result.persisted?.written) {
      lines.push(`SAVED · ${relative(options.workspace, active.canvasPath)}`);
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
    return {
      content,
      ...(result.details ? { structuredContent: { ...result.details } } : {}),
      ...(result.isError ? { isError: true } : {}),
    };
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
        switch (name) {
          case "canvas_list": return listCanvases();
          case "canvas_open": return openCanvas(args);
          case "canvas_guidance": return guidance(args);
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
