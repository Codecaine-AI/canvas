import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Layout law for packages/canvas/src.
 *
 * Layer diagram (lower layers may never import higher layers):
 *
 *   ui (orthogonal; imports no first-party code outside ui/)
 *   theme -> state -> objects -> interaction (kernel) -> connectors -> stage core -> stage/viewer
 *                                                                             \
 *                                                                              -> stage/editor
 *
 * stage core is src/stage/* excluding stage/viewer/** and stage/editor/**.
 * stage/editor/features/* are vertical slices; sideways imports are forbidden
 * except into features/snapping/, which is the declared service slice.
 *
 * TODO(layout) exception lists below encode present-day reality where it does
 * not yet match the target architecture. Keep them narrow so drift is loud.
 */

const SRC_ROOT = join(import.meta.dir, "..");
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

type ImportEdge = {
  importer: string;
  specifier: string;
  target: string | null;
  typeOnly: boolean;
};

function toPosix(path: string): string {
  return path.split(/[\\/]/).join("/");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
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

function resolveFirstPartyTarget(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;

  const base = resolve(dirname(filePath), specifier);
  const resolved =
    SOURCE_EXTENSIONS.map((extension) => base + extension).find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? base;

  if (!resolved.startsWith(`${SRC_ROOT}/`)) return null;
  return toPosix(relative(SRC_ROOT, resolved));
}

function namedSpecifiersAreAllTypeOnly(clause: string): boolean {
  const trimmed = clause.trim();
  const bodyEnd = trimmed.lastIndexOf("}");
  if (!trimmed.startsWith("{") || bodyEnd === -1) return false;

  const body = trimmed.slice(1, bodyEnd).trim();
  if (body.length === 0) return false;

  return body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => part.startsWith("type "));
}

function importClauseIsTypeOnly(clause: string): boolean {
  const trimmed = clause.trim();
  return /^type\b/.test(trimmed) || namedSpecifiersAreAllTypeOnly(trimmed);
}

function importEdges(filePath: string): ImportEdge[] {
  const content = readFileSync(filePath, "utf8");
  const importer = toPosix(relative(SRC_ROOT, filePath));
  const edges: ImportEdge[] = [];
  const staticPattern =
    /^\s*(?:import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of content.matchAll(staticPattern)) {
    const clause = match[1] ?? "";
    const specifier = match[2] ?? "";
    edges.push({
      importer,
      specifier,
      target: resolveFirstPartyTarget(filePath, specifier),
      typeOnly: importClauseIsTypeOnly(clause),
    });
  }

  for (const match of content.matchAll(dynamicPattern)) {
    const specifier = match[1] ?? "";
    edges.push({
      importer,
      specifier,
      target: resolveFirstPartyTarget(filePath, specifier),
      typeOnly: false,
    });
  }

  return edges;
}

function allImportEdges(): ImportEdge[] {
  return sourceFiles(SRC_ROOT).flatMap((file) => importEdges(file));
}

function firstPartyEdges(): ImportEdge[] {
  return allImportEdges().filter((edge) => edge.target !== null);
}

function edgesFromDir(dir: string): ImportEdge[] {
  const prefix = `${dir}/`;
  return firstPartyEdges().filter((edge) => edge.importer.startsWith(prefix));
}

function allEdgesFromDir(dir: string): ImportEdge[] {
  const prefix = `${dir}/`;
  return allImportEdges().filter((edge) => edge.importer.startsWith(prefix));
}

function topLevel(relPath: string): string {
  return relPath.split("/")[0] ?? relPath;
}

function targetStartsWith(edge: ImportEdge, prefixes: string[]): boolean {
  return edge.target !== null && prefixes.some((prefix) => edge.target!.startsWith(prefix));
}

function formatEdge(edge: ImportEdge): string {
  return `${edge.importer} -> ${edge.specifier}`;
}

function formatEdges(edges: ImportEdge[]): string[] {
  return edges.map(formatEdge).sort();
}

function isStageCorePath(relPath: string): boolean {
  return (
    relPath.startsWith("stage/") &&
    !relPath.startsWith("stage/editor/") &&
    !relPath.startsWith("stage/viewer/")
  );
}

function featureSlice(relPath: string): string | null {
  const match = /^stage\/editor\/features\/([^/]+)\//.exec(relPath);
  return match?.[1] ?? null;
}

