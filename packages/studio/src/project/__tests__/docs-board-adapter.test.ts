import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";

import { ROOT_PAGE_FRAME_ID } from "../../new-document";
import { adaptStudioDocumentToProject } from "../docs-board-adapter";

describe("adaptStudioDocumentToProject", () => {
  it("seeds a docs-compatible page frame and reparents top-level content", () => {
    const document: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "project-board",
      title: "Project Board",
      mode: "diagram",
      size: { width: 960, height: 560 },
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        {
          id: "card-a",
          type: "process",
          text: "Card A",
          geometry: { x: 100, y: 120, width: 160, height: 80 },
          style: { shape: "rounded-rect" },
        },
      ],
      connections: [],
      annotations: [],
    };

    const wire = adaptStudioDocumentToProject(document, {
      docsOnly: "preserved",
      objects: [{ id: "card-a", type: "process", label: "Old", custom: true }],
    });
    const objects = wire.objects as Record<string, unknown>[];

    expect(wire.docsOnly).toBe("preserved");
    expect(objects[0]).toMatchObject({
      id: ROOT_PAGE_FRAME_ID,
      type: "section",
      label: "Project Board",
      title: "Project Board",
      tint: "white",
      parentId: null,
      locked: "background",
      geometry: { x: 32, y: 32, width: 896, height: 496 },
      style: { shape: "section" },
    });
    expect(objects[1]).toMatchObject({
      id: "card-a",
      parentId: ROOT_PAGE_FRAME_ID,
      custom: true,
    });
  });
});
