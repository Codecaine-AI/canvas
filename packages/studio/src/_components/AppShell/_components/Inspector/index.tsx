import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export type InspectorProps = {
  id: string;
  title: string;
  /** Mirrors `data-inspector` on the shell. Drives focus in and out. */
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Inspector({ id, title, open, onClose, children }: InspectorProps) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);

  // Focus moves into the panel on open and back to the opener on close.
  // A panel that mounts open (a deep link) leaves focus where it is.
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeButton.current?.focus({ preventScroll: true });
      return;
    }
    const focused = document.activeElement;
    if (!focused || focused === document.body || panel.current?.contains(focused)) {
      opener.current?.focus({ preventScroll: true });
    }
    opener.current = null;
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !event.defaultPrevented) onClose();
  }

  return (
    <aside ref={panel} className="ds-inspector" id={id} aria-label={title} onKeyDown={handleKeyDown}>
      <div className="ds-inspector-header">
        <h2 className="ds-inspector-title">{title}</h2>
        <button
          ref={closeButton}
          type="button"
          className="ds-shell-icon-button"
          aria-label={`Close ${title}`}
          onClick={onClose}
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
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="ds-inspector-body">{children}</div>
    </aside>
  );
}
