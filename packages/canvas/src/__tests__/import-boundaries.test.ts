import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Structural import boundaries for src/ (see RESTRUCTURE.md, "Target tree",
 * amended 2026-07-07 after the co-location alignment).
 *
 * Layering: theme.ts <- state <- routing <- objects <- render|interaction
 * <- editor. theme is ONE file (src/theme.ts) since the theme dispersal.
 * ui/ is app-agnostic primitives + INTERFACE icons only and imports nothing
 * from the rest of src. objects/ holds only defs/data (no ui components, no
 * editor JSX). Nothing outside editor/ imports editor/. vendor/ is an
 * MPL-2.0 boundary: only routing/ and interaction/snapping.ts may import
 * vendor/blocksuite, and vendor imports nothing first-party.
 *
 * Known, deliberate exceptions (encoded below so drift is loud):
 *  - interaction/gesture-state.ts may TYPE-import ViewportState from
 *    render/viewport (never runtime code) while the gesture machine is split
 *    away from the lower interaction kernel.
 *  - No objects/ -> render/ exceptions are permitted; the corresponding test
 *    asserts the allowed-violations list stays empty.
 *
 * The checks are static: they scan import/export specifiers, not runtime
 * behavior, so they run in milliseconds and fail with the offending file.
 */

const SRC_ROOT = join(import.meta.dir, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function importSpecifiers(
  filePath: string,
  options: { skipTypeOnly?: boolean } = {},
): string[] {
  let content = readFileSync(filePath, "utf8");
  if (options.skipTypeOnly) {
    // Drop whole lines that are type-only imports/re-exports (e.g.
    // `import type { X } from "..."` or `export type { X } from "..."`) so
    // the rule below only sees runtime (value) imports. Multiline
    // `import type {` blocks are dropped through their closing `} from`
    // line. This does not handle inline mixed specifiers like
    // `import { type X, Y } from "..."` — extend it if a legitimate edge
    // ever needs that form.
    const kept: string[] = [];
    let inTypeBlock = false;
    for (const line of content.split("\n")) {
      if (inTypeBlock) {
        if (/}\s*from\s+["'][^"']+["']/.test(line)) inTypeBlock = false;
        continue;
      }
      if (/^\s*(import|export)\s+type\b/.test(line)) {
        // Single-line form ends on this line; multiline form opens a block.
        if (!/["'][^"']+["']/.test(line)) inTypeBlock = true;
        continue;
      }
      kept.push(line);
    }
    content = kept.join("\n");
  }
  const specifiers: string[] = [];
  const pattern = /(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function violations(
  dir: string,
  forbidden: RegExp,
  options: { skipTypeOnly?: boolean } = {},
): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(dir)) {
    for (const specifier of importSpecifiers(file, options)) {
      if (forbidden.test(specifier)) {
        found.push(`${relative(SRC_ROOT, file)} -> ${specifier}`);
      }
    }
  }
  return found;
}

function allSourceFiles(): string[] {
  return sourceFiles(SRC_ROOT);
}

function violationsAcrossTree(
  forbidden: RegExp,
  exclude: (relPath: string) => boolean,
): string[] {
  const found: string[] = [];
  for (const file of allSourceFiles()) {
    const rel = relative(SRC_ROOT, file);
    if (exclude(rel)) continue;
    for (const specifier of importSpecifiers(file)) {
      if (forbidden.test(specifier)) {
        found.push(`${rel} -> ${specifier}`);
      }
    }
  }
  return found;
}

