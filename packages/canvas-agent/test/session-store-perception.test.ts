import { describe, expect, test } from "bun:test";

import {
  boardDiffBlock,
  boardStateSnapshot,
  bootPerception,
  emitSessionEvent,
  toolFinalize,
} from "../src/service/session";
import { diffDocuments } from "../src/board/doc-diff";
import { formatDiagnostics, runDiagnostics } from "../src/board/lints/run";
import { look, makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

describe("spawn board-state snapshot", () => {
  test("carries the full digest plus the full lint report as one string", () => {
    // 48px gap under a "go" chip → unreadable-labels warning in the report.
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 208, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "go" }],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const snapshot = boardStateSnapshot(session);

    expect(snapshot).toContain("BOARD ·");
    expect(snapshot).toContain('"alpha"');
    expect(snapshot).toContain("\n\nDIAGNOSTICS ·");
    // 48px gap under a "go" chip — the full lint report rides along.
    expect(snapshot).toContain("unreadable-labels");
    // Findings carry a measured prose remedy, leaving the operation choice to the model.
    expect(snapshot).toContain("open the alpha↔beta corridor");
    expect(snapshot).not.toContain("suggested op:");
  });

  test("recomputes from the current draft, so refinements get a fresh snapshot", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const first = boardStateSnapshot(session);
    session.draft = makeDocument([{ ...box("alpha", 0, 0), text: "renamed alpha" }]);
    const second = boardStateSnapshot(session);

    expect(first).not.toBe(second);
    expect(second).toContain("renamed alpha");
  });
});

describe("spawn boot perception", () => {
  const PNG_SIGNATURE = "89504e470d0a1a0a";

  test("pushes the board render onto the session view log, not into the boot images", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const boot = bootPerception(session);

    expect(boot.boardState).toContain("BOARD ·");
    expect(boot.boardState).not.toContain("board render unavailable");
    // The board is working picture: it rides section ③, so it never becomes a
    // reference image pinned into the context message.
    expect(boot.boardView).toBe(true);
    expect(Object.keys(boot.images)).not.toContain("board");
    expect(session.views).toHaveLength(1);
    const [view] = session.views;
    expect(view.kind).toBe("board");
    expect(view.sectionId).toBeNull();
    expect(view.png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  });

  test("attaches the house-style exemplar as a PNG when the exemplar canvas exists", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const boot = bootPerception(session);

    expect(typeof boot.images.exemplar).toBe("string");
    const png = Buffer.from(boot.images.exemplar!, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  });

  test("a failed board render degrades to text-only and notes it in board_state", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    // Non-finite geometry defeats the renderer/rasterizer without crashing boot.
    session.draft = makeDocument([{
      ...box("alpha", 0, 0),
      geometry: { x: Number.NaN, y: 0, width: 160, height: 96 },
    }]);

    const boot = bootPerception(session);

    expect(boot.boardView).toBe(false);
    expect(session.views).toHaveLength(0);
    expect(boot.boardState).toContain("board render unavailable at spawn");
    expect(boot.boardState).toContain("call look for a fresh full-board render");
  });
});

