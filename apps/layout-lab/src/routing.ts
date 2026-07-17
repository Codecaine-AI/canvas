/** pushState + a synthetic popstate, mirroring packages/studio/src/App.tsx. */
export function navigate(pathname: string) {
  if (window.location.pathname !== pathname) {
    window.history.pushState({}, "", pathname);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}