describe("import boundaries", () => {
  test("palette.ts is a leaf (P0): imports only state/schema/colors, never theme.ts or objects/", () => {
    // OBJECT-DEF-OVERHAUL.md §3.6: palette.ts is a top-level leaf sibling of
    // theme.ts so both theme.ts and objects/ can import it without a
    // layering violation. It must not import theme.ts (theme sits below it
    // in this graph) or anything under objects/ (P0 is data-only; rewiring
    // consumers is P1).
    const specifiers = importSpecifiers(join(SRC_ROOT, "palette.ts"), {
      skipTypeOnly: false,
    }).filter((specifier) => specifier.startsWith("."));
    expect(new Set(specifiers)).toEqual(new Set(["./state/schema/colors"]));
  });

  test("state/schema/object-defaults.ts is a schema-vocabulary leaf (P4): imports only schema siblings", () => {
    // OBJECT-DEF-OVERHAUL.md §6 P4: the per-type defaults table lives BELOW
    // both the reducer (which needs it at reduce time — the /actions subpath
    // is a standalone public API) and the object registry (which stamps each
    // def's `defaults` from it). It must therefore never import upward —
    // only sibling schema vocabulary modules.
    const specifiers = importSpecifiers(
      join(SRC_ROOT, "state", "schema", "object-defaults.ts"),
    );
    expect(specifiers.filter((specifier) => !specifier.startsWith("./"))).toEqual([]);
  });

  test("theme.ts is layer 0: no runtime src imports (type-only state/schema imports allowed)", () => {
    // Since the theme dispersal the theme is ONE file, src/theme.ts, and its
    // only src dependency is type-only state/schema imports (the style
    // unions). The old SECTION_CAPTURE_OVERLAP_THRESHOLD re-export is gone —
    // importers pull it from state/geometry directly.
    expect(
      importSpecifiers(join(SRC_ROOT, "theme.ts"), { skipTypeOnly: true }).filter((specifier) =>
        specifier.startsWith("."),
      ),
    ).toEqual([]);
  });

  test("state/ does not import objects/, render/, interaction/, editor/, or ui/", () => {
    expect(
      violations(
        join(SRC_ROOT, "state"),
        /^(\.\.\/)+(objects|render|interaction|editor|ui)(\/|$)/,
      ),
    ).toEqual([]);
  });

  test("state/ does not import routing/", () => {
    expect(
      violations(join(SRC_ROOT, "state"), /^(\.\.\/)+routing(\/|$)/),
    ).toEqual([]);
  });

  test("routing/ imports only state/, vendor/, and objects/geometry (never def components, render/, editor/, interaction/, ui/, or theme)", () => {
    // P3 (OBJECT-DEF-OVERHAUL.md §3.6, D4): the defs own their outline
    // geometry, so routing consumes the pure, React-free objects/geometry.ts.
    // The connection cascade and the main router both need that edge now that
    // below-slot labels have an external routing footprint; importing any
    // other objects/ module (def components, registry) stays a layering
    // inversion. The only allowed objects/ edges from routing are the pure
    // geometry helpers below.
    expect(
      violations(
        join(SRC_ROOT, "routing"),
        /^(\.\.\/)+(objects|render|interaction|editor|ui)(\/|$)|^(\.\.\/)+theme(\/|$|\.)/,
      ),
    ).toEqual([
      `${join("routing", "routing.ts")} -> ../objects/geometry`,
      `${join("routing", "connection-overlay.ts")} -> ../objects/geometry`,
    ]);
  });

  test("objects/geometry.ts is a React-free leaf (P3): imports only state/, text slots, and pure geometry helpers, never react or def modules", () => {
    // OBJECT-DEF-OVERHAUL.md §3.6: routing reaches def outlines through a
    // pure objects/geometry.ts — it must stay importable from the routing
    // layer, so no react/react-dom and no imports from object defs/registry
    // (defs import IT, not vice versa) or any higher layer. The text-slot edge
    // is pure band math for below-slot extended bounds; inscribed-text-rects is
    // a pure sibling table re-exported by geometry.ts for center text geometry.
    const specifiers = importSpecifiers(join(SRC_ROOT, "objects", "geometry.ts"));
    expect(specifiers.filter((specifier) => !specifier.startsWith("."))).toEqual([]);
    expect(
      specifiers.filter(
        (specifier) =>
          !/^\.\.\/state\//.test(specifier) &&
          specifier !== "./text-slots" &&
          specifier !== "./inscribed-text-rects",
      ),
    ).toEqual([]);
  });

  test("objects/ does not import from editor/ (runtime or type)", () => {
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+editor(\/|$)/),
    ).toEqual([]);
  });

  test("objects/ does not import from interaction/ (runtime or type)", () => {
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+interaction(\/|$)/),
    ).toEqual([]);
  });

  test("objects/ does not import from ui/ (defs are data + canvas content; interface icons stay editor-side)", () => {
    // Achieved by commit 3 of the co-location alignment: the canvas glyph
    // registry lives at objects/shapes/icon/icon-glyphs.ts, so nothing in
    // objects/ needs ui/icons anymore.
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+ui(\/|$)/),
    ).toEqual([]);
  });

  test("objects/ does not import from render/ (zero permitted exceptions)", () => {
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+render(\/|$)/),
    ).toEqual([]);
  });

  test("render/ does not import from editor/ (runtime or type)", () => {
    expect(
      violations(join(SRC_ROOT, "render"), /^(\.\.\/)+editor(\/|$)/),
    ).toEqual([]);
  });

  test("interaction/ does not import from editor/", () => {
    expect(
      violations(join(SRC_ROOT, "interaction"), /^\.\.\/editor(\/|$)/),
    ).toEqual([]);
  });

  test("interaction/ does not runtime-import from render/ (type-only ViewportState from render/viewport allowed)", () => {
    expect(
      violations(join(SRC_ROOT, "interaction"), /^\.\.\/render(\/|$)/, {
        skipTypeOnly: true,
      }),
    ).toEqual([]);
  });

  test("interaction/types.ts is kernel vocabulary with no render/ or routing/ imports", () => {
    expect(
      importSpecifiers(join(SRC_ROOT, "interaction", "types.ts")).filter((specifier) =>
        /^(\.\.\/)+(render|routing)(\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  test("ui/ imports nothing from the rest of src (app-agnostic primitives + interface icons only)", () => {
    // Strengthened after the co-location alignment: ColorPalettePopover
    // (which consumed theme + editor styling) moved to editor/components,
    // and the canvas glyph registry moved to objects/shapes/icon/ — what
    // remains in ui/ is fully self-contained.
    expect(
      violations(
        join(SRC_ROOT, "ui"),
        /^(\.\.\/)+(objects|render|interaction|editor|state|routing|vendor)(\/|$)|^(\.\.\/)+theme(\/|$|\.)/,
      ),
    ).toEqual([]);
  });

  test("nothing outside editor/ imports editor/ (root index.ts is the composition entry and is exempt)", () => {
    expect(
      violationsAcrossTree(
        /(^|\/)editor\//,
        (relPath) => relPath.split("/")[0] === "editor" || relPath === "index.ts",
      ),
    ).toEqual([]);
  });

  test("vendor/ does not import first-party src code (MPL boundary)", () => {
    expect(
      violations(
        join(SRC_ROOT, "vendor"),
        /^(\.\.\/)+(theme|state|objects|interaction|routing|render|editor|ui|fixtures)(\/|$)/,
      ),
    ).toEqual([]);
  });

  test("only routing/ and interaction/snapping.ts import vendor/blocksuite", () => {
    expect(
      violationsAcrossTree(
        /vendor\/blocksuite/,
        (relPath) =>
          relPath.split("/")[0] === "routing" ||
          relPath === join("interaction", "snapping.ts"),
      ),
    ).toEqual([]);
  });
});
