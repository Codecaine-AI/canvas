import { useEffect, useState } from "react";
import { PlusIcon, RefreshCwIcon, Trash2Icon, WorkflowIcon } from "lucide-react";
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
import { Input } from "@codecaine-ai/canvas/ui/input";
import { cn } from "@codecaine-ai/canvas/ui/cn";
import { deleteDraft, listDrafts, saveDraft, type StudioDraft } from "./board-store";
import {
  getStoredProjectServer,
  listProjectBoards,
  loadProjectBoard,
  normalizeServerOrigin,
  ProjectSaveConflictError,
  saveProjectBoard,
  storeProjectServer,
  type ProjectBoard,
  type ProjectBoardSummary,
} from "./project-store";

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

/** `?src=<root-relative sidecar>&server=<origin>` deep link into a project board. */
function readDeepLink(): { src: string; server: string | null } | null {
  const params = new URLSearchParams(window.location.search);
  const src = params.get("src");
  if (!src) return null;
  const server = params.get("server");
  return { src, server: server ? normalizeServerOrigin(server) : null };
}

function clearDeepLink(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("src")) return;
  window.history.replaceState(null, "", window.location.pathname);
}

type ProjectListStatus = "loading" | "connected" | "offline";

export function App() {
  const [drafts, setDrafts] = useState<StudioDraft[]>(() => listDrafts());
  const [activeDocument, setActiveDocument] =
    useState<InteractiveCanvasDocument | null>(null);

  // Project boards: server-backed sidecars, never mirrored into local drafts.
  const [projectServer, setProjectServer] = useState<string>(() => getStoredProjectServer());
  const [serverInput, setServerInput] = useState(projectServer);
  const [projectBoards, setProjectBoards] = useState<ProjectBoardSummary[]>([]);
  const [projectStatus, setProjectStatus] = useState<ProjectListStatus>("loading");
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectBoard | null>(null);
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const [projectConflict, setProjectConflict] = useState(false);
  // Bumped when a project board is force-reloaded so the editor remounts on
  // the fresh document instead of keeping its stale internal state.
  const [editorEpoch, setEditorEpoch] = useState(0);

  const refreshDrafts = () => setDrafts(listDrafts());

  useEffect(() => {
    let cancelled = false;
    setProjectStatus("loading");
    listProjectBoards(projectServer)
      .then((boards) => {
        if (cancelled) return;
        setProjectBoards(boards);
        setProjectStatus("connected");
      })
      .catch(() => {
        if (cancelled) return;
        setProjectBoards([]);
        setProjectStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [projectServer]);

  const openProjectBoard = async (server: string, src: string) => {
    setProjectNotice(null);
    try {
      const board = await loadProjectBoard(server, src);
      setProjectSaveError(null);
      setProjectConflict(false);
      setActiveProject(board);
      setActiveDocument(board.document);
      setEditorEpoch((epoch) => epoch + 1);
    } catch (error) {
      setProjectNotice(error instanceof Error ? error.message : "Board load failed.");
    }
  };

  // Deep link: open ?src=... directly in the editor on load.
  useEffect(() => {
    const link = readDeepLink();
    if (!link) return;
    if (link.server) {
      setProjectServer(link.server);
      setServerInput(link.server);
    }
    void openProjectBoard(link.server ?? getStoredProjectServer(), link.src);
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyServerInput = () => {
    const normalized = storeProjectServer(serverInput);
    setServerInput(normalized);
    setProjectServer(normalized);
  };

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

  const closeEditor = () => {
    setActiveDocument(null);
    setActiveProject(null);
    setProjectSaveError(null);
    setProjectConflict(false);
    clearDeepLink();
  };

  const reloadActiveProject = async () => {
    if (!activeProject) return;
    setProjectSaveError(null);
    setProjectConflict(false);
    try {
      const board = await loadProjectBoard(activeProject.server, activeProject.src);
      setActiveProject(board);
      setActiveDocument(board.document);
      setEditorEpoch((epoch) => epoch + 1);
    } catch (error) {
      setProjectSaveError(error instanceof Error ? error.message : "Board reload failed.");
    }
  };

  const handleSave = async (nextDocument: InteractiveCanvasDocument) => {
    if (activeProject) {
      setProjectSaveError(null);
      setProjectConflict(false);
      try {
        const contentHash = await saveProjectBoard(activeProject, nextDocument);
        setActiveProject({ ...activeProject, contentHash, document: nextDocument });
        setActiveDocument(nextDocument);
      } catch (error) {
        if (error instanceof ProjectSaveConflictError) {
          setProjectConflict(true);
          setProjectSaveError(
            "Board changed on disk — reload to pick up the latest version before saving again.",
          );
        } else {
          setProjectSaveError(error instanceof Error ? error.message : "Save failed.");
        }
      }
      return;
    }
    saveDraft(nextDocument);
    refreshDrafts();
    setActiveDocument(nextDocument);
  };

  if (activeDocument) {
    return (
      <div className="min-h-screen bg-background p-4">
        {projectSaveError ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span>{projectSaveError}</span>
            {projectConflict ? (
              <Button type="button" variant="outline" size="sm" onClick={reloadActiveProject}>
                <RefreshCwIcon className="h-3.5 w-3.5" />
                Reload board
              </Button>
            ) : null}
          </div>
        ) : null}
        <InteractiveCanvasEditor
          key={editorEpoch}
          document={activeDocument}
          title={activeDocument.title ?? "Untitled board"}
          onSave={handleSave}
          onCancel={closeEditor}
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

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Project boards
          </h2>
          <Input
            value={serverInput}
            onChange={(event) => setServerInput(event.target.value)}
            onBlur={applyServerInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            aria-label="Project server origin"
            spellCheck={false}
            className="h-6 w-60 px-2 font-mono text-[11px] md:text-[11px]"
          />
        </div>
        {projectStatus === "offline" ? (
          <p className="text-sm text-muted-foreground">
            Not connected — no docs server at{" "}
            <span className="font-mono text-[12px]">{projectServer}</span>.
          </p>
        ) : projectStatus === "loading" ? (
          <p className="text-sm text-muted-foreground">Connecting…</p>
        ) : projectBoards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No canvas boards in this project yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {projectBoards.map((board) => (
              <button
                key={board.src}
                type="button"
                onClick={() => void openProjectBoard(projectServer, board.src)}
                className="rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="block truncate text-sm font-medium">
                  {board.title}
                </span>
                <span className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Badge variant="outline">project</Badge>
                  {board.updatedAt && !Number.isNaN(Date.parse(board.updatedAt))
                    ? new Date(board.updatedAt).toLocaleString()
                    : board.canvasPath}
                </span>
              </button>
            ))}
          </div>
        )}
        {projectNotice ? (
          <p className="mt-2 text-sm text-destructive">{projectNotice}</p>
        ) : null}
      </section>
    </div>
  );
}
