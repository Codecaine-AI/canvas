import type { MouseEvent } from "react";
import type { CanvasListItem } from "@/_lib/useBoardList";
import { BoardCard } from "./_components/BoardCard";
import { ProjectBoardsSection } from "./_components/ProjectBoardsSection";

export type BoardsPageProps = {
  canvases: CanvasListItem[];
  listState: "idle" | "loading" | "error";
  /** The board color behind each thumbnail. */
  boardBackground: string;
  /** Names the style the server-rendered thumbnails were drawn with. */
  previewStyleKey: string;
  onDelete: (canvas: CanvasListItem, event: MouseEvent) => void;
};

/** The board list's content: the studio's canvas files, then the linked project's boards. */
export function BoardsPage({ canvases, listState, boardBackground, previewStyleKey, onDelete }: BoardsPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-ui-xs font-medium uppercase tracking-micro text-muted-foreground">
          Canvas files
        </h2>
        {listState === "loading" ? (
          <p className="text-ui-lg text-muted-foreground">Loading canvas files...</p>
        ) : listState === "error" ? (
          <p className="text-ui-lg text-destructive">Could not load canvas files.</p>
        ) : canvases.length === 0 ? (
          <p className="text-ui-lg text-muted-foreground">
            No canvas files yet. Create a board to add one.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {canvases.map((canvas) => (
              <BoardCard
                key={canvas.id}
                canvas={canvas}
                boardBackground={boardBackground}
                previewStyleKey={previewStyleKey}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </section>

      <ProjectBoardsSection />
    </div>
  );
}
