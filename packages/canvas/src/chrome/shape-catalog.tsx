"use client";

/**
 * shape-catalog.tsx — data for ShapeSearchPopover + ShapesPanel.
 *
 * NOTE ON FILE EXTENSION: the task brief names this file `shape-catalog.ts`,
 * but its entries carry inline JSX icon components, which requires the
 * `.tsx` extension to compile under this repo's TypeScript/JSX settings —
 * so this is `shape-catalog.tsx`. It remains a pure-data module (no
 * component state, no editor wiring); only the icon factory below returns
 * JSX.
 *
 * Ground truth: board-design-reference/analysis/figjam-chrome-catalog.md
 * section 4 (Panel A: compact tech-icon search popover; Panel B: full
 * left-docked Shapes sidebar with Recents/Connections/Basic/Flowchart/
 * Advanced sections + "Other libraries" footer).
 *
 * `objectType` maps each catalog entry to our schema's
 * InteractiveCanvasObjectType (imported read-only from ../schema — this file
 * makes ZERO edits to schema.ts). Per the task brief, the exact NEW W2-model
 * type names this catalog must use are: "section", "pill", "arrow-shape",
 * "predefined-process", "code-block", "chip-icon" — coordinated with the
 * parallel schema worker's naming. Entries whose objectType isn't part of
 * the CURRENTLY EXISTING schema.ts vocabulary (checked against schema.ts at
 * the time this file was written) are marked `disabled: true` with a
 * "coming soon" tooltip — this file is pure data, so it stays correct
 * whether the parallel worker lands those types before or after W2-chrome.
 *
 * Existing schema.ts vocabulary at time of writing (read-only import):
 *   container, process, decision, text, sticky, source-node,
 *   annotation-marker, document, person, database, chat.
 * New W2-model vocabulary expected (per parity-plan.md + task brief):
 *   section, pill, arrow-shape, predefined-process, code-block, chip-icon.
 */

export type ShapeCatalogObjectType =
  // existing schema.ts types (safe to use today)
  | "container"
  | "process"
  | "decision"
  | "text"
  | "sticky"
  | "document"
  | "person"
  | "database"
  | "chat"
  // NEW W2-model types (render disabled until schema.ts lands them)
  | "section"
  | "pill"
  | "arrow-shape"
  | "predefined-process"
  | "code-block"
  | "chip-icon";

/**
 * Object types that exist in schema.ts as of this file's writing. Entries
 * mapping to any type NOT in this set render disabled ("coming soon") in
 * both ShapeSearchPopover and ShapesPanel — safe regardless of landing order
 * relative to the parallel schema worker.
 */
export const EXISTING_SCHEMA_OBJECT_TYPES: ReadonlySet<ShapeCatalogObjectType> = new Set([
  "container",
  "process",
  "decision",
  "text",
  "sticky",
  "document",
  "person",
  "database",
  "chat",
  // W3 — the W2-model schema worker landed these six types in schema.ts
  // (section/pill/arrow-shape/predefined-process/code-block/chip-icon are
  // now part of InteractiveCanvasObjectType), so every catalog entry
  // targeting them lights up instead of rendering "coming soon".
  "section",
  "pill",
  "arrow-shape",
  "predefined-process",
  "code-block",
  "chip-icon",
]);

export type ShapeCatalogEntry = {
  id: string;
  label: string;
  objectType: ShapeCatalogObjectType;
  /** Inline SVG icon, 20x20 viewBox, monochrome (currentColor). */
  icon: (props: { className?: string }) => React.JSX.Element;
};

export type ShapeCatalogCategory = {
  id: string;
  label: string;
  entries: ShapeCatalogEntry[];
};

// ---------------------------------------------------------------------------
// Icon glyphs (compact, generic line-art per the catalog's description of
// Panel A's icon set: "chip/CPU, database/stack, monitor, envelope,
// document, code-brackets, lightning bolt, ... — not basic geometric shapes
// and not emoji" for Panel A; Panel B's Basic/Flowchart sections ARE basic
// geometric shapes, per its own separate description.)
// ---------------------------------------------------------------------------

