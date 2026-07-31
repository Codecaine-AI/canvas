import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  DetailImageTrigger,
  type DetailBlockProvider,
  type DetailBlockSpec,
} from "@agent-kernel/viewer-ui";

import canvasViewerExtension, {
  canvasViewerExtension as namedCanvasViewerExtension,
  createDetailBlockProvider,
} from "../src/viewer-extension";
import { TranscriptRenderStrip } from "../src/viewer-extension/TranscriptMedia";
import { transcriptImageUrl } from "../src/viewer-extension/paths";
import type { TranscriptToolCallEntry } from "../src/viewer/hooks/use-transcript";

type TraceSpan = Parameters<DetailBlockProvider>[0];

const BLOB_HASH = "b1-0123456789abcdef";
const API_BASE = "/registry/kernels/canvas";

function stringAttr(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number) {
  return { key, value: { intValue: String(value) } };
}

function boardRenderSpan(overrides: Partial<TraceSpan> = {}): TraceSpan {
  return {
    id: "evt-board-render-1",
    title: "board render #3",
    startTime: new Date("2026-07-28T00:00:00.000Z"),
    endTime: new Date("2026-07-28T00:00:00.000Z"),
    duration: 0,
    type: "event",
    status: "success",
    raw: "{}",
    attributes: [
      stringAttr("event_type", "app:board-render"),
      stringAttr("blob_hash", BLOB_HASH),
      stringAttr("mimeType", "image/png"),
      intAttr("n", 3),
      stringAttr("summary", "aligned the auth column"),
      intAttr("turn_number", 4),
    ],
    ...overrides,
  } as TraceSpan;
}

function markup(block: DetailBlockSpec | undefined): string {
  if (!block?.node) return "";
  return renderToStaticMarkup(block.node);
}

describe("canvas viewer extension", () => {
  test("exports the Extensions v0 shape", () => {
    expect(canvasViewerExtension).toBe(namedCanvasViewerExtension);
    expect(canvasViewerExtension.appId).toBe("canvas");
    expect(typeof canvasViewerExtension.createDetailBlockProvider).toBe(
      "function",
    );
  });

  test("adds rich board facts and an apiBase-parameterized board image", () => {
    const provider = createDetailBlockProvider({ apiBase: API_BASE });
    const span = boardRenderSpan();
    const blocks = provider(span);

    expect(blocks.map((block) => block.id)).toEqual([
      "canvas:board-facts",
      "canvas:board-image",
    ]);
    const facts = markup(blocks[0]);
    expect(facts).toContain("Board after change 3");
    expect(facts).toContain("Turn 4");
    expect(facts).toContain("aligned the auth column");

    const image = blocks[1]?.node as ReactElement<{
      image: { src: string; alt: string };
    }>;
    expect(image.type).toBe(DetailImageTrigger);
    expect(image.props.image.src).toBe(
      `${API_BASE}/kernel/blobs/${encodeURIComponent(BLOB_HASH)}`,
    );
    expect(image.props.image.alt).toBe("image/png board render");
  });

  test("returns the transcript-backed thinking and render blocks", () => {
    const entry: TranscriptToolCallEntry = {
      call: {
        toolUseId: "tool-1",
        toolName: "propose_program",
        params: { program: "row(stage, controls)" },
        resultText: null,
        isError: false,
        images: [{ id: "render 1", mimeType: "image/png" }],
      },
      turn: {
        index: 7,
        timestamp: null,
        thinking: "Keep the controls aligned.",
        text: null,
        toolCalls: [],
      },
      piSession: {
        piSessionId: "pi-1",
        file: "pi-1.jsonl",
        startedAt: null,
        userMessages: [],
        agentContext: null,
        turns: [],
      },
    };
    const provider = createDetailBlockProvider({
      apiBase: API_BASE,
      transcript: {
        containerId: "container/one",
        toolCallIndex: new Map([["tool-1", entry]]),
      },
    });
    const blocks = provider(
      boardRenderSpan({
        attributes: [
          stringAttr("event_type", "tool_call_end"),
          stringAttr("tool_use_id", "tool-1"),
        ],
      }),
    );

    expect(blocks.map((block) => block.id)).toEqual([
      "canvas:thinking",
      "canvas:renders",
    ]);
    expect(blocks[0]?.body).toBe("Keep the controls aligned.");
    const renders = blocks[1]?.node as ReactElement<{
      apiBase: string;
      containerId: string;
      images: Array<{ id: string; mimeType: string }>;
    }>;
    expect(renders.type).toBe(TranscriptRenderStrip);
    expect(renders.props.apiBase).toBe(API_BASE);
    expect(renders.props.containerId).toBe("container/one");
    expect(renders.props.images).toEqual([
      { id: "render 1", mimeType: "image/png" },
    ]);
    expect(
      transcriptImageUrl(
        renders.props.apiBase,
        renders.props.containerId,
        renders.props.images[0]!.id,
      ),
    ).toBe(
      `${API_BASE}/kernel/sessions/container%2Fone/transcript/images/render%201`,
    );
  });

  test("keeps payload-less board events useful and ignores other apps", () => {
    const provider = createDetailBlockProvider({ apiBase: "" });
    const boardBlocks = provider(
      boardRenderSpan({
        attributes: [stringAttr("event_type", "app:board-render")],
      } as Partial<TraceSpan>),
    );

    expect(markup(boardBlocks[0])).toContain("Board render");
    expect(boardBlocks).toHaveLength(1);
    expect(
      provider(
        boardRenderSpan({
          attributes: [stringAttr("event_type", "app:other")],
        } as Partial<TraceSpan>),
      ),
    ).toEqual([]);
  });
});
