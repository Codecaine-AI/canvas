import type { View } from "./types";

/** The topbar h1 and the document title: the page's nav label. */
export const PAGE_TITLES: Record<View, string> = {
  traces: "Traces",
  config: "Config",
};

export const VIEW_PATHS: Record<View, string> = {
  traces: "/traces",
  config: "/config",
};
