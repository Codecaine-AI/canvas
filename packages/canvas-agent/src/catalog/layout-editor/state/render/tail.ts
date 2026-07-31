/**
 * <recent_conversation> and the message tail — the last few real transcript
 * messages, re-emitted after the state block and hard-capped at TAIL_MESSAGES.
 *
 * The tail is short on purpose: the board block above carries the picture and
 * <recent_ops> the durable history, so the transcript only needs to show the model
 * its own recent results. What the tail cannot be allowed to lose is the ask —
 * hence <instruction>, which keeps steering verbatim no matter how far the
 * cut has moved on.
 *
 * The kernel's turn window (agent.json) still runs first — it stubs old
 * images and, in steering-heavy sessions, cuts at user-turn boundaries — and
 * the message cap is applied to what survives it.
 */
import { applyWindow, type AgentMessage, type RenderContext } from "@agent-kernel/kernel/state";

import { TAIL_MESSAGES } from "../policy";
import { block } from "./block";

export interface WindowedTail {
  /** The surviving messages, newest last. */
  messages: AgentMessage[];
  /** How many messages the tail actually shows. */
  shown: number;
  /** How many messages the whole transcript holds. */
  total: number;
}

function roleOf(message: AgentMessage): string {
  const role = (message as unknown as { role?: unknown }).role;
  return typeof role === "string" ? role : "";
}

export function windowedTail(ctx: RenderContext): WindowedTail {
  const windowed = applyWindow(ctx.messages, ctx.window);
  let messages = windowed.messages.slice(-TAIL_MESSAGES);
  // Never open the tail on a tool result whose calling message was cut —
  // providers reject an orphaned result, so trim to the first real message.
  while (messages.length > 0 && roleOf(messages[0]!) === "toolResult") {
    messages = messages.slice(1);
  }
  return { messages, shown: messages.length, total: ctx.messages.length };
}

/** The counts ride the attrs; the messages themselves follow the state block. */
export function recentConversationBlock(tail: WindowedTail): string[] {
  return block(
    "recent_conversation",
    `showing="${tail.shown}" total="${tail.total}"`,
    "",
  );
}