function svgIcon(children: string) {
  return function Icon({ className }: { className?: string }) {
    return (
      // eslint-disable-next-line react/no-danger -- static trusted glyph strings only, no user input
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: children }} />
    );
  };
}

const S = 1.4;

export const RectangleIcon = svgIcon(`<rect x="4" y="6" width="12" height="8" rx="1" stroke="currentColor" stroke-width="${S}" />`);
export const RoundedRectIcon = svgIcon(`<rect x="4" y="6" width="12" height="8" rx="3" stroke="currentColor" stroke-width="${S}" />`);
export const DiamondIcon = svgIcon(`<path d="M10 4 16 10 10 16 4 10Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const TriangleIcon = svgIcon(`<path d="M10 4 16 15 4 15Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const InvertedTriangleIcon = svgIcon(`<path d="M4 5 16 5 10 16Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const PentagonIcon = svgIcon(`<path d="M10 3.5 16.5 8.2 14 15.5 6 15.5 3.5 8.2Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const HexagonIcon = svgIcon(`<path d="M6 4h8l4 6-4 6H6l-4-6Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const PlusShapeIcon = svgIcon(`<path d="M8 4h4v4h4v4h-4v4H8v-4H4V8h4Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const ArrowRightIcon = svgIcon(`<path d="M4 10h9M9 6l4 4-4 4" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" />`);
export const ArrowLeftIcon = svgIcon(`<path d="M16 10H7M11 6l-4 4 4 4" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" />`);
export const ParallelogramIcon = svgIcon(`<path d="M6.5 6h9L13 14H4Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const StarIcon = svgIcon(`<path d="M10 3.5 11.8 7.6 16 8.1 12.9 11 13.8 15.3 10 13 6.2 15.3 7.1 11 4 8.1 8.2 7.6Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const SpeechBubbleIcon = svgIcon(`<path d="M3.5 4.5h13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H9l-3 3v-3H3.5a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const CommentBubbleIcon = svgIcon(`<circle cx="10" cy="9.5" r="6" stroke="currentColor" stroke-width="${S}" /><path d="M8 14.5 6.5 17 9.5 15" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const TerminalIcon = svgIcon(`<rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="${S}" /><path d="M6 8l2.5 2L6 12M10.5 12.5h3.5" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" />`);
export const DocumentIcon = svgIcon(`<path d="M6 3.5h6l3 3v10H6Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const SplitPanelIcon = svgIcon(`<rect x="4" y="5" width="12" height="10" rx="1" stroke="currentColor" stroke-width="${S}" /><path d="M10 5v10" stroke="currentColor" stroke-width="${S}" />`);
export const CylinderIcon = svgIcon(`<ellipse cx="10" cy="5.5" rx="6" ry="2" stroke="currentColor" stroke-width="${S}" /><path d="M4 5.5v9c0 1.1 2.7 2 6 2s6-.9 6-2v-9" stroke="currentColor" stroke-width="${S}" />`);
export const TrapezoidIcon = svgIcon(`<path d="M6 6h8l3 8H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const CloudIcon = svgIcon(`<path d="M6 14a3 3 0 0 1-.5-5.96A4 4 0 0 1 13.4 6.6 3.5 3.5 0 0 1 14.5 14Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const ShieldIcon = svgIcon(`<path d="M10 3.2 16 5.5v4.7c0 3.6-2.5 5.9-6 7.1-3.5-1.2-6-3.5-6-7.1V5.5Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const FolderIcon = svgIcon(`<path d="M3 6h5l1.5 2H17v8H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const CalloutIcon = svgIcon(`<rect x="3.5" y="4.5" width="13" height="8" rx="1" stroke="currentColor" stroke-width="${S}" /><path d="M7 12.5 6 16l3-3.5" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const CrosshairIcon = svgIcon(`<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="${S}" /><path d="M10 3v3M10 14v3M3 10h3M14 10h3" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const NoEntryIcon = svgIcon(`<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="${S}" /><path d="M6.5 10h7" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const OvalIcon = svgIcon(`<ellipse cx="10" cy="10" rx="7" ry="5" stroke="currentColor" stroke-width="${S}" />`);
export const ChartIcon = svgIcon(`<path d="M3.5 15.5V4M3.5 15.5h13" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" /><path d="M6 13l2.5-4L11 11l3.5-6" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`);
export const ArchiveIcon = svgIcon(`<rect x="3" y="4" width="14" height="4" rx="1" stroke="currentColor" stroke-width="${S}" /><rect x="4" y="8" width="12" height="8" rx="1" stroke="currentColor" stroke-width="${S}" /><path d="M8.5 11.5h3" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const KeyIcon = svgIcon(`<circle cx="7" cy="10" r="3.2" stroke="currentColor" stroke-width="${S}" /><path d="M9.8 10h6.7M14 10v3M16.5 10v2" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const GearIcon = svgIcon(`<circle cx="10" cy="10" r="2.6" stroke="currentColor" stroke-width="${S}" /><path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.4 5.4l1.4 1.4M13.2 13.2l1.4 1.4M5.4 14.6l1.4-1.4M13.2 6.8l1.4-1.4" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const DatabaseStackIcon = svgIcon(`<ellipse cx="10" cy="5" rx="6" ry="2" stroke="currentColor" stroke-width="${S}" /><path d="M4 5v4c0 1.1 2.7 2 6 2s6-.9 6-2V5M4 9v4c0 1.1 2.7 2 6 2s6-.9 6-2V9" stroke="currentColor" stroke-width="${S}" />`);
export const MonitorIcon = svgIcon(`<rect x="3" y="4.5" width="14" height="9" rx="1" stroke="currentColor" stroke-width="${S}" /><path d="M7.5 16.5h5" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const EnvelopeIcon = svgIcon(`<rect x="3" y="5" width="14" height="10" rx="1" stroke="currentColor" stroke-width="${S}" /><path d="M3.5 5.7 10 10.5l6.5-4.8" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const CodeBracketsIcon = svgIcon(`<path d="M7.5 5 4 10l3.5 5M12.5 5 16 10l-3.5 5" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" />`);
export const LightningIcon = svgIcon(`<path d="M11 3 5 11h4l-1 6 6-9h-4Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const ElbowConnectorIcon = svgIcon(`<path d="M4 5h6v10h6" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" fill="none" />`);
export const CurvedConnectorIcon = svgIcon(`<path d="M4 5c0 6 8 4 12 10" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" fill="none" />`);
export const DiagonalConnectorIcon = svgIcon(`<path d="M4 16 16 4" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const BranchConnectorIcon = svgIcon(`<path d="M4 5h4v4M8 9v6M8 9h4l4-4" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`);
export const PillIcon = svgIcon(`<rect x="3" y="7" width="14" height="6" rx="3" stroke="currentColor" stroke-width="${S}" />`);
export const ArrowShapeIcon = svgIcon(`<path d="M3 8h7V6l7 4-7 4v-2H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const PredefinedProcessIcon = svgIcon(`<rect x="3.5" y="6" width="13" height="8" rx="1" stroke="currentColor" stroke-width="${S}" /><path d="M6.5 6v8M13.5 6v8" stroke="currentColor" stroke-width="${S}" />`);
export const CodeBlockIcon = svgIcon(`<rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="${S}" /><path d="M7 8l-2 2 2 2M13 8l2 2-2 2" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" stroke-linejoin="round" />`);
export const ChipIconGlyph = svgIcon(`<rect x="6" y="6" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="${S}" /><rect x="8" y="8" width="4" height="4" stroke="currentColor" stroke-width="${S}" /><path d="M6 4v2M10 4v2M14 4v2M6 14v2M10 14v2M14 14v2M4 6h2M4 10h2M4 14h2M14 6h2M14 10h2M14 14h2" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const PersonIcon = svgIcon(`<circle cx="10" cy="6.5" r="2.8" stroke="currentColor" stroke-width="${S}" /><path d="M4.5 16c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`);
export const SectionIcon = svgIcon(`<rect x="3" y="5.5" width="14" height="10.5" rx="1.5" stroke="currentColor" stroke-width="${S}" /><rect x="4.5" y="3.5" width="6" height="3" rx="1.5" stroke="currentColor" stroke-width="${S}" fill="none" />`);

// ---------------------------------------------------------------------------
// Categories (Panel B: full Shapes sidebar)
// ---------------------------------------------------------------------------

export const SHAPE_CATALOG: ShapeCatalogCategory[] = [
  {
    id: "recents",
    label: "Recents",
    entries: [
      { id: "recent-document", label: "Document", objectType: "document", icon: DocumentIcon },
      { id: "recent-rounded-rect", label: "Rounded rectangle", objectType: "container", icon: RoundedRectIcon },
      { id: "recent-diamond", label: "Diamond", objectType: "decision", icon: DiamondIcon },
      { id: "recent-split-panel", label: "Split panel", objectType: "section", icon: SplitPanelIcon },
      { id: "recent-rectangle", label: "Rectangle", objectType: "container", icon: RectangleIcon },
      { id: "recent-speech-bubble", label: "Speech bubble", objectType: "chat", icon: SpeechBubbleIcon },
      { id: "recent-comment", label: "Comment bubble", objectType: "text", icon: CommentBubbleIcon },
      { id: "recent-terminal", label: "Terminal", objectType: "code-block", icon: TerminalIcon },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    entries: [
      { id: "conn-elbow", label: "Elbow connector", objectType: "container", icon: ElbowConnectorIcon },
      { id: "conn-curved", label: "Curved connector", objectType: "container", icon: CurvedConnectorIcon },
      { id: "conn-diagonal", label: "Straight diagonal connector", objectType: "container", icon: DiagonalConnectorIcon },
      { id: "conn-branch", label: "Branching connector", objectType: "container", icon: BranchConnectorIcon },
    ],
  },
  {
    id: "basic",
    label: "Basic",
    entries: [
      { id: "basic-square", label: "Square", objectType: "container", icon: RectangleIcon },
      { id: "basic-circle", label: "Circle", objectType: "container", icon: OvalIcon },
      { id: "basic-diamond", label: "Diamond", objectType: "decision", icon: DiamondIcon },
      { id: "basic-triangle", label: "Triangle", objectType: "container", icon: TriangleIcon },
      { id: "basic-inverted-triangle", label: "Inverted triangle", objectType: "container", icon: InvertedTriangleIcon },
      { id: "basic-pentagon", label: "Pentagon", objectType: "container", icon: PentagonIcon },
      { id: "basic-hexagon", label: "Hexagon", objectType: "container", icon: HexagonIcon },
      { id: "basic-plus", label: "Plus", objectType: "container", icon: PlusShapeIcon },
      { id: "basic-arrow-left", label: "Left arrow", objectType: "arrow-shape", icon: ArrowLeftIcon },
      { id: "basic-arrow-right", label: "Right arrow", objectType: "arrow-shape", icon: ArrowRightIcon },
      { id: "basic-parallelogram", label: "Parallelogram", objectType: "container", icon: ParallelogramIcon },
      { id: "basic-star", label: "Star", objectType: "container", icon: StarIcon },
      { id: "basic-speech-bubble", label: "Speech bubble", objectType: "chat", icon: SpeechBubbleIcon },
    ],
  },
  {
    id: "flowchart",
    label: "Flowchart",
    entries: [
      { id: "flow-parallelogram", label: "Parallelogram", objectType: "container", icon: ParallelogramIcon },
      { id: "flow-trapezoid", label: "Trapezoid", objectType: "container", icon: TrapezoidIcon },
      { id: "flow-cylinder", label: "Cylinder / database", objectType: "database", icon: CylinderIcon },
      { id: "flow-document-fold", label: "Document", objectType: "document", icon: DocumentIcon },
      { id: "flow-folder", label: "Folder", objectType: "container", icon: FolderIcon },
      { id: "flow-callout", label: "Callout", objectType: "container", icon: CalloutIcon },
      { id: "flow-cloud", label: "Cloud", objectType: "container", icon: CloudIcon },
      { id: "flow-shield", label: "Shield", objectType: "container", icon: ShieldIcon },
      { id: "flow-pill", label: "Pill / stadium", objectType: "pill", icon: PillIcon },
      { id: "flow-oval", label: "Rounded oval", objectType: "container", icon: OvalIcon },
      { id: "flow-split-panel", label: "Split panel box", objectType: "section", icon: SplitPanelIcon },
      { id: "flow-crosshair", label: "Crosshair / target", objectType: "container", icon: CrosshairIcon },
      { id: "flow-no-entry", label: "No entry", objectType: "container", icon: NoEntryIcon },
      { id: "flow-predefined-process", label: "Predefined process", objectType: "predefined-process", icon: PredefinedProcessIcon },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    entries: [
      { id: "adv-chart", label: "Sparkline / chart", objectType: "container", icon: ChartIcon },
      { id: "adv-archive", label: "Archive box", objectType: "container", icon: ArchiveIcon },
      { id: "adv-key", label: "Key", objectType: "container", icon: KeyIcon },
      { id: "adv-chat-cloud", label: "Chat / cloud", objectType: "chat", icon: CloudIcon },
      { id: "adv-gear", label: "Gear", objectType: "container", icon: GearIcon },
      { id: "adv-database-stack", label: "Database stack", objectType: "database", icon: DatabaseStackIcon },
      { id: "adv-monitor", label: "Monitor", objectType: "container", icon: MonitorIcon },
      { id: "adv-envelope", label: "Envelope", objectType: "container", icon: EnvelopeIcon },
      { id: "adv-document", label: "Document", objectType: "document", icon: DocumentIcon },
      { id: "adv-code-brackets", label: "Code brackets", objectType: "code-block", icon: CodeBracketsIcon },
      { id: "adv-lightning", label: "Lightning bolt", objectType: "container", icon: LightningIcon },
      { id: "adv-chip-icon", label: "Chip / CPU icon", objectType: "chip-icon", icon: ChipIconGlyph },
    ],
  },
];

/** Flattened list of every entry across all categories, for search. */
export const SHAPE_CATALOG_ENTRIES: ShapeCatalogEntry[] = SHAPE_CATALOG.flatMap((c) => c.entries);

/** Panel A's compact "Search for a shape" icon set (technical/object glyphs, NOT basic geometric shapes — per the catalog's explicit distinction between the two panels). */
export const SHAPE_SEARCH_ENTRIES: ShapeCatalogEntry[] = [
  { id: "search-chip", label: "Chip / CPU", objectType: "chip-icon", icon: ChipIconGlyph },
  { id: "search-database", label: "Database / stack", objectType: "database", icon: DatabaseStackIcon },
  { id: "search-monitor", label: "Monitor", objectType: "container", icon: MonitorIcon },
  { id: "search-envelope", label: "Envelope", objectType: "container", icon: EnvelopeIcon },
  { id: "search-document", label: "Document", objectType: "document", icon: DocumentIcon },
  { id: "search-code-brackets", label: "Code brackets", objectType: "code-block", icon: CodeBracketsIcon },
  { id: "search-lightning", label: "Lightning bolt", objectType: "container", icon: LightningIcon },
  { id: "search-terminal", label: "Terminal", objectType: "code-block", icon: TerminalIcon },
  { id: "search-person", label: "Person", objectType: "person", icon: PersonIcon },
  { id: "search-globe", label: "Globe", objectType: "container", icon: CloudIcon },
];

/** "Other libraries" footer rows (AWS/Azure/Cisco) — static, disabled, visual parity only. */
export const OTHER_LIBRARIES = [
  { id: "aws", label: "AWS", shapeCount: 805 },
  { id: "azure", label: "Azure", shapeCount: 637 },
  { id: "cisco", label: "Cisco", shapeCount: 292 },
] as const;

export function isShapeEntryEnabled(entry: ShapeCatalogEntry): boolean {
  return EXISTING_SCHEMA_OBJECT_TYPES.has(entry.objectType);
}
