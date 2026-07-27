/**
 * The invoke-time editor snapshot (selection, viewport, scope frame, baseline
 * hash): what the user was looking at before the agent's first tool call.
 *
 * The snapshot is captured by the session store at spawn time (and again on
 * refine) and travels through the kernel's per-spawn `sessionData` slot. It
 * used to be rendered into an <editor_state> context block by an
 * `editor-state` loader; that loader retired with the state layer — the scope
 * is part of the working picture, so it is seeded into the layout-editor's
 * state/ sidecar and rendered inside section ③'s <scope> block instead. The type
 * and formatter stay here as the shape of that sessionData slot.
 */
import type { AgentSessionViewport, AgentRect } from "../../protocol";

export interface EditorStateSnapshot {
  canvasId: string;
  instruction: string;
  baselineHash: string;
  frame: AgentRect;
  selection: Array<{ id: string; type: string; text: string }>;
  boundaryArrowCount: number;
  viewport?: AgentSessionViewport;
}

function rect(r: AgentRect): string {
  return `x=${r.x} y=${r.y} w=${r.width} h=${r.height}`;
}

export function formatEditorState(snapshot: EditorStateSnapshot): string {
  const lines: string[] = [];
  lines.push(`canvas: ${snapshot.canvasId} (baseline ${snapshot.baselineHash.slice(0, 12)})`);
  lines.push(`scope frame: ${rect(snapshot.frame)}`);
  lines.push(`selection (${snapshot.selection.length} object${snapshot.selection.length === 1 ? "" : "s"} in scope):`);
  for (const item of snapshot.selection) {
    lines.push(`- ${item.type} ${JSON.stringify(item.text)} (${item.id})`);
  }
  lines.push(`arrows crossing the scope edge: ${snapshot.boundaryArrowCount}`);
  if (snapshot.viewport) {
    const zoom = snapshot.viewport.zoom !== undefined ? ` zoom=${snapshot.viewport.zoom}` : "";
    lines.push(`user viewport: ${rect(snapshot.viewport.rect)}${zoom}`);
  }
  return lines.join("\n");
}
