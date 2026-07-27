/**
 * Board v1 state gate — the layout-editor's `state/` sidecar.
 *
 * Covers the three halves of the kernel contract separately and then together:
 * `seed` over the sessionData the store actually sends, one case per `update`
 * rule against the agent's real tool names, and `render` producing a
 * well-formed section ③ — the state block as a LONE text block opening with
 * `<state` (what the per-turn viewer keys its pretty-printer on), the newest
 * views as a second message, and the windowed conversation as the tail.
 *
 * The load-bearing claim the render tests exist for: the board block is read
 * from the live session at render time, so it can never lag the draft, and
 * when the live session is out of reach the block says so instead of lying.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { SpawnContext } from "@agent-kernel/kernel/context";
import {
  normalizeRenderOutput,
  resolveWindowPolicy,
  type AgentMessage,
  type RenderContext,
  type SessionEvent,
} from "@agent-kernel/kernel/state";

import boardState, {
  renderBoardWork,
  seedBoardWork,
  updateBoardWork,
  VIEWS_ATTACHED,
  type BoardWorkState,
} from "../src/agent/catalog/layout-editor/state";
import { formatBoardDigest } from "../src/board/digest";
import {
  forgetLayoutSession,
  recordSessionView,
  registerLayoutSession,
  type LayoutSession,
} from "../src/service/session";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const CONTAINER = "state-test-container";

/** The sessionData shape the layout session store sends at spawn. */
function spawnContext(overrides: Record<string, unknown> = {}): SpawnContext {
  return {
    agentName: "layout-editor",
    sessionData: {
      containerId: CONTAINER,
      sessionId: "session-1",
      editorState: {
        canvasId: "payments",
        instruction: "Line up the three steps",
        baselineHash: "abcdef0123456789aa",
        frame: { x: 0, y: 0, width: 640, height: 320 },
        selection: [
          { id: "alpha", type: "rectangle", text: "Alpha" },
          { id: "beta", type: "rectangle", text: "Beta" },
        ],
        boundaryArrowCount: 1,
        viewport: { rect: { x: -20, y: -20, width: 900, height: 600 }, zoom: 0.8 },
      },
      userRequests: "annotation threads on this board\n  R1 open  object:alpha  human — \"widen it\"",
      boardState: "DESCRIPTION · none\n\nBOARD · spawn snapshot\n  alpha rectangle \"Alpha\" 0,0 160×96",
      boardLints: { errors: 1, warnings: 2 },
      bootImages: { exemplar: "RVg=" },
      ...overrides,
    },
  } as unknown as SpawnContext;
}

let seq = 0;
let messageIndex = 0;

function event(input: Partial<SessionEvent> & { kind: SessionEvent["kind"] }): SessionEvent {
  return {
    seq: seq++,
    messageIndex: messageIndex++,
    timestamp: 1_700_000_000_000,
    ...input,
  } as SessionEvent;
}

function userMessage(text: string): SessionEvent {
  return event({ kind: "user_message", text, imageCount: 0 });
}

function toolCall(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown> = {},
): SessionEvent {
  return event({ kind: "tool_call", toolCallId, toolName, input });
}

function toolResult(
  toolCallId: string,
  toolName: string,
  text: string,
  extra: { isError?: boolean; imageCount?: number } = {},
): SessionEvent {
  return event({
    kind: "tool_result",
    toolCallId,
    toolName,
    text,
    isError: extra.isError ?? false,
    imageCount: extra.imageCount ?? 0,
  });
}

function turnEnd(turnIndex: number): SessionEvent {
  return event({ kind: "turn_end", turnIndex });
}

function fold(state: BoardWorkState, events: SessionEvent[]): BoardWorkState {
  return events.reduce((current, next) => updateBoardWork(current, next), state);
}

function textOf(message: AgentMessage): string {
  const blocks = (message as unknown as { content: Array<{ type: string; text?: string }> }).content;
  return blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n");
}

function blocksOf(message: AgentMessage): Array<{ type: string }> {
  return (message as unknown as { content: Array<{ type: string }> }).content;
}

function transcriptMessage(role: string, text: string): AgentMessage {
  return { role, content: [{ type: "text", text }] } as unknown as AgentMessage;
}

function renderContext(messages: AgentMessage[], turnIndex = 0): RenderContext {
  return {
    agentName: "layout-editor",
    containerId: CONTAINER,
    messages,
    turnIndex,
    // The manifest's policy: a short tail, and no images in it — the state
    // block owns image delivery.
    window: resolveWindowPolicy({ strategy: "turns", maxTurns: 4, maxImages: 0 }),
  };
}

