export function agentBoardRenderUrl(canvasId: string, sessionId: string): string {
  return `/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions/${encodeURIComponent(sessionId)}/board.png`;
}

export function agentOperationRenderUrl(
  canvasId: string,
  sessionId: string,
  operationNumber: number,
): string {
  return `/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions/${encodeURIComponent(sessionId)}/renders/${operationNumber}.png`;
}
