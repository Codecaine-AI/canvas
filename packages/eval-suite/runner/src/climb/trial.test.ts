import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { BOARD_UNIT, LOOSE_UNIT, type Mark, type ProposedCall } from "./review-types.ts";
import { trialFindings, type TrialRecord } from "./trial.ts";

const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");
const canvas = await loadReviewCanvas();

const call = (unit: string, tool: string, args: Record<string, unknown>, marks: Mark[] = []): ProposedCall => ({ unit, call: { tool, args }, marks });

async function trial(findings: Array<{ id: string; calls: ProposedCall[] }>) {
  const outDir = mkdtempSync(resolve(tmpdir(), "trial-test-"));
  const advice = await trialFindings({ canvas, boardPath: BOARD, outDir, findings });
  const record = JSON.parse(readFileSync(resolve(outDir, "trial.json"), "utf8")) as TrialRecord;
  return { advice, record, outDir };
}

describe("the trial run", () => {
  test("the design's trial: e_preflight leaves the executor on the right", async () => {
    const bytes = readFileSync(BOARD);
    const beside = readdirSync(dirname(BOARD));
    const preflight = call("sec_engine", "change_connection", { id: "e_preflight", patch: { from: { objectId: "executor", anchor: "right" } } },
      [{ style: "sketch", path: [[520, 640], [620, 640], [620, 220], [780, 220]] }]);
    const { advice, record, outDir } = await trial([{ id: "F1", calls: [preflight] }]);

    const [only] = record.calls;
    expect(only!.alone).toMatchObject({ applied: true, flags: [], board: { after: { lints: [], crossings: 0 } } });
    const wire = only!.alone.wires.find((item) => item.id === "e_preflight")!;
    expect(wire.before).toMatchObject({ length: 874, bends: 3, ports: { from: "top", to: "left" }, labelAt: { x: 370, y: 545 }, trunks: [] });
    expect(wire.after).toMatchObject({ length: 874, bends: 2, ports: { from: "right", to: "left" }, labelAt: { x: 521, y: 391 }, trunks: [{ wire: "e_calls", length: 227 }] });
    expect(only!.sequence).toMatchObject({ applied: true, turn: 1, conflictsWith: [] });

    expect(advice).toHaveLength(1);
    const lines = advice[0]!.lines.join("\n");
    expect(lines).toContain(JSON.stringify(preflight.call));
    expect(lines).toContain("e_preflight: length 874 px · bends 2 (was 3) · ports right→left (was top→left) · label at (521, 391) (was at (370, 545)) · crosses none · through none · shared trunk e_calls 227 px (was none)");
    // A wire the call does not name gets only the numbers that changed.
    expect(lines).toContain("e_calls: label at (706, 640) (was at (614, 640)) · shared trunk e_preflight 227 px (was none)");
    expect(advice[0]!.images).toEqual([resolve(outDir, "trial-F1-1.png")]);
    // Now and the trial, side by side.
    const png = readFileSync(advice[0]!.images[0]!);
    expect(png.readUInt32BE(16)).toBeGreaterThan(2 * png.readUInt32BE(20));

    // The board is read, never written.
    expect(readFileSync(BOARD).equals(bytes)).toBe(true);
    expect(readdirSync(dirname(BOARD))).toEqual(beside);
  });

  test("a move reports the geometry asked and the geometry that landed on the 20 px grid", async () => {
    const { advice, record } = await trial([{ id: "F1", calls: [call(LOOSE_UNIT, "move", { id: "s_ctx", by: { dx: 10, dy: 0 } })] }]);
    const [box] = record.calls[0]!.alone.boxes;
    expect(box).toMatchObject({ id: "s_ctx", before: { x: 1680, y: 180 }, asked: { x: 1690, y: 180 }, after: { x: 1700, y: 180 } });
    expect(advice[0]!.lines.join("\n")).toContain("asked x 1690 (+10), landed x 1700 (+20)");
  });

  test("a route call reports the route that landed, in the tool's segment numbers", async () => {
    const { advice } = await trial([{ id: "F1", calls: [call("sec_engine", "route", { id: "e_preflight", shift: { segment: 2, to: 641 } })] }]);
    const lines = advice[0]!.lines.join("\n");
    expect(lines).toContain("e_preflight route before: executor (s0 v x=370) ─(s1 h y=520)→ (s2 v x=620) ─(s3 h y=220)→ capabilities");
    expect(lines).toContain("e_preflight route after:  executor (s0 v x=370) ─(s1 h y=520)→ (s2 v x=640) ─(s3 h y=220)→ capabilities");
  });

  test("a call that changes nothing, and a call the tool refuses, are refused with the tool's text", async () => {
    const sketch: Mark = { style: "sketch", box: { x: 1720, y: 180, width: 300, height: 100 } };
    const { advice, record, outDir } = await trial([
      { id: "same", calls: [call("sec_contract", "move", { id: "s_ctx", to: { x: 1680, y: 180 } })] },
      { id: "bad", calls: [call("sec_contract", "move", { id: "s_nope", by: { dx: 40, dy: 0 } }, [sketch])] },
    ]);
    const [same, bad] = record.calls;
    expect(same).toMatchObject({ alone: { applied: false, flags: [{ kind: "refused", text: "the call changes nothing on the board" }] }, sequence: null, image: null });
    expect(advice[0]!.lines.join("\n")).toContain("NO-OP · move s_ctx — the board already matches this, so nothing changed.");
    expect(bad).toMatchObject({ alone: { applied: false, flags: [{ kind: "refused" }] }, sequence: null });
    expect(advice[1]!.lines.join("\n")).toContain(`ERROR · move — id "s_nope" is not on the board.`);
    // The sketch of the refused call, on the board as it is.
    expect(advice[1]!.lines.join("\n")).toContain("sketch, not trialled");
    expect(advice[1]!.images).toEqual([resolve(outDir, "trial-bad-1.png")]);
    expect(existsSync(advice[1]!.images[0]!)).toBe(true);
    expect(record.sequence.order).toEqual([]);
  });

  test("the whole-board reviewer's call runs first, and a call it makes useless conflicts after it", async () => {
    const { advice, record } = await trial([
      { id: "F1", calls: [call(LOOSE_UNIT, "move", { id: "s_ctx", to: { x: 1700, y: 180 } })] },
      { id: "F2", calls: [call(BOARD_UNIT, "move", { id: "s_ctx", by: { dx: 20, dy: 0 } })] },
      { id: "F3", calls: [call("sec_contract", "move", { id: "s_caps", by: { dx: 0, dy: 20 } })] },
    ]);
    expect(record.sequence.order).toEqual(["F2 call 1", "F3 call 1", "F1 call 1"]);
    const [loose, board, section] = record.calls;
    expect(loose!.alone).toMatchObject({ applied: true, flags: [] });
    expect(board!.sequence).toMatchObject({ applied: true, turn: 1, flags: [], conflictsWith: [] });
    expect(section!.sequence).toMatchObject({ applied: true, turn: 2, flags: [], conflictsWith: [] });
    // Only the earlier call that touches s_ctx is named.
    expect(loose!.sequence).toMatchObject({ applied: false, turn: 3, conflictsWith: ["F2 call 1"] });
    expect(loose!.sequence!.flags.map((flag) => flag.kind)).toEqual(["refused", "conflict"]);
    expect(advice[0]!.lines.join("\n")).toContain("conflicts after earlier calls: F2 call 1");
  });

  test("a new crossing is a flag, alone and after an earlier call", async () => {
    const { advice, record } = await trial([
      { id: "F1", calls: [call(LOOSE_UNIT, "route", { id: "e_bridge", points: [[620, 1260], [620, 1100], [1000, 1100], [1000, 1260]] })] },
      { id: "F2", calls: [call(BOARD_UNIT, "move", { id: "s_legend", by: { dx: 0, dy: 40 } })] },
    ]);
    const crossings = ["new crossing e_bridge × e_m_kernel", "new crossing e_bridge × e_wraps", "new crossing e_bridge × e_writes"];
    const [bridge] = record.calls;
    expect(bridge!.alone.flags.map((flag) => flag.text)).toEqual(crossings);
    // No earlier call touches e_bridge, so the conflict names every earlier call.
    expect(bridge!.sequence).toMatchObject({ applied: true, turn: 2, conflictsWith: ["F2 call 1"] });
    expect(bridge!.sequence!.flags.map((flag) => flag.text)).toEqual([...crossings, "conflicts after earlier calls: F2 call 1"]);
    expect(advice[0]!.lines.join("\n")).toContain("conflicts after earlier calls: F2 call 1, and the call raises the same flags alone");
  });

  test("every wire a call changes gets a line", async () => {
    const { advice, record } = await trial([{ id: "F1", calls: [call(BOARD_UNIT, "move", { id: "sec_providers", by: { dx: 0, dy: 20 } })] }]);
    const wires = record.calls[0]!.alone.wires.map((wire) => wire.id);
    expect(wires.length).toBeGreaterThan(8);
    for (const id of wires) expect(advice[0]!.lines.filter((line) => line.trim().startsWith(`${id}: `))).toHaveLength(1);
    expect(advice[0]!.lines.join("\n")).toContain("e_d_kernel: length 217 px (was 197 px)");
  });

  test("a wire that slides along boxes that stay is a change", async () => {
    const small = resolve(mkdtempSync(resolve(tmpdir(), "trial-test-")), "small.canvas.json");
    const toolkit = canvas.toolkit as unknown as {
      createCanvasFile(path: string, title: string): unknown;
      callToolkitTool(file: unknown, name: string, args: Record<string, unknown>): Promise<{ isError?: boolean }>;
    };
    const file = toolkit.createCanvasFile(small, "small");
    for (const [tool, args] of [
      ["place_shape", { id: "a0", type: "rectangle", text: "a0", at: [0, 280] }],
      ["place_shape", { id: "a1", type: "rectangle", text: "a1", at: [600, 280] }],
      ["connect", { id: "a", from: { objectId: "a0" }, to: { objectId: "a1" } }],
    ] as const) expect((await toolkit.callToolkitTool(file, tool, args)).isError).toBeFalsy();

    const outDir = mkdtempSync(resolve(tmpdir(), "trial-test-"));
    const slide = call(LOOSE_UNIT, "change_connection", { id: "a", patch: { from: { objectId: "a0", position: [0.9, 0.9] }, to: { objectId: "a1", position: [0.1, 0.9] } } });
    const advice = await trialFindings({ canvas, boardPath: small, outDir, findings: [{ id: "F1", calls: [slide] }] });
    const lines = advice[0]!.lines.join("\n");
    expect(lines).toContain("a route before: a0 ─(s0 h y=330)→ a1");
    expect(lines).toContain("a route after:  a0 ─(s0 h y=370)→ a1");
  });
});
