import { createElement } from "react";
import { KERNEL_TRACE_READ_PATHS } from "@codecaine-ai/agent-kernel-viewer-core";
import {
  DetailImageTrigger,
  readNumberAttr,
  readStringAttr,
  type DetailBlockSpec,
  type DetailBlockProvider,
} from "@codecaine-ai/agent-kernel-viewer-ui";
import { BoardFacts } from "./_components/BoardFacts";

type TraceSpan = Parameters<DetailBlockProvider>[0];

/**
 * Canvas-owned rich detail blocks for the end-of-turn board raster.
 *
 * Shared viewer-ui deliberately knows nothing about app:board-render. Without
 * this extension it renders the event through its generic card and Raw Details.
 */
export function boardRenderBlocks(
  span: TraceSpan,
  apiBase: string,
): DetailBlockSpec[] {
  const blobHash = readStringAttr(span, "blob_hash");
  const mimeType =
    readStringAttr(span, "mime_type") ?? readStringAttr(span, "mimeType");
  const n = readNumberAttr(span, "n");
  const turnNumber = readNumberAttr(span, "turn_number");
  const summary = readStringAttr(span, "summary");

  const facts = [
    n === undefined ? "Board render" : `Board after change ${n}`,
    ...(turnNumber === undefined ? [] : [`Turn ${turnNumber}`]),
    ...(summary ? [`Summary: ${summary}`] : []),
  ];

  const blocks: DetailBlockSpec[] = [
    {
      id: "canvas:board-facts",
      slot: "content",
      order: -90,
      caption: "Board facts",
      node: createElement(BoardFacts, { facts }),
      expandable: false,
    },
  ];

  if (blobHash) {
    const src = `${apiBase}${KERNEL_TRACE_READ_PATHS.blob(blobHash)}`;
    blocks.push({
      id: "canvas:board-image",
      slot: "media",
      caption: "Board",
      node: createElement(DetailImageTrigger, {
        image: {
          src,
          alt: mimeType ? `${mimeType} board render` : "Board render",
        },
        title: "Open image",
        className: "block max-w-full cursor-zoom-in rounded-[var(--ds-radius-base)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border",
        imageProps: { loading: "lazy" },
        imageClassName: "max-h-80 max-w-full rounded-[var(--ds-radius-base)] border border-border/60 object-contain",
      }),
      expandable: false,
    });
  }

  return blocks;
}
