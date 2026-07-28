/**
 * board-trace — the end-of-turn "app:board-render" trace publication
 * (src/service/session/board-trace). Exercises event construction and
 * emission against a real temp kernel db and a mocked trace writer inside a
 * synthetic run scope. The live path — spawnAgent's onTurnEnd firing inside
 * the run's async-local scope — is the kernel's own contract and is not
 * re-driven end to end here.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureKernelObservabilitySchema,
  getTraceBlob,
  hashTraceBlobBytes,
  kernelDatabasePath,
  openKernelDatabase,
  type KernelDatabaseHandle,
} from "@agent-kernel/db";
import { runWithContext, type RunContext } from "@agent-kernel/kernel";
import type { TraceEvent } from "@agent-kernel/protocol";

import {
  BOARD_RENDER_EVENT_TYPE,
  emitBoardRenderTraceEvent,
} from "../src/service/session/board-trace";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const PNG_HASH = hashTraceBlobBytes(PNG);

let dir: string;
let handle: KernelDatabaseHandle;
let submitted: TraceEvent[];

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    containerId: "container-1",
    runId: "run-1",
    trigger: "operator",
    agentName: "layout-editor",
    agentId: "agent-1",
    piSessionUuid: "pi-uuid-1",
    traceWriter: { submit: (event: TraceEvent) => submitted.push(event) },
    ...overrides,
  };
}

const BOARD = { png: PNG, n: 4, summary: "aligned the auth column" };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "canvas-agent-board-trace-test-"));
  handle = openKernelDatabase({ path: kernelDatabasePath(dir) });
  await ensureKernelObservabilitySchema(handle.db);
  submitted = [];
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("emitBoardRenderTraceEvent", () => {
  test("stores the PNG blob and submits the app:board-render event", async () => {
    await runWithContext(makeContext(), () =>
      emitBoardRenderTraceEvent(handle.db, BOARD, 5),
    );

    expect(submitted).toHaveLength(1);
    const event = submitted[0];
    expect(event.type).toBe(BOARD_RENDER_EVENT_TYPE);
    expect(event.source).toBe("app");
    expect(event.containerId).toBe("container-1");
    expect(event.runId).toBe("run-1");
    expect(event.agentId).toBe("agent-1");
    expect(event.piSessionUuid).toBe("pi-uuid-1");
    expect(event.eventData).toEqual({
      blob_hash: PNG_HASH,
      mimeType: "image/png",
      byte_length: PNG.byteLength,
      n: 4,
      summary: "aligned the auth column",
      turn: 5,
      turn_number: 4,
    });

    // The referenced blob is really in the store, byte for byte.
    const blob = await getTraceBlob(handle.db, PNG_HASH);
    expect(blob).not.toBeNull();
    expect(blob!.kind).toBe("image");
    expect(blob!.mimeType).toBe("image/png");
    expect(blob!.byteLength).toBe(PNG.byteLength);
    expect(Buffer.from(blob!.data).equals(PNG)).toBe(true);
  });

  test("re-emitting the same board dedupes the blob and still submits", async () => {
    await runWithContext(makeContext(), async () => {
      await emitBoardRenderTraceEvent(handle.db, BOARD, 1);
      await emitBoardRenderTraceEvent(handle.db, BOARD, 2);
    });

    expect(submitted).toHaveLength(2);
    expect(submitted.map((event) => (event.eventData as { turn: number }).turn)).toEqual([
      1, 2,
    ]);
    expect(await getTraceBlob(handle.db, PNG_HASH)).not.toBeNull();
  });

  test("a session without a current board emits nothing", async () => {
    await runWithContext(makeContext(), () =>
      emitBoardRenderTraceEvent(handle.db, undefined, 3),
    );
    expect(submitted).toHaveLength(0);
  });

  test("a run context without a pi session emits nothing rather than an orphan", async () => {
    await runWithContext(makeContext({ piSessionUuid: undefined }), () =>
      emitBoardRenderTraceEvent(handle.db, BOARD, 3),
    );
    expect(submitted).toHaveLength(0);
    expect(await getTraceBlob(handle.db, PNG_HASH)).toBeNull();
  });

  test("never throws outside a run scope — the failure is logged, not raised", async () => {
    await expect(
      emitBoardRenderTraceEvent(handle.db, BOARD, 3),
    ).resolves.toBeUndefined();
    expect(submitted).toHaveLength(0);
  });
});
