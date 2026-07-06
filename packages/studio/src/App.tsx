import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowLeftIcon, PanelRightIcon, PlusIcon, Trash2Icon, WorkflowIcon } from "lucide-react";
import {
  InteractiveCanvasEditor,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { Badge } from "@codecaine-ai/canvas/ui/badge";

type CanvasListItem = {
  id: string;
  title: string;
  updated_at: string;
};

type Route = { name: "list" } | { name: "canvas"; id: string };

const SHOW_INSPECTOR_STORAGE_KEY = "studio.showInspector";

function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/canvas\/([^/]+)\/?$/);
  if (match) return { name: "canvas", id: decodeURIComponent(match[1]) };
  return { name: "list" };
}

function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function clone(document: InteractiveCanvasDocument): InteractiveCanvasDocument {
  return JSON.parse(JSON.stringify(document)) as InteractiveCanvasDocument;
}

function createStarterCanvasDocument(input: {
  id: string;
  title: string;
}): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    mode: "diagram",
    size: { width: 960, height: 560 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [
      {
        id: "diagram-frame",
        type: "container",
        label: input.title,
        geometry: { x: 80, y: 80, width: 720, height: 360 },
        style: { tone: "neutral", shape: "rounded-rect" },
        layout: { mode: "free", padding: 32, gap: 24 },
      },
      {
        id: "start",
        type: "process",
        label: "Start",
        parentId: "diagram-frame",
        geometry: { x: 160, y: 200, width: 160, height: 80 },
        style: { tone: "input", shape: "rounded-rect" },
      },
      {
        id: "next-step",
        type: "process",
        label: "Next step",
        parentId: "diagram-frame",
        geometry: { x: 440, y: 200, width: 180, height: 80 },
        style: { tone: "process", shape: "rounded-rect" },
      },
    ],
    connections: [
      {
        id: "start-to-next",
        from: { objectId: "start", anchor: "right" },
        to: { objectId: "next-step", anchor: "left" },
        style: "solid",
        arrow: "forward",
      },
    ],
    links: [],
    annotations: [],
  };
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString();
}

