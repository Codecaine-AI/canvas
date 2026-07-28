import { DetailImageTrigger } from "@agent-kernel/viewer-ui";
import { transcriptImagePath } from "../lib/kernel-api";
import type {
  TranscriptImageRef,
} from "../hooks/use-transcript";

/**
 * Compact transcript render thumbnails for standard detail blocks. Images
 * stream from the harness route and open through the shared kernel detail
 * modal.
 */

/** Render thumbnails only; the kernel detail shell supplies the block frame. */
export function TranscriptRenderStrip({
  images,
  toolName,
  turnIndex,
  containerId,
}: {
  images: TranscriptImageRef[];
  toolName: string;
  turnIndex: number;
  containerId: string;
}) {
  const alt = `${toolName} render, turn ${turnIndex}`;
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <DetailImageTrigger
          key={image.id}
          image={{
            src: transcriptImagePath(containerId, image.id),
            alt,
          }}
          title="Open image"
          className="shrink-0 cursor-zoom-in rounded-[2px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
          imageProps={{ loading: "lazy" }}
          imageClassName="h-20 w-auto max-w-[200px] rounded-[2px] border border-border bg-black/20 object-contain transition-colors hover:border-status-info-border"
        />
      ))}
    </div>
  );
}
