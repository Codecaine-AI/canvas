import { useCallback, useEffect, useMemo, useState } from "react";
import type { ViteHotContext } from "vite/types/hot.d.ts";
import type { CanvasColor } from "@codecaine-ai/canvas";
import {
  DEFAULT_CANVAS_THEME_ID,
  isCanvasThemeId,
  normalizeCanvasStyleSettings,
  resolveCanvasStyle,
  type CanvasStyle,
  type CanvasStyleKey,
  type CanvasStyleOverrides,
  type CanvasStyleSettings,
  type CanvasThemeId,
} from "@codecaine-ai/canvas/style";
import {
  CanvasStyleConflictError,
  fetchCanvasStyle,
  putCanvasStyle,
  type CanvasStyleState,
} from "../canvas-file-client";

/**
 * Workspace-wide canvas style settings for the Style rail: the active theme
 * (figjam, schematic light, schematic dark — schematic light when nothing is
 * saved) plus each theme's own token overrides.
 *
 * The server file (canvases/canvas-style.json, via /api/canvas-style) is the
 * source of truth — the static SVG previews and the Canvas MCP read it too.
 * localStorage only caches the last known settings so the first frame
 * renders with them instead of flashing the defaults before the GET lands
 * (the same role docs' `docs-style-rail-settings` blob plays).
 *
 * Edits apply locally at once and PUT the whole settings document after a
 * short debounce. Each edit is kept as a replayable step until it is saved;
 * a server value (the initial load, or an external change pushed over the dev
 * server's HMR channel) becomes the new base with the unsaved edits replayed
 * on top, so the next save carries both sides. Nothing is saved before a load
 * has answered: the cache may be stale or empty, and the PUT replaces the
 * whole file.
 */

export const CANVAS_STYLE_STORAGE_KEY = "canvas-studio-style-settings";
/** The pre-theme cache: a flat overrides bag, which reads as figjam's overrides. */
const LEGACY_STORAGE_KEY = "canvas-studio-style-overrides";
const DEFAULT_SAVE_DELAY_MS = 500;
const NO_OVERRIDES: CanvasStyleOverrides = Object.freeze({});

function isDefaultSettings(settings: CanvasStyleSettings): boolean {
  return settings.theme === DEFAULT_CANVAS_THEME_ID && Object.keys(settings.themes).length === 0;
}

