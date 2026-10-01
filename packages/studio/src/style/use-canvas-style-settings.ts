import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViteHotContext } from "vite/types/hot.d.ts";
import {
  canvasStyleOverrides,
  normalizeCanvasStyle,
  type CanvasStyle,
  type CanvasStyleKey,
} from "@codecaine-ai/canvas/style";
import { fetchCanvasStyle, putCanvasStyle } from "../canvas-file-client";

/**
 * Workspace-wide canvas style settings (corner radii, border widths) for the
 * Style rail.
 *
 * The server file (canvases/canvas-style.json, via /api/canvas-style) is the
 * source of truth — the static SVG previews and the Canvas MCP read it too.
 * localStorage only caches the last known overrides so the first frame
 * renders with them instead of flashing the defaults before the GET lands
 * (the same role docs' `docs-style-rail-settings` blob plays).
 *
 * Edits apply locally at once and PUT after a short debounce. A server value
 * (initial load, or an external change pushed over the dev server's HMR
 * channel) never overwrites a local edit made after the fetch started.
 */

export const CANVAS_STYLE_STORAGE_KEY = "canvas-studio-style-overrides";
const DEFAULT_SAVE_DELAY_MS = 500;

function readCachedOverrides(): Partial<CanvasStyle> {
  try {
    const raw = window.localStorage.getItem(CANVAS_STYLE_STORAGE_KEY);
    return raw ? canvasStyleOverrides(normalizeCanvasStyle(JSON.parse(raw))) : {};
  } catch {
    return {};
  }
}

function writeCachedOverrides(overrides: Partial<CanvasStyle>): void {
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(CANVAS_STYLE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CANVAS_STYLE_STORAGE_KEY, JSON.stringify(overrides));
    }
  } catch {
    // Storage unavailable — the server copy still persists.
  }
}

export type CanvasStyleSettingsController = {
  /** Fully resolved style — pass as `canvasStyle` to editors and viewers. */
  style: CanvasStyle;
  /** Keys that differ from the defaults. */
  overrides: Partial<CanvasStyle>;
  setValue(key: CanvasStyleKey, value: number): void;
  resetKey(key: CanvasStyleKey): void;
  resetAll(): void;
};

export function useCanvasStyleSettings(
  options: { saveDelayMs?: number } = {},
): CanvasStyleSettingsController {
  const saveDelayMs = options.saveDelayMs ?? DEFAULT_SAVE_DELAY_MS;
  const [overrides, setOverrides] = useState<Partial<CanvasStyle>>(readCachedOverrides);
  const overridesRef = useRef(overrides);
  /** Bumped on every local edit; a server value fetched before it is stale. */
  const editRevisionRef = useRef(0);
  const pendingRef = useRef<Partial<CanvasStyle> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback((keepalive = false) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    // A failed save keeps the local value (and its cache); the next edit retries.
    void putCanvasStyle(pending, { keepalive }).catch(() => {});
  }, []);

  const commit = useCallback(
    (next: Partial<CanvasStyle>) => {
      const normalized = canvasStyleOverrides(normalizeCanvasStyle(next));
      editRevisionRef.current += 1;
      overridesRef.current = normalized;
      setOverrides(normalized);
      writeCachedOverrides(normalized);
      pendingRef.current = normalized;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(), saveDelayMs);
    },
    [flush, saveDelayMs],
  );

  const loadFromServer = useCallback(async () => {
    const revision = editRevisionRef.current;
    let settings: Awaited<ReturnType<typeof fetchCanvasStyle>>;
    try {
      settings = await fetchCanvasStyle();
    } catch {
      return; // Keep the cached value; the server may be unreachable.
    }
    if (editRevisionRef.current !== revision || pendingRef.current) return;
    const next = canvasStyleOverrides(normalizeCanvasStyle(settings.overrides));
    overridesRef.current = next;
    setOverrides(next);
    writeCachedOverrides(next);
  }, []);

  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  // External writers (the Canvas MCP, a hand edit) announce canvas-style.json
  // changes through the dev server's file watcher; Studio's own PUTs are
  // filtered server-side. The Electron build has no HMR channel.
  useEffect(() => {
    // Cast: @types/bun also declares import.meta.hot — see App.tsx.
    const hot = import.meta.hot as unknown as ViteHotContext | undefined;
    if (!hot) return;
    const listener = () => {
      void loadFromServer();
    };
    hot.on("canvas:style-changed", listener);
    return () => hot.off("canvas:style-changed", listener);
  }, [loadFromServer]);

  useEffect(() => {
    const handleBeforeUnload = () => flush(true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flush(true);
    };
  }, [flush]);

  const setValue = useCallback(
    (key: CanvasStyleKey, value: number) => {
      commit({ ...overridesRef.current, [key]: value });
    },
    [commit],
  );

  const resetKey = useCallback(
    (key: CanvasStyleKey) => {
      const { [key]: _removed, ...rest } = overridesRef.current;
      commit(rest);
    },
    [commit],
  );

  const resetAll = useCallback(() => commit({}), [commit]);

  const style = useMemo(() => normalizeCanvasStyle(overrides), [overrides]);

  return { style, overrides, setValue, resetKey, resetAll };
}
