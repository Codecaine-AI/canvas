/** Mod+\ (⌘\ or Ctrl+\). Alt or Shift held means a different shortcut. */
export function isToggleShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === '\\' || event.code === 'Backslash')
  );
}

/** Shortcut text for tooltips: ⌘\ on Apple platforms, Ctrl+\ elsewhere. */
export function shortcutLabel(userAgent: string): string {
  return /Mac|iPhone|iPad/.test(userAgent) ? '⌘\\' : 'Ctrl+\\';
}

/**
 * `useSyncExternalStore` subscription for values that are fixed once the page
 * loads. It lets a hook render the server value during hydration and the
 * browser value right after, without a hydration mismatch.
 */
export function subscribeNever(): () => void {
  return () => {};
}
