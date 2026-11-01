/**
 * The stdio MCP server: `createCanvasService` behind the SDK's low-level
 * `Server`. The server is in-process — one canvas service per client
 * connection, no daemon — so the toolkit runs in the same process that
 * answers the call and writes the canvas file directly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { activeBackend, useHarfBuzz } from "@codecaine-ai/text-measure/headless";
import { identityFromEnv, newRunId, openActionLog, type ActionLog } from "@codecaine-ai/action-log";
import { getCanvasAuthoringGuidance } from "@codecaine-ai/canvas-agent/authoring";
import { resolve } from "node:path";

import { version } from "../package.json";
import { type CanvasServiceOptions, createCanvasService } from "./service";

/** Sent once at initialize; kept short because clients inline it into every session. */
export const MCP_INSTRUCTIONS =
  "Call canvas_open with a canvas id (canvas_list shows them) or a page's .canvas.json sidecar path, or canvas_create for a new board, before any other canvas tool; it returns the board digest and lint findings the edit tools work against. "
  + "Every edit is saved to the opened file the moment it applies, and an edit is refused if the file changed elsewhere until you call canvas_open again. "
  + "Call canvas_check before you call a board done: it runs every lint and returns a PNG of the whole board. "
  + "Call canvas_guidance for the diagram design standards, one topic at a time, before laying out or restructuring a board.";

/** The target a call acted on: the board id, or "-" when the call has no board. */
function targetOf(name: string, args: unknown, openCanvasId: string | undefined): string {
  if (name === "canvas_list" || name === "canvas_guidance") return "-";
  if (name === "canvas_open") {
    const raw = typeof (args as { canvas?: unknown })?.canvas === "string" ? (args as { canvas: string }).canvas.trim() : "";
    return raw.replace(/\.canvas\.json$/, "") || "-";
  }
  return openCanvasId ?? "-";
}

/** A short summary of a result: the refusal's first line, or "ok" plus the LINTS line when the text has one. Never a payload. */
function summarize(result: { isError?: boolean; content: Array<{ type: string; text?: string }> }): string {
  const lines = result.content.filter((part) => part.type === "text").flatMap((part) => (part.text ?? "").split("\n"));
  if (result.isError) return `refused: ${lines[0] ?? ""}`;
  const lints = lines.find((line) => line.startsWith("LINTS · "));
  return lints && !lints.startsWith("LINTS · clean") ? `ok · ${lints}` : "ok";
}

/** Build the MCP server for one workspace without connecting a transport (tests connect their own). */
export function createCanvasMcpServer(options: CanvasServiceOptions): Server {
  const service = createCanvasService({ ...options, workspace: resolve(options.workspace) });
  const server = new Server(
    { name: "codecaine-canvas", version },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: service.listTools() }));
  const runId = newRunId();
  const identity = identityFromEnv();
  let log: ActionLog | undefined;
  const warn = (error: unknown) =>
    console.error(`canvas-mcp: action log write failed: ${error instanceof Error ? error.message : String(error)}`);
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const result = await service.call(name, args);
    try {
      log ??= openActionLog();
      const threadId = (args as { thread_id?: unknown }).thread_id;
      if (name === "canvas_open" && typeof threadId === "string" && threadId) log.bindThread(runId, threadId);
      const snapshotId = name === "canvas_guidance" && !result.isError ? getCanvasAuthoringGuidance().snapshotId : null;
      log.record({
        runId,
        threadId: identity.threadId,
        agent: identity.agent ?? "canvas-mcp",
        tool: name,
        target: targetOf(name, args, service.activeCanvas()?.canvasId),
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
