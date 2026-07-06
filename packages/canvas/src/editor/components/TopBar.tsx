"use client";

import { useCallback, useState, type ReactNode } from "react";
import { RotateCcwIcon, Undo2Icon } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { CanvasAction } from "../../model/actions";

export interface TopBarProps {
  title: string | undefined;
  titleContent: ReactNode | undefined;
  editableTitle: boolean;
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
          <Undo2Icon className="h-4 w-4" />
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
