"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "../../../../ui/icons";
import { Button } from "../../../../ui/button";
import { Input } from "../../../../ui/input";
import { cn } from "../../../../ui/cn";
import { ICON_GLYPHS, ICON_GLYPH_IDS } from "../../../../objects/shapes/icon/icon-glyphs";
import type { CanvasIconGlyph } from "../../../../state/schema";
import { groupByIconCategory, iconGlyphMatchesQuery } from "../../components/ShapesPanel";
import { shapeCatalogPreview } from "../../components/shape-previews";

/**
 * IconGlyphPicker — the Inspector's glyph field: a section's optional header
 * icon ("Icon", with a None option) and an icon object's required glyph
 * ("Glyph", no None). The row shows the current glyph as a toggle that opens
 * an inline picker: a search box, then every roster glyph grouped by
 * category. It searches and groups through the Shapes panel's helpers and
 * draws glyphs through shapeCatalogPreview, so every icon picker finds,
 * orders, and draws glyphs the same way.
 */

/** A glyph's picker preview, resolved like a Shapes-panel icon entry. */
function glyphPreview(glyph: CanvasIconGlyph) {
  return shapeCatalogPreview({ id: `icon-${glyph}`, objectType: "icon", icon: glyph });
}

export interface IconGlyphPickerProps {
  /** Row label: "Icon" for a section's header icon, "Glyph" for an icon object. */
  label: string;
  /** The current glyph; undefined shows "None". */
  value: CanvasIconGlyph | undefined;
  /** Called with the picked glyph, or undefined when None is picked. */
  onPick: (glyph: CanvasIconGlyph | undefined) => void;
  /** Offer None first. Off for icon objects: an icon must keep a glyph. */
  allowNone?: boolean;
}

export function IconGlyphPicker({ label, value, onPick, allowNone = false }: IconGlyphPickerProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const currentLabel = value ? (ICON_GLYPHS[value]?.label ?? value) : "None";
  const Preview = value ? glyphPreview(value) : null;
  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Button
        ref={toggleRef}
        type="button"
        size="sm"
        variant="outline"
        className="justify-start font-normal"
        aria-label={`${label}: ${currentLabel}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {Preview ? <Preview className="size-4" /> : null}
        <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
        <ChevronDownIcon
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </Button>
      {open ? (
        <GlyphPanel
          id={panelId}
          value={value}
          allowNone={allowNone}
          onPick={(glyph) => {
            onPick(glyph);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function GlyphPanel({
  id,
  value,
  allowNone,
  onPick,
  onClose,
}: {
  id: string;
  value: CanvasIconGlyph | undefined;
  allowNone: boolean;
  onPick: (glyph: CanvasIconGlyph | undefined) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const glyphs = q ? ICON_GLYPH_IDS.filter((glyph) => iconGlyphMatchesQuery(glyph, q)) : ICON_GLYPH_IDS;
    return groupByIconCategory(glyphs, (glyph) => glyph);
  }, [query]);

  return (
    <div
      id={id}
      className="grid gap-2 rounded-md border border-border/70 p-2"
      onKeyDown={(event) => {
        // Escape closes the picker; it must not reach the canvas hotkeys
        // (window listener), which would clear the selection.
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <Input
        aria-label="Search icons"
        placeholder="Search icons"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
        className="h-8 text-xs md:text-xs"
      />
      {allowNone ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="justify-start font-normal aria-pressed:bg-accent"
          aria-pressed={value === undefined}
          onClick={() => onPick(undefined)}
        >
          None
        </Button>
      ) : null}
      <div className="max-h-[260px] overflow-y-auto">
        {groups.length === 0 ? (
          <div className="py-3 text-center text-xs text-muted-foreground">No icons found</div>
        ) : (
          <div className="grid gap-2">
            {groups.map(({ category, items }) => (
              <div
                key={category.id}
                role="group"
                aria-label={category.label}
                data-icon-category={category.id}
              >
                <div aria-hidden="true" className="mb-1 text-[11px] text-muted-foreground">
                  {category.label}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {items.map((glyph) => (
                    <GlyphCell key={glyph} glyph={glyph} pressed={glyph === value} onPick={onPick} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GlyphCell({
  glyph,
  pressed,
  onPick,
}: {
  glyph: CanvasIconGlyph;
  pressed: boolean;
  onPick: (glyph: CanvasIconGlyph) => void;
}) {
  const { label } = ICON_GLYPHS[glyph];
  const Preview = glyphPreview(glyph);
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-foreground/40"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      data-icon-glyph={glyph}
      onClick={() => onPick(glyph)}
    >
      <Preview className="size-5" />
    </Button>
  );
}
