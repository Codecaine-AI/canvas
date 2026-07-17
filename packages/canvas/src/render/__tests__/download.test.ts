import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument } from "../../state/schema";
import { exportFilenameFor, sanitizeExportFilename } from "../download";

function makeDocument(overrides: Partial<InteractiveCanvasDocument> = {}): InteractiveCanvasDocument {
  return {
    id: "doc-1",
    objects: [],
    connections: [],
    ...overrides,
  } as InteractiveCanvasDocument;
}

describe("sanitizeExportFilename", () => {
  it("lowercases and turns whitespace runs into single dashes", () => {
    expect(sanitizeExportFilename("My  Great\tBoard")).toBe("my-great-board");
  });

  it("strips characters illegal in filenames", () => {
    expect(sanitizeExportFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("keeps existing dashes and collapses runs", () => {
    expect(sanitizeExportFilename("agent-flows--2")).toBe("agent-flows-2");
  });

  it("trims leading/trailing dashes and dots", () => {
    expect(sanitizeExportFilename("  --board.. ")).toBe("board");
  });

  it("falls back to canvas when nothing printable survives", () => {
    expect(sanitizeExportFilename("")).toBe("canvas");
    expect(sanitizeExportFilename("???")).toBe("canvas");
    expect(sanitizeExportFilename(undefined)).toBe("canvas");
  });
});

describe("exportFilenameFor", () => {
  it("uses the document title when present", () => {
    expect(exportFilenameFor(makeDocument({ title: "Intent Classification 2" }), "svg")).toBe(
      "intent-classification-2.svg",
    );
  });

  it("falls back to the document id when the title is empty or missing", () => {
    expect(exportFilenameFor(makeDocument({ title: "" }), "png")).toBe("doc-1.png");
    expect(exportFilenameFor(makeDocument(), "png")).toBe("doc-1.png");
  });

  it("falls back to canvas when neither survives sanitization", () => {
    expect(exportFilenameFor(makeDocument({ id: "///", title: undefined }), "svg")).toBe(
      "canvas.svg",
    );
  });
});
