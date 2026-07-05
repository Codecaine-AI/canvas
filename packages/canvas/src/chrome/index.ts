/**
 * Barrel for the FigJam-parity chrome components (dock, context toolbar,
 * shapes panel, color palette, zoom controls). See ./README.md for the
 * full inventory and wiring notes. Currently these are consumed internally
 * by InteractiveCanvasEditor.tsx via direct file imports; this barrel exists
 * for external consumers (e.g. a host app building its own canvas chrome
 * layout) that want the `@codecaine-ai/canvas/chrome` subpath export.
 */
export * from "./ChromeTooltip";
export * from "./ColorPalettePopover";
export * from "./ContextToolbar";
export * from "./context-toolbar-position";
export * from "./FigJamDock";
export * from "./ShapeSearchPopover";
export * from "./ShapesPanel";
export * from "./ZoomControls";
export * from "./shape-catalog";
