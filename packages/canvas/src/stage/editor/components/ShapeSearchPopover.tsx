"use client";

import { useMemo, useState } from "react";
import { EDITOR_STYLE } from "./editor-style";
import { SHAPE_SEARCH_ENTRIES } from "../../../objects/catalog";
import { shapeCatalogPreview } from "./shape-previews";
import { Tooltip } from "../../../ui/Tooltip";
import type { InteractiveCanvasObjectType } from "../../../state/schema";

/**
 * ShapeSearchPopover — Panel A from figjam-trim-catalog.md section 4: the
 * compact dark "Search for a shape" popover, anchored above the selected
 * object's shape-swap control (NOT the bottom dock — that opens the larger
 * ShapesPanel instead).
 *
 * Ground truth (fj-032-041), FigJam-scale restyle: floats centered as a
 * 232px dark panel matching the color-popover family, with a 5-column,
 * scrollable 36px icon grid. Icons are monochrome technical/object glyphs
 * (chip, database, monitor, envelope, ...) — NOT basic geometric shapes.
 */

export type ShapeSearchPopoverProps = {
  onPick?: (shapeType: InteractiveCanvasObjectType) => void;
  className?: string;
  style?: React.CSSProperties;
};

const POPOVER_WIDTH_PX = 232;
const POPOVER_BG = "#1D1D1D";

/**
 * Scrollbar restyle for the shape grid: slim rounded translucent thumb on a
 * transparent track, matching the dark FigJam-style panel (replaces the
 * chunky default trim). The @supports block is the Firefox fallback —
 * it has no ::-webkit-scrollbar, so it gets the standard thin-scrollbar
 * properties instead.
 */
const GRID_SCROLLBAR_STYLES = `
[data-shape-search-grid]::-webkit-scrollbar {
  width: 8px;
}
[data-shape-search-grid]::-webkit-scrollbar-track {
  background: transparent;
}
[data-shape-search-grid]::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
[data-shape-search-grid]::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.35);
}
@supports not selector(::-webkit-scrollbar) {
  [data-shape-search-grid] {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
  }
}
`;

export function ShapeSearchPopover({ onPick, className, style }: ShapeSearchPopoverProps) {
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHAPE_SEARCH_ENTRIES;
    // Labels + the def-declared catalog keywords (P4: entries carry the
    // registry's `catalog.keywords`, so "box" finds Square, "subroutine"
    // finds Predefined process).
    return SHAPE_SEARCH_ENTRIES.filter(
      (e) => e.label.toLowerCase().includes(q) || e.keywords?.some((k) => k.includes(q)),
    );
  }, [query]);

  return (
    <div
      role="dialog"
      aria-label="Search for a shape"
      data-shape-search-popover=""
      className={className}
      style={{
        width: POPOVER_WIDTH_PX,
        background: POPOVER_BG,
        borderRadius: EDITOR_STYLE.flyoutRadiusPx,
        padding: EDITOR_STYLE.flyoutPaddingPx,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...style,
      }}
    >
      <style>{GRID_SCROLLBAR_STYLES}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "6px 8px",
        }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="#9A9A9A" strokeWidth={1.4} />
          <path d="M10.5 10.5 14 14" stroke="#9A9A9A" strokeWidth={1.4} strokeLinecap="round" />
        </svg>
        <input
          aria-label="Search for a shape"
          placeholder="Search for a shape"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#FFFFFF",
            fontSize: 13,
            flex: 1,
            minWidth: 0,
          }}
        />
      </div>

      <div
        data-shape-search-grid=""
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 4,
          maxHeight: 220,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {filtered.map((entry) => {
          const Icon = shapeCatalogPreview(entry);
          const hovered = hoveredId === entry.id;
          return (
            <div key={entry.id} style={{ position: "relative", display: "inline-flex" }}>
              <button
                type="button"
                data-shape-entry={entry.id}
                data-object-type={entry.objectType}
                aria-label={entry.label}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onPick?.(entry.objectType)}
                style={{
                  width: 36,
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: EDITOR_STYLE.flyoutItemRadiusPx,
                  border: "none",
                  background: hovered ? "rgba(255,255,255,0.14)" : "transparent",
                  color: "#FFFFFF",
                  cursor: "pointer",
                }}
              >
                <Icon className="h-5 w-5" />
              </button>
              <Tooltip label={entry.label} visible={hovered} placement="top" />
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", color: "rgba(255,255,255,0.5)", fontSize: 11, padding: "8px 2px" }}>
            No shapes found
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const SHAPE_SEARCH_POPOVER_WIDTH_PX = POPOVER_WIDTH_PX;
export const SHAPE_SEARCH_POPOVER_BG = EDITOR_STYLE.selectionToolbarBg;
