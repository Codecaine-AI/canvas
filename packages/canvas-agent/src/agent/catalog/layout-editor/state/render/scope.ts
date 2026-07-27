/**
 * <instruction> and <scope> — the ask, and the frame it applies to.
 *
 * Both come straight from `S`: the instruction is the seed's plus whatever
 * steering ../rules/conversation.ts kept, and the scope is the spawn-time
 * editor snapshot, which by definition does not move during the run.
 */
import { block } from "./block";
import type { BoardWorkState } from "../shape";

export function instructionBlock(state: BoardWorkState): string[] {
  return block("instruction", "", state.instructions.join("\n---\n"));
}

export function scopeBlock(state: BoardWorkState): string[] {
  if (state.seeded.editor.length === 0) return [];
  return block("scope", "", state.seeded.editor);
}
