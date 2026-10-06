import type { AnchorHTMLAttributes, ElementType, ReactNode } from 'react';

/** Props every nav link receives. A router adapter maps `href` to its own prop. */
export type ShellLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Renders nav links: `'a'` by default, or a router link adapter. */
export type ShellLinkComponent = ElementType<ShellLinkProps>;

export type NavItemConfig = {
  id: string;
  label: string;
  href: string;
  /** Required in practice for top-level items: the collapsed rail shows only icons. */
  icon?: ReactNode;
  /** The exact current page: `aria-current="page"`. Set by `resolveNav`. */
  current?: boolean;
  /** Holds the current page below it: `data-active="true"`. Set by `resolveNav`. */
  active?: boolean;
  /** Draws a `.ds-sidebar-divider` after this item. */
  dividerAfter?: boolean;
  /** Subnav. Rendered only while this item is current or active. */
  children?: NavItemConfig[];
};

export type NavSection = {
  id: string;
  /** Accessible name of the `<nav>`. */
  label: string;
  /** Shows the label as a visible `.ds-nav-heading` (hidden in the rail). */
  showHeading?: boolean;
  /** `'end'` pushes this nav to the bottom of the sidebar. */
  placement?: 'start' | 'end';
  items: NavItemConfig[];
};
