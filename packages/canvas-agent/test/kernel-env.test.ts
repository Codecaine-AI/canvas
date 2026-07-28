import { describe, expect, test } from "bun:test";

import { toolCallCapOverride } from "../src/service/kernel";

describe("canvas-agent kernel environment overrides", () => {
  test.each(["1", "2", "3"] as const)(
    "accepts CANVAS_AGENT_TOOL_CALL_CAP=%s",
    (raw) => {
      expect(toolCallCapOverride(raw)).toBe(Number(raw));
    },
  );

  test("leaves the agent default in place when the override is absent", () => {
    expect(toolCallCapOverride(undefined)).toBeUndefined();
  });

  test.each(["0", "4", "two"] as const)(
    "rejects CANVAS_AGENT_TOOL_CALL_CAP=%s",
    (raw) => {
      expect(() => toolCallCapOverride(raw)).toThrow(
        `CANVAS_AGENT_TOOL_CALL_CAP must be an integer from 1 to 3; got ${JSON.stringify(raw)}.`,
      );
    },
  );
});
