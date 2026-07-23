"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRightIcon,
  BoxIcon,
  ClipboardPasteIcon,
  CopyIcon,
  DiamondIcon,
  FitToContentIcon,
  FrameIcon,
  LayersIcon,
  LockIcon,
  MessageSquareIcon,
  StickyIcon,
  TrashIcon,
  UnlockIcon,
} from "../../../../ui/icons";
import { objectTypeLabel } from "../../../../state/actions";
import type { CanvasContextMenuApi } from "./use-canvas-context-menu";

export interface CanvasContextMenuProps {
  menu: CanvasContextMenuApi;
}

/**
 * The right-click menu (object variant + canvas variant), extracted verbatim
 * from InteractiveCanvasEditor.tsx. Renders nothing while the menu is closed.
 */
export function CanvasContextMenu({ menu }: CanvasContextMenuProps) {
  const { contextMenu } = menu;
  if (!contextMenu) return null;
  const menuKey =
    contextMenu.kind === "object"
      ? `object:${contextMenu.objectId}:${contextMenu.x}:${contextMenu.y}`
      : `canvas:${contextMenu.x}:${contextMenu.y}`;
  return <OpenCanvasContextMenu key={menuKey} menu={menu} />;
}

type MenuPanel = "menu" | "note" | "section-export" | "board-export";

function OpenCanvasContextMenu({ menu }: CanvasContextMenuProps) {
  const {
    contextMenu,
    contextObject,
    addObjectFromContextMenu,
    pasteFromContextMenu,
    canPasteFromContextMenu,
    copyFromContextMenu,
    setLockFromContextMenu,
    addContextAnnotation,
    exportContextSection,
    exportContextBoard,
    contextObjectFitDisabled,
    fitContextObject,
    tidySectionMembership,
    deleteContextSelection,
  } = menu;
  const [menuPanel, setMenuPanel] = useState<MenuPanel>("menu");
  const [note, setNote] = useState("");
  if (!contextMenu) return null;

  const saveNote = () => {
    const body = note.trim();
    if (!body) return;
    addContextAnnotation(body);
  };

  return (
    <div
      role="menu"
      aria-label="Canvas context menu"
      className="absolute z-40 w-56 overflow-hidden rounded-md border border-border/70 bg-background/95 p-1 text-sm shadow-xl backdrop-blur"
      style={{
        left: `min(${contextMenu.x}px, calc(100vw - 15rem))`,
        top: `min(${contextMenu.y}px, calc(100vh - 18rem))`,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {contextMenu.kind === "object" && contextObject ? (
        menuPanel === "note" ? (
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              saveNote();
            }}
          >
            <div className="border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
              Note to AI
            </div>
            <input
              autoFocus
              aria-label="Note to AI"
              className="my-1 h-9 w-full rounded border border-border bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
              placeholder="Note for the agent…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveNote();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setNote("");
                  setMenuPanel("menu");
                }
              }}
            />
            <div className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
              Enter to add · Esc to cancel
            </div>
          </form>
        ) : menuPanel === "section-export" && contextObject.type === "section" ? (
          <>
            <div className="border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
              Export section
            </div>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => exportContextSection("svg")}
            >
              Export as SVG
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => exportContextSection("png")}
            >
              Export as PNG
            </button>
          </>
        ) : (
          <>
            <div className="truncate border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
              {contextObject.text.trim() || objectTypeLabel(contextObject.type)}
            </div>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => setMenuPanel("note")}
            >
              <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
              Note to AI…
            </button>
            {contextObject.type === "section" && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => setMenuPanel("section-export")}
                >
                  <FrameIcon className="h-4 w-4 text-muted-foreground" />
                  Export section…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  aria-disabled={contextObjectFitDisabled}
                  disabled={contextObjectFitDisabled}
                  onClick={fitContextObject}
                >
                  <FitToContentIcon className="h-4 w-4 text-muted-foreground" />
                  Fit children
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={tidySectionMembership}
                >
                  <LayersIcon className="h-4 w-4 text-muted-foreground" />
                  Tidy section membership
                </button>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
              onClick={copyFromContextMenu}
            >
              <CopyIcon className="h-4 w-4 text-muted-foreground" />
              Copy
            </button>
            {contextObject.locked ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => setLockFromContextMenu(undefined)}
              >
                <UnlockIcon className="h-4 w-4 text-muted-foreground" />
                Unlock
              </button>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => setLockFromContextMenu("all")}
                >
                  <LockIcon className="h-4 w-4 text-muted-foreground" />
                  Lock all
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => setLockFromContextMenu("background")}
                >
                  <LockIcon className="h-4 w-4 text-muted-foreground" />
                  Lock background only
                </button>
              </>
            )}
            <div className="my-1 border-t border-border/60" />
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-muted hover:text-destructive"
              onClick={deleteContextSelection}
            >
              <TrashIcon className="h-4 w-4" />
              Delete object
            </button>
          </>
        )
      ) : menuPanel === "board-export" ? (
        <>
          <div className="border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
            Export board
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => exportContextBoard("svg")}
          >
            Export as SVG
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => exportContextBoard("png")}
          >
            Export as PNG
          </button>
        </>
      ) : (
        <>
          <div className="border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
            Add to canvas
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            onClick={pasteFromContextMenu}
            disabled={!canPasteFromContextMenu}
            title={canPasteFromContextMenu ? undefined : "Nothing to paste — copy something first"}
          >
            <ClipboardPasteIcon className="h-4 w-4 text-muted-foreground" />
            Paste
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => setMenuPanel("board-export")}
          >
            <FrameIcon className="h-4 w-4 text-muted-foreground" />
            Export board…
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => addObjectFromContextMenu("process")}
          >
            <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
            Add process
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => addObjectFromContextMenu("sticky")}
          >
            <StickyIcon className="h-4 w-4 text-muted-foreground" />
            Add sticky
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => addObjectFromContextMenu("decision")}
          >
            <DiamondIcon className="h-4 w-4 text-muted-foreground" />
            Add decision
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => addObjectFromContextMenu("rectangle")}
          >
            <BoxIcon className="h-4 w-4 text-muted-foreground" />
            Add rectangle
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => addObjectFromContextMenu("section")}
          >
            <FrameIcon className="h-4 w-4 text-muted-foreground" />
            Add section
          </button>
        </>
      )}
    </div>
  );
}
