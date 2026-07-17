import type { CompileSettings } from "../agent/types";
import type { BoardOverlays } from "./Board";

type ControlsPanelProps = {
  settings: CompileSettings;
  overlays: BoardOverlays;
  onSettingsChange: (patch: Partial<CompileSettings>) => void;
  onOverlaysChange: (patch: Partial<BoardOverlays>) => void;
};

export function ControlsPanel({
  settings,
  overlays,
  onSettingsChange,
  onOverlaysChange,
}: ControlsPanelProps) {
  return (
    <>
      <h2 className="section-title">Compiler settings</h2>
      <div className="control-grid">
        <div className="control control-wide">
          <div className="label-row">
            <label htmlFor="gutter">Gutter width</label>
            <span className="control-value">{settings.gutter} px</span>
          </div>
          <input
            id="gutter"
            type="range"
            min={0}
            max={96}
            step={16}
            value={settings.gutter}
            onChange={(event) => onSettingsChange({ gutter: Number(event.currentTarget.value) })}
          />
        </div>

        <div className="control">
          <div className="label-row"><label htmlFor="grid">Grid size</label></div>
          <select
            id="grid"
            value={settings.grid}
            onChange={(event) => onSettingsChange({ grid: Number(event.currentTarget.value) })}
          >
            <option value={8}>8</option>
            <option value={16}>16</option>
            <option value={32}>32</option>
          </select>
        </div>

        <div className="control">
          <div className="label-row"><label>Canvas</label></div>
          <div className="size-pair">
            <label className="number-wrap">
              <span>W</span>
              <input
                type="number"
                min={320}
                max={4096}
                step={16}
                value={settings.width}
                aria-label="Canvas width"
                onChange={(event) => onSettingsChange({ width: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="number-wrap">
              <span>H</span>
              <input
                type="number"
                min={240}
                max={4096}
                step={16}
                value={settings.height}
                aria-label="Canvas height"
                onChange={(event) => onSettingsChange({ height: Number(event.currentTarget.value) })}
              />
            </label>
          </div>
        </div>

        <div className="control control-wide">
          <div className="label-row">
            <label htmlFor="gap">Packing gap</label>
            <span className="control-value">{settings.gap} px</span>
          </div>
          <input
            id="gap"
            type="range"
            min={16}
            max={48}
            step={8}
            value={settings.gap}
            onChange={(event) => onSettingsChange({ gap: Number(event.currentTarget.value) })}
          />
        </div>
      </div>

      <h2 className="section-title">Overlays</h2>
      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={overlays.regions}
            onChange={(event) => onOverlaysChange({ regions: event.currentTarget.checked })}
          />
          Regions
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={overlays.gutters}
            onChange={(event) => onOverlaysChange({ gutters: event.currentTarget.checked })}
          />
          Gutters
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={overlays.grid}
            onChange={(event) => onOverlaysChange({ grid: event.currentTarget.checked })}
          />
          Dot grid
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={overlays.occupancy}
            onChange={(event) => onOverlaysChange({ occupancy: event.currentTarget.checked })}
          />
          Occupancy map
        </label>
      </div>
    </>
  );
}