describe("import boundaries", () => {
  test("ui/ is orthogonal: first-party imports stay inside ui/", () => {
    expect(
      formatEdges(edgesFromDir("ui").filter((edge) => !targetStartsWith(edge, ["ui/"]))),
    ).toEqual([]);
  });

  test("theme/ imports no first-party code outside state/schema vocabulary", () => {
    expect(
      formatEdges(
        edgesFromDir("theme").filter((edge) => !targetStartsWith(edge, ["state/schema"])),
      ),
    ).toEqual([]);
  });

  test("theme/ has only the current runtime palette vocabulary exception", () => {
    const themeEdges = edgesFromDir("theme");

    // TODO(layout): tighten theme to type-only state/schema imports once
    // palette.ts no longer imports and re-exports CANVAS_COLORS at runtime.
    expect(formatEdges(themeEdges.filter((edge) => !edge.typeOnly))).toEqual([
      "theme/palette.ts -> ../state/schema/colors",
    ]);
  });

  test("state/ is first-party self-contained", () => {
    expect(
      formatEdges(edgesFromDir("state").filter((edge) => !targetStartsWith(edge, ["state/"]))),
    ).toEqual([]);
  });

  test("objects/ imports only objects/, state/, and theme/ except current connector-def exceptions", () => {
    const outsideObjectsStateTheme = edgesFromDir("objects").filter(
      (edge) => !targetStartsWith(edge, ["objects/", "state/", "theme/"]),
    );

    // TODO(layout): tighten objects/ so connector definitions no longer flow
    // upward from connectors/ into object definitions.
    expect(formatEdges(outsideObjectsStateTheme)).toEqual([
      "objects/object-def.ts -> ../connectors/def",
      "objects/section/def.tsx -> ../../connectors/def",
    ]);
  });

  test("interaction/ kernel imports only interaction/, state/, and objects/", () => {
    expect(
      formatEdges(
        edgesFromDir("interaction").filter(
          (edge) => !targetStartsWith(edge, ["interaction/", "state/", "objects/"]),
        ),
      ),
    ).toEqual([]);
  });

  test("interaction/ kernel has no React imports", () => {
    expect(
      formatEdges(
        allEdgesFromDir("interaction").filter(
          (edge) => edge.specifier === "react" || edge.specifier.startsWith("react/"),
        ),
      ),
    ).toEqual([]);
  });

  test("connectors/ imports only connectors/, state/, objects/, interaction/, and theme/ except current stage-core exceptions", () => {
    const outsideConnectorLayers = edgesFromDir("connectors").filter(
      (edge) =>
        !targetStartsWith(edge, [
          "connectors/",
          "state/",
          "objects/",
          "interaction/",
          "theme/",
        ]),
    );

    // TODO(layout): tighten connectors/ so presentation pieces no longer reach
    // into stage core for viewport projection or ObjectShape previews.
    expect(formatEdges(outsideConnectorLayers)).toEqual([
      "connectors/AnchorDots.tsx -> ../stage/viewport",
      "connectors/ConnectorDragPreview.tsx -> ../stage/ObjectShape",
      "connectors/ConnectorDragPreview.tsx -> ../stage/viewport",
    ]);
  });

  test("connectors/pathfinding/ imports no first-party code outside its MPL island", () => {
    expect(
      formatEdges(
        edgesFromDir("connectors/pathfinding").filter(
          (edge) => !targetStartsWith(edge, ["connectors/pathfinding/"]),
        ),
      ),
    ).toEqual([]);
  });

  test("connectors/pathfinding/ is consumed only by connectors/ plus the snapping gfx exception", () => {
    const incomingPathfindingEdges = firstPartyEdges().filter(
      (edge) =>
        edge.target?.startsWith("connectors/pathfinding/") &&
        !edge.importer.startsWith("connectors/pathfinding/"),
    );

    expect(
      formatEdges(
        incomingPathfindingEdges.filter((edge) => {
          if (edge.importer.startsWith("connectors/")) return false;
          return !(
            edge.importer === "stage/editor/features/snapping/snap-distribution.ts" &&
            edge.target === "connectors/pathfinding/gfx-types.ts"
          );
        }),
      ),
    ).toEqual([]);
  });

  test("features/snapping/snap-distribution.ts reaches only pathfinding gfx types", () => {
    const incomingPathfindingEdges = firstPartyEdges().filter(
      (edge) =>
        edge.target?.startsWith("connectors/pathfinding/") &&
        !edge.importer.startsWith("connectors/pathfinding/"),
    );

    expect(
      formatEdges(
        incomingPathfindingEdges.filter(
          (edge) => edge.importer === "stage/editor/features/snapping/snap-distribution.ts",
        ),
      ),
    ).toEqual([
      "stage/editor/features/snapping/snap-distribution.ts -> ../../../../connectors/pathfinding/gfx-types",
    ]);
  });

  test("stage core never imports nested viewer/editor domains", () => {
    const stageCoreEdges = firstPartyEdges().filter((edge) => isStageCorePath(edge.importer));

    expect(
      formatEdges(
        stageCoreEdges.filter(
          (edge) =>
            edge.target?.startsWith("stage/editor/") ||
            edge.target?.startsWith("stage/viewer/"),
        ),
      ),
    ).toEqual([]);
  });

  test("stage core imports only lower first-party layers", () => {
    const stageCoreEdges = firstPartyEdges().filter((edge) => isStageCorePath(edge.importer));

    expect(
      formatEdges(
        stageCoreEdges.filter((edge) => {
          if (edge.target === null) return false;
          return !["stage", "state", "objects", "theme", "connectors", "interaction"].includes(
            topLevel(edge.target),
          );
        }),
      ),
    ).toEqual([]);
  });

  test("stage core imports interaction only through type-only interaction/types.ts", () => {
    const stageCoreEdges = firstPartyEdges().filter((edge) => isStageCorePath(edge.importer));

    expect(
      formatEdges(
        stageCoreEdges.filter(
          (edge) =>
            edge.target?.startsWith("interaction/") &&
            (!edge.typeOnly || edge.target !== "interaction/types.ts"),
        ),
      ),
    ).toEqual([]);
  });

  test("stage/viewer/ imports only stage core plus lower layers", () => {
    const viewerEdges = edgesFromDir("stage/viewer");

    expect(
      formatEdges(
        viewerEdges.filter((edge) => {
          if (edge.target === null) return false;
          if (edge.target.startsWith("stage/editor/")) return false;
          if (edge.target.startsWith("stage/viewer/")) return false;
          if (isStageCorePath(edge.target)) return false;
          return !targetStartsWith(edge, [
            "state/",
            "objects/",
            "theme/",
            "interaction/",
            "connectors/",
            "ui/",
          ]);
        }),
      ),
    ).toEqual([]);
  });

  test("stage/viewer/ has only the current editor feedback exception", () => {
    const viewerEdges = edgesFromDir("stage/viewer");

    // TODO(layout): tighten viewer so interaction feedback is exposed from
    // stage core or viewer instead of reaching into stage/editor.
    expect(
      formatEdges(viewerEdges.filter((edge) => edge.target?.startsWith("stage/editor/"))),
    ).toEqual([
      "stage/viewer/InteractiveCanvasViewer.tsx -> ../editor/pipeline/InteractionFeedback",
    ]);
  });

  test("stage/editor/ is imported only by composition entries plus the current viewer TODO", () => {
    const incomingEditorEdges = firstPartyEdges().filter(
      (edge) =>
        edge.target?.startsWith("stage/editor/") &&
        !edge.importer.startsWith("stage/editor/"),
    );

    expect(
      formatEdges(
        incomingEditorEdges.filter((edge) => {
          // Public package composition entry.
          if (edge.importer === "index.ts") return false;
          // DOM-equivalence composition harness, queued for retirement.
          if (edge.importer === "zz-dom-fixtures.ts") return false;
          // TODO(layout): remove when viewer no longer imports editor feedback.
          if (edge.importer === "stage/viewer/InteractiveCanvasViewer.tsx") return false;
          return true;
        }),
      ),
    ).toEqual([]);
  });

  test("the only non-composition stage/editor/ importer is the current viewer TODO", () => {
    const incomingEditorEdges = firstPartyEdges().filter(
      (edge) =>
        edge.target?.startsWith("stage/editor/") &&
        !edge.importer.startsWith("stage/editor/"),
    );

    expect(
      formatEdges(
        incomingEditorEdges.filter((edge) => edge.importer.startsWith("stage/viewer/")),
      ),
    ).toEqual([
      "stage/viewer/InteractiveCanvasViewer.tsx -> ../editor/pipeline/InteractionFeedback",
    ]);
  });

  test("stage/editor/features/ slices do not import sideways except snapping service imports and current section-fit exceptions", () => {
    const sidewaysFeatureEdges = firstPartyEdges().filter((edge) => {
      const importerSlice = featureSlice(edge.importer);
      const targetSlice = edge.target ? featureSlice(edge.target) : null;
      return importerSlice !== null && targetSlice !== null && importerSlice !== targetSlice;
    });

    // TODO(layout): tighten section-fit into a declared service slice or move
    // the fit orchestration behind each consuming feature.
    expect(
      formatEdges(
        sidewaysFeatureEdges.filter((edge) => featureSlice(edge.target ?? "") !== "snapping"),
      ),
    ).toEqual([
      "stage/editor/features/context-menu/use-canvas-context-menu.ts -> ../section-fit/animate-section-fit",
      "stage/editor/features/inspector/Inspector.tsx -> ../section-fit/animate-section-fit",
      "stage/editor/features/selection-toolbar/use-selection-toolbar.ts -> ../section-fit/animate-section-fit",
    ]);
  });

  test("no source imports legacy vendor/blocksuite paths", () => {
    expect(
      formatEdges(allImportEdges().filter((edge) => /vendor\/blocksuite/.test(edge.specifier))),
    ).toEqual([]);
  });
});
