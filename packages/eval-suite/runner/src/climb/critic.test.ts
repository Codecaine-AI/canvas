import { describe, expect, test } from "bun:test";

import { criticPrompt, mergeFindings, parseCritic, parseFindings, parseGrid, regionGrid, type Finding } from "./critic.ts";
import { drawerArgs, replyOf, sessionIdOf } from "./drawer.ts";

const finding = (overrides: Partial<Finding>): Finding => ({
  kind: "routing", ids: [], labels: [], problem: "Two wires share a segment.", fix: "Route them apart.", severity: "should", ...overrides,
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

  test("auto picks the fewest regions with a long edge of 900 px or less", () => {
    expect(regionGrid({ x: 0, y: 0, width: 900, height: 600 }, "auto")).toHaveLength(1);
    const camera = { x: -24, y: 256, width: 3508, height: 1208 };
    const wide = regionGrid(camera, "auto");
    // 5 columns of 900 px that overlap by 120 px span 3508 px, and 2 rows span 1208 px. At 1400 px the board took 3 regions.
    expect(wide).toHaveLength(10);
    expect(Math.max(...wide.flatMap((region) => [region.width, region.height]))).toBeLessThanOrEqual(900);
    expect(Math.max(...wide.map((region) => region.x + region.width))).toBe(camera.x + camera.width);
    expect(Math.max(...wide.map((region) => region.y + region.height))).toBe(camera.y + camera.height);
  });

  test("the region-max flag sets the long edge of an auto region", () => {
    const camera = { x: 0, y: 0, width: 3508, height: 1208 };
    const regions = (flags: Record<string, string>) => {
      const critic = parseCritic(new Map(Object.entries(flags)));
      return regionGrid(camera, critic.grid, critic.regionMax);
    };
    expect(regions({ "--critic-region-max": "1400" })).toHaveLength(3);
    expect(regions({ "--critic-region-max": "600" })).toHaveLength(24);
    // A cols x rows grid is the grid: the flag does not cut it finer.
    expect(regions({ "--critic-grid": "3x2", "--critic-region-max": "600" })).toHaveLength(6);
    expect(() => regions({ "--critic-region-max": "120" })).toThrow("--critic-region-max");
    expect(() => regions({ "--critic-region-max": "wide" })).toThrow("--critic-region-max");
  });

  test("the grid flag takes auto or cols x rows", () => {
    expect(parseGrid(undefined)).toBe("auto");
    expect(parseGrid("3x2")).toEqual({ cols: 3, rows: 2 });
    expect(() => parseGrid("3by2")).toThrow("--critic-grid");
  });

  test("the loop runs 10 rounds and a review runs 8 critics at once, unless the flags say more or fewer", () => {
    expect(parseCritic(new Map())).toEqual({ grid: "auto", regionMax: 900, count: 8, rounds: 10 });
    expect(parseCritic(new Map([["--critic-rounds", "1"], ["--critic-count", "20"]]))).toMatchObject({ count: 20, rounds: 1 });
    expect(() => parseCritic(new Map([["--critic-rounds", "0"]]))).toThrow("--critic-rounds");
    expect(() => parseCritic(new Map([["--critic-count", "0"]]))).toThrow("--critic-count");
  });

  test("a critic gets the guide crop, what the lint already said and what earlier rounds settled", () => {
    const region = { id: "r02", x: 1200, y: 0, width: 1400, height: 900 };
    const inventory = { objects: ["b · shape · blue · in page (white) · \"B\""], connections: ["w · a → b"] };
    const bare = criticPrompt(region, inventory);
    expect(bare).toContain("Image 2 is image 1 with the board's smart guides drawn in pink.");
    expect(bare).toContain("Image 3 is the whole board");
    expect(bare).not.toContain("Do not report them again");
    expect(bare).not.toContain("Earlier rounds");
    const prompt = criticPrompt(region, inventory, {
      checked: ["G1 b is 20px off a's center line, so w bends (move b by dy -20)"],
      earlier: ["[routing] w: The wire bends twice. Drawer: declined, the bend clears the label"],
    });
    expect(prompt).toContain("Do not report them again:\nG1 b is 20px off a's center line, so w bends (move b by dy -20)");
    expect(prompt).toContain("the drawer's reason does not hold:\n[routing] w: The wire bends twice. Drawer: declined, the bend clears the label");
  });
});

