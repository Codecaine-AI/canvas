import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createTranscriptRoutes } from "../src/harness/routes/transcript";

const CONTAINER_ID = "aaaa1111-2222-3333-4444-555566667777";
const FILE_BASE_1 = "2026-01-01T00-00-00-000Z_sess-one";
const FILE_BASE_2 = "2026-01-01T01-00-00-000Z_sess-two";
// A tiny valid payload; content doesn't matter, byte round-trip does.
const IMAGE_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const IMAGE_BASE64 = Buffer.from(IMAGE_BYTES).toString("base64");

let piSessionsDir: string;
let app: ReturnType<typeof createTranscriptRoutes>;

function jsonl(events: unknown[]): string {
  return `${events.map((event) => (typeof event === "string" ? event : JSON.stringify(event))).join("\n")}\n`;
}

/** Fixture mirrors the real pi-session shapes observed in .agent-kernel. */
function fixtureLines(): unknown[] {
  return [
    // line 0
    { type: "session", version: 3, id: "sess-one", timestamp: "2026-01-01T00:00:00.000Z" },
    // line 1
    { type: "model_change", id: "m1", timestamp: "2026-01-01T00:00:00.001Z", provider: "p", modelId: "m" },
    // line 2
    {
      type: "custom_message",
      customType: "agent-context",
      content: "<editor_state>fixture</editor_state>",
      timestamp: "2026-01-01T00:00:00.002Z",
    },
    // line 3
    {
      type: "message",
      timestamp: "2026-01-01T00:00:01.000Z",
      message: {
        role: "user",
        timestamp: "2026-01-01T00:00:01.000Z",
        content: [{ type: "text", text: "Center the pending task." }],
      },
    },
    // line 4 — malformed, must be skipped
    "{this is not json",
    // line 5 — assistant turn 0: thinking + two tool calls
    {
      type: "message",
      message: {
        role: "assistant",
        timestamp: "2026-01-01T00:00:02.000Z",
        content: [
          { type: "thinking", thinking: "Plan the move." },
          { type: "thinking", thinking: "Then render." },
          { type: "toolCall", id: "call_a|fc_1", name: "propose_program", arguments: { program: "section 1" } },
          { type: "toolCall", id: "call_b|fc_2", name: "render_draft", arguments: { pixelWidth: 100 } },
        ],
      },
    },
    // line 6 — result for call_a (text only)
    {
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call_a|fc_1",
        toolName: "propose_program",
        isError: false,
        timestamp: "2026-01-01T00:00:02.500Z",
        content: [{ type: "text", text: "applied" }],
      },
    },
    // line 7 — result for call_b (text + image)
    {
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call_b|fc_2",
        toolName: "render_draft",
        isError: false,
        timestamp: "2026-01-01T00:00:03.000Z",
        content: [
          { type: "text", text: "rendered" },
          { type: "image", data: IMAGE_BASE64, mimeType: "image/png" },
        ],
      },
    },
    // line 8 — assistant turn 1: text + failing tool call
    {
      type: "message",
      message: {
        role: "assistant",
        timestamp: "2026-01-01T00:00:04.000Z",
        content: [
          { type: "text", text: "Looks good, one more tweak." },
          { type: "toolCall", id: "call_c|fc_3", name: "propose_program", arguments: { program: "bad" } },
        ],
      },
    },
    // line 9 — error result for call_c
    {
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call_c|fc_3",
        toolName: "propose_program",
        isError: true,
        content: [{ type: "text", text: "parse error" }],
      },
    },
    // line 10 — assistant turn 2: final text, no tools
    {
      type: "message",
      message: {
        role: "assistant",
        timestamp: "2026-01-01T00:00:05.000Z",
        content: [{ type: "text", text: "Done." }],
      },
    },
  ];
}

