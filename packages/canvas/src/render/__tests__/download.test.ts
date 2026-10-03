import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument } from "../../state/schema";
import { exportDocumentAsPng, exportDocumentAsSvg, exportFilenameFor, sanitizeExportFilename } from "../download";

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

describe("exports embed the fonts their text was measured with", () => {
  const board = makeDocument({
    schemaVersion: 1,
    mode: "diagram",
    objects: [{ id: "a", type: "rectangle", text: "MMMMMMMMMM", geometry: { x: 0, y: 0, width: 200, height: 70 } }],
  } as Partial<InteractiveCanvasDocument>);
  const EMBEDDED = /<defs><style>@font-face\{font-family:"Inter";[^}]*src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/;

  /** Run `body` with object URLs recorded instead of created. */
  async function withObjectUrls(body: (blobs: Map<string, Blob>) => Promise<void>): Promise<void> {
    const blobs = new Map<string, Blob>();
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      const url = `blob:test-${blobs.size}`;
      blobs.set(url, blob);
      return url;
    };
    URL.revokeObjectURL = () => {};
    try {
      await body(blobs);
    } finally {
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  }

  it("hands the PNG rasterizer's Image an SVG carrying the bundled faces", async () => {
    await withObjectUrls(async (blobs) => {
      const Original = globalThis.Image;
      const decoder = new Error("reached the Image decoder");
      let decoded: Blob | undefined;
      globalThis.Image = class {
        set src(url: string) {
          decoded = blobs.get(url);
          throw decoder;
        }
      } as unknown as typeof Image;
      try {
        await expect(exportDocumentAsPng(board)).rejects.toBe(decoder);
      } finally {
        globalThis.Image = Original;
      }
      expect(await decoded!.text()).toMatch(EMBEDDED);
    });
  });

  it("downloads an SVG carrying the bundled faces", async () => {
    await withObjectUrls(async (blobs) => {
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = () => {};
      try {
        await exportDocumentAsSvg(board);
      } finally {
        HTMLAnchorElement.prototype.click = click;
      }
      expect(await [...blobs.values()][0]!.text()).toMatch(EMBEDDED);
    });
  });
});
