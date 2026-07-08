import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { SHAPE_CATALOG_ENTRIES } from "../../../objects/catalog";
import { shapeCatalogPreview } from "../shape-previews";

afterEach(() => {
  cleanup();
});

// Companion to objects/__tests__/catalog.test.ts (which asserts the entries
// are pure data): the editor-side preview map must cover the WHOLE catalog —
// a missing mapping would silently render the EmptyPreview placeholder.
describe("shape-previews catalog coverage", () => {
  it("resolves a preview for every catalog entry that renders non-empty SVG content", () => {
    for (const entry of SHAPE_CATALOG_ENTRIES) {
      const Icon = shapeCatalogPreview(entry);
      expect(typeof Icon).toBe("function");
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      // Every real preview draws at least one child element; only the
      // out-of-vocabulary EmptyPreview fallback is an empty <svg/>.
      expect(svg!.childNodes.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("icon entries resolve by glyph id to the shared on-canvas glyph data", () => {
    const iconEntries = SHAPE_CATALOG_ENTRIES.filter((entry) => entry.objectType === "icon");
    const advancedIconEntries = SHAPE_CATALOG_ENTRIES.filter((entry) => entry.id.startsWith("adv-"));
    expect(iconEntries.length).toBe(29);
    expect(advancedIconEntries.length).toBe(26);
    for (const entry of iconEntries) {
      const Icon = shapeCatalogPreview(entry);
      const { container, unmount } = render(<Icon />);
      // Glyph previews render a stroked <g> wrapper around the glyph elements.
      expect(container.querySelector("svg > g")).toBeTruthy();
      unmount();
    }
  });
});
