import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { resolveScope } from "../src/board/scope";
import { createOpContext } from "../src/service/session/tools/operations/op-context";
import { findOperationTool } from "../src/service/session/tools/operations";
import {
  emitSessionEvent,
  toolLook,
  type LayoutSession,
} from "../src/service/session";
import type { LookRequest } from "../src/service/session/tools";

export const FIXTURES_DIR = join(import.meta.dir, "fixtures");

/** The gesture roster, in the groups `operations/index.ts` orders it by. */
export type OperationToolName =
  // Place
  | "place_section"
  | "place_sticky"
  | "place_shape"
  | "clone"
  | "connect"
  // Arrange
  | "move_to"
  | "move_by"
  | "resize"
  | "match_size"
  | "align"
  | "space_out"
  // Content & appearance
  | "update_text"
  | "change_color"
  | "change_shape"
  // Sections
  | "fit_section"
  | "change_section_border"
  | "lock"
  | "unlock"
  // Edges
  | "style_edge"
  | "change_connection"
  | "reroute"
  | "shift_segment"
  | "reset_route"
  | "move_label"
  // Delete
  | "delete";

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

/** `look(session, "home")` for one close-up, or `look(session, { view: [ids] })` for a union frame. */
export function look(session: LayoutSession, request?: string | LookRequest) {
  return toolLook(
    session,
    typeof request === "string" ? { view: request } : (request ?? {}),
  );
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
    changeRenders: [],
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
