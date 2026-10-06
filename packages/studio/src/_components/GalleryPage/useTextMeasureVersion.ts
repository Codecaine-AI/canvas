import { useSyncExternalStore } from "react";
import { onBackendChange } from "@codecaine-ai/text-measure";

/**
 * Counts text-measure backend switches. Text widths change when the bundled
 * faces finish loading (useBrowserFonts in main.tsx), so Studio code that lays
 * out text outside the canvas stage puts this count in its memo dependencies
 * and measures again. The counter subscribes at module load, before any
 * component can, so it is current when React reads it.
 */
let backendSwitches = 0;
onBackendChange(() => {
  backendSwitches += 1;
});

export function useTextMeasureVersion(): number {
  return useSyncExternalStore(onBackendChange, () => backendSwitches);
}
