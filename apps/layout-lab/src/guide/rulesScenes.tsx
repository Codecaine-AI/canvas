import type { ReactNode } from "react";

/**
 * Hand-built mini-scenes for the rulebook cards. Geometry uses REAL rule
 * constants (16px grid, 32/64/96 ladder, 48 padding, 64 header, 0.72/1/1.35
 * size scale) drawn 1:1 in each scene's own viewBox, so the labeled numbers
 * are the numbers.
 */

export interface RuleScene {
  viewBox: string;
  content: ReactNode;
}

export interface RuleCard {
  id: string;
  name: string;
  statement: string;
  status: "confirmed" | "possible";
  /** How the solver enforces it, or how a lint would score it. */
  measure?: string;
  /** Corpus evidence, or where the rule would have mattered. */
  evidence?: string;
  before?: RuleScene;
  after: RuleScene;
  afterOnlyNote?: string;
}

export function Measure({ x, y, width, label, vertical = false, height = 0 }: {
  x: number; y: number; width?: number; height?: number; label: string; vertical?: boolean;
}) {
  if (vertical) {
    return (
      <g className="gd-measure">
        <line x1={x} y1={y} x2={x} y2={y + (height ?? 0)} />
        <text x={x + 6} y={y + (height ?? 0) / 2 + 4}>{label}</text>
      </g>
    );
  }
  return (
    <g className="gd-measure">
      <line x1={x} y1={y} x2={x + (width ?? 0)} y2={y} />
      <text x={x + (width ?? 0) / 2} y={y - 6} textAnchor="middle">{label}</text>
    </g>
  );
}

export function Box({ x, y, w, h, cls = "gd-box", rx = 8, label }: {
  x: number; y: number; w: number; h: number; cls?: string; rx?: number; label?: string;
}) {
  return (
    <g>
      <rect className={cls} x={x} y={y} width={w} height={h} rx={rx} />
      {label ? (
        <text className="gd-boxlabel" x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle">{label}</text>
      ) : null}
    </g>
  );
}

export function Chip({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g>
      <rect className="gd-chip" x={x} y={y} width={text.length * 7.4 + 16} height={22} rx={5} />
      <text className="gd-chiplabel" x={x + 8} y={y + 15}>{text}</text>
    </g>
  );
}

