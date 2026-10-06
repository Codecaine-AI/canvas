import { InteractiveCanvasViewer, type InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { ArrowLeftIcon } from "@codecaine-ai/canvas/ui/icons";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";
import { navigate } from "@/shared/navigation";

export type ViewerPageProps = {
  /** /view (with its floating header) or /embed (the board alone). */
  route: { name: "view" | "embed"; id: string; view?: string };
  document: InteractiveCanvasDocument;
  canvasStyle: CanvasStyle;
};

/** One board, read-only and full-bleed, outside the shell. */
export function ViewerPage({ route, document, canvasStyle }: ViewerPageProps) {
  const viewer = (
    <InteractiveCanvasViewer
      document={document}
      view={route.view}
      interactive
      bare
      showNavigationControls
      canvasStyle={canvasStyle}
    />
  );
  // The page behind the viewer is the board itself: a dark theme gets no light frame.
  const boardSurface = { background: canvasStyle.boardBackground };

  if (route.name === "embed") {
    return <main className="fixed inset-0 overflow-hidden" style={boardSurface}>{viewer}</main>;
  }

  return (
    <main className="fixed inset-0 overflow-hidden" style={boardSurface}>
      {viewer}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-panel flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded border border-border bg-background/95 p-1.5 shadow-glass backdrop-blur-glass">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Back to boards"
            title="Back to boards"
            onClick={() => navigate("/")}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <span className="max-w-[50vw] truncate px-1 text-ui-lg font-medium text-ink">
            {document.title ?? document.id}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-events-auto bg-background/95 shadow-glass backdrop-blur-glass dark:bg-background/95"
          onClick={() => navigate(`/canvas/${encodeURIComponent(route.id)}`)}
        >
          Edit board
        </Button>
      </header>
    </main>
  );
}
