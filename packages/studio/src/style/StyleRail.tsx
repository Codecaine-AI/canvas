import { useEffect, useId, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, PanelRightIcon } from "@codecaine-ai/canvas/ui/icons";
import {
  formatColor,
  formatHex,
  normalizeColor,
  parseColor,
  resolveSectionPaint,
  resolveShapePaint,
  type CanvasColor,
} from "@codecaine-ai/canvas";
import {
  CANVAS_STYLE_CONTROLS,
  CANVAS_STYLE_GROUP_LABELS,
  CANVAS_THEME_IDS,
  CANVAS_THEME_LABELS,
  resolveCanvasStyle,
  snapToControlStep,
  type CanvasStyle,
  type CanvasStyleControl,
  type CanvasStyleGroup,
  type CanvasStyleKey,
  type CanvasStyleOverrides,
  type CanvasStyleSettings,
  type CanvasThemeId,
} from "@codecaine-ai/canvas/style";
import type { CanvasStyleTokenValue } from "./use-canvas-style-settings";

/**
 * Style rail — right-side panel for the workspace-wide canvas style: the
 * theme picker (one preview card per theme) and, below it, every token of the
 * ACTIVE theme in collapsible groups generated from CANVAS_STYLE_CONTROLS —
 * numbers as slider + exact input, colors as swatch + `#RRGGBB` / `rgba()`
 * text, selects as segmented controls, booleans as switches, and one ink row
 * per palette color. Rows honor `visibleWhen` (the tint rows exist only under
 * layer-cake sections). Visual language follows the docs workbench's Style
 * Rail (docs-workbench/web/src/shell/StyleRail.tsx): uppercase "Style" header
 * with a collapse button, uppercase group labels, a per-token override dot
 * that resets the token, and a reset footer. Each theme keeps its own edits,
 * so the footer resets only the active one.
 * CSS: `.canvas-style-*` in index.css.
 */

export type StyleRailProps = {
  /** The settings document: the active theme plus every theme's overrides. */
  settings: CanvasStyleSettings;
  /** The active theme, resolved. */
  style: CanvasStyle;
  /** The active theme's overrides. */
  overrides: CanvasStyleOverrides;
  onSelectTheme(theme: CanvasThemeId): void;
  /** One token of the active theme; `paletteColor` is set for palette ink rows. */
  onChange(key: CanvasStyleKey, value: CanvasStyleTokenValue, paletteColor?: CanvasColor): void;
  onResetKey(key: CanvasStyleKey, paletteColor?: CanvasColor): void;
  /** Drop every override of the active theme. */
  onResetTheme(): void;
  onClose(): void;
};

/** Every token control; the theme itself is picked with the cards above the groups. */
const TOKEN_CONTROLS = CANVAS_STYLE_CONTROLS.filter((control) => control.key !== "theme");

const GROUP_ORDER = Array.from(new Set(TOKEN_CONTROLS.map((control) => control.group)));

/** Which groups are expanded — remembered across rail opens. */
const OPEN_GROUPS_STORAGE_KEY = "canvas-studio-style-rail-groups";

/** The inks shown as swatches on each theme card. */
const PREVIEW_INKS: readonly CanvasColor[] = ["blue", "green", "orange", "violet"];

function readOpenGroups(): Set<CanvasStyleGroup> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY) ?? "[]") as unknown;
    return new Set(GROUP_ORDER.filter((group) => Array.isArray(raw) && raw.includes(group)));
  } catch {
    return new Set();
  }
}

function controlId(control: CanvasStyleControl): string {
  return control.key === "palette" ? `palette.${control.paletteColor}` : control.key;
}

/** Accessible name: "Shapes corner radius", "Palette blue". */
function controlName(control: CanvasStyleControl): string {
  return `${CANVAS_STYLE_GROUP_LABELS[control.group]} ${control.label.toLowerCase()}`;
}

function controlValue(control: CanvasStyleControl, style: CanvasStyle): CanvasStyleTokenValue {
  if (control.key === "palette") return control.paletteColor ? style.palette[control.paletteColor] : "";
  return style[control.key] as CanvasStyleTokenValue;
}

function isOverridden(control: CanvasStyleControl, overrides: CanvasStyleOverrides): boolean {
  if (control.key === "palette") {
    return control.paletteColor !== undefined && overrides.palette?.[control.paletteColor] !== undefined;
  }
  return control.key in overrides;
}

