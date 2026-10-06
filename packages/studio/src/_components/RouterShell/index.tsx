import type { MouseEvent, ReactNode } from "react";
import { CheckIcon, ShapesIcon, WorkflowIcon } from "@codecaine-ai/canvas/ui/icons";
import { devPagesEnabled } from "@/shared/dev-flag";
import { navigate } from "@/shared/navigation";
import { AppShell, resolveNav, type Lane, type NavSection, type ShellLinkProps } from "../AppShell";
import { ThemeToggle } from "./_components/ThemeToggle";

/** The app's name: the sidebar title and the document title outside the shell pages. */
export const APP_NAME = "Canvas";

const SIDEBAR_STORAGE_KEY = "canvas-studio.sidebar";

// One key for the theme toggle in every page's topbar actions, so React keeps
// its element across pages: a focused toggle keeps focus when a click that
// does not move focus (Safari) changes the page.
const THEME_TOGGLE_KEY = "theme-toggle";

/** Paths of the pages inside the shell. The editor (/canvas/<id>, /?src=) and /view stay outside it. */
export const SHELL_PATHS = {
  boards: "/",
  gallery: "/gallery",
  evals: "/evals",
} as const;

/**
 * The sidebar: the board list and the object gallery, plus the Evals page in
 * an `end` section when dev pages are on (it is the studio's one dev tool
 * page, behind the same flag as before). Boards open from the board list into
 * the full-bleed editor, whose back button returns here.
 */
function navSections(showDevPages: boolean): NavSection[] {
  const sections: NavSection[] = [
    {
      id: "primary",
      label: "Primary",
      items: [
        { id: "boards", label: "Boards", href: SHELL_PATHS.boards, icon: <WorkflowIcon /> },
        { id: "gallery", label: "Object Gallery", href: SHELL_PATHS.gallery, icon: <ShapesIcon /> },
      ],
    },
  ];
  if (showDevPages) {
    sections.push({
      id: "dev",
      label: "Dev pages",
      showHeading: true,
      placement: "end",
      items: [{ id: "evals", label: "Evals", href: SHELL_PATHS.evals, icon: <CheckIcon /> }],
    });
  }
  return sections;
}

/**
 * Nav links are real links (open in a new tab, copy the address) that route
 * in place through the studio's pushState navigation on a plain click.
 */
function StudioLink({ href, onClick, ...rest }: ShellLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
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
    if (window.location.pathname === href && !window.location.search) return;
    navigate(href);
  };
  return <a {...rest} href={href} onClick={handleClick} />;
}

export type RouterShellProps = {
  /** The current shell path, for the nav's current row. */
  path: string;
  /** The page title: the topbar h1. */
  title: string;
  /** Page actions; the theme toggle follows them on every page. */
  actions?: ReactNode;
  lane?: Lane;
  children: ReactNode;
};

/** The design-system app shell around the studio's page-like routes: board list, object gallery, evals. */
export function RouterShell({ path, title, actions, lane, children }: RouterShellProps) {
  return (
    <AppShell
      appName={APP_NAME}
      storageKey={SIDEBAR_STORAGE_KEY}
      sections={resolveNav(navSections(devPagesEnabled()), path)}
      title={title}
      lane={lane}
      linkComponent={StudioLink}
      actions={
        <>
          {actions}
          <ThemeToggle key={THEME_TOGGLE_KEY} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
