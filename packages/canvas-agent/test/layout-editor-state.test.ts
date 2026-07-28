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
 * The load-bearing claim the render tests exist for: every applied gesture
 * eagerly refreshes the session's current-board raster, and state assembly
 * attaches that raster followed by the three preceding change renders.
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
  BOARD_TOOLS,
  MUTATION_TOOLS,
  renderBoardWork,
  seedBoardWork,
  TAIL_MESSAGES,
  updateBoardWork,
  VIEWS_ATTACHED,
  type BoardWorkState,
} from "../src/catalog/layout-editor/state";
import { targetOf } from "../src/catalog/layout-editor/state/rules/operations";
import { lintsBlock } from "../src/catalog/layout-editor/state/render/lints";
import { operationTools } from "../src/service/session/tools/operations";
import {
  formatBoardEdgesDigest,
  formatBoardObjectsDigest,
} from "../src/board/digest";
import {
  BOARD_VIEW_WIDTH,
  emitSessionEvent,
  forgetLayoutSession,
  registerLayoutSession,
  renderBoardView,
  toolAddAnnotation,
  toolReplyAnnotation,
  toolResolveRequest,
  toolSetBoardTitle,
  toolUpdateDescription,
  type LayoutSession,
} from "../src/service/session";
import { rasterizeSvgToPng } from "../src/service/render";
import { look, makeTestSession, runOp } from "./helpers";
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

function imageBuffersOf(message: AgentMessage): Buffer[] {
  const blocks = (message as unknown as {
    content: Array<{ type: string; data?: string }>;
  }).content;
  return blocks
    .filter((block): block is { type: string; data: string } => (
      block.type === "image" && block.data !== undefined
    ))
    .map((block) => Buffer.from(block.data, "base64"));
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
    // The manifest's policy: a short tail whose recent look results retain
    // their framed close-ups and crops.
    window: resolveWindowPolicy({ strategy: "turns", maxTurns: 4, maxImages: 4 }),
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
  test("reads identity, instruction, and the retired loaders' snapshots", () => {
    const state = seedBoardWork(spawnContext());

    expect(state.kind).toBe("board-v1");
    expect(state.boardId).toBe("payments");
    expect(state.containerId).toBe(CONTAINER);
    expect(state.sessionId).toBe("session-1");
    expect(state.instructions).toEqual(["Line up the three steps"]);
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
      toolCall("c1", "move_to", { id: "alpha", x: 120, y: 80 }),
      toolResult("c1", "move_to", "APPLIED · move_to alpha → 120,80"),
    ]);
    const reseeded = seedBoardWork(
      spawnContext({ boardState: "BOARD · a later snapshot" }),
      prior,
    );

    expect(reseeded.ops).toHaveLength(1);
    expect(reseeded.ops[0]!.tool).toBe("move_to");
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

  test("a whitespace-padded seeded instruction still dedupes its spawn echo", () => {
    // The harness passes the same instruction string to editorState and to the
    // spawn user message; the seed trims so the steering dedupe (which trims)
    // cannot be defeated by trailing whitespace.
    const seeded = seedBoardWork(spawnContext({
      editorState: { canvasId: "payments", instruction: "Line up the three steps\n" },
    }));
    expect(seeded.instructions).toEqual(["Line up the three steps"]);

    const state = fold(seeded, [userMessage("Line up the three steps")]);
    expect(state.instructions).toEqual(["Line up the three steps"]);
  });

  test("a mutator call and result become one op line with its target", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "move_to", { id: "alpha", x: 120, y: 80 }),
      toolResult("c1", "move_to", "APPLIED · move_to alpha → 120,80\nDELTA\n  alpha  0,0 → 120,80"),
    ]);

    expect(state.toolCalls).toBe(1);
    expect(state.toolErrors).toBe(0);
    expect(state.ops).toEqual([{
      turn: 0,
      tool: "move_to",
      target: "alpha",
      status: "applied",
      summary: "APPLIED · move_to alpha → 120,80",
    }]);
    // The pending entry is consumed by its result.
    expect(state.pending).toEqual({});
  });

  test("classifies no-ops and errors rather than logging them as applied", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "change_color", { id: "note", color: "yellow" }),
      toolResult("c1", "change_color", "NO-OP · change_color note — the board already matches this."),
      toolCall("c2", "delete", { id: "ghost" }),
      toolResult("c2", "delete", "ERROR · delete — id \"ghost\" is not on the board.", {
        isError: true,
      }),
    ]);

    expect(state.ops.map((op) => [op.tool, op.target, op.status])).toEqual([
      ["change_color", "note", "noop"],
      ["delete", "ghost", "error"],
    ]);
    expect(state.toolErrors).toBe(1);
  });

  test("look records a close-up ref for the section it framed", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "look", { view: "sec-auth" }),
      toolResult("c1", "look", "LOOK · 1 render · close-up sec-auth", { imageCount: 1 }),
      turnEnd(0),
      // A mutator carries no framing knob and returns no image, so the edit
      // between two looks contributes nothing to the view log.
      toolCall("c2", "move_to", { id: "alpha", x: 120, y: 80 }),
      toolResult("c2", "move_to", "APPLIED · move_to alpha → 120,80"),
      toolCall("c3", "look", { view: ["alpha", "beta"] }),
      toolResult("c3", "look", "LOOK · 1 render · framed alpha+beta", { imageCount: 1 }),
    ]);

    expect(state.views).toEqual([
      { turn: 0, kind: "section", sectionId: "sec-auth" },
      { turn: 1, kind: "crop", sectionId: null, region: "ids alpha+beta" },
    ]);
    // look is a read: it never joins the op log.
    expect(state.ops.map((op) => op.tool)).toEqual(["move_to"]);
  });

  test("each look records the one ref for the region it framed", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "look", { view: "sec-auth" }),
      toolResult("c1", "look", "LOOK · 1 render · close-up sec-auth", { imageCount: 1 }),
      toolCall("c2", "look", { view: ["alpha", "beta"] }),
      toolResult("c2", "look", "LOOK · 1 render · framed alpha+beta", { imageCount: 1 }),
    ]);

    // One framed region per look; no board ref, since a look renders no board.
    expect(state.views).toEqual([
      { turn: 0, kind: "section", sectionId: "sec-auth" },
      { turn: 0, kind: "crop", sectionId: null, region: "ids alpha+beta" },
    ]);
  });

  test("a malformed view knob records no ref", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "look", { view: [""] }),
      toolResult("c1", "look", "LOOK · 0 renders", { imageCount: 0 }),
    ]);

    expect(state.views).toEqual([]);
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
      toolCall("c1", "place_shape", { id: "note", type: "rectangle", at: [960, 0] }),
      toolResult("c1", "place_shape", "APPLIED · place_shape note rectangle 960,0 280×100"),
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

