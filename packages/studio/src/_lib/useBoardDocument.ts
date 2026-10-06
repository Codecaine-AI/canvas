import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasEditorHandle,
} from "@codecaine-ai/canvas";
import type { ViteHotContext } from "vite/types/hot.d.ts";
import type { CanvasFileChangedPayload } from "../../server/canvas-file-watch";
import { fetchCanvas } from "@/shared/canvas-file-client";
import { fetchProjectBoard, getProjectServerOrigin } from "@/shared/docs-server";
import { adaptProjectCanvasToStudio } from "./docs-board-adapter";
import { isDocumentRoute, type Route } from "./route";
import { useBoardSave } from "./useBoardSave";
import { clone } from "./utils";

export type UseBoardDocumentOptions = {
  editorRef: RefObject<InteractiveCanvasEditorHandle | null>;
  /** Runs when a board starts loading: the editor's live state belongs to the board before. */
  onLoadStart: () => void;
};

/**
 * The open board: loading it for the route, autosave through useBoardSave,
 * the on-disk conflict and project lock recovery, and in-place reloads when
 * an external writer changes the file.
 */
export function useBoardDocument(route: Route, { editorRef, onLoadStart }: UseBoardDocumentOptions) {
  const [activeDocument, setActiveDocument] =
    useState<InteractiveCanvasDocument | null>(null);
  const [documentState, setDocumentState] =
    useState<"idle" | "loading" | "not-found" | "error">("idle");
  const [documentErrorDetail, setDocumentErrorDetail] = useState<string | null>(null);
  const [projectReloadNonce, setProjectReloadNonce] = useState(0);
  const save = useBoardSave();
  const {
    setSaveState,
    setProjectSaveIssue,
    setDiskConflict,
    diskConflictRef,
    canvasHashRef,
    activeCanvasIdRef,
    projectBoardRef,
    pendingSaveRef,
    saveInFlightRef,
    saveTimerRef,
    savedSnapshotRef,
    clearSaveTimer,
    flushPendingSave,
  } = save;
  const onLoadStartRef = useRef(onLoadStart);
  onLoadStartRef.current = onLoadStart;

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
      // Every PUT would 412 while the disk conflict stands; hold the edits
      // until Reload drops them or Keep mine force-saves them.
      if (diskConflictRef.current) return;
      saveTimerRef.current = window.setTimeout(() => {
        void flushPendingSave();
      }, 800);
    },
    [clearSaveTimer, flushPendingSave],
  );

  useEffect(() => {
    activeCanvasIdRef.current = route.name === "canvas" ? route.id : null;
    if (route.name !== "project") {
      projectBoardRef.current = null;
      setProjectSaveIssue(null);
    }
    if (route.name !== "canvas") {
      canvasHashRef.current = null;
      setDiskConflict(false);
    }
    if (route.name !== "canvas" && route.name !== "project") {
      clearSaveTimer();
      pendingSaveRef.current = null;
      savedSnapshotRef.current = null;
      setSaveState("idle");
    }
  }, [clearSaveTimer, route, setDiskConflict]);

  useEffect(() => {
    if (!isDocumentRoute(route) && route.name !== "project") return;

    let cancelled = false;
    onLoadStartRef.current();
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

    canvasHashRef.current = null;
    setDiskConflict(false);
    fetchCanvas(route.id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setDocumentState("not-found");
          return;
        }
        canvasHashRef.current = result.contentHash;
        applyLoadedDocument(clone(result.canvas));
      })
      .catch(() => {
        if (!cancelled) setDocumentState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [route, projectReloadNonce, setDiskConflict]);

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

  /**
   * Reload the open local board from disk in place: the editor keeps its
   * camera, while undo history, selection, and tool reset exactly as on a
   * fresh load (see InteractiveCanvasEditorHandle.loadDocument). Local
   * pending edits are dropped — callers decide whether that is allowed;
   * `onlyIfClean` re-checks after the fetch, since the user may have edited
   * while it was in flight, and raises the conflict notice instead.
   */
  const reloadLocalCanvas = useCallback(
    async (options?: { onlyIfClean?: boolean }) => {
      const id = activeCanvasIdRef.current;
      if (!id) return;
      if (!options?.onlyIfClean) {
        clearSaveTimer();
        pendingSaveRef.current = null;
        await saveInFlightRef.current;
      }
      let result: Awaited<ReturnType<typeof fetchCanvas>>;
      try {
        result = await fetchCanvas(id);
      } catch {
        return;
      }
      if (!result || activeCanvasIdRef.current !== id) return;
      if (options?.onlyIfClean && (pendingSaveRef.current || saveInFlightRef.current)) {
        setDiskConflict(true);
        return;
      }
      clearSaveTimer();
      pendingSaveRef.current = null;
      canvasHashRef.current = result.contentHash;
      const document = clone(result.canvas);
      savedSnapshotRef.current = JSON.stringify(document);
      setDiskConflict(false);
      setSaveState("idle");
      setActiveDocument(document);
      editorRef.current?.loadDocument(clone(document));
    },
    [clearSaveTimer, setDiskConflict],
  );

  /** "Keep mine": overwrite the on-disk change with the local board. */
  const keepLocalCanvas = useCallback(async () => {
    if (!pendingSaveRef.current && !saveInFlightRef.current && activeDocument) {
      pendingSaveRef.current = clone(activeDocument);
    }
    await flushPendingSave({ force: true });
  }, [activeDocument, flushPendingSave]);

  // External writers (the canvas MCP server, editors, git) announce changes
  // through the dev server's file watcher (server/canvas-file-watch.ts).
  // Studio's own PUTs are filtered server-side; the hash check here also
  // drops anything this tab already has. A clean board reloads in place; a
  // board with unsaved or in-flight edits gets the conflict notice instead —
  // there is no auto-merge.
  const handleCanvasFileChanged = useCallback(
    (payload: CanvasFileChangedPayload) => {
      if (payload.id !== activeCanvasIdRef.current) return;
      if (payload.hash === canvasHashRef.current) return;
      if (diskConflictRef.current || pendingSaveRef.current || saveInFlightRef.current) {
        setDiskConflict(true);
        return;
      }
      void reloadLocalCanvas({ onlyIfClean: true });
    },
    [reloadLocalCanvas, setDiskConflict],
  );
  const handleCanvasFileChangedRef = useRef(handleCanvasFileChanged);
  handleCanvasFileChangedRef.current = handleCanvasFileChanged;

  useEffect(() => {
    // Dev server only: the Electron build has no HMR channel (its PUTs are
    // still revision-checked, so a stale save surfaces as a 412 notice).
    // Cast: @types/bun also declares import.meta.hot (Bun's HMR API) and its
    // callback-less `on` signature wins the merge.
    const hot = import.meta.hot as unknown as ViteHotContext | undefined;
    if (!hot) return;
    // Event name mirrors CANVAS_FILE_CHANGED_EVENT; importing the constant
    // would pull the Node-side watcher module into the client bundle.
    const listener = (payload: CanvasFileChangedPayload) => {
      handleCanvasFileChangedRef.current(payload);
    };
    hot.on("canvas:file-changed", listener);
    return () => hot.off("canvas:file-changed", listener);
  }, []);

  return {
    activeDocument,
    setActiveDocument,
    documentState,
    documentErrorDetail,
    projectSaveIssue: save.projectSaveIssue,
    diskConflict: save.diskConflict,
    diskConflictRef,
    flushPendingSave,
    queueAutosave,
    reloadProjectBoard,
    reloadLocalCanvas,
    keepLocalCanvas,
  };
}

export type BoardDocument = ReturnType<typeof useBoardDocument>;
