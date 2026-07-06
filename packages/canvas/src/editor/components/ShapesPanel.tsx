"use client";

import { memo, useMemo, useState } from "react";
import { SHAPE_CATALOG, type ShapeCatalogEntry } from "../../objects/catalog/shape-catalog";
import { Tooltip } from "../../ui/Tooltip";
import type { InteractiveCanvasObjectType } from "../../model/schema";

/**
 * ShapesPanel — the full-height, left-docked white "Shapes" sidebar opened by
 * the dock's shape-tool button (bottom-dock-spec: "Clicking button 5-> full-
 * height LEFT-docked white panel").
 *
 * Wave C rewrite: restructured to exactly 3 sections — Basic / Flowchart /
 * Advanced — mirroring FigJam's actual picker model (parity doc:
 * docs/10-system-design/20-figjam-parity/doc.json). Dropped the earlier
 * Recents/Connections sections and the "Other libraries" (AWS/Azure/Cisco)
 * footer: those were placeholder scaffolding from before the real W5 shape
 * vocabulary landed, and FigJam's own picker has no such concepts (connectors
 * are the dock's separate "connector" tool, not a Shapes-panel entry — see
 * CanvasDock.tsx's ToolId union).
 *
 * Ground truth (fj-053-072): x~8-197 (width ~197-198px), full viewport
 * height, white bg, "Shapes" header + close (x), "Search shapes" input with
 * purple focus ring, collapsible sections. The bottom dock remains visible/
 * unaffected while this panel is open (no layout conflict modeled here —
 * this component doesn't touch dock state; the editor is responsible for
 * coexistence).
 *
 * Callback design: `onPick` keeps its original, narrower signature
 * (objectType only) for back-compat with existing consumers (e.g.
 * InteractiveCanvasEditor.tsx's `handleShapePick`, which arms
 * `canvas.setTool`). `onPickEntry` is a new, additive, richer callback that
 * carries the FULL catalog entry — including `direction` (triangle up/down,
 * parallelogram/chevron/arrow-shape left/right) and `icon` (the Advanced
 * tier's glyph selector) — for any consumer that wants to insert a
 * fully-formed object directly (e.g. via the `canvas.addObjects` action,
 * which accepts complete InteractiveCanvasObject values including these
 * fields) rather than going through the tool-arm-and-click pipeline. Both
 * fire on every click; a consumer may use either or both.
 */

export type ShapesPanelProps = {
  onPick?: (shapeType: InteractiveCanvasObjectType) => void;
  onPickEntry?: (entry: ShapeCatalogEntry) => void;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

const PANEL_WIDTH_PX = 197;
const PURPLE_FOCUS_RING = "#8C2EF2"; // CHROME.accentPurple

function SectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-section-header={label}
      onClick={onToggle}
      aria-expanded={!collapsed}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        background: "transparent",
        border: "none",
        padding: "6px 4px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        color: "#333333",
        textTransform: "none",
      }}
    >
      <span>{label}</span>
      <svg
        viewBox="0 0 10 6"
        className="h-2 w-2.5"
        style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 100ms" }}
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 1 5 5 9 1" stroke="#666666" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function ShapeGridButton({
  entry,
  onPick,
  onPickEntry,
}: {
  entry: ShapeCatalogEntry;
  onPick?: (shapeType: InteractiveCanvasObjectType) => void;
  onPickEntry?: (entry: ShapeCatalogEntry) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = entry.Icon;
  const clearHover = () => setHovered(false);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-shape-entry={entry.id}
        data-object-type={entry.objectType}
        data-direction={entry.direction}
        data-icon={entry.icon}
        aria-label={entry.label}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={clearHover}
        onPointerCancel={clearHover}
        onBlur={clearHover}
        onClick={() => {
          clearHover();
          onPick?.(entry.objectType);
          onPickEntry?.(entry);
        }}
        style={{
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          border: "none",
          background: hovered ? "rgba(0,0,0,0.06)" : "transparent",
          color: "#333333",
          cursor: "pointer",
        }}
      >
        <Icon className="h-5 w-5" />
      </button>
      <Tooltip label={entry.label} visible={hovered} placement="top" />
    </div>
  );
}

function ShapesPanelComponent({ onPick, onPickEntry, onClose, className, style }: ShapesPanelProps) {
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(false);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHAPE_CATALOG;
    return SHAPE_CATALOG.map((category) => ({
      ...category,
      entries: category.entries.filter((e) => e.label.toLowerCase().includes(q)),
    })).filter((category) => category.entries.length > 0);
  }, [query]);

  function toggleSection(id: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      data-shapes-panel=""
      className={className}
      style={{
        width: PANEL_WIDTH_PX,
        height: "100%",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: "12px 10px",
        gap: 10,
        overflowY: "auto",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111111" }}>Shapes</span>
        <button
          type="button"
          aria-label="Close shapes panel"
          onClick={() => onClose?.()}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666666",
          }}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
            <path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <input
        aria-label="Search shapes"
        placeholder="Search shapes"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          border: focused ? `1.5px solid ${PURPLE_FOCUS_RING}` : "1px solid #E0E0E0",
          borderRadius: 6,
          padding: "6px 8px",
          fontSize: 12,
          outline: "none",
          color: "#111111",
          boxSizing: "border-box",
        }}
      />

      {filteredCategories.map((category) => {
        const collapsed = collapsedSections.has(category.id);
        return (
          <div key={category.id} data-shape-category={category.id}>
            <SectionHeader
              label={category.label}
              collapsed={collapsed}
              onToggle={() => toggleSection(category.id)}
            />
            {!collapsed ? (
              <div
                data-shape-grid={category.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 2,
                }}
              >
                {category.entries.map((entry) => (
                  <ShapeGridButton key={entry.id} entry={entry} onPick={onPick} onPickEntry={onPickEntry} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const ShapesPanel = memo(ShapesPanelComponent);

export const SHAPES_PANEL_WIDTH_PX = PANEL_WIDTH_PX;
