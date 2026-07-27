/**
 * What an action makes true: which renders exist.
 *
 * The counterpart of ../../tools/look.ts. `S` is JSON-serializable, so it never
 * holds a PNG — the payloads live on the session's view log and the state holds
 * only refs saying which view was taken on which turn. ../render/views.ts pairs
 * the newest refs back with their bytes.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import { VIEW_REFS_LIMIT } from "../policy";
import { capped, str, type BoardWorkState, type ViewRef } from "../shape";

/**
 * Rasters, in the order renderPerception produces them: the full board first
 * (look only), then the close-up a `view=` argument asked for. `imageCount` is
 * the truth about how many actually landed — a render that failed contributes
 * no ref, whatever was asked for.
 */
export function recordViews(
  state: BoardWorkState,
  event: Extract<SessionEvent, { kind: "tool_result" }>,
  tool: string,
  input: Record<string, unknown>,
): ViewRef[] {
  if (event.imageCount <= 0) return state.views;
  const view = str(input.view);
  const produced: ViewRef[] = [];
  if (tool === "look") produced.push({ turn: state.turns, kind: "board", sectionId: null });
  if (view.length > 0) {
    produced.push({ turn: state.turns, kind: "section", sectionId: view });
  }
  return capped(
    [...state.views, ...produced.slice(0, event.imageCount)],
    VIEW_REFS_LIMIT,
  );
}
