import { useTheme } from "./useTheme";

/** The topbar's theme toggle: pressed while the app is dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className="ds-shell-icon-button"
      aria-pressed={theme === "dark"}
      aria-label="Dark theme"
      title="Dark theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />
      </svg>
    </button>
  );
}
