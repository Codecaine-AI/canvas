import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument } from "../../../../../state/schema";
import { renderSectionForExport, sectionExportFilename } from "../section-export";

function fixtureDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-export-doc",
    title: "Agent Board",
    mode: "diagram",
    objects: [
      {
        id: "section-a",
        type: "section",
        text: "Billing Flow",
        geometry: { x: 100, y: 100, width: 300, height: 200 },
      },
      {
        id: "inside",
        type: "process",
        text: "INSIDE SECTION",
        parentId: "section-a",
        geometry: { x: 160, y: 160, width: 120, height: 60 },
      },
      {
        id: "outside",
        type: "process",
        text: "OUTSIDE SECTION",
        geometry: { x: 700, y: 500, width: 120, height: 60 },
      },
    ],
    connections: [],
  };
}

describe("section context-menu export", () => {
  it("passes the section crop to the renderer", () => {
    const { svg, width, height } = renderSectionForExport(fixtureDocument(), "section-a");

    expect(width).toBe(364);
    expect(height).toBe(264);
    expect(svg).toContain('viewBox="68 68 364 264"');
    expect(svg).toContain(">INSIDE<");
    expect(svg).toContain(">SECTION<");
    expect(svg).not.toContain(">OUTSIDE<");
  });

  it("uses the board and section names in SVG and PNG filenames", () => {
    const document = fixtureDocument();
    expect(sectionExportFilename(document, "section-a", "svg")).toBe(
      "agent-board-billing-flow.svg",
    );
    expect(sectionExportFilename(document, "section-a", "png")).toBe(
      "agent-board-billing-flow.png",
    );
  });
});
