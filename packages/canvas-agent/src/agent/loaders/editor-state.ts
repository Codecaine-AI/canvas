/**
 * Formats the invoke-time editor snapshot (selection, viewport, scope frame,
 * baseline hash) for <editor_state>, so the model sees what the user was
 * looking at before its first tool call. User comments/requests live in the
 * separate <user_requests> block, not here.
 *
 * The snapshot is captured by the session store at spawn time (and again on
 * refine) and travels through the kernel's per-spawn `sessionData` slot — the
 * loader never polls the editor.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

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

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
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

/**
 * The custom loader registered through the kernel `loaders` config slot. The
 * declaration is just `{ kind: "editor-state" }` in the agent's context.ts.
 */
export const editorStateLoader: Loader = {
  kind: "editor-state",
  async resolve(_decl, ctx): Promise<LoaderResult> {
    const snapshot = ctx.sessionData?.editorState as EditorStateSnapshot | undefined;
    if (!snapshot) {
      return { status: "empty", content: "", bytes: 0, hash: sha256("") };
    }
    const content = formatEditorState(snapshot);
    return {
      status: "ok",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      hash: sha256(content),
    };
  },
};
