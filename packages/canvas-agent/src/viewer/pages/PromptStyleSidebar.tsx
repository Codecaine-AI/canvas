import {
  PromptStyleRail,
  type PromptStyleSettings,
} from "@agent-kernel/viewer-ui";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

export const PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH = 340;
export const PROMPT_STYLE_SIDEBAR_MIN_WIDTH = 280;
export const PROMPT_STYLE_SIDEBAR_MAX_WIDTH = 520;

interface PromptStyleSidebarProps {
  docked: boolean;
  onChange: (next: PromptStyleSettings) => void;
  onClose: () => void;
  onReset: () => void;
  onWidthChange: (width: number) => void;
  open: boolean;
  settings: PromptStyleSettings;
  width: number;
}

interface ResizeStart {
  pointerId: number;
  pointerX: number;
  width: number;
}

export function clampPromptStyleSidebarWidth(width: number) {
  return Math.min(
    PROMPT_STYLE_SIDEBAR_MAX_WIDTH,
    Math.max(PROMPT_STYLE_SIDEBAR_MIN_WIDTH, width),
  );
}

export function PromptStyleSidebar({
  docked,
  onChange,
  onClose,
  onReset,
  onWidthChange,
  open,
  settings,
  width,
}: PromptStyleSidebarProps) {
  const resizeStartRef = useRef<ResizeStart | null>(null);

  useEffect(() => {
    if (!open || docked) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [docked, onClose, open]);

  if (!open) {
    return null;
  }

  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      width,
    };
  };

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    const resizeStart = resizeStartRef.current;
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) {
      return;
    }

    onWidthChange(
      clampPromptStyleSidebarWidth(
        resizeStart.width + resizeStart.pointerX - event.clientX,
      ),
    );
  };

  const handleResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeStartRef.current?.pointerId !== event.pointerId) {
      return;
    }

    resizeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    onWidthChange(
      clampPromptStyleSidebarWidth(
        width + (event.key === "ArrowLeft" ? 10 : -10),
      ),
    );
  };

  const aside = (
    <aside
      aria-label="Prompt style settings"
      className={
        docked
          ? "relative h-full shrink-0 border-l border-border bg-card"
          : "fixed inset-y-0 right-0 z-50 border-l border-border bg-card shadow-2xl"
      }
      style={{ width: docked ? width : `min(${width}px, 90vw)` }}
    >
      <div
        aria-label="Resize style sidebar"
        aria-orientation="vertical"
        aria-valuemax={PROMPT_STYLE_SIDEBAR_MAX_WIDTH}
        aria-valuemin={PROMPT_STYLE_SIDEBAR_MIN_WIDTH}
        aria-valuenow={width}
        className="absolute inset-y-0 left-0 z-10 w-[5px] -translate-x-1/2 cursor-col-resize touch-none"
        onDoubleClick={() =>
          onWidthChange(PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH)
        }
        onKeyDown={handleResizeKeyDown}
        onPointerCancel={handleResizeEnd}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        role="separator"
        tabIndex={0}
      />
      <PromptStyleRail
        settings={settings}
        onChange={onChange}
        onReset={onReset}
        onClose={onClose}
        className="h-full"
      />
    </aside>
  );

  if (docked) {
    return aside;
  }

  return (
    <>
      <button
        aria-label="Close style sidebar"
        className="fixed inset-0 z-40 cursor-default bg-black/45"
        onClick={onClose}
        type="button"
      />
      {aside}
    </>
  );
}
