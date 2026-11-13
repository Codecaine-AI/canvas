import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { drawerInput, drawerPass, drawerSession, rateLimitedPass, type DrawerPart, type runDrawer } from "./drawer.ts";

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

describe("climb drawer rate limit", () => {
  /** The closing event of a round 4 pass that the API turned down: 5 loops ended on it. */
  const LIMITED = JSON.stringify({
    type: "result", subtype: "success", is_error: true, api_error_status: 429, terminal_reason: "api_error",
    result: "API Error: Request rejected (429) · No account can serve claude-opus-5-5 right now (no_eligible_account)",
  });
  const init = (session: string) => JSON.stringify({ type: "system", subtype: "init", session_id: session });
  /** A drawer that the API turns down `limited` times, then lets through. */
  const drawer = (limited: number, timedOut = false) => {
    const passes: Array<string | undefined> = [];
    const waits: number[] = [];
    const run: typeof runDrawer = async (_dir, args, _message, transcriptPath) => {
      passes.push(args.includes("--resume") ? args[args.indexOf("--resume") + 1] : undefined);
      const down = passes.length <= limited;
      writeFileSync(transcriptPath, `${init(`s-${passes.length}`)}\n${down ? LIMITED : JSON.stringify({ type: "result", is_error: false, result: "F1 fixed" })}\n`);
      return { exitCode: down ? 1 : 0, signal: null, timedOut, durationMs: 1 };
    };
    return { passes, waits, run, sleep: async (ms: number) => { waits.push(ms); } };
  };
  const pass = (stub: ReturnType<typeof drawer>, name: string) => {
    const dir = mkdtempSync(resolve(tmpdir(), "climb-limit-"));
    const transcriptPath = resolve(dir, `${name}.jsonl`);
    return drawerPass({ dir, settingsPath: "/s.json", session: { persist: true, resume: "s-0" }, message: ["revise"], transcriptPath, timeoutMs: 1000, run: stub.run, sleep: stub.sleep })
      .then((result) => ({ ...result, dir, transcriptPath }));
  };

  test("a pass is rate limited when its closing event is an API error with HTTP 429, 529 or 503, or one that names the limit", () => {
    expect(rateLimitedPass(`${init("s")}\n${LIMITED}\n`)).toBe(true);
    const closing = (event: object) => rateLimitedPass(`${JSON.stringify({ type: "result", ...event })}\n`);
    expect(closing({ is_error: true, api_error_status: 529, result: "Overloaded" })).toBe(true);
    expect(closing({ is_error: true, terminal_reason: "api_error", result: "API Error: Overloaded" })).toBe(true);
    // Another API error, a reply that only talks about a limit, and a pass that did not close.
    expect(closing({ is_error: true, api_error_status: 400, terminal_reason: "api_error", result: "API Error: invalid request" })).toBe(false);
    expect(closing({ is_error: false, result: "F1 declined: the rate limit note stays" })).toBe(false);
    expect(rateLimitedPass(`${init("s")}\n`)).toBe(false);
  });

  test("a pass the API turns down runs again after 1 and 2 minutes, in the session the try before it left, and keeps each try's transcript", async () => {
    const stub = drawer(2);
    const { run, transcript, transcriptPath } = await pass(stub, "revise-transcript");
    expect(run).toMatchObject({ exitCode: 0, tries: 3, rateLimited: false });
    expect(stub.waits).toEqual([60_000, 120_000]);
    expect(stub.passes).toEqual(["s-0", "s-1", "s-2"]);
    expect(transcript).toContain("F1 fixed");
    expect(readFileSync(transcriptPath, "utf8")).toBe(transcript);
    for (const attempt of [1, 2]) expect(readFileSync(transcriptPath.replace(".jsonl", `.try-${attempt}.jsonl`), "utf8")).toContain("no_eligible_account");
    expect(existsSync(transcriptPath.replace(".jsonl", ".try-3.jsonl"))).toBe(false);
  });

  test("after 5 tries the pass gives up and says the limit stopped it", async () => {
    const stub = drawer(9);
    const { run } = await pass(stub, "revise-transcript");
    expect(run).toMatchObject({ exitCode: 1, tries: 5, rateLimited: true });
    expect(stub.waits).toEqual([60_000, 120_000, 240_000, 480_000]);
  });

  test("a pass that runs out of time is not run again", async () => {
    const stub = drawer(9, true);
    const { run } = await pass(stub, "revise-transcript");
    expect(run).toMatchObject({ tries: 1, rateLimited: false, timedOut: true });
    expect(stub.waits).toEqual([]);
  });

  test("the loop's drawer goes on in the session of the try that got through", async () => {
    const stub = drawer(1);
    const dir = mkdtempSync(resolve(tmpdir(), "climb-limit-"));
    const session = drawerSession({ dir, settingsPath: "/s.json", timeoutMs: 1000, session: "s-0" }, stub.run, stub.sleep);
    const first = await session(["revise"], resolve(dir, "a.jsonl"));
    await session(["revise again"], resolve(dir, "b.jsonl"));
    expect(first).toMatchObject({ reply: "F1 fixed", run: { tries: 2, rateLimited: false } });
    expect(stub.passes).toEqual(["s-0", "s-1", "s-2"]);
  });
});
