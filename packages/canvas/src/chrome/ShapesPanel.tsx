"use client";

import { useMemo, useState } from "react";
import { isShapeEntryEnabled, OTHER_LIBRARIES, SHAPE_CATALOG, type ShapeCatalogEntry } from "./shape-catalog";
import { ChromeTooltip } from "./ChromeTooltip";

/**
 * ShapesPanel — Panel B from figjam-chrome-catalog.md section 4: the
 * full-height, left-docked white "Shapes" sidebar opened by the dock's
 * shape-tool button (bottom-dock-spec: "Clicking button 5 -> full-height
 * LEFT-docked white panel").
 *
 * Ground truth (fj-053-072): x~8-197 (width ~197-198px), full viewport
 * height, white bg, "Shapes" header + close (x), "Search shapes" input with
 * purple focus ring, 5 collapsible sections (Recents/Connections/Basic/
 * Flowchart/Advanced), footer "Other libraries" rows (AWS/Azure/Cisco,
 * static/disabled per the task brief — we render them but they do nothing).
 * The bottom dock remains visible/unaffected while this panel is open (no
 * layout conflict modeled here — this component doesn't touch dock state;
 * W3's editor is responsible for coexistence).
 */

export type ShapesPanelProps = {
  onPick?: (shapeType: ShapeCatalogEntry["objectType"]) => void;
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
}: {
  entry: ShapeCatalogEntry;
  onPick?: (shapeType: ShapeCatalogEntry["objectType"]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const enabled = isShapeEntryEnabled(entry);
  const Icon = entry.icon;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-shape-entry={entry.id}
        data-object-type={entry.objectType}
        aria-label={enabled ? entry.label : `${entry.label} (coming soon)`}
        disabled={!enabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => enabled && onPick?.(entry.objectType)}
        style={{
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          border: "none",
          background: hovered && enabled ? "rgba(0,0,0,0.06)" : "transparent",
          color: enabled ? "#333333" : "rgba(51,51,51,0.35)",
          cursor: enabled ? "pointer" : "default",
        }}
      >
        <Icon className="h-5 w-5" />
      </button>
      <ChromeTooltip label={enabled ? entry.label : "Coming soon"} visible={hovered} placement="top" />
    </div>
  );
}

export function ShapesPanel({ onPick, onClose, className, style }: ShapesPanelProps) {
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
                  <ShapeGridButton key={entry.id} entry={entry} onPick={onPick} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      <div style={{ borderTop: "1px solid #EEEEEE", paddingTop: 8, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#333333", padding: "2px 4px 6px" }}>
          Other libraries
        </div>
        {OTHER_LIBRARIES.map((lib) => (
          <div
            key={lib.id}
            data-other-library={lib.id}
            aria-disabled="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 4px",
              color: "#999999",
              fontSize: 12,
              cursor: "default",
              opacity: 0.6,
            }}
          >
            <span>{lib.label}</span>
            <span>{lib.shapeCount} shapes</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const SHAPES_PANEL_WIDTH_PX = PANEL_WIDTH_PX;
