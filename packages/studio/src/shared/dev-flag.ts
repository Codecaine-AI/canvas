/**
 * The dev-pages flag (HARNESS-SETUP-PLAN.md §2b): dev builds see the dev
 * rail by default; packaged builds can opt in with VITE_STUDIO_DEV_PAGES=1.
 * (The agent trace/operator pages moved out of studio — they're the
 * standalone viewer app in packages/canvas-agent/src/viewer, `make traces`.)
 */
export function devPagesEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_STUDIO_DEV_PAGES === "1";
}
