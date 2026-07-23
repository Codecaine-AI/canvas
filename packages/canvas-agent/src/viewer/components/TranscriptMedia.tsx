import { useEffect } from "react";
import { transcriptImagePath } from "../lib/kernel-api";
import type { TranscriptImageEntry } from "../hooks/use-transcript";

/**
 * The image surface of the transcript layer: the lightbox overlay the
 * transcript inspector's images open into. Images stream straight from the
 * harness's transcript image route (kernel-api.ts transcriptImagePath).
 */

function imageAlt(image: TranscriptImageEntry): string {
  return `${image.toolName} render, turn ${image.turnIndex}`;
}

/**
 * Full-size overlay: dark backdrop, esc / backdrop click to close, prev/next
 * arrows (and arrow keys) when the run has more than one image. Navigation
 * wraps, and always moves through all of the run's images in chronological
 * order.
 */
export function TranscriptLightbox({
  images,
  index,
  containerId,
  onClose,
  onNavigate,
}: {
  images: TranscriptImageEntry[];
  index: number;
  containerId: string;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const count = images.length;
  const image = images[index];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && count > 1) {
        event.preventDefault();
        onNavigate((index - 1 + count) % count);
      } else if (event.key === "ArrowRight" && count > 1) {
        event.preventDefault();
        onNavigate((index + 1) % count);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, count, onClose, onNavigate]);

  if (!image) return null;

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 rounded-[3px] border border-border bg-card/90 px-3 py-2 font-mono text-lg leading-none text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={imageAlt(image)}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-8"
      onClick={onClose}
    >
      <img
        src={transcriptImagePath(containerId, image.imageId)}
        alt={imageAlt(image)}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[82vh] max-w-[92vw] rounded-[3px] border border-border object-contain shadow-2xl"
      />
      <div
        className="mt-3 flex items-center gap-3 font-mono text-[11px] text-muted-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <span>
          {image.toolName} · turn {image.turnIndex}
        </span>
        {count > 1 && (
          <span className="text-muted-foreground/50">
            {index + 1} / {count}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-[2px] border border-border bg-card/90 px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
      >
        Close
      </button>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate((index - 1 + count) % count);
            }}
            className={`${arrowClass} left-4`}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate((index + 1) % count);
            }}
            className={`${arrowClass} right-4`}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
