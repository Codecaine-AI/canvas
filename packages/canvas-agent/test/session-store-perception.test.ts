import { describe, expect, test } from "bun:test";

import {
  boardDiffBlock,
  boardStateSnapshot,
  bootPerception,
  describeSessionView,
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

  test("seeds the eager current-board render, not the boot images", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const boot = bootPerception(session);

    expect(boot.boardState).toContain("BOARD ·");
    expect(boot.boardState).not.toContain("board render unavailable");
    // The board is working picture: it rides section ③, so it never becomes a
    // reference image pinned into the context message.
    expect(boot.boardView).toBe(true);
    expect(Object.keys(boot.images)).not.toContain("board");
    expect(session.views).toHaveLength(0);
    expect(session.currentBoard?.n).toBe(0);
    expect(session.currentBoard?.summary).toBe("session start");
    expect(session.currentBoard?.forDraft).toBe(session.draft);
    expect(session.currentBoard?.png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
    expect(session.changeRenders).toHaveLength(0);
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
    expect(session.currentBoard).toBeUndefined();
    expect(boot.boardState).toContain("board render unavailable at spawn");
    expect(boot.boardState).toContain("the render is retried on every state assembly");
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

    const moved = runOp(session, "move_to", { id: "beta", x: 320, y: 240 });
    const recolored = runOp(session, "change_color", { id: "alpha", color: "blue" });
    const added = runOp(session, "place_shape", {
      id: "note",
      type: "rectangle",
      at: [960, 0],
    });
    const removed = runOp(session, "delete", { id: "gamma" });

    expect(moved.isError).toBeUndefined();
    expect(moved.text).toContain("APPLIED · move_to beta");
    expect(moved.text).toContain("DELTA");
    expect(moved.text).toContain("beta  320,0 → 320,240");
    expect(recolored.text).toContain("APPLIED · change_color alpha");
    expect(recolored.text).toContain("alpha  color gray → blue");
    expect(added.text).toContain("APPLIED · place_shape note");
    expect(added.text).toContain("+ note  rectangle 960,0 280×100");
    expect(removed.text).toContain("APPLIED · delete gamma (shape)");
    expect(removed.text).toContain("− gamma");
  });

  test("shows membership-reconciliation parentId moves the op payload never named", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeTestSession(baseline, ["section-a", "section-b"]);

    const result = runOp(session, "move_to", { id: "child", x: 580, y: 120 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("child  80,112 → 580,120");
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

    const relabelled = runOp(session, "update_text", { id: "alpha-beta", text: "after" });
    const recolored = runOp(session, "change_color", { id: "alpha-beta", color: "orange" });
    const removed = runOp(session, "delete", { id: "beta-gamma" });
    const added = runOp(session, "connect", {
      id: "alpha-gamma",
      from: { objectId: "alpha" },
      to: { objectId: "gamma" },
    });

    expect(relabelled.isError).toBeUndefined();
    expect(relabelled.text).toContain("APPLIED · update_text alpha-beta");
    expect(relabelled.text).toContain("alpha-beta  label before → after");
    expect(recolored.text).toContain("APPLIED · change_color alpha-beta");
    expect(recolored.text).toContain("alpha-beta  color gray → orange");
    expect(removed.text).toContain("APPLIED · delete beta-gamma (connection)");
    expect(removed.text).toContain("− beta-gamma");
    expect(added.text).toContain("APPLIED · connect alpha-gamma alpha→gamma");
    expect(added.text).toContain("+ alpha-gamma  alpha → gamma");
  });

  test("makes connection steering visible: waypoints, anchors, and position fractions", () => {
    // 80-high boxes so the auto-attachment points land on the agent grid, which
    // is what lets `reroute` draw a corner the router will accept.
    const baseline = makeDocument(
      [box("alpha", 0, 0, 160, 80), box("beta", 480, 160, 160, 80)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const routed = runOp(session, "reroute", {
      id: "alpha-beta",
      points: [[240, 40], [240, 200]],
    });

    expect(routed.isError).toBeUndefined();
    expect(routed.text).toContain("alpha-beta  wp none → 240,40");

    const repointed = runOp(session, "change_connection", {
      id: "alpha-beta",
      patch: {
        from: { objectId: "alpha", anchor: "bottom" },
        to: { objectId: "beta", anchor: "left", position: [0, 0.25] },
      },
    });

    expect(repointed.isError).toBeUndefined();
    expect(repointed.text).toContain("alpha-beta  anchors auto→auto → bottom→left");
    expect(repointed.text).toContain("alpha-beta  pos auto→auto → auto→0,0.25");
    expect(repointed.pngs).toBeUndefined();
    // The steered connection's true route rides with the operation.
    expect(repointed.text).toContain("ROUTES");
    expect(repointed.text).toMatch(/alpha-beta {2}anchors \w+→\w+ {2}path /);
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

    const result = runOp(session, "move_to", { id: "alpha", x: 0, y: 240 });

    expect(result.isError).toBeUndefined();
    const routes = result.text.split("ROUTES")[1]!;
    // alpha moved: alpha-beta re-reports; beta-gamma is untouched.
    expect(routes).toContain("alpha-beta  anchors ");
    // The path speaks the digest's numbered segments (S4.1's shared
    // formatter), so a segment index means the same thing in both blocks.
    expect(routes).toMatch(/ {2}path alpha (─?\(s\d+ [hv] [xy]=-?\d+\)→?\s)+beta {2}through /);
    expect(routes).toContain("  through ");
    expect(routes).not.toContain("beta-gamma");
  });

  test("channel-only edits produce no ROUTES block", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const result = runOp(session, "update_text", { id: "alpha-beta", text: "flows" });

    expect(result.isError).toBeUndefined();
    expect(result.text).not.toContain("ROUTES");
  });

  test("names true non-endpoint boxes the routed path crosses", () => {
    const baseline = makeDocument(
      [
        box("source", 0, 0, 160, 80),
        box("target", 480, 0, 160, 80),
        box("blocker", 240, 0, 160, 80),
      ],
      [connect("wire", "source", "target")],
    );
    const session = makeTestSession(baseline, ["source", "target"]);

    const result = runOp(session, "reroute", {
      id: "wire",
      points: [[200, 40], [440, 40]],
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

    runOp(session, "update_text", { id: "alpha", text: "first pass" });
    runOp(session, "move_to", { id: "alpha", x: 0, y: 240 });
    runOp(session, "delete", { id: "gamma" });
    runOp(session, "place_shape", { id: "note", type: "rectangle", at: [960, 0] });
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

    runOp(session, "update_text", { id: "home", text: "Renamed home" });
    runOp(session, "delete", { id: "note" });
    runOp(session, "place_section", {
      id: "annex",
      text: "Annex",
      at: [0, 400],
      size: { width: 480, height: 320 },
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

    runOp(session, "update_text", { id: "alpha", text: "renamed" });
    runOp(session, "change_color", { id: "alpha", color: "teal" });
    runOp(session, "place_shape", { id: "note", type: "rectangle", at: [640, 0] });
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
    const introduced = runOp(session, "move_to", { id: "beta", x: 1040, y: 0 });
    expect(introduced.isError).toBeUndefined();
    expect(introduced.text).toContain("LINTS · +1 −0");
    expect(introduced.text).toContain("+ E2 covered-content");
    expect(introduced.text).not.toContain("E1 covered-content");
    expect(introduced.text).not.toContain("DIAGNOSTICS ·");
    expect(session.lastDiagnostics).toHaveLength(2);

    // An edit reports movement; the whole list is what a `look` comes back
    // with, and the state block renders exactly this text every request.
    const wholeBoard = formatDiagnostics(runDiagnostics(session.draft));
    expect(wholeBoard).toContain("DIAGNOSTICS · 2 errors");
    expect(wholeBoard).toContain("E1 covered-content");
    expect(wholeBoard).toContain("E2 covered-content");
    expect(wholeBoard).not.toContain("LINTS ·");
    const stepBack = look(session, "alpha").text;
    expect(stepBack).toContain(wholeBoard);
    expect(stepBack).not.toContain("LINTS ·");

    // Fix it: the finding resolves and is reported as −.
    const resolved = runOp(session, "move_to", { id: "beta", x: 1480, y: 0 });
    expect(resolved.isError).toBeUndefined();
    expect(resolved.text).toContain("LINTS · +0 −1");
    expect(resolved.text).toContain("− E2 covered-content");
    expect(resolved.text).toContain("(resolved)");
    expect(resolved.text).not.toContain("DIAGNOSTICS ·");
    expect(session.lastDiagnostics).toHaveLength(1);

    // An edit that changes no lints reports the delta while one finding remains open.
    const clean = runOp(session, "update_text", { id: "alpha", text: "renamed" });
    expect(clean.isError).toBeUndefined();
    expect(clean.text).toContain("LINTS · +0 −0 (1 open)");
    expect(clean.text).not.toContain("E1 covered-content");
  });

  test("new findings after the baseline are listed in full with +", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    // Establish the clean lint state with a channel edit.
    runOp(session, "change_color", { id: "alpha", color: "teal" });

    const introduced = runOp(session, "move_to", { id: "beta", x: 40, y: 0 });
    expect(introduced.text).toContain("LINTS · +1 −0");
    expect(introduced.text).toContain("  + E1 covered-content:");
  });

  test("added findings carry prose suggestions without structured fixes", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    // A deliberate look establishes the clean diagnostic state.
    look(session, "alpha");

    // Close the corridor to 40px: both findings explain the measured remedy in prose.
    const introduced = runOp(session, "move_to", { id: "beta", x: 200, y: 0 });
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

    // look refreshes the session's diagnostic baseline as well as reporting it.
    look(session, "a1");
    expect(formatDiagnostics(session.lastDiagnostics!)).toContain("DIAGNOSTICS · 2 errors");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1", "E2"]);

    // Fix pair a. The surviving b-pair finding renumbers E2 → E1,
    // but it is the same finding: not new, not resolved.
    const resolved = runOp(session, "move_to", { id: "a2", x: 480, y: 0 });
    expect(resolved.text).toContain("LINTS · +0 −1");
    expect(resolved.text).toContain("− E1 covered-content");
    expect(resolved.text).not.toContain("+ E1 covered-content");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1"]);
  });
});

describe("rendered perception", () => {
  test("look returns only the requested section close-up, never a board render", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const child = { ...box("child", 64, 96), parentId: "home" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["home"]);

    const edited = runOp(session, "move_to", { id: "child", x: 100, y: 120 });
    expect(edited.isError).toBeUndefined();
    expect(edited.pngs).toBeUndefined();

    const result = look(session, "home");

    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]!.length).toBeGreaterThan(0);
    expect(result.text).toContain("LOOK · 1 render · close-up home");
  });

  test("an applied operation renders nothing at all", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const child = { ...box("child", 64, 96), parentId: "home" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["home"]);

    const result = runOp(session, "move_to", { id: "child", x: 100, y: 120 });

    // An edit is text. Rasters cost a render each and the model asks for them
    // deliberately, with `look`.
    expect(result.isError).toBeUndefined();
    expect(result.pngs).toBeUndefined();
    expect(session.views).toEqual([]);
  });

  test("an operation that changes nothing is a no-op without perception or an event", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "update_text", { id: "alpha", text: "alpha" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toMatch(/^NO-OP · update_text alpha — [^\n]+$/);
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

    const geometric = runOp(session, "move_to", { id: "beta", x: 480, y: 240 });
    expect(geometric.isError).toBeUndefined();
    expect(geometric.pngs).toBeUndefined();

    runOp(session, "update_text", { id: "alpha", text: "renamed" });
    const channelOnly = runOp(session, "change_color", { id: "alpha", color: "violet" });
    expect(channelOnly.isError).toBeUndefined();
    expect(channelOnly.pngs).toBeUndefined();
    expect(channelOnly.text).toContain("alpha  color gray → violet");

    const diff = boardDiffBlock(session);
    expect(diff).toContain("updateObject alpha  retexted · recolored");
    expect(diff).toContain("updateObject beta  moved");

    const result = look(session, { view: ["alpha", "beta"] });
    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]!.length).toBeGreaterThan(0);
    expect(result.text).toContain(diff);
  });
});

