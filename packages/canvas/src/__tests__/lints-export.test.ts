import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FINISHING_RULES, LAYOUT_RULES, formatDiagnostics, runDiagnostics } from "@codecaine-ai/canvas/lints";
import * as entry from "@codecaine-ai/canvas";
import type { InteractiveCanvasDocument } from "../state/schema";

const SRC = join(import.meta.dir, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? sources(join(dir, item.name)) : item.name.endsWith(".ts") ? [join(dir, item.name)] : []);
}

describe("board lints export", () => {
  test("another host runs every board lint from the canvas package alone", () => {
    const document: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "lint-export",
      title: "Lint export",
      mode: "diagram",
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        { id: "a", type: "process", text: "Ingest", color: "teal", parentId: null, geometry: { x: 0, y: 0, width: 280, height: 100 } },
        { id: "b", type: "process", text: "Index", color: "teal", parentId: null, geometry: { x: 140, y: 40, width: 280, height: 100 } },
      ],
      connections: [],
      annotations: [],
    };
    const findings = runDiagnostics(document, FINISHING_RULES);
    expect(findings.some((finding) => finding.rule === "covered-content" && finding.severity === "error")).toBe(true);
    expect(formatDiagnostics(findings)).toMatch(/^DIAGNOSTICS · \d+ errors?/);
    expect(FINISHING_RULES.length).toBe(LAYOUT_RULES.length + 1);
    expect(entry.runDiagnostics).toBe(runDiagnostics);
  });

  test("the lint sources import nothing from canvas-agent", () => {
    const offenders = sources(join(SRC, "board"))
      .filter((file) => /from\s+["'][^"']*canvas-agent/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
