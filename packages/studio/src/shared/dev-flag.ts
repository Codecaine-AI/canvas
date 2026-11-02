/**
 * The dev-pages flag (HARNESS-SETUP-PLAN.md §2b): dev builds see the dev
 * rail by default; packaged builds can opt in with VITE_STUDIO_DEV_PAGES=1.
 */
export function devPagesEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_STUDIO_DEV_PAGES === "1";
}
