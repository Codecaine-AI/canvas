/** Public surface of the canvas MCP: the transport-free service and the stdio server. */
export { createCanvasService, type CanvasService, type CanvasToolDeclaration, type CanvasToolResult } from "./service";
export { createCanvasMcpServer, INSTRUCTIONS, startMcp } from "./mcp";
