import { describe, expect, test } from "bun:test";

import { formatBoardDigest } from "../src/board/digest";
import { pageFrameOf } from "../src/board/helpers";
import {
  draftWithPageFrame,
  LOOK_STATE_POINTER,
  wreckedDocumentError,
} from "../src/service/session";
import { look, makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

describe("session operations", () => {
  test("look returns the renders and points at the state block, without editing", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const child = { ...box("child", 64, 96), parentId: "home" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["home"]);

    const result = look(session, "home");

    expect(result.isError).toBeUndefined();
    // The digest, the diff, the lint list and the queue live in section ③,
    // re-derived every request; look restating them would double-feed the
    // same board into one window.
    expect(result.text).not.toContain(formatBoardDigest(session.draft));
    expect(result.text).not.toContain("BOARD DIFF · base → draft");
    expect(result.text).not.toContain("\nDELTA");
    expect(result.text).toContain("LOOK · 2 renders · close-up home");
    expect(result.text).toContain(LOOK_STATE_POINTER);
    // Whole-board perception includes the board render and requested close-up.
    expect(result.pngs).toHaveLength(2);
    expect(result.pngs![0]).toBeInstanceOf(Buffer);
    expect(result.pngs![1]).toBeInstanceOf(Buffer);
    // Both rasters land on the view log for the state render to re-attach.
    expect(session.views.map((view) => view.kind)).toEqual(["board", "section"]);
    expect(session.views[1]!.sectionId).toBe("home");
    // Perception does not create an edit event.
    expect(session.events).toEqual([]);
    expect(session.draft).toBe(baseline);
  });

  test("a view that is not a section costs the render, not the edit", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { text: "changed" },
      view: "alpha",
    });

    // `view` names a close-up to return alongside the result. A bad one is a
    // viewing mistake, not an editing one, so it costs the render and says so
    // rather than discarding a valid edit.
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_object alpha");
    expect(result.text).toContain('render failed: view "alpha"');
    expect(result.pngs ?? []).toHaveLength(0);
    expect(session.draft).not.toBe(draftBefore);
  });

  test("a later operation can render a newly added section", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const added = runOp(session, "add_section", {
      section: {
        id: "new-section",
        text: "New",
        geometry: { x: 320, y: 0, width: 480, height: 320 },
      },
    });
    expect(added.isError).toBeUndefined();
    expect(added.text).toContain("APPLIED · add_section new-section");

    const result = runOp(session, "update_section", {
      sectionId: "new-section",
      patch: { text: "New section" },
      view: "new-section",
    });
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_section new-section");
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]).toBeInstanceOf(Buffer);
    expect(session.draft.objects.find((object) => object.id === "new-section")?.type)
      .toBe("section");
  });

  test("stickies live behind their own add/update/remove operations", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const added = runOp(session, "add_sticky", {
      sticky: {
        id: "note-1",
        text: "Remember",
        geometry: { x: 320, y: 0, width: 176, height: 128 },
      },
    });
    expect(added.isError).toBeUndefined();
    expect(added.text).toContain("APPLIED · add_sticky note-1");
    expect(session.draft.objects.find((object) => object.id === "note-1")?.type).toBe("sticky");

    const updated = runOp(session, "update_sticky", {
      stickyId: "note-1",
      patch: { color: "yellow" },
    });
    expect(updated.isError).toBeUndefined();
    expect(updated.text).toContain("APPLIED · update_sticky note-1");

    // The generic object ops steer to the sticky ops instead of touching it.
    const draftBeforeSteer = session.draft;
    const eventsBeforeSteer = [...session.events];
    const steered = runOp(session, "update_object", {
      objectId: "note-1",
      patch: { text: "x" },
    });
    expect(steered.isError).toBe(true);
    expect(steered.text).toContain("ERROR · update_object");
    expect(steered.text).toContain(
      'objectId "note-1" is a sticky — use the sticky tools '
      + "(add_sticky, update_sticky, remove_sticky).",
    );
    expect(session.draft).toBe(draftBeforeSteer);
    expect(session.events).toEqual(eventsBeforeSteer);

    const removed = runOp(session, "remove_sticky", {
      stickyId: "note-1",
    });
    expect(removed.isError).toBeUndefined();
    expect(removed.text).toContain("APPLIED · remove_sticky note-1");
    expect(session.draft.objects.some((object) => object.id === "note-1")).toBe(false);
  });

  test("a failing operation preserves the draft and emits no event", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "update_object", {
      objectId: "missing",
      patch: { color: "blue" },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      'ERROR · update_object — objectId "missing" is not on the board.',
    );
    expect(session.draft).toBe(draftBefore);
    expect(session.draft.objects[0]!.text).toBe("alpha");
    expect(session.events).toEqual([]);
  });

  test("applies object and connection channel edits", () => {
    const alpha = {
      ...box("alpha", 0, 0),
      color: "red" as const,
    };
    const beta = box("beta", 320, 0);
    const connection = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "before",
      style: "solid" as const,
      color: "gray" as const,
    };
    const baseline = makeDocument([alpha, beta], [connection]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const objectResult = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { text: "renamed", color: "blue" },
    });
    const connectionResult = runOp(session, "update_connection", {
      connectionId: "alpha-beta",
      patch: { label: "after", style: "dashed", color: "violet" },
    });

    expect(objectResult.isError).toBeUndefined();
    expect(objectResult.text).toContain("APPLIED · update_object alpha");
    expect(connectionResult.isError).toBeUndefined();
    expect(connectionResult.text).toContain("APPLIED · update_connection alpha-beta");
    expect(session.draft.objects.find((object) => object.id === "alpha")).toMatchObject({
      text: "renamed",
      color: "blue",
      geometry: alpha.geometry,
    });
    expect(session.draft.connections.find((item) => item.id === "alpha-beta")).toMatchObject({
      label: "after",
      style: "dashed",
      color: "violet",
    });
    // Each applied operation emits the proposal/delta pair the harness has
    // always emitted, so two edits leave four events.
    expect(session.events).toHaveLength(4);
    expect(session.events.map((event) => event.type)).toEqual([
      "proposal",
      "delta",
      "proposal",
      "delta",
    ]);
  });

  test("applies waypoint steering on a connection update", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const steered = runOp(session, "update_connection", {
      connectionId: "alpha-beta",
      patch: { waypoints: [[240, 160]], from: { objectId: "alpha", anchor: "bottom" } },
    });
    expect(steered.isError).toBeUndefined();
    expect(steered.text).toContain("APPLIED · update_connection alpha-beta");
    expect(session.draft.connections[0]).toMatchObject({
      waypoints: [[240, 160]],
      from: { objectId: "alpha", anchor: "bottom" },
    });
  });

  test("re-derives membership for both moved and added objects", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeTestSession(baseline, ["section-a", "section-b"]);

    const moved = runOp(session, "update_object", {
      objectId: "child",
      patch: {
        geometry: { x: 580, y: 112, width: 160, height: 96 },
      },
    });
    const added = runOp(session, "add_object", {
      object: {
        id: "new-child",
        type: "rectangle",
        text: "new child",
        geometry: { x: 160, y: 112, width: 160, height: 96 },
      },
    });

    expect(moved.isError).toBeUndefined();
    expect(added.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "child")?.parentId)
      .toBe("section-b");
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
  });

  test("adding a child re-derives membership and leaves every frame's size alone", () => {
    const page = box("page", -64, -64, 900, 800, "section");
    const section = { ...box("section-a", 0, 0, 400, 320, "section"), parentId: "page" };
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([page, section, child]);
    const session = makeTestSession(baseline, ["section-a"]);

    const result = runOp(session, "add_object", {
      object: {
        id: "new-child",
        type: "rectangle",
        text: "new child",
        geometry: { x: 288, y: 112, width: 160, height: 96 },
      },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · add_object new-child");
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
    // Nothing resizes itself: both frames hold the geometry they were given.
    expect(session.draft.objects.find((object) => object.id === "page")?.geometry)
      .toEqual(page.geometry);
    expect(session.draft.objects.find((object) => object.id === "section-a")?.geometry)
      .toEqual(section.geometry);
    expect(result.text).not.toContain("section-a  0,0 400×320 →");
  });

  test("fit_section snugs one frame around its children and spares its ancestors", () => {
    const page = box("page", -64, -64, 1200, 1000, "section");
    const outer = { ...box("outer", 0, 0, 800, 700, "section"), parentId: "page" };
    const inner = { ...box("inner", 100, 150, 400, 300, "section"), parentId: "outer" };
    const child = { ...box("child", 180, 240, 100, 80), parentId: "inner" };
    const baseline = makeDocument([page, outer, inner, child]);
    const session = makeTestSession(baseline, ["outer"]);

    const result = runOp(session, "fit_section", { sectionId: "inner" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · fit_section inner");
    const fitted = session.draft.objects.find((object) => object.id === "inner")!.geometry;
    // Snug around the one child, plus padding and title clearance.
    expect(fitted.width).toBeLessThan(inner.geometry.width);
    expect(fitted.height).toBeLessThan(inner.geometry.height);
    expect(fitted.x).toBeLessThanOrEqual(child.geometry.x);
    expect(fitted.y).toBeLessThanOrEqual(child.geometry.y);
    expect(fitted.x + fitted.width).toBeGreaterThanOrEqual(
      child.geometry.x + child.geometry.width,
    );
    expect(fitted.y + fitted.height).toBeGreaterThanOrEqual(
      child.geometry.y + child.geometry.height,
    );
    // No cascade: the ancestors keep their own geometry.
    expect(session.draft.objects.find((object) => object.id === "outer")?.geometry)
      .toEqual(outer.geometry);
    expect(session.draft.objects.find((object) => object.id === "page")?.geometry)
      .toEqual(page.geometry);
    // The resize reads truthfully as a section geometry change.
    expect(result.text).toContain("inner  100,150 400×300 →");
  });

  test("fit_section reports an empty section as a no-op", () => {
    const page = box("page", 0, 0, 900, 800, "section");
    const empty = { ...box("empty", 32, 32, 400, 320, "section"), parentId: "page" };
    const baseline = makeDocument([page, empty]);
    const session = makeTestSession(baseline, ["empty"]);
    const draftBefore = session.draft;

    const result = runOp(session, "fit_section", { sectionId: "empty" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain(
      "NO-OP · fit_section empty — skipped — the section is empty",
    );
    expect(result.text).not.toContain("ERROR ·");
    expect(session.draft).toBe(draftBefore);
    expect(session.draft.objects.find((object) => object.id === "empty")?.geometry)
      .toEqual(empty.geometry);
    expect(session.events).toEqual([]);
  });

  test("fit_section rejects a target that is not a section", () => {
    const page = box("page", 0, 0, 900, 800, "section");
    const child = { ...box("child", 80, 112), parentId: "page" };
    const baseline = makeDocument([page, child]);
    const session = makeTestSession(baseline, ["child"]);
    const draftBefore = session.draft;

    const result = runOp(session, "fit_section", { sectionId: "child" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ERROR · fit_section");
    expect(result.text).toContain(
      'sectionId "child" is a rectangle — use the object tools '
      + "(add_object, update_object, remove_object).",
    );
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("a section resize applies exactly as written", () => {
    const section = box("section-a", 0, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["section-a"]);

    const result = runOp(session, "update_section", {
      sectionId: "section-a",
      patch: { geometry: { x: 0, y: 0, width: 512, height: 400 } },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_section section-a");
    expect(session.draft.objects.find((object) => object.id === "section-a")?.geometry)
      .toEqual({ x: 0, y: 0, width: 512, height: 400 });
    expect(session.draft.objects.find((object) => object.id === "child")?.geometry)
      .toEqual(child.geometry);
  });

  test("holds the base section's geometry and keeps the board's last section", () => {
    const frame = box("page-frame", 32, 32, 1136, 656, "section");
    const child = { ...box("child", 80, 112), parentId: "page-frame" };
    const baseline = makeDocument([frame, child]);
    const session = makeTestSession(baseline, ["child"]);

    const applied = runOp(session, "update_object", {
      objectId: "child",
      patch: { geometry: { x: 96, y: 128, width: 160, height: 96 } },
    });
    expect(applied.isError).toBeUndefined();
    // The base section is the page: it holds the space it was given.
    expect(session.draft.objects.find((object) => object.id === "page-frame")?.geometry)
      .toEqual(frame.geometry);

    const draftBeforeRemove = session.draft;
    const eventsBeforeRemove = [...session.events];
    const removed = runOp(session, "remove_section", {
      sectionId: "page-frame",
    });
    expect(removed.isError).toBe(true);
    expect(removed.text).toContain("ERROR · remove_section");
    expect(removed.text).toContain("is the board's only section");
    expect(session.draft).toBe(draftBeforeRemove);
    expect(session.events).toEqual(eventsBeforeRemove);

    // The generic object op cannot reach the frame either: it steers to the
    // section op instead of removing.
    const steered = runOp(session, "remove_object", {
      objectId: "page-frame",
    });
    expect(steered.isError).toBe(true);
    expect(steered.text).toContain("ERROR · remove_object");
    expect(steered.text).toContain(
      'objectId "page-frame" is a section — use the section tools '
      + "(add_section, update_section, remove_section, fit_section).",
    );
    expect(session.draft).toBe(draftBeforeRemove);
    expect(session.events).toEqual(eventsBeforeRemove);
  });

  test("injects a conventional page frame into frameless drafts only", () => {
    const child = box("child", 80, 112);
    const baseline = { ...makeDocument([child]), size: { width: 1200, height: 720 } };

    const draft = draftWithPageFrame(baseline);

    expect(baseline.objects).toEqual([child]);
    expect(draft.objects[0]).toMatchObject({
      id: "page-frame",
      type: "section",
      text: "Synthetic",
      color: "white",
      parentId: null,
      geometry: { x: 32, y: 32, width: 1136, height: 656 },
      style: { shape: "section" },
    });
    expect(pageFrameOf(draft)?.geometry).toEqual({
      x: 32,
      y: 32,
      width: 1136,
      height: 656,
    });
    expect(wreckedDocumentError(draft)).toBeNull();
    expect(draftWithPageFrame(draft)).toBe(draft);
  });

  test("derives a snapped padded frame without document size and defaults an empty page", () => {
    const contentDraft = draftWithPageFrame(makeDocument([
      box("child", 83, 117, 161, 97),
    ]));
    expect(contentDraft.objects[0]?.geometry)
      .toEqual({ x: 48, y: 80, width: 240, height: 176 });

    const emptyDraft = draftWithPageFrame(makeDocument([]));
    expect(emptyDraft.objects[0]?.geometry)
      .toEqual({ x: 32, y: 32, width: 1136, height: 656 });
  });

  test("returns the change delta and new lint findings without rejecting the edit", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
    ], [{ ...connect("edge", "alpha", "beta"), label: "go" }]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const result = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 208, y: 0, width: 160, height: 96 } },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_object beta");
    expect(result.text).toContain("DELTA");
    expect(result.text).toContain("beta  320,0 → 208,0");
    expect(result.text).toContain("LINTS · +2 −0");
    expect(result.text).toContain(
      'W1 unreadable-labels: label "go" chip on edge (43×30px) bleeds onto alpha and beta: '
      + '48px of corridor where the chip needs 76px '
      + "(open the alpha↔beta corridor to ≥76px so the chip and its 16px margins fit)",
    );
    expect(result.text).toContain("crowding: alpha and beta");
    expect(result.text).not.toContain("[quickfix]");
    expect(session.lastDiagnostics).toHaveLength(2);
    expect(session.draft.objects.find((object) => object.id === "beta")?.geometry)
      .toEqual({ x: 208, y: 0, width: 160, height: 96 });
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
  });
});