describe("DELTA block", () => {
  test("reports moves, recolors, adds, and removes in their operation results", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
      box("gamma", 640, 0),
    ]);
    const session = makeTestSession(baseline, ["alpha", "beta", "gamma"]);

    const moved = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 320, y: 240, width: 160, height: 96 } },
    });
    const recolored = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { color: "blue" },
    });
    const added = runOp(session, "add_object", {
      object: {
        id: "note",
        type: "rectangle",
        text: "hello",
        geometry: { x: 960, y: 0, width: 160, height: 96 },
      },
    });
    const removed = runOp(session, "remove_object", { objectId: "gamma" });

    expect(moved.isError).toBeUndefined();
    expect(moved.text).toContain("APPLIED · update_object beta");
    expect(moved.text).toContain("DELTA");
    expect(moved.text).toContain("beta  320,0 → 320,240");
    expect(recolored.text).toContain("APPLIED · update_object alpha");
    expect(recolored.text).toContain("alpha  color gray → blue");
    expect(added.text).toContain("APPLIED · add_object note");
    expect(added.text).toContain('+ note  rectangle 960,0 160×96 "hello"');
    expect(removed.text).toContain("APPLIED · remove_object gamma");
    expect(removed.text).toContain("− gamma");
  });

  test("shows membership-reconciliation parentId moves the op payload never named", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeTestSession(baseline, ["section-a", "section-b"]);

    const result = runOp(session, "update_object", {
      objectId: "child",
      patch: { geometry: { x: 576, y: 112, width: 160, height: 96 } },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("child  80,112 → 576,112");
    expect(result.text).toContain("child  parentId section-a → section-b");
  });

  test("reports connection channel changes, additions, and removals per operation", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0), box("gamma", 960, 0)],
      [
        { ...connect("alpha-beta", "alpha", "beta"), label: "before" },
        connect("beta-gamma", "beta", "gamma"),
      ],
    );
    const session = makeTestSession(baseline, ["alpha", "beta", "gamma"]);

    const updated = runOp(session, "update_connection", {
      connectionId: "alpha-beta",
      patch: { label: "after", color: "orange" },
    });
    const removed = runOp(session, "remove_connection", {
      connectionId: "beta-gamma",
    });
    const added = runOp(session, "add_connection", {
      connection: {
        id: "alpha-gamma",
        from: { objectId: "alpha" },
        to: { objectId: "gamma" },
      },
    });

    expect(updated.isError).toBeUndefined();
    expect(updated.text).toContain("APPLIED · update_connection alpha-beta");
    expect(updated.text).toContain("alpha-beta  label before → after");
    expect(updated.text).toContain("alpha-beta  color gray → orange");
    expect(removed.text).toContain("APPLIED · remove_connection beta-gamma");
    expect(removed.text).toContain("− beta-gamma");
    expect(added.text).toContain("APPLIED · add_connection alpha-gamma");
    expect(added.text).toContain("+ alpha-gamma  alpha → gamma");
  });

  test("makes connection steering visible: waypoints, anchors, and position fractions", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const result = runOp(session, "update_connection", {
      connectionId: "alpha-beta",
      patch: {
        from: { objectId: "alpha", anchor: "bottom" },
        to: { objectId: "beta", anchor: "left", position: [0, 0.25] },
        waypoints: [[240, 160]],
      },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("alpha-beta  anchors auto→auto → bottom→left");
    expect(result.text).toContain("alpha-beta  pos auto→auto → auto→0,0.25");
    expect(result.text).toContain("alpha-beta  wp none → 240,160");
    expect(result.pngs).toBeUndefined();
    // The steered connection's true route rides with the operation.
    expect(result.text).toContain("ROUTES");
    expect(result.text).toMatch(/alpha-beta {2}anchors \w+→\w+ {2}path /);
  });
});

