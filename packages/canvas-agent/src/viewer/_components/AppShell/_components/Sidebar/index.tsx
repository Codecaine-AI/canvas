import { Fragment, useId, type ReactNode } from 'react';
import { NavItem } from './_components/NavItem';
import { SidebarToggle } from './_components/SidebarToggle';
import { SubNav } from './_components/SubNav';
import type { NavSection, ShellLinkComponent } from './types';

export type { NavItemConfig, NavSection, ShellLinkComponent, ShellLinkProps } from './types';
export { resolveNav } from './utils';

export type SidebarProps = {
  id: string;
  appName: string;
  sections: NavSection[];
  collapsed: boolean;
  onToggle: () => void;
  /** Toggle shortcut for the tooltip: ⌘\ or Ctrl+\. */
  shortcut: string;
  linkComponent: ShellLinkComponent;
  footer?: ReactNode;
};

export function Sidebar({
  id,
  appName,
  sections,
  collapsed,
  onToggle,
  shortcut,
  linkComponent,
  footer,
}: SidebarProps) {
  const headingIdPrefix = useId();

  return (
    <aside className="ds-sidebar" id={id} aria-label="Sidebar">
      <div className="ds-sidebar-header">
        <span className="ds-sidebar-title">{appName}</span>
        <SidebarToggle collapsed={collapsed} controls={id} shortcut={shortcut} onToggle={onToggle} />
      </div>
      <div className="ds-sidebar-body">
        {sections.map((section) => {
          const headingId = `${headingIdPrefix}-${section.id}`;
          return (
            <nav
              key={section.id}
              className="ds-nav"
              data-placement={section.placement === 'end' ? 'end' : undefined}
              aria-label={section.showHeading ? undefined : section.label}
              aria-labelledby={section.showHeading ? headingId : undefined}
            >
              {section.showHeading && (
                <p className="ds-nav-heading" id={headingId}>
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <Fragment key={item.id}>
                  <NavItem item={item} collapsed={collapsed} linkComponent={linkComponent} />
                  {item.children && item.children.length > 0 && (item.current || item.active) && (
                    <SubNav label={item.label} items={item.children} linkComponent={linkComponent} />
                  )}
                  {item.dividerAfter && <hr className="ds-sidebar-divider" />}
                </Fragment>
              ))}
            </nav>
          );
        })}
      </div>
      {footer && <div className="ds-sidebar-footer">{footer}</div>}
    </aside>
  );
}