export const DOTS = (
  <>
    <defs>
      <pattern id="gd-dots" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="1" className="gd-dot" />
      </pattern>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" fill="url(#gd-dots)" />
  </>
);

export const RULE_CARDS: readonly RuleCard[] = [
  {
    id: "R1",
    status: "confirmed",
    evidence: "88.3% of objects across the reference boards sit exactly on the grid; the misses are hand-drag noise (e.g. a v2-flow sticky at x=810.4).",
    name: "The 16px grid",
    statement: "Everything snaps to a 16px grid — offsets finer than 16px are authoring noise, never intent.",
    before: {
      viewBox: "0 0 480 240",
      content: (
        <>
          {DOTS}
          <Box x={37} y={29} w={176} h={64} cls="gd-box gd-off" label="x 37 · y 29" />
          <Box x={229} y={131} w={176} h={64} cls="gd-box gd-off" label="x 229 · y 131" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 480 240",
      content: (
        <>
          {DOTS}
          <Box x={32} y={32} w={176} h={64} label="x 32 · y 32" />
          <Box x={224} y={128} w={176} h={64} label="x 224 · y 128" />
        </>
      ),
    },
  },
  {
    id: "R2",
    status: "confirmed",
    evidence: "gc pill pitch 96 = 64+32; gc db row 352 = 288+64; agent-flows chain 176 = 80+96.",
    name: "The spacing ladder",
    statement: "Sibling gaps come from a closed ladder — 0, 32, 64, 96 — and unrelated clusters sit at least 128 apart.",
    before: {
      viewBox: "0 0 640 200",
      content: (
        <>
          <Box x={32} y={64} w={96} h={64} cls="gd-box gd-off" />
          <Box x={151} y={64} w={96} h={64} cls="gd-box gd-off" />
          <Box x={298} y={64} w={96} h={64} cls="gd-box gd-off" />
          <Box x={472} y={64} w={96} h={64} cls="gd-box gd-off" />
          <Measure x={128} y={148} width={23} label="23?" />
          <Measure x={247} y={148} width={51} label="51?" />
          <Measure x={394} y={148} width={78} label="78?" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 200",
      content: (
        <>
          <Box x={32} y={64} w={96} h={64} />
          <Box x={160} y={64} w={96} h={64} />
          <Box x={320} y={64} w={96} h={64} />
          <Box x={512} y={64} w={96} h={64} />
          <Measure x={128} y={148} width={32} label="32" />
          <Measure x={256} y={148} width={64} label="64" />
          <Measure x={416} y={148} width={96} label="96" />
        </>
      ),
    },
  },
  {
    id: "R3",
    status: "confirmed",
    evidence: "gc section-config top inset 64 / side 48; ink and intent-2 sections match.",
    name: "Section padding and headers",
    statement: "A section frames itself automatically — a 64px band at the top for its label, 48px of padding around the content — and it shrinks to hug whatever is inside.",
    before: {
      viewBox: "0 0 560 320",
      content: (
        <>
          <Box x={16} y={16} w={528} h={288} cls="gd-sec gd-off" rx={12} />
          <Chip x={26} y={26} text="bloated" />
          <Box x={32} y={56} w={176} h={64} />
          <Box x={32} y={136} w={176} h={64} />
          <text className="gd-note" x={360} y={170} textAnchor="middle">dead space</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 560 320",
      content: (
        <>
          <Box x={16} y={16} w={272} h={272} cls="gd-sec" rx={12} />
          <Chip x={26} y={26} text="hugging" />
          <Box x={64} y={80} w={176} h={64} />
          <Box x={64} y={176} w={176} h={64} />
          <Measure x={296} y={16} height={64} label="64 header" vertical />
          <Measure x={296} y={176} height={64} label="48 pad" vertical />
          <Measure x={16} y={300} width={48} label="48" />
        </>
      ),
    },
  },
  {
    id: "R4",
    status: "confirmed",
    evidence: "ink's 3x4 flush table was 25% of its DSL-v1 adjacency loss; gc pills 5x1 g32.",
    name: "grid — repeated cells",
    statement: "Four or more same-size items become a grid: pixel-identical cells, one shared gap, row and column identity preserved — and that skeleton anchors everything placed later.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={64} y={24} w={152} h={76} cls="gd-box gd-off" />
          <Box x={236} y={38} w={166} h={72} cls="gd-box gd-off" />
          <Box x={428} y={20} w={148} h={84} cls="gd-box gd-off" />
          <Box x={72} y={128} w={162} h={70} cls="gd-box gd-off" />
          <Box x={252} y={140} w={150} h={80} cls="gd-box gd-off" />
          <Box x={420} y={124} w={158} h={74} cls="gd-box gd-off" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={80} y={32} w={160} h={80} />
          <Box x={240} y={32} w={160} h={80} />
          <Box x={400} y={32} w={160} h={80} />
          <Box x={80} y={112} w={160} h={80} />
          <Box x={240} y={112} w={160} h={80} />
          <Box x={400} y={112} w={160} h={80} />
          <text className="gd-note" x={320} y={222} textAnchor="middle">2x3 · identical 160x80 · flush</text>
        </>
      ),
    },
  },
  {
    id: "R5",
    status: "confirmed",
    evidence: "gc hero row spans two sections at y-center 392; intent-2 has three board-wide tiers.",
    name: "tier — one shared centerline",
    statement: "Peers can be pinned to one shared centerline — even across section boundaries, which nested containers alone can never say.",
    before: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <Box x={16} y={16} w={288} h={188} cls="gd-sec" rx={12} />
          <Box x={336} y={16} w={288} h={188} cls="gd-sec" rx={12} />
          <Box x={48} y={48} w={144} h={56} cls="gd-box gd-off" label="a" />
          <Box x={48} y={132} w={144} h={56} label="b" />
          <Box x={392} y={92} w={144} h={56} cls="gd-box gd-off" label="c" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <Box x={16} y={16} w={288} h={188} cls="gd-sec" rx={12} />
          <Box x={336} y={16} w={288} h={188} cls="gd-sec" rx={12} />
          <line className="gd-register" x1={24} y1={76} x2={616} y2={76} />
          <Box x={48} y={48} w={144} h={56} label="a" />
          <Box x={48} y={132} w={144} h={56} label="b" />
          <Box x={392} y={48} w={144} h={56} label="c" />
          <text className="gd-note" x={560} y={70} textAnchor="end">tier y · ±4px</text>
        </>
      ),
    },
  },
  {
    id: "R6",
    status: "confirmed",
    evidence: "intent-2's layer tree: hub at exact child midpoint, 64px clearance, nesting 3 deep.",
    name: "fan — hub over children",
    statement: "A fan centers the hub over its children; the children sit on one shared centerline, evenly spaced, never closer than 64px to the hub.",
    before: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={272} y={32} w={96} h={56} cls="gd-box gd-off" label="hub" />
          <path className="gd-edge" d="M 300 88 L 144 140" />
          <path className="gd-edge" d="M 320 88 L 320 168" />
          <path className="gd-edge" d="M 340 88 L 500 128" />
          <Box x={80} y={140} w={128} h={48} cls="gd-box gd-off" />
          <Box x={256} y={168} w={128} h={48} cls="gd-box gd-off" />
          <Box x={436} y={128} w={128} h={48} cls="gd-box gd-off" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <line className="gd-register" x1={64} y1={160} x2={576} y2={160} />
          <Box x={272} y={32} w={96} h={56} label="hub" />
          <path className="gd-edge" d="M 320 88 L 320 112 L 160 112 L 160 160" />
          <path className="gd-edge" d="M 320 88 L 320 160" />
          <path className="gd-edge" d="M 320 88 L 320 112 L 480 112 L 480 160" />
          <Box x={96} y={160} w={128} h={48} />
          <Box x={256} y={160} w={128} h={48} />
          <Box x={416} y={160} w={128} h={48} />
          <Measure x={584} y={88} height={72} label="≥64" vertical />
          <Measure x={224} y={236} width={32} label="even pitch" />
        </>
      ),
    },
  },
  {
    id: "R7",
    status: "confirmed",
    evidence: "DSL v1 stretched gc's 560px config rail to 1720 — 52% of that board's relation loss.",
    name: "lane — rails never stretch",
    statement: "A pinned lane keeps its natural content size and sits in a corner of its band — side rails are never stretched to fill empty space.",
    before: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={160} h={228} cls="gd-sec gd-off" rx={12} />
          <Chip x={26} y={26} text="rail" />
          <Box x={32} y={60} w={128} h={32} rx={16} />
          <Box x={32} y={104} w={128} h={32} rx={16} />
          <text className="gd-note" x={96} y={200} textAnchor="middle">stretched</text>
          <Box x={208} y={16} w={416} h={228} cls="gd-sec" rx={12} />
          <Chip x={218} y={26} text="stage" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <rect className="gd-band" x={16} y={16} width={160} height={228} rx={12} />
          <Box x={16} y={16} w={160} h={136} cls="gd-sec" rx={12} />
          <Chip x={26} y={26} text="rail" />
          <Box x={32} y={60} w={128} h={32} rx={16} />
          <Box x={32} y={104} w={128} h={32} rx={16} />
          <text className="gd-note" x={96} y={230} textAnchor="middle">@NW · natural size</text>
          <Box x={208} y={16} w={416} h={228} cls="gd-sec" rx={12} />
          <Chip x={218} y={26} text="stage" />
        </>
      ),
    },
  },
  {
    id: "R8",
    status: "confirmed",
    evidence: "Scale 0.72 / 1 / 1.35 from canvas drop defaults; sticky override 384x288.",
    name: "Size semantics",
    statement: "Three sizes only — S small chips (0.72x), M standard members (1x), L terminals and emphasis (1.35x). Cells of one grid always share a size.",
    after: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <Box x={48} y={104} w={127} h={46} rx={23} label="S" />
          <Box x={240} y={86} w={176} h={64} label="M" />
          <Box x={472} y={64} w={144} h={86} label="L" />
          <text className="gd-note" x={111} y={180} textAnchor="middle">chips · pills</text>
          <text className="gd-note" x={328} y={180} textAnchor="middle">standard members</text>
          <text className="gd-note" x={544} y={180} textAnchor="middle">terminals · emphasis</text>
        </>
      ),
    },
    afterOnlyNote: "No before/after here — the rule is the closed set itself.",
  },
  {
    id: "R9",
    status: "confirmed",
    evidence: "ink's correction loops exit W and return at a 144 offset; gc regression loop uses 128.",
    name: "Feedback corridors",
    statement: "Feedback edges exit toward their return corridor and detour on ladder offsets (48/80/96/128/144/192) — never through a box.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={88} w={128} h={64} label="a" />
          <Box x={256} y={88} w={128} h={64} label="b" />
          <Box x={464} y={88} w={128} h={64} label="c" />
          <path className="gd-edge" d="M 176 120 L 256 120" />
          <path className="gd-edge" d="M 384 120 L 464 120" />
          <path className="gd-edge gd-off-edge" d="M 464 112 L 176 112" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={88} w={128} h={64} label="a" />
          <Box x={256} y={88} w={128} h={64} label="b" />
          <Box x={464} y={88} w={128} h={64} label="c" />
          <path className="gd-edge" d="M 176 120 L 256 120" />
          <path className="gd-edge" d="M 384 120 L 464 120" />
          <path className="gd-edge gd-feedback" d="M 528 88 L 528 40 L 112 40 L 112 88" />
          <Measure x={536} y={40} height={48} label="48" vertical />
        </>
      ),
    },
  },
  {
    id: "R10",
    status: "confirmed",
    evidence: "The gc hero-row interleave is the dominant residual loss (90.4% vs 93% target).",
    name: "What the language refuses to say",
    statement: "Absolute coordinates are never spelled. The one known blind spot: interleaving finer than the ladder (a row threading between another column's rows) — reserved for a future tier offset, not raw numbers.",
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={48} y={16} w={192} h={64} rx={16} />
          <Box x={48} y={176} w={192} h={64} rx={16} />
          <Box x={304} y={96} w={144} h={64} label="hero" />
          <Box x={480} y={96} w={144} h={64} label="row" />
          <line className="gd-register gd-off-edge" x1={32} y1={128} x2={608} y2={128} />
          <text className="gd-note" x={144} y={140} textAnchor="middle">between — by 16–48px</text>
        </>
      ),
    },
    afterOnlyNote: "The honest gap: this interleave is the dominant residual loss on the decomp-harness board.",
  },
];
