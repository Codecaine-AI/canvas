import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Structural import boundaries for src/ (see RESTRUCTURE.md, "Target tree",
 * amended 2026-07-09 after nesting the display domain under stage/).
 *
 * Layering: theme.ts <- state <- connector routing/cascade <- objects
 * <- stage core|interaction <- stage/editor. theme is ONE file (src/theme.ts) since the theme dispersal.
 * ui/ is app-agnostic primitives + INTERFACE icons only and imports nothing
 * from the rest of src. objects/ holds only defs/data (no ui components, no
 * editor JSX). Nothing outside stage/editor/ imports stage/editor/. The BlockSuite
 * MPL-2.0 pathfinding files live under connectors/pathfinding/, with the
 * distribution snap port under stage/editor/features/snapping/.
 *
 * Known, deliberate exceptions (encoded below so drift is loud):
 *  - No objects/ -> stage/ exceptions are permitted; the corresponding test
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

function violationsInFiles(
  relPaths: string[],
  forbidden: RegExp,
  options: { skipTypeOnly?: boolean } = {},
): string[] {
  const found: string[] = [];
  for (const relPath of relPaths) {
    const file = join(SRC_ROOT, relPath);
    for (const specifier of importSpecifiers(file, options)) {
      if (forbidden.test(specifier)) {
        found.push(`${relPath} -> ${specifier}`);
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

  test("state/ does not import objects/, stage/, interaction/, or ui/", () => {
    expect(
      violations(
        join(SRC_ROOT, "state"),
        /^(\.\.\/)+(objects|stage|interaction|ui)(\/|$)/,
      ),
    ).toEqual([]);
  });

  test("state/ does not import connectors/", () => {
    expect(
      violations(join(SRC_ROOT, "state"), /^(\.\.\/)+connectors(\/|$)/),
    ).toEqual([]);
  });

  test("connector routing/cascade helpers import only state/, pathfinding/, and objects/geometry (never def components, stage/, interaction/, ui/, or theme)", () => {
    // P3 (OBJECT-DEF-OVERHAUL.md §3.6, D4): the defs own their outline
    // geometry, so connector routing consumes the pure, React-free
    // objects/geometry.ts. The connection cascade and the main router both
    // need that edge now that below-slot labels have an external routing
    // footprint; importing any other objects/ module (def components,
    // registry) stays a layering inversion. The only allowed objects/ edges
    // from these pure connector helpers are the geometry helpers below.
    expect(
      violationsInFiles(
        [
          join("connectors", "routing.ts"),
          join("connectors", "connection-cascade.ts"),
          join("connectors", "bend-editing.ts"),
        ],
        /^(\.\.\/)+(objects|stage|interaction|ui)(\/|$)|^(\.\.\/)+theme(\/|$|\.)/,
      ),
    ).toEqual([
      `${join("connectors", "routing.ts")} -> ../objects/geometry`,
      `${join("connectors", "connection-cascade.ts")} -> ../objects/geometry`,
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

  test("objects/ does not import from stage/editor/ (runtime or type)", () => {
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+stage\/editor(\/|$)/),
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

  test("objects/ does not import from stage/ (zero permitted exceptions)", () => {
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+stage(\/|$)/),
    ).toEqual([]);
  });

  test("stage core does not import from stage/editor/ (runtime or type)", () => {
    expect(
      violationsAcrossTree(
        /^(\.\/|\.\.\/)+editor(\/|$)|(^|\/)stage\/editor\//,
        (relPath) =>
          !relPath.startsWith("stage/") ||
          relPath.startsWith("stage/editor/") ||
          relPath.startsWith("stage/viewer/"),
      ),
    ).toEqual([]);
  });

  test("interaction/ does not import from stage/editor/", () => {
    expect(
      violations(join(SRC_ROOT, "interaction"), /^\.\.\/stage\/editor(\/|$)/),
    ).toEqual([]);
  });

  test("interaction/ does not runtime-import from stage/ (type-only ViewportState from stage/viewport allowed)", () => {
    expect(
      violations(join(SRC_ROOT, "interaction"), /^\.\.\/stage(\/|$)/, {
        skipTypeOnly: true,
      }),
    ).toEqual([]);
  });

  test("interaction/types.ts is kernel vocabulary with no stage/ or connectors/ imports", () => {
    expect(
      importSpecifiers(join(SRC_ROOT, "interaction", "types.ts")).filter((specifier) =>
        /^(\.\.\/)+(stage|connectors)(\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  test("ui/ imports nothing from the rest of src (app-agnostic primitives + interface icons only)", () => {
    // Strengthened after the co-location alignment: ColorPalettePopover
    // (which consumed theme + editor styling) moved to stage/editor/components,
    // and the canvas glyph registry moved to objects/shapes/icon/ — what
    // remains in ui/ is fully self-contained.
    expect(
      violations(
        join(SRC_ROOT, "ui"),
        /^(\.\.\/)+(objects|stage|interaction|state|connectors)(\/|$)|^(\.\.\/)+theme(\/|$|\.)/,
      ),
    ).toEqual([]);
  });

  test("nothing outside stage/editor/ imports stage/editor/ (root index.ts is the composition entry and is exempt)", () => {
    expect(
      violationsAcrossTree(
        /(^|\/)stage\/editor\/|^(\.\/|\.\.\/)+editor\//,
        (relPath) =>
          relPath.startsWith("stage/editor/") ||
          relPath.startsWith("stage/viewer/") ||
          relPath === "index.ts" ||
          // DOM-equivalence composition harness, queued for retirement.
          relPath === "zz-dom-fixtures.ts",
      ),
    ).toEqual([]);
  });

  test("connectors/pathfinding does not import first-party src code (MPL boundary)", () => {
    expect(
      violations(
        join(SRC_ROOT, "connectors", "pathfinding"),
        /^(\.\.\/)+(theme|state|objects|interaction|stage|ui|fixtures)(\/|$)/,
      ),
    ).toEqual([]);
  });

  test("features/snapping/snap-distribution.ts reaches only pathfinding gfx types (MPL home)", () => {
    expect(
      importSpecifiers(
        join(SRC_ROOT, "stage", "editor", "features", "snapping", "snap-distribution.ts"),
      ).filter((specifier) => specifier.startsWith(".")),
    ).toEqual(["../../../../connectors/pathfinding/gfx-types"]);
  });

  test("no source imports legacy vendor/blocksuite paths", () => {
    expect(
      violationsAcrossTree(
        /vendor\/blocksuite/,
        () => false,
      ),
    ).toEqual([]);
  });
});