/** A live session published under the render context's container id. */
function liveSession(overrides: Partial<LayoutSession> = {}): LayoutSession {
  const baseline = makeDocument(
    [box("alpha", 0, 0), box("beta", 480, 0)],
    [connect("alpha-beta", "alpha", "beta")],
  );
  const session = makeTestSession(baseline, ["alpha", "beta"], {
    containerId: CONTAINER,
    canvasId: "payments",
    ...overrides,
  });
  registerLayoutSession(session);
  return session;
}

beforeEach(() => {
  // The kernel stamps seq per extension instance, so each test is one run.
  seq = 0;
  messageIndex = 0;
});

afterEach(() => forgetLayoutSession(CONTAINER));

// ─── seed ──────────────────────────────────────────────────────────────────

describe("seed", () => {
  test("reads identity, instruction, and the three retired loaders' snapshots", () => {
    const state = seedBoardWork(spawnContext());

    expect(state.kind).toBe("board-v1");
    expect(state.boardId).toBe("payments");
    expect(state.containerId).toBe(CONTAINER);
    expect(state.sessionId).toBe("session-1");
    expect(state.instructions).toEqual(["Line up the three steps"]);
    // <scope> is the editor snapshot the editor-state loader used to render.
    expect(state.seeded.editor).toContain("canvas: payments (baseline abcdef012345)");
    expect(state.seeded.editor).toContain("scope frame: x=0 y=0 w=640 h=320");
    expect(state.seeded.editor).toContain("selection (2 objects in scope):");
    expect(state.seeded.editor).toContain('- rectangle "Alpha" (alpha)');
    expect(state.seeded.editor).toContain("arrows crossing the scope edge: 1");
    expect(state.seeded.editor).toContain("user viewport: x=-20 y=-20 w=900 h=600 zoom=0.8");
    // The board-state and user-requests snapshots ride through untouched.
    expect(state.seeded.board).toContain("BOARD · spawn snapshot");
    expect(state.seeded.requests).toContain("R1 open");
    expect(state.seeded.lints).toEqual({ errors: 1, warnings: 2 });
    // Nothing has happened yet.
    expect(state.ops).toEqual([]);
    expect(state.views).toEqual([]);
    expect(state.turns).toBe(0);
    expect(state.outcome).toBeNull();
    expect(state.lastEventSeq).toBe(-1);
  });

  test("degrades to an empty picture when sessionData is absent", () => {
    const state = seedBoardWork({ agentName: "layout-editor" } as unknown as SpawnContext);

    expect(state.boardId).toBe("layout-editor");
    expect(state.containerId).toBeNull();
    expect(state.instructions).toEqual([]);
    expect(state.seeded.board).toBe("");
    expect(state.seeded.requests).toContain("none — no user comments");
    expect(state.seeded.lints).toEqual({ errors: 0, warnings: 0 });
  });

  test("carries a prior run's op log forward and re-takes the snapshots", () => {
    const prior = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "update_object", { objectId: "alpha" }),
      toolResult("c1", "update_object", "APPLIED · update_object alpha"),
    ]);
    const reseeded = seedBoardWork(
      spawnContext({ boardState: "BOARD · a later snapshot" }),
      prior,
    );

    expect(reseeded.ops).toHaveLength(1);
    expect(reseeded.ops[0]!.tool).toBe("update_object");
    expect(reseeded.seeded.board).toBe("BOARD · a later snapshot");
    // Per-run counters restart; the run's turn index does not carry over.
    expect(reseeded.turns).toBe(0);
    expect(reseeded.views).toEqual([]);
  });
});

// ─── update ────────────────────────────────────────────────────────────────

