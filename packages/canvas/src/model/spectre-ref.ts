/**
 * Shared reference identity (D27): one link model used by both a host app's
 * doc delta `reference` spans and this package's canvas `links[].target`.
 *
 * Originally defined in a host app's docs-model as the "neutral home" for
 * both docs and canvas (see ../../../PROVENANCE.md for the exact source).
 * Since this package was extracted to stand alone (it must not depend on a
 * host app's docs-model), this is a local copy of just the `SpectreRef`
 * type shape — the `validateSpectreRef` runtime validator stays host-side
 * (docs-model owns validating doc-authored refs; this package only needs
 * the type to type `InteractiveCanvasLink.target`). Keep this shape in sync
 * by hand with the host app's copy if either evolves.
 */
export type SpectreRef = {
  kind: "doc" | "source";
  /** Repo-relative path (D27) — no registry/absolute paths in v1. */
  path: string;
  symbol?: string;
  line?: number;
  section?: string;
  label?: string;
};
