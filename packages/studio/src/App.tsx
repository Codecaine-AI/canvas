import { useMemo, useState } from "react";
import { PlusIcon, Trash2Icon, WorkflowIcon } from "lucide-react";
import {
  createStarterInteractiveCanvasDocument,
  InteractiveCanvasEditor,
  syntheticInteractiveCanvas,
  v2FlowFigjamCanvas,
  v2FlowInteractiveCanvas,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import { cn } from "@codecaine-ai/canvas/ui/cn";
import { deleteDraft, listDrafts, saveDraft, type StudioDraft } from "./board-store";

type BundledFixture = {
  id: string;
  label: string;
  document: () => InteractiveCanvasDocument;
};

const BUNDLED_FIXTURES: BundledFixture[] = [
  {
    id: "synthetic",
    label: "Synthetic",
    document: () => clone(syntheticInteractiveCanvas),
  },
  {
    id: "v2-flow",
    label: "V2 Flow",
    document: () => clone(v2FlowInteractiveCanvas),
  },
  {
    id: "v2-flow-figjam",
    label: "V2 Flow (FigJam)",
    document: () => clone(v2FlowFigjamCanvas),
  },
];

function clone(document: InteractiveCanvasDocument): InteractiveCanvasDocument {
  return JSON.parse(JSON.stringify(document)) as InteractiveCanvasDocument;
}

function newBoardId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [drafts, setDrafts] = useState<StudioDraft[]>(() => listDrafts());
  const [activeDocument, setActiveDocument] =
    useState<InteractiveCanvasDocument | null>(null);

  const refreshDrafts = () => setDrafts(listDrafts());

  const openFixture = (fixture: BundledFixture) => {
    setActiveDocument(fixture.document());
  };

  const openDraft = (draft: StudioDraft) => {
    setActiveDocument(clone(draft.document));
  };

  const createBoard = () => {
    const document = createStarterInteractiveCanvasDocument({
      id: newBoardId(),
      title: "Untitled board",
    });
    saveDraft(document);
    refreshDrafts();
    setActiveDocument(document);
  };

  const removeDraft = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteDraft(id);
    refreshDrafts();
  };

  const handleSave = async (nextDocument: InteractiveCanvasDocument) => {
    saveDraft(nextDocument);
    refreshDrafts();
    setActiveDocument(nextDocument);
  };

  if (activeDocument) {
    return (
      <div className="min-h-screen bg-background p-4">
        <InteractiveCanvasEditor
          document={activeDocument}
          title={activeDocument.title ?? "Untitled board"}
          onSave={handleSave}
          onCancel={() => setActiveDocument(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <WorkflowIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Codecaine Studio
          </h1>
        </div>
        <Button type="button" onClick={createBoard}>
          <PlusIcon className="h-4 w-4" />
          New board
        </Button>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Bundled samples
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {BUNDLED_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              type="button"
              onClick={() => openFixture(fixture)}
              className={cn(
                "rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50",
              )}
            >
              <span className="block text-sm font-medium">{fixture.label}</span>
              <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                bundled fixture
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your boards
        </h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No local boards yet — start from a bundled sample above or create
            a new board.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => openDraft(draft)}
                className="group relative rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="block truncate pr-6 text-sm font-medium">
                  {draft.title}
                </span>
                <span className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Badge variant="outline">local draft</Badge>
                  {new Date(draft.updatedAt).toLocaleString()}
                </span>
                <span
                  role="button"
                  aria-label={`Delete ${draft.title}`}
                  onClick={(event) => removeDraft(draft.id, event)}
                  className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
