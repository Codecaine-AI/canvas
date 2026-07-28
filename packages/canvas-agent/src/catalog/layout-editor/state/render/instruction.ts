/**
 * <instruction> — the ask: the seed's instruction plus whatever steering
 * ../rules/conversation.ts kept, straight from `S`. There is deliberately no
 * scope block beside it: the request queue and the instruction say what to
 * work on, and the whole board is the agent's to change.
 */
import { block } from "./block";
import type { BoardWorkState } from "../shape";

export function instructionBlock(state: BoardWorkState): string[] {
  return block("instruction", "", state.instructions.join("\n---\n"));
}
