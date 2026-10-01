import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import {
  CANVAS_STYLE_CONTROLS,
  DEFAULT_CANVAS_STYLE,
  FIGJAM_CANVAS_STYLE,
  canvasThemePreset,
  normalizeCanvasStyle,
} from "../canvas-style";
import {
  CANVAS_STYLE_JS_ONLY_KEYS,
  CanvasStyleProvider,
  canvasStyleCssVar,
  canvasStyleCssVariables,
  useCanvasStyle,
} from "../canvas-style-context";
import { renderDocumentToSvg } from "../../render/static-svg";
import { CanvasStage } from "../../stage/CanvasStage";
import type { InteractiveCanvasDocument } from "../../state/schema";

afterEach(() => {
  cleanup();
});

/** One titled section holding a rounded-rect process. */
function styleFixture(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "canvas-style-fixture",
    mode: "diagram",
    objects: [
      {
        id: "sec",
        type: "section",
        text: "Zone",
        geometry: { x: 0, y: 0, width: 400, height: 300 },
        style: { shape: "section" },
      },
      {
        id: "p",
        type: "process",
        text: "",
        parentId: "sec",
        geometry: { x: 40, y: 80, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
    ],
    connections: [],
  };
}

describe("normalizeCanvasStyle", () => {
  it("fills defaults for missing keys and non-object input", () => {
    expect(normalizeCanvasStyle(undefined)).toEqual({ ...DEFAULT_CANVAS_STYLE });
    expect(normalizeCanvasStyle(null)).toEqual({ ...DEFAULT_CANVAS_STYLE });
    expect(normalizeCanvasStyle([3, 4])).toEqual({ ...DEFAULT_CANVAS_STYLE });
    expect(normalizeCanvasStyle({ shapeCornerRadiusPx: 6 })).toEqual({
      ...DEFAULT_CANVAS_STYLE,
      shapeCornerRadiusPx: 6,
    });
  });

  it("clamps to the control ranges and drops junk values and unknown keys", () => {
    const normalized = normalizeCanvasStyle({
      shapeCornerRadiusPx: 999, // max 24
      shapeBorderWidthPx: 0, // min 0.5
      sectionCornerRadiusPx: "8", // not a number
      sectionBorderWidthPx: Number.NaN,
      connectorStrokeWidthPx: Number.POSITIVE_INFINITY,
      bogusKey: 7,
    });
    expect(normalized).toEqual({
      ...DEFAULT_CANVAS_STYLE,
      shapeCornerRadiusPx: 24,
      shapeBorderWidthPx: 0.5,
    });
    expect("bogusKey" in normalized).toBe(false);
  });
});

describe("renderDocumentToSvg canvasStyle", () => {
  it("without a canvasStyle renders the default theme, schematic-light", () => {
    const { svg } = renderDocumentToSvg(styleFixture(), { background: "transparent" });
    const schematic = renderDocumentToSvg(styleFixture(), {
      background: "transparent",
      canvasStyle: canvasThemePreset("schematic-light"),
    }).svg;
    expect(svg).toBe(schematic);
    // Layer-cake section frame (1.5px border at half opacity) and a card shape with a 2px ink border,
    // rounded at the process radius (rx = 12 − 1).
    expect(svg).toContain('stroke="rgba(91, 101, 120, 0.5)" stroke-width="1.5"');
    expect(svg).toContain('rx="11" fill="#FFFFFF" stroke="#5B6578" stroke-width="2"');
    expect(svg).not.toBe(
      renderDocumentToSvg(styleFixture(), { background: "transparent", canvasStyle: FIGJAM_CANVAS_STYLE }).svg,
    );
  });

  it("figjam: section rx 2, shape stroke 2 with rx 1 (2px radius − 1px half-stroke)", () => {
    const { svg } = renderDocumentToSvg(styleFixture(), { background: "transparent", canvasStyle: FIGJAM_CANVAS_STYLE });
    // Section backdrop: inset by half its 1.5px border, rx = section radius.
    expect(svg).toContain('x="0.75" y="0.75" width="398.5" height="298.5" rx="2"');
    expect(svg).toContain('rx="1" fill="#E6E6E6" stroke="#757575" stroke-width="2"');
  });

  it("a non-default style changes the section radius/border, shape border/radius and chip", () => {
    const { svg } = renderDocumentToSvg(styleFixture(), {
      background: "transparent",
      canvasStyle: {
        theme: "figjam",
        sectionCornerRadiusPx: 12,
        sectionBorderWidthPx: 4,
        shapeCornerRadiusPx: 10,
        processCornerRadiusPx: 10,
        shapeBorderWidthPx: 6,
        titleChipCornerRadiusPx: 5,
        titleChipBorderWidthPx: 3,
      },
    });
    // Section frame: inset by half the 4px border, rx 12.
    expect(svg).toContain('x="2" y="2" width="396" height="296" rx="12"');
    expect(svg).toContain('stroke-width="4"');
    // Shape (a rounded-rect process, so its radius is processCornerRadiusPx): inset by half the
    // 6px border; rx = 10 − 3.
    expect(svg).toContain('x="43" y="83" width="154" height="74" rx="7"');
    expect(svg).toContain('stroke-width="6"');
    // Title chip radius and border.
    expect(svg).toContain('rx="5"');
    expect(svg).toContain('stroke-width="3"');
    // No default-style radii leak through.
    expect(svg).not.toContain('rx="2"');
    expect(svg).not.toContain('rx="1"');
  });

  it("per-object strokeWidth still overrides the style's shape border", () => {
    const doc = styleFixture();
    doc.objects[1] = { ...doc.objects[1]!, style: { shape: "rounded-rect", strokeWidth: 8 } };
    const { svg } = renderDocumentToSvg(doc, {
      background: "transparent",
      canvasStyle: { shapeBorderWidthPx: 6 },
    });
    expect(svg).toContain('stroke-width="8"');
    expect(svg).not.toContain('stroke-width="6"');
  });
});

describe("connector canvasStyle", () => {
  /** Two offset processes joined by an elbow connector (one rounded bend pair). */
  function elbowDocument(): InteractiveCanvasDocument {
    return {
      schemaVersion: 1,
      id: "elbow-fixture",
      mode: "diagram",
      objects: [
        { id: "a", type: "process", text: "", geometry: { x: 0, y: 0, width: 120, height: 80 }, style: { shape: "rounded-rect" } },
        { id: "b", type: "process", text: "", geometry: { x: 320, y: 240, width: 120, height: 80 }, style: { shape: "rounded-rect" } },
      ],
      connections: [{ id: "c", from: { objectId: "a", anchor: "right" }, to: { objectId: "b", anchor: "left" } }],
    };
  }

  function connectorPath(svg: string): string {
    return /<path d="([^"]+)" fill="none"/.exec(svg)![1]!;
  }

  it("routes bends with the style's radius and strokes with its line width", () => {
    const defaults = renderDocumentToSvg(elbowDocument(), { canvasStyle: FIGJAM_CANVAS_STYLE }).svg;
    expect(connectorPath(defaults)).toContain(" Q ");
    expect(defaults).toContain('stroke-width="4" stroke-linecap="butt"');

    const square = renderDocumentToSvg(elbowDocument(), {
      canvasStyle: { connectorCornerRadiusPx: 0, connectorStrokeWidthPx: 1.5 },
    }).svg;
    // Radius 0: sharp corners, same polyline vertices.
    expect(connectorPath(square)).not.toContain(" Q ");
    expect(square).toContain('stroke-width="1.5" stroke-linecap="butt"');
  });
});