// ─── the ledger's roster seam ──────────────────────────────────────────────

/**
 * A minimal legal input for a tool, built from its own wire schema. Not a
 * fixture: the point is that `targetOf` is exercised against whatever shape
 * the descriptor actually declares, so a gesture landing with a target field
 * the sniffing does not know about fails here rather than logging a nameless
 * op line for the rest of its life.
 */
interface WireSchema {
  type?: string;
  enum?: unknown[];
  anyOf?: WireSchema[];
  items?: WireSchema;
  minItems?: number;
  properties?: Record<string, WireSchema>;
  required?: string[];
}

function sampleValue(schema: WireSchema, seed: number): unknown {
  if (schema.enum !== undefined) return schema.enum[0];
  if (schema.anyOf !== undefined) return sampleValue(schema.anyOf[0]!, seed);
  switch (schema.type) {
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return true;
    case "array": {
      const count = Math.max(schema.minItems ?? 1, 1);
      return Array.from(
        { length: count },
        (_unused, index) => sampleValue(schema.items ?? { type: "string" }, seed + index),
      );
    }
    case "object":
      return sampleInput(schema, seed);
    default:
      // Ids are the only strings with a pattern on this surface, and the
      // pattern accepts a plain word.
      return `sample${seed}`;
  }
}

function sampleInput(schema: WireSchema, seed = 0): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [index, name] of (schema.required ?? []).entries()) {
    const field = schema.properties?.[name];
    if (field) input[name] = sampleValue(field, seed + index);
  }
  return input;
}

