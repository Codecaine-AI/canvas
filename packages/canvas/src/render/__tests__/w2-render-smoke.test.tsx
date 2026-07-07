import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import v2FlowElementsDocumentJson from "../../../../../canvases/v2-flow-elements.canvas.json";
import { InteractiveCanvasViewer } from "../../editor/InteractiveCanvasViewer";
import { CanvasStage } from "../CanvasStage";
import { OBJECT_DEFS_CSS } from "../../objects/object-def";
import { sectionTitleScale } from "../../objects/section/def";
import type { InteractiveCanvasDocument } from "../../state/schema";

const v2FlowElementsDocument = v2FlowElementsDocumentJson as InteractiveCanvasDocument;

afterEach(() => {
  cleanup();
});

/**
 * jsdom/happy-dom performs no real layout, so getBoundingClientRect() on the
 * measured `.interactive-canvas-shell` element returns all-zero by default —
 * same mock pattern as viewer-view-crop.test.tsx.
 */
function withMeasuredShell<T>(width: number, height: number, run: () => T): T {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if ((this as HTMLElement).classList.contains("interactive-canvas-shell")) {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width,
        height,
        right: width,
        bottom: height,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };
  try {
    return run();
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
}

const SCREEN = { width: 1600, height: 900 };

const sectionTitleScaleDocument: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "section-title-scale-smoke",
  title: "Section title scale smoke",
  mode: "diagram",
  size: { width: 2400, height: 800 },
  viewport: { x: 0, y: 0, zoom: 1 },
  objects: [
    {
      id: "wide-section",
      type: "section",
      label: "Readable section",
      title: "Readable section",
      tint: "blue",
      geometry: { x: 100, y: 80, width: 2000, height: 560 },
    },
  ],
  connections: [],
};