describe("CanvasStyleProvider / CanvasStage canvasStyle", () => {
  function StyleProbe() {
    const style = useCanvasStyle();
    return <span data-probe={`${style.shapeCornerRadiusPx}/${style.shapeBorderWidthPx}`} />;
  }

  it("returns the default theme (schematic-light) without a provider", () => {
    function ThemeProbe() {
      const style = useCanvasStyle();
      return <span data-probe={style.theme} />;
    }
    const { container } = render(<ThemeProbe />);
    expect(container.querySelector("[data-probe]")!.getAttribute("data-probe")).toBe("schematic-light");
  });

  it("returns the defaults without a provider and merges nested partial overrides", () => {
    const { container } = render(
      <>
        <StyleProbe />
        <CanvasStyleProvider value={{ shapeCornerRadiusPx: 9 }}>
          <StyleProbe />
          <CanvasStyleProvider value={{ shapeBorderWidthPx: 999 }}>
            <StyleProbe />
          </CanvasStyleProvider>
          <CanvasStyleProvider>
            <StyleProbe />
          </CanvasStyleProvider>
        </CanvasStyleProvider>
      </>,
    );
    const probes = [...container.querySelectorAll("[data-probe]")].map((node) =>
      node.getAttribute("data-probe"),
    );
    // Default (schematic-light: radius 2, border 2); override; inherited radius + clamped
    // border (max 8); inherit-only provider.
    expect(probes).toEqual(["2/2", "9/2", "9/8", "9/2"]);
  });

  it("a value naming another theme starts from that theme's preset, not the parent's tokens", () => {
    function ThemeProbe() {
      const style = useCanvasStyle();
      return (
        <span
          data-probe={`${style.theme}|${style.shapeCornerRadiusPx}|${style.boardBackground}|${style.palette.teal}|${style.palette.red}`}
        />
      );
    }
    const { container } = render(
      <CanvasStyleProvider value={{ theme: "figjam", shapeCornerRadiusPx: 9, boardBackground: "#000000" }}>
        <CanvasStyleProvider value={{ theme: "schematic-dark", palette: { teal: "#00AA88" } }}>
          <ThemeProbe />
        </CanvasStyleProvider>
        <CanvasStyleProvider value={{ theme: "figjam", palette: { teal: "#00AA88" } }}>
          <ThemeProbe />
        </CanvasStyleProvider>
      </CanvasStyleProvider>,
    );
    const probes = [...container.querySelectorAll("[data-probe]")].map((node) =>
      node.getAttribute("data-probe"),
    );
    expect(probes).toEqual([
      "schematic-dark|2|#14171F|#00AA88|#FD8A8A",
      // Same theme as the parent: merged over the parent's tokens, inks one by one.
      "figjam|9|#000000|#00AA88|#D5322F",
    ]);
  });

  it("drives the stage's object borders, section frame and CSS custom properties", () => {
    const { container } = render(
      <CanvasStage
        document={styleFixture()}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        canvasStyle={{ shapeBorderWidthPx: 3, sectionCornerRadiusPx: 7, sectionBorderWidthPx: 2.5 }}
      />,
    );
    const stage = container.querySelector<HTMLElement>("[data-canvas-stage]")!;
    expect(stage.style.getPropertyValue("--canvas-section-radius")).toBe("7px");
    expect(stage.style.getPropertyValue("--canvas-shape-radius")).toBe("2px");
    const shape = container.querySelector<HTMLElement>('[data-canvas-object-id="p"]')!;
    expect(shape.style.borderWidth).toBe("3px");
    const section = container.querySelector<HTMLElement>('button[data-canvas-object-id="sec"]')!;
    expect(section.style.borderRadius).toBe("7px");
    expect(section.style.borderWidth).toBe("2.5px");
  });
});

