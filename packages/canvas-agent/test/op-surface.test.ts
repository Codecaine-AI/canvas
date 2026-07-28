/**
 * The DELTA VOCABULARY gate (src/service/session/op-surface.ts).
 *
 * A document diff cannot name the gesture that caused it — `move_to`,
 * `move_by`, `align`, and `space_out` all land as the same geometry change —
 * so the diff speaks a separate, neutral vocabulary: added / changed / removed
 * per entity kind, plus the one section-fit shape. This file pins that
 * vocabulary from both directions: internal patch ops classify into the right
 * delta verb against the right entity kind, real gestures land as the delta
 * their edit implies, and every verb can name the id it touched.
 *
 * The tools' own behaviour is tested against the tools, in
 * session-store-gestures.test.ts and operations-*.test.ts.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import {
  DELTA_KINDS,
  SHAPE_OBJECT_TYPES,
  classifyDelta,
  deltaTargetId,
  entityKindOf,
  type BoardDelta,
} from "../src/service/session/perception/op-surface";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

/** One of each entity kind, two sections, an isolated shape, and a connection. */
function referenceDocument(): InteractiveCanvasDocument {
  return makeDocument([
    { ...box("page-frame", 0, 0, 1200, 720, "section"), locked: "background" as const },
    { ...box("home", 60, 60, 480, 320, "section"), text: "Home" },
    { ...box("note", 600, 60, 180, 120, "sticky"), text: "Remember" },
    box("alpha", 100, 120),
    box("beta", 320, 120),
    box("orphan", 960, 60),
  ], [connect("alpha-beta", "alpha", "beta")]);
}

describe("entity kinds", () => {
  test("every object falls into the family whose delta verbs it takes", () => {
    const document = referenceDocument();
    const kindOf = (id: string) =>
      entityKindOf(document.objects.find((object) => object.id === id)!);

    expect(kindOf("home")).toBe("section");
    expect(kindOf("note")).toBe("sticky");
    expect(kindOf("alpha")).toBe("shape");
  });

  test("the shape roster is the object roster minus the kinds with their own family", () => {
    expect(SHAPE_OBJECT_TYPES.has("rectangle")).toBe(true);
    expect(SHAPE_OBJECT_TYPES.has("section")).toBe(false);
    expect(SHAPE_OBJECT_TYPES.has("sticky")).toBe(false);
  });
});

describe("classification", () => {
  const document = referenceDocument();

  test("an added object is classified by the payload it carries", () => {
    const sectionGeometry = { x: 700, y: 400, width: 480, height: 320 };
    expect(classifyDelta({
      type: "addObject",
      object: { id: "s2", type: "section", text: "New", geometry: sectionGeometry },
    }, document)).toEqual({
      type: "addSection",
      section: { id: "s2", text: "New", geometry: sectionGeometry },
    });

    const stickyGeometry = { x: 900, y: 240, width: 180, height: 120 };
    expect(classifyDelta({
      type: "addObject",
      object: { id: "n2", type: "sticky", text: "note", geometry: stickyGeometry },
    }, document)).toEqual({
      type: "addSticky",
      sticky: { id: "n2", text: "note", geometry: stickyGeometry },
    });

    const shape = {
      id: "gamma",
      type: "process",
      text: "Step",
      geometry: { x: 600, y: 320, width: 180, height: 100 },
    };
    expect(classifyDelta({ type: "addObject", object: shape }, document))
      .toEqual({ type: "addObject", object: shape });
  });

  test("a changed or removed object is classified by the target it names", () => {
    const patch = { text: "Renamed" };
    expect(classifyDelta({ type: "updateObject", objectId: "home", patch }, document))
      .toEqual({ type: "updateSection", sectionId: "home", patch });
    expect(classifyDelta({ type: "updateObject", objectId: "note", patch }, document))
      .toEqual({ type: "updateSticky", stickyId: "note", patch });
    expect(classifyDelta({ type: "updateObject", objectId: "alpha", patch }, document))
      .toEqual({ type: "updateObject", objectId: "alpha", patch });

    expect(classifyDelta({ type: "removeObject", objectId: "home" }, document))
      .toEqual({ type: "removeSection", sectionId: "home" });
    expect(classifyDelta({ type: "removeObject", objectId: "note" }, document))
      .toEqual({ type: "removeSticky", stickyId: "note" });
    expect(classifyDelta({ type: "removeObject", objectId: "orphan" }, document))
      .toEqual({ type: "removeObject", objectId: "orphan" });
  });

  test("connection ops are already delta verbs and pass through untouched", () => {
    const added = {
      type: "addConnection" as const,
      connection: { id: "e2", from: { objectId: "alpha" }, to: { objectId: "beta" } },
    };
    expect(classifyDelta(added, document)).toEqual(added);

    const changed = {
      type: "updateConnection" as const,
      connectionId: "alpha-beta",
      patch: { label: "next" },
    };
    expect(classifyDelta(changed, document)).toEqual(changed);

    const removed = { type: "removeConnection" as const, connectionId: "alpha-beta" };
    expect(classifyDelta(removed, document)).toEqual(removed);
  });

  test("classification is total for an unknown target", () => {
    expect(classifyDelta(
      { type: "updateObject", objectId: "ghost", patch: { text: "x" } },
      document,
    )).toEqual({ type: "updateObject", objectId: "ghost", patch: { text: "x" } });
  });
});

