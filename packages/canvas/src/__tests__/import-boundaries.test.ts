import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Structural import boundaries for src/ (see RESTRUCTURE.md).
 *
 * These rules were established by the src restructure and must hold as the
 * remaining migration steps land:
 *  1. interaction/ is a pure layer: it must not import from editor/ or render/.
 *  2. vendor/ (MPL-2.0 boundary) must not import first-party src code.
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
    // Drop whole lines that are type-only imports (e.g. `import type { X }
    // from "..."` or `import type X from "..."`) so the rule below only
    // sees runtime (value) imports. This does not handle inline mixed
    // specifiers like `import { type X, Y } from "..."` — not needed here.
    content = content
      .split("\n")
      .filter((line) => !/^\s*import\s+type\b/.test(line))
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
  test("interaction/ does not import from editor/ or render/", () => {
    expect(
      violations(join(SRC_ROOT, "interaction"), /^\.\.\/(editor|render)(\/|$)/),
    ).toEqual([]);
  });

  test("vendor/ does not import first-party src code (MPL boundary)", () => {
    expect(
      violations(
        join(SRC_ROOT, "vendor"),
        /^(\.\.\/)+(model|interaction|routing|render|editor|chrome|ui|fixtures)(\/|$)/,
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

  test("chrome/ does not runtime-import from objects/ (type-only imports allowed)", () => {
    expect(
      violations(
        join(SRC_ROOT, "chrome"),
        /^(\.\.\/)+objects(\/|$)/,
        { skipTypeOnly: true },
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
