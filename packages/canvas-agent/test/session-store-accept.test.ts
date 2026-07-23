import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import {
  HttpError,
  LayoutSessionStore,
  type LayoutSession,
} from "../src/service/session";
import type { AgentSessionStatus } from "../src/protocol";
import { makeDocument } from "./synthetic";

const tempDir = mkdtempSync(join(tmpdir(), "canvas-agent-accept-"));
const canvasPath = join(tempDir, "accept-gate.canvas.json");
const baseline = makeDocument([]);
const baselineRaw = JSON.stringify(baseline);
writeFileSync(canvasPath, baselineRaw);

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function makeStore(status: AgentSessionStatus): LayoutSessionStore {
  const session: LayoutSession = {
    id: "session-1",
    canvasId: "accept-gate",
    canvasPath,
    baseline,
    baselineHash: createHash("sha256").update(baselineRaw).digest("hex"),
    scopeResolution: {} as LayoutSession["scopeResolution"],
    scopeIds: new Set(),
    draft: baseline,
    proposalCount: 1,
    proposal: { n: 1, operations: [], summary: "Ready", delta: "", lint: "" },
    status,
    error: null,
    instruction: "Arrange",
    annotations: [],
    viewport: undefined,
    containerId: "container-1",
    sessionDir: tempDir,
    events: [],
    subscribers: new Set(),
    runPromise: null,
  };
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([[session.id, session]]);
  return store;
}

function expectConflict(action: () => unknown, message: string): void {
  try {
    action();
    throw new Error("Expected accept to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
    expect((error as Error).message).toBe(message);
  }
}

describe("LayoutSessionStore accept status gate", () => {
  test("accepts the last committed proposal after a follow-up is abandoned", () => {
    const store = makeStore("abandoned");

    expect(store.accept("session-1")).toEqual({ operations: [], summary: "Ready", rebased: false });
    expect(store.get("session-1").status).toBe("accepted");
  });

  test("refuses accept after reject", () => {
    const store = makeStore("proposal-ready");
    store.reject("session-1");

    expectConflict(() => store.accept("session-1"), "This session was discarded.");
  });

  test("refuses a second accept", () => {
    const store = makeStore("proposal-ready");
    store.accept("session-1");

    expectConflict(() => store.accept("session-1"), "This proposal was already applied.");
  });

  test("refuses accept while the agent is running", () => {
    const store = makeStore("running");

    expectConflict(() => store.accept("session-1"), "The agent is still working.");
  });
});
