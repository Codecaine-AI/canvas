"use client";

import { useEffect, useRef } from "react";
import type { CanvasAction, CanvasSelection, CanvasTool } from "../model/actions";
import { buildPastePayload, copySelection, getClipboardMemory, setClipboardMemory } from "../interaction/clipboard";
import { CANVAS_GRID_SIZE } from "../model/geometry";
import { cancelInteraction, type InteractionState } from "../interaction/interaction";
import type { InteractiveCanvasDocument } from "../model/schema";
import type { CanvasViewportControls } from "./use-canvas-viewport";

/**
 * Scoped keyboard shortcut layer for the interactive canvas editor (4.1.2).
 *
 * Binding map (documented here as the single source of truth — keep this list
 * in sync with any UI hint text, e.g. toolbar button titles):
 *
 *   V              select tool
 *   H              hand tool
 *   C              container tool
 *   P              process tool
 *   D              decision tool
 *   T              text tool
 *   S              sticky tool
 *   O              document tool (checkpoint 5 — D16 expanded vocabulary)
 *   U              person tool (checkpoint 5 — D16 expanded vocabulary)
 *   B              database tool (checkpoint 5 — D16 expanded vocabulary)
 *   M              chat tool (checkpoint 5 — D16 expanded vocabulary)
 *   Delete/Backspace   canvas.deleteSelection (objects AND selected connections)
 *   Cmd/Ctrl-D     canvas.duplicateSelection (preventDefault — beats the browser's
 *                  bookmark-page shortcut)
 *   Cmd/Ctrl-C     copy selection to the in-memory clipboard (clipboard.ts)
 *   Cmd/Ctrl-V     paste the in-memory clipboard via canvas.addObjects
 *   Arrow keys     canvas.moveSelection by 1 world unit (snap: false);
 *                  Shift+Arrow moves by CANVAS_GRID_SIZE (16) instead
 *   Cmd/Ctrl-Z     canvas.undo
 *   Shift-Cmd/Ctrl-Z   canvas.redo
 *   Escape         cancel the active interaction machine gesture, else close an
 *                  open context menu, else clear selection
 *   Cmd/Ctrl-0     viewport controls.fit
 *   Cmd/Ctrl-=     viewport controls.zoomIn
 *   Cmd/Ctrl--     viewport controls.zoomOut
 *
 * All bindings no-op when `document.activeElement` is an input/textarea/select/
 * contentEditable element, OR when `isInlineEditorOpen` is true (an inline label
 * or connector-label editor is open — those own the keyboard while focused, but
 * we also guard here defensively since focus can lag a render). Space is
 * intentionally NOT bound here — useCanvasViewport owns space-drag panning.
 */

const TOOL_KEY_MAP: Record<string, CanvasTool> = {
  v: "select",
  h: "hand",
  c: "container",
  p: "process",
  d: "decision",
  t: "text",
  s: "sticky",
  // Checkpoint 5 (D16 expanded vocabulary) — chosen to avoid colliding with
  // the letters above: O(dOcument), U(person — "U" reads as a person icon
  // mnemonic gap-filler), B(dataBase), M(chat/Message).
  o: "document",
  u: "person",
  b: "database",
  m: "chat",
};

