/// <reference types="bun" />

import { describe, expect, it } from "bun:test";
import type { AgentSessionEvent } from "@codecaine-ai/canvas-agent/protocol";
import { describeEvent } from "../stream-copy";

const sessionId = "session-1";

describe("describeEvent", () => {
  it("describes progress and terminal events in plain language", () => {
    const cases: Array<[AgentSessionEvent, string]> = [
      [
        {
          type: "fitted",
          sessionId,
          program: "program",
          frame: { x: 0, y: 0, width: 800, height: 600 },
          scopeObjectIds: ["one", "two", "three"],
          boundaryArrowCount: 2,
        },
        "Read the scope — 3 objects, 2 boundary connections.",
      ],
      [{ type: "proposal", sessionId, n: 2 }, "Draft 2…"],
      [{ type: "rendering", sessionId, n: 2 }, "Looking at the result…"],
      [
        {
          type: "proposal-ready",
          sessionId,
          proposal: {
            n: 2,
            operations: [],
            summary: "Rearranged the scope",
            delta: "Moved 3",
            lint: "Clean",
          },
        },
        "Proposal ready.",
      ],
      [{ type: "error", sessionId, message: "Solver stopped" }, "Something failed: Solver stopped"],
      [{ type: "abandoned", sessionId, reason: "No arrangement fit." }, "No arrangement fit."],
    ];

    for (const [event, expected] of cases) {
      expect(describeEvent(event)).toBe(expected);
    }
  });

  it("leaves delta and status events for specialized UI", () => {
    expect(
      describeEvent({ type: "delta", sessionId, n: 1, delta: "Moved 1", lint: "Clean" }),
    ).toBeNull();
    expect(
      describeEvent({ type: "status", sessionId, status: "accepted" }),
    ).toBeNull();
  });
});
