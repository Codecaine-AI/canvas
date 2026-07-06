/**
 * CodeLink: a canvas object's link to a file in the codebase — either a doc
 * page (kind "doc") or a source location (kind "source": repo-relative path
 * plus optional symbol/line/section). It is the type behind
 * `InteractiveCanvasLink.target` (see ./schema/links).
 *
 * This package only STORES and displays these links; resolution, navigation,
 * and backlink indexing happen in the Spectre host (docs-framework), whose
 * docs-model keeps its own copy of this shape — originally named `SpectreRef`
 * there, and renamed to `CodeLink` locally when this package was extracted to
 * stand alone (see the repo-root PROVENANCE.md for the exact source). The
 * `validateSpectreRef` runtime validator stays host-side (docs-model owns
 * validating doc-authored refs). Keep this shape in sync by hand with the
 * host app's copy if either evolves.
 */
export type CodeLink = {
  kind: "doc" | "source";
  /** Repo-relative path (D27) — no registry/absolute paths in v1. */
  path: string;
  symbol?: string;
  line?: number;
  section?: string;
  label?: string;
};
