/**
 * What an action makes true: which renders exist.
 *
 * The counterpart of service/session/tools/workflow/look.ts. `S` is
 * JSON-serializable, so it never holds a PNG. These lightweight refs say which
 * `look` views occurred in the recent transcript; their images ride the
 * tool-result tail. State attachments come separately from the session's eager
 * current board and change history.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import { VIEW_REFS_LIMIT } from "../policy";
import { capped, type BoardWorkState, type ViewRef } from "../shape";

/** The framing ids as the call sent them — one string or an array of them. */
function viewIds(value: unknown): string[] {
  if (typeof value === "string") return value.trim().length > 0 ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

/**
 * Rasters, as renderPerception produces them: the one region the look framed —
 * a lone id's close-up, or the union frame over several. Only `look`
 * contributes refs; the knob is read generically because it is read off the
 * call's own input. `imageCount` is the truth about how many actually landed —
 * a render that failed contributes no ref, whatever was asked for.
 */
export function recordViews(
  state: BoardWorkState,
  event: Extract<SessionEvent, { kind: "tool_result" }>,
  tool: string,
  input: Record<string, unknown>,
): ViewRef[] {
  if (tool !== "look") return state.views;
  if (event.imageCount <= 0) return state.views;
  const ids = viewIds(input.view);
  if (ids.length === 0) return state.views;
  const produced: ViewRef[] = ids.length === 1
    ? [{ turn: state.turns, kind: "section", sectionId: ids[0]! }]
    : [{ turn: state.turns, kind: "crop", sectionId: null, region: `ids ${ids.join("+")}` }];
  return capped(
    [...state.views, ...produced.slice(0, event.imageCount)],
    VIEW_REFS_LIMIT,
  );
}
