import type { MouseEvent } from "react";
import { TrashIcon } from "@codecaine-ai/canvas/ui/icons";
import type { CanvasListItem } from "@/_lib/useBoardList";
import { navigate } from "@/shared/navigation";

export type BoardCardProps = {
  canvas: CanvasListItem;
  /** The board color behind the thumbnail. */
  boardBackground: string;
  /** Names the style the server-rendered thumbnail was drawn with. */
  previewStyleKey: string;
  onDelete: (canvas: CanvasListItem, event: MouseEvent) => void;
};

/** One board in the list: its server-rendered thumbnail and title; opens the editor. */
export function BoardCard({ canvas, boardBackground, previewStyleKey, onDelete }: BoardCardProps) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/canvas/${encodeURIComponent(canvas.id)}`)}
      className="group relative overflow-hidden rounded border border-border bg-card text-left transition-colors hover:bg-muted/50"
    >
      <span
        className="block aspect-16/10 w-full overflow-hidden border-b border-border"
        style={{ background: boardBackground }}
      >
        <img
          src={`/api/canvases/${encodeURIComponent(canvas.id)}/preview.svg?style=${previewStyleKey}`}
          loading="lazy"
          alt=""
          draggable={false}
          className="h-full w-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </span>
      <span className="block px-4 py-3">
        <span className="block truncate pr-6 text-ui-lg font-medium text-ink">
          {canvas.title}
        </span>
      </span>
      <span
        role="button"
        aria-label={`Delete ${canvas.title}`}
        onClick={(event) => onDelete(canvas, event)}
        className="absolute right-3 top-3 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
