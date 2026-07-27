import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { resolveScope } from "../src/board/scope";
import { createOpContext } from "../src/service/session/op-context";
import { findOperationTool } from "../src/service/session/operations";
import {
  emitSessionEvent,
  toolLook,
  type LayoutSession,
} from "../src/service/session";

export const FIXTURES_DIR = join(import.meta.dir, "fixtures");

export type OperationToolName =
  | "add_section"
  | "update_section"
  | "remove_section"
  | "add_sticky"
  | "update_sticky"
  | "remove_sticky"
  | "add_object"
  | "update_object"
  | "remove_object"
  | "add_connection"
  | "update_connection"
  | "remove_connection"
  | "fit_section";

/**
 * The single seam between this suite and the operation surface. Retargeting
 * the suite at the landed entry point is one edit here, for mutations and look.
 */
export function runOp(
  session: LayoutSession,
  tool: OperationToolName,
  params: Record<string, unknown>,
) {
  const operation = findOperationTool(tool);
  if (!operation) throw new Error(`Unknown operation tool: ${tool}`);
  return operation.execute(params, {
    currentSession: () => session,
    context: createOpContext,
    emit: emitSessionEvent,
  });
}

export function look(session: LayoutSession, view?: string) {
  return toolLook(session, view);
}

/** A bare in-memory layout session over a synthetic baseline (no kernel). */
export function makeTestSession(
  baseline: InteractiveCanvasDocument,
  requestedScopeIds: string[],
  overrides: Partial<LayoutSession> = {},
): LayoutSession {
  const scopeResolution = resolveScope(baseline, requestedScopeIds);
  return {
    id: "test-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/test-session.canvas.json",
    baseline,
    baselineHash: "test-hash",
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: baseline,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Edit the selected board objects",
    annotations: [],
    viewport: undefined,
    containerId: "test-container",
    sessionDir: "/tmp/test-session-dir",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    requests: [],
    lastDiagnostics: undefined,
    views: [],
    viewCount: 0,
    ...overrides,
  };
}

export interface FixtureProgram {
  file: string;
  text: string;
  width: number;
  height: number;
}

interface FixtureMeta {
  file: string;
  width: number;
  height: number;
}

/** The corpus programs lifted from the lab's guide examples. */
export function loadFixtures(): FixtureProgram[] {
  const manifest = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "fixtures.json"), "utf8"),
  ) as FixtureMeta[];
  return manifest.map(({ file, width, height }) => ({
    file,
    text: readFileSync(join(FIXTURES_DIR, file), "utf8").replace(/\n$/, ""),
    width,
    height,
  }));
}

export interface CanvasBoard {
  file: string;
  document: InteractiveCanvasDocument;
}

/** Immutable board snapshots used by the lab's promoted assertions. */
export function loadCanvasBoards(): CanvasBoard[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith(".canvas.json"))
    .sort()
    .map((file) => ({
      file,
      document: JSON.parse(
        readFileSync(join(FIXTURES_DIR, file), "utf8"),
      ) as InteractiveCanvasDocument,
    }));
}

function contentBounds(document: InteractiveCanvasDocument): { width: number; height: number } {
  const objects = document.objects;
  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return { width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** The expansion canvas the lab's dev assertions used for real boards. */
export function dimensionFor(document: InteractiveCanvasDocument): { width: number; height: number } {
  const bounds = contentBounds(document);
  return {
    width: Math.max(720, Math.round(bounds.width)),
    height: Math.max(480, Math.round(bounds.height)),
  };
}
