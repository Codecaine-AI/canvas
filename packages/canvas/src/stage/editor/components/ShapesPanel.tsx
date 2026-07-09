"use client";

import { memo, useMemo, useState } from "react";
import { SHAPE_CATALOG, type ShapeCatalogEntry } from "../../../objects/catalog";
import { shapeCatalogPreview } from "./shape-previews";
import { Tooltip, type TooltipAlign } from "../../../ui/Tooltip";
import type { InteractiveCanvasObjectType } from "../../../state/schema";

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
 * Origin reference (fj-053-072): full-height left panel, white bg, "Shapes"
 * header + close (x), "Search shapes" input with purple focus ring,
 * collapsible sections. The bottom dock remains visible/unaffected while
 * this panel is open (no layout conflict modeled here — this component
 * doesn't touch dock state; the editor is responsible for coexistence).
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
  /**
   * Catalog entry id of the currently armed shape (Shapes creation flow):
   * that grid button renders the violet selected state so the user can see
   * which shape a canvas click will place. Null/undefined for no highlight.
   */
  selectedEntryId?: string | null;
  onClose?: () => void;
  exiting?: boolean;
  onExitComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

const PANEL_WIDTH_PX = 252;
const SHAPE_GRID_COLUMNS = 4;
const SHAPE_BUTTON_SIZE_PX = 46;
const PURPLE_FOCUS_RING = "#8C2EF2"; // CHROME.accentPurple
/** Violet wash behind the armed shape's grid button (accentPurple at low alpha). */
const SELECTED_SHAPE_BG = "rgba(140, 46, 242, 0.12)";
const PANEL_ENTER_ANIMATION_NAME = "canvas-shapes-panel-enter";
const PANEL_EXIT_ANIMATION_NAME = "canvas-shapes-panel-exit";
const PANEL_ENTER_ANIMATION = `${PANEL_ENTER_ANIMATION_NAME} 180ms cubic-bezier(0.16, 1, 0.3, 1) both`;
const PANEL_EXIT_ANIMATION = `${PANEL_EXIT_ANIMATION_NAME} 150ms cubic-bezier(0.7, 0, 0.84, 0) both`;
const PANEL_ANIMATION_STYLES = `
@keyframes ${PANEL_ENTER_ANIMATION_NAME} {
  from {
    opacity: 0;
    transform: translate3d(calc(-100% - 16px), 0, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes ${PANEL_EXIT_ANIMATION_NAME} {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }

  to {
    opacity: 0;
    transform: translate3d(calc(-100% - 16px), 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-shapes-panel] {
    animation-duration: 1ms !important;
  }
}
`;

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
  tooltipAlign,
  selected = false,
  onPick,
  onPickEntry,
}: {
  entry: ShapeCatalogEntry;
  tooltipAlign: TooltipAlign;
  selected?: boolean;
  onPick?: (shapeType: InteractiveCanvasObjectType) => void;
  onPickEntry?: (entry: ShapeCatalogEntry) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = shapeCatalogPreview(entry);
  const clearHover = () => setHovered(false);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-shape-entry={entry.id}
        data-object-type={entry.objectType}
        data-direction={entry.direction}
        data-icon={entry.icon}
        data-selected={selected ? "true" : undefined}
        aria-label={entry.label}
        aria-pressed={selected}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={clearHover}
        onPointerCancel={clearHover}
        onFocus={() => setHovered(true)}
        onBlur={clearHover}
        onClick={() => {
          clearHover();
          onPick?.(entry.objectType);
          onPickEntry?.(entry);
        }}
        style={{
          width: SHAPE_BUTTON_SIZE_PX,
          height: SHAPE_BUTTON_SIZE_PX,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          border: "none",
          background: selected
            ? SELECTED_SHAPE_BG
            : hovered
              ? "rgba(0,0,0,0.08)"
              : "transparent",
          color: "#333333",
          cursor: "pointer",
          transition: "background-color 100ms ease-out",
        }}
      >
        <span
          data-shape-icon={entry.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transform: hovered ? "scale(1.14)" : "scale(1)",
            transition: "transform 120ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Icon className="h-6 w-6" />
        </span>
      </button>
      <Tooltip
        label={entry.label}
        visible={hovered}
        placement="bottom"
        align={tooltipAlign}
        caretOffset={shapeTooltipCaretOffset(tooltipAlign)}
      />
    </div>
  );
}

function shapeTooltipAlign(entryIndex: number): TooltipAlign {
  const column = entryIndex % SHAPE_GRID_COLUMNS;
  if (column === 0) return "start";
  if (column === SHAPE_GRID_COLUMNS - 1) return "end";
  return "center";
}

function shapeTooltipCaretOffset(tooltipAlign: TooltipAlign) {
  if (tooltipAlign === "start") return SHAPE_BUTTON_SIZE_PX / 2;
  if (tooltipAlign === "end") return `calc(100% - ${SHAPE_BUTTON_SIZE_PX / 2}px)`;
  return "50%";
}

function ShapesPanelComponent({
  onPick,
  onPickEntry,
  selectedEntryId = null,
  onClose,
  exiting = false,
  onExitComplete,
  className,
  style,
}: ShapesPanelProps) {
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(false);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHAPE_CATALOG;
    return SHAPE_CATALOG.map((category) => ({
      ...category,
      // Labels + def-declared catalog keywords (P4 catalog unification).
      entries: category.entries.filter(
        (e) => e.label.toLowerCase().includes(q) || e.keywords?.some((k) => k.includes(q)),
      ),
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
    <>
      <style>{PANEL_ANIMATION_STYLES}</style>
      <div
        data-shapes-panel=""
        data-state={exiting ? "closing" : "open"}
        className={className}
        onAnimationEnd={(event) => {
          if (exiting && event.animationName === PANEL_EXIT_ANIMATION_NAME) {
            onExitComplete?.();
          }
        }}
        style={{
          width: PANEL_WIDTH_PX,
          height: "100%",
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(0,0,0,0.16), 0 4px 14px rgba(0,0,0,0.10)",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          padding: "12px 10px",
          gap: 10,
          overflowY: "auto",
          animation: exiting ? PANEL_EXIT_ANIMATION : PANEL_ENTER_ANIMATION,
          willChange: "transform, opacity",
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
                    gridTemplateColumns: `repeat(${SHAPE_GRID_COLUMNS}, ${SHAPE_BUTTON_SIZE_PX}px)`,
                    justifyContent: "space-between",
                    rowGap: 6,
                  }}
                >
                  {category.entries.map((entry, entryIndex) => (
                    <ShapeGridButton
                      key={entry.id}
                      entry={entry}
                      tooltipAlign={shapeTooltipAlign(entryIndex)}
                      selected={entry.id === selectedEntryId}
                      onPick={onPick}
                      onPickEntry={onPickEntry}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

export const ShapesPanel = memo(ShapesPanelComponent);

export const SHAPES_PANEL_WIDTH_PX = PANEL_WIDTH_PX;
