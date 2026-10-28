import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import type { StyleSettings, StyleSettingsPatch } from "@codecaine-ai/agent-kernel-viewer-shell";

/** html[data-theme], the theme the page shows: tokens.css and the host contract read it. */
function subscribeHtmlTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readHtmlTheme = () => document.documentElement.getAttribute("data-theme");
const readNoTheme = () => null;

/** The theme the page shows (html[data-theme]) and the topbar toggle that switches it. */
export function useTheme(theme: StyleSettings["theme"], onStyleSettingsChange: (updates: StyleSettingsPatch) => void) {
  const htmlTheme = useSyncExternalStore(subscribeHtmlTheme, readHtmlTheme, readNoTheme);
  const dark = htmlTheme === "dark";

  // data-theme on <html> switches the design-system tokens and the host contract. It is stamped
  // before the browser paints (index.html already applied the stored theme before the bundle ran).
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = dark ? "light" : "dark";
    // Stamp first: a theme switched from outside (html[data-theme]) may already differ from the
    // engine's, and then writing the engine alone would change nothing on screen.
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    onStyleSettingsChange({ theme: next });
  }, [dark, onStyleSettingsChange]);

  return { dark, toggleTheme };
}