export type UseCanvasHotkeysArgs = {
  enabled?: boolean;
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  dispatch: (action: CanvasAction) => void;
  /** True while an inline text/label editor or the inspector has keyboard focus — suppresses all bindings. */
  isTypingContextActive: () => boolean;
  /** Current interaction machine state (ref-backed) so Escape can cancel an in-progress gesture. */
  interactionStateRef: React.RefObject<InteractionState>;
  /** Applies the result of cancelInteraction (dispatches + resets overlay/state). */
  onCancelInteraction: (result: ReturnType<typeof cancelInteraction>) => void;
  /** Whether a context menu is currently open (Escape closes it when no gesture is active). */
  isContextMenuOpen: () => boolean;
  onCloseContextMenu: () => void;
  controls: Pick<CanvasViewportControls, "fit" | "zoomIn" | "zoomOut">;
  /** World point to center a keyboard paste on (e.g. last known pointer position); omit for the +24 fallback. */
  pastePoint?: () => { x: number; y: number } | undefined;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Mounts window-level keydown handling for the editor's hotkey vocabulary. A
 * single effect re-subscribes when any of the callback-bearing args change
 * identity; callers should keep those stable (useCallback) to avoid churn.
 */
export function useCanvasHotkeys({
  enabled = true,
  document: canvasDocument,
  selection,
  dispatch,
  isTypingContextActive,
  interactionStateRef,
  onCancelInteraction,
  isContextMenuOpen,
  onCloseContextMenu,
  controls,
  pastePoint,
}: UseCanvasHotkeysArgs): void {
  // Refs mirror the latest values so the keydown listener can be attached once
  // (mirrors use-canvas-viewport.ts's pattern) instead of re-binding on every
  // render/state change.
  const documentRef = useRef(canvasDocument);
  documentRef.current = canvasDocument;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const isTypingContextActiveRef = useRef(isTypingContextActive);
  isTypingContextActiveRef.current = isTypingContextActive;
  const onCancelInteractionRef = useRef(onCancelInteraction);
  onCancelInteractionRef.current = onCancelInteraction;
  const isContextMenuOpenRef = useRef(isContextMenuOpen);
  isContextMenuOpenRef.current = isContextMenuOpen;
  const onCloseContextMenuRef = useRef(onCloseContextMenu);
  onCloseContextMenuRef.current = onCloseContextMenu;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const pastePointRef = useRef(pastePoint);
  pastePointRef.current = pastePoint;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || isTypingContextActiveRef.current()) return;

      const meta = event.metaKey || event.ctrlKey;

      // Escape: cancel active gesture, else close context menu, else clear selection.
      if (event.key === "Escape") {
        if (interactionStateRef.current && interactionStateRef.current.kind !== "idle") {
          event.preventDefault();
          const result = cancelInteraction(interactionStateRef.current);
          onCancelInteractionRef.current(result);
          return;
        }
        if (isContextMenuOpenRef.current()) {
          event.preventDefault();
          onCloseContextMenuRef.current();
          return;
        }
        dispatchRef.current({ type: "canvas.select", selection: { kind: "none" } });
        return;
      }

      // Undo / redo.
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatchRef.current({ type: event.shiftKey ? "canvas.redo" : "canvas.undo" });
        return;
      }

      // Duplicate.
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        dispatchRef.current({ type: "canvas.duplicateSelection" });
        return;
      }

      // Copy.
      if (meta && event.key.toLowerCase() === "c") {
        event.preventDefault();
        const payload = copySelection(documentRef.current, selectionRef.current);
        setClipboardMemory(payload);
        return;
      }

      // Paste.
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        const clipboard = getClipboardMemory();
        if (!clipboard) return;
        const target = pastePointRef.current?.();
        const payload = buildPastePayload(clipboard, target);
        dispatchRef.current({
          type: "canvas.addObjects",
          objects: payload.objects,
          connections: payload.connections,
          select: true,
        });
        return;
      }

      // Zoom controls.
      if (meta && (event.key === "0")) {
        event.preventDefault();
        controlsRef.current.fit();
        return;
      }
      if (meta && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        controlsRef.current.zoomIn();
        return;
      }
      if (meta && (event.key === "-" || event.key === "_")) {
        event.preventDefault();
        controlsRef.current.zoomOut();
        return;
      }

      // Anything else with a modifier held falls through unhandled (avoid
      // hijacking browser/system shortcuts we don't own).
      if (meta) return;

      // Delete / Backspace.
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatchRef.current({ type: "canvas.deleteSelection" });
        return;
      }

      // Arrow nudge.
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        const step = event.shiftKey ? CANVAS_GRID_SIZE : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        dispatchRef.current({ type: "canvas.moveSelection", dx, dy, snap: false });
        return;
      }

      // Tool hotkeys (single letter, no modifier).
      const tool = TOOL_KEY_MAP[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        dispatchRef.current({ type: "canvas.setTool", tool });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, interactionStateRef]);
}