describe("update", () => {
  test("a user message becomes steering the short tail cannot lose", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      userMessage("Line up the three steps"),
      userMessage("actually, make the retry path clearer"),
    ]);

    expect(state.userMessages).toBe(2);
    // The seeded instruction is not duplicated; the new steering is kept.
    expect(state.instructions).toEqual([
      "Line up the three steps",
      "actually, make the retry path clearer",
    ]);
  });

  test("a mutator call and result become one op line with its target", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "update_object", {
        objectId: "alpha",
        patch: { geometry: { x: 120, y: 80, width: 140, height: 60 } },
      }),
      toolResult("c1", "update_object", "APPLIED · update_object alpha\nDELTA\n  alpha  0,0 → 120,80"),
    ]);

    expect(state.toolCalls).toBe(1);
    expect(state.toolErrors).toBe(0);
    expect(state.ops).toEqual([{
      turn: 0,
      tool: "update_object",
      target: "alpha",
      status: "applied",
      summary: "APPLIED · update_object alpha",
    }]);
    // The pending entry is consumed by its result.
    expect(state.pending).toEqual({});
  });

  test("classifies no-ops and errors rather than logging them as applied", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "add_sticky", { sticky: { id: "note" } }),
      toolResult("c1", "add_sticky", "NO-OP · add_sticky note — the board already matches this."),
      toolCall("c2", "remove_object", { objectId: "ghost" }),
      toolResult("c2", "remove_object", "ERROR · remove_object — no object \"ghost\".", {
        isError: true,
      }),
    ]);

    expect(state.ops.map((op) => [op.tool, op.target, op.status])).toEqual([
      ["add_sticky", "note", "noop"],
      ["remove_object", "ghost", "error"],
    ]);
    expect(state.toolErrors).toBe(1);
  });

  test("look records a board view, and a view= argument records a close-up", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "look", { view: "sec-auth" }),
      toolResult("c1", "look", "LOOK · 2 renders · close-up sec-auth", { imageCount: 2 }),
      turnEnd(0),
      toolCall("c2", "update_object", { objectId: "alpha", view: "sec-auth" }),
      toolResult("c2", "update_object", "APPLIED · update_object alpha", { imageCount: 1 }),
    ]);

    expect(state.views).toEqual([
      { turn: 0, kind: "board", sectionId: null },
      { turn: 0, kind: "section", sectionId: "sec-auth" },
      { turn: 1, kind: "section", sectionId: "sec-auth" },
    ]);
    // look is a read: it never joins the op log.
    expect(state.ops.map((op) => op.tool)).toEqual(["update_object"]);
  });

  test("a render that failed contributes no view ref, whatever was asked for", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "look", { view: "missing" }),
      toolResult("c1", "look", "LOOK · 0 renders\nrender failed: view \"missing\"", {
        imageCount: 0,
      }),
    ]);

    expect(state.views).toEqual([]);
  });

  test("the queue and description tools join the op log; finalize records the outcome", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "resolve_request", { id: "R1", status: "done", note: "widened it" }),
      toolResult("c1", "resolve_request", "REQUESTS · 1/1 disposed"),
      toolCall("c2", "update_description", { description: "# Payments\n\nA long account…" }),
      toolResult("c2", "update_description", "APPLIED · updateDescription"),
      toolCall("c3", "finalize", { outcome: "committed", message: "Lined the steps up." }),
      toolResult("c3", "finalize", "Committed: Lined the steps up. (4 patch operations)."),
    ]);

    expect(state.ops.map((op) => [op.tool, op.target])).toEqual([
      ["resolve_request", "R1"],
      // A description is not an id, so the op line names no target rather
      // than dragging the whole markdown body onto it.
      ["update_description", null],
    ]);
    expect(state.outcome).toEqual({ outcome: "committed", message: "Lined the steps up." });
  });

  test("turn_end advances the turn the op log stamps", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      turnEnd(0),
      turnEnd(1),
      toolCall("c1", "add_object", { object: { id: "note" } }),
      toolResult("c1", "add_object", "APPLIED · add_object note"),
    ]);

    expect(state.turns).toBe(2);
    expect(state.ops[0]!.turn).toBe(2);
    expect(state.ops[0]!.target).toBe("note");
  });

  test("every event advances lastEventSeq and leaves the input untouched", () => {
    const before = seedBoardWork(spawnContext());
    const snapshot = JSON.stringify(before);
    const after = fold(before, [userMessage("go"), turnEnd(0)]);

    expect(after.lastEventSeq).toBeGreaterThan(before.lastEventSeq);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

// ─── serializability ───────────────────────────────────────────────────────

describe("JSON round-trip", () => {
  test("a worked state survives stringify/parse unchanged", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      userMessage("Line up the three steps"),
      toolCall("c1", "update_object", { objectId: "alpha", patch: { color: "blue" } }),
      toolResult("c1", "update_object", "APPLIED · update_object alpha", { imageCount: 0 }),
      turnEnd(0),
      toolCall("c2", "look", {}),
      toolResult("c2", "look", "LOOK · 1 render", { imageCount: 1 }),
      // Left in flight on purpose: the pending map must survive too.
      toolCall("c3", "add_connection", { connection: { id: "edge" } }),
    ]);

    const roundTripped = JSON.parse(JSON.stringify(state)) as BoardWorkState;

    expect(roundTripped).toEqual(state);
    expect(roundTripped.pending.c3).toEqual({
      tool: "add_connection",
      input: { connection: { id: "edge" } },
    });
    // And it is a legal input to the next update.
    expect(updateBoardWork(roundTripped, turnEnd(1)).turns).toBe(2);
  });
});

