import { Box, Chip, Measure, type RuleCard } from "./rulesScenes";

/**
 * Candidate rules R11-R22 — proposed with maximum aesthetics in mind, not yet
 * mined against the corpus. Status "possible": built out for review, then
 * either confirmed (with measured constants) or rejected.
 */

export const CANDIDATE_RULE_CARDS: readonly RuleCard[] = [
  {
    id: "R11",
    status: "possible",
    name: "Optical correction",
    statement:
      "Geometric centering is not optical centering: pointed shapes get a 4-8px lift, arrowheads stop 2px short of borders, corner radius scales with box size.",
    measure: "Solver, constructive: per-shape optical offsets; radius = clamp(8, h/8, 16); arrow inset 2px.",
    evidence: "The largest share of why generated output feels subtly off next to hand work.",
    before: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <line className="gd-register" x1={32} y1={110} x2={608} y2={110} />
          <Box x={48} y={78} w={160} h={64} label="step" />
          <path className="gd-edge" d="M 208 110 L 320 110" />
          <path className="gd-diamond gd-off-shape" d="M 368 72 L 416 110 L 368 148 L 320 110 Z" />
          <text className="gd-note" x={368} y={186} textAnchor="middle">on the line, reads low</text>
          <text className="gd-note" x={252} y={98} textAnchor="middle">touching</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <line className="gd-register" x1={32} y1={110} x2={608} y2={110} />
          <Box x={48} y={78} w={160} h={64} label="step" />
          <path className="gd-edge" d="M 208 110 L 316 110" />
          <path className="gd-diamond" d="M 368 66 L 416 104 L 368 142 L 320 104 Z" />
          <g className="gd-measure">
            <line x1={428} y1={104} x2={428} y2={110} />
            <text x={436} y={98}>+6 lift</text>
          </g>
          <text className="gd-note" x={264} y={98} textAnchor="middle">2px short</text>
        </>
      ),
    },
  },
  {
    id: "R12",
    status: "possible",
    name: "Label lanes",
    statement:
      "Every edge label owns a clearance halo — nothing within 8px, never on a crossing, seated at a segment midpoint on the corridor axis.",
    measure: "Lint: label bbox + 8px halo intersects no box, edge, or other label; label midpoint on its segment.",
    evidence: "The gc hero-row respacing was this rule discovered by hand — the 96 gap exists for the labels.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={88} w={144} h={64} label="a" />
          <Box x={448} y={88} w={144} h={64} label="b" />
          <path className="gd-edge" d="M 192 120 L 448 120" />
          <path className="gd-edge" d="M 400 40 L 400 200" />
          <rect className="gd-label gd-off" x={382} y={106} width={72} height={26} rx={5} />
          <text className="gd-boxlabel" x={418} y={123} textAnchor="middle">assess</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={88} w={144} h={64} label="a" />
          <Box x={448} y={88} w={144} h={64} label="b" />
          <path className="gd-edge" d="M 192 120 L 448 120" />
          <path className="gd-edge" d="M 256 40 L 256 200" />
          <rect className="gd-halo" x={296} y={95} width={104} height={50} rx={9} />
          <rect className="gd-label" x={306} y={107} width={84} height={26} rx={5} />
          <text className="gd-boxlabel" x={348} y={124} textAnchor="middle">assess</text>
          <text className="gd-note" x={348} y={168} textAnchor="middle">8px halo · mid-segment</text>
        </>
      ),
    },
  },
  {
    id: "R13",
    status: "possible",
    name: "Hierarchy contrast",
    statement:
      "Adjacent nesting depths must differ by at least one clear cue — tint step, border weight, or padding tier — never identical styling at two depths.",
    measure: "Lint: for every parent/child section pair, fill delta or border delta or padding tier delta > 0.",
    evidence: "Bubba Voice holds 22 sections legibly because the hand did this; the solver should guarantee it.",
    before: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={608} h={228} cls="gd-sec" rx={12} />
          <Chip x={26} y={26} text="outer" />
          <Box x={48} y={60} w={544} h={160} cls="gd-sec" rx={12} />
          <Chip x={58} y={70} text="middle" />
          <Box x={80} y={104} w={480} h={92} cls="gd-sec" rx={12} />
          <Chip x={90} y={114} text="inner" />
          <text className="gd-note" x={320} y={172} textAnchor="middle">same styling at three depths</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={608} h={228} cls="gd-sec" rx={12} />
          <Chip x={26} y={26} text="outer" />
          <Box x={48} y={60} w={544} h={160} cls="gd-sec2" rx={12} />
          <Chip x={58} y={70} text="middle · tint step" />
          <Box x={80} y={104} w={480} h={92} cls="gd-box" rx={12} />
          <Chip x={90} y={114} text="inner · surface" />
          <Measure x={40} y={252} width={140} label="48 / 32 / 24 pads" />
        </>
      ),
    },
  },
  {
    id: "R14",
    status: "possible",
    name: "Crossing budget",
    statement:
      "Edge crossings are a scored resource: perpendicular only, never within 24px of an endpoint, at most one per edge, total minimized.",
    measure: "Lint: crossing count, per-crossing angle = 90, endpoint distance >= 24; router search minimizes total.",
    evidence: "Graph-drawing research: crossing count is the strongest predictor of reading errors.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={40} w={144} h={56} label="a" />
          <Box x={48} y={144} w={144} h={56} label="b" />
          <Box x={448} y={40} w={144} h={56} label="c" />
          <Box x={448} y={144} w={144} h={56} label="d" />
          <path className="gd-edge" d="M 192 68 L 448 168" />
          <path className="gd-edge" d="M 192 172 L 448 64" />
          <text className="gd-note gd-off-note" x={320} y={210} textAnchor="middle">acute crossing, beside an endpoint</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={40} w={144} h={56} label="a" />
          <Box x={48} y={144} w={144} h={56} label="b" />
          <Box x={448} y={40} w={144} h={56} label="c" />
          <Box x={448} y={144} w={144} h={56} label="d" />
          <path className="gd-edge" d="M 192 68 L 320 68 L 320 172 L 448 172" />
          <path className="gd-edge" d="M 192 172 L 264 172 L 264 68 L 448 68" />
          <text className="gd-note" x={320} y={216} textAnchor="middle">perpendicular · mid-corridor · one max</text>
        </>
      ),
    },
  },
  {
    id: "R15",
    status: "possible",
    name: "One direction of flow",
    statement:
      "Each board reads in one direction, and every forward arrow makes progress along it. Only declared feedback loops may run against the grain.",
    measure: "Lint: for each non-feedback edge, projection of (target - source) on the reading axis > 0.",
    evidence: "v2-flow and the decomp harness read like sentences; Agent Flows V1 did not.",
    before: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <Box x={32} y={80} w={112} h={56} label="a" />
          <Box x={192} y={80} w={112} h={56} label="b" />
          <Box x={352} y={80} w={112} h={56} label="c" />
          <Box x={512} y={80} w={96} h={56} label="d" />
          <path className="gd-edge" d="M 144 108 L 192 108" />
          <path className="gd-edge gd-off-edge" d="M 352 96 L 304 96" />
          <path className="gd-edge" d="M 464 108 L 512 108" />
          <text className="gd-note gd-off-note" x={328} y={64} textAnchor="middle">forward edge, backward</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 220",
      content: (
        <>
          <Box x={32} y={80} w={112} h={56} label="a" />
          <Box x={192} y={80} w={112} h={56} label="b" />
          <Box x={352} y={80} w={112} h={56} label="c" />
          <Box x={512} y={80} w={96} h={56} label="d" />
          <path className="gd-edge" d="M 144 108 L 192 108" />
          <path className="gd-edge" d="M 304 108 L 352 108" />
          <path className="gd-edge" d="M 464 108 L 512 108" />
          <path className="gd-edge gd-feedback" d="M 560 80 L 560 36 L 88 36 L 88 80" />
          <text className="gd-note" x={324} y={26} textAnchor="middle">feedback only, on the ring</text>
        </>
      ),
    },
  },
  {
    id: "R16",
    status: "possible",
    name: "Entry and exit poles",
    statement:
      "Every board declares one visual entry and one or two exits, pinned at compass poles — entry W/NW, exits E/S — with L-size terminal emphasis.",
    measure: "Solver: degree-0-in node -> entry pole; degree-0-out -> exit pole; terminals forced L.",
    evidence: "Person icon upper-left and GitHub pill right are already your signature; this makes it law.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={40} y={40} w={560} h={168} cls="gd-sec" rx={12} />
          <Box x={264} y={96} w={112} h={56} cls="gd-box gd-off" label="entry?" />
          <Box x={96} y={96} w={112} h={56} label="step" />
          <Box x={432} y={96} w={112} h={56} label="step" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={40} y={40} w={560} h={168} cls="gd-sec" rx={12} />
          <Box x={64} y={84} w={128} h={80} cls="gd-box gd-em" label="entry · L" />
          <Box x={264} y={96} w={112} h={56} label="step" />
          <path className="gd-edge" d="M 192 124 L 264 124" />
          <path className="gd-edge" d="M 376 124 L 440 124" />
          <Box x={440} y={84} w={128} h={80} cls="gd-box gd-em" label="exit · L" />
          <text className="gd-note" x={80} y={228} textAnchor="middle">W pole</text>
          <text className="gd-note" x={560} y={228} textAnchor="middle">E pole</text>
        </>
      ),
    },
  },
  {
    id: "R17",
    status: "possible",
    name: "Density budget",
    statement:
      "The share of each region covered by content sits in a 35-55% band, and it stays similar across regions — no crammed section beside an empty one.",
    measure: "Lint: occupancy per region in [0.35, 0.55]; stddev across regions < 0.10. Solver grows/shrinks regions to comply.",
    evidence: "The lint Agent Flows V1 failed everywhere, and every Phase-2 polish implicitly fixed.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={16} y={16} w={288} h={208} cls="gd-sec gd-off" rx={12} />
          <Box x={32} y={56} w={80} h={40} /> <Box x={120} y={56} w={80} h={40} /> <Box x={208} y={56} w={80} h={40} />
          <Box x={32} y={104} w={80} h={40} /> <Box x={120} y={104} w={80} h={40} /> <Box x={208} y={104} w={80} h={40} />
          <Box x={32} y={152} w={80} h={40} /> <Box x={120} y={152} w={80} h={40} />
          <text className="gd-note gd-off-note" x={160} y={214} textAnchor="middle">78%</text>
          <Box x={336} y={16} w={288} h={208} cls="gd-sec gd-off" rx={12} />
          <Box x={368} y={56} w={80} h={40} />
          <text className="gd-note gd-off-note" x={480} y={214} textAnchor="middle">9%</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={16} y={16} w={288} h={208} cls="gd-sec" rx={12} />
          <Box x={48} y={64} w={96} h={48} /> <Box x={176} y={64} w={96} h={48} />
          <Box x={48} y={144} w={96} h={48} /> <Box x={176} y={144} w={96} h={48} />
          <text className="gd-note" x={160} y={214} textAnchor="middle">47%</text>
          <Box x={336} y={16} w={288} h={208} cls="gd-sec" rx={12} />
          <Box x={368} y={64} w={96} h={48} /> <Box x={496} y={64} w={96} h={48} />
          <Box x={368} y={144} w={96} h={48} />
          <text className="gd-note" x={480} y={214} textAnchor="middle">41%</text>
        </>
      ),
    },
  },
  {
    id: "R18",
    status: "possible",
    name: "Balance as moments",
    statement:
      "Visual mass balances about each container's spine like a mobile: left and right moments within ~15%. Asymmetry is allowed; lopsidedness is not.",
    measure: "Lint: |sum(area x distance) left - right| / max <= 0.15 per container spine.",
    evidence: "The intent-classification-2 fix — moving the trunk to the true midpoint — was this rule.",
    before: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={48} y={24} w={544} h={180} cls="gd-sec" rx={12} />
          <line className="gd-spine" x1={320} y1={24} x2={320} y2={204} />
          <path className="gd-fulcrum" d="M 320 204 L 300 236 L 340 236 Z" />
          <Box x={72} y={64} w={144} h={96} cls="gd-box gd-off" label="9.2" />
          <Box x={232} y={88} w={72} h={48} cls="gd-box gd-off" label="1.4" />
          <text className="gd-note gd-off-note" x={468} y={116} textAnchor="middle">1.1 — tips left</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={48} y={24} w={544} h={180} cls="gd-sec" rx={12} />
          <line className="gd-spine" x1={320} y1={24} x2={320} y2={204} />
          <path className="gd-fulcrum" d="M 320 204 L 300 236 L 340 236 Z" />
          <Box x={200} y={64} w={104} h={96} label="4.8" />
          <Box x={352} y={72} w={80} h={48} label="2.3" />
          <Box x={464} y={104} w={72} h={48} label="2.4" />
          <text className="gd-note" x={320} y={252} textAnchor="middle">4.8 vs 4.7 · within 15%</text>
        </>
      ),
    },
  },
  {
    id: "R19",
    status: "possible",
    name: "Ratio alphabet",
    statement:
      "Section aspect ratios come from a small alphabet — 1:1, 4:3, 3:2, the golden ratio, 2:1 — never arbitrary slivers.",
    measure: "Solver: snap solved region aspect to nearest alphabet member within its weight budget.",
    evidence: "The golden-cascade instinct from Structure Studio, applied as a snap instead of a generator.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={32} y={32} w={576} h={48} cls="gd-sec gd-off" rx={10} />
          <text className="gd-note gd-off-note" x={320} y={62} textAnchor="middle">12 : 1</text>
          <Box x={32} y={112} w={64} h={96} cls="gd-sec gd-off" rx={10} />
          <Box x={128} y={112} w={480} h={80} cls="gd-sec gd-off" rx={10} />
          <text className="gd-note gd-off-note" x={368} y={158} textAnchor="middle">6 : 1</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={32} y={32} w={240} h={160} cls="gd-sec" rx={10} />
          <text className="gd-note" x={152} y={118} textAnchor="middle">3 : 2</text>
          <Box x={304} y={32} w={259} h={160} cls="gd-sec" rx={10} />
          <text className="gd-note" x={432} y={118} textAnchor="middle">phi</text>
          <Box x={32} y={208} w={16} h={16} cls="gd-box" rx={3} />
          <text className="gd-note" x={320} y={222} textAnchor="middle">alphabet: 1:1 · 4:3 · 3:2 · phi · 2:1</text>
        </>
      ),
    },
  },
  {
    id: "R20",
    status: "possible",
    name: "Repeated groups match",
    statement:
      "Sibling groups built from the same template lay out identically — translated or mirrored. Differences may come from content, never from the solver.",
    measure: "Solver: a like= declaration reuses the sibling's solved internal layout with substituted members.",
    evidence: "ink's two adapter sections and intent-2's two halves are hand-made mirrors already.",
    before: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={288} h={228} cls="gd-sec" rx={12} />
          <Chip x={26} y={26} text="input adapter" />
          <Box x={48} y={72} w={112} h={48} /> <Box x={48} y={136} w={112} h={48} /> <Box x={48} y={200} w={112} h={32} />
          <Box x={336} y={16} w={288} h={228} cls="gd-sec gd-off" rx={12} />
          <Chip x={346} y={26} text="output adapter" />
          <Box x={368} y={88} w={100} h={44} cls="gd-box gd-off" /> <Box x={492} y={72} w={112} h={48} cls="gd-box gd-off" />
          <Box x={420} y={168} w={112} h={48} cls="gd-box gd-off" />
          <text className="gd-note gd-off-note" x={480} y={236} textAnchor="middle">same template, different layout</text>
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={288} h={228} cls="gd-sec" rx={12} />
          <Chip x={26} y={26} text="input adapter" />
          <Box x={48} y={72} w={112} h={48} /> <Box x={48} y={136} w={112} h={48} /> <Box x={48} y={200} w={112} h={32} />
          <Box x={336} y={16} w={288} h={228} cls="gd-sec" rx={12} />
          <Chip x={346} y={26} text="output adapter · like=" />
          <Box x={368} y={72} w={112} h={48} /> <Box x={368} y={136} w={112} h={48} /> <Box x={368} y={200} w={112} h={32} />
        </>
      ),
    },
  },
  {
    id: "R21",
    status: "possible",
    name: "Trunk and branch",
    statement:
      "Three or more same-direction edges from one source merge into a trunk that branches at ladder offsets, ordered so branches never cross.",
    measure: "Router: group by (source, exit side, direction); emit shared trunk + ordered branch points.",
    evidence: "The Researcher board's merged state-write trunks; ink's ordered table feeds.",
    before: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={88} w={144} h={64} label="src" />
          <Box x={448} y={16} w={144} h={48} label="a" />
          <Box x={448} y={96} w={144} h={48} label="b" />
          <Box x={448} y={176} w={144} h={48} label="c" />
          <path className="gd-edge gd-off-edge" d="M 192 104 L 280 104 L 280 40 L 448 40" />
          <path className="gd-edge gd-off-edge" d="M 192 120 L 448 120" />
          <path className="gd-edge gd-off-edge" d="M 192 136 L 264 136 L 264 200 L 448 200" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 240",
      content: (
        <>
          <Box x={48} y={88} w={144} h={64} label="src" />
          <Box x={448} y={16} w={144} h={48} label="a" />
          <Box x={448} y={96} w={144} h={48} label="b" />
          <Box x={448} y={176} w={144} h={48} label="c" />
          <path className="gd-edge" d="M 192 120 L 352 120" />
          <path className="gd-edge" d="M 352 120 L 352 40 L 448 40" />
          <path className="gd-edge" d="M 352 120 L 448 120" />
          <path className="gd-edge" d="M 352 120 L 352 200 L 448 200" />
          <text className="gd-note" x={330} y={224} textAnchor="middle">one trunk · ordered branches</text>
        </>
      ),
    },
  },
  {
    id: "R22",
    status: "possible",
    name: "The frame is the widest street",
    statement:
      "The outer board margin is at least as wide as the widest internal corridor — the composition breathes at its boundary, and feedback rings always have a home lane.",
    measure: "Solver: frame margin = max(96, widest internal corridor).",
    evidence: "The reference boards' page frames imply it; bubba's frame-tightening pass nearly violated it.",
    before: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={608} h={228} cls="gd-sec" rx={12} />
          <Box x={24} y={32} w={280} h={196} cls="gd-box gd-off" rx={10} />
          <Box x={368} y={32} w={248} h={196} cls="gd-box gd-off" rx={10} />
          <Measure x={304} y={130} width={64} label="64" />
          <Measure x={16} y={244} width={8} label="8 ✗" />
        </>
      ),
    },
    after: {
      viewBox: "0 0 640 260",
      content: (
        <>
          <Box x={16} y={16} w={608} h={228} cls="gd-sec" rx={12} />
          <Box x={112} y={64} w={192} h={132} cls="gd-box" rx={10} />
          <Box x={368} y={64} w={160} h={132} cls="gd-box" rx={10} />
          <Measure x={304} y={130} width={64} label="64" />
          <Measure x={16} y={244} width={96} label="96 ≥ 64" />
        </>
      ),
    },
  },
];
