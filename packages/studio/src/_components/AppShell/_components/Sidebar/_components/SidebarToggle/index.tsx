export type SidebarToggleProps = {
  collapsed: boolean;
  /** Id of the sidebar this button collapses. */
  controls: string;
  /** Shortcut text for the tooltip: ⌘\ or Ctrl+\. */
  shortcut: string;
  onToggle: () => void;
};

export function SidebarToggle({ collapsed, controls, shortcut, onToggle }: SidebarToggleProps) {
  return (
    <button
      type="button"
      className="ds-shell-icon-button ds-sidebar-toggle"
      aria-label="Toggle sidebar"
      aria-expanded={!collapsed}
      aria-controls={controls}
      aria-keyshortcuts={'Meta+\\ Control+\\'}
      title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${shortcut})`}
      onClick={onToggle}
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
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path className="ds-sidebar-toggle-arrow" d="m16 9-3 3 3 3" />
      </svg>
    </button>
  );
}
