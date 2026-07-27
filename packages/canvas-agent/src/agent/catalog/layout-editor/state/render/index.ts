/**
 * `render` — section ③, assembled. One file per block of the state text:
 *
 *   ./scope.ts     <instruction>  the operator's ask and any steering since
 *                  <scope>        the editable frame, selection, viewport
 *   ./board.ts     <board>        the FULL board digest — never a stale snapshot
 *   ./ops.ts       <ops>          what this run has applied, newest last
 *                  <diff>         the cumulative baseline → draft change list
 *   ./lints.ts     <lints>        the current findings, against the count at spawn
 *   ./requests.ts  <requests>     the annotation-thread queue with dispositions
 *   ./views.ts     <views>        which renders are attached below
 *   ./tail.ts      <conversation> how much of the transcript survived the window
 *
 * plus the newest rendered views as images, then the short real-message tail.
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

import { layoutSessionForContainer } from "../../../../../service/session/registry";
import { newestSessionViews, type SessionView } from "../../../../../service/session/view-log";
import { VIEWS_ATTACHED } from "../policy";
import type { BoardWorkState } from "../shape";
import { attr } from "./block";
import { boardBlock } from "./board";
import { lintsBlock } from "./lints";
import { tryLivePicture, type LivePicture } from "./live";
import { diffBlock, opsBlock } from "./ops";
import { requestsBlock } from "./requests";
import { instructionBlock, scopeBlock } from "./scope";
import { conversationBlock, windowedTail } from "./tail";
import { viewsBlock, viewsMessage } from "./views";

export type { LivePicture } from "./live";

/** The <state> element: every block, in reading order. */
export function renderStateBlock(
  state: BoardWorkState,
  ctx: RenderContext,
  live: LivePicture | null,
  attached: SessionView[],
  windowNote: string,
): string {
  return [
    `<state v="${state.lastEventSeq + 1}" turn="${ctx.turnIndex + 1}" board="${attr(state.boardId)}">`,
    ...instructionBlock(state),
    ...scopeBlock(state),
    ...boardBlock(state, live),
    ...opsBlock(state),
    ...diffBlock(live),
    ...lintsBlock(state, live),
    ...requestsBlock(state, live),
    ...viewsBlock(state, attached),
    ...conversationBlock(windowNote),
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

export function renderBoardWork(
  state: BoardWorkState,
  ctx: RenderContext,
): RenderResult {
  const session = layoutSessionForContainer(ctx.containerId);
  const live = session ? tryLivePicture(session) : null;
  const attached = session ? newestSessionViews(session, VIEWS_ATTACHED) : [];

  const tail = windowedTail(ctx);

  const messages: AgentMessage[] = [
    textMessage(renderStateBlock(state, ctx, live, attached, tail.note)),
  ];
  if (attached.length > 0) messages.push(viewsMessage(attached));
  const stateMessageCount = messages.length;
  messages.push(...tail.messages);
  return { messages, stateMessageCount };
}