describe("climb critic findings", () => {
  test("an answer off the schema is refused", () => {
    expect(parseFindings(JSON.stringify({ findings: [finding({ ids: ["a"] })] }))).toHaveLength(1);
    expect(() => parseFindings(JSON.stringify({ findings: [{ ...finding({}), kind: "theme" }] }))).toThrow("unknown kind");
    expect(() => parseFindings(JSON.stringify({ findings: [{ ...finding({}), severity: 2 }] }))).toThrow("severity must be blocker, should or nit");
    expect(() => parseFindings("{}")).toThrow("findings");
  });

  test("one fault seen by two overlapping regions reaches the drawer once", () => {
    const boardIds = new Set(["wire-a", "wire-b", "node-c"]);
    const merged = mergeFindings([
      { region: "r01", findings: [finding({ ids: ["wire-a", "wire-b"], severity: "nit" }), finding({ kind: "colour", ids: ["node-c"] })] },
      { region: "r02", findings: [finding({ ids: ["wire-b", "ghost"], severity: "blocker", problem: "The wires overlap." })] },
    ], boardIds);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      kind: "routing", severity: "blocker", problem: "The wires overlap.", ids: ["wire-a", "wire-b"], labels: ["ghost"], regions: ["r01", "r02"],
    });
    expect(merged[1]).toMatchObject({ kind: "colour", severity: "should", ids: ["node-c"], regions: ["r01"] });
  });

  test("faults that only share an item stay separate findings, each with its own words", () => {
    const boardIds = new Set(["wire-a", "wire-b", "wire-c"]);
    const merged = mergeFindings([
      { region: "r01", findings: [
        finding({ ids: ["wire-a", "wire-b"], problem: "Wires a and b cross." }),
        // One region's critic lists separate faults, even on the same wires.
        finding({ ids: ["wire-a", "wire-b"], problem: "Wires a and b hide one arrowhead." }),
      ] },
      { region: "r02", findings: [
        finding({ ids: ["wire-b", "wire-c"], problem: "Wires b and c share a segment." }),
        finding({ ids: [], labels: ["Retry"], problem: "The label sits on a border." }),
      ] },
      { region: "r03", findings: [
        finding({ ids: ["wire-c"], problem: "Wire c takes a detour." }),
        finding({ ids: [], labels: ["retry"], problem: "The label touches a border." }),
      ] },
    ], boardIds);
    expect(merged.map((entry) => [entry.problem, entry.ids, entry.regions])).toEqual([
      ["Wires b and c share a segment.", ["wire-b", "wire-c"], ["r02", "r03"]],
      ["The label sits on a border.", [], ["r02", "r03"]],
      ["Wires a and b cross.", ["wire-a", "wire-b"], ["r01"]],
      ["Wires a and b hide one arrowhead.", ["wire-a", "wire-b"], ["r01"]],
    ]);
  });

  test("a finding that is part of two faults does not join them into one", () => {
    const merged = mergeFindings([
      { region: "r01", findings: [finding({ ids: ["wire-a", "wire-b"], problem: "Wires a and b cross." })] },
      { region: "r02", findings: [finding({ ids: ["wire-b"], problem: "Wire b cuts a corner." })] },
      { region: "r03", findings: [finding({ ids: ["wire-b", "wire-c"], problem: "Wires b and c share a segment." })] },
    ], new Set(["wire-a", "wire-b", "wire-c"]));
    expect(merged.map((entry) => [entry.problem, entry.ids, entry.regions])).toEqual([
      ["Wires a and b cross.", ["wire-a", "wire-b"], ["r01", "r02"]],
      ["Wires b and c share a segment.", ["wire-b", "wire-c"], ["r03"]],
    ]);
  });
});

describe("climb drawer session", () => {
  test("the first pass keeps its session, a revise pass resumes it, and its closing reply is read back", () => {
    expect(drawerArgs("/tmp/b", "/s.json")).toContain("--no-session-persistence");
    expect(drawerArgs("/tmp/b", "/s.json", { persist: true })).not.toContain("--no-session-persistence");
    const revise = drawerArgs("/tmp/b", "/s.json", { persist: false, resume: "abc-123" });
    expect(revise[revise.indexOf("--resume") + 1]).toBe("abc-123");
    const transcript = [
      `{"type":"system","subtype":"ui_invalidate","session_id":"abc-123"}`,
      `{"type":"system","subtype":"init","session_id":"abc-123"}`,
    ].join("\n");
    expect(sessionIdOf(transcript)).toBe("abc-123");
    expect(sessionIdOf("not json\n")).toBeNull();
    expect(replyOf(`${transcript}\n{"type":"result","subtype":"success","result":"F1 fixed"}\n{"type":"torn`)).toBe("F1 fixed");
    expect(replyOf(transcript)).toBe("");
  });
});
