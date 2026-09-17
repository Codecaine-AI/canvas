import { describe, expect, it } from "bun:test";
import { validateInteractiveCanvasDocument, type InteractiveCanvasDocument } from "@codecaine-ai/canvas";

import { ROOT_PAGE_FRAME_ID } from "../../new-document";
import { adaptProjectCanvasToStudio, adaptStudioDocumentToProject } from "../docs-board-adapter";

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
      text: "Project Board",
      color: "white",
      parentId: null,
      geometry: { x: 32, y: 32, width: 896, height: 496 },
      style: { shape: "section" },
    });
    expect(objects[1]).toMatchObject({
      id: "card-a",
      parentId: ROOT_PAGE_FRAME_ID,
      custom: true,
    });
    expect(validateInteractiveCanvasDocument(wire).ok).toBe(true);
    expect(objects.every((object) => typeof object.text === "string")).toBe(true);
    expect(objects.every((object) => !("label" in object) && !("tint" in object))).toBe(true);
  });

  /**
   * S1.1 — the save side spreads the whole connection, so the LOAD side's
   * validator whitelist is the only gate a new connection field has to pass.
   * A save→load cycle through the real adapter is the end-to-end proof that
   * `labelPosition` is not eaten somewhere between the editor and disk.
   */
  it("round-trips a connection labelPosition through save and load", () => {
    const document: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "pinned-board",
      title: "Pinned",
      mode: "diagram",
      size: { width: 960, height: 560 },
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        {
          id: "a",
          type: "process",
          text: "A",
          geometry: { x: 100, y: 120, width: 160, height: 80 },
        },
        {
          id: "b",
          type: "process",
          text: "B",
          geometry: { x: 480, y: 120, width: 160, height: 80 },
        },
      ],
      connections: [
        {
          id: "a-to-b",
          from: { objectId: "a" },
          to: { objectId: "b" },
          label: "handoff",
          labelPosition: { along: 0.3, offset: -16 },
        },
      ],
      annotations: [],
    };

    const wire = adaptStudioDocumentToProject(document, {});
    // The docs viewer reads the saved wire directly, without Studio's adapter.
    expect(validateInteractiveCanvasDocument(wire).ok).toBe(true);
    const savedConnections = wire.connections as Record<string, unknown>[];
    expect(savedConnections[0]?.labelPosition).toEqual({ along: 0.3, offset: -16 });

    const reloaded = adaptProjectCanvasToStudio(JSON.parse(JSON.stringify(wire)));
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.document.connections[0]?.labelPosition).toEqual({ along: 0.3, offset: -16 });
  });

  it("saves edits to legacy boards in the viewer schema without reverting geometry or empty text", () => {
    const raw = {
      schemaVersion: 1, id: "legacy", title: "Legacy", mode: "diagram",
      size: { width: 960, height: 560 }, viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        { id: "frame", type: "section", label: "Background", title: "Background", tint: "purple", geometry: { x: 0, y: 0, width: 960, height: 560 } },
        { id: "card", type: "container", label: "Old label", parentId: "frame", geometry: { x: 100, y: 120, width: 160, height: 80 }, custom: "keep" },
      ],
      connections: [], annotations: [],
    };
    const loaded = adaptProjectCanvasToStudio(raw);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const card = loaded.document.objects.find((object) => object.id === "card")!;
    card.text = "";
    card.color = "green";
    card.geometry.x = 210;
    const wire = adaptStudioDocumentToProject(loaded.document, raw);
    expect(validateInteractiveCanvasDocument(wire).ok).toBe(true);
    const objects = wire.objects as Record<string, unknown>[];
    expect(objects.find((object) => object.id === "card")).toMatchObject({
      type: "rectangle", text: "", color: "green", custom: "keep",
      geometry: { x: 210, y: 120, width: 160, height: 80 },
    });
    expect(objects.find((object) => object.id === "frame")).toMatchObject({ text: "Background", color: "violet" });
    const reloaded = adaptProjectCanvasToStudio(wire);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(adaptStudioDocumentToProject(reloaded.document, wire)).toEqual(wire);
  });
});
