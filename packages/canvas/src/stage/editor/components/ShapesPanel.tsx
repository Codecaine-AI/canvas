"use client";

import { memo, useMemo, useState } from "react";
import { cssVar } from "@codecaine-ai/design-system";
import { SHAPE_CATALOG, type ShapeCatalogEntry } from "../../../objects/catalog";
import {
  ICON_GLYPHS,
  ICON_GLYPH_CATEGORIES,
  type IconGlyphId,
} from "../../../objects/shapes/icon/icon-glyphs";
import { shapeCatalogPreview } from "./shape-previews";
import { Tooltip, type TooltipAlign } from "../../../ui/Tooltip";
import type { InteractiveCanvasObjectType } from "../../../state/schema";

/**
 * ShapesPanel — the full-height, left-docked "Shapes" sidebar opened by the
 * dock's shape-tool button (bottom-dock-spec: "Clicking button 5-> full-
 * height LEFT-docked white panel"). Light chrome: it follows the app theme.
 *
 * Two sections mirroring the catalog's arrangement: Icons (the default face
 * — the semantic glyph vocabulary, one small sub-grid per icon category in
 * ICON_GLYPH_CATEGORIES order, brands last) and Shapes (the eight universal
 * marks as a compact utility group). Connectors are the
 * dock's separate "connector" tool, not a Shapes-panel entry — see
 * CanvasDock.tsx's ToolId union.
 *
 * Origin reference (fj-053-072): full-height left panel, "Shapes"
 * header + close (x), "Search shapes" input with a focus ring,
 * collapsible sections. The bottom dock remains visible/unaffected while
 * this panel is open (no layout conflict modeled here — this component
 * doesn't touch dock state; the editor is responsible for coexistence).
 *
 * Callback design: `onPick` keeps its original, narrower signature
 * (objectType only) for back-compat with existing consumers (e.g.
 * InteractiveCanvasEditor.tsx's `handleShapePick`, which arms
 * `canvas.setTool`). `onPickEntry` is a new, additive, richer callback that
 * carries the FULL catalog entry — including `direction` (triangle up/down,
 * arrow-shape left/right) and `icon` (the glyph selector) — for any
 * consumer that wants to insert a
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
   * that grid button renders the accent-wash selected state so the user can see
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
/** The search input's focus border. */
const FOCUS_RING = cssVar("color.focus-ring");
/** Accent wash behind the armed shape's grid button. */
const SELECTED_SHAPE_BG = cssVar("color.fill.accent");
/** Icon-category sub-heading ink: muted against the ink section headers, still AA on the panel. */
const ICON_GROUP_HEADING_COLOR = cssVar("color.text.muted");
const SHAPE_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(${SHAPE_GRID_COLUMNS}, ${SHAPE_BUTTON_SIZE_PX}px)`,
  justifyContent: "space-between",
  rowGap: cssVar("space.1-5"),
};
const PANEL_ENTER_ANIMATION_NAME = "canvas-shapes-panel-enter";
const PANEL_EXIT_ANIMATION_NAME = "canvas-shapes-panel-exit";
const PANEL_ENTER_ANIMATION = `${PANEL_ENTER_ANIMATION_NAME} 180ms cubic-bezier(0.16, 1, 0.3, 1) both`;
const PANEL_EXIT_ANIMATION = `${PANEL_EXIT_ANIMATION_NAME} ${cssVar("motion.duration.base")} cubic-bezier(0.7, 0, 0.84, 0) both`;
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
        padding: `${cssVar("space.1-5")} ${cssVar("space.1")}`,
        cursor: "pointer",
        fontSize: cssVar("font.size.ui-xs"),
        fontWeight: cssVar("font.weight.semibold"),
        color: cssVar("color.text.ink"),
        textTransform: "none",
      }}
    >
      <span>{label}</span>
      <svg
        viewBox="0 0 10 6"
        className="h-2 w-2.5"
        style={{
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          transition: `transform ${cssVar("motion.duration.fast")}`,
          color: cssVar("color.text.muted"),
        }}
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 1 5 5 9 1" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
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
          borderRadius: cssVar("radius.base"),
          border: "none",
          background: selected
            ? SELECTED_SHAPE_BG
            : hovered
              ? cssVar("color.fill.hover")
              : "transparent",
          color: cssVar("color.text.body"),
          cursor: "pointer",
          transition: `background-color ${cssVar("motion.duration.fast")} ${cssVar("motion.easing.decelerate")}`,
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

/**
 * Whether glyph `glyphId` matches a picker query (trimmed, lowercased): its
 * label, its id, or its category's label or id — so "brand" lists every
 * brand and "network" the whole Network group. Every icon picker (this
 * panel, the Inspector's glyph picker) searches through here.
 */
export function iconGlyphMatchesQuery(glyphId: IconGlyphId, query: string): boolean {
  const glyph = ICON_GLYPHS[glyphId];
  if (!glyph) return false;
  const category = ICON_GLYPH_CATEGORIES.find((candidate) => candidate.id === glyph.category);
  return [glyph.label, glyph.id, category?.label, category?.id].some(
    (term) => term !== undefined && term.toLowerCase().includes(query),
  );
}

/**
 * `items` bucketed by their glyph's category in ICON_GLYPH_CATEGORIES order
 * (brands last), input order kept within a bucket; empty buckets drop.
 * Shared by every icon picker so they group alike.
 */
export function groupByIconCategory<T>(
  items: readonly T[],
  glyphOf: (item: T) => IconGlyphId | undefined,
): { category: (typeof ICON_GLYPH_CATEGORIES)[number]; items: T[] }[] {
  return ICON_GLYPH_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => {
      const glyphId = glyphOf(item);
      return glyphId !== undefined && ICON_GLYPHS[glyphId]?.category === category.id;
    }),
  })).filter((group) => group.items.length > 0);
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
      // Labels + def-declared catalog keywords (P4 catalog unification);
      // icon entries also match their glyph id and icon category.
      entries: category.entries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.keywords?.some((k) => k.includes(q)) ||
          (e.icon !== undefined && iconGlyphMatchesQuery(e.icon, q)),
      ),
    })).filter((category) => category.entries.length > 0);
  }, [query]);

  // One grid's buttons: tooltip alignment follows the column within that grid.
  const renderGridEntries = (entries: readonly ShapeCatalogEntry[]) =>
    entries.map((entry, entryIndex) => (
      <ShapeGridButton
        key={entry.id}
        entry={entry}
        tooltipAlign={shapeTooltipAlign(entryIndex)}
        selected={entry.id === selectedEntryId}
        onPick={onPick}
        onPickEntry={onPickEntry}
      />
    ));

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
          background: cssVar("color.surface.panel"),
          border: `${cssVar("border.width.hairline")} solid ${cssVar("color.border.default")}`,
          borderRadius: cssVar("radius.base"),
          boxShadow: cssVar("shadow.glass"),
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          padding: `${cssVar("space.3")} 10px`,
          gap: 10,
          overflowY: "auto",
          animation: exiting ? PANEL_EXIT_ANIMATION : PANEL_ENTER_ANIMATION,
          willChange: "transform, opacity",
          ...style,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontSize: cssVar("font.size.ui-lg"),
              fontWeight: cssVar("font.weight.bold"),
              color: cssVar("color.text.ink"),
            }}
          >
            Shapes
          </span>
          <button
            type="button"
            aria-label="Close shapes panel"
            onClick={() => onClose?.()}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              width: cssVar("space.5"),
              height: cssVar("space.5"),
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: cssVar("color.text.muted"),
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
            borderWidth: focused ? cssVar("border.width.ring") : cssVar("border.width.hairline"),
            borderStyle: "solid",
            borderColor: focused ? FOCUS_RING : cssVar("color.border.default"),
            borderRadius: cssVar("radius.base"),
            padding: `${cssVar("space.1-5")} ${cssVar("space.2")}`,
            fontSize: cssVar("font.size.ui-xs"),
            outline: "none",
            color: cssVar("color.text.body"),
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
              {collapsed ? null : category.id === "icons" ? (
                // One sub-grid per icon category under a muted sub-heading;
                // the Icons header above stays the section's one collapsible.
                <div data-shape-grid={category.id} style={{ display: "grid", rowGap: cssVar("space.2") }}>
                  {groupByIconCategory(category.entries, (entry) => entry.icon).map(
                    ({ category: group, items }) => (
                      <div
                        key={group.id}
                        role="group"
                        aria-label={group.label}
                        data-icon-category={group.id}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            padding: `${cssVar("space.0-5")} ${cssVar("space.1")} ${cssVar("space.1")}`,
                            fontSize: cssVar("font.size.ui-2xs"),
                            fontWeight: cssVar("font.weight.medium"),
                            color: ICON_GROUP_HEADING_COLOR,
                          }}
                        >
                          {group.label}
                        </div>
                        <div data-icon-grid={group.id} style={SHAPE_GRID_STYLE}>
                          {renderGridEntries(items)}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div data-shape-grid={category.id} style={SHAPE_GRID_STYLE}>
                  {renderGridEntries(category.entries)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export const ShapesPanel = memo(ShapesPanelComponent);

export const SHAPES_PANEL_WIDTH_PX = PANEL_WIDTH_PX;