function readCachedSettings(): CanvasStyleSettings {
  try {
    const raw =
      window.localStorage.getItem(CANVAS_STYLE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return normalizeCanvasStyleSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeCanvasStyleSettings(null);
  }
}

function writeCachedSettings(settings: CanvasStyleSettings): void {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (isDefaultSettings(settings)) {
      window.localStorage.removeItem(CANVAS_STYLE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CANVAS_STYLE_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Storage unavailable — the server copy still persists.
  }
}

/** One local edit as a step that can run again, on top of a newer server value. */
type Edit = (settings: CanvasStyleSettings) => CanvasStyleSettings;

function sameSettings(a: CanvasStyleSettings, b: CanvasStyleSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * An edit of `theme`'s overrides — the theme on screen when the user made it,
 * whichever theme is active when it replays (normalized: preset-equal tokens
 * and empty themes drop).
 */
function editThemeOverrides(
  theme: CanvasThemeId,
  change: (overrides: CanvasStyleOverrides) => CanvasStyleOverrides,
): Edit {
  return (settings) =>
    normalizeCanvasStyleSettings({
      theme: settings.theme,
      themes: { ...settings.themes, [theme]: change(settings.themes[theme] ?? NO_OVERRIDES) },
    });
}

/**
 * The client side of /api/canvas-style: the local settings, the edits not
 * saved yet, and one request at a time (a load waits for a save in flight and
 * a save for a load). Each save names the file revision its settings were
 * built on; when another writer got there first (a second Studio tab, whose
 * saves no change event announces; the Canvas MCP), the server answers 409
 * with the file as it is now, and the unsaved edits replay onto that and save
 * again — neither write is lost.
 */
function createSettingsSync(options: {
  initial: CanvasStyleSettings;
  saveDelayMs: number;
  show: (settings: CanvasStyleSettings) => void;
  observeServer: (settings: CanvasStyleSettings) => void;
}) {
  let current = options.initial;
  /** A load has answered; until then `current` rests on the cache and is never saved. */
  let loaded = false;
  /** The `hash` of the file revision the server last answered with — the base of the next save. */
  let baseHash: string | null = null;
  /** Local edits the server does not hold yet, oldest first. */
  let unsaved: Edit[] = [];
  let busy = false;
  let reloadWanted = false;
  let saveDue = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(next: CanvasStyleSettings) {
    if (sameSettings(next, current)) return;
    current = next;
    writeCachedSettings(next);
    options.show(next);
  }

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  /** The request in flight settled: run what waited for it. */
  function settle() {
    busy = false;
    if (reloadWanted) {
      reloadWanted = false;
      void load();
    } else if (saveDue) {
      saveDue = false;
      save();
    }
  }

  /** A server revision becomes the base: the unsaved edits replay on top of it. */
  function rebase(state: CanvasStyleState) {
    const fetched = normalizeCanvasStyleSettings(state.settings);
    loaded = true;
    baseHash = state.hash ?? null;
    options.observeServer(fetched);
    const replayed = unsaved.reduce((settings, edit) => edit(settings), fetched);
    if (sameSettings(replayed, fetched)) unsaved = []; // the server already holds them
    else if (timer === null) saveDue = true; // they already waited out the debounce
    show(replayed);
  }

  async function load() {
    busy = true;
    try {
      rebase(await fetchCanvasStyle());
    } catch {
      // Keep the local value; the server may be unreachable. The next save retries the load.
    } finally {
      settle();
    }
  }

  function send(keepalive: boolean) {
    const sending = unsaved;
    unsaved = [];
    if (!keepalive) busy = true;
    void putCanvasStyle(current, { baseHash, keepalive })
      .then((state) => {
        baseHash = state.hash ?? null;
        options.observeServer(normalizeCanvasStyleSettings(state.settings));
      })
      .catch((error: unknown) => {
        unsaved = [...sending, ...unsaved];
        // Someone else saved first: replay onto their revision and save again.
        if (error instanceof CanvasStyleConflictError) rebase(error.current);
        // Any other failure keeps the local value, its cache, and its edits; the next edit retries.
      })
      .finally(() => {
        if (!keepalive) settle();
      });
  }

  function save() {
    clearTimer();
    if (unsaved.length === 0) return;
    if (busy) {
      saveDue = true; // runs once the request in flight settles
    } else if (!loaded) {
      void load(); // the first load failed: retry it; its answer replays the edits and saves them
    } else {
      send(false);
    }
  }

  return {
    current: () => current,
    commit(edit: Edit) {
      const next = edit(current);
      if (sameSettings(next, current)) return;
      unsaved.push(edit);
      show(next);
      clearTimer();
      timer = setTimeout(save, options.saveDelayMs);
    },
    reload() {
      if (busy) reloadWanted = true;
      else void load();
    },
    /** Page unload or unmount: send what is unsaved now, without waiting for a request in flight. */
    flushNow() {
      clearTimer();
      if (loaded && unsaved.length > 0) send(true);
    },
  };
}

/** A token value as the rail edits it: a number, a color string, an option value, or a boolean. */
export type CanvasStyleTokenValue = string | number | boolean;

export type CanvasStyleSettingsController = {
  /** The settings document: the active theme plus every theme's overrides. */
  settings: CanvasStyleSettings;
  /** The active theme resolved — pass as `canvasStyle` to editors and viewers. */
  style: CanvasStyle;
  /** The active theme's overrides: the tokens that differ from its preset. */
  overrides: CanvasStyleOverrides;
  /**
   * The style the server holds as of its latest answer (the load, a finished
   * save, an external change) — what its rendered previews show. It trails
   * `style` while a save is pending; null until the server first answers.
   */
  serverStyle: CanvasStyle | null;
  /** Switch themes; every theme keeps its own overrides. */
  setTheme(theme: CanvasThemeId): void;
  /**
   * Override one token of the active theme (`key: "palette"` edits the ink of
   * `paletteColor`). The value is validated like the server does: numbers
   * clamp, an invalid color falls back to the preset, and a value equal to
   * the preset stores no override.
   */
  setToken(key: CanvasStyleKey, value: CanvasStyleTokenValue, paletteColor?: CanvasColor): void;
  /** Drop one override of the active theme (one palette ink with `paletteColor`). */
  resetToken(key: CanvasStyleKey, paletteColor?: CanvasColor): void;
  /** Drop every override of the active theme. */
  resetTheme(): void;
};

export function useCanvasStyleSettings(
  options: { saveDelayMs?: number } = {},
): CanvasStyleSettingsController {
  const [settings, setSettings] = useState<CanvasStyleSettings>(readCachedSettings);
  const [serverSettings, setServerSettings] = useState<CanvasStyleSettings | null>(null);
  const [sync] = useState(() =>
    createSettingsSync({
      initial: settings,
      saveDelayMs: options.saveDelayMs ?? DEFAULT_SAVE_DELAY_MS,
      show: setSettings,
      observeServer: setServerSettings,
    }),
  );

  useEffect(() => {
    sync.reload();
  }, [sync]);

  // External writers (the Canvas MCP, a hand edit) announce canvas-style.json
  // changes through the dev server's file watcher; Studio's own PUTs are
  // filtered server-side. The Electron build has no HMR channel.
  useEffect(() => {
    // Cast: @types/bun also declares import.meta.hot — see App.tsx.
    const hot = import.meta.hot as unknown as ViteHotContext | undefined;
    if (!hot) return;
    const listener = () => sync.reload();
    hot.on("canvas:style-changed", listener);
    return () => hot.off("canvas:style-changed", listener);
  }, [sync]);

  useEffect(() => {
    const handleBeforeUnload = () => sync.flushNow();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sync.flushNow();
    };
  }, [sync]);

  const setTheme = useCallback(
    (theme: CanvasThemeId) => {
      sync.commit((current) => normalizeCanvasStyleSettings({ ...current, theme }));
    },
    [sync],
  );

  const setToken = useCallback(
    (key: CanvasStyleKey, value: CanvasStyleTokenValue, paletteColor?: CanvasColor) => {
      if (key === "theme") {
        if (isCanvasThemeId(value)) setTheme(value);
        return;
      }
      const theme = sync.current().theme;
      if (key === "palette") {
        if (!paletteColor) return;
        sync.commit(
          editThemeOverrides(theme, (overrides) => ({
            ...overrides,
            palette: { ...overrides.palette, [paletteColor]: value },
          })),
        );
        return;
      }
      sync.commit(editThemeOverrides(theme, (overrides) => ({ ...overrides, [key]: value })));
    },
    [sync, setTheme],
  );

  const resetToken = useCallback(
    (key: CanvasStyleKey, paletteColor?: CanvasColor) => {
      sync.commit(
        editThemeOverrides(sync.current().theme, (overrides) => {
          const { [key as keyof CanvasStyleOverrides]: removed, ...rest } = overrides;
          if (key !== "palette" || !paletteColor) return rest;
          const { [paletteColor]: _ink, ...palette } = (removed ?? {}) as CanvasStyleOverrides["palette"] & {};
          return { ...rest, palette };
        }),
      );
    },
    [sync],
  );

  const resetTheme = useCallback(() => {
    sync.commit(editThemeOverrides(sync.current().theme, () => NO_OVERRIDES));
  }, [sync]);

  const style = useMemo(() => resolveCanvasStyle(settings), [settings]);
  const serverStyle = useMemo(
    () => (serverSettings ? resolveCanvasStyle(serverSettings) : null),
    [serverSettings],
  );
  const overrides = settings.themes[settings.theme] ?? NO_OVERRIDES;

  return { settings, style, overrides, serverStyle, setTheme, setToken, resetToken, resetTheme };
}
