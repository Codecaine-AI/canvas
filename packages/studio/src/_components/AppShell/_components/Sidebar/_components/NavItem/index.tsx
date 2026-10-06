import type { NavItemConfig, ShellLinkComponent } from '../../types';

export type NavItemProps = {
  item: NavItemConfig;
  /** In the icon rail the label is hidden, so the row carries a native tooltip. */
  collapsed: boolean;
  linkComponent: ShellLinkComponent;
};

export function NavItem({ item, collapsed, linkComponent: Link }: NavItemProps) {
  return (
    <Link
      className="ds-nav-item"
      href={item.href}
      aria-current={item.current ? 'page' : undefined}
      data-active={item.active && !item.current ? 'true' : undefined}
      title={collapsed ? item.label : undefined}
    >
      {item.icon && (
        <span className="ds-nav-icon" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="ds-nav-label">{item.label}</span>
    </Link>
  );
}
