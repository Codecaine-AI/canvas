/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CANVAS_STYLE_CONTROLS,
  DEFAULT_CANVAS_STYLE,
  normalizeCanvasStyle,
  type CanvasStyle,
} from "@codecaine-ai/canvas/style";

import { StyleRail, type StyleRailProps } from "../StyleRail";
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

/** Sets a range input's value the way a drag does, so React's onChange fires. */
function dragTo(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderRail(overrides: Partial<CanvasStyle> = {}) {
  const props = {
    style: normalizeCanvasStyle(overrides),
    overrides,
    onChange: mock((_key: string, _value: number) => {}),
    onResetKey: mock((_key: string) => {}),
    onResetAll: mock(() => {}),
    onClose: mock(() => {}),
  } satisfies StyleRailProps;
  act(() => root.render(<StyleRail {...props} />));
  return props;
}

describe("StyleRail", () => {
  it("renders every control under its group heading with a px value", () => {
    renderRail();
    const sliders = container.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(sliders).toHaveLength(CANVAS_STYLE_CONTROLS.length);
    const headings = [...container.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Shapes", "Sections", "Connectors"]);
    expect(container.textContent).toContain(`${DEFAULT_CANVAS_STYLE.connectorStrokeWidthPx}px`);
  });

  it("a slider drag reports the key and the new value", () => {
    const props = renderRail();
    const slider = container.querySelector<HTMLInputElement>('input[aria-label="Shapes corner radius"]')!;
    act(() => dragTo(slider, 9.5));
    expect(props.onChange).toHaveBeenCalledWith("shapeCornerRadiusPx", 9.5);
  });

  it("only overridden rows offer a reset dot, and it resets that key", () => {
    const props = renderRail({ sectionBorderWidthPx: 3 });
    const dots = container.querySelectorAll<HTMLButtonElement>("button.canvas-style-rail-row-override-dot");
    expect(dots).toHaveLength(1);
    act(() => dots[0]!.click());
    expect(props.onResetKey).toHaveBeenCalledWith("sectionBorderWidthPx");
  });

  it("Reset to defaults is disabled without overrides and resets all with them", () => {
    renderRail();
    const findReset = () =>
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Reset to defaults")!;
    expect(findReset().disabled).toBe(true);

    const props = renderRail({ shapeBorderWidthPx: 4 });
    act(() => findReset().click());
    expect(props.onResetAll).toHaveBeenCalledTimes(1);
  });
});

describe("useCanvasStyleSettings", () => {
  type FetchCall = { url: string; method: string; body: unknown };

  function mockServer(initialOverrides: Partial<CanvasStyle>) {
    const calls: FetchCall[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: String(input), method, body });
      const overrides = method === "PUT" ? (body as { overrides: Partial<CanvasStyle> }).overrides : initialOverrides;
      return new Response(JSON.stringify({ style: normalizeCanvasStyle(overrides), overrides }), { status: 200 });
    }) as unknown as typeof fetch;
    return calls;
  }

  function renderHook() {
    const result: { current: CanvasStyleSettingsController | null } = { current: null };
    function Probe() {
      result.current = useCanvasStyleSettings({ saveDelayMs: 5 });
      return null;
    }
    act(() => root.render(<Probe />));
    return result;
  }

  const settle = (ms = 20) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

  it("loads the server overrides and caches them", async () => {
    mockServer({ shapeCornerRadiusPx: 6 });
    const hook = renderHook();
    await settle();
    expect(hook.current!.style.shapeCornerRadiusPx).toBe(6);
    expect(hook.current!.overrides).toEqual({ shapeCornerRadiusPx: 6 });
    expect(JSON.parse(window.localStorage.getItem(CANVAS_STYLE_STORAGE_KEY)!)).toEqual({ shapeCornerRadiusPx: 6 });
  });

  it("starts from the cached overrides before the server answers", () => {
    window.localStorage.setItem(CANVAS_STYLE_STORAGE_KEY, JSON.stringify({ connectorStrokeWidthPx: 2 }));
    globalThis.fetch = mock(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const hook = renderHook();
    expect(hook.current!.style.connectorStrokeWidthPx).toBe(2);
  });

  it("debounces edits into one PUT of the normalized overrides", async () => {
    const calls = mockServer({});
    const hook = renderHook();
    await settle();
    act(() => {
      hook.current!.setValue("shapeCornerRadiusPx", 3);
      hook.current!.setValue("shapeCornerRadiusPx", 99);
    });
    expect(hook.current!.style.shapeCornerRadiusPx).toBe(24);
    await settle();
    const puts = calls.filter((call) => call.method === "PUT");
    expect(puts).toEqual([{ url: "/api/canvas-style", method: "PUT", body: { overrides: { shapeCornerRadiusPx: 24 } } }]);
  });

  it("resetKey and resetAll clear overrides", async () => {
    const calls = mockServer({ shapeCornerRadiusPx: 6, sectionBorderWidthPx: 3 });
    const hook = renderHook();
    await settle();
    act(() => hook.current!.resetKey("shapeCornerRadiusPx"));
    expect(hook.current!.overrides).toEqual({ sectionBorderWidthPx: 3 });
    act(() => hook.current!.resetAll());
    expect(hook.current!.overrides).toEqual({});
    expect(hook.current!.style).toEqual({ ...DEFAULT_CANVAS_STYLE });
    await settle();
    expect(calls.filter((call) => call.method === "PUT").at(-1)?.body).toEqual({ overrides: {} });
    expect(window.localStorage.getItem(CANVAS_STYLE_STORAGE_KEY)).toBeNull();
  });

  it("a server answer that lands after a local edit does not clobber it", async () => {
    let answer!: (response: Response) => void;
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PUT"
        ? Promise.resolve(new Response("{}", { status: 200 }))
        : new Promise<Response>((resolve) => {
            answer = resolve;
          }),
    ) as unknown as typeof fetch;
    const hook = renderHook();
    act(() => hook.current!.setValue("shapeBorderWidthPx", 5));
    await act(async () => {
      answer(new Response(JSON.stringify({ style: DEFAULT_CANVAS_STYLE, overrides: {} }), { status: 200 }));
    });
    await settle();
    expect(hook.current!.overrides).toEqual({ shapeBorderWidthPx: 5 });
  });
});
