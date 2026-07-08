import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ObjectShape } from "../../../render/ObjectShape";
import { ObjectSlotText, textSlotClampLineCount } from "../../object-chrome";
import { CENTER_TEXT_SLOT } from "../../text-slots";
import type { InteractiveCanvasObject } from "../../../state/schema";
import {
  STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX,
  STICKY_MARKDOWN_LINE_HEIGHT_PX,
  StickyMarkdown,
} from "../markdown";

function makeObject(
  partial: Partial<InteractiveCanvasObject> & Pick<InteractiveCanvasObject, "id" | "type">,
): InteractiveCanvasObject {
  return {
    text: "Hello text",
    parentId: null,
    geometry: { x: 0, y: 0, width: 220, height: 140 },
    style: { shape: partial.type },
    ...partial,
  } as InteractiveCanvasObject;
}

function webkitLineClamp(element: HTMLElement): string {
  return (
    element.style.getPropertyValue("-webkit-line-clamp") ||
    (element.style as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp ||
    ""
  );
}

afterEach(() => {
  cleanup();
});

describe("sticky markdown", () => {
  it("pins heading line heights to the sticky body pitch while preserving heading font sizes", () => {
    const { container } = render(<StickyMarkdown text={"# One\n## Two\n### Three"} />);
    const headings = Array.from(
      container.querySelectorAll<HTMLElement>(".interactive-canvas-sticky-line[data-heading]"),
    );

    expect(headings).toHaveLength(3);
    expect(STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX).toEqual({
      1: STICKY_MARKDOWN_LINE_HEIGHT_PX,
      2: STICKY_MARKDOWN_LINE_HEIGHT_PX,
      3: STICKY_MARKDOWN_LINE_HEIGHT_PX,
    });
    expect(headings.map((heading) => heading.style.fontSize)).toEqual([
      "1.5em",
      "1.25em",
      "1.1em",
    ]);
    expect(headings.map((heading) => heading.style.lineHeight)).toEqual([
      "36px",
      "36px",
      "36px",
    ]);
  });

  it("floors sticky clamp budget to whole 36px body lines", () => {
    expect(textSlotClampLineCount(371, STICKY_MARKDOWN_LINE_HEIGHT_PX)).toBe(10);
    expect(textSlotClampLineCount(72, STICKY_MARKDOWN_LINE_HEIGHT_PX)).toBe(2);
    expect(textSlotClampLineCount(35, STICKY_MARKDOWN_LINE_HEIGHT_PX)).toBe(1);
    expect(textSlotClampLineCount(0, STICKY_MARKDOWN_LINE_HEIGHT_PX)).toBe(1);
  });

  it("clamps rendered sticky markdown to whole slot lines with a multiline ellipsis", () => {
    const object = makeObject({
      id: "sticky-long-markdown",
      type: "sticky",
      text: Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join("\n"),
      geometry: { x: 0, y: 0, width: 416, height: 420 },
      style: { shape: "note" },
    });

    const { container } = render(
      <ObjectShape
        object={object}
        selected={false}
        changed={false}
        bounds={{ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }}
      />,
    );
    const slot = container.querySelector<HTMLElement>("[data-canvas-text-slot='inset-body']");
    const label = container.querySelector<HTMLElement>(".interactive-canvas-sticky-body");

    expect(slot).not.toBeNull();
    expect(label).not.toBeNull();
    expect(slot!.style.height).toBe("371px");
    expect(label!.style.lineHeight).toBe("36px");
    expect(label!.style.maxHeight).toBe("360px");
    expect(webkitLineClamp(label!)).toBe("10");
    expect(label!.style.getPropertyValue("-webkit-box-orient")).toBe("vertical");
    expect(label!.style.textOverflow).toBe("ellipsis");
  });

  it("leaves non-sticky child slot content unclamped unless it opts in", () => {
    const object = makeObject({
      id: "process-child-slot",
      type: "process",
      style: { shape: "rounded-rect" },
    });

    const { container } = render(
      <ObjectSlotText object={object} slot={CENTER_TEXT_SLOT}>
        <span>Custom child text</span>
      </ObjectSlotText>,
    );
    const label = container.querySelector<HTMLElement>(".interactive-canvas-object-label");

    expect(label).not.toBeNull();
    expect(label!.style.display).toBe("block");
    expect(label!.style.maxHeight).toBe("");
    expect(webkitLineClamp(label!)).toBe("");
  });
});
