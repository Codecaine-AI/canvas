import { useCallback, useRef, useState } from "react";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import { CanvasSaveConflictError, putCanvas } from "@/shared/canvas-file-client";
import {
  ProjectBoardLockedError,
  ProjectSaveConflictError,
  saveProjectBoard,
} from "@/shared/docs-server";
import { adaptStudioDocumentToProject } from "./docs-board-adapter";

/** The open project board's save target — hash rotates on every 200 PUT. */
export type ProjectBoardHandle = {
  origin: string;
  src: string;
  hash: string;
  /** The exact docs-side wire document last loaded or saved (merge base). */
  raw: unknown;
};

export type SaveOptions = {
  keepalive?: boolean;
  /** Local boards only: skip the If-Match revision check ("Keep mine"). */
  force?: boolean;
};

/**
 * The board's save pipeline: one save in flight at a time, the pending
 * document behind it, the revision hashes sent as If-Match, and the conflict
 * and lock states a failed save raises. useBoardDocument owns the document
 * and calls into this.
 */
export function useBoardSave() {
  const [, setSaveState] = useState<"idle" | "failed" | "saved">("idle");
  const [projectSaveIssue, setProjectSaveIssue] =
    useState<"conflict" | "locked" | null>(null);
  // Local board changed on disk under unsaved edits (or a PUT got 412).
  // Autosave pauses until the user picks Reload or Keep mine.
  const [diskConflict, setDiskConflictState] = useState(false);
  const diskConflictRef = useRef(false);
  /** sha256 of the local board file as last loaded or saved — sent as If-Match. */
  const canvasHashRef = useRef<string | null>(null);
  const activeCanvasIdRef = useRef<string | null>(null);
  const projectBoardRef = useRef<ProjectBoardHandle | null>(null);
  const pendingSaveRef = useRef<InteractiveCanvasDocument | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savedSnapshotRef = useRef<string | null>(null);
  const savedFadeTimerRef = useRef<number | null>(null);

  const setDiskConflict = useCallback((value: boolean) => {
    diskConflictRef.current = value;
    setDiskConflictState(value);
  }, []);

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

  /**
   * Route-aware save: local boards PUT to the studio's own file API with the
   * last known file hash as If-Match; project boards adapt back to the
   * docs-side wire shape and PUT to the linked docs-server with the tracked
   * content hash. Both rotate their hash on success.
   */
  const saveDocument = useCallback(
    async (document: InteractiveCanvasDocument, options?: SaveOptions) => {
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
      const contentHash = await putCanvas(id, document, {
        ...options,
        baseHash: canvasHashRef.current,
      });
      if (activeCanvasIdRef.current === id) canvasHashRef.current = contentHash;
    },
    [],
  );

  const flushPendingSave = useCallback(
    async (options?: SaveOptions) => {
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
            if (options?.force) setDiskConflict(false);
            setSaveState("idle");
            if (!options?.keepalive) markSavedBriefly();
            return true;
          } catch (error) {
            if (!pendingSaveRef.current) pendingSaveRef.current = document;
            if (error instanceof CanvasSaveConflictError) {
              setDiskConflict(true);
            } else if (error instanceof ProjectSaveConflictError) {
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
    [clearSaveTimer, markSavedBriefly, saveDocument, setDiskConflict],
  );

  return {
    setSaveState,
    projectSaveIssue,
    setProjectSaveIssue,
    diskConflict,
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
  };
}
