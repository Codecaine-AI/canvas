import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NARROW_VIEWPORT_QUERY } from './constants';
import { isToggleShortcut, shortcutLabel, subscribeNever } from './utils';

type StoredState = 'collapsed' | 'expanded';

/**
 * Sidebar collapsed state and its Mod+\ shortcut. Starts from the stored
 * choice, then `defaultCollapsed`, then the viewport (collapsed at 800px or
 * less). Explicit choices persist in localStorage.
 */
export function useSidebarCollapsed(
  options: { storageKey?: string | undefined; defaultCollapsed?: boolean | undefined } = {},
): { collapsed: boolean; setCollapsed: (next: boolean) => void; toggle: () => void; shortcut: string } {
  const { storageKey = 'ds.sidebar', defaultCollapsed } = options;

  // Server renders and the hydration pass get the server value, so the markup
  // matches; every later browser render gets the browser value.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  const shortcut = useSyncExternalStore(
    subscribeNever,
    () => shortcutLabel(navigator.userAgent),
    () => shortcutLabel(''),
  );

  // A browser render reads storage in the initializer, so the first paint is
  // right and no width transition plays on load.
  const [collapsed, setCollapsedState] = useState(() =>
    inBrowser ? readInitialCollapsed(storageKey, defaultCollapsed) : (defaultCollapsed ?? false),
  );

  // After hydration, switch to the browser value.
  const settled = useRef(inBrowser);
  useEffect(() => {
    if (settled.current) return;
    settled.current = true;
    setCollapsedState(readInitialCollapsed(storageKey, defaultCollapsed));
  }, [storageKey, defaultCollapsed]);

  // Only explicit choices are stored, so the viewport default stays live.
  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedState(next);
      writeStored(storageKey, next ? 'collapsed' : 'expanded');
    },
    [storageKey],
  );

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !isToggleShortcut(event)) return;
      event.preventDefault();
      if (!event.repeat) toggle();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return { collapsed, setCollapsed, toggle, shortcut };
}

function readInitialCollapsed(storageKey: string, defaultCollapsed: boolean | undefined): boolean {
  if (typeof window === 'undefined') return defaultCollapsed ?? false;
  const stored = readStored(storageKey);
  if (stored) return stored === 'collapsed';
  if (defaultCollapsed !== undefined) return defaultCollapsed;
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
}

function readStored(storageKey: string): StoredState | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === 'collapsed' || value === 'expanded' ? value : null;
  } catch {
    return null; // Storage is blocked (privacy settings, sandboxed iframe).
  }
}

function writeStored(storageKey: string, value: StoredState): void {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Blocked or full: the choice lasts until the page reloads.
  }
}
