/**
 * Viewports at or below this width start with the sidebar collapsed when no
 * choice is stored. It matches the `@media (max-width: 800px)` block in
 * css/layout.css. No breakpoint token exists yet: CSS custom properties cannot
 * be used in media queries. 800px mirrors the budget app.
 */
export const NARROW_VIEWPORT_QUERY = '(max-width: 800px)';