describe("the op ledger tracks the tool roster", () => {
  test("every registered mutator is a logged mutator", () => {
    const registered = operationTools.map((tool) => tool.name);
    expect([...MUTATION_TOOLS].sort()).toEqual([...registered].sort());
    // Nothing stale: the set is derived, so it cannot name a retired tool.
    expect(MUTATION_TOOLS.size).toBe(registered.length);
  });

  test("the board tools are the mutators plus the five that write outside them", () => {
    const extra = [...BOARD_TOOLS].filter((tool) => !MUTATION_TOOLS.has(tool));
    expect(extra.sort()).toEqual([
      "add_annotation",
      "reply_annotation",
      "resolve_request",
      "set_board_title",
      "update_description",
    ]);
  });

  test("every gesture schema yields a target the ledger can name", () => {
    for (const tool of operationTools) {
      const input = sampleInput(tool.parameters as unknown as WireSchema);
      expect(targetOf(input), tool.name).not.toBeNull();
    }
  });

  test("a multi-id arrange gesture names the first box and counts the rest", () => {
    expect(targetOf({ ids: ["alpha", "beta", "gamma"], edge: "left" })).toBe("alpha +2");
    expect(targetOf({ ids: ["alpha"], edge: "left" })).toBe("alpha");
  });

  test("a clone logs the copy it made, not the original it read", () => {
    expect(targetOf({ sourceId: "alpha", id: "alpha-copy" })).toBe("alpha-copy");
  });

  test("a call with no id has no target — a description is not an id", () => {
    expect(targetOf({ description: "a board about payments" })).toBeNull();
    expect(targetOf({})).toBeNull();
  });
});

// ─── serializability ───────────────────────────────────────────────────────

