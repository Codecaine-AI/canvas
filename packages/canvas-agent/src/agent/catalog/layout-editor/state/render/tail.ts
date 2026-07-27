/**
 * <conversation> and the real-message tail — how much of the transcript
 * survived the window, and the surviving turns themselves.
 *
 * The tail is short on purpose (agent.json: four turns): the board block above
 * carries the picture, so the transcript does not have to. What the tail cannot
 * be allowed to lose is the ask — hence <instruction>, which keeps steering
 * verbatim no matter how far the window has moved on.
 *
 * The window policy itself is the kernel's; this file only applies it and says
 * in words what it did, so a cut is never silent.
 */
import { applyWindow, type AgentMessage, type RenderContext } from "@agent-kernel/kernel/state";

import { block } from "./block";

export interface WindowedTail {
  /** The <conversation> body: what was kept, what was cut, what was stubbed. */
  note: string;
  /** The surviving turns, as genuine messages. */
  messages: AgentMessage[];
}

export function windowedTail(ctx: RenderContext): WindowedTail {
  const windowed = applyWindow(ctx.messages, ctx.window);
  const kept = windowed.totalTurns - windowed.elidedTurns;
  const note = [
    windowed.elisionMarker
      ? `${windowed.elisionMarker} — the board block above is the current truth`
      : "the whole run so far follows",
    `showing ${kept} of ${windowed.totalTurns} turn${windowed.totalTurns === 1 ? "" : "s"}`
    + (windowed.stubbedImages > 0
      ? ` · ${windowed.stubbedImages} older render${windowed.stubbedImages === 1 ? "" : "s"}`
        + " replaced by a stub (the attached renders above are the live ones)"
      : ""),
  ].join(" · ");
  return { note, messages: windowed.messages };
}

export function conversationBlock(note: string): string[] {
  return block("conversation", "", note);
}
