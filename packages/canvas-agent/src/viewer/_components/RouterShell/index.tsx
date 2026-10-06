import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  StyleOverlay,
  StyleSettingsPanel,
  clampStyleRailWidth,
  loadStyleRailCollapsed,
  saveStyleRailCollapsed,
  saveStyleRailWidth,
  styleEffectClass,
  styleVars,
  type StyleSettings,
  type StyleSettingsPatch,
} from "@agent-kernel/viewer-shell";

import { AppShell, resolveNav, type NavSection, type ShellLinkProps } from "../AppShell";
import { Icon } from "../../shared/_components/Icon";
import { navigate } from "../../lib/navigation";
import { CANVAS_STYLE_CONFIG, loadStoredStyleRailWidth } from "../../lib/style-config";

export type View = "traces" | "config";

/** The topbar h1 and the document title: the page's nav label. */
const PAGE_TITLES: Record<View, string> = {
  traces: "Traces",
  config: "Config",
};

const VIEW_PATHS: Record<View, string> = {
  traces: "/traces",
  config: "/config",
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "primary",
    label: "Primary",
    items: [
      { id: "traces", label: PAGE_TITLES.traces, href: VIEW_PATHS.traces, icon: <Icon name="traces" /> },
      { id: "config", label: PAGE_TITLES.config, href: VIEW_PATHS.config, icon: <Icon name="config" /> },
    ],
  },
];

/**
 * The shell's nav link: a real link (a modified click opens a new tab), and a plain click switches
 * the page in place through the viewer's History-API navigate(). Module scope, so it keeps one
 * identity across renders.
 */
function ViewerLink({ href, onClick, ...rest }: ShellLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}

/** The inspector closes on Escape from inside it; an Escape that ends IME composition must not. */
function keepOpenWhileComposing(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Escape" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
    event.stopPropagation();
  }
}

/** html[data-theme], the theme the page shows: tokens.css and the host contract read it. */
function subscribeHtmlTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readHtmlTheme = () => document.documentElement.getAttribute("data-theme");
const readNoTheme = () => null;

type RouterShellProps = {
  view: View;
  styleSettings: StyleSettings;
  onStyleSettingsChange: (updates: StyleSettingsPatch) => void;
  children: ReactNode;
};

/**
 * The design-system app shell (guide/layout.md) around the two viewer pages, inside the
 * viewer-shell style engine's root (as in simple-research-kernel):
 *
 * - The engine root wraps the whole shell: its knobs (inline vars) and effects (soften, bevel,
 *   grain overlay) reach the sidebar, topbar and inspector, and its `isolation` stacking context
 *   stays outside .ds-main, so fixed overlays are not trapped under the sticky topbar. index.css
 *   maps its Layout knobs onto the shell's layout tokens.
 * - The style rail is the shell's inspector: the Style button opens it, it keeps the stored open
 *   state and `?style=open`, and its width is the shell's token until the user drags it.
 * - The theme lives in the engine's settings (one source of truth); the topbar toggle and the
 *   inspector's Theme tab both write it. The toggle shows html[data-theme].
 */
export function RouterShell({ view, styleSettings, onStyleSettingsChange, children }: RouterShellProps) {
  const [styleOpen, setStyleOpen] = useState(() => !loadStyleRailCollapsed(CANVAS_STYLE_CONFIG));
  const [styleRailWidth, setStyleRailWidth] = useState(loadStoredStyleRailWidth);
  const [styleRailResizing, setStyleRailResizing] = useState(false);
  const styleButtonRef = useRef<HTMLButtonElement>(null);
  const htmlTheme = useSyncExternalStore(subscribeHtmlTheme, readHtmlTheme, readNoTheme);
  const title = PAGE_TITLES[view];
  const dark = htmlTheme === "dark";

  // data-theme on <html> switches the design-system tokens and the host contract. It is stamped
  // before the browser paints (index.html already applied the stored theme before the bundle ran).
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = styleSettings.theme;
    document.documentElement.style.colorScheme = styleSettings.theme;
  }, [styleSettings.theme]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  const toggleTheme = useCallback(() => {
    const next = dark ? "light" : "dark";
    // Stamp first: a theme switched from outside (html[data-theme]) may already differ from the
    // engine's, and then writing the engine alone would change nothing on screen.
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    onStyleSettingsChange({ theme: next });
  }, [dark, onStyleSettingsChange]);

  const openStyle = useCallback(() => {
    setStyleOpen(true);
    saveStyleRailCollapsed(CANVAS_STYLE_CONFIG, false);
  }, []);

  // Every close path (the inspector's close button, Escape inside it, the Style button) returns
  // focus to Style, also when the inspector mounted open and the shell saw no opener.
  const closeStyle = useCallback(() => {
    setStyleOpen(false);
    saveStyleRailCollapsed(CANVAS_STYLE_CONFIG, true);
    styleButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const startStyleRailResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setStyleRailResizing(true);
    let width: number | null = null;
    const onMove = (moveEvent: PointerEvent) => {
      // The inspector ends at the root's client edge, left of a classic vertical scrollbar.
      width = clampStyleRailWidth(document.documentElement.clientWidth - moveEvent.clientX);
      setStyleRailWidth(width);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setStyleRailResizing(false);
      if (width !== null) saveStyleRailWidth(CANVAS_STYLE_CONFIG, width);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  const engineStyle = {
    ...styleVars(styleSettings, CANVAS_STYLE_CONFIG),
    ...(styleRailWidth === null ? {} : { "--research-style-rail-width": `${styleRailWidth}px` }),
  } as CSSProperties;

  return (
    <div
      className={`research-style-shell ${styleEffectClass(styleSettings)} ${
        styleRailResizing ? "research-style-shell-resizing" : ""
      } bg-background text-foreground`}
      style={engineStyle}
    >
      <AppShell
        appName="Canvas Agent"
        storageKey="canvas-agent.sidebar"
        sections={resolveNav(NAV_SECTIONS, VIEW_PATHS[view])}
        title={title}
        lane="full"
        linkComponent={ViewerLink}
        footer={
          // The old sidebar's foot note: where the viewer's dev proxy sends /api by default.
          <span className="ds-sidebar-footer-text">
            <span className="ds-sidebar-footer-meta">harness :4820</span>
          </span>
        }
        actions={
          <>
            <button
              key="style"
              ref={styleButtonRef}
              type="button"
              className="ds-shell-button"
              aria-expanded={styleOpen}
              aria-controls="ds-inspector"
              onClick={styleOpen ? closeStyle : openStyle}
            >
              Style
            </button>
            <button
              key="theme"
              type="button"
              className="ds-shell-icon-button"
              aria-label="Dark theme"
              aria-pressed={dark}
              title="Dark theme"
              onClick={toggleTheme}
            >
              <Icon name="moon" />
            </button>
          </>
        }
        inspector={{
          title: "Style",
          open: styleOpen,
          onClose: closeStyle,
          content: (
            <div onKeyDown={keepOpenWhileComposing}>
              <div
                aria-hidden
                className="style-settings-rail-resize-handle"
                onPointerDown={startStyleRailResize}
                title="Drag to resize"
              />
              <StyleSettingsPanel
                settings={styleSettings}
                onChange={onStyleSettingsChange}
                sections={CANVAS_STYLE_CONFIG.sections}
              />
            </div>
          ),
        }}
      >
        {children}
      </AppShell>
      <StyleOverlay settings={styleSettings.grain} />
    </div>
  );
}