describe("ROUTES block", () => {
  test("reports the routed truth for a connection whose endpoint object moved", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0), box("gamma", 960, 400)],
      [
        connect("alpha-beta", "alpha", "beta"),
        connect("beta-gamma", "beta", "gamma"),
      ],
    );
    const session = makeTestSession(baseline, ["alpha", "beta", "gamma"]);

    const result = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { geometry: { x: 0, y: 240, width: 160, height: 96 } },
    });

    expect(result.isError).toBeUndefined();
    const routes = result.text.split("ROUTES")[1]!;
    // alpha moved: alpha-beta re-reports; beta-gamma is untouched.
    expect(routes).toContain("alpha-beta  anchors ");
    expect(routes).toContain("  path ");
    expect(routes).toContain("  through ");
    expect(routes).not.toContain("beta-gamma");
  });

  test("channel-only edits produce no ROUTES block", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const result = runOp(session, "update_connection", {
      connectionId: "alpha-beta",
      patch: { label: "flows" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).not.toContain("ROUTES");
  });

  test("names true non-endpoint boxes the routed path crosses", () => {
    const baseline = makeDocument(
      [
        box("source", 0, 0),
        box("target", 480, 0),
        box("blocker", 240, 0),
      ],
      [connect("wire", "source", "target")],
    );
    const session = makeTestSession(baseline, ["source", "target"]);

    const result = runOp(session, "update_connection", {
      connectionId: "wire",
      patch: { waypoints: [[200, 48], [440, 48]] },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("through blocker");
  });
});

describe("BOARD DIFF block", () => {
  test("is cumulative base → draft with one compact line per changed entity", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
      box("gamma", 640, 0),
    ]);
    const session = makeTestSession(baseline, ["alpha", "beta", "gamma"]);

    runOp(session, "update_object", {
      objectId: "alpha",
      patch: { text: "first pass" },
    });
    runOp(session, "update_object", {
      objectId: "alpha",
      patch: { geometry: { x: 0, y: 240, width: 160, height: 96 } },
    });
    runOp(session, "remove_object", { objectId: "gamma" });
    runOp(session, "add_object", {
      object: {
        id: "note",
        type: "rectangle",
        text: "hi",
        geometry: { x: 960, y: 0, width: 160, height: 96 },
      },
    });
    const diff = boardDiffBlock(session);

    // Cumulative: the retext and move share one base-to-draft line.
    expect(diff).toContain("updateObject alpha  moved · retexted");
    expect(diff).toContain("addObject note");
    expect(diff).toContain("removeObject gamma");
    expect(diff).not.toContain("updateObject beta");
  });

  test("renders section and sticky ops in the model-facing grammar", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const sticky = { ...box("note", 600, 0, 176, 128, "sticky"), text: "Remember" };
    const baseline = makeDocument([section, sticky]);
    const session = makeTestSession(baseline, ["home", "note"]);

    runOp(session, "update_section", {
      sectionId: "home",
      patch: { text: "Renamed home" },
    });
    runOp(session, "remove_sticky", { stickyId: "note" });
    runOp(session, "add_section", {
      section: {
        id: "annex",
        text: "Annex",
        geometry: { x: 0, y: 400, width: 480, height: 320 },
      },
    });
    const diff = boardDiffBlock(session);

    // BOARD DIFF classifies internal object patches into their entity-kind names.
    expect(diff).toContain("BOARD DIFF · base → draft · 3 ops");
    expect(diff).toContain("addSection annex");
    expect(diff).toContain("updateSection home  retexted");
    expect(diff).toContain("removeSticky note");
    expect(diff).not.toContain("updateObject home");
    expect(diff).not.toContain("removeObject note");
  });

  test("matches the operations a committed finalize proposes", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
    ]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    runOp(session, "update_object", {
      objectId: "alpha",
      patch: { text: "renamed", color: "teal" },
    });
    runOp(session, "add_object", {
      object: {
        id: "note",
        type: "rectangle",
        text: "hi",
        geometry: { x: 640, y: 0, width: 160, height: 96 },
      },
    });
    const diff = boardDiffBlock(session);
    expect(diff).toContain("updateObject alpha  retexted · recolored");
    expect(diff).toContain("addObject note");

    const expected = diffDocuments(session.baseline, session.draft);
    const finalized = toolFinalize(session, "committed", "Renamed and annotated", emitSessionEvent);
    expect(finalized.isError).toBeUndefined();
    expect(session.proposal!.operations).toEqual(expected);
  });
});

