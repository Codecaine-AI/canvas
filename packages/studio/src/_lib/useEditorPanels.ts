import { useCallback, useEffect, useState } from "react";

const STYLE_RAIL_OPEN_STORAGE_KEY = "canvas-studio-style-rail-open";
const INSPECTOR_OPEN_STORAGE_KEY = "canvas-studio-inspector-open";

function readPanelOpen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function writePanelOpen(storageKey: string, open: boolean): void {
  try {
    window.localStorage.setItem(storageKey, open ? "1" : "0");
  } catch {
    // Session-only when storage is unavailable.
  }
}

/**
 * The editor's right-hand panels. The Style rail and the Inspector share the
 * editor's right-hand slot: opening one closes the other. Both remember
 * whether they were open.
 */
export function useEditorPanels() {
  const [showStyle, setShowStyle] = useState(() => readPanelOpen(STYLE_RAIL_OPEN_STORAGE_KEY));
  const [showInspector, setShowInspector] = useState(() => readPanelOpen(INSPECTOR_OPEN_STORAGE_KEY));

  const toggleStyle = useCallback(() => {
    const next = !showStyle;
    setShowStyle(next);
    if (next) setShowInspector(false);
  }, [showStyle]);

  const toggleInspector = useCallback(() => {
    const next = !showInspector;
    setShowInspector(next);
    if (next) setShowStyle(false);
  }, [showInspector]);

  useEffect(() => {
    writePanelOpen(STYLE_RAIL_OPEN_STORAGE_KEY, showStyle);
  }, [showStyle]);

  useEffect(() => {
    writePanelOpen(INSPECTOR_OPEN_STORAGE_KEY, showInspector);
  }, [showInspector]);

  return {
    showStyle,
    setShowStyle,
    showInspector,
    toggleStyle,
    toggleInspector,
  };
}

export type EditorPanels = ReturnType<typeof useEditorPanels>;