describe("W2 render smoke: every new object type renders without throwing", () => {
  it("renders one of each new W2 shape/section type", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      for (const object of v2FlowElementsDocument.objects) {
        const node = container.querySelector(`[data-canvas-object-id="${object.id}"]`);
        expect(node).toBeTruthy();
      }
    });
  });

  it("renders sections with a title chip showing their `title` (not `label`)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      const outer = container.querySelector('[data-canvas-object-id="outer-section"]') as HTMLElement | null;
      expect(outer).toBeTruthy();
      expect(outer!.textContent).toContain("Memory pipeline");

      const inner = container.querySelector('[data-canvas-object-id="inner-section"]') as HTMLElement | null;
      expect(inner).toBeTruthy();
      expect(inner!.textContent).toContain("New memory");
    });
  });

  it("counter-scales section title chips only when zoomed out", () => {
    const identity = render(
      <CanvasStage document={sectionTitleScaleDocument} viewport={{ x: 0, y: 0, zoom: 1 }} />,
    );
    const naturalChip = identity.container.querySelector(
      "[data-canvas-section-title-chip='wide-section']",
    ) as HTMLElement | null;
    expect(naturalChip).toBeTruthy();
    expect(naturalChip!.style.transform).toBe("");
    expect(naturalChip!.getAttribute("style")).not.toContain("transform");
    identity.unmount();

    const zoomedOut = render(
      <CanvasStage document={sectionTitleScaleDocument} viewport={{ x: 0, y: 0, zoom: 0.25 }} />,
    );
    const scaledChip = zoomedOut.container.querySelector(
      "[data-canvas-section-title-chip='wide-section']",
    ) as HTMLElement | null;
    expect(scaledChip).toBeTruthy();
    const expectedScale = sectionTitleScale(0.25);
    expect(expectedScale).toBeGreaterThan(1);
    expect(scaledChip!.style.transform).toBe(`scale(${expectedScale})`);
    // Width budget: the scaled chip may span the section's inner width
    // (2000 - 2*3 inset) but no further; overflow ellipsizes via CSS.
    expect(scaledChip!.style.maxWidth).toBe(`${(2000 - 6) / expectedScale}px`);
  });

  it("renders explicit section fill and dashed border style", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const document = {
        ...v2FlowElementsDocument,
        objects: v2FlowElementsDocument.objects.map((object) =>
          object.id === "outer-section"
            ? {
                ...object,
                style: { ...object.style, fill: "#C2E5FF", stroke: "#3DADFF", strokeStyle: "dashed" as const },
              }
            : object,
        ),
      };
      const { container } = render(<InteractiveCanvasViewer document={document} />);
      const section = container.querySelector('[data-canvas-object-id="outer-section"]') as HTMLElement | null;

      expect(section?.style.background).toBe("#C2E5FF");
      expect(section?.style.borderColor).toBe("#3DADFF");
      expect(section?.style.borderStyle).toBe("dashed");
      expect(section?.querySelector("[data-section-border-dash] rect")?.getAttribute("stroke-dasharray")).toBe("19 7");
    });
  });

  it("renders section strokeStyle none without a border", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const document = {
        ...v2FlowElementsDocument,
        objects: v2FlowElementsDocument.objects.map((object) =>
          object.id === "outer-section"
            ? { ...object, style: { ...object.style, strokeStyle: "none" as const } }
            : object,
        ),
      };
      const { container } = render(<InteractiveCanvasViewer document={document} />);
      const section = container.querySelector('[data-canvas-object-id="outer-section"]') as HTMLElement | null;

      expect(section?.style.borderStyle).toBe("none");
      expect(section?.style.borderWidth).toBe("0px");
    });
  });

  it("hides captured member objects while section contentHidden is true", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const document = {
        ...v2FlowElementsDocument,
        objects: v2FlowElementsDocument.objects.map((object) =>
          object.id === "outer-section" ? { ...object, contentHidden: true } : object,
        ),
      };
      const { container } = render(<InteractiveCanvasViewer document={document} />);

      expect(container.querySelector('[data-canvas-object-id="outer-section"]')).toBeTruthy();
      expect(container.querySelector('[data-canvas-object-id="captured-pill"]')).toBeFalsy();
    });
  });

  it("renders sections below non-section objects in DOM order", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      const allObjectNodes = Array.from(container.querySelectorAll("[data-canvas-object-id]"));
      const sectionIndex = allObjectNodes.findIndex(
        (node) => node.getAttribute("data-canvas-object-id") === "outer-section",
      );
      const pillIndex = allObjectNodes.findIndex(
        (node) => node.getAttribute("data-canvas-object-id") === "captured-pill",
      );
      expect(sectionIndex).toBeGreaterThanOrEqual(0);
      expect(pillIndex).toBeGreaterThanOrEqual(0);
      expect(sectionIndex).toBeLessThan(pillIndex);
    });
  });

  it("renders the chip-icon silhouette", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);
      const chipSvg = container.querySelector('[data-canvas-shape-silhouette="chip-icon"]');
      expect(chipSvg).toBeTruthy();
    });
  });

  it("registers the icon-shape chrome-strip so Advanced glyphs render without the generic box", () => {
    // The glyph IS the shape (brief's "bbox" tier): the button chrome must go
    // fully transparent, like chip-icon/person. `!important` is load-bearing —
    // it has to beat objectStyle's inline `background: colors.fill`.
    const iconRule = OBJECT_DEFS_CSS.match(/\.interactive-canvas-object-icon\s*\{[^}]*\}/)?.[0];
    expect(iconRule).toBeTruthy();
    expect(iconRule).toContain("border: none");
    expect(iconRule).toContain("background: transparent !important");
  });

  it("renders the restyled person/chat labels BELOW the icon, not overlaid", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      const person = container.querySelector('[data-canvas-object-id="restyled-person"]');
      expect(person?.querySelector(".interactive-canvas-label-below-icon")?.textContent).toBe("Interviewee");

      const chat = container.querySelector('[data-canvas-object-id="restyled-chat"]');
      expect(chat?.querySelector(".interactive-canvas-label-below-icon")?.textContent).toBe("Live Q&A");
    });
  });

  it("hides the compact person's label under 100px height", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);
      const compactPerson = container.querySelector('[data-canvas-object-id="compact-person"]');
      expect(compactPerson?.querySelector(".interactive-canvas-label-below-icon")).toBeNull();
    });
  });

  it("renders sticky bullet lines without the author chip", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      const sticky = container.querySelector('[data-canvas-object-id="partial-overlap-note"]') as HTMLElement | null;
      expect(sticky).toBeTruthy();

      const author = sticky!.querySelector(".interactive-canvas-sticky-author");
      expect(author).toBeNull();

      const bulletLines = sticky!.querySelectorAll('.interactive-canvas-sticky-line[data-bullet="true"]');
      expect(bulletLines.length).toBe(2);
      expect(bulletLines[0]?.textContent).toBe("bullet one");
      expect(bulletLines[1]?.textContent).toBe("bullet two");
    });
  });

  it("renders the code-block with a line-number gutter and tokenized spans", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      const codeBlock = container.querySelector('[data-canvas-object-id="captured-code-block"]') as HTMLElement | null;
      expect(codeBlock).toBeTruthy();

      const lineNumbers = codeBlock!.querySelectorAll(".interactive-canvas-code-block-line-number");
      expect(lineNumbers.length).toBe(5);
      expect(lineNumbers[0]?.textContent).toBe("1");

      expect(codeBlock!.textContent).toContain("class Agent(BaseModel):");
    });
  });

  it("renders arrow-shape objects pointing in their configured direction", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);

      const rightArrow = container.querySelector('[data-canvas-object-id="outside-arrow"] .interactive-canvas-arrow-shape-silhouette') as SVGElement | null;
      const leftArrow = container.querySelector('[data-canvas-object-id="outside-arrow-left"] .interactive-canvas-arrow-shape-silhouette') as SVGElement | null;
      expect(rightArrow).toBeTruthy();
      expect(leftArrow).toBeTruthy();
      // W4 — the silhouette SVG traces the full 7-point chevron in the object's direction.
      expect(rightArrow!.getAttribute("data-canvas-arrow-direction")).toBe("right");
      expect(leftArrow!.getAttribute("data-canvas-arrow-direction")).toBe("left");
      const rightPolygon = rightArrow!.querySelector("polygon");
      expect(rightPolygon?.getAttribute("points")?.split(" ").length).toBe(7);
    });
  });

  it("renders predefined-process's two inner bars", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={v2FlowElementsDocument} />);
      const node = container.querySelector('[data-canvas-object-id="predefined-process-node"]');
      const bars = node?.querySelectorAll(".interactive-canvas-predefined-process-bar");
      expect(bars?.length).toBe(2);
    });
  });

  it("gives a selected section corner-only resize handles (no edge midpoints)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={v2FlowElementsDocument} selectedObjectIds={["outer-section"]} />,
      );
      const handles = Array.from(container.querySelectorAll("[data-canvas-handle]"));
      expect(handles.length).toBeGreaterThan(0);
      const handleNames = handles.map((node) => node.getAttribute("data-canvas-handle"));
      // Corner handles are 2-letter compass directions (nw/ne/sw/se); edge
      // midpoints are single-letter (n/s/e/w) and must be absent for sections.
      for (const name of handleNames) {
        expect(name?.length).toBe(2);
      }
    });
  });

  it("gives a selected non-section object corner-only handles (FigJam-style, no edge midpoints)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={v2FlowElementsDocument} selectedObjectIds={["captured-pill"]} />,
      );
      const handles = Array.from(container.querySelectorAll("[data-canvas-handle]"));
      const handleNames = handles.map((node) => node.getAttribute("data-canvas-handle"));
      expect(handleNames).not.toContain("n");
      expect(handleNames.sort()).toEqual(["ne", "nw", "se", "sw"]);
    });
  });
});
