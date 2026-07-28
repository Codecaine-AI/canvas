/**
 * `render` — section ③, assembled. One file per block of the state text:
 *
 *   ./instruction.ts <instruction> the operator's ask and any steering since
 *   ./board.ts     <board>        the FULL board digest — never a stale snapshot
 *   ./ops.ts       <recent_ops>   what this run has applied, newest last
 *                  <diff>         the cumulative baseline → draft change list
 *   ./lints.ts     <lints>        the open findings, grouped by severity
 *   ./requests.ts  <requests>     the annotation-thread queue with dispositions
 *   ./views.ts     <views>        which renders are attached below
 *   ./tail.ts      <recent_conversation> the capped message tail, counted
 *
 * plus the eager current-board render and up to three immediately prior
 * post-change renders as images, then the short real-message tail.
 *
 * Everything derived from the live document is derived ONCE, here, by
 * ./live.ts, and handed to the blocks that need it — so no two blocks of one
 * request can disagree about the board. A failed live read is `null`, and every
 * block that takes it degrades on its own terms rather than throwing away
 * section ③.
 */
import type {
  AgentMessage,
  RenderContext,
  RenderResult,
} from "@agent-kernel/kernel/state";

import { liveDraftView } from "../../../../service/session/perception/live-draft-view";
import { layoutSessionForContainer } from "../../../../service/session/registry";
import { VIEWS_ATTACHED } from "../policy";
import type { BoardWorkState } from "../shape";
import { attr } from "./block";
import { boardBlock } from "./board";
import { lintsBlock } from "./lints";
import { tryLivePicture, type LivePicture } from "./live";
import { diffBlock, opsBlock } from "./ops";
import { requestsBlock } from "./requests";
import { instructionBlock } from "./instruction";
import { recentConversationBlock, windowedTail, type WindowedTail } from "./tail";
import {
  viewsBlock,
  viewsMessage,
  type AttachedView,
  type ViewsBlockOptions,
} from "./views";

export type { LivePicture } from "./live";

/** The <state> element: every block, in reading order. */
export function renderStateBlock(
  state: BoardWorkState,
  ctx: RenderContext,
  live: LivePicture | null,
  attached: AttachedView[],
  tail: WindowedTail,
  viewOptions: ViewsBlockOptions = {},
): string {
  return [
    `<state v="${state.lastEventSeq + 1}" turn="${ctx.turnIndex + 1}" board="${attr(state.boardId)}">`,
    ...instructionBlock(state),
    ...boardBlock(state, live),
    ...opsBlock(state),
    ...diffBlock(live),
    ...lintsBlock(state, live),
    ...requestsBlock(state, live),
    ...viewsBlock(state, attached, viewOptions),
    ...recentConversationBlock(tail),
    "</state>",
  ].join("\n");
}

function textMessage(text: string): AgentMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  } as unknown as AgentMessage;
}

function liveAttachments(session: Parameters<typeof liveDraftView>[0]): {
  attached: AttachedView[];
  options: ViewsBlockOptions;
} {
  try {
    const current = liveDraftView(session);
    const priorChanges = (session.changeRenders ?? [])
      .filter((change) => change.n < current.n)
      .slice()
      .reverse()
      .slice(0, VIEWS_ATTACHED - 1)
      .map((change) => ({ kind: "change" as const, ...change }));
    return {
      attached: [current, ...priorChanges],
      options: { priorChanges: priorChanges.length },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const priorChanges = (session.changeRenders ?? [])
      .slice()
      .reverse()
      .slice(0, VIEWS_ATTACHED - 1)
      .map((change) => ({ kind: "change" as const, ...change }));
    return {
      attached: priorChanges,
      options: {
        priorChanges: priorChanges.length,
        currentRenderFailure: session.currentBoardRenderFailure
          ?? `render failed: board view — ${message}`,
      },
    };
  }
}

export function renderBoardWork(
  state: BoardWorkState,
  ctx: RenderContext,
): RenderResult {
  const session = layoutSessionForContainer(ctx.containerId);
  const live = session ? tryLivePicture(session) : null;
  const viewState = session
    ? liveAttachments(session)
    : { attached: [] as AttachedView[], options: {} };

  const tail = windowedTail(ctx);

  const messages: AgentMessage[] = [
    textMessage(renderStateBlock(
      state,
      ctx,
      live,
      viewState.attached,
      tail,
      viewState.options,
    )),
  ];
  if (viewState.attached.length > 0) messages.push(viewsMessage(viewState.attached));
  const stateMessageCount = messages.length;
  messages.push(...tail.messages);
  return { messages, stateMessageCount };
}
