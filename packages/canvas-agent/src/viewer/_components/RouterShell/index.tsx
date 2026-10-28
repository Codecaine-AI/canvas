import { useEffect, type CSSProperties, type ReactNode } from "react";
import {
  StyleOverlay,
  styleEffectClass,
  styleVars,
  type StyleSettings,
  type StyleSettingsPatch,
} from "@codecaine-ai/agent-kernel-viewer-shell";

import { AppShell, resolveNav, type NavSection, type ShellLinkProps } from "../AppShell";
import { Icon } from "./_components/Icon";
import { StyleInspectorPanel } from "./_components/StyleInspectorPanel";
import { ThemeToggle } from "./_components/ThemeToggle";
import { PAGE_TITLES, VIEW_PATHS } from "./constants";
import { navigate } from "./navigation";
import type { View } from "./types";
import { useStyleInspector } from "./useStyleInspector";
import { useTheme } from "./useTheme";
import { CANVAS_STYLE_CONFIG } from "../../shared/style-config";

export type { View } from "./types";

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

export type RouterShellProps = {
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
  const { styleOpen, styleRailWidth, styleRailResizing, styleButtonRef, openStyle, closeStyle, startStyleRailResize } = useStyleInspector();
  const { dark, toggleTheme } = useTheme(styleSettings.theme, onStyleSettingsChange);
  const title = PAGE_TITLES[view];

  useEffect(() => {
    document.title = title;
  }, [title]);

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
            <ThemeToggle key="theme" dark={dark} onToggle={toggleTheme} />
          </>
        }
        inspector={{
          title: "Style",
          open: styleOpen,
          onClose: closeStyle,
          content: (
            <StyleInspectorPanel
              settings={styleSettings}
              onChange={onStyleSettingsChange}
              sections={CANVAS_STYLE_CONFIG.sections}
              onResizeStart={startStyleRailResize}
            />
          ),
        }}
      >
        {children}
      </AppShell>
      <StyleOverlay settings={styleSettings.grain} />
    </div>
  );
}
