import { describe, expect, test } from "bun:test";

import {
  applyOperationToDraft,
  describePatchOperation,
} from "../src/service/session/apply-ops";
import { box, makeDocument } from "./synthetic";

describe("description patch operations", () => {
  test("describes populated and cleared replacements", () => {
    expect(describePatchOperation({
      type: "updateDescription",
      description: "Board map",
    })).toBe("updateDescription (9 chars)");
    expect(describePatchOperation({
      type: "updateDescription",
      description: " \n ",
    })).toBe("updateDescription (cleared)");
  });

  test("applies replacement text without touching entity ids", () => {
    const baseline = makeDocument([box("kept", 0, 0)]);

    const applied = applyOperationToDraft(
      baseline,
      { type: "updateDescription", description: "  # Board\n\nReads in a loop.  " },
      "description replacement",
    );

    expect(applied).toEqual({
      document: {
        ...baseline,
        description: "  # Board\n\nReads in a loop.  ",
      },
      summary: "description replacement",
      touched: [],
    });
  });

  test("clears the description for a whitespace-only replacement", () => {
    const baseline = {
      ...makeDocument([box("kept", 0, 0)]),
      description: "Before",
    };

    const applied = applyOperationToDraft(
      baseline,
      { type: "updateDescription", description: "\n  " },
    );

    expect(applied.document.description).toBeUndefined();
    expect(applied.summary).toBe("updateDescription");
    expect(applied.touched).toEqual([]);
  });
});
