import type { ComponentProps, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { StyleSettingsPanel, type StyleSettings, type StyleSettingsPatch } from "@agent-kernel/viewer-shell";

/** The inspector closes on Escape from inside it; an Escape that ends IME composition must not. */
function keepOpenWhileComposing(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Escape" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
    event.stopPropagation();
  }
}

export type StyleInspectorPanelProps = {
  settings: StyleSettings;
  onChange: (updates: StyleSettingsPatch) => void;
  sections: ComponentProps<typeof StyleSettingsPanel>["sections"];
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/** The inspector's content: the resize edge and the shared style engine's panel. */
export function StyleInspectorPanel({ settings, onChange, sections, onResizeStart }: StyleInspectorPanelProps) {
  return (
    <div onKeyDown={keepOpenWhileComposing}>
      <div
        aria-hidden
        className="style-settings-rail-resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />
      <StyleSettingsPanel
        settings={settings}
        onChange={onChange}
        sections={sections}
      />
    </div>
  );
}
