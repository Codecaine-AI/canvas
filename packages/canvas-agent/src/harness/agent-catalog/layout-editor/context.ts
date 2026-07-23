/**
 * Context sidecar for the layout-editor agent (v5 Phase B): three blocks,
 * one per custom loader registered in harness/kernel.ts —
 *
 *   <editor_state>  invoke-time editor snapshot (selection, viewport,
 *                   annotations) via the `editor-state` loader
 *                   (prompt contextUsage id: layoutEditorContext)
 *   <style_guide>   ALL style topics from src/styles/, concatenated by the
 *                   static `style-guide` loader
 *                   (prompt contextUsage id: styleGuideContext)
 *   <board_state>   the spawn-time board snapshot rendered by the
 *                   `board-state` loader from sessionData.boardState,
 *                   with a fallback line when absent
 *                   (prompt contextUsage id: boardStateContext)
 */
import type {
  AgentContextResolver,
  LoadedMap,
  SpawnContext,
} from "@agent-kernel/kernel/context";
import { defineContext } from "@agent-kernel/kernel/agent-definition";

const loaders: AgentContextResolver["loaders"] = [
  { kind: "editor-state" },
  { kind: "style-guide" },
  { kind: "board-state" },
];

/** Loader kind → context block tag. */
const BLOCK_TAGS: Record<string, string> = {
  "editor-state": "editor_state",
  "style-guide": "style_guide",
  "board-state": "board_state",
};

function assemble(loaded: LoadedMap, _ctx: SpawnContext): string {
  return loaded
    .map((input) => {
      const tag = BLOCK_TAGS[input.decl.kind] ?? input.decl.kind;
      const body = input.content.length > 0 ? [input.content] : [];
      return [`<${tag}>`, ...body, `</${tag}>`].join("\n");
    })
    .join("\n\n");
}

export const context = defineContext({ loaders, assemble });
export default context;
