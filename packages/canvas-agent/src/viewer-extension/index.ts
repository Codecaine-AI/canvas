import { createElement } from "react";
import {
  CLAMP,
  readStringAttr,
  type DetailBlockProvider,
  type DetailBlockSpec,
} from "@agent-kernel/viewer-ui";
import type { TranscriptToolCallEntry } from "../viewer/hooks/use-transcript";
import { boardRenderBlocks } from "./BoardRenderBody";
import { TranscriptRenderStrip } from "./TranscriptMedia";

export interface ObservatoryViewerExtension {
  appId: string;
  createDetailBlockProvider(ctx: {
    apiBase: string;
  }): DetailBlockProvider;
}

export interface CanvasViewerExtensionContext {
  apiBase: string;
  /**
   * Canvas's self-hosted viewer supplies this after its transcript request
   * resolves. Extensions v0 hosts only need apiBase and still receive all
   * trace-native Canvas blocks, including board previews.
   */
  transcript?: {
    containerId: string;
    toolCallIndex: ReadonlyMap<string, TranscriptToolCallEntry>;
  };
}

/**
 * Create Canvas's synchronous detail-block provider.
 *
 * Extensions v0 supplies apiBase but no selected-session or async loading
 * lifecycle. Canvas's self-hosted viewer passes the optional loaded transcript
 * context; other hosts can omit it and still get app:board-render enrichment.
 */
export function createDetailBlockProvider({
  apiBase,
  transcript,
}: CanvasViewerExtensionContext): DetailBlockProvider {
  return (span) => {
    const eventType = readStringAttr(span, "event_type");
    if (eventType === "app:board-render") {
      return boardRenderBlocks(span, apiBase);
    }
    if (
      !transcript ||
      (eventType !== "tool_call_start" && eventType !== "tool_call_end")
    ) {
      return [];
    }

    const toolUseId = readStringAttr(span, "tool_use_id");
    const entry = toolUseId ? transcript.toolCallIndex.get(toolUseId) : undefined;
    if (!entry) return [];

    const blocks: DetailBlockSpec[] = [];
    if (entry.turn.thinking) {
      blocks.push({
        id: "canvas:thinking",
        slot: "input",
        order: -100,
        caption: "Thinking",
        body: entry.turn.thinking,
        language: "text",
        clamp: CLAMP.tight,
      });
    }

    const images = entry.call.images ?? [];
    if (images.length > 0) {
      blocks.push({
        id: "canvas:renders",
        slot: "media",
        caption: images.length === 1 ? "Render" : "Renders",
        node: createElement(TranscriptRenderStrip, {
          apiBase,
          images,
          toolName: entry.call.toolName,
          turnIndex: entry.turn.index,
          containerId: transcript.containerId,
        }),
      });
    }

    return blocks;
  };
}

export const canvasViewerExtension = {
  appId: "canvas",
  createDetailBlockProvider,
} as const satisfies ObservatoryViewerExtension;

export default canvasViewerExtension;
