import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon, RotateCcwIcon } from "@codecaine-ai/canvas/ui/icons";
import type {
  InteractiveCanvasEditorHandle,
  InteractiveCanvasEditorState,
} from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { parseRoute, shellPageTitle, isDocumentRoute, type Route } from "./_lib/route";
import { useAgentRun } from "./_lib/useAgentRun";
import { useBoardDocument } from "./_lib/useBoardDocument";
import { useBoardList } from "./_lib/useBoardList";
import { useEditorPanels } from "./_lib/useEditorPanels";
import { styleCacheKey } from "./_lib/utils";
import { BoardsPage } from "./_components/BoardsPage";
import { EditorPage } from "./_components/EditorPage";
import { EvalsPage } from "./_components/EvalsPage";
import { GalleryPage } from "./_components/GalleryPage";
import { APP_NAME, RouterShell, SHELL_PATHS } from "./_components/RouterShell";
import { StatusPage } from "./_components/StatusPage";
import { ViewerPage } from "./_components/ViewerPage";
import { devPagesEnabled } from "./shared/dev-flag";
import { navigate } from "./shared/navigation";
import { useCanvasStyleSettings } from "./shared/useCanvasStyleSettings";

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, window.location.search));
  // Bumped by the Evals page's Refresh button in the shell topbar.
  const [evalsRefreshSignal, setEvalsRefreshSignal] = useState(0);
  const pageTitle = shellPageTitle(route) ?? APP_NAME;
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  const panels = useEditorPanels();
  const { setShowAgent } = panels;
  const canvasStyleSettings = useCanvasStyleSettings();
  // Board-list thumbnails are server renders: their URL carries the style the
  // server holds, so a theme switch or token edit fetches fresh ones once its
  // save lands, instead of reusing the document's cached image (or caching a
  // render made before the save under the new key).
  const thumbnailStyle = canvasStyleSettings.serverStyle ?? canvasStyleSettings.style;
  const previewStyleKey = useMemo(() => styleCacheKey(thumbnailStyle), [thumbnailStyle]);
  // Dev rail plumbing (dev-pages flag only): the imperative editor handle
  // plus the live selection/viewport/lastChange stream.
  const editorRef = useRef<InteractiveCanvasEditorHandle | null>(null);
  const [editorState, setEditorState] = useState<InteractiveCanvasEditorState | null>(null);
  const [editorDocumentRevision, setEditorDocumentRevision] = useState(0);
  const previousEditorToolRef = useRef<InteractiveCanvasEditorState["tool"] | null>(null);

  const board = useBoardDocument(route, {
    editorRef,
    onLoadStart: () => {
      setEditorState(null);
      previousEditorToolRef.current = null;
    },
  });
  const { activeDocument, setActiveDocument, documentState, documentErrorDetail, flushPendingSave } = board;

  const agent = useAgentRun({
    route,
    activeDocument,
    editorRef,
    diskConflictRef: board.diskConflictRef,
    flushPendingSave,
    queueAutosave: board.queueAutosave,
    setShowAgent,
    bumpEditorDocumentRevision: () => setEditorDocumentRevision((revision) => revision + 1),
  });
  const { agentSession, hasLiveAgentSession, setAgentPreviewRect, setAgentBaselineDocument } = agent;

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

  const handleEditorStateChange = useCallback((state: InteractiveCanvasEditorState) => {
    setEditorState(state);
    const previousTool = previousEditorToolRef.current;
    previousEditorToolRef.current = state.tool;
    if (state.tool === "annotation" && previousTool !== "annotation") {
      setShowAgent(true);
    }
  }, []);

  const { canvases, listState, loadCanvases, createBoard, deleteCanvas } = useBoardList();

  useEffect(() => {
    if (route.name === "list") {
      setActiveDocument(null);
      void loadCanvases();
    }
  }, [loadCanvases, route.name]);

  const handleBackToBoards = async () => {
    const saved = await flushPendingSave();
    // A conflicted/locked board can never flush — the on-disk copy is the
    // source of truth there, so leaving must not be blocked by it.
    if (saved || board.projectSaveIssue !== null || board.diskConflict) navigate("/");
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
      return <ViewerPage route={route} document={activeDocument} canvasStyle={canvasStyleSettings.style} />;
    }

    return (
      <EditorPage
        route={route}
        document={activeDocument}
        documentRevision={editorDocumentRevision}
        canvasStyleSettings={canvasStyleSettings}
        panels={panels}
        board={board}
        agent={agent}
        editorRef={editorRef}
        editorState={editorState}
        onEditorStateChange={handleEditorStateChange}
        onBack={() => void handleBackToBoards()}
      />
    );
  }

  // Boards, Object Gallery and Evals render inside one design-system app shell:
  // one instance across these pages, so the sidebar and the theme toggle keep
  // their state and focus. The editor and /view (above) stay full-bleed with
  // their own floating chrome (guide/layout.md: a full-screen canvas does not
  // use the shell); the editor's back button returns to the board list.
  if (route.name === "gallery") {
    return (
      <RouterShell path={SHELL_PATHS.gallery} title={pageTitle}>
        <GalleryPage canvasStyle={canvasStyleSettings.style} />
      </RouterShell>
    );
  }

  if (route.name === "evals") {
    const evalsAvailable = devPagesEnabled();
    return (
      <RouterShell
        path={SHELL_PATHS.evals}
        title={pageTitle}
        lane={evalsAvailable ? "full" : undefined}
        actions={
          evalsAvailable ? (
            <Button
              key="refresh"
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEvalsRefreshSignal((signal) => signal + 1)}
            >
              <RotateCcwIcon className="h-4 w-4" />
              Refresh
            </Button>
          ) : null
        }
      >
        {evalsAvailable ? (
          <EvalsPage
            refreshSignal={evalsRefreshSignal}
            boardBackground={canvasStyleSettings.style.boardBackground}
          />
        ) : (
          <p className="text-ui-lg text-muted-foreground">
            Evals are only available with dev pages enabled.
          </p>
        )}
      </RouterShell>
    );
  }

  return (
    <RouterShell
      path={SHELL_PATHS.boards}
      title={pageTitle}
      actions={
        <Button key="new-board" type="button" size="sm" onClick={() => void createBoard()}>
          <PlusIcon className="h-4 w-4" />
          New board
        </Button>
      }
    >
      <BoardsPage
        canvases={canvases}
        listState={listState}
        boardBackground={canvasStyleSettings.style.boardBackground}
        previewStyleKey={previewStyleKey}
        onDelete={(canvas, event) => void deleteCanvas(canvas, event)}
      />
    </RouterShell>
  );
}