// ─── render ────────────────────────────────────────────────────────────────

describe("render", () => {
  test("the state block is a lone text block opening with <state", () => {
    liveSession();
    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));

    const [head] = rendered.messages;
    expect(blocksOf(head!)).toHaveLength(1);
    expect(blocksOf(head!)[0]!.type).toBe("text");
    // The viewer's state pretty-printer keys on exactly this.
    expect(/^\s*<state(?:\s[^<>]*)?>/.test(textOf(head!))).toBe(true);
    expect(textOf(head!).endsWith("</state>")).toBe(true);
  });

  test("emits every section, and the board block is the CURRENT draft", () => {
    const session = liveSession();
    // Edit the board after seeding: the state block must show the edit, not
    // the snapshot seed() captured.
    runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 480, y: 240, width: 160, height: 96 } },
    });

    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "update_object", { objectId: "beta" }),
      toolResult("c1", "update_object", "APPLIED · update_object beta"),
      turnEnd(0),
    ]);
    const block = textOf(renderBoardWork(state, renderContext([], 1)).messages[0]!);

    // v is the event counter (3 folded), turn is 1-based for the reader.
    expect(block).toContain('<state v="3" turn="2" board="payments">');
    expect(block).toContain("<instruction>\nLine up the three steps\n</instruction>");
    expect(block).toContain("<scope>");
    expect(block).toContain('<board fresh="yes" objects="2" edges="1">');
    // Byte-for-byte the digest grammar, over the live draft.
    expect(block).toContain(formatBoardDigest(session.draft));
    expect(block).toContain("beta rectangle \"beta\" 480,240 160×96");
    expect(block).not.toContain("BOARD · spawn snapshot");
    expect(block).toContain('<ops total="1" showing="1">');
    expect(block).toContain("  t1 update_object beta · APPLIED · update_object beta");
    expect(block).toContain("<diff>\nBOARD DIFF · base → draft · 1 op");
    expect(block).toContain('<lints errors="0" warnings="0">');
    expect(block).toContain("0 errors · 0 warnings (was 1 · 2 at spawn)");
    expect(block).toContain('<requests open="0">');
    expect(block).toContain('<views attached="0" taken="0">');
    expect(block).toContain("<conversation>");
    // Section order is the reading order the prompt teaches.
    const order = [
      "<instruction>",
      "<scope>",
      "<board ",
      "<ops ",
      "<diff>",
      "<lints ",
      "<requests ",
      "<views ",
      "<conversation>",
    ].map((tag) => block.indexOf(tag));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index > -1)).toBe(true);
  });

  test("without a live session the board block is marked stale, not silently old", () => {
    // No registerLayoutSession: this is the replay / out-of-process case.
    const block = textOf(
      renderBoardWork(seedBoardWork(spawnContext()), renderContext([])).messages[0]!,
    );

    expect(block).toContain('<board fresh="no">');
    expect(block).toContain("may be out of date");
    expect(block).toContain("BOARD · spawn snapshot");
    // The seeded queue and lint counts stand in for the live ones.
    expect(block).toContain('<requests open="?">');
    expect(block).toContain('<lints errors="1" warnings="2">');
    expect(block).not.toContain("<diff>");
  });

  test("a draft that cannot be read degrades the block instead of deleting it", () => {
    // A throw inside render costs the request its whole state block (the
    // kernel's context hook passes the request through untouched), so a
    // malformed draft must fall back rather than propagate.
    const session = liveSession();
    session.draft = { ...session.draft, objects: null as never };

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));
    const block = textOf(rendered.messages[0]!);

    expect(rendered.messages.length).toBeGreaterThan(0);
    expect(block).toContain('<board fresh="no">');
    expect(block).toContain("BOARD · spawn snapshot");
  });

  test("attaches the newest views as a second message, newest first", () => {
    const session = liveSession();
    for (let i = 0; i < VIEWS_ATTACHED + 2; i += 1) {
      recordSessionView(session, "board", null, Buffer.from(`board-${i}`));
    }
    recordSessionView(session, "section", "home", Buffer.from("close-up"));

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));

    expect(rendered.stateMessageCount).toBe(2);
    const attachment = rendered.messages[1]!;
    const blocks = blocksOf(attachment);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks.slice(1).map((entry) => entry.type)).toEqual(
      Array.from({ length: VIEWS_ATTACHED }, () => "image"),
    );
    expect(textOf(attachment)).toContain("(1) a close-up of section home");
    expect(textOf(attachment)).toContain("(2) the full board");
    expect(textOf(rendered.messages[0]!)).toContain(`<views attached="${VIEWS_ATTACHED}" taken="0">`);
  });

  test("the tail is the windowed conversation, and the block says what was cut", () => {
    liveSession();
    const messages: AgentMessage[] = [];
    for (let turn = 0; turn < 7; turn += 1) {
      messages.push(transcriptMessage("user", `turn ${turn}`));
      messages.push(transcriptMessage("assistant", `reply ${turn}`));
    }

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext(messages, 6));
    const normalized = normalizeRenderOutput(rendered);

    // maxTurns 4 → the four newest turns survive as real messages.
    const tail = normalized.messages.slice(normalized.stateMessageCount);
    expect(tail).toHaveLength(8);
    expect(textOf(tail[0]!)).toBe("turn 3");
    expect(textOf(tail[7]!)).toBe("reply 6");
    const block = textOf(normalized.messages[0]!);
    expect(block).toContain("[turns 1–3 elided] — the board block above is the current truth");
    expect(block).toContain("showing 4 of 7 turns");
  });

  test("the module the kernel imports is the same three functions", () => {
    liveSession();
    const state = boardState.seed(spawnContext());
    const advanced = boardState.update(state, userMessage("go"));
    const output = normalizeRenderOutput(boardState.render(advanced, renderContext([])));

    expect(advanced.userMessages).toBe(1);
    expect(output.stateMessageCount).toBe(1);
    expect(textOf(output.messages[0]!).startsWith("<state ")).toBe(true);
  });
});

