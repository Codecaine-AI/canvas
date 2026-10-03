// Two copies of text-measure in one process share one backend. Runs in a fresh
// process (see test/helpers.ts) and prints what each copy observes as one JSON line.
//   TM_COPY=bundle  the core entry bundled with Bun.build (its own Pretext inlined),
//                   loaded before src/headless.ts, like Studio's Electron main bundle
//                   next to the headless entry loaded from node_modules
//   TM_COPY=tree    a copy of src/ under the temp dir, resolving the same node_modules
//                   (one Pretext instance for both copies), loaded after src/headless.ts

import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type Core = typeof import("../../src/index.ts");
type Headless = typeof import("../../src/headless.ts");

const PACKAGE = fileURLToPath(new URL("../../", import.meta.url));
const mode = process.env.TM_COPY === "tree" ? "tree" : "bundle";
const dir = mkdtempSync(join(tmpdir(), "text-measure-copy-"));

try {
  let other: Core;
  let src: Headless;
  let sharedPretext: boolean | null = null;
  if (mode === "bundle") {
    const build = await Bun.build({ entrypoints: [`${PACKAGE}src/index.ts`], target: "bun", format: "esm", outdir: dir });
    if (!build.success) throw new AggregateError(build.logs, "bundling the core entry failed");
    other = (await import(build.outputs[0]!.path)) as Core;
    src = await import("../../src/headless.ts");
  } else {
    const pretextEntry = Bun.resolveSync("@chenglou/pretext", PACKAGE);
    const nodeModules = pretextEntry.slice(0, pretextEntry.lastIndexOf("/node_modules/") + "/node_modules".length);
    cpSync(`${PACKAGE}src`, join(dir, "src"), { recursive: true });
    symlinkSync(nodeModules, join(dir, "node_modules"));
    src = await import("../../src/headless.ts");
    other = (await import(join(dir, "src/index.ts"))) as Core;
    const ours = await import("../../src/pretext-binding.ts");
    const theirs = (await import(join(dir, "src/pretext-binding.ts"))) as typeof ours;
    sharedPretext = ours.pretext() === theirs.pretext();
  }

  const font = { family: "Inter", size: 16 };
  // Greek: the table backend does not kern it, HarfBuzz does.
  const text = "Ελληνικά κείμενο για μέτρηση";
  let otherChanges = 0;
  other.onBackendChange(() => otherChanges++);
  const tableWidth = other.measureWidth(text, font);
  // Fill both copies' Pretext caches with table widths: a switch must flush them.
  other.wrapText(text, font, { maxWidth: 1000, lineHeight: 20 });
  src.wrapText(text, font, { maxWidth: 1000, lineHeight: 20 });

  await src.useHarfBuzz();
  const harfBuzzWidth = src.measureWidth(text, font);
  // Between the two natural widths: one backend fits the text on one line, the other needs two.
  const box = { maxWidth: (tableWidth + harfBuzzWidth) / 2, lineHeight: 20 };
  const afterHarfBuzz = {
    other: other.activeBackend(),
    src: src.activeBackend(),
    otherChanges,
    widths: { other: other.measureWidth(text, font), src: harfBuzzWidth, table: tableWidth },
    lines: { other: other.wrapText(text, font, box).lines, src: src.wrapText(text, font, box).lines },
  };

  other.useTableBackend();
  const afterOtherTable = {
    src: src.activeBackend(),
    otherChanges,
    srcWidth: src.measureWidth(text, font),
    srcLines: src.wrapText(text, font, box).lines,
  };

  src.useTableBackend();
  const afterSrcTable = { otherChanges };

  console.log(JSON.stringify({ mode, sharedPretext, afterHarfBuzz, afterOtherTable, afterSrcTable }));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
