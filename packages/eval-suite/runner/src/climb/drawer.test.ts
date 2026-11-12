import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { drawerInput, drawerSession, type DrawerPart, type runDrawer } from "./drawer.ts";

describe("climb drawer message", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "climb-drawer-"));

  test("a message goes to the drawer as one stream-json user event, with its images in line", () => {
    const png = resolve(dir, "trial.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
    const input = drawerInput(["F1 [should, routing] w", "Image 1 · F1", { image: png }]);
    expect(input.endsWith("\n") && input.indexOf("\n")).toBe(input.length - 1);
    expect(JSON.parse(input)).toEqual({
      type: "user",
      message: { role: "user", content: [
        { type: "text", text: "F1 [should, routing] w" },
        { type: "text", text: "Image 1 · F1" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORwECAw==" } },
      ] },
    });
  });

  test("every pass of a loop's drawer saves its session, so the pass after it can resume it, the last revise too", async () => {
    const passes: Array<{ args: string[]; message: DrawerPart[] }> = [];
    const run: typeof runDrawer = async (_dir, args, message, transcriptPath) => {
      passes.push({ args, message });
      writeFileSync(transcriptPath, `{"type":"system","subtype":"init","session_id":"s-${passes.length}"}\n{"type":"result","result":"F1 fixed"}\n`);
      return { exitCode: 0, signal: null, timedOut: false, durationMs: 1 };
    };
    const pass = drawerSession({ dir, settingsPath: "/s.json", timeoutMs: 1000, session: "s-0" }, run);
    const revise = await pass(["the last revise"], resolve(dir, "revise-transcript.jsonl"));
    const reask = await pass(["F2 has no answer line"], resolve(dir, "revise-reask-transcript.jsonl"));
    expect([revise.reply, reask.reply]).toEqual(["F1 fixed", "F1 fixed"]);
    expect(passes.map(({ args }) => [args.includes("--no-session-persistence"), args[args.indexOf("--resume") + 1]]))
      .toEqual([[false, "s-0"], [false, "s-1"]]);
    // The message is not an argument: the drawer reads it on stdin.
    expect(passes[0]!.args).toContain("--input-format");
    expect(passes.map(({ args, message }) => [args.includes(message[0] as string), message])).toEqual([
      [false, ["the last revise"]], [false, ["F2 has no answer line"]],
    ]);
  });
});
