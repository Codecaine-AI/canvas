import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  exports: Record<string, string>;
  dependencies: Record<string, string>;
};

/** Every module specifier a file imports, statically or dynamically. */
function specifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}

/** Files reachable from an entry, plus the bare (package) specifiers they import. */
function graph(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>();
  const external = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const spec of specifiers(file)) {
      if (spec.startsWith(".")) visit(resolve(dirname(file), spec));
      else external.add(spec);
    }
  };
  visit(entry);
  return { files, external };
}

describe("entry points", () => {
  test("package exports match the SPEC entry points", () => {
    expect(pkg.exports).toEqual({
      ".": "./src/index.ts",
      "./headless": "./src/headless.ts",
      "./browser": "./src/browser.ts",
      "./fonts.css": "./fonts.css",
      "./fonts/*": "./fonts/*",
    });
    expect(pkg.dependencies).toEqual({ "@chenglou/pretext": "0.0.9", harfbuzzjs: "1.6.2" });
  });

  test("core and /browser import neither harfbuzzjs nor node:* (browser bundles import them)", () => {
    for (const entry of ["index.ts", "browser.ts"]) {
      const { external } = graph(`${SRC}${entry}`);
      expect({ entry, external: [...external].sort() }).toEqual({ entry, external: ["@chenglou/pretext"] });
    }
  });

  test("/headless loads harfbuzzjs lazily (dynamic import) and reads fonts with node:fs", () => {
    const source = readFileSync(`${SRC}headless.ts`, "utf8");
    expect(source).toContain('await import("harfbuzzjs")');
    expect(source).not.toMatch(/^import[^;]*from\s+["']harfbuzzjs["']/m);
    expect(graph(`${SRC}headless.ts`).external).toEqual(new Set(["node:fs/promises", "node:url", "@chenglou/pretext", "harfbuzzjs"]));
  });
});