describe("canvasStyleCssVariables / canvasStyleCssVar", () => {
  it("emits the original six variables plus one per color/number token and one per ink", () => {
    const variables = canvasStyleCssVariables(canvasThemePreset("schematic-dark"));
    expect(variables["--canvas-section-radius"]).toBe("2px");
    expect(variables["--canvas-title-chip-border"]).toBe("1.5px");
    expect(variables["--canvas-board-background"]).toBe("#14171F");
    expect(variables["--canvas-grid-dot-color"]).toBe("rgba(255, 255, 255, 0.07)");
    expect(variables["--canvas-connector-stroke-width-px"]).toBe("2px");
    expect(variables["--canvas-section-border-opacity"]).toBe("0.5");
    expect(variables["--canvas-text-font-weight"]).toBe("600");
    expect(variables["--canvas-ink-teal"]).toBe("#5DE4C7");
    const jsOnlyKeys = new Set<string>(CANVAS_STYLE_JS_ONLY_KEYS);
    const tokenControls = CANVAS_STYLE_CONTROLS.filter(
      (control) =>
        control.key !== "palette" &&
        (control.kind === "color" || control.kind === "number") &&
        !jsOnlyKeys.has(control.key),
    );
    // 6 legacy + every color/number token but the JS-only ones + 10 inks.
    expect(Object.keys(variables)).toHaveLength(6 + tokenControls.length + 10);
    for (const key of CANVAS_STYLE_JS_ONLY_KEYS) {
      expect(variables[`--canvas-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`]).toBeUndefined();
    }
  });

  it("reads the legacy variable names for the original keys and kebab names for the rest", () => {
    // The literal fallbacks are the figjam values (a stage always sets every variable).
    expect(canvasStyleCssVar("shapeCornerRadiusPx")).toBe("var(--canvas-shape-radius, 2px)");
    expect(canvasStyleCssVar("titleChipBorderWidthPx")).toBe("var(--canvas-title-chip-border, 1.5px)");
    expect(canvasStyleCssVar("boardBackground")).toBe("var(--canvas-board-background, #F5F5F5)");
    expect(canvasStyleCssVar("connectorLabelHeightPx")).toBe("var(--canvas-connector-label-height-px, 30px)");
  });
});
