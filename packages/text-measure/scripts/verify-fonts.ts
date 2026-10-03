#!/usr/bin/env bun
/**
 * Checks that every bundled woff2 is the same build as its TTF: the tables
 * that decide advances, kerning, shaping and coverage (cmap, hhea, hmtx, OS/2,
 * GDEF, GPOS, GSUB) must be byte-identical and units per em, font revision
 * and glyph count must agree. Hinting (the Inter TTFs are hinted, the woff2
 * web builds are not), timestamps, checksums and name strings may differ;
 * glyf/loca are stored transformed in WOFF2 and outlines do not change
 * widths. scripts/truth-chromium.ts additionally compares advances in Chromium.
 *   bun canvas/packages/text-measure/scripts/verify-fonts.ts
 */

import { fileURLToPath } from "node:url";
import { BUNDLED_FACES } from "../src/faces.ts";
import { compareBuild } from "./font-files.ts";

const FONTS_DIR = fileURLToPath(new URL("../fonts", import.meta.url));
let failed = false;
for (const face of BUNDLED_FACES) {
  const c = compareBuild(FONTS_DIR, face.file);
  failed ||= !c.sameBuild;
  const layout = Object.entries(c.layout).map(([tag, same]) => `${tag}${same ? "" : " DIFFERS"}`).join(" ");
  console.log(
    `${c.sameBuild ? "same build" : "DIFFERENT "}  ${face.file.padEnd(21)} ttf "${c.version.ttf}" / woff2 "${c.version.woff2}"  layout tables: ${layout}; upem/revision/glyphs ${c.headerFieldsMatch ? "match" : "DIFFER"}; other: ${c.otherDifferences.join(", ") || "none"}`,
  );
}
process.exit(failed ? 1 : 0);
