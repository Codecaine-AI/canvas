import type { ReactNode } from 'react';

export type TopbarProps = {
  title: ReactNode;
  actions?: ReactNode;
};

export function Topbar({ title, actions }: TopbarProps) {
  return (
    <header className="ds-topbar">
      <h1 className="ds-topbar-title">{title}</h1>
      {actions && <div className="ds-topbar-actions">{actions}</div>}
    </header>
  );
}