// ─── S4.2 / S4.3 · framed regions ──────────────────────────────────────────

/** A 2×2 grid of 160×96 boxes inside a 640×480 frame — the measured fixture. */
function gridSession() {
  const home = { ...box("home", 0, 0, 640, 480, "section"), text: "Home" };
  const kid = (id: string, x: number, y: number) => ({ ...box(id, x, y), parentId: "home" });
  const baseline = makeDocument([
    home,
    kid("a", 40, 80),
    kid("b", 280, 80),
    kid("c", 40, 240),
    kid("d", 280, 240),
  ]);
  return makeTestSession(baseline, ["home"]);
}

/** alpha and beta 44px apart — a crowding warning with a region to frame. */
function crowdedSession() {
  const baseline = makeDocument([box("alpha", 0, 0), box("beta", 204, 0)]);
  return makeTestSession(baseline, ["alpha", "beta"]);
}

describe("look view: — a union frame over several ids", () => {
  test("renders the union with its ring, logs it as a view, and measures the named bounds", () => {
    const session = gridSession();

    const result = look(session, { view: ["a", "b"] });

    expect(result.isError).toBeUndefined();
    // The union frame is the look's one raster; the board rides the state block.
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]!.length).toBeGreaterThan(0);
    expect(result.text).toContain("LOOK · 1 render · framed a+b");

    // The camera frames the named boxes' union plus the 128px context ring…
    const logged = session.views!.at(-1)!;
    expect(logged.kind).toBe("crop");
    expect(logged.sectionId).toBeNull();
    expect(logged.crop).toEqual({ x: -88, y: -48, width: 656, height: 352 });
    expect(describeSessionView(logged)).toBe("a crop of the region -88,-48 656×352");
  });

  test("the union's MEASURES block reads the named bounds, not the ring", () => {
    const session = gridSession();

    const result = look(session, { view: ["a", "b"] });

    // a right edge 200, b left edge 280 → an 80px corridor; the second row is
    // not named, so there is no y corridor and no y pitch to print.
    expect(result.text).toContain([
      "MEASURES · ids a+b 40,80 400×96",
      "  gaps x  a↔b 80",
      "  pitch x 240",
      "  ink     80%",
    ].join("\n"));
    expect(result.text).not.toContain("gaps y");
  });

  test("an unknown id among known ones costs nothing but a note", () => {
    const session = gridSession();

    const result = look(session, { view: ["a", "ghost"] });

    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(1);
    expect(result.text).toContain("LOOK · 1 render · framed a");
    expect(result.text).toContain(
      'view: no section, object, or connection "ghost" on the board',
    );
    expect(result.text).toContain("MEASURES · object a");
  });
});

