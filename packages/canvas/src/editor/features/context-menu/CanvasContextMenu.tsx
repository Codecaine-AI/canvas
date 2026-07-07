"use client";

import {
  ArrowRightIcon,
  BoxIcon,
  CheckIcon,
  ClipboardPasteIcon,
  CopyIcon,
  DiamondIcon,
  FrameIcon,
  LayersIcon,
  LockIcon,
  MessageSquareIcon,
  StickyIcon,
  TrashIcon,
  TypeIcon,
  UnlockIcon,
} from "../../../ui/icons";
import type { CanvasContextMenuApi } from "./use-canvas-context-menu";

export interface CanvasContextMenuProps {
  menu: CanvasContextMenuApi;
}

/**
 * The right-click menu (object variant + canvas variant), extracted verbatim
 * from InteractiveCanvasEditor.tsx. Renders nothing while the menu is closed.
 */
export function CanvasContextMenu({ menu }: CanvasContextMenuProps) {
  const {
    contextMenu,
    contextObject,
    addObjectFromContextMenu,
    pasteFromContextMenu,
    canPasteFromContextMenu,
    copyFromContextMenu,
    toggleLockFromContextMenu,
    addContextAnnotation,
    fitContextObject,
    captureContextSectionContents,
    deleteContextSelection,
  } = menu;
  if (!contextMenu) return null;
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
        <>
          <div className="truncate border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
            {contextObject.label}
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={addContextAnnotation}
          >
            <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
            Add annotation
          </button>
          {contextObject.type === "section" && (
            <>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={fitContextObject}
              >
                <CheckIcon className="h-4 w-4 text-muted-foreground" />
                Fit children
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={captureContextSectionContents}
              >
                <LayersIcon className="h-4 w-4 text-muted-foreground" />
                Capture contents
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
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={toggleLockFromContextMenu}
          >
            {contextObject.locked ? (
              <UnlockIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <LockIcon className="h-4 w-4 text-muted-foreground" />
            )}
            {contextObject.locked ? "Unlock" : "Lock"}
          </button>
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
            onClick={() => addObjectFromContextMenu("text")}
          >
            <TypeIcon className="h-4 w-4 text-muted-foreground" />
            Add text
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