function isVisible(control: CanvasStyleControl, style: CanvasStyle): boolean {
  return !control.visibleWhen || style[control.visibleWhen.key] === control.visibleWhen.equals;
}

/**
 * Why an overridden row is shown while its `visibleWhen` does not hold —
 * "Applies when Fill is Layer cake" — so the override can still be reset.
 */
function inactiveNote(control: CanvasStyleControl): string | undefined {
  const condition = control.visibleWhen;
  if (!condition) return undefined;
  const trigger = CANVAS_STYLE_CONTROLS.find((candidate) => candidate.key === condition.key);
  const value =
    trigger?.options?.find((option) => option.value === condition.equals)?.label ?? String(condition.equals);
  return `Applies when ${trigger?.label ?? condition.key} is ${value}`;
}

function overrideCount(overrides: CanvasStyleOverrides): number {
  const { palette, ...scalars } = overrides;
  return Object.keys(scalars).length + Object.keys(palette ?? {}).length;
}

export function StyleRail({
  settings,
  style,
  overrides,
  onSelectTheme,
  onChange,
  onResetKey,
  onResetTheme,
  onClose,
}: StyleRailProps) {
  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  const themeInputName = useId();
  const activeOverrideCount = overrideCount(overrides);
  const themeLabel = CANVAS_THEME_LABELS[settings.theme];

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify([...openGroups]));
    } catch {
      // Session-only when storage is unavailable.
    }
  }, [openGroups]);

  const toggleGroup = (group: CanvasStyleGroup) => {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <aside
      aria-label="Style"
      className="absolute bottom-24 right-4 top-20 z-20 flex w-[20rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border/70 bg-background/95 text-foreground shadow-xl backdrop-blur"
      // Keys pressed on the rail's own controls (arrows on a slider,
      // Backspace on a button) must not reach the canvas hotkeys, which
      // would nudge or delete the selection.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3">
        <div className="truncate text-sm font-medium uppercase tracking-wider">Style</div>
        <button
          type="button"
          aria-label="Collapse style controls"
          title="Collapse style controls"
          className="canvas-style-icon-button"
          onClick={onClose}
        >
          <PanelRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4">
        <p className="px-4 pt-3 text-xs leading-4 text-muted-foreground">
          Applies to every board. {themeLabel}:{" "}
          {activeOverrideCount === 0
            ? "no overrides"
            : `${activeOverrideCount} ${activeOverrideCount === 1 ? "override" : "overrides"}`}
        </p>

        <h3 className="canvas-style-rail-section-label">Theme</h3>
        <div role="radiogroup" aria-label="Theme" className="canvas-style-theme-grid">
          {CANVAS_THEME_IDS.map((theme) => (
            <ThemeCard
              key={theme}
              theme={theme}
              name={themeInputName}
              active={theme === settings.theme}
              edited={overrideCount(settings.themes[theme] ?? {}) > 0}
              style={resolveCanvasStyle({ theme, themes: settings.themes })}
              onSelect={() => onSelectTheme(theme)}
            />
          ))}
        </div>

        {GROUP_ORDER.map((group) => {
          const controls = TOKEN_CONTROLS.filter((control) => control.group === group);
          return (
            <GroupSection
              key={group}
              group={group}
              open={openGroups.has(group)}
              overrideCount={controls.filter((control) => isOverridden(control, overrides)).length}
              onToggle={() => toggleGroup(group)}
            >
              {/* A row hidden by visibleWhen still shows while overridden (dimmed,
                  with a note), so every counted override can be reset. */}
              {controls
                .filter((control) => isVisible(control, style) || isOverridden(control, overrides))
                .map((control) => (
                  <ControlRow
                    key={controlId(control)}
                    control={control}
                    value={controlValue(control, style)}
                    overridden={isOverridden(control, overrides)}
                    inactiveNote={isVisible(control, style) ? undefined : inactiveNote(control)}
                    onChange={(value) => onChange(control.key, value, control.paletteColor)}
                    onReset={() => onResetKey(control.key, control.paletteColor)}
                  />
                ))}
            </GroupSection>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border/70 p-2">
        <button
          type="button"
          className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
          title={`Clear every edit to the ${themeLabel} theme`}
          disabled={activeOverrideCount === 0}
          onClick={onResetTheme}
        >
          Reset theme
        </button>
      </div>
    </aside>
  );
}

/**
 * One theme as a radio card: a miniature board in that theme — board color
 * and grid, a top-level section with its header chip (pinned or floating), a
 * card inside it with a name and a detail line, and four palette inks — drawn
 * with the canvas package's own paint resolvers, so it shows what the theme
 * (with its edits) actually renders.
 */
function ThemeCard({
  theme,
  name,
  active,
  edited,
  style,
  onSelect,
}: {
  theme: CanvasThemeId;
  name: string;
  active: boolean;
  edited: boolean;
  style: CanvasStyle;
  onSelect(): void;
}) {
  const section = resolveSectionPaint("blue", 1, style);
  const card = resolveShapePaint("violet", style);
  const pinned = style.headerPlacement === "pinned";
  return (
    <label className="canvas-style-theme-card" data-active={active ? "true" : "false"} data-theme={theme}>
      <input
        type="radio"
        className="canvas-style-visually-hidden"
        name={name}
        value={theme}
        checked={active}
        onChange={onSelect}
      />
      <span
        aria-hidden="true"
        className="canvas-style-theme-preview"
        style={{
          backgroundColor: style.boardBackground,
          backgroundImage: `radial-gradient(circle, ${style.gridDotColor} 0.75px, transparent 0.9px)`,
        }}
      >
        <span
          className="canvas-style-theme-preview-section"
          style={{ background: section.fill, borderColor: section.border }}
        >
          <span
            className="canvas-style-theme-preview-chip"
            data-placement={pinned ? "pinned" : "floating"}
            style={{ background: section.chipFill, borderColor: section.chipBorder }}
          >
            <span style={{ background: section.headerText }} />
          </span>
          <span
            className="canvas-style-theme-preview-card"
            style={{ background: card.fill, borderColor: card.border }}
          >
            <span style={{ background: card.text }} />
            <span style={{ background: style.detailColor }} />
          </span>
        </span>
        <span className="canvas-style-theme-preview-inks">
          {PREVIEW_INKS.map((color) => (
            <span key={color} style={{ background: style.palette[color] }} />
          ))}
        </span>
        {active ? (
          <span className="canvas-style-theme-check">
            <CheckIcon className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
      <span className="canvas-style-theme-label">
        {CANVAS_THEME_LABELS[theme]}
        {edited ? (
          <span className="canvas-style-theme-edited" title="This theme has overrides" />
        ) : null}
      </span>
    </label>
  );
}

function GroupSection({
  group,
  open,
  overrideCount: count,
  onToggle,
  children,
}: {
  group: CanvasStyleGroup;
  open: boolean;
  overrideCount: number;
  onToggle(): void;
  children: ReactNode;
}) {
  const bodyId = useId();
  const label = CANVAS_STYLE_GROUP_LABELS[group];
  return (
    <section className="canvas-style-rail-group" data-group={group}>
      <button
        type="button"
        className="canvas-style-rail-group-header"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {count > 0 ? (
            <span
              className="canvas-style-rail-group-count"
              title={`${count} ${count === 1 ? "override" : "overrides"} in ${label}`}
            >
              {count}
            </span>
          ) : null}
          <ChevronDownIcon
            className="h-3 w-3 transition-transform"
            style={{ transform: open ? "none" : "rotate(-90deg)" }}
          />
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="canvas-style-rail-group-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

type RowProps = {
  control: CanvasStyleControl;
  value: CanvasStyleTokenValue;
  overridden: boolean;
  onChange(value: CanvasStyleTokenValue): void;
  onReset(): void;
};

function ControlRow({ inactiveNote: note, ...props }: RowProps & { inactiveNote?: string }) {
  const row = (() => {
    switch (props.control.kind) {
      case "number":
        return <NumberRow {...props} value={Number(props.value)} />;
      case "color":
        return <ColorRow {...props} value={String(props.value)} />;
      case "select":
        return <SelectRow {...props} value={String(props.value)} />;
      case "boolean":
        return <BooleanRow {...props} value={props.value === true} />;
    }
  })();
  if (!note) return row;
  return (
    <div className="canvas-style-rail-inactive-row" data-inactive="true">
      {row}
      <p className="canvas-style-rail-inactive-note">{note}</p>
    </div>
  );
}

/** The override dot: a reset button while the token is overridden, a hollow marker otherwise. */
function RowLabel({
  control,
  htmlFor,
  overridden,
  onReset,
}: {
  control: CanvasStyleControl;
  htmlFor?: string;
  overridden: boolean;
  onReset(): void;
}) {
  return (
    <span className="canvas-style-rail-row-label" title={control.description}>
      {overridden ? (
        <button
          type="button"
          className="canvas-style-rail-row-override-dot"
          data-overridden="true"
          aria-label={`Reset ${controlName(control)} to the theme default`}
          title="Reset to theme default"
          onClick={onReset}
        />
      ) : (
        <span aria-hidden="true" className="canvas-style-rail-row-override-dot" data-overridden="false" />
      )}
      {htmlFor ? (
        <label htmlFor={htmlFor} className="truncate">
          {control.label}
        </label>
      ) : (
        <span className="truncate">{control.label}</span>
      )}
    </span>
  );
}

function NumberRow({ control, value, overridden, onChange, onReset }: RowProps & { value: number }) {
  const sliderId = useId();
  // The exact input keeps its own text while focused, so "0." or an empty
  // field can be typed through; every parseable value applies at once,
  // snapped to the step on snapping controls (a typed weight of 450 applies
  // 500; the field shows the applied value once it loses focus).
  const [draft, setDraft] = useState<string | null>(null);
  const name = controlName(control);
  const unit = control.key.endsWith("Px") ? "px" : null;
  return (
    <div className="grid gap-1.5 text-xs" data-control={controlId(control)}>
      <span className="flex items-center justify-between gap-3">
        <RowLabel control={control} htmlFor={sliderId} overridden={overridden} onReset={onReset} />
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="number"
            className="canvas-style-number"
            aria-label={`${name} value`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={draft ?? String(value)}
            onFocus={() => setDraft(String(value))}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setDraft(text);
              const parsed = Number(text);
              if (text.trim() !== "" && Number.isFinite(parsed)) onChange(snapToControlStep(control, parsed));
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          {unit}
        </span>
      </span>
      <input
        id={sliderId}
        className="canvas-style-range"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-label={name}
        onChange={(event) => onChange(snapToControlStep(control, Number(event.currentTarget.value)))}
      />
    </div>
  );
}

function ColorRow({ control, value, overridden, onChange, onReset }: RowProps & { value: string }) {
  const textId = useId();
  // While focused the field shows what is typed; each valid color applies at
  // once, and leaving the field shows the stored (canonical) value again.
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = parseColor(value);
  const shown = draft ?? value.replace(/\s+/g, "");
  const invalid = draft !== null && normalizeColor(draft) === null;
  const name = controlName(control);
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 text-xs" data-control={controlId(control)}>
      <RowLabel control={control} htmlFor={textId} overridden={overridden} onReset={onReset} />
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="canvas-style-swatch" title="Pick a color">
          <span className="canvas-style-swatch-fill" style={{ background: value }} />
          <input
            type="color"
            aria-label={`${name} picker`}
            value={parsed ? formatHex(parsed).toLowerCase() : "#000000"}
            onChange={(event) => {
              const picked = parseColor(event.currentTarget.value);
              // The native picker has no alpha: keep the token's own.
              if (picked) onChange(formatColor({ ...picked, a: parsed?.a ?? 1 }));
            }}
          />
        </span>
        <input
          id={textId}
          type="text"
          className="canvas-style-color-text"
          aria-label={name}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          autoComplete="off"
          value={shown}
          onFocus={() => setDraft(shown)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDraft(text);
            const color = normalizeColor(text);
            if (color) onChange(color);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </span>
    </div>
  );
}

function SelectRow({ control, value, overridden, onChange, onReset }: RowProps & { value: string }) {
  const radioName = useId();
  return (
    <div className="grid gap-1.5 text-xs" data-control={controlId(control)}>
      <RowLabel control={control} overridden={overridden} onReset={onReset} />
      <div role="radiogroup" aria-label={controlName(control)} className="canvas-style-segmented">
        {(control.options ?? []).map((option) => (
          <label
            key={option.value}
            className="canvas-style-segment"
            data-active={option.value === value ? "true" : "false"}
            title={option.label}
          >
            <input
              type="radio"
              className="canvas-style-visually-hidden"
              name={radioName}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function BooleanRow({ control, value, overridden, onChange, onReset }: RowProps & { value: boolean }) {
  const switchId = useId();
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-xs" data-control={controlId(control)}>
      <RowLabel control={control} htmlFor={switchId} overridden={overridden} onReset={onReset} />
      <input
        id={switchId}
        type="checkbox"
        role="switch"
        className="canvas-style-toggle"
        aria-label={controlName(control)}
        checked={value}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </div>
  );
}
