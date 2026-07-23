import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  PlusIcon,
  ShapesIcon,
  TrashIcon,
  WorkflowIcon,
} from "@codecaine-ai/canvas/ui/icons";
import {
  InteractiveCanvasEditor,
  InteractiveCanvasViewer,
  type InteractiveCanvasDocument,
  type InteractiveCanvasEditorHandle,
  type InteractiveCanvasEditorState,
} from "@codecaine-ai/canvas";
import type {
  AgentRect,
  AgentSessionAnnotation,
  AgentSessionViewport,
} from "@codecaine-ai/canvas-agent/protocol";
import { Button } from "@codecaine-ai/canvas/ui/button";
import {
  AgentSidebar,
  CameraLockPill,
  GhostPreviewLayer,
  GhostPreviewScrim,
  pendingNotes,
  scopeForNotes,
  scopeForWholeBoard,
  targetLabelForSelection,
  useAgentSession,
  type BeforeAgentStartSnapshot,
  type PendingNote,
} from "./agent";
import { GalleryPage } from "./GalleryPage";
import { DevRail } from "./dev/DevRail";
import { devPagesEnabled } from "./dev-flag";
import { navigate } from "./navigation";
import {
  adaptProjectCanvasToStudio,
  adaptStudioDocumentToProject,
} from "./project/docs-board-adapter";
import {
  fetchProjectBoard,
  getProjectServerOrigin,
  normalizeProjectServerOrigin,
  ProjectBoardLockedError,
  ProjectSaveConflictError,
  saveProjectBoard,
} from "./project/docs-server";
import { ProjectBoardsSection } from "./project/ProjectBoardsSection";

type CanvasListItem = {
  id: string;
  title: string;
  updated_at: string;
};

type Route =
  | { name: "list" }
  | { name: "gallery" }
  | { name: "canvas"; id: string }
  /** A linked docs project's board, addressed by docs-root-relative src. */
  | { name: "project"; src: string; server?: string }
  | { name: "view"; id: string; view?: string }
  | { name: "embed"; id: string; view?: string };

export function parseRoute(pathname: string, search = ""): Route {
  if (pathname === "/gallery" || pathname === "/gallery/") {
    return { name: "gallery" };
  }
  const match = pathname.match(/^\/(canvas|view|embed)\/([^/]+)\/?$/);
  if (match) {
    const name = match[1] as "canvas" | "view" | "embed";
    const id = decodeURIComponent(match[2]);
    if (name === "canvas") return { name, id };
    const requestedView = new URLSearchParams(search).get("view")?.trim();
    return { name, id, view: requestedView || undefined };
  }
  // Deep link into a linked project's board: /?src=<docs-root-relative path>
  // (optional &server=<origin>) — the URL "Edit in Canvas" links in docs apps
  // emit. Lands in the same full editor UI as opening from the board list.
  if (pathname === "/" || pathname === "") {
    const params = new URLSearchParams(search);
    const src = params.get("src")?.trim();
    if (src) {
      const server = normalizeProjectServerOrigin(params.get("server") ?? "");
      return { name: "project", src, server: server ?? undefined };
    }
  }
  return { name: "list" };
}

