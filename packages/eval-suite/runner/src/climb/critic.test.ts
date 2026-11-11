import { describe, expect, test } from "bun:test";

import { mergeFindings, parseFindings, parseGrid, regionGrid, revisePrompt, type Finding } from "./critic.ts";
import { drawerArgs, sessionIdOf } from "./draw.ts";

const finding = (overrides: Partial<Finding>): Finding => ({
  kind: "routing", ids: [], labels: [], problem: "Two wires share a segment.", fix: "Route them apart.", severity: 2, ...overrides,
});

describe("climb critic regions", () => {
  test("a grid covers the whole board, and neighbour regions overlap", () => {
    const camera = { x: -24, y: 256, width: 3508, height: 1208 };
    const regions = regionGrid(camera, { cols: 3, rows: 2 });
    expect(regions.map((region) => region.id)).toEqual(["r01", "r02", "r03", "r04", "r05", "r06"]);
    const right = Math.max(...regions.map((region) => region.x + region.width));
    const bottom = Math.max(...regions.map((region) => region.y + region.height));
    expect([regions[0]!.x, regions[0]!.y, right, bottom]).toEqual([camera.x, camera.y, camera.x + camera.width, camera.y + camera.height]);
    expect(regions[0]!.x + regions[0]!.width).toBeGreaterThan(regions[1]!.x);
    expect(regions[0]!.y + regions[0]!.height).toBeGreaterThan(regions[3]!.y);
  });

  test("auto picks the fewest regions that keep each one readable at 1:1", () => {
    expect(regionGrid({ x: 0, y: 0, width: 900, height: 600 }, "auto")).toHaveLength(1);
    const wide = regionGrid({ x: 0, y: 0, width: 3508, height: 1208 }, "auto");
    expect(wide).toHaveLength(3);
    expect(Math.max(...wide.map((region) => region.width))).toBeLessThanOrEqual(1400);
  });

  test("the grid flag takes auto or cols x rows", () => {
    expect(parseGrid(undefined)).toBe("auto");
    expect(parseGrid("3x2")).toEqual({ cols: 3, rows: 2 });
    expect(() => parseGrid("3by2")).toThrow("--critic-grid");
  });
});

describe("climb critic findings", () => {
  test("an answer off the schema is refused", () => {
    expect(parseFindings(JSON.stringify({ findings: [finding({ ids: ["a"] })] }))).toHaveLength(1);
    expect(() => parseFindings(JSON.stringify({ findings: [{ ...finding({}), kind: "theme" }] }))).toThrow("unknown kind");
    expect(() => parseFindings(JSON.stringify({ findings: [{ ...finding({}), severity: 4 }] }))).toThrow("severity");
    expect(() => parseFindings("{}")).toThrow("findings");
  });

  test("one fault seen by two overlapping regions reaches the drawer once", () => {
    const boardIds = new Set(["wire-a", "wire-b", "node-c"]);
    const merged = mergeFindings([
      { region: "r01", findings: [finding({ ids: ["wire-a", "wire-b"], severity: 1 }), finding({ kind: "colour", ids: ["node-c"] })] },
      { region: "r02", findings: [finding({ ids: ["wire-b", "ghost"], severity: 3, problem: "The wires overlap." })] },
    ], boardIds);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      kind: "routing", severity: 3, problem: "The wires overlap.", ids: ["wire-a", "wire-b"], labels: ["ghost"], regions: ["r01", "r02"],
    });
    expect(merged[1]).toMatchObject({ kind: "colour", ids: ["node-c"], regions: ["r01"] });
    expect(revisePrompt("b1", merged)).toContain(`1. [routing, severity 3] wire-a, wire-b, "ghost": The wires overlap. Fix: Route them apart.`);
  });
});

describe("climb draw revise session", () => {
  test("the critic's first pass keeps its session, and the revise pass resumes it", () => {
    expect(drawerArgs("/tmp/b", "draw", "/s.json")).toContain("--no-session-persistence");
    expect(drawerArgs("/tmp/b", "draw", "/s.json", { persist: true })).not.toContain("--no-session-persistence");
    const revise = drawerArgs("/tmp/b", "fix", "/s.json", { persist: false, resume: "abc-123" });
    expect(revise[revise.indexOf("--resume") + 1]).toBe("abc-123");
    const transcript = [
      `{"type":"system","subtype":"ui_invalidate","session_id":"abc-123"}`,
      `{"type":"system","subtype":"init","session_id":"abc-123"}`,
    ].join("\n");
    expect(sessionIdOf(transcript)).toBe("abc-123");
    expect(sessionIdOf("not json\n")).toBeNull();
  });
});
