/**
 * The stdio MCP server: `createCanvasService` behind the SDK's low-level
 * `Server`. The server is in-process — one canvas service per client
 * connection, no daemon — so the toolkit runs in the same process that
 * answers the call and writes the canvas file directly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { activeBackend, useHarfBuzz } from "@codecaine-ai/text-measure/headless";
import { identityFromEnv, newRunId, openActionLog, type ActionLog } from "@codecaine-ai/action-log";
import { getCanvasAuthoringGuidance } from "@codecaine-ai/canvas/authoring";
import { resolve } from "node:path";

import { version } from "../package.json";
import { type CanvasServiceOptions, type CanvasToolResult, createCanvasService } from "./service";

/**
 * The canvas prompt block. MCP clients get it as the server instructions at initialize, and `cli.ts instructions`
 * prints it for agent-config. It says when to use the canvas tools and which tool to call first. The rules live in
 * canvas_guidance topics. At most 12 lines and 800 bytes (mcp.test.ts).
 */
export const INSTRUCTIONS = [
  "Use the canvas tools to read and edit Codecaine Canvas boards. Never write a .canvas.json file directly.",
  "Call canvas_capabilities once per thread before the first canvas tool, for the tools, topics and gates.",
  'Read canvas_guidance topic "workflow" before your first edit. Every edit tool is refused until then.',
  "Open a board with canvas_open, or start one with canvas_create. Each edit saves at once.",
  'Read topics "rules" and "diagram_design" before you lay out a board, and the other topics when a step needs them.',
  "Call canvas_check before you call a board done.",
  "After an error, context compaction or a stale result, call canvas_capabilities again and re-read the topics you need.",
].join("\n");

/**
 * The target a call acted on: the board the result names in `_meta.canvasId` (a successful open
 * or create, or an edit or check), the requested id or path when the open or create was refused,
 * the board that was active when a failed edit started, or "-" when the call has no board. Calls
 * can interleave, so nothing here reads the active board after the call.
 */
function targetOf(name: string, args: unknown, result: CanvasToolResult, activeBefore: string | undefined): string {
  if (name === "canvas_capabilities" || name === "canvas_list" || name === "canvas_guidance") return "-";
  if (result._meta?.canvasId) return result._meta.canvasId;
  if (name === "canvas_open" || name === "canvas_create") {
    const raw = (args as { canvas?: unknown })?.canvas;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "-";
  }
  return activeBefore ?? "-";
}

/** "refused", or "ok" plus the LINTS line when the text has one. Refusal text stays out, because it can echo the call's payload. */
function summarize(result: { isError?: boolean; content: Array<{ type: string; text?: string }> }): string {
  if (result.isError) return "refused";
  const lines = result.content.filter((part) => part.type === "text").flatMap((part) => (part.text ?? "").split("\n"));
  const lints = lines.find((line) => line.startsWith("LINTS · "));
  return lints && !lints.startsWith("LINTS · clean") ? `ok · ${lints}` : "ok";
}

/** Build the MCP server for one workspace without connecting a transport (tests connect their own). */
export function createCanvasMcpServer(options: CanvasServiceOptions): Server {
  const service = createCanvasService({ ...options, workspace: resolve(options.workspace) });
  const server = new Server(
    { name: "codecaine-canvas", version },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: service.listTools() }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: service.listResources() }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const contents = await service.readResource(request.params.uri);
    if (!contents) throw new Error(`Unknown resource: ${request.params.uri}. resources/list names the canvas resources.`);
    return { contents: [contents] };
  });
  const runId = newRunId();
  const identity = identityFromEnv();
  let log: ActionLog | undefined;
  const warn = (error: unknown) =>
    console.error(`canvas-mcp: action log write failed: ${error instanceof Error ? error.message : String(error)}`);
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const activeBefore = service.activeCanvas()?.canvasId;
    const result = await service.call(name, args);
    try {
      log ??= openActionLog();
      const threadId = (args as { thread_id?: unknown }).thread_id;
      if (name === "canvas_open" && !result.isError && typeof threadId === "string" && threadId) log.bindThread(runId, threadId);
      // One guidance snapshot serves every call of this process, so every record carries it.
      const snapshotId = getCanvasAuthoringGuidance().snapshotId;
      log.record({
        runId,
        threadId: identity.threadId,
        agent: identity.agent ?? "canvas-mcp",
        tool: name,
        target: targetOf(name, args, result, activeBefore),
        result: summarize(result),
        snapshotId,
        at: new Date(),
      });
    } catch (error) {
      warn(error);
    }
    return result;
  });
  return server;
}

/**
 * Serve the canvas tools over stdio until the client disconnects. Loads
 * text-measure's exact HarfBuzz backend first (lints, text fit and renders
 * measure through it); a failure means a broken install and rejects, so the
 * server never answers with approximate widths.
 */
export async function startMcp(options: CanvasServiceOptions): Promise<Server> {
  await useHarfBuzz();
  if (!activeBackend().exact) {
    throw new Error(`text-measure: HarfBuzz did not become the active backend (${activeBackend().name} is)`);
  }
  const server = createCanvasMcpServer(options);
  await server.connect(new StdioServerTransport());
  return server;
}