function readShowInspectorPreference(): boolean {
  try {
    return window.localStorage.getItem(SHOW_INSPECTOR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [canvases, setCanvases] = useState<CanvasListItem[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "error">("idle");
  const [activeDocument, setActiveDocument] =
    useState<InteractiveCanvasDocument | null>(null);
  const [editorState, setEditorState] =
    useState<"idle" | "loading" | "not-found" | "error">("idle");
  const [showInspector, setShowInspector] = useState(readShowInspectorPreference);
  const [saveState, setSaveState] = useState<"idle" | "failed" | "saved">("idle");
  const activeCanvasIdRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<InteractiveCanvasDocument | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savedSnapshotRef = useRef<string | null>(null);
  const savedFadeTimerRef = useRef<number | null>(null);

  const clearSaveTimer = useCallback(() => {
    if (!saveTimerRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const markSavedBriefly = useCallback(() => {
    setSaveState("saved");
    if (savedFadeTimerRef.current) window.clearTimeout(savedFadeTimerRef.current);
    savedFadeTimerRef.current = window.setTimeout(() => {
      setSaveState("idle");
      savedFadeTimerRef.current = null;
    }, 900);
  }, []);

  const putCanvas = useCallback(
    async (id: string, document: InteractiveCanvasDocument, options?: { keepalive?: boolean }) => {
      const response = await fetch(`/api/canvases/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ canvas: document }),
        keepalive: options?.keepalive,
      });
      if (!response.ok) {
        throw new Error(response.status === 409 ? "409 Conflict" : `${response.status} ${response.statusText}`);
      }
    },
    [],
  );

  const flushPendingSave = useCallback(
    async (options?: { keepalive?: boolean }) => {
      clearSaveTimer();
      const id = activeCanvasIdRef.current;
      const document = pendingSaveRef.current;
      if (!id || !document) return true;
      pendingSaveRef.current = null;
      try {
        await putCanvas(id, document, options);
        savedSnapshotRef.current = JSON.stringify(document);
        setSaveState("idle");
        if (!options?.keepalive) markSavedBriefly();
        return true;
      } catch {
        pendingSaveRef.current = document;
        setSaveState("failed");
        return false;
      }
    },
    [clearSaveTimer, markSavedBriefly, putCanvas],
  );

  const queueAutosave = useCallback(
    (document: InteractiveCanvasDocument) => {
      setActiveDocument(clone(document));
      if (JSON.stringify(document) === savedSnapshotRef.current) return;
      pendingSaveRef.current = clone(document);
      setSaveState("idle");
      clearSaveTimer();
      saveTimerRef.current = window.setTimeout(() => {
        void flushPendingSave();
      }, 800);
    },
    [clearSaveTimer, flushPendingSave],
  );

  useEffect(() => {
    const handlePopState = () => {
      void flushPendingSave();
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [flushPendingSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushPendingSave({ keepalive: true });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushPendingSave]);

  useEffect(() => {
    activeCanvasIdRef.current = route.name === "canvas" ? route.id : null;
    if (route.name !== "canvas") {
      clearSaveTimer();
      pendingSaveRef.current = null;
      savedSnapshotRef.current = null;
      setSaveState("idle");
    }
  }, [clearSaveTimer, route]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_INSPECTOR_STORAGE_KEY, String(showInspector));
    } catch {
      // Ignore storage failures; the toggle should still work for this session.
    }
  }, [showInspector]);

  useEffect(() => {
    if (route.name !== "canvas") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (event.key.toLowerCase() !== "i") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setShowInspector((current) => !current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [route.name]);

  const loadCanvases = useCallback(async () => {
    setListState("loading");
    try {
      const result = await fetchJson<{ canvases: CanvasListItem[] }>("/api/canvases");
      setCanvases(result.canvases);
      setListState("idle");
    } catch {
      setListState("error");
    }
  }, []);

  useEffect(() => {
    if (route.name === "list") {
      setActiveDocument(null);
      void loadCanvases();
    }
  }, [loadCanvases, route.name]);

  useEffect(() => {
    if (route.name !== "canvas") return;

    let cancelled = false;
    setEditorState("loading");
    setActiveDocument(null);

    fetch(`/api/canvases/${encodeURIComponent(route.id)}`)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return (await response.json()) as { id: string; canvas: InteractiveCanvasDocument };
      })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setEditorState("not-found");
          return;
        }
        const document = clone(result.canvas);
        setActiveDocument(document);
        pendingSaveRef.current = null;
        savedSnapshotRef.current = JSON.stringify(document);
        setSaveState("idle");
        setEditorState("idle");
      })
      .catch(() => {
        if (!cancelled) setEditorState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  const usedBoardNumbers = useMemo(() => {
    const numbers = new Set<number>();
    for (const canvas of canvases) {
      const match = canvas.id.match(/^board-(\d+)$/);
      if (match) numbers.add(Number(match[1]));
    }
    return numbers;
  }, [canvases]);

  const createBoard = async () => {
    let index = 1;
    while (usedBoardNumbers.has(index)) index += 1;
    const id = `board-${index}`;
    const document = createStarterCanvasDocument({
      id,
      title: "Untitled board",
    });
    await fetchJson<{ id: string }>("/api/canvases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, canvas: document }),
    });
    navigate(`/canvas/${encodeURIComponent(id)}`);
  };

  const deleteCanvas = async (canvas: CanvasListItem, event: MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`Delete "${canvas.title}"?`)) return;
    await fetchJson<{ ok: true }>(`/api/canvases/${encodeURIComponent(canvas.id)}`, {
      method: "DELETE",
    });
    await loadCanvases();
  };

  const handleBackToBoards = async () => {
    if (await flushPendingSave()) navigate("/");
  };

  if (route.name === "canvas") {
    if (editorState === "loading") {
      return <StatusPage message="Loading board..." />;
    }
    if (editorState === "not-found") {
      return <StatusPage message={`Board "${route.id}" was not found.`} />;
    }
    if (editorState === "error" || !activeDocument) {
      return <StatusPage message="Could not load this board." />;
    }

    return (
      <div className="min-h-screen bg-background p-4">
        <InteractiveCanvasEditor
          document={activeDocument}
          editableTitle
          showInspector={showInspector}
          onDocumentChange={queueAutosave}
          topBarLeading={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Back to boards"
              title="Back to boards"
              onClick={() => void handleBackToBoards()}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
          }
          topBarActions={
            <>
              {saveState === "failed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => void flushPendingSave()}
                >
                  Save failed — retry
                </Button>
              ) : saveState === "saved" ? (
                <span className="px-2 text-xs text-muted-foreground">Saved</span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={showInspector ? "default" : "outline"}
                aria-pressed={showInspector}
                title="Toggle inspector (Cmd/Ctrl+I)"
                onClick={() => setShowInspector((current) => !current)}
              >
                <PanelRightIcon className="h-4 w-4" />
                Inspector
              </Button>
            </>
          }
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
        <Button type="button" onClick={() => void createBoard()}>
          <PlusIcon className="h-4 w-4" />
          New board
        </Button>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Canvas files
        </h2>
        {listState === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading canvas files...</p>
        ) : listState === "error" ? (
          <p className="text-sm text-destructive">Could not load canvas files.</p>
        ) : canvases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No canvas files yet. Create a board to add one.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {canvases.map((canvas) => (
              <button
                key={canvas.id}
                type="button"
                onClick={() => navigate(`/canvas/${encodeURIComponent(canvas.id)}`)}
                className="group relative rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="block truncate pr-6 text-sm font-medium">
                  {canvas.title}
                </span>
                <span className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Badge variant="outline">{canvas.id}</Badge>
                  {formatUpdatedAt(canvas.updated_at)}
                </span>
                <span
                  role="button"
                  aria-label={`Delete ${canvas.title}`}
                  onClick={(event) => void deleteCanvas(canvas, event)}
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

function StatusPage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" onClick={() => navigate("/")}>
          Back to boards
        </Button>
      </div>
    </div>
  );
}
