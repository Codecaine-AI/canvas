/**
 * "@agent-kernel/viewer-ui/styles" maps to a plain .css file via the package
 * exports; the `*.css` declaration below matches specifiers, not resolved
 * files, so the subpath needs its own declaration for tsc.
 */
declare module "@agent-kernel/viewer-ui/styles";

/**
 * Plain css imports (index.css, agent-theme.css). The harness package's
 * tsconfig doesn't load vite/client (its ImportMeta.env collides with
 * @types/bun's), so the viewer declares the one ambient module it needs.
 */
declare module "*.css";
