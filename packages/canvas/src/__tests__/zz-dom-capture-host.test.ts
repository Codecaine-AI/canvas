import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { belowBandSize } from "../objects/text-slots";
import { FIGJAM_CANVAS_STYLE } from "../theme/canvas-style";

/**
 * The documented capture command (`bun packages/canvas/zz-dom-capture.ts`)
 * runs without the test preload, so it must switch to HarfBuzz itself:
 * its baselines carry measured caption widths. Greek is covered by Inter,
 * and its kerning tells the table estimate from HarfBuzz.
 */
test("the DOM baseline capture measures captions with HarfBuzz, like the tests and hosts", () => {
  const dir = mkdtempSync(join(tmpdir(), "zz-capture-"));
  try {
    const icon = {
      id: "greek", type: "icon" as const, icon: "config" as const, text: "ΑΛΦΑ ΒΗΤΑ ΓΑΜΜΑ", parentId: null,
      geometry: { x: 0, y: 0, width: 64, height: 64 }, style: { shape: "icon" as const },
    };
    writeFileSync(join(dir, "greek.canvas.json"), JSON.stringify({
      schemaVersion: 1, id: "greek", title: "Greek caption", mode: "diagram", objects: [icon], connections: [],
    }));
    const out = join(dir, "capture.json");
    const script = fileURLToPath(new URL("../../zz-dom-capture.ts", import.meta.url));
    const child = Bun.spawnSync([process.execPath, script, out], {
      env: { ...process.env, ZZ_CANVASES_DIR: dir }, stdout: "pipe", stderr: "pipe",
    });
    expect(child.exitCode).toBe(0);
    const viewer: string = JSON.parse(readFileSync(out, "utf8"))["fixture:greek"].viewer;
    const slot = /<span class="interactive-canvas-object-text-slot"[^>]*>/.exec(viewer)![0];
    const captured = Number(/(?:;|")width:([0-9.]+)px/.exec(slot)![1]);
    expect(captured).toBe(belowBandSize(icon.text, icon, FIGJAM_CANVAS_STYLE).widthPx);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
