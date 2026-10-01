import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CanvasStage } from "../CanvasStage";
import { TextEditingOverlay } from "../editor/features/text-editing/TextEditingOverlay";
import type { TextEditingApi } from "../editor/features/text-editing/use-text-editing";
import { renderDocumentToSvg } from "../../render/static-svg";
import type { CanvasThemeId } from "../../theme/canvas-style";
import type { InteractiveCanvasDocument } from "../../state/schema";

/**
 * Sections, board, connectors, and stickies under the schematic themes —
 * live stage AND static SVG (contract §4: they must agree). Expected numbers
 * are worked from the theme tables; live-vs-static checks compare the two
 * renderers' own output.
 */

afterEach(() => {
  cleanup();
});

/** Teal nested three deep (same-hue layer cake), a labelled edge, a sticky. */
function themedDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "theme-board",
    mode: "diagram",
    objects: [
      {
        id: "outer",
        type: "section",
        text: "Bun services",
        icon: "brand-bun",
        detail: "127.0.0.1",
        color: "teal",
        geometry: { x: 100, y: 80, width: 700, height: 500 },
        style: { shape: "section" },
      },
      {
        id: "middle",
        type: "section",
        text: "Sandbox",
        color: "teal",
        parentId: "outer",
        geometry: { x: 140, y: 140, width: 600, height: 400 },
        style: { shape: "section", strokeStyle: "dashed" },
      },
      {
        id: "inner",
        type: "section",
        text: "Jail",
        color: "teal",
        parentId: "middle",
        geometry: { x: 180, y: 200, width: 500, height: 300 },
        style: { shape: "section" },
      },
      { id: "a", type: "process", text: "A", parentId: "inner", geometry: { x: 220, y: 260, width: 120, height: 64 } },
      { id: "b", type: "process", text: "B", parentId: "inner", geometry: { x: 520, y: 260, width: 120, height: 64 } },
      {
        id: "note",
        type: "sticky",
        text: "Read-only `fs`",
        color: "yellow",
        geometry: { x: 900, y: 80, width: 240, height: 160 },
        style: { shape: "note" },
      },
    ],
    connections: [
      { id: "edge", from: { objectId: "a", anchor: "right" }, to: { objectId: "b", anchor: "left" }, label: "HTTP" },
    ],
  };
}

function renderLive(theme: CanvasThemeId) {
  return render(
    <CanvasStage document={themedDocument()} viewport={{ x: 0, y: 0, zoom: 1 }} canvasStyle={{ theme }} />,
  ).container;
}

function staticSvg(theme: CanvasThemeId): string {
  return renderDocumentToSvg(themedDocument(), { canvasStyle: { theme } }).svg;
}

function attributesOf(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]));
}

/** The static <rect> tags whose x/y put them at a section's frame (inset by half the stroke). */
function staticSectionFill(svg: string, x: number, y: number, inset: number): string | undefined {
  for (const match of svg.matchAll(/<rect [^>]*\/>/g)) {
    const attributes = attributesOf(match[0]);
    if (Number(attributes.x) === x + inset && Number(attributes.y) === y + inset) return attributes.fill;
  }
  return undefined;
}

describe("board surface", () => {
  it("live and static paint the theme's board color; the live grid dots take its dot color", () => {
    const stage = renderLive("schematic-dark").querySelector<HTMLElement>("[data-canvas-stage]")!;
    expect(stage.style.backgroundColor).toBe("#14171F");
    expect(stage.style.backgroundImage).toContain("rgba(255, 255, 255, 0.07)");
    expect(staticSvg("schematic-dark")).toContain('fill="#14171F"/>');
  });
});

describe.each(["schematic-light", "schematic-dark"] as const)("layer-cake sections (%s)", (theme) => {
  it("same-hue nesting deepens per level, and live fills equal static fills", () => {
    const container = renderLive(theme);
    const svg = staticSvg(theme);
    const live = ["outer", "middle", "inner"].map(
      (id) => container.querySelector<HTMLElement>(`button[data-canvas-object-id="${id}"]`)!.style.background,
    );
    expect(new Set(live).size).toBe(3);
    // Static: solid frames inset by half their 1.5px border; the dashed frame too.
    expect([staticSectionFill(svg, 100, 80, 0.75), staticSectionFill(svg, 140, 140, 0.75), staticSectionFill(svg, 180, 200, 0.75)]).toEqual(
      live.map((background) => background.toUpperCase()),
    );
  });
});

