import { Fragment, useId } from "react";
import { PanelRightIcon } from "@codecaine-ai/canvas/ui/icons";
import {
  CANVAS_STYLE_CONTROLS,
  CANVAS_STYLE_GROUP_LABELS,
  type CanvasStyle,
  type CanvasStyleControl,
  type CanvasStyleGroup,
  type CanvasStyleKey,
} from "@codecaine-ai/canvas/style";

/**
 * Style rail — right-side panel for the workspace-wide canvas style settings
 * (corner radii, border widths). Visual language follows the docs workbench's
 * Style Rail (docs-workbench/web/src/shell/StyleRail.tsx): uppercase "Style"
 * header with a collapse button, uppercase section labels, slider rows with a
 * per-key override dot, and a "Reset to defaults" footer. Only three groups,
 * so they stack in one scrolling pane instead of the docs' two-pane nav.
 * CSS: `.canvas-style-rail-*` / `.canvas-style-range` in index.css.
 */

export type StyleRailProps = {
  style: CanvasStyle;
  overrides: Partial<CanvasStyle>;
  onChange(key: CanvasStyleKey, value: number): void;
  onResetKey(key: CanvasStyleKey): void;
  onResetAll(): void;
  onClose(): void;
};

const GROUP_ORDER = Array.from(
  new Set(CANVAS_STYLE_CONTROLS.map((control) => control.group)),
) as CanvasStyleGroup[];

function formatPx(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}px`;
}

export function StyleRail({
  style,
  overrides,
  onChange,
  onResetKey,
  onResetAll,
  onClose,
}: StyleRailProps) {
  const overrideCount = Object.keys(overrides).length;

  return (
    <aside
      aria-label="Style"
      className="absolute bottom-24 right-4 top-20 z-20 flex w-[18rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border/70 bg-background/95 text-foreground shadow-xl backdrop-blur"
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
          Applies to every board.{" "}
          {overrideCount === 0
            ? "No overrides"
            : `${overrideCount} ${overrideCount === 1 ? "override" : "overrides"}`}
        </p>
        {GROUP_ORDER.map((group) => (
          <Fragment key={group}>
            <h3 className="canvas-style-rail-section-label">{CANVAS_STYLE_GROUP_LABELS[group]}</h3>
            <div className="canvas-style-rail-control-group">
              {CANVAS_STYLE_CONTROLS.filter((control) => control.group === group).map((control) => (
                <SliderRow
                  key={control.key}
                  control={control}
                  groupLabel={CANVAS_STYLE_GROUP_LABELS[group]}
                  value={style[control.key]}
                  overridden={control.key in overrides}
                  onChange={(value) => onChange(control.key, value)}
                  onReset={() => onResetKey(control.key)}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>

      <div className="shrink-0 border-t border-border/70 p-2">
        <button
          type="button"
          className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={overrideCount === 0}
          onClick={onResetAll}
        >
          Reset to defaults
        </button>
      </div>
    </aside>
  );
}

function SliderRow({
  control,
  groupLabel,
  value,
  overridden,
  onChange,
  onReset,
}: {
  control: CanvasStyleControl;
  groupLabel: string;
  value: number;
  overridden: boolean;
  onChange(value: number): void;
  onReset(): void;
}) {
  const inputId = useId();
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="flex items-center justify-between gap-3">
        <span className="canvas-style-rail-row-label">
          {overridden ? (
            <button
              type="button"
              className="canvas-style-rail-row-override-dot"
              data-overridden="true"
              aria-label={`Reset ${groupLabel} ${control.label.toLowerCase()} to default`}
              title="Reset to default"
              onClick={onReset}
            />
          ) : (
            <span
              aria-hidden="true"
              className="canvas-style-rail-row-override-dot"
              data-overridden="false"
            />
          )}
          <label htmlFor={inputId}>{control.label}</label>
        </span>
        <span className="text-[11px] tabular-nums text-foreground">{formatPx(value)}</span>
      </span>
      <input
        id={inputId}
        className="canvas-style-range"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-label={`${groupLabel} ${control.label.toLowerCase()}`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}
