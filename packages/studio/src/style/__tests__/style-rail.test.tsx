/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CANVAS_STYLE_CONTROLS,
  CANVAS_STYLE_GROUP_LABELS,
  canvasThemePreset,
  normalizeCanvasStyleSettings,
  resolveCanvasStyle,
  type CanvasStyleSettings,
} from "@codecaine-ai/canvas/style";

import { StyleRail, type StyleRailProps } from "../StyleRail";
import { useCanvasStyleSettings } from "../use-canvas-style-settings";

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

/** Sets an input's value the way typing or a drag does, so React's onChange fires. */
function typeInto(input: HTMLInputElement, value: string | number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const $ = <T extends Element = HTMLInputElement>(selector: string) => container.querySelector<T>(selector);
const byLabel = (label: string) => $(`input[aria-label="${label}"]`);

function expandGroup(group: string) {
  const header = $<HTMLButtonElement>(`section[data-group="${group}"] > button`)!;
  if (header.getAttribute("aria-expanded") !== "true") act(() => header.click());
}

function renderRail(settings: CanvasStyleSettings = { theme: "figjam", themes: {} }) {
  const normalized = normalizeCanvasStyleSettings(settings);
  const props = {
    settings: normalized,
    style: resolveCanvasStyle(normalized),
    overrides: normalized.themes[normalized.theme] ?? {},
    onSelectTheme: mock((_theme: string) => {}),
    onChange: mock((_key: string, _value: unknown, _paletteColor?: string) => {}),
    onResetKey: mock((_key: string, _paletteColor?: string) => {}),
    onResetTheme: mock(() => {}),
    onClose: mock(() => {}),
  } satisfies StyleRailProps;
  act(() => root.render(<StyleRail {...props} />));
  return props;
}

describe("StyleRail", () => {
  it("offers the three themes as radio cards and marks the active one", () => {
    const props = renderRail({ theme: "schematic-light", themes: {} });
    const radios = [...container.querySelectorAll<HTMLInputElement>('[aria-label="Theme"] input[type="radio"]')];
    expect(radios.map((radio) => radio.value)).toEqual(["figjam", "schematic-light", "schematic-dark"]);
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    expect($('[data-theme="schematic-light"]')!.getAttribute("data-active")).toBe("true");
    act(() => radios[2]!.click());
    expect(props.onSelectTheme).toHaveBeenCalledWith("schematic-dark");
  });

  it("paints each card from its own theme, edits included", () => {
    renderRail({ theme: "figjam", themes: { "schematic-dark": { boardBackground: "#000000" } } });
    const preview = (theme: string) => $<HTMLElement>(`[data-theme="${theme}"] .canvas-style-theme-preview`)!;
    expect(preview("figjam").style.backgroundColor).toBe("#F5F5F5");
    expect(preview("schematic-light").style.backgroundColor).toBe("#F6F8FA");
    expect(preview("schematic-dark").style.backgroundColor).toBe("#000000");
    expect($('[data-theme="schematic-dark"] .canvas-style-theme-edited')).not.toBeNull();
    expect($('[data-theme="figjam"] .canvas-style-theme-edited')).toBeNull();
  });

  it("lists every token group, collapsed until opened, without a theme row", () => {
    renderRail();
    const headers = [...container.querySelectorAll<HTMLButtonElement>("section[data-group] > button")];
    expect(headers.map((header) => header.textContent)).toEqual(
      ["board", "text", "shapes", "sections", "icons", "connectors", "stickies", "palette"].map(
        (group) => CANVAS_STYLE_GROUP_LABELS[group as keyof typeof CANVAS_STYLE_GROUP_LABELS],
      ),
    );
    expect(headers.every((header) => header.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(container.querySelector("[data-control]")).toBeNull();
    for (const header of headers) act(() => header.click());
    // Figjam sections are flat and its icons bare glyphs, so the layer-cake
    // and tile-only rows stay hidden.
    const figjam = canvasThemePreset("figjam");
    const visible = CANVAS_STYLE_CONTROLS.filter(
      (control) =>
        control.key !== "theme" &&
        (!control.visibleWhen || figjam[control.visibleWhen.key] === control.visibleWhen.equals),
    );
    expect(visible.length).toBeLessThan(CANVAS_STYLE_CONTROLS.length - 1);
    expect(container.querySelectorAll("[data-control]")).toHaveLength(visible.length);
    expect($('[data-control="theme"]')).toBeNull();
  });

  // Slider, segmented select, and the save path are covered end to end below
  // ("StyleRail wired to useCanvasStyleSettings"); these are the other inputs.
  it("reports edits from the exact number input, color text, switch, and palette rows", () => {
    const props = renderRail({ theme: "schematic-light", themes: {} });
    for (const group of ["text", "sections", "palette"]) expandGroup(group);

    // number: the exact input beside the slider
    act(() => typeInto(byLabel("Sections tint value")!, "0.12"));
    expect(props.onChange).toHaveBeenLastCalledWith("sectionTintBase", 0.12, undefined);

    // color: text accepts #RRGGBB and rgba(); an invalid entry is flagged, not sent
    const nameColor = byLabel("Text name color")!;
    act(() => nameColor.focus());
    props.onChange.mockClear();
    act(() => typeInto(nameColor, "#12"));
    expect(props.onChange).not.toHaveBeenCalled();
    expect(nameColor.getAttribute("aria-invalid")).toBe("true");
    act(() => typeInto(nameColor, "rgba(1,2,3,0.5)"));
    expect(props.onChange).toHaveBeenLastCalledWith("textColor", "rgba(1, 2, 3, 0.5)", undefined);
    expect(nameColor.getAttribute("aria-invalid")).toBeNull();

    // boolean: switch
    const uppercase = byLabel("Sections uppercase header")!;
    expect(uppercase.checked).toBe(true);
    act(() => uppercase.click());
    expect(props.onChange).toHaveBeenLastCalledWith("headerUppercase", false, undefined);

    // palette: one ink row per color, keyed "palette" + the color
    act(() => typeInto(byLabel("Palette blue")!, "#123456"));
    expect(props.onChange).toHaveBeenLastCalledWith("palette", "#123456", "blue");
  });

  it("the native color picker keeps the token's alpha", () => {
    const props = renderRail({ theme: "schematic-light", themes: {} });
    expandGroup("board");
    // Grid dots are rgba(15, 30, 54, 0.13) in schematic light.
    act(() => typeInto(byLabel("Board grid dots picker")!, "#ff0000"));
    expect(props.onChange).toHaveBeenLastCalledWith("gridDotColor", "rgba(255, 0, 0, 0.13)", undefined);
  });

  it("shows the tint rows only under layer-cake section fills", () => {
    renderRail({ theme: "figjam", themes: {} });
    expandGroup("sections");
    expect(byLabel("Sections tint")).toBeNull();
    expect(byLabel("Sections header strength")).toBeNull();
    renderRail({ theme: "figjam", themes: { figjam: { sectionFill: "layer-cake" } } });
    expect(byLabel("Sections tint")).not.toBeNull();
    expect(byLabel("Sections header strength")).not.toBeNull();
    expect(container.querySelector('[data-inactive="true"]')).toBeNull();
  });

  it("keeps an overridden tint row reachable (dimmed) after the fill goes back to flat", () => {
    const props = renderRail({ theme: "figjam", themes: { figjam: { sectionTintBase: 0.12 } } });
    expandGroup("sections");
    const inactive = [...container.querySelectorAll('[data-inactive="true"]')];
    expect(inactive).toHaveLength(1);
    expect(inactive[0]!.querySelector('input[aria-label="Sections tint"]')).not.toBeNull();
    expect(inactive[0]!.textContent).toContain("Applies when Fill is Layer cake");
    // Other layer-cake rows without an override stay hidden.
    expect(byLabel("Sections header strength")).toBeNull();
    act(() => inactive[0]!.querySelector<HTMLButtonElement>("button.canvas-style-rail-row-override-dot")!.click());
    expect(props.onResetKey).toHaveBeenCalledWith("sectionTintBase", undefined);
  });

  it("marks overridden tokens with a reset dot and counts them per group", () => {
    const props = renderRail({
      theme: "schematic-dark",
      themes: { "schematic-dark": { sectionBorderWidthPx: 3, palette: { red: "#FF0000" } } },
    });
    expect($('section[data-group="sections"] .canvas-style-rail-group-count')!.textContent).toBe("1");
    expect($('section[data-group="palette"] .canvas-style-rail-group-count')!.textContent).toBe("1");
    expect($('section[data-group="shapes"] .canvas-style-rail-group-count')).toBeNull();
    expect(container.textContent).toContain("Schematic dark: 2 overrides");

    expandGroup("sections");
    expandGroup("palette");
    const dots = [...container.querySelectorAll<HTMLButtonElement>("button.canvas-style-rail-row-override-dot")];
    expect(dots.map((dot) => dot.getAttribute("aria-label"))).toEqual([
      "Reset Sections border width to the theme default",
      "Reset Palette red to the theme default",
    ]);
    act(() => dots[0]!.click());
    expect(props.onResetKey).toHaveBeenCalledWith("sectionBorderWidthPx", undefined);
    act(() => dots[1]!.click());
    expect(props.onResetKey).toHaveBeenCalledWith("palette", "red");
  });

  it("Reset theme is disabled without overrides and resets the active theme with them", () => {
    renderRail({ theme: "schematic-dark", themes: { figjam: { shapeBorderWidthPx: 4 } } });
    const findReset = () =>
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Reset theme")!;
    // Only figjam has edits; the active theme has none.
    expect(findReset().disabled).toBe(true);

    const props = renderRail({ theme: "schematic-dark", themes: { "schematic-dark": { shapeBorderWidthPx: 4 } } });
    act(() => findReset().click());
    expect(props.onResetTheme).toHaveBeenCalledTimes(1);
  });

  it("keeps keys pressed on its controls away from the window-level canvas hotkeys", () => {
    const windowKeydown = mock((_event: KeyboardEvent) => {});
    window.addEventListener("keydown", windowKeydown);
    try {
      renderRail();
      const header = $<HTMLButtonElement>('section[data-group="board"] > button')!;
      act(() => {
        header.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
        header.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowKeydown);
    }
  });

  it("remembers which groups are open", () => {
    renderRail();
    expandGroup("icons");
    act(() => root.unmount());
    root = createRoot(container);
    renderRail();
    expect($('section[data-group="icons"] > button')!.getAttribute("aria-expanded")).toBe("true");
    expect($('section[data-group="board"] > button')!.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("StyleRail wired to useCanvasStyleSettings", () => {
  type FetchCall = { method: string; body: unknown };

  /** The App wiring, against a fake /api/canvas-style that echoes normalized PUTs. */
  function renderWired(initial: CanvasStyleSettings) {
    const calls: FetchCall[] = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, body });
      const settings = normalizeCanvasStyleSettings(method === "PUT" ? body.settings : initial);
      return new Response(
        JSON.stringify({ settings, style: resolveCanvasStyle(settings), overrides: settings.themes[settings.theme] ?? {} }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    function Wired() {
      const controller = useCanvasStyleSettings({ saveDelayMs: 5 });
      return (
        <StyleRail
          settings={controller.settings}
          style={controller.style}
          overrides={controller.overrides}
          onSelectTheme={controller.setTheme}
          onChange={controller.setToken}
          onResetKey={controller.resetToken}
          onResetTheme={controller.resetTheme}
          onClose={() => {}}
        />
      );
    }
    act(() => root.render(<Wired />));
    const lastSaved = () =>
      (calls.filter((call) => call.method === "PUT").at(-1)?.body as { settings: CanvasStyleSettings } | undefined)
        ?.settings;
    return { calls, lastSaved };
  }

  const settle = (ms = 25) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

  it("switching theme saves the new theme and swaps the rows to that theme", async () => {
    const { lastSaved } = renderWired({ theme: "figjam", themes: { figjam: { shapeCornerRadiusPx: 6 } } });
    await settle();
    expandGroup("sections");
    expect(byLabel("Sections tint")).toBeNull();
    act(() => $<HTMLInputElement>('[aria-label="Theme"] input[value="schematic-dark"]')!.click());
    await settle();
    expect(lastSaved()).toEqual({ theme: "schematic-dark", themes: { figjam: { shapeCornerRadiusPx: 6 } } });
    // Schematic dark is layer-cake: the tint rows appear, at that theme's values.
    expect(byLabel("Sections tint")!.value).toBe("0.1");
  });

  it("editing a number, a color, and a select token saves overrides; reset clears them", async () => {
    const { lastSaved } = renderWired({ theme: "schematic-light", themes: {} });
    await settle();
    expandGroup("sections");
    expandGroup("palette");
    act(() => typeInto(byLabel("Sections tint")!, 0.12));
    act(() => typeInto(byLabel("Palette teal")!, "#0F6A5E"));
    act(() => $('[role="radiogroup"][aria-label="Sections header"] input[value="floating"]')!.click());
    await settle();
    expect(lastSaved()).toEqual({
      theme: "schematic-light",
      themes: {
        "schematic-light": { sectionTintBase: 0.12, headerPlacement: "floating", palette: { teal: "#0F6A5E" } },
      },
    });

    act(() => $<HTMLButtonElement>('button[aria-label="Reset Sections tint to the theme default"]')!.click());
    await settle();
    expect(lastSaved()!.themes["schematic-light"]).toEqual({
      headerPlacement: "floating",
      palette: { teal: "#0F6A5E" },
    });

    act(() =>
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Reset theme")!.click(),
    );
    await settle();
    expect(lastSaved()).toEqual({ theme: "schematic-light", themes: {} });
  });
});
