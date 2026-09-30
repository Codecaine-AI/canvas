/**
 * The stdio MCP server: `createCanvasService` behind the SDK's low-level
 * `Server`. The server is in-process — one canvas service per client
 * connection, no daemon — so the toolkit runs in the same process that
 * answers the call and writes the canvas file directly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";

import { version } from "../package.json";
import { createCanvasService } from "./service";

/** Sent once at initialize; kept short because clients inline it into every session. */
export const MCP_INSTRUCTIONS =
  "Call canvas_open with a canvas id (canvas_list shows them) before any other canvas tool; it returns the board digest and lint findings the edit tools work against. "
  + "Every edit is saved to canvases/<id>.canvas.json the moment it applies, and an edit is refused if the file changed elsewhere until you call canvas_open again. "
  + "Call canvas_guidance for the diagram design standards, one topic at a time, before laying out or restructuring a board.";

/** Build the MCP server for one workspace without connecting a transport (tests connect their own). */
export function createCanvasMcpServer(workspace: string): Server {
  const service = createCanvasService({ workspace: resolve(workspace) });
  const server = new Server(
    { name: "codecaine-canvas", version },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: service.listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    service.call(request.params.name, request.params.arguments ?? {}));
  return server;
}

/** Serve the canvas tools over stdio until the client disconnects. */
export async function startMcp(workspace: string): Promise<Server> {
  const server = createCanvasMcpServer(workspace);
  await server.connect(new StdioServerTransport());
  return server;
}