describe("LINTS delta", () => {
  test("operations report +new/−resolved while the state block carries the complete list", () => {
    const baseline = makeDocument([
      // This covered pair is already present before the operation.
      box("existing-a", 0, 0),
      box("existing-b", 40, 0),
      box("alpha", 1000, 0),
      box("beta", 1480, 0),
    ]);
    const session = makeTestSession(
      baseline,
      ["existing-a", "existing-b", "alpha", "beta"],
    );

    // Introduce a second covered-content error (beta 75% onto alpha).
    const introduced = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 1040, y: 0, width: 160, height: 96 } },
    });
    expect(introduced.isError).toBeUndefined();
    expect(introduced.text).toContain("LINTS · +1 −0");
    expect(introduced.text).toContain("+ E2 covered-content");
    expect(introduced.text).not.toContain("E1 covered-content");
    expect(introduced.text).not.toContain("DIAGNOSTICS ·");
    expect(session.lastDiagnostics).toHaveLength(2);

    // The whole list is section ③'s job now: look no longer restates it, and
    // the state block renders exactly this text every request.
    const wholeBoard = formatDiagnostics(runDiagnostics(session.draft));
    expect(wholeBoard).toContain("DIAGNOSTICS · 2 errors");
    expect(wholeBoard).toContain("E1 covered-content");
    expect(wholeBoard).toContain("E2 covered-content");
    expect(wholeBoard).not.toContain("LINTS ·");
    expect(look(session).text).not.toContain("DIAGNOSTICS ·");

    // Fix it: the finding resolves and is reported as −.
    const resolved = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 1480, y: 0, width: 160, height: 96 } },
    });
    expect(resolved.isError).toBeUndefined();
    expect(resolved.text).toContain("LINTS · +0 −1");
    expect(resolved.text).toContain("− E2 covered-content");
    expect(resolved.text).toContain("(resolved)");
    expect(resolved.text).not.toContain("DIAGNOSTICS ·");
    expect(session.lastDiagnostics).toHaveLength(1);

    // An edit that changes no lints reports the delta while one finding remains open.
    const clean = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { text: "renamed" },
    });
    expect(clean.isError).toBeUndefined();
    expect(clean.text).toContain("LINTS · +0 −0 (1 open)");
    expect(clean.text).not.toContain("E1 covered-content");
  });

  test("new findings after the baseline are listed in full with +", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    // Establish the clean lint state with a channel edit.
    runOp(session, "update_object", {
      objectId: "alpha",
      patch: { color: "teal" },
    });

    const introduced = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 40, y: 0, width: 160, height: 96 } },
    });
    expect(introduced.text).toContain("LINTS · +1 −0");
    expect(introduced.text).toContain("  + E1 covered-content:");
  });

  test("added findings carry prose suggestions without structured fixes", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    // A whole-board read establishes the clean diagnostic state.
    look(session);

    // Close the corridor to 44px: both findings explain the measured remedy in prose.
    const introduced = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 204, y: 0, width: 160, height: 96 } },
    });
    // Both the label-fit and arrow-corridor findings land in this delta.
    expect(introduced.text).toContain("LINTS · +2 −0");
    expect(introduced.text).toContain("+ W1 unreadable-labels:");
    expect(introduced.text).toContain("+ W2 crowding:");
    expect(introduced.text).toContain("open the alpha↔beta corridor to ≥");
    expect(introduced.text).not.toContain("suggested op:");
    expect(introduced.text).not.toContain('"type":"updateObject"');
    expect(introduced.text).not.toContain("[quickfix]");
  });

  test("fingerprint matching survives id renumbering", () => {
    // Two separate overlapping pairs → two covered-content errors E1/E2.
    const baseline = makeDocument([
      box("a1", 0, 0),
      box("a2", 40, 0),
      box("b1", 2000, 0),
      box("b2", 2040, 0),
    ]);
    const session = makeTestSession(baseline, ["a1", "a2", "b1", "b2"]);

    // look still refreshes the session's diagnostic baseline; only its text
    // stopped restating the report.
    look(session);
    expect(formatDiagnostics(session.lastDiagnostics!)).toContain("DIAGNOSTICS · 2 errors");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1", "E2"]);

    // Fix pair a. The surviving b-pair finding renumbers E2 → E1,
    // but it is the same finding: not new, not resolved.
    const resolved = runOp(session, "update_object", {
      objectId: "a2",
      patch: { geometry: { x: 480, y: 0, width: 160, height: 96 } },
    });
    expect(resolved.text).toContain("LINTS · +0 −1");
    expect(resolved.text).toContain("− E1 covered-content");
    expect(resolved.text).not.toContain("+ E1 covered-content");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1"]);
  });
});

describe("rendered perception", () => {
  test("look returns the current full-board render and a requested section close-up", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const child = { ...box("child", 64, 96), parentId: "home" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["home"]);

    const edited = runOp(session, "update_object", {
      objectId: "child",
      patch: { geometry: { x: 96, y: 128, width: 160, height: 96 } },
    });
    expect(edited.isError).toBeUndefined();
    expect(edited.pngs).toBeUndefined();

    const result = look(session, "home");

    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(2);
    expect(result.pngs![0]!.length).toBeGreaterThan(0);
    expect(result.pngs![1]!.length).toBeGreaterThan(0);
  });

  test("an applied operation renders only its requested section close-up", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const child = { ...box("child", 64, 96), parentId: "home" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["home"]);

    const result = runOp(session, "update_object", {
      objectId: "child",
      patch: { geometry: { x: 96, y: 128, width: 160, height: 96 } },
      view: "home",
    });

    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]!.length).toBeGreaterThan(0);
  });

  test("an operation that changes nothing is a no-op without perception or an event", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { text: "alpha" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toMatch(/^NO-OP · update_object alpha — [^\n]+$/);
    expect(result.text.split("\n")).toHaveLength(1);
    expect(result.text).not.toContain("DELTA");
    expect(result.text).not.toContain("LINTS");
    expect(result.pngs).toBeUndefined();
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("both geometric and channel edits reach the cumulative diff and the render", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const geometric = runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 480, y: 240, width: 160, height: 96 } },
    });
    expect(geometric.isError).toBeUndefined();
    expect(geometric.pngs).toBeUndefined();

    const channelOnly = runOp(session, "update_object", {
      objectId: "alpha",
      patch: { color: "violet", text: "renamed" },
    });
    expect(channelOnly.isError).toBeUndefined();
    expect(channelOnly.pngs).toBeUndefined();
    expect(channelOnly.text).toContain("alpha  color gray → violet");

    const diff = boardDiffBlock(session);
    expect(diff).toContain("updateObject alpha  retexted · recolored");
    expect(diff).toContain("updateObject beta  moved");

    const result = look(session);
    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]!.length).toBeGreaterThan(0);
  });
});
