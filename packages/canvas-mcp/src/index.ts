/** Public surface of the canvas MCP: the transport-free service and the stdio server. */
export { createCanvasService, type CanvasService, type CanvasToolDeclaration, type CanvasToolResult } from "./service";
export { createCanvasMcpServer, MCP_INSTRUCTIONS, startMcp } from "./mcp";
