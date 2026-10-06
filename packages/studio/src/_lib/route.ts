import { normalizeProjectServerOrigin } from "@/shared/docs-server";

export type Route =
  | { name: "list" }
  | { name: "gallery" }
  /** The eval-suite run gallery (dev-pages flag only). */
  | { name: "evals" }
  | { name: "canvas"; id: string }
  /** A linked docs project's board, addressed by docs-root-relative src. */
  | { name: "project"; src: string; server?: string }
  | { name: "view"; id: string; view?: string }
  | { name: "embed"; id: string; view?: string };

export function parseRoute(pathname: string, search = ""): Route {
  if (pathname === "/gallery" || pathname === "/gallery/") {
    return { name: "gallery" };
  }
  if (pathname === "/evals" || pathname === "/evals/") {
    return { name: "evals" };
  }
  const match = pathname.match(/^\/(canvas|view|embed)\/([^/]+)\/?$/);
  if (match) {
    const name = match[1] as "canvas" | "view" | "embed";
    const id = decodeURIComponent(match[2]);
    if (name === "canvas") return { name, id };
    const requestedView = new URLSearchParams(search).get("view")?.trim();
    return { name, id, view: requestedView || undefined };
  }
  // Deep link into a linked project's board: /?src=<docs-root-relative path>
  // (optional &server=<origin>) — the URL "Edit in Canvas" links in docs apps
  // emit. Lands in the same full editor UI as opening from the board list.
  if (pathname === "/" || pathname === "") {
    const params = new URLSearchParams(search);
    const src = params.get("src")?.trim();
    if (src) {
      const server = normalizeProjectServerOrigin(params.get("server") ?? "");
      return { name: "project", src, server: server ?? undefined };
    }
  }
  return { name: "list" };
}

/**
 * The page title of a shell route (the topbar h1 and the document title,
 * layout.md rule 10). The editor and /view keep their own chrome outside the
 * shell and the app's document title.
 */
export function shellPageTitle(route: Route): string | null {
  if (route.name === "list") return "Boards";
  if (route.name === "gallery") return "Object Gallery";
  if (route.name === "evals") return "Evals";
  return null;
}

export function isDocumentRoute(route: Route): route is Extract<Route, { id: string }> {
  return route.name === "canvas" || route.name === "view" || route.name === "embed";
}
