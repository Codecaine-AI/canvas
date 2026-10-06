import { useId } from "react";
import { PanelRightIcon } from "@codecaine-ai/canvas/ui/icons";
import type { CanvasColor } from "@codecaine-ai/canvas";
import {
  CANVAS_THEME_IDS,
  CANVAS_THEME_LABELS,
  resolveCanvasStyle,
  type CanvasStyle,
  type CanvasStyleKey,
  type CanvasStyleOverrides,
  type CanvasStyleSettings,
  type CanvasThemeId,
} from "@codecaine-ai/canvas/style";
import "./styles.css";
import type { CanvasStyleTokenValue } from "@/shared/useCanvasStyleSettings";
import { GROUP_ORDER, SHOW_COLOR_CONTROLS, TOKEN_CONTROLS } from "./constants";
import { controlId, controlValue, inactiveNote, isColorControl, isOverridden, isVisible, overrideCount } from "./utils";
import { useOpenGroups } from "./useOpenGroups";
import { ControlRow } from "./_components/ControlRow";
import { GroupSection } from "./_components/GroupSection";
import { ThemeCard } from "./_components/ThemeCard";

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
 * CSS: `.canvas-style-*` in the styles.css of each part.
 *
 * Color controls are hidden (owner decision for style engines: keep size,
 * density and font controls, hide color controls, keep their code): the color
 * rows (palette inks included) and the sliders that only set color strength
 * (section tints, border opacity, header strength). `colorControls` brings
 * them back; SHOW_COLOR_CONTROLS is the default.
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
  /** Show the color controls. Default: SHOW_COLOR_CONTROLS. */
  colorControls?: boolean;
};

export function StyleRail({
  settings,
  style,
  overrides,
  onSelectTheme,
  onChange,
  onResetKey,
  onResetTheme,
  onClose,
  colorControls = SHOW_COLOR_CONTROLS,
}: StyleRailProps) {
  const { openGroups, toggleGroup } = useOpenGroups();
  const shownControls = colorControls
    ? TOKEN_CONTROLS
    : TOKEN_CONTROLS.filter((control) => !isColorControl(control));
  // A group whose every control is hidden (Palette) is not rendered.
  const shownGroups = GROUP_ORDER.filter((group) => shownControls.some((control) => control.group === group));
  const themeInputName = useId();
  const activeOverrideCount = overrideCount(overrides);
  const themeLabel = CANVAS_THEME_LABELS[settings.theme];

  return (
    <aside
      aria-label="Style"
      className="absolute bottom-24 right-4 top-20 z-raised flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded border border-border/70 bg-background/95 text-foreground shadow-glass backdrop-blur-glass"
      // Keys pressed on the rail's own controls (arrows on a slider,
      // Backspace on a button) must not reach the canvas hotkeys, which
      // would nudge or delete the selection.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3">
        <h2 className="truncate text-ui-md font-semibold leading-title text-ink">Style</h2>
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
        <p className="px-4 pt-3 text-ui-xs leading-ui text-muted-foreground">
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

        {shownGroups.map((group) => {
          const controls = shownControls.filter((control) => control.group === group);
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
          className="w-full rounded border border-border px-2 py-1.5 text-ui-xs text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
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
