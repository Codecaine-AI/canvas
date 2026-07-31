import { DetailImageTrigger } from "@agent-kernel/viewer-ui";
import type { TranscriptImageRef } from "../viewer/hooks/use-transcript";
import { transcriptImageUrl } from "./paths";

/**
 * Compact transcript render thumbnails for standard detail blocks. The API
 * prefix belongs to the host so this module also works inside Observatory.
 */
export function TranscriptRenderStrip({
  apiBase,
  images,
  toolName,
  turnIndex,
  containerId,
}: {
  apiBase: string;
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
            src: transcriptImageUrl(apiBase, containerId, image.id),
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