describe("pinned title chip with icon + detail", () => {
  it("live: flush inside the 1.5px frame, right + bottom edges, the icon tile, the uppercased title, the detail run", () => {
    const chip = renderLive("schematic-light").querySelector<HTMLElement>('[data-canvas-section-title-chip="outer"]')!;
    expect(chip.style.left).toBe("101.5px");
    expect(chip.style.top).toBe("81.5px");
    // 27px outer extent from the section's top edge, less the 1.5px frame.
    expect(chip.style.height).toBe("25.5px");
    expect(chip.style.borderWidth).toBe("0px 1.5px 1.5px 0px");
    expect(chip.style.borderTopLeftRadius).toBe("0.5px");
    expect(chip.style.borderTopRightRadius).toBe("0px");
    expect(chip.style.borderBottomRightRadius).toBe("2px");
    expect(chip.style.borderBottomLeftRadius).toBe("0px");
    expect(chip.style.padding).toBe("0px 10px 0px 6px");
    expect(chip.style.textTransform).toBe("uppercase");
    expect(chip.style.fontFamily).toContain("IBM Plex Mono");
    const [icon, title] = [...chip.children];
    expect(icon?.getAttribute("data-canvas-section-icon")).toBe("brand-bun");
    expect(title?.textContent).toBe("Bun services127.0.0.1");
    const detail = chip.querySelector<HTMLElement>("[data-canvas-section-detail]")!;
    expect(detail.textContent).toBe("127.0.0.1");
    expect(detail.style.marginLeft).toBe("10px");
    expect(detail.style.textTransform).toBe("none");
  });

  it("static: the same box at the same origin, edges, icon, and runs", () => {
    const svg = staticSvg("schematic-light");
    // Fill path from the frame's inner corner (0.5px radius) at (101.5, 81.5).
    expect(svg).toContain('<path d="M102 81.5H');
    // Title at box x + 28 (6 lead + 16 tile + 6 gap), centered in the 25.5px box less its bottom edge.
    expect(svg).toContain('x="129.5" y="93.5" fill="#0F1E36" font-size="14" font-weight="600"');
    expect(svg).toMatch(/>BUN SERVICES<\/text>/);
    // Detail 10px after the 114.24px title.
    expect(svg).toContain(`x="${Math.round((101.5 + 28 + 12 * 0.68 * 14 + 10) * 100) / 100}" y="93.5"`);
    expect(svg).toMatch(/font-weight="400"[^>]*>127\.0\.0\.1<\/text>/);
    // The 16px tile sits 6px in, centered on the content line (93.5); the glyph is 11px inside it.
    expect(svg).toContain('<rect x="107.5" y="85.5" width="16" height="16" rx="2" fill="#0F8A7A"/>');
    expect(svg).toContain('transform="translate(110 88) scale(0.4583)"');
    // Only the right and bottom edges are stroked, inside the box like a CSS border.
    expect(svg).toMatch(/<path d="M340\.09 81\.5V105A1\.25 1\.25 0 0 1 338\.84 106\.25H101\.5" fill="none" stroke="rgba\(15, 138, 122, 0\.5\)" stroke-width="1\.5"/);
  });

  it("figjam keeps the floating chip markup for a plain title (live and static)", () => {
    const plain: InteractiveCanvasDocument = {
      ...themedDocument(),
      objects: themedDocument().objects.map((object) =>
        object.id === "outer" ? { ...object, icon: undefined, detail: undefined } : object,
      ),
    };
    const { container } = render(
      <CanvasStage document={plain} viewport={{ x: 0, y: 0, zoom: 1 }} canvasStyle={{ theme: "figjam" }} />,
    );
    const chip = container.querySelector<HTMLElement>('[data-canvas-section-title-chip="outer"]')!;
    expect(chip.style.left).toBe("103px");
    expect(chip.getAttribute("style")).not.toContain("height");
    expect(chip.innerHTML).toBe("<span>Bun services</span>");
    expect(renderDocumentToSvg(plain, { canvasStyle: { theme: "figjam" } }).svg).toContain(
      'x="103.75" y="83.75" width="140.54" height="25.5" rx="2" fill="#C6FAF6" stroke="#369E94" stroke-width="1.5"',
    );
  });
});

