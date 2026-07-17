"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon, RotateCcwIcon, UndoIcon } from "../../../ui/icons";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import type { CanvasAction } from "../../../state/actions";
import type { InteractiveCanvasDocument } from "../../../state/schema";
import { exportDocumentAsPng, exportDocumentAsSvg } from "../../../render/download";

export interface TopBarProps {
  title: string | undefined;
  titleContent: ReactNode | undefined;
  editableTitle: boolean;
  /** Live document — the export menu renders/downloads exactly this state. */
  document: InteractiveCanvasDocument;
  documentTitle: string | undefined;
  documentId: string;
  historyPastLength: number;
  historyFutureLength: number;
  dispatch: (action: CanvasAction) => void;
  onSave?: () => void;
  onCancel?: () => void;
  topBarLeading?: ReactNode;
  topBarActions?: ReactNode;
}

export function TopBar({
  title,
  titleContent,
  editableTitle,
  document,
  documentTitle,
  documentId,
  historyPastLength,
  historyFutureLength,
  dispatch,
  onSave,
  onCancel,
  topBarLeading,
  topBarActions,
}: TopBarProps) {
  const [boardTitleEditing, setBoardTitleEditing] = useState(false);
  const [boardTitleEditValue, setBoardTitleEditValue] = useState("");
  // Export flyout (Export as SVG / PNG). Closes on outside pointer-down and
  // Escape via capture-phase window listeners — capture so Escape is consumed
  // here before the global canvas hotkeys (use-canvas-hotkeys.ts) see it.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const container = exportMenuRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      setExportMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setExportMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [exportMenuOpen]);

  const runExport = useCallback(
    (exporter: (canvasDocument: InteractiveCanvasDocument) => Promise<void>) => {
      setExportMenuOpen(false);
      exporter(document).catch((error: unknown) => {
        // No toast surface exists yet; keep failures loud in the console.
        console.error("Canvas export failed", error);
      });
    },
    [document],
  );

  const boardTitle = title ?? documentTitle ?? documentId;
  const beginBoardTitleEdit = useCallback(() => {
    if (!editableTitle) return;
    setBoardTitleEditValue(boardTitle);
    setBoardTitleEditing(true);
  }, [boardTitle, editableTitle]);
  const cancelBoardTitleEdit = useCallback(() => {
    setBoardTitleEditValue("");
    setBoardTitleEditing(false);
  }, []);
  const commitBoardTitleEdit = useCallback(() => {
    const nextTitle = boardTitleEditValue.trim();
    setBoardTitleEditing(false);
    if (!nextTitle) {
      setBoardTitleEditValue("");
      return;
    }
    dispatch({ type: "canvas.updateDocumentTitle", title: nextTitle });
    setBoardTitleEditValue("");
  }, [boardTitleEditValue, dispatch]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start justify-between gap-3 p-3">
      <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-md border border-border/70 bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
        {topBarLeading}
        <div className="min-w-0">
          {titleContent ?? (
            boardTitleEditing ? (
              <Input
                autoFocus
                className="h-7 w-56 max-w-[45vw] px-2 py-1 font-display text-sm font-semibold"
                value={boardTitleEditValue}
                aria-label="Board name"
                onChange={(event) => setBoardTitleEditValue(event.target.value)}
                onBlur={commitBoardTitleEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitBoardTitleEdit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelBoardTitleEdit();
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="block h-7 max-w-[45vw] truncate rounded px-2 text-left font-display text-sm font-semibold hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={beginBoardTitleEdit}
                disabled={!editableTitle}
                title={boardTitle}
              >
                {boardTitle}
              </button>
            )
          )}
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Undo"
          title="Undo"
          onClick={() => dispatch({ type: "canvas.undo" })}
          disabled={historyPastLength === 0}
        >
          <UndoIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Redo"
          title="Redo"
          onClick={() => dispatch({ type: "canvas.redo" })}
          disabled={historyFutureLength === 0}
        >
          <RotateCcwIcon className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-6 border-l border-border/60" />
        <div ref={exportMenuRef} className="relative">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            title="Export canvas"
            onClick={() => setExportMenuOpen((open) => !open)}
          >
            Export
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          {exportMenuOpen ? (
            <div
              role="menu"
              aria-label="Export canvas"
              className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-border/70 bg-background/95 p-1 text-sm shadow-xl backdrop-blur"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => runExport(exportDocumentAsSvg)}
              >
                Export as SVG
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => runExport((canvasDocument) => exportDocumentAsPng(canvasDocument))}
              >
                Export as PNG
              </button>
            </div>
          ) : null}
        </div>
        {onCancel || onSave ? <span className="mx-1 h-6 border-l border-border/60" /> : null}
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {onSave ? (
          <Button type="button" size="sm" onClick={onSave}>
            Save
          </Button>
        ) : null}
        {topBarActions ? (
          <>
            <span className="mx-1 h-6 border-l border-border/60" />
            {topBarActions}
          </>
        ) : null}
      </div>
    </div>
  );
}