describe("look view: — an object close-up", () => {
  test("frames the object's bounds inflated, and measures them uninflated", () => {
    const session = crowdedSession();

    const result = look(session, "beta");

    expect(result.isError).toBeUndefined();
    expect(result.pngs).toHaveLength(1);
    expect(result.text).toContain("LOOK · 1 render · framed beta");
    // The crop carries a 128px context ring so the object is judged in place…
    expect(session.views!.at(-1)!.crop).toEqual({
      x: 76,
      y: -128,
      width: 416,
      height: 352,
    });
    // …while the numbers are the object's own bounds.
    expect(result.text).toContain("MEASURES · object beta 204,0 160×96");
  });

  test("an unknown view id costs the render, not the look", () => {
    const session = crowdedSession();

    const result = look(session, "ghost");

    expect(result.isError).toBeUndefined();
    expect(result.pngs).toBeUndefined();
    expect(result.text).toContain(
      'view: no section, object, or connection "ghost" on the board',
    );
    expect(result.text).not.toContain("MEASURES");
  });
});

describe("look view: — the section close-up is a framed region too", () => {
  test("measures the section it framed, including the free margins a fit would reclaim", () => {
    const session = gridSession();

    const result = look(session, "home");

    expect(result.pngs).toHaveLength(1);
    expect(result.text).toContain([
      "MEASURES · section home 0,0 640×480",
      "  gaps x  a↔b 80 · c↔d 80",
      "  gaps y  a↔c 64 · b↔d 64",
      "  pitch x 240",
      "  pitch y 160",
      "  free    left 16 · right 176 · top 28 · bottom 116",
      "  ink     20%",
    ].join("\n"));
  });

  test("a look that names nothing is refused, pointing at the state block's board", () => {
    const session = gridSession();

    const result = look(session);

    expect(result.isError).toBe(true);
    expect(result.pngs).toBeUndefined();
    expect(result.text).toBe(
      "ERROR · look — name what to frame: "
      + '`look {"view": "sec-flows"}` takes one section or object close up, '
      + '`look {"view": ["obj-a", "obj-b"]}` frames several ids together. '
      + "The current board is already attached to every <state> block, "
      + "so a whole-board look is never needed.",
    );
  });

  test("blank ids are refused the same way as none at all", () => {
    const session = gridSession();

    const result = look(session, { view: ["", "  "] });

    expect(result.isError).toBe(true);
    expect(result.pngs).toBeUndefined();
    expect(result.text).toContain("ERROR · look — name what to frame");
  });
});
