import { Icon } from "../Icon";

export type ThemeToggleProps = { dark: boolean; onToggle: () => void };

/** The topbar theme toggle: pressed when the page shows the dark theme (html[data-theme]). */
export function ThemeToggle({ dark, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="ds-shell-icon-button"
      aria-label="Dark theme"
      aria-pressed={dark}
      title="Dark theme"
      onClick={onToggle}
    >
      <Icon name="moon" />
    </button>
  );
}
