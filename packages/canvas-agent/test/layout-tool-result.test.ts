import { describe, expect, test } from "bun:test";

import {
  layoutToolErrorOverride,
} from "../src/catalog/layout-editor/tools";
import { toToolResult } from "../src/catalog/layout-editor/tools/runtime";

describe("layout tool result errors", () => {
  test("mirrors a runtime error into details without changing content", () => {
    const png = Buffer.from("render");

    const result = toToolResult({
      text: "ERROR · resize",
      pngs: [png],
      details: { operation: "resize" },
      isError: true,
    });

    expect(result).toEqual({
      content: [
        { type: "text", text: "ERROR · resize" },
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      ],
      details: { operation: "resize", isError: true },
      isError: true,
    });
  });

  test("does not stamp successful results", () => {
    const details = { operation: "move_by" };

    const result = toToolResult({
      text: "APPLIED · move_by",
      details,
    });

    expect(result.details).toBe(details);
    expect(result.details).not.toHaveProperty("isError");
  });

  test("overrides only results carrying the mirrored error flag", () => {
    expect(layoutToolErrorOverride({ details: { isError: true } }))
      .toEqual({ isError: true });
    expect(layoutToolErrorOverride({ details: { isError: false } }))
      .toBeUndefined();
    expect(layoutToolErrorOverride({ details: {} })).toBeUndefined();
    expect(layoutToolErrorOverride({ details: undefined })).toBeUndefined();
  });
});
