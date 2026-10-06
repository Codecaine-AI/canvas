import type { NavItemConfig, NavSection } from './types';

/** The one item that matches the page, with the items above it. */
type Match = { chain: NavItemConfig[]; exact: boolean; href: string };

/**
 * Marks the nav for `pathname`. One item matches the page: the deepest item
 * whose href equals it, or, when no href equals it, the item with the longest
 * href that is a path prefix of it. An exact match is `current`
 * (`aria-current="page"`). A prefix match and every item above the match are
 * `active` (`data-active="true"`), so a parent that shares its child's href is
 * active, not current. Query, hash and a trailing slash are ignored. Returns a
 * new tree; `sections` is unchanged.
 */
export function resolveNav(sections: NavSection[], pathname: string): NavSection[] {
  const match = findMatch(sections, normalizePath(pathname));
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => markItem(item, match)),
  }));
}

function findMatch(sections: NavSection[], path: string): Match | null {
  let best: Match | null = null;
  const visit = (items: NavItemConfig[], above: NavItemConfig[]) => {
    for (const item of items) {
      const chain = [...above, item];
      const href = normalizePath(item.href);
      const exact = href === path;
      // '/' never prefixes: `${'/'}/` is '//', which no normalized path starts with.
      if (exact || path.startsWith(`${href}/`)) {
        const candidate = { chain, exact, href };
        if (beats(candidate, best)) best = candidate;
      }
      if (item.children) visit(item.children, chain);
    }
  };
  for (const section of sections) visit(section.items, []);
  return best;
}

/** Exact beats prefix; a longer prefix beats a shorter one; then deeper wins; ties keep the first in nav order. */
function beats(candidate: Match, best: Match | null): boolean {
  if (!best) return true;
  if (candidate.exact !== best.exact) return candidate.exact;
  if (!candidate.exact && candidate.href.length !== best.href.length) {
    return candidate.href.length > best.href.length;
  }
  return candidate.chain.length > best.chain.length;
}

function markItem(item: NavItemConfig, match: Match | null): NavItemConfig {
  const children = item.children?.map((child) => markItem(child, match));
  const onPath = match?.chain.includes(item) ?? false;
  const current = onPath && match?.exact === true && match.chain[match.chain.length - 1] === item;
  const active = onPath && !current;
  return children ? { ...item, current, active, children } : { ...item, current, active };
}

function normalizePath(path: string): string {
  const end = path.search(/[?#]/);
  const bare = end === -1 ? path : path.slice(0, end);
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
}
