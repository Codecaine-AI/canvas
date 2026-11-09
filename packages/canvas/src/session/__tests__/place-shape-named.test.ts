/**
 * place_shape carries the name and the color: one call per node instead of
 * three (climb round 4: naming and coloring after placement were two of every
 * seven drawer calls).
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "../../state/schema";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function objectOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!;
}

describe("place · place_shape carries its name and color", () => {
  test("a shape placed with text and color needs no second call", () => {
    const session = makeTestSession(makeDocument([box("page", 0, 0, 1200, 800, "section")]), ["page"]);

    const result = runOp(session, "place_shape", {
      id: "store", type: "database", at: [100, 100], text: "Orders", color: "teal",
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('APPLIED · place_shape store database 100,100 300×120 "Orders" teal');
    const store = objectOf(session.draft, "store");
    expect(store.text).toBe("Orders");
    expect(store.color).toBe("teal");
  });

  test("without text and color the shape still arrives blank in its preferred color", () => {
    const session = makeTestSession(makeDocument([box("page", 0, 0, 1200, 800, "section")]), ["page"]);

    runOp(session, "place_shape", { id: "step", type: "process", at: [100, 100] });

    const step = objectOf(session.draft, "step");
    expect(step.text).toBe("");
    expect(typeof step.color).toBe("string");
  });
});