// ─── one worked run ────────────────────────────────────────────────────────

describe("a full mock turn sequence", () => {
  test("seed → three turns of tool traffic → render tracks the board throughout", () => {
    const session = liveSession();
    let state = seedBoardWork(spawnContext());

    // Turn 1: the operator's ask, then one applied move.
    state = fold(state, [userMessage("Line up the three steps")]);
    runOp(session, "update_object", {
      objectId: "beta",
      patch: { geometry: { x: 480, y: 96, width: 160, height: 96 } },
    });
    state = fold(state, [
      toolCall("c1", "update_object", { objectId: "beta" }),
      toolResult("c1", "update_object", "APPLIED · update_object beta"),
      turnEnd(0),
    ]);

    let block = textOf(renderBoardWork(state, renderContext([], 1)).messages[0]!);
    expect(block).toContain("beta rectangle \"beta\" 480,96 160×96");
    expect(block).toContain('<ops total="1" showing="1">');
    expect(block).toContain("BOARD DIFF · base → draft · 1 op");

    // Turn 2: a deliberate look. Its raster lands on the view log, which is
    // where render() picks it up (rasterizing here would only test resvg).
    recordSessionView(session, "board", null, Buffer.from("render"));
    state = fold(state, [
      toolCall("c2", "look", {}),
      toolResult("c2", "look", "LOOK · 1 render", { imageCount: 1 }),
      turnEnd(1),
    ]);

    const rendered = renderBoardWork(state, renderContext([], 2));
    expect(rendered.stateMessageCount).toBe(2);
    block = textOf(rendered.messages[0]!);
    expect(block).toContain('<views attached="1" taken="1">');
    expect(block).toContain("(1) the full board");

    // Turn 3: a new object, then a committed finalize.
    runOp(session, "add_object", {
      object: {
        id: "gamma",
        type: "rectangle",
        text: "Gamma",
        geometry: { x: 960, y: 0, width: 160, height: 96 },
      },
    });
    state = fold(state, [
      toolCall("c3", "add_object", { object: { id: "gamma" } }),
      toolResult("c3", "add_object", "APPLIED · add_object gamma"),
      toolCall("c4", "finalize", { outcome: "committed", message: "Lined the steps up." }),
      toolResult("c4", "finalize", "Committed: Lined the steps up. (2 patch operations)."),
      turnEnd(2),
    ]);

    block = textOf(renderBoardWork(state, renderContext([], 3)).messages[0]!);
    expect(state.outcome).toEqual({ outcome: "committed", message: "Lined the steps up." });
    expect(block).toContain('<board fresh="yes" objects="3" edges="1">');
    expect(block).toContain('gamma rectangle "Gamma" 960,0 160×96');
    expect(block).toContain('<ops total="2" showing="2">');
    expect(block).toContain("  t1 update_object beta");
    expect(block).toContain("  t3 add_object gamma");
    // The whole run's state is still a JSON document.
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