function isDocumentRoute(route: Route): route is Extract<Route, { id: string }> {
  return route.name === "canvas" || route.name === "view" || route.name === "embed";
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
        type: "section",
        text: input.title,
        color: "gray",
        geometry: { x: 80, y: 80, width: 720, height: 360 },
        style: { shape: "section" },
        layout: { mode: "free", padding: 32, gap: 24 },
      },
      {
        id: "start",
        type: "process",
        text: "Start",
        color: "green",
        parentId: "diagram-frame",
        geometry: { x: 160, y: 200, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
      {
        id: "next-step",
        type: "process",
        text: "Next step",
        color: "blue",
        parentId: "diagram-frame",
        geometry: { x: 440, y: 200, width: 180, height: 80 },
        style: { shape: "rounded-rect" },
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
    annotations: [],
  };
}

type Rect = { x: number; y: number; width: number; height: number };

function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map(({ x }) => x));
  const top = Math.min(...rects.map(({ y }) => y));
  const right = Math.max(...rects.map(({ x, width }) => x + width));
  const bottom = Math.max(...rects.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function noteRect(note: Pick<PendingNote, "target">, document: InteractiveCanvasDocument): Rect | null {
  const target = note.target;
  if (target.kind === "region") return target.region;
  if (target.kind === "object") {
    const objectId = target.objectId;
    return document.objects.find(({ id }) => id === objectId)?.geometry ?? null;
  }

  const connectionId = target.connectionId;
  const connection = document.connections.find(({ id }) => id === connectionId);
  if (!connection) return null;
  return unionRects(
    [connection.from.objectId, connection.to.objectId]
      .map((objectId) => document.objects.find(({ id }) => id === objectId)?.geometry)
      .filter((geometry) => geometry !== undefined),
  );
}

function sessionAnnotations(
  notes: readonly PendingNote[],
  document: InteractiveCanvasDocument,
): AgentSessionAnnotation[] {
  return notes.flatMap((note) => {
    const target: AgentSessionAnnotation["target"] | null =
      note.target.kind === "connection"
        ? (() => {
            const region = noteRect(note, document);
            return region ? { kind: "region", region } : null;
          })()
        : note.target;
    if (!target) return [];
    return [{
      id: note.id,
      intent: "agent-request",
      body: note.body,
      target,
      status: "open",
      createdBy: "human",
    }];
  });
}

function agentViewport(editor: InteractiveCanvasEditorHandle | null): AgentSessionViewport | undefined {
  const viewport = editor?.getEditorSnapshot().viewport;
  if (!viewport) return undefined;
  return {
    rect: {
      x: viewport.x,
      y: viewport.y,
      width: window.innerWidth / viewport.zoom,
      height: window.innerHeight / viewport.zoom,
    },
    zoom: viewport.zoom,
  };
}

/** The open project board's save target — hash rotates on every 200 PUT. */
type ProjectBoardHandle = {
  origin: string;
  src: string;
  hash: string;
  /** The exact docs-side wire document last loaded or saved (merge base). */
  raw: unknown;
};

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, window.location.search));
  const [canvases, setCanvases] = useState<CanvasListItem[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "error">("idle");
  const [activeDocument, setActiveDocument] =
    useState<InteractiveCanvasDocument | null>(null);
  const [documentState, setDocumentState] =
    useState<"idle" | "loading" | "not-found" | "error">("idle");
  const [documentErrorDetail, setDocumentErrorDetail] = useState<string | null>(null);
  const [showAgent, setShowAgent] = useState(false);
  const [agentPreviewRect, setAgentPreviewRect] = useState<AgentRect | null>(null);
  const [agentBaselineDocument, setAgentBaselineDocument] =
    useState<InteractiveCanvasDocument | null>(null);
  const [, setSaveState] = useState<"idle" | "failed" | "saved">("idle");
  const [projectSaveIssue, setProjectSaveIssue] =
    useState<"conflict" | "locked" | null>(null);
  const [projectReloadNonce, setProjectReloadNonce] = useState(0);
  const activeCanvasIdRef = useRef<string | null>(null);
  const projectBoardRef = useRef<ProjectBoardHandle | null>(null);
  // Dev rail plumbing (dev-pages flag only): the imperative editor handle
  // plus the live selection/viewport/lastChange stream.
  const editorRef = useRef<InteractiveCanvasEditorHandle | null>(null);
  const [editorState, setEditorState] = useState<InteractiveCanvasEditorState | null>(null);
  const previousEditorToolRef = useRef<InteractiveCanvasEditorState["tool"] | null>(null);
  const lastAgentRunRef = useRef<{ instruction: string; wholeBoard: boolean } | null>(null);
  const pendingSaveRef = useRef<InteractiveCanvasDocument | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
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

  /**
   * Route-aware save: local boards PUT to the studio's own file API; project
   * boards adapt back to the docs-side wire shape and PUT to the linked
   * docs-server with the tracked content hash (rotated on success).
   */
  const saveDocument = useCallback(
    async (document: InteractiveCanvasDocument, options?: { keepalive?: boolean }) => {
      const project = projectBoardRef.current;
      if (project) {
        const wire = adaptStudioDocumentToProject(document, project.raw);
        const { contentHash } = await saveProjectBoard(
          project.origin,
          project.src,
          project.hash,
          wire,
          options,
        );
        project.hash = contentHash;
        project.raw = wire;
        setProjectSaveIssue(null);
        return;
      }
      const id = activeCanvasIdRef.current;
      if (!id) return;
      await putCanvas(id, document, options);
    },
    [putCanvas],
  );

  const flushPendingSave = useCallback(
    async (options?: { keepalive?: boolean }) => {
      clearSaveTimer();
      while (true) {
        const existingSave = saveInFlightRef.current;
        if (existingSave) {
          await existingSave;
          if (saveInFlightRef.current === existingSave) saveInFlightRef.current = null;
          continue;
        }

        const id = activeCanvasIdRef.current;
        const project = projectBoardRef.current;
        const document = pendingSaveRef.current;
        if ((!id && !project) || !document) return true;
        pendingSaveRef.current = null;

        const save = (async () => {
          try {
            await saveDocument(document, options);
            savedSnapshotRef.current = JSON.stringify(document);
            setSaveState("idle");
            if (!options?.keepalive) markSavedBriefly();
            return true;
          } catch (error) {
            if (!pendingSaveRef.current) pendingSaveRef.current = document;
            if (error instanceof ProjectSaveConflictError) {
              setProjectSaveIssue("conflict");
            } else if (error instanceof ProjectBoardLockedError) {
              setProjectSaveIssue("locked");
            }
            setSaveState("failed");
            return false;
          }
        })();
        saveInFlightRef.current = save;
        const saved = await save;
        if (saveInFlightRef.current === save) saveInFlightRef.current = null;
        if (!saved) return false;
      }
    },
    [clearSaveTimer, markSavedBriefly, saveDocument],
  );

  const queueAutosave = useCallback(
    (document: InteractiveCanvasDocument) => {
      setActiveDocument(clone(document));
      if (JSON.stringify(document) === savedSnapshotRef.current) {
        clearSaveTimer();
        if (!saveInFlightRef.current) {
          pendingSaveRef.current = null;
          setSaveState("idle");
          return;
        }
      }
      pendingSaveRef.current = clone(document);
      setSaveState("idle");
      clearSaveTimer();
      saveTimerRef.current = window.setTimeout(() => {
        void flushPendingSave();
      }, 800);
    },
    [clearSaveTimer, flushPendingSave],
  );

  const captureAgentSnapshot = useCallback((): BeforeAgentStartSnapshot => {
    const snapshot: BeforeAgentStartSnapshot = {
      annotations: activeDocument
        ? sessionAnnotations(pendingNotes(activeDocument), activeDocument)
        : [],
    };
    const viewport = agentViewport(editorRef.current);
    if (viewport) snapshot.viewport = viewport;
    return snapshot;
  }, [activeDocument]);

  const beforeAgentStart = useCallback(async (): Promise<BeforeAgentStartSnapshot> => {
    if (!(await flushPendingSave())) {
      throw new Error("Save the board before starting the agent.");
    }
    return captureAgentSnapshot();
  }, [captureAgentSnapshot, flushPendingSave]);

  const dispatchAgentPatch = useCallback(
    (operations: Parameters<InteractiveCanvasEditorHandle["dispatchAgentPatch"]>[0], summary?: string) => {
      editorRef.current?.dispatchAgentPatch(operations, summary);
    },
    [],
  );

  const agentSession = useAgentSession({
    canvasId: route.name === "canvas" ? route.id : "",
    beforeStart: beforeAgentStart,
    dispatchAgentPatch,
  });
  const hasLiveAgentSession =
    agentSession.sessionId !== null &&
    (agentSession.status === "running" ||
      agentSession.status === "proposal-ready" ||
      agentSession.status === "failed");

  useEffect(() => {
    const handlePopState = async () => {
      const nextRoute = parseRoute(window.location.pathname, window.location.search);
      const leavingCanvas =
        route.name === "canvas" &&
        (nextRoute.name !== "canvas" || nextRoute.id !== route.id);
      if (leavingCanvas) {
        if (hasLiveAgentSession) void agentSession.reject();
        agentSession.reset();
        setShowAgent(false);
        setAgentPreviewRect(null);
        setAgentBaselineDocument(null);
      }
      await flushPendingSave();
      setRoute(nextRoute);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [agentSession.reject, agentSession.reset, flushPendingSave, hasLiveAgentSession, route]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasLiveAgentSession) void agentSession.reject();
      agentSession.reset();
      void flushPendingSave({ keepalive: true });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [agentSession.reject, agentSession.reset, flushPendingSave, hasLiveAgentSession]);

  useEffect(() => {
    activeCanvasIdRef.current = route.name === "canvas" ? route.id : null;
    if (route.name !== "project") {
      projectBoardRef.current = null;
      setProjectSaveIssue(null);
    }
    if (route.name !== "canvas" && route.name !== "project") {
      clearSaveTimer();
      pendingSaveRef.current = null;
      savedSnapshotRef.current = null;
      setSaveState("idle");
    }
  }, [clearSaveTimer, route]);

  const toggleAgent = useCallback(() => {
    const next = !showAgent;
    setShowAgent(next);
  }, [showAgent]);

  const handleEditorStateChange = useCallback((state: InteractiveCanvasEditorState) => {
    setEditorState(state);
    const previousTool = previousEditorToolRef.current;
    previousEditorToolRef.current = state.tool;
    if (state.tool === "annotation" && previousTool !== "annotation") {
      setShowAgent(true);
    }
  }, []);

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
    if (!isDocumentRoute(route) && route.name !== "project") return;

    let cancelled = false;
    setEditorState(null);
    previousEditorToolRef.current = null;
    setDocumentState("loading");
    setDocumentErrorDetail(null);
    setActiveDocument(null);

    const applyLoadedDocument = (document: InteractiveCanvasDocument) => {
      setActiveDocument(document);
      pendingSaveRef.current = null;
      savedSnapshotRef.current = JSON.stringify(document);
      setSaveState("idle");
      setDocumentState("idle");
    };

    if (route.name === "project") {
      const origin = route.server ?? getProjectServerOrigin();
      projectBoardRef.current = null;
      setProjectSaveIssue(null);
      fetchProjectBoard(origin, route.src)
        .then((payload) => {
          if (cancelled) return;
          const adapted = adaptProjectCanvasToStudio(payload.canvas);
          if (!adapted.ok) {
            setDocumentErrorDetail(adapted.detail);
            setDocumentState("error");
            return;
          }
          projectBoardRef.current = {
            origin,
            src: route.src,
            hash: payload.contentHash,
            raw: payload.canvas,
          };
          applyLoadedDocument(clone(adapted.document));
        })
        .catch((error) => {
          if (cancelled) return;
          setDocumentErrorDetail(
            error instanceof Error ? error.message : "Could not reach the project server.",
          );
          setDocumentState("error");
        });
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/canvases/${encodeURIComponent(route.id)}`)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return (await response.json()) as { id: string; canvas: InteractiveCanvasDocument };
      })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setDocumentState("not-found");
          return;
        }
        applyLoadedDocument(clone(result.canvas));
      })
      .catch(() => {
        if (!cancelled) setDocumentState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [route, projectReloadNonce]);

  const agentNotes = useMemo(
    () => (activeDocument ? pendingNotes(activeDocument) : []),
    [activeDocument],
  );
  const cameraLocked =
    agentSession.status === "running" || agentSession.status === "proposal-ready";
  const agentWorkFrame = useMemo(() => {
    for (let index = agentSession.events.length - 1; index >= 0; index -= 1) {
      const event = agentSession.events[index];
      if (event?.type === "fitted") return event.frame;
    }
    return null;
  }, [agentSession.events]);
  const agentPreviewRefreshSignal = useMemo(
    () =>
      agentSession.events.filter(
        ({ type }) => type === "proposal" || type === "rendering" || type === "proposal-ready",
      ).length,
    [agentSession.events],
  );
  const visibleAgentProposal =
    agentSession.proposal ?? (agentSession.abandonment ? agentSession.lastGoodProposal : null);

  const startAgentRun = useCallback(
    async ({ instruction, wholeBoard }: { instruction: string; wholeBoard: boolean }) => {
      if (route.name !== "canvas" || !activeDocument) return;
      const baseline = clone(activeDocument);
      const notes = pendingNotes(baseline);
      const viewport = agentViewport(editorRef.current);
      const annotations = sessionAnnotations(notes, baseline);
      setAgentBaselineDocument(baseline);
      setShowAgent(true);
      setAgentPreviewRect(null);
      lastAgentRunRef.current = { instruction, wholeBoard };

      await agentSession.start({
        ...(wholeBoard ? scopeForWholeBoard(baseline) : scopeForNotes(baseline, notes)),
        instruction,
        annotations,
        ...(viewport ? { viewport } : {}),
      });
    },
    [activeDocument, agentSession.start, route],
  );

  const handleRunAgent = useCallback(
    async (globalComment: string) => {
      const comment = globalComment.trim();
      await startAgentRun({
        instruction: comment || "Apply the pinned notes.",
        wholeBoard: Boolean(comment),
      });
    },
    [startAgentRun],
  );

  const restartAgentRun = useCallback(
    async (instruction?: string) => {
      const previous = lastAgentRunRef.current;
      if (!previous) return;
      await agentSession.reject();
      await startAgentRun({
        instruction: instruction?.trim() || previous.instruction,
        wholeBoard: previous.wholeBoard,
      });
    },
    [agentSession.reject, startAgentRun],
  );

  const handleRemoveAgentNote = useCallback((annotationId: string) => {
    editorRef.current?.dispatchAgentPatch([{ type: "removeAnnotation", annotationId }]);
  }, []);

  const handlePanToAgentNote = useCallback(
    (note: PendingNote) => {
      if (!activeDocument) return;
      const rect = noteRect(note, activeDocument);
      if (rect) editorRef.current?.revealRect(rect);
    },
    [activeDocument],
  );

  const handleAddAgentNote = useCallback(() => {
    editorRef.current?.setTool("annotation");
  }, []);

  /**
   * Conflict/lock recovery for project boards: drop local pending edits and
   * refetch the board from the project server (the on-disk copy is newer).
   */
  const reloadProjectBoard = useCallback(() => {
    clearSaveTimer();
    pendingSaveRef.current = null;
    setProjectSaveIssue(null);
    setProjectReloadNonce((nonce) => nonce + 1);
  }, [clearSaveTimer]);

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
    const saved = await flushPendingSave();
    // A conflicted/locked project board can never flush — the on-disk copy is
    // the source of truth there, so leaving must not be blocked by it.
    if (saved || projectSaveIssue !== null) navigate("/");
  };

  if (isDocumentRoute(route) || route.name === "project") {
    if (documentState === "loading") {
      return <StatusPage message="Loading board..." showBack={route.name !== "embed"} />;
    }
    if (documentState === "not-found") {
      const label = route.name === "project" ? route.src : route.id;
      return <StatusPage message={`Board "${label}" was not found.`} showBack={route.name !== "embed"} />;
    }
    if (documentState === "error" || !activeDocument) {
      return (
        <StatusPage
          message={documentErrorDetail ?? "Could not load this board."}
          showBack={route.name !== "embed"}
        />
      );
    }

    if (route.name === "view" || route.name === "embed") {
      const viewer = (
        <InteractiveCanvasViewer
          document={activeDocument}
          view={route.view}
          interactive
          bare
          showNavigationControls
        />
      );

      if (route.name === "embed") {
        return <main className="fixed inset-0 overflow-hidden bg-[#F5F5F5]">{viewer}</main>;
      }

      return (
        <main className="fixed inset-0 overflow-hidden bg-[#F5F5F5]">
          {viewer}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-md backdrop-blur">
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
              <span className="max-w-[50vw] truncate px-1 text-sm font-medium text-neutral-900">
                {activeDocument.title ?? activeDocument.id}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-events-auto bg-white/95 shadow-md backdrop-blur"
              onClick={() => navigate(`/canvas/${encodeURIComponent(route.id)}`)}
            >
              Edit board
            </Button>
          </header>
        </main>
      );
    }

    const devRail = devPagesEnabled();
    const isLocalBoard = route.name === "canvas";

    return (
      <div className="min-h-screen bg-background p-4">
        <InteractiveCanvasEditor
          document={activeDocument}
          editableTitle
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
          ref={editorRef}
          onEditorStateChange={handleEditorStateChange}
          cameraOnly={cameraLocked}
          worldOverlay={cameraLocked && isLocalBoard ? (
            <GhostPreviewLayer
              canvasId={route.id}
              sessionId={agentSession.sessionId}
              refreshSignal={agentPreviewRefreshSignal}
              baselineDocument={agentBaselineDocument ?? activeDocument}
              proposal={visibleAgentProposal}
              workFrame={agentWorkFrame}
              onPreviewRectChange={setAgentPreviewRect}
            />
          ) : undefined}
          screenOverlay={
            <>
              {!isLocalBoard && projectSaveIssue ? (
                <div className="pointer-events-auto absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-md">
                  <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                  <span>
                    {projectSaveIssue === "conflict"
                      ? "Board changed on disk — reload to keep editing."
                      : "Another session is editing this board — saving is blocked."}
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={reloadProjectBoard}>
                    Reload
                  </Button>
                </div>
              ) : null}
              {cameraLocked && editorState ? (
                <GhostPreviewScrim
                  previewRect={agentPreviewRect}
                  viewport={editorState.viewport}
                />
              ) : null}
              {showAgent ? (
                <div className="pointer-events-auto">
                  <AgentSidebar
                    status={agentSession.status}
                    onClose={() => setShowAgent(false)}
                    acceptedResult={agentSession.acceptedResult}
                    pinningTargetLabel={
                      editorState?.tool === "annotation"
                        ? targetLabelForSelection(activeDocument, editorState.selection)
                        : undefined
                    }
                    queue={{
                      notes: agentNotes,
                      onRemoveNote: handleRemoveAgentNote,
                      onPanToNote: handlePanToAgentNote,
                      onAddNote: handleAddAgentNote,
                      onRun: handleRunAgent,
                    }}
                    session={{
                      attempts: agentSession.attempts,
                      baselineDocument: agentBaselineDocument ?? activeDocument,
                      proposal: agentSession.proposal,
                      lastGoodProposal: agentSession.lastGoodProposal,
                      abandoned: agentSession.abandonment,
                      error: agentSession.error,
                      harnessUnavailable: agentSession.harnessUnavailable,
                      acceptConflict: agentSession.acceptConflict,
                      onRefine: async (instruction) => {
                        await agentSession.refine(instruction);
                      },
                      onAccept: agentSession.accept,
                      onReject: agentSession.reject,
                      onRetry: () => restartAgentRun(),
                      onClose: () => setShowAgent(false),
                      onDiscardConflict: agentSession.reject,
                      onTryAgainOnCurrentBoard: () => restartAgentRun(),
                      onStartOver: restartAgentRun,
                    }}
                  />
                </div>
              ) : null}
              {cameraLocked ? (
                <CameraLockPill onStop={() => void agentSession.stop()} />
              ) : null}
            </>
          }
          topBarActions={
            isLocalBoard ? (
              <Button
                type="button"
                size="sm"
                variant={showAgent ? "default" : "outline"}
                aria-pressed={showAgent}
                title="Toggle AI"
                onClick={toggleAgent}
              >
                <span aria-hidden="true">✦</span>
                AI
                {agentNotes.length > 0 ? (
                  <span className="rounded-full bg-current/10 px-1.5 text-[10px] leading-4">
                    {agentNotes.length}
                  </span>
                ) : null}
              </Button>
            ) : undefined
          }
        />
        {devRail ? (
          <DevRail
            document={activeDocument}
            editorState={editorState}
            editorRef={editorRef}
          />
        ) : null}
      </div>
    );
  }

  if (route.name === "gallery") {
    return <GalleryPage onBack={() => navigate("/")} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <WorkflowIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Canvas
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/gallery")}>
            <ShapesIcon className="h-4 w-4" />
            Object Gallery
          </Button>
          <Button type="button" onClick={() => void createBoard()}>
            <PlusIcon className="h-4 w-4" />
            New board
          </Button>
        </div>
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
                className="group relative overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:bg-muted/50"
              >
                <span className="block aspect-[16/10] w-full overflow-hidden border-b border-border bg-[#F5F5F5]">
                  <img
                    src={`/api/canvases/${encodeURIComponent(canvas.id)}/preview.svg`}
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
                  <span className="block truncate pr-6 text-sm font-medium">
                    {canvas.title}
                  </span>
                </span>
                <span
                  role="button"
                  aria-label={`Delete ${canvas.title}`}
                  onClick={(event) => void deleteCanvas(canvas, event)}
                  className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <ProjectBoardsSection />
    </div>
  );
}

function StatusPage({ message, showBack = true }: { message: string; showBack?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        {showBack ? (
          <Button type="button" variant="outline" onClick={() => navigate("/")}>
            Back to boards
          </Button>
        ) : null}
      </div>
    </div>
  );
}
