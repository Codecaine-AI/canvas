import { describe, expect, test } from "bun:test";

import { draftPlacedObject } from "@codecaine-ai/canvas/actions";
import { renderDocumentToSvg } from "@codecaine-ai/canvas/render";
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { renderShapeFor } from "../../canvas/src/objects/object-def";
import { effectiveRenderShape } from "../../canvas/src/render/static-svg";
import { creationDefaultFor } from "../src/service/session/tools/creation-defaults";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

const NOTE_TEXT = "run `deploy` now";

function placementFixture() {
  // makeTestSession needs one scoped object. This non-section anchor sits away
  // from every placement, so membership reconciliation leaves all parents null.
  const anchor = box("anchor", -400, 0, 160, 100);
  const baseline = makeDocument([anchor]);
  const session = makeTestSession(baseline, ["anchor"]);

  const results = [
    runOp(session, "place_sticky", {
      id: "note",
      text: NOTE_TEXT,
      at: [0, 0],
    }),
    runOp(session, "place_shape", {
      id: "decision",
      type: "decision",
      at: [400, 0],
    }),
    runOp(session, "place_shape", {
      id: "cloud",
      type: "cloud",
      at: [800, 0],
    }),
    runOp(session, "place_section", {
      id: "section",
      text: "Frame",
      at: [1200, 0],
      size: { width: 480, height: 360 },
    }),
  ];
  for (const result of results) expect(result.isError).toBeUndefined();

  const uiObjects = [
    draftPlacedObject(
      "sticky",
      { x: 0, y: 0, width: 180, height: 120 },
      {
        id: "note",
        text: NOTE_TEXT,
        color: creationDefaultFor("sticky").color,
      },
    ),
    draftPlacedObject(
      "decision",
      { x: 400, y: 0, width: 280, height: 100 },
      {
        id: "decision",
        text: "",
        color: creationDefaultFor("decision").color,
      },
    ),
    draftPlacedObject(
      "icon",
      { x: 800, y: 0, width: 120, height: 120 },
      {
        id: "cloud",
        text: "",
        color: creationDefaultFor("cloud").color,
        icon: "cloud",
      },
    ),
    draftPlacedObject(
      "section",
      { x: 1200, y: 0, width: 480, height: 360 },
      {
        id: "section",
        text: "Frame",
        color: creationDefaultFor("section").color,
      },
    ),
  ];

  const placed = (id: string): InteractiveCanvasObject => {
    const object = session.draft.objects.find((candidate) => candidate.id === id);
    if (!object) throw new Error(`missing placed object ${id}`);
    return object;
  };

  return {
    anchor,
    session,
    uiObjects,
    placed,
  };
}

describe("place gesture render parity", () => {
  test("place gestures match UI creation render dispatch", () => {
    const { placed, uiObjects } = placementFixture();
    const expectedShapes = ["note", "diamond", "icon", "section"] as const;

    uiObjects.forEach((uiObject, index) => {
      const agentObject = placed(uiObject.id);
      expect(renderShapeFor(agentObject)).toBe(renderShapeFor(uiObject));
      expect(renderShapeFor(agentObject)).toBe(expectedShapes[index]);
    });
  });

  test("agent placements render pixel-identically to UI-created objects", () => {
    const { anchor, session, uiObjects } = placementFixture();
    const uiDocument = makeDocument([anchor, ...uiObjects]);

    expect(renderDocumentToSvg(session.draft).svg)
      .toBe(renderDocumentToSvg(uiDocument).svg);
  });

  test("placed sticky takes the note markdown render path", () => {
    const baseline = makeDocument([box("anchor", -400, 0, 160, 100)]);
    const session = makeTestSession(baseline, ["anchor"]);
    const result = runOp(session, "place_sticky", {
      id: "note",
      text: NOTE_TEXT,
      at: [0, 0],
    });
    expect(result.isError).toBeUndefined();

    const sticky = session.draft.objects.find((object) => object.id === "note")!;
    const svg = renderDocumentToSvg(session.draft).svg;

    expect(effectiveRenderShape(sticky)).toBe("note");
    expect(svg).toContain("<feDropShadow ");
    // Inline code gets a chip only through renderStickyMarkdownText.
    expect(svg).toContain('fill-opacity="0.08"');
  });
});
