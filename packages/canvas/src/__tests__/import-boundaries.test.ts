import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Structural import boundaries for src/ (see RESTRUCTURE.md, "Target tree",
 * amended 2026-07-06).
 *
 * Layering: tokens <- model <- objects <- render|interaction <- editor.
 * ui/ sits beside tokens (shared dumb primitives, importable from objects
 * up). Nothing outside editor/ imports editor/. vendor/ is an MPL-2.0
 * boundary: only routing/ and interaction/snapping.ts may import
 * vendor/blocksuite, and vendor imports nothing first-party.
 *
 * Known, deliberate exceptions (encoded below so drift is loud):
 *  - interaction/types.ts may TYPE-import ViewportState from
 *    render/viewport (never runtime code).
 *  - tokens/figjam-tokens.ts value-re-exports
 *    SECTION_CAPTURE_OVERLAP_THRESHOLD from model/geometry (the threshold
 *    is model semantics; the re-export keeps figjam-tokens' public surface
 *    unchanged). All other tokens/ -> src imports must be type-only
 *    model/schema imports.
 *  - objects/code-block/def.tsx still runtime-imports
 *    render/code-tokenizer (a pure lexer whose only dependency is tokens/).
 *    This is the one remaining objects/ -> render/ edge; it goes away if
 *    the tokenizer is ever rehomed with the code-block slice.
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
    // the rule below only sees runtime (value) imports. This does not handle
    // multiline `import type {\n...\n} from "..."` blocks or inline mixed
    // specifiers like `import { type X, Y } from "..."` — extend it if a
    // legitimate edge ever needs either form.
    content = content
      .split("\n")
      .filter((line) => !/^\s*(import|export)\s+type\b/.test(line))
      .join("\n");
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

  test("objects/ does not import from render/ (one documented straggler: code-block's tokenizer)", () => {
    expect(
      violations(join(SRC_ROOT, "objects"), /^(\.\.\/)+render(\/|$)/),
    ).toEqual([
      `${join("objects", "code-block", "def.tsx")} -> ../../render/code-tokenizer`,
    ]);
  });

  test("render/ does not import from editor/ (runtime or type)", () => {
    expect(
      violations(join(SRC_ROOT, "render"), /^(\.\.\/)+editor(\/|$)/),
    ).toEqual([]);
  });

  test("ui/ does not import objects/, render/, interaction/, or editor/ (tokens/model imports are fine)", () => {
    expect(
      violations(
        join(SRC_ROOT, "ui"),
        /^(\.\.\/)+(objects|render|interaction|editor)(\/|$)/,
      ),
    ).toEqual([]);
  });

  test("tokens/ is layer 0: no runtime src imports except the documented model/geometry re-export", () => {
    // Type-only model/schema imports are allowed (theme.ts needs the style
    // unions); the ONLY runtime edge is figjam-tokens re-exporting
    // SECTION_CAPTURE_OVERLAP_THRESHOLD from model/geometry.
    expect(
      violations(join(SRC_ROOT, "tokens"), /^\.\.\//, { skipTypeOnly: true }),
    ).toEqual([`${join("tokens", "figjam-tokens.ts")} -> ../model/geometry`]);
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
        /^(\.\.\/)+(tokens|model|objects|interaction|routing|render|editor|ui|fixtures)(\/|$)/,
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
