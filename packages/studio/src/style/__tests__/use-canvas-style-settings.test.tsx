/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  canvasThemePreset,
  normalizeCanvasStyleSettings,
  resolveCanvasStyle,
  type CanvasStyleOverrides,
  type CanvasStyleSettings,
} from "@codecaine-ai/canvas/style";

import {
  CANVAS_STYLE_STORAGE_KEY,
  useCanvasStyleSettings,
  type CanvasStyleSettingsController,
} from "../use-canvas-style-settings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

type FetchCall = { url: string; method: string; body: unknown };

/**
 * A fake /api/canvas-style over an in-memory canvas-style.json (`disk()`):
 * GET answers what the file holds and its revision `hash`; PUT normalizes the
 * body and replaces the file — unless its `baseHash` names an older revision,
 * which answers 409 with the file as it is (the server contract
 * canvas-style-api.test.ts pins). With `holdGets`, each GET waits for
 * `answerGets()` — a slow load.
 */
function mockServer(initial: unknown, options: { holdGets?: boolean } = {}) {
  const calls: FetchCall[] = [];
  let disk = normalizeCanvasStyleSettings(initial);
  let revision = 0;
  const heldGets: Array<() => void> = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(input), method, body });
    let status = 200;
    if (method === "PUT") {
      const { settings, baseHash } = body as { settings: unknown; baseHash: string | null };
      if (baseHash !== `r${revision}`) status = 409;
      else {
        disk = normalizeCanvasStyleSettings(settings);
        revision += 1;
      }
    } else if (options.holdGets) await new Promise<void>((resolve) => heldGets.push(resolve));
    return new Response(
      JSON.stringify({
        settings: disk,
        style: resolveCanvasStyle(disk),
        overrides: disk.themes[disk.theme] ?? {},
        hash: `r${revision}`,
      }),
      { status },
    );
  }) as unknown as typeof fetch;
  return {
    calls,
    disk: () => disk,
    answerGets: () =>
      act(async () => {
        for (const answer of heldGets.splice(0)) answer();
      }),
  };
}

const puts = (calls: FetchCall[]) => calls.filter((call) => call.method === "PUT");
const lastPut = (calls: FetchCall[]) => {
  const body = puts(calls).at(-1)?.body as { settings: CanvasStyleSettings } | undefined;
  return body && { settings: body.settings };
};

function renderHook(target: Root = root) {
  const result: { current: CanvasStyleSettingsController | null } = { current: null };
  function Probe() {
    result.current = useCanvasStyleSettings({ saveDelayMs: 5 });
    return null;
  }
  act(() => target.render(<Probe />));
  return result;
}

