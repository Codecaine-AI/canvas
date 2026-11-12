import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadCanvas } from "./render.ts";
import { CANVAS_REPO_ROOT } from "./paths.ts";
import { boardTotals, loadWireModules, sharedRun, wireFacts } from "./wires.ts";

/** Board 05 as round 3 drew it: the board the round 4 design measures. */
const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");

describe("wire facts", () => {
  test("give each wire of board 05 its routed numbers", async () => {
    const canvas = await loadCanvas(CANVAS_REPO_ROOT);
    const modules = await loadWireModules();
    const file = canvas.toolkit.openCanvasFile(BOARD);
    const facts = wireFacts(modules, file);
    const preflight = facts.find((wire) => wire.id === "e_preflight")!;
    expect(preflight).toMatchObject({
      from: "executor", to: "capabilities", ports: { from: "top", to: "left" },
      length: 874, bends: 3, byHand: true, label: "preflight before dispatch", labelAt: { x: 370, y: 545 }, through: [],
    });
    expect(preflight.route).toBe("executor (s0 v x=370) ─(s1 h y=520)→ (s2 v x=620) ─(s3 h y=220)→ capabilities");
    // The three dispatch wires leave send_query on one trunk.
    const claude = facts.find((wire) => wire.id === "e_d_claude")!;
    expect(claude.trunks.map((trunk) => trunk.wire).sort()).toEqual(["e_d_codex", "e_d_pi"]);
    expect(boardTotals(modules, file).text).toStartWith("LAYOUT · wire length 10957px · 0 crossings");
  });

  test("count the px two routes run on one line", () => {
    const a = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }];
    expect(sharedRun(a, [{ x: 100, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 90 }])).toBe(160);
    // A run of 20 px or less is a touch, and a parallel run 4 px away is another lane.
    expect(sharedRun(a, [{ x: 280, y: 0 }, { x: 300, y: 0 }])).toBe(0);
    expect(sharedRun(a, [{ x: 0, y: 4 }, { x: 300, y: 4 }])).toBe(0);
  });
});