describe("JSON round-trip", () => {
  test("a worked state survives stringify/parse unchanged", () => {
    const state = fold(seedBoardWork(spawnContext()), [
      userMessage("Line up the three steps"),
      toolCall("c1", "change_color", { id: "alpha", color: "blue" }),
      toolResult("c1", "change_color", "APPLIED · change_color alpha", { imageCount: 0 }),
      turnEnd(0),
      toolCall("c2", "look", {}),
      toolResult("c2", "look", "LOOK · 1 render", { imageCount: 1 }),
      // Left in flight on purpose: the pending map must survive too.
      toolCall("c3", "connect", {
        id: "edge",
        from: { objectId: "alpha" },
        to: { objectId: "beta" },
      }),
    ]);

    const roundTripped = JSON.parse(JSON.stringify(state)) as BoardWorkState;

    expect(roundTripped).toEqual(state);
    expect(roundTripped.pending.c3).toEqual({
      tool: "connect",
      input: {
        id: "edge",
        from: { objectId: "alpha" },
        to: { objectId: "beta" },
      },
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
    runOp(session, "move_to", { id: "beta", x: 480, y: 240 });

    const state = fold(seedBoardWork(spawnContext()), [
      toolCall("c1", "move_to", { id: "beta", x: 480, y: 240 }),
      toolResult("c1", "move_to", "APPLIED · move_to beta → 480,240"),
      turnEnd(0),
    ]);
    const block = textOf(renderBoardWork(state, renderContext([], 1)).messages[0]!);

    // v is the event counter (3 folded), turn is 1-based for the reader.
    expect(block).toContain('<state v="3" turn="2" board="payments">');
    // Child tags are indented one level, their bodies two.
    expect(block).toContain(
      "    <instruction>\n        Line up the three steps\n    </instruction>",
    );
    expect(block).toContain('<board fresh="yes" objects="2" edges="1">');
    expect(block).toContain("        <description />");
    const indentedObjects = formatBoardObjectsDigest(session.draft)
      .split("\n")
      .map((line) => (line.length > 0 ? `            ${line}` : line))
      .join("\n");
    expect(block).toContain([
      "        <objects>",
      indentedObjects,
      "        </objects>",
    ].join("\n"));
    const indentedEdges = formatBoardEdgesDigest(session.draft)
      .split("\n")
      .map((line) => (line.length > 0 ? `            ${line}` : line))
      .join("\n");
    expect(block).toContain([
      "        <edges>",
      indentedEdges,
      "        </edges>",
    ].join("\n"));
    expect(block).toContain("beta rectangle \"beta\" 480,240 160×96");
    expect(block).not.toContain("BOARD · spawn snapshot");
    expect(block).toContain('<recent_ops total="1" showing="1">');
    // The op line is built from the ledger fields; the summary's own
    // `APPLIED · move_to beta` prefix is not printed a second time.
    expect(block).toContain("t1 move_to beta → 480,240");
    expect(block).not.toContain("· APPLIED · move_to");
    expect(block).toContain("<diff>\n        BOARD DIFF · base → draft · 1 op");
    // A clean board is a self-closing lints tag: counts live in the attrs only.
    expect(block).toContain('<lints errors="0" warnings="0" />');
    expect(block).toContain('<requests open="0">');
    expect(block).toContain('<views attached="1" prior_changes="0">');
    expect(block).toContain("<recent_conversation ");
    // Section order is the reading order the prompt teaches.
    const order = [
      "<instruction>",
      "<board ",
      "<recent_ops ",
      "<diff>",
      "<lints ",
      "<requests ",
      "<views ",
      "<recent_conversation ",
    ].map((tag) => block.indexOf(tag));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index > -1)).toBe(true);
  });

  test("open findings group under severity child tags; counts live in attrs only", () => {
    const live = {
      descriptionMarkdown: "",
      objectsText: "",
      edgesText: "",
      objects: 0,
      edges: 0,
      errorLines: ["E1 containment: alpha sticks out of home"],
      warningLines: [
        "W1 crowding: a and b sit 40px apart",
        "W2 crowding: b and c sit 40px apart",
      ],
      errors: 1,
      warnings: 2,
      requests: "",
      openRequests: 0,
      diff: "",
    };
    const lines = lintsBlock(seedBoardWork(spawnContext()), live).join("\n");

    expect(lines).toBe([
      '    <lints errors="1" warnings="2">',
      "        <errors>",
      "            E1 containment: alpha sticks out of home",
      "        </errors>",
      "        <warnings>",
      "            W1 crowding: a and b sit 40px apart",
      "            W2 crowding: b and c sit 40px apart",
      "        </warnings>",
      "    </lints>",
    ].join("\n"));
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

  test("a missing eager render falls back lazily and degrades without deleting state", () => {
    // A throw inside render costs the request its whole state block (the
    // kernel's context hook passes the request through untouched), so a
    // malformed bare session must degrade rather than propagate.
    const session = liveSession();
    session.draft = { ...session.draft, objects: null as never };

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));
    const block = textOf(rendered.messages[0]!);

    expect(rendered.messages.length).toBeGreaterThan(0);
    expect(block).toContain('<board fresh="no">');
    expect(block).toContain("BOARD · spawn snapshot");
    expect(block).toContain('<views attached="0"');
    expect(block).toContain("render failed: board view —");
    expect(rendered.stateMessageCount).toBe(1);
  });

  test("attaches current plus the three prior changes, newest first with summaries", () => {
    const session = liveSession();
    for (const y of [100, 200, 300, 400]) {
      runOp(session, "move_to", { id: "beta", x: 480, y });
    }
    expect(VIEWS_ATTACHED).toBe(4);
    expect(session.changeRenders).toHaveLength(4);
    const current = session.currentBoard;
    if (!current) throw new Error("Applied operations did not eagerly render the current board.");
    const changes = session.changeRenders;

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));

    expect(rendered.stateMessageCount).toBe(2);
    const attachment = rendered.messages[1]!;
    const blocks = blocksOf(attachment);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks.slice(1).map((entry) => entry.type)).toEqual(
      Array.from({ length: VIEWS_ATTACHED }, () => "image"),
    );
    expect(imageBuffersOf(attachment)).toEqual([
      current.png,
      changes[2]!.png,
      changes[1]!.png,
      changes[0]!.png,
    ]);
    const caption = textOf(attachment);
    expect(caption).toContain("(1) the board as it stands now");
    expect(caption).toContain(`(2) after ${changes[2]!.summary}`);
    expect(caption).toContain(`(3) after ${changes[1]!.summary}`);
    expect(caption).toContain(`(4) after ${changes[0]!.summary}`);
    expect(caption.indexOf(changes[2]!.summary)).toBeLessThan(
      caption.indexOf(changes[1]!.summary),
    );
    expect(caption.indexOf(changes[1]!.summary)).toBeLessThan(
      caption.indexOf(changes[0]!.summary),
    );
    expect(textOf(rendered.messages[0]!)).toContain(
      `<views attached="${VIEWS_ATTACHED}"`,
    );
  });

  test("an applied operation eagerly stores pixels for the exact current draft", () => {
    const session = liveSession();
    runOp(session, "move_to", { id: "beta", x: 480, y: 240 });
    const expected = rasterizeSvgToPng(
      renderBoardView(session.draft, { width: BOARD_VIEW_WIDTH }).svg,
    ).png;

    const current = session.currentBoard;
    expect(current?.png).toBeInstanceOf(Buffer);
    if (!current) throw new Error("Applied operation did not eagerly render the current board.");
    expect(current.png.equals(expected)).toBe(true);
    expect(current.n).toBe(session.proposalCount);
    expect(session.changeRenders).toHaveLength(1);
    expect(session.changeRenders[0]!.png).toBe(current.png);
  });

  test("fewer than four changes produce fewer images and are never padded", () => {
    const session = liveSession();
    const state = seedBoardWork(spawnContext());

    runOp(session, "move_to", { id: "beta", x: 480, y: 100 });
    const afterOne = renderBoardWork(state, renderContext([]));
    expect(imageBuffersOf(afterOne.messages[1]!)).toEqual([
      session.currentBoard!.png,
    ]);

    const firstChange = session.changeRenders[0]!;
    runOp(session, "move_to", { id: "beta", x: 480, y: 200 });
    const afterTwo = renderBoardWork(state, renderContext([]));
    expect(imageBuffersOf(afterTwo.messages[1]!)).toEqual([
      session.currentBoard!.png,
      firstChange.png,
    ]);
    expect(blocksOf(afterTwo.messages[1]!)).toHaveLength(3);
  });

  test("look renders only its framed region and leaves the eager board pixels alone", () => {
    const session = liveSession();
    runOp(session, "move_to", { id: "beta", x: 480, y: 240 });
    const current = session.currentBoard;
    if (!current) throw new Error("Applied operation did not eagerly render the current board.");

    const looked = look(session, { view: ["alpha", "beta"] });
    expect(looked.pngs).toHaveLength(1);
    // The framed region is its own raster — the board pixels stay the state block's.
    expect(looked.pngs![0]!.equals(current.png)).toBe(false);
    expect(session.currentBoard).toBe(current);
  });

  test("every workflow draft write refreshes the board the state attachments carry", () => {
    const session = liveSession();
    const expectCurrentAttached = () => {
      const current = session.currentBoard;
      if (!current) throw new Error("The draft write did not refresh the current board.");
      expect(current.forDraft).toBe(session.draft);
      const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));
      expect(imageBuffersOf(rendered.messages[1]!)[0]!.equals(current.png)).toBe(true);
    };

    toolSetBoardTitle(session, "Payments, renamed", emitSessionEvent);
    expectCurrentAttached();

    toolUpdateDescription(session, "# Payments\n\nThe three steps.", emitSessionEvent);
    expectCurrentAttached();

    const opened = toolAddAnnotation(session, "alpha", "Should this split?", emitSessionEvent);
    expectCurrentAttached();

    const { annotationId } = opened.details as { annotationId: string };
    toolReplyAnnotation(session, annotationId, "Working on it.", emitSessionEvent);
    expectCurrentAttached();

    toolResolveRequest(session, annotationId, "declined", "Left as one step.", emitSessionEvent);
    expectCurrentAttached();

    // None of these writes is board geometry, so none joins the change log.
    expect(session.changeRenders ?? []).toHaveLength(0);
  });

  test("a stale current-board identity is lazily re-rendered, never degraded", () => {
    const session = liveSession();
    runOp(session, "move_to", { id: "beta", x: 480, y: 240 });
    // A draft write that bypassed the commit helper: same board, new identity.
    session.draft = { ...session.draft };
    expect(session.currentBoard!.forDraft).not.toBe(session.draft);

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext([]));

    expect(textOf(rendered.messages[0]!)).not.toContain("render failed");
    expect(session.currentBoard!.forDraft).toBe(session.draft);
    expect(imageBuffersOf(rendered.messages[1]!)[0]!.equals(session.currentBoard!.png))
      .toBe(true);
  });

  test("the tail is the recent conversation, and the block counts what was cut", () => {
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
    expect(block).toContain('<recent_conversation showing="8" total="14">');
    expect(block).toContain("messages in the Messages tab");
    expect(block).not.toContain("older messages are cut");
  });

  test("the tail is hard-capped and never opens on an orphaned tool result", () => {
    liveSession();
    // One user turn, nine assistant/toolResult pairs, then a closing assistant
    // message: 20 messages in a single window turn, so the turn window keeps
    // everything and only the message cap cuts. TAIL_MESSAGES = 12 back lands
    // on "result 3", whose calling message was cut — the tail must trim it.
    const messages: AgentMessage[] = [transcriptMessage("user", "the ask")];
    for (let pair = 0; pair < 9; pair += 1) {
      messages.push(transcriptMessage("assistant", `call ${pair}`));
      messages.push(transcriptMessage("toolResult", `result ${pair}`));
    }
    messages.push(transcriptMessage("assistant", "wrapping up"));

    const rendered = renderBoardWork(seedBoardWork(spawnContext()), renderContext(messages));
    const normalized = normalizeRenderOutput(rendered);

    const tail = normalized.messages.slice(normalized.stateMessageCount);
    expect(tail.length).toBeLessThanOrEqual(TAIL_MESSAGES);
    expect(tail).toHaveLength(11);
    expect(textOf(tail[0]!)).toBe("call 4");
    expect(textOf(tail[10]!)).toBe("wrapping up");
    const block = textOf(normalized.messages[0]!);
    expect(block).toContain('<recent_conversation showing="11" total="20">');
  });

  test("the module the kernel imports is the same three functions", () => {
    liveSession();
    const state = boardState.seed(spawnContext());
    const advanced = boardState.update(state, userMessage("go"));
    const output = normalizeRenderOutput(boardState.render(advanced, renderContext([])));

    expect(advanced.userMessages).toBe(1);
    expect(output.stateMessageCount).toBe(2);
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
    runOp(session, "move_to", { id: "beta", x: 480, y: 100 });
    state = fold(state, [
      toolCall("c1", "move_to", { id: "beta", x: 480, y: 100 }),
      toolResult("c1", "move_to", "APPLIED · move_to beta → 480,100"),
      turnEnd(0),
    ]);

    let block = textOf(renderBoardWork(state, renderContext([], 1)).messages[0]!);
    expect(block).toContain("beta rectangle \"beta\" 480,100 160×96");
    expect(block).toContain('<recent_ops total="1" showing="1">');
    expect(block).toContain("BOARD DIFF · base → draft · 1 op");

    // Turn 2: a deliberate look reuses the current board. It does not create a
    // change-history entry or alter what the state block attaches.
    const changeCount = session.changeRenders.length;
    look(session);
    state = fold(state, [
      toolCall("c2", "look", {}),
      toolResult("c2", "look", "LOOK · 1 render", { imageCount: 1 }),
      turnEnd(1),
    ]);

    const rendered = renderBoardWork(state, renderContext([], 2));
    expect(rendered.stateMessageCount).toBe(2);
    block = textOf(rendered.messages[0]!);
    expect(block).toContain('<views attached="1"');
    expect(block).toContain("(1) the board as it stands now");
    expect(session.changeRenders).toHaveLength(changeCount);

    // Turn 3: a new object, then a committed finalize.
    runOp(session, "place_shape", { id: "gamma", type: "rectangle", at: [960, 0] });
    runOp(session, "update_text", { id: "gamma", text: "Gamma" });
    state = fold(state, [
      toolCall("c3", "place_shape", { id: "gamma", type: "rectangle", at: [960, 0] }),
      toolResult("c3", "place_shape", "APPLIED · place_shape gamma rectangle 960,0 280×100"),
      toolCall("c4", "finalize", { outcome: "committed", message: "Lined the steps up." }),
      toolResult("c4", "finalize", "Committed: Lined the steps up. (2 patch operations)."),
      turnEnd(2),
    ]);

    block = textOf(renderBoardWork(state, renderContext([], 3)).messages[0]!);
    expect(state.outcome).toEqual({ outcome: "committed", message: "Lined the steps up." });
    expect(block).toContain('<board fresh="yes" objects="3" edges="1">');
    expect(block).toContain('gamma rectangle "Gamma" 960,0 280×100');
    expect(block).toContain('<recent_ops total="2" showing="2">');
    expect(block).toContain("t1 move_to beta");
    expect(block).toContain("t3 place_shape gamma");
    // The whole run's state is still a JSON document.
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
