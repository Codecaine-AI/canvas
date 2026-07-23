/**
 * Studio's tiny navigation primitive: pushState plus a synthetic popstate so
 * App's route state re-parses. Lives outside App.tsx so page-group pages can
 * navigate without importing the app shell.
 */
export function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
