import { KERNEL_TRACE_READ_PATHS } from "@agent-kernel/viewer-core";
import {
  DetailImageTrigger,
  readNumberAttr,
  readStringAttr,
  type DetailBlockSpec,
  type DetailBlockProvider,
} from "@agent-kernel/viewer-ui";

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
      node: (
        <ul
          data-canvas-board-facts=""
          className="space-y-1 text-sm leading-relaxed text-foreground"
        >
          {facts.map((fact, index) => (
            <li key={`${index}:${fact}`} className="break-words">
              {fact}
            </li>
          ))}
        </ul>
      ),
      expandable: false,
    },
  ];

  if (blobHash) {
    const src = `${apiBase}${KERNEL_TRACE_READ_PATHS.blob(blobHash)}`;
    blocks.push({
      id: "canvas:board-image",
      slot: "media",
      caption: "Board",
      node: (
        <DetailImageTrigger
          image={{
            src,
            alt: mimeType ? `${mimeType} board render` : "Board render",
          }}
          title="Open image"
          className="block max-w-full cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
          imageProps={{ loading: "lazy" }}
          imageClassName="max-h-[320px] max-w-full rounded-md border border-border/60 object-contain"
        />
      ),
      expandable: false,
    });
  }

  return blocks;
}