async function get(path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`));
}

beforeAll(() => {
  piSessionsDir = mkdtempSync(join(tmpdir(), "canvas-agent-transcript-"));
  const agentDir = join(piSessionsDir, CONTAINER_ID, "layout-editor");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, `${FILE_BASE_1}.jsonl`), jsonl(fixtureLines()));
  // A second (refine) pi session — ordering + per-file piSessionId extraction.
  writeFileSync(
    join(agentDir, `${FILE_BASE_2}.jsonl`),
    jsonl([
      { type: "session", version: 3, id: "sess-two", timestamp: "2026-01-01T01:00:00.000Z" },
      {
        type: "message",
        message: {
          role: "user",
          timestamp: "2026-01-01T01:00:01.000Z",
          content: [{ type: "text", text: "Refine it." }],
        },
      },
    ]),
  );
  app = createTranscriptRoutes({ piSessionsDir });
});

afterAll(() => {
  rmSync(piSessionsDir, { recursive: true, force: true });
});

describe("transcript route", () => {
  test("assembles turns, joins tool results, and extracts image refs", async () => {
    const response = await get(`/api/agent/kernel/sessions/${CONTAINER_ID}/transcript`);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.container_id).toBe(CONTAINER_ID);
    expect(body.pi_sessions).toHaveLength(2);

    const [first, second] = body.pi_sessions;
    expect(first.piSessionId).toBe("sess-one");
    expect(first.file).toBe(`${FILE_BASE_1}.jsonl`);
    expect(first.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(first.agentContext).toBe("<editor_state>fixture</editor_state>");
    expect(first.userMessages).toEqual([
      { text: "Center the pending task.", timestamp: "2026-01-01T00:00:01.000Z" },
    ]);

    expect(first.turns).toHaveLength(3);
    const [turn0, turn1, turn2] = first.turns;

    expect(turn0.index).toBe(0);
    expect(turn0.timestamp).toBe("2026-01-01T00:00:02.000Z");
    expect(turn0.thinking).toBe("Plan the move.\n\nThen render.");
    expect(turn0.text).toBeNull();
    expect(turn0.toolCalls).toHaveLength(2);
    expect(turn0.toolCalls[0]).toEqual({
      toolUseId: "call_a|fc_1",
      toolName: "propose_program",
      params: { program: "section 1" },
      resultText: "applied",
      isError: false,
      images: [],
    });
    expect(turn0.toolCalls[1]).toEqual({
      toolUseId: "call_b|fc_2",
      toolName: "render_draft",
      params: { pixelWidth: 100 },
      resultText: "rendered",
      isError: false,
      images: [{ id: `${FILE_BASE_1}.7.1`, mimeType: "image/png" }],
    });

    expect(turn1.index).toBe(1);
    expect(turn1.thinking).toBeNull();
    expect(turn1.text).toBe("Looks good, one more tweak.");
    expect(turn1.toolCalls).toEqual([
      {
        toolUseId: "call_c|fc_3",
        toolName: "propose_program",
        params: { program: "bad" },
        resultText: "parse error",
        isError: true,
        images: [],
      },
    ]);

    expect(turn2).toEqual({
      index: 2,
      timestamp: "2026-01-01T00:00:05.000Z",
      thinking: null,
      text: "Done.",
      toolCalls: [],
    });

    expect(second.piSessionId).toBe("sess-two");
    expect(second.startedAt).toBe("2026-01-01T01:00:00.000Z");
    expect(second.agentContext).toBeNull();
    expect(second.userMessages).toEqual([{ text: "Refine it.", timestamp: "2026-01-01T01:00:01.000Z" }]);
    expect(second.turns).toEqual([]);
  });

  test("skips malformed lines without dropping the rest of the file", async () => {
    // The fixture's line 4 is invalid JSON; the assistant turns after it must
    // still be present (asserted above) and the response must be a clean 200.
    const response = await get(`/api/agent/kernel/sessions/${CONTAINER_ID}/transcript`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pi_sessions[0].turns).toHaveLength(3);
  });

  test("404s on unknown container", async () => {
    const response = await get("/api/agent/kernel/sessions/no-such-container/transcript");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Kernel session no-such-container not found" });
  });

  test("rejects traversal-shaped container ids", async () => {
    const response = await get("/api/agent/kernel/sessions/..%2F..%2Fetc/transcript");
    expect(response.status).toBe(404);
  });
});

describe("transcript image route", () => {
  test("round-trips the exact image bytes with content-type and caching", async () => {
    const response = await get(
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/${FILE_BASE_1}.7.1`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("max-age=3600");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(IMAGE_BYTES);
  });

  test("404s on unknown container, unknown file, bad indices, and non-image blocks", async () => {
    const cases = [
      `/api/agent/kernel/sessions/unknown-container/transcript/images/${FILE_BASE_1}.7.1`,
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/no-such-file.7.1`,
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/${FILE_BASE_1}.999.0`,
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/${FILE_BASE_1}.7.5`,
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/${FILE_BASE_1}.7.0`, // text block
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/not-a-valid-id`,
      `/api/agent/kernel/sessions/${CONTAINER_ID}/transcript/images/..%2Fsecret.7.1`,
    ];
    for (const path of cases) {
      const response = await get(path);
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("not found");
    }
  });
});
