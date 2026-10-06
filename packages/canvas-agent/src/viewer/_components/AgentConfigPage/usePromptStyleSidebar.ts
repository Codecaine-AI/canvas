import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
  clampPromptStyleSidebarWidth,
} from "@agent-kernel/viewer-ui";

const PROMPT_STYLE_SIDEBAR_STORAGE_KEY =
  "canvasAgent.promptStyleSidebar.v1";
const PROMPT_STYLE_SIDEBAR_BREAKPOINT = "(min-width: 1440px)";

interface PromptStyleSidebarState {
  open: boolean;
  width: number;
}

const DEFAULT_PROMPT_STYLE_SIDEBAR_STATE: PromptStyleSidebarState = {
  open: false,
  width: PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
};

function readPromptStyleSidebarState(): PromptStyleSidebarState {
  if (typeof window === "undefined") {
    return DEFAULT_PROMPT_STYLE_SIDEBAR_STATE;
  }

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(PROMPT_STYLE_SIDEBAR_STORAGE_KEY) ?? "null",
    ) as unknown;

    if (
      typeof stored !== "object" ||
      stored === null ||
      !("open" in stored) ||
      typeof stored.open !== "boolean" ||
      !("width" in stored) ||
      typeof stored.width !== "number" ||
      !Number.isFinite(stored.width)
    ) {
      return DEFAULT_PROMPT_STYLE_SIDEBAR_STATE;
    }

    return {
      open: stored.open,
      width: clampPromptStyleSidebarWidth(stored.width),
    };
  } catch {
    return DEFAULT_PROMPT_STYLE_SIDEBAR_STATE;
  }
}

/** The prompt lab's own Style sidebar: open state and width (stored), and whether the window docks it. */
export function usePromptStyleSidebar() {
  const [styleSidebar, setStyleSidebar] =
    useState<PromptStyleSidebarState>(DEFAULT_PROMPT_STYLE_SIDEBAR_STATE);
  const [styleSidebarStateLoaded, setStyleSidebarStateLoaded] = useState(false);
  const [styleSidebarDocked, setStyleSidebarDocked] = useState(false);
  const styleSidebarStateReadRef = useRef(false);

  const closeStyleSidebar = useCallback(() => {
    setStyleSidebar((current) => ({ ...current, open: false }));
  }, []);

  const setStyleSidebarWidth = useCallback((width: number) => {
    setStyleSidebar((current) => ({
      ...current,
      width: clampPromptStyleSidebarWidth(width),
    }));
  }, []);

  useEffect(() => {
    if (styleSidebarStateReadRef.current) {
      return;
    }

    styleSidebarStateReadRef.current = true;
    setStyleSidebar(readPromptStyleSidebarState());
    setStyleSidebarStateLoaded(true);
  }, []);

  useEffect(() => {
    if (!styleSidebarStateLoaded || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        PROMPT_STYLE_SIDEBAR_STORAGE_KEY,
        JSON.stringify(styleSidebar),
      );
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [styleSidebar, styleSidebarStateLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(PROMPT_STYLE_SIDEBAR_BREAKPOINT);
    const handleChange = (event: MediaQueryListEvent) => {
      setStyleSidebarDocked(event.matches);
    };

    setStyleSidebarDocked(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return { styleSidebar, setStyleSidebar, styleSidebarDocked, closeStyleSidebar, setStyleSidebarWidth };
}
