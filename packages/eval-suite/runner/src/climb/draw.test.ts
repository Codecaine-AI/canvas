import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { drawOne, type DrawRecord } from "./draw.ts";
import type { DrawerPart, runDrawer } from "./drawer.ts";
import { canvasIdOf } from "./paths.ts";

/** A brief folder as a climb keeps it: a held-out board whose key names what it tests, and a board the index gives no canvas id. */
function briefFolder(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "climb-briefs-"));
  writeFileSync(resolve(dir, "index.json"), JSON.stringify({
    sets: { climb: ["10-container-tree"], heldOut: ["h3-gateway-stickies"] },
    boards: { "h3-gateway-stickies": { set: "heldOut", canvasId: "llm-inference-gateway" }, "10-container-tree": { set: "climb" } },
  }));
  writeFileSync(resolve(dir, "h3-gateway-stickies.md"), "Draw the gateway.\n");
  return dir;
}

describe("climb canvas id", () => {
  test("a board's canvas id is the one its brief folder's index gives it, else its key without the ordinal, and a frozen scenario's id as it is", () => {
    const briefDir = briefFolder();
    expect(canvasIdOf("h3-gateway-stickies", briefDir)).toBe("llm-inference-gateway");
    expect([canvasIdOf("10-container-tree", briefDir), canvasIdOf("r4-review-service", briefDir)]).toEqual(["container-tree", "review-service"]);
    expect(canvasIdOf("llm-inference-gateway")).toBe("llm-inference-gateway");
  });
});

describe("climb draw", () => {
  test("the drawer never reads the brief key: not in its message, its arguments or its folder, and the output folder and the board file keep the key", async () => {
    const [briefDir, climbRoot] = [briefFolder(), mkdtempSync(resolve(tmpdir(), "climb-root-"))];
    const seen: Array<{ dir: string; args: string[]; message: DrawerPart[] }> = [];
    const run: typeof runDrawer = async (dir, args, message, transcriptPath) => {
      seen.push({ dir, args, message });
      // The canvas server saves the board under the canvas id the drawer gave it.
      const id = /canvas id "([^"]+)"/.exec(message[0] as string)![1]!;
      mkdirSync(resolve(dir, "canvases"), { recursive: true });
      writeFileSync(resolve(dir, "canvases", `${id}.canvas.json`), JSON.stringify({ id }));
      writeFileSync(transcriptPath, `{"type":"result","result":"done"}\n`);
      return { exitCode: 0, signal: null, timedOut: false, durationMs: 1 };
    };
    const record = await drawOne({ brief: "h3-gateway-stickies", round: 0, climbRoot, settingsPath: "/s.json", timeoutMs: 1000, briefDir, run });

    expect(seen.length).toBe(1);
    expect(seen[0]!.message[0]).toContain(`canvas id "llm-inference-gateway"`);
    for (const word of ["h3-gateway", "stickies"]) expect(JSON.stringify(seen[0]).includes(word)).toBe(false);

    const kept = resolve(climbRoot, "round-0", "h3-gateway-stickies");
    expect(readdirSync(resolve(climbRoot, "round-0"))).toEqual(["h3-gateway-stickies"]);
    expect(readdirSync(kept).sort()).toEqual(["draw.json", "h3-gateway-stickies.canvas.json", "transcript.jsonl"]);
    expect(JSON.parse(readFileSync(resolve(kept, "h3-gateway-stickies.canvas.json"), "utf8"))).toEqual({ id: "llm-inference-gateway" });
    const saved = JSON.parse(readFileSync(resolve(kept, "draw.json"), "utf8")) as DrawRecord;
    expect([saved.brief, saved.board, saved.exitCode]).toEqual(["h3-gateway-stickies", "h3-gateway-stickies.canvas.json", 0]);
    expect(saved).toEqual(record);

    // A rerun of the round finds the finished board under the key, and draws nothing.
    await drawOne({ brief: "h3-gateway-stickies", round: 0, climbRoot, settingsPath: "/s.json", timeoutMs: 1000, briefDir, run });
    expect([seen.length, existsSync(resolve(climbRoot, "round-0", ".drawing"))]).toEqual([1, false]);
  });
});
