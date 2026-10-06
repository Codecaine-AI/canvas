import { createContext, useContext } from "react";
import { defaultStyleSettings, type StyleSettings } from "@agent-kernel/viewer-shell";
import { CANVAS_STYLE_CONFIG } from "./style-config";

/** Style settings for pages that thread view options (trace icon side/style). */
export const StyleSettingsContext = createContext<StyleSettings>(defaultStyleSettings(CANVAS_STYLE_CONFIG));

export function useViewerStyleSettings(): StyleSettings {
  return useContext(StyleSettingsContext);
}
