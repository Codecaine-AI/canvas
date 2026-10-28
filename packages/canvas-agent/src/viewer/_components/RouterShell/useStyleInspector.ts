import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampStyleRailWidth,
  loadStyleRailCollapsed,
  saveStyleRailCollapsed,
  saveStyleRailWidth,
} from "@codecaine-ai/agent-kernel-viewer-shell";

import { CANVAS_STYLE_CONFIG, loadStoredStyleRailWidth } from "../../shared/style-config";

/**
 * The Style inspector: its open state (stored, `?style=open` read by the engine), the width the user
 * dragged it to (stored; null keeps the shell token), the drag itself, and the Style button every close
 * path returns focus to.
 */
export function useStyleInspector() {
  const [styleOpen, setStyleOpen] = useState(() => !loadStyleRailCollapsed(CANVAS_STYLE_CONFIG));
  const [styleRailWidth, setStyleRailWidth] = useState(loadStoredStyleRailWidth);
  const [styleRailResizing, setStyleRailResizing] = useState(false);
  const styleButtonRef = useRef<HTMLButtonElement>(null);

  const openStyle = useCallback(() => {
    setStyleOpen(true);
    saveStyleRailCollapsed(CANVAS_STYLE_CONFIG, false);
  }, []);

  // Every close path (the inspector's close button, Escape inside it, the Style button) returns
  // focus to Style, also when the inspector mounted open and the shell saw no opener.
  const closeStyle = useCallback(() => {
    setStyleOpen(false);
    saveStyleRailCollapsed(CANVAS_STYLE_CONFIG, true);
    styleButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const startStyleRailResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setStyleRailResizing(true);
    let width: number | null = null;
    const onMove = (moveEvent: PointerEvent) => {
      // The inspector ends at the root's client edge, left of a classic vertical scrollbar.
      const clientWidth = document.documentElement.clientWidth;
      width = clampStyleRailWidth(clientWidth - moveEvent.clientX);
      // Above 800px index.css caps the pushing inspector at 50vw: store no more than it shows.
      if (!window.matchMedia("(max-width: 800px)").matches) width = Math.min(width, Math.floor(clientWidth / 2));
      setStyleRailWidth(width);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setStyleRailResizing(false);
      if (width !== null) saveStyleRailWidth(CANVAS_STYLE_CONFIG, width);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  return { styleOpen, styleRailWidth, styleRailResizing, styleButtonRef, openStyle, closeStyle, startStyleRailResize };
}
