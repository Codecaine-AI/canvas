"use client";

import { useMemo, useState } from "react";
import { CHROME } from "../../tokens/figjam-tokens";
import { SHAPE_SEARCH_ENTRIES, type ShapeCatalogEntry } from "./shape-catalog";
import { ChromeTooltip } from "../../chrome/ChromeTooltip";
import type { InteractiveCanvasObjectType } from "../../model/schema";

/**
 * ShapeSearchPopover — Panel A from figjam-chrome-catalog.md section 4: the
 * compact dark "Search for a shape" popover, anchored above the selected
 * object's shape-swap control (NOT the bottom dock — that opens the larger
 * ShapesPanel instead).
 *
 * Ground truth (fj-032-041): floats centered, ~161x180px bounding box, dark
 * background matching the color-popover family, 5-column icon grid,
 * scrollable. Icons are monochrome technical/object glyphs (chip, database,
 * monitor, envelope, ...) — NOT basic geometric shapes.
 */

export type ShapeSearchPopoverProps = {
  onPick?: (shapeType: InteractiveCanvasObjectType) => void;
  className?: string;
  style?: React.CSSProperties;
};

const POPOVER_WIDTH_PX = 161;
const POPOVER_BG = "#1D1D1D";

export function ShapeSearchPopover({ onPick, className, style }: ShapeSearchPopoverProps) {
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHAPE_SEARCH_ENTRIES;
    return SHAPE_SEARCH_ENTRIES.filter((e) => e.label.toLowerCase().includes(q));
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
        borderRadius: 18,
        padding: 10,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...style,
      }}
    >
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
            fontSize: 12,
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
          maxHeight: 180,
          overflowY: "auto",
        }}
      >
        {filtered.map((entry) => {
          const Icon = entry.Icon;
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
                  width: 28,
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  border: "none",
                  background: hovered ? "rgba(255,255,255,0.14)" : "transparent",
                  color: "#FFFFFF",
                  cursor: "pointer",
                }}
              >
                <Icon className="h-4 w-4" />
              </button>
              <ChromeTooltip label={entry.label} visible={hovered} placement="top" />
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
export const SHAPE_SEARCH_POPOVER_BG = CHROME.contextToolbarBg;
