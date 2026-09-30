/// <reference types="bun" />

import { afterEach, describe, expect, it, mock } from "bun:test";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";

import { CanvasSaveConflictError, putCanvas } from "../canvas-file-client";

const originalFetch = globalThis.fetch;
const document = { id: "board-a" } as InteractiveCanvasDocument;

function mockFetch(status: number, body: unknown) {
  const fetchMock = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof mockFetch>): Record<string, string> {
  return (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("putCanvas", () => {
  it("sends If-Match and resolves the new hash", async () => {
    const fetchMock = mockFetch(200, { id: "board-a", contentHash: "new" });
    await expect(putCanvas("board-a", document, { baseHash: "old" })).resolves.toBe("new");
    expect(sentHeaders(fetchMock)["if-match"]).toBe('"old"');
  });

  it("maps 412 to CanvasSaveConflictError with the current hash", async () => {
    mockFetch(412, { error: "changed", currentHash: "disk" });
    const error = await putCanvas("board-a", document, { baseHash: "old" }).catch((e) => e);
    expect(error).toBeInstanceOf(CanvasSaveConflictError);
    expect((error as CanvasSaveConflictError).currentHash).toBe("disk");
  });

  it("force drops the If-Match header", async () => {
    const fetchMock = mockFetch(200, { id: "board-a", contentHash: "new" });
    await putCanvas("board-a", document, { baseHash: "old", force: true });
    expect(sentHeaders(fetchMock)["if-match"]).toBeUndefined();
  });
});