describe("in-place section title editor", () => {
  /** The stage with the title editor open on `outer` (its at-rest chip hidden, as in the editor). */
  function editing(theme?: CanvasThemeId) {
    const document = themedDocument();
    const target = document.objects.find((object) => object.id === "outer")!;
    const noop = () => undefined;
    const textEditing = {
      labelEditConnectionId: null,
      labelEditValue: "",
      setLabelEditValue: noop,
      labelEditPoint: null,
      openConnectionLabelEditor: noop,
      commitConnectionLabel: noop,
      cancelConnectionLabelEdit: noop,
      objectTextEditId: target.id,
      setObjectTextEditId: noop,
      objectTextEditValue: target.text,
      setObjectTextEditValue: noop,
      objectTextEditTarget: target,
      openObjectTextEditor: noop,
      commitObjectText: noop,
      cancelObjectTextEdit: noop,
    } as TextEditingApi;
    const { container } = render(
      <CanvasStage
        document={document}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        canvasStyle={theme ? { theme } : undefined}
        editingTextObjectId={target.id}
        worldOverlay={<TextEditingOverlay textEditing={textEditing} zoom={1} />}
      />,
    );
    return container.querySelector<HTMLInputElement>('input[data-canvas-section-title-editor="outer"]')!;
  }

  it("pinned: the input takes the chip's box and edges, and its text starts where the title does (past the icon)", () => {
    const input = editing("schematic-light");
    expect(input.style.left).toBe("101.5px");
    expect(input.style.top).toBe("81.5px");
    expect(input.style.height).toBe("25.5px");
    expect(input.style.borderWidth).toBe("0px 1.5px 1.5px 0px");
    expect(input.style.padding).toBe("0px 10px 0px 28px");
    expect(input.style.fontFamily).toContain("IBM Plex Mono");
    expect(input.style.textTransform).toBe("uppercase");
    // The chip fill at its depth — the same color the static chip paints.
    expect(input.style.background).toBe("#CAE6E2");
    expect(staticSvg("schematic-light")).toContain('fill="#CAE6E2"/>');
  });

  it("floating (figjam): the original inset chip editor", () => {
    const input = editing("figjam");
    expect(input.style.left).toBe("103px");
    expect(input.style.top).toBe("83px");
    expect(input.style.height).toBe("27px");
    // The section's icon pushes the title past a 16px glyph + 6px gap.
    expect(input.style.padding).toBe("0px 10px 0px 28px");
  });
});

describe("connector label chip per theme", () => {
  it("schematic: a 26px mono chip sized 0.6em per glyph + 0.5em padding a side, live == static", () => {
    // "HTTP" at 14px: 4 × 8.4 + 2 × 7 = 47.6 wide.
    const container = renderLive("schematic-light");
    const rect = container.querySelector('[data-canvas-connection-label="edge"] rect')!;
    expect(Number(rect.getAttribute("width"))).toBeCloseTo(47.6, 9);
    expect(rect.getAttribute("height")).toBe("26");
    expect(rect.getAttribute("fill")).toBe("#F6F8FA");
    expect(rect.getAttribute("stroke")).toBe("#D5DBE3");
    const text = container.querySelector('[data-canvas-connection-label="edge"] text')!;
    expect(text.getAttribute("font-family")).toContain("IBM Plex Mono");
    expect(text.getAttribute("fill")).toBe("#3A4659");
    expect(text.getAttribute("font-size")).toBe("14");
    expect(text.getAttribute("font-weight")).toBe("500");

    const svg = staticSvg("schematic-light");
    const chip = [...svg.matchAll(/<rect ([^>]*?)\/><text ([^>]*)>HTTP<\/text>/g)][0]!;
    expect(attributesOf(chip[1]!)).toMatchObject({ width: "47.6", height: "26", fill: "#F6F8FA", stroke: "#D5DBE3" });
    expect(attributesOf(chip[2]!)).toMatchObject({ fill: "#3A4659", "font-size": "14", "font-weight": "500" });
  });

  it("figjam: the 30px sans chip with black text (live now matches static)", () => {
    const container = renderLive("figjam");
    const rect = container.querySelector('[data-canvas-connection-label="edge"] rect')!;
    expect(rect.getAttribute("width")).toBe(String(4 * 9.6 + 24));
    expect(rect.getAttribute("height")).toBe("30");
    const text = container.querySelector('[data-canvas-connection-label="edge"] text')!;
    expect(text.getAttribute("fill")).toBe("#000000");
    expect(text.hasAttribute("font-family")).toBe(false);
  });
});

describe("card stickies", () => {
  it("live: card fill, hairline edge and 2px ink rule as inset shadows, no paper shadow", () => {
    const note = renderLive("schematic-light").querySelector<HTMLElement>('[data-canvas-object-id="note"]')!;
    expect(note.style.background).toBe("#FFFFFF");
    expect(note.style.boxShadow).toBe("inset 2px 0 0 0 #A87A00, inset 0 0 0 1px #D5DBE3");
  });

  it("static: the same card, edge, and rule — and no shadow filter", () => {
    const svg = staticSvg("schematic-light");
    expect(svg).not.toContain("feDropShadow");
    expect(svg).toContain('<rect x="900" y="80" width="240" height="160" fill="#FFFFFF"/>');
    expect(svg).toContain('<rect x="900.5" y="80.5" width="239" height="159" fill="none" stroke="#D5DBE3" stroke-width="1"/>');
    expect(svg).toContain('<rect x="900" y="80" width="2" height="160" fill="#A87A00"/>');
  });

  it("paper stickies keep the shadow and the note CSS (no inline trim)", () => {
    const container = renderLive("figjam");
    const note = container.querySelector<HTMLElement>('[data-canvas-object-id="note"]')!;
    expect(note.style.boxShadow).toBe("");
    expect(staticSvg("figjam")).toContain("feDropShadow");
  });
});