describe("gestures land as the delta their edit implies", () => {
  /** Run one gesture and classify what it actually did to the document. */
  function deltasOf(
    document: InteractiveCanvasDocument,
    run: (session: ReturnType<typeof makeTestSession>) => void,
  ): BoardDelta[] {
    const session = makeTestSession(document, document.objects.map(({ id }) => id));
    run(session);
    return diffDocuments(document, session.draft)
      .map((operation) => classifyDelta(operation, document));
  }

  test("place_section is an addSection, whatever the gesture was called", () => {
    const deltas = deltasOf(referenceDocument(), (session) => {
      runOp(session, "place_section", { id: "s2", text: "New", at: [700, 400] });
    });
    expect(deltas.map((delta) => delta.type)).toEqual(["addSection"]);
    expect(deltas.map(deltaTargetId)).toEqual(["s2"]);
  });

  test("move_to and move_by are the same delta — the diff cannot tell them apart", () => {
    const absolute = deltasOf(referenceDocument(), (session) => {
      runOp(session, "move_to", { id: "alpha", x: 200, y: 120 });
    });
    const relative = deltasOf(referenceDocument(), (session) => {
      runOp(session, "move_by", { id: "alpha", dx: 100, dy: 0 });
    });
    expect(absolute).toEqual(relative);
    expect(absolute.map((delta) => delta.type)).toEqual(["updateObject"]);
  });

  test("fit_section lands as a plain section geometry change", () => {
    const deltas = deltasOf(referenceDocument(), (session) => {
      runOp(session, "fit_section", { id: "home" });
    });
    expect(deltas.map((delta) => delta.type)).toEqual(["updateSection"]);
    expect(deltas.map(deltaTargetId)).toEqual(["home"]);
  });

  test("delete on a sticky is a removeSticky, on a shape a removeObject", () => {
    expect(deltasOf(referenceDocument(), (session) => {
      runOp(session, "delete", { id: "note" });
    }).map((delta) => delta.type)).toEqual(["removeSticky"]);

    expect(deltasOf(referenceDocument(), (session) => {
      runOp(session, "delete", { id: "orphan" });
    }).map((delta) => delta.type)).toEqual(["removeObject"]);
  });

  test("connect adds an edge; style_edge changes one", () => {
    expect(deltasOf(referenceDocument(), (session) => {
      runOp(session, "connect", {
        id: "e2",
        from: { objectId: "alpha" },
        to: { objectId: "orphan" },
      });
    }).map((delta) => delta.type)).toEqual(["addConnection"]);

    expect(deltasOf(referenceDocument(), (session) => {
      runOp(session, "style_edge", { id: "alpha-beta", patch: { style: "dashed" } });
    }).map((delta) => delta.type)).toEqual(["updateConnection"]);
  });
});

describe("target ids", () => {
  const DELTAS: Record<(typeof DELTA_KINDS)[number], BoardDelta> = {
    addSection: { type: "addSection", section: { id: "s2" } },
    updateSection: { type: "updateSection", sectionId: "home", patch: { text: "Renamed" } },
    removeSection: { type: "removeSection", sectionId: "home" },
    fitSection: { type: "fitSection", sectionId: "home" },
    addSticky: { type: "addSticky", sticky: { id: "n2" } },
    updateSticky: { type: "updateSticky", stickyId: "note", patch: { color: "yellow" } },
    removeSticky: { type: "removeSticky", stickyId: "note" },
    addObject: { type: "addObject", object: { id: "gamma" } },
    updateObject: { type: "updateObject", objectId: "alpha", patch: { color: "blue" } },
    removeObject: { type: "removeObject", objectId: "orphan" },
    addConnection: { type: "addConnection", connection: { id: "e2" } },
    updateConnection: { type: "updateConnection", connectionId: "alpha-beta", patch: { label: "next" } },
    removeConnection: { type: "removeConnection", connectionId: "alpha-beta" },
  };

  test("every delta verb names the id it created or touched", () => {
    expect(DELTA_KINDS.map((kind) => deltaTargetId(DELTAS[kind]))).toEqual([
      "s2", "home", "home", "home", "n2", "note", "note",
      "gamma", "alpha", "orphan", "e2", "alpha-beta", "alpha-beta",
    ]);
  });

  test("the vocabulary is add/change/remove per kind, plus fit", () => {
    expect([...DELTA_KINDS]).toHaveLength(13);
    for (const kind of ["Section", "Sticky", "Object", "Connection"] as const) {
      for (const verb of ["add", "update", "remove"] as const) {
        expect(DELTA_KINDS).toContain(`${verb}${kind}` as (typeof DELTA_KINDS)[number]);
      }
    }
    expect(DELTA_KINDS).toContain("fitSection");
  });
});
