import { useCallback, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type InteractiveCanvasDocument,
  type InteractiveCanvasEditorHandle,
} from "@codecaine-ai/canvas";
import type { AgentRect, AgentSessionViewport } from "@codecaine-ai/canvas-agent/protocol";
import {
  pendingNotes,
  useAgentSession,
  type BeforeAgentStartSnapshot,
  type PendingNote,
} from "@/shared/agent";
import { scopeForNotes, scopeForWholeBoard } from "./agent-scope";
import type { Route } from "./route";
import type { SaveOptions } from "./useBoardSave";
import { clone, noteRect, sessionAnnotations } from "./utils";

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

export type UseAgentRunOptions = {
  route: Route;
  activeDocument: InteractiveCanvasDocument | null;
  editorRef: RefObject<InteractiveCanvasEditorHandle | null>;
  diskConflictRef: MutableRefObject<boolean>;
  flushPendingSave: (options?: SaveOptions) => Promise<boolean>;
  queueAutosave: (document: InteractiveCanvasDocument) => void;
  setShowAgent: (show: boolean) => void;
  /** Remounts the uncontrolled editor after a sidebar-driven document change. */
  bumpEditorDocumentRevision: () => void;
};

/**
 * The agent run on the open local board: the session (useAgentSession), its
 * pinned notes, the baseline it started from, and the preview frame it draws.
 */
export function useAgentRun({
  route,
  activeDocument,
  editorRef,
  diskConflictRef,
  flushPendingSave,
  queueAutosave,
  setShowAgent,
  bumpEditorDocumentRevision,
}: UseAgentRunOptions) {
  const [agentPreviewRect, setAgentPreviewRect] = useState<AgentRect | null>(null);
  const [agentBaselineDocument, setAgentBaselineDocument] =
    useState<InteractiveCanvasDocument | null>(null);
  const lastAgentRunRef = useRef<{ instruction: string; wholeBoard: boolean } | null>(null);

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
    // An unresolved disk conflict means the board in memory is not the file the
    // harness will read, so a run would scope against one and patch the other.
    if (diskConflictRef.current) {
      throw new Error("The canvas changed on disk. Choose Reload or Keep mine before starting the agent.");
    }
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
    if (!activeDocument) return;
    const state = createInteractiveCanvasState(activeDocument);
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.removeAnnotation",
      annotationId,
    });
    if (next.document === state.document) return;

    // The canvas editor is intentionally uncontrolled. Remount it with the
    // human-action result so its internal reducer and the autosave snapshot
    // cannot diverge after a sidebar-driven annotation removal.
    bumpEditorDocumentRevision();
    queueAutosave(next.document);
  }, [activeDocument, queueAutosave]);

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

  return {
    agentSession,
    hasLiveAgentSession,
    agentNotes,
    cameraLocked,
    agentWorkFrame,
    visibleAgentProposal,
    agentPreviewRect,
    setAgentPreviewRect,
    agentBaselineDocument,
    setAgentBaselineDocument,
    handleRunAgent,
    restartAgentRun,
    handleRemoveAgentNote,
    handlePanToAgentNote,
    handleAddAgentNote,
  };
}

export type AgentRun = ReturnType<typeof useAgentRun>;
