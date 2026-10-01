/**
 * A clear the agent drafts must survive Accept. The committed proposal reaches
 * the reducer through JSON — the harness's POST .../accept body and the
 * `proposal-ready` event — and JSON drops an own `undefined`, so a clear spelled
 * that way vanished in transit and Accept kept the old detail, glyph, or label.
 *
 * Driven end to end: the real gestures clear three optional channels, finalize
 * commits, the store accepts, the response crosses the wire, and the reducer
 * replays it the way Studio's Accept does (`canvas.applyAgentPatch`).
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAgentPatchOperation,
} from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import type { AcceptAgentSessionResponse } from "../src/protocol";
import {
  emitSessionEvent,
  LayoutSessionStore,
  toolFinalize,
  type LayoutSession,
} from "../src/service/session";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

const tempDir = mkdtempSync(join(tmpdir(), "canvas-agent-accept-clears-"));

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

/** A frame with a header glyph, a step with a detail line, and a labeled edge. */
function board(): InteractiveCanvasDocument {
  const frame = { ...box("frame", 0, 0, 960, 640, "section"), text: "Frame", icon: "agent" as const };
  const step = {
    ...box("step", 40, 80, 280, 120, "process"),
    text: "Step",
    detail: ":5432",
    parentId: "frame",
  };
  const sink = { ...box("sink", 480, 80, 280, 120, "process"), text: "Sink", parentId: "frame" };
  return makeDocument([frame, step, sink], [{ ...connect("step-sink", "step", "sink"), label: "writes" }]);
}

/** A store holding just `session`, whose baseline is on disk so accept's hash check passes. */
function storeFor(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  return store;
}

describe("a cleared channel through the accept wire", () => {
  test("a removed detail, header glyph, and edge label stay removed after Accept", () => {
    const baseline = board();
    const baselineRaw = JSON.stringify(baseline);
    const canvasPath = join(tempDir, "clears.canvas.json");
    writeFileSync(canvasPath, baselineRaw);
    const session = makeTestSession(baseline, ["frame"], {
      canvasPath,
      baselineHash: createHash("sha256").update(baselineRaw).digest("hex"),
    });

    expect(runOp(session, "update_text", { id: "step", detail: "" }).isError).toBeUndefined();
    expect(runOp(session, "change_shape", { id: "frame", patch: { icon: "none" } }).isError).toBeUndefined();
    expect(runOp(session, "update_text", { id: "step-sink", text: "" }).isError).toBeUndefined();
    const committed = toolFinalize(session, "committed", "Dropped the extras", emitSessionEvent);
    expect(committed.isError, committed.text).not.toBe(true);

    // The HTTP boundary: Studio reads the JSON of the accept response.
    const accepted = JSON.parse(
      JSON.stringify(storeFor(session).accept(session.id)),
    ) as AcceptAgentSessionResponse;
    const applied = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: accepted.operations as CanvasAgentPatchOperation[],
      summary: accepted.summary,
    }).document;

    const objectIn = (document: InteractiveCanvasDocument, id: string) =>
      document.objects.find((object) => object.id === id)!;
    expect("detail" in objectIn(applied, "step")).toBe(false);
    expect(objectIn(applied, "frame").icon).toBeUndefined();
    expect(applied.connections[0]!.label).toBeUndefined();
    // …which is the board the agent drafted, as both save to disk.
    const saved = (value: unknown) => JSON.parse(JSON.stringify(value));
    expect(saved(applied.objects)).toEqual(saved(session.draft.objects));
    expect(saved(applied.connections)).toEqual(saved(session.draft.connections));
  });
});
