/**
 * The viewer's tiny navigation primitive (same pattern as studio's):
 * pushState plus a synthetic popstate so App's route state re-parses.
 */
export function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