const settle = (ms = 20) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe("useCanvasStyleSettings", () => {
  it("loads the server settings, resolves the active theme, and caches the settings", async () => {
    const server: CanvasStyleSettings = {
      theme: "schematic-dark",
      themes: { figjam: { shapeCornerRadiusPx: 6 }, "schematic-dark": { cardFill: "#30364A" } },
    };
    mockServer(server);
    const hook = renderHook();
    await settle();
    expect(hook.current!.settings).toEqual(server);
    expect(hook.current!.style).toEqual({ ...canvasThemePreset("schematic-dark"), cardFill: "#30364A" });
    expect(hook.current!.overrides).toEqual({ cardFill: "#30364A" });
    expect(JSON.parse(window.localStorage.getItem(CANVAS_STYLE_STORAGE_KEY)!)).toEqual(server);
  });

  it("starts from the cached settings before the server answers — including the pre-theme cache", () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    window.localStorage.setItem(
      CANVAS_STYLE_STORAGE_KEY,
      JSON.stringify({ theme: "schematic-light", themes: { "schematic-light": { connectorStrokeWidthPx: 2.5 } } }),
    );
    const hook = renderHook();
    expect(hook.current!.style.theme).toBe("schematic-light");
    expect(hook.current!.style.connectorStrokeWidthPx).toBe(2.5);

    act(() => root.unmount());
    root = createRoot(container);
    window.localStorage.clear();
    window.localStorage.setItem("canvas-studio-style-overrides", JSON.stringify({ connectorStrokeWidthPx: 3 }));
    const legacy = renderHook();
    expect(legacy.current!.settings).toEqual({ theme: "figjam", themes: { figjam: { connectorStrokeWidthPx: 3 } } });
  });

  it("setTheme switches the active theme, keeps every theme's edits, and PUTs the settings once", async () => {
    const { calls } = mockServer({ theme: "figjam", themes: { figjam: { shapeCornerRadiusPx: 6 } } });
    const hook = renderHook();
    await settle();
    act(() => hook.current!.setTheme("schematic-dark"));
    expect(hook.current!.style).toEqual(canvasThemePreset("schematic-dark"));
    expect(hook.current!.overrides).toEqual({});
    await settle();
    expect(puts(calls)).toHaveLength(1);
    expect(lastPut(calls)).toEqual({
      settings: { theme: "schematic-dark", themes: { figjam: { shapeCornerRadiusPx: 6 } } },
    });
    // Back to figjam: its own override is still there.
    act(() => hook.current!.setTheme("figjam"));
    expect(hook.current!.style.shapeCornerRadiusPx).toBe(6);
  });

  it("setToken writes number, color, select, boolean, and palette overrides to the active theme only", async () => {
    const { calls } = mockServer({ theme: "schematic-light", themes: { figjam: { shapeCornerRadiusPx: 6 } } });
    const hook = renderHook();
    await settle();
    act(() => {
      hook.current!.setToken("sectionTintBase", 0.12);
      hook.current!.setToken("cardFill", "#fafafa");
      hook.current!.setToken("headerPlacement", "floating");
      hook.current!.setToken("headerUppercase", false);
      hook.current!.setToken("palette", "#123456", "blue");
    });
    const expectedOverrides: CanvasStyleOverrides = {
      cardFill: "#FAFAFA",
      sectionTintBase: 0.12,
      headerPlacement: "floating",
      headerUppercase: false,
      palette: { blue: "#123456" },
    };
    expect(hook.current!.overrides).toEqual(expectedOverrides);
    expect(hook.current!.style.palette.blue).toBe("#123456");
    expect(hook.current!.style.cardFill).toBe("#FAFAFA");
    await settle();
    // Debounced: one PUT carrying every edit; figjam's override untouched.
    expect(puts(calls)).toHaveLength(1);
    expect(lastPut(calls)).toEqual({
      settings: {
        theme: "schematic-light",
        themes: { figjam: { shapeCornerRadiusPx: 6 }, "schematic-light": expectedOverrides },
      },
    });
  });

  it("setToken stores no override for a preset value or an invalid color", async () => {
    mockServer({});
    const hook = renderHook();
    await settle();
    // No file: the default theme, schematic-light.
    expect(hook.current!.settings.theme).toBe("schematic-light");
    act(() => hook.current!.setToken("shapeCornerRadiusPx", 6));
    expect(hook.current!.overrides).toEqual({ shapeCornerRadiusPx: 6 });
    // Back to the preset value: the override (and its rail dot) goes away.
    act(() => hook.current!.setToken("shapeCornerRadiusPx", canvasThemePreset("schematic-light").shapeCornerRadiusPx));
    expect(hook.current!.overrides).toEqual({});
    act(() => hook.current!.setToken("textColor", "not a color"));
    expect(hook.current!.overrides).toEqual({});
    expect(hook.current!.style.textColor).toBe(canvasThemePreset("schematic-light").textColor);
  });

  it("resetToken drops one token or one palette ink; resetTheme clears only the active theme", async () => {
    const { calls } = mockServer({
      theme: "schematic-dark",
      themes: {
        figjam: { shapeCornerRadiusPx: 6 },
        "schematic-dark": { cardFill: "#30364A", sectionTintMax: 0.3, palette: { red: "#FF0000", blue: "#0000FF" } },
      },
    });
    const hook = renderHook();
    await settle();
    act(() => hook.current!.resetToken("cardFill"));
    expect(hook.current!.overrides).toEqual({ sectionTintMax: 0.3, palette: { red: "#FF0000", blue: "#0000FF" } });
    act(() => hook.current!.resetToken("palette", "red"));
    expect(hook.current!.overrides).toEqual({ sectionTintMax: 0.3, palette: { blue: "#0000FF" } });
    act(() => hook.current!.resetTheme());
    expect(hook.current!.overrides).toEqual({});
    expect(hook.current!.style).toEqual(canvasThemePreset("schematic-dark"));
    await settle();
    expect(lastPut(calls)).toEqual({
      settings: { theme: "schematic-dark", themes: { figjam: { shapeCornerRadiusPx: 6 } } },
    });
  });

  describe("an edit made before the first load answers", () => {
    // canvas-style.json as the server holds it. Nothing is cached, so the
    // rail starts on the defaults (schematic-light, no overrides) — a PUT of
    // that would erase the file.
    const onDisk: CanvasStyleSettings = {
      theme: "figjam",
      themes: { figjam: { shapeCornerRadiusPx: 6 }, "schematic-light": { connectorStrokeWidthPx: 2.5 } },
    };
    type Case = {
      edit: string;
      apply: (controller: CanvasStyleSettingsController) => void;
      shown: CanvasStyleSettings;
      saved: CanvasStyleSettings;
    };
    const cases: Case[] = [
      {
        edit: "a theme switch",
        apply: (controller) => controller.setTheme("schematic-dark"),
        shown: { theme: "schematic-dark", themes: {} },
        saved: { theme: "schematic-dark", themes: onDisk.themes },
      },
      {
        edit: "a token edit",
        // Made on the theme on screen (the default, schematic-light), it replays onto that theme.
        apply: (controller) => controller.setToken("connectorStrokeWidthPx", 3),
        shown: { theme: "schematic-light", themes: { "schematic-light": { connectorStrokeWidthPx: 3 } } },
        saved: {
          theme: "figjam",
          themes: { ...onDisk.themes, "schematic-light": { connectorStrokeWidthPx: 3 } },
        },
      },
    ];

    it.each(cases)("$edit shows at once and saves on top of the server's settings", async ({ apply, shown, saved }) => {
      const server = mockServer(onDisk, { holdGets: true });
      const hook = renderHook();
      act(() => apply(hook.current!));
      expect(hook.current!.settings).toEqual(shown);
      await settle(); // past the save delay: the unread file must not be overwritten
      expect(server.disk()).toEqual(onDisk);
      await server.answerGets();
      await settle();
      expect(hook.current!.settings).toEqual(saved);
      expect(server.disk()).toEqual(saved);
    });
  });

  it("a save from a stale second tab replays onto the first tab's save instead of reverting it", async () => {
    const server = mockServer({ theme: "figjam", themes: {} });
    const tabA = renderHook();
    const tabBRoot = createRoot(document.createElement("div"));
    const tabB = renderHook(tabBRoot);
    await settle();
    act(() => {
      tabA.current!.setTheme("schematic-dark");
      tabA.current!.setToken("sectionTintMax", 0.3);
    });
    await settle();
    // Tab B never heard about A's save: it still shows figjam, and tunes it.
    expect(tabB.current!.settings).toEqual({ theme: "figjam", themes: {} });
    act(() => tabB.current!.setToken("shapeCornerRadiusPx", 6));
    await settle();
    const merged: CanvasStyleSettings = {
      theme: "schematic-dark",
      themes: { figjam: { shapeCornerRadiusPx: 6 }, "schematic-dark": { sectionTintMax: 0.3 } },
    };
    expect(server.disk()).toEqual(merged);
    expect(tabB.current!.settings).toEqual(merged);
    act(() => tabBRoot.unmount());
  });

  it("serverStyle trails local edits until their save is answered", async () => {
    mockServer({ theme: "figjam", themes: {} });
    const hook = renderHook();
    expect(hook.current!.serverStyle).toBeNull();
    await settle();
    expect(hook.current!.serverStyle?.theme).toBe("figjam");
    act(() => hook.current!.setTheme("schematic-dark"));
    expect(hook.current!.style.theme).toBe("schematic-dark");
    expect(hook.current!.serverStyle?.theme).toBe("figjam");
    await settle();
    expect(hook.current!.serverStyle).toEqual(canvasThemePreset("schematic-dark"));
  });
});
