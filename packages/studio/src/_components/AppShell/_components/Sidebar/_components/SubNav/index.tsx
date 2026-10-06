import { Fragment } from 'react';
import type { NavItemConfig, ShellLinkComponent } from '../../types';

export type SubNavProps = {
  /** Name of the parent section; labels the group. */
  label: string;
  items: NavItemConfig[];
  linkComponent: ShellLinkComponent;
};

/** Rows under the section that holds the current page. Nests for a third level. */
export function SubNav({ label, items, linkComponent: Link }: SubNavProps) {
  return (
    <div className="ds-subnav" role="group" aria-label={label}>
      {items.map((item) => (
        <Fragment key={item.id}>
          <Link
            className="ds-subnav-item"
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
            data-active={item.active && !item.current ? 'true' : undefined}
          >
            {item.label}
          </Link>
          {item.children && item.children.length > 0 && (item.current || item.active) && (
            <SubNav label={item.label} items={item.children} linkComponent={Link} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
