import "./guide.css";

/**
 * "How it works" — one sequence diagram ("One edit, in order") with the
 * five-step reading beside it and a short row of facts beneath. The program
 * text is a derived, disposable view; the solver is the only writer of
 * geometry; the router owns every line; you can touch anything.
 */

const LIFELINES: readonly { x: number; name: string; tag: string; det?: boolean }[] = [
  { x: 100, name: "You", tag: "human" },
  { x: 320, name: "The AI", tag: "judgment" },
  { x: 540, name: "Fitter", tag: "deterministic", det: true },
  { x: 760, name: "Document", tag: "the one saved thing", det: true },
  { x: 980, name: "Solver", tag: "deterministic", det: true },
  { x: 1160, name: "Router", tag: "deterministic", det: true },
];

function SeqMessage({ from, to, y, label, dashed }: {
  from: number; to: number; y: number; label: string; dashed?: boolean;
}) {
  const mid = (from + to) / 2;
  return (
    <g>
      <line
        x1={from}
        y1={y}
        x2={to + (to > from ? -8 : 8)}
        y2={y}
        className={`gf-seq-msg${dashed ? " gf-seq-msg-dashed" : ""}`}
        markerEnd={dashed ? "url(#gf-seq-arrow-open)" : "url(#gf-seq-arrow)"}
      />
      <text x={mid} y={y - 9} textAnchor="middle" className="gf-seq-label">{label}</text>
    </g>
  );
}

function SequenceDiagram() {
  return (
    <svg viewBox="0 0 1256 700" role="img" aria-label="Sequence of one edit: command, fit, AI edit, solve, render, review loop">
      <defs>
        <marker id="gf-seq-arrow" markerWidth={9} markerHeight={9} refX={7.5} refY={4.5} orient="auto">
          <path d="M 0 0 L 9 4.5 L 0 9 Z" className="gf-arrow-head" />
        </marker>
        <marker id="gf-seq-arrow-open" markerWidth={10} markerHeight={10} refX={8} refY={5} orient="auto">
          <path d="M 1 1 L 8 5 L 1 9" fill="none" className="gf-seq-open-head" />
        </marker>
      </defs>

      {LIFELINES.map((lane) => (
        <g key={lane.name}>
          <line x1={lane.x} y1={92} x2={lane.x} y2={668} className="gf-seq-life" />
          <rect x={lane.x - 84} y={24} width={168} height={64} rx={12}
            className={`gf-seq-head${lane.det ? " gf-seq-head-det" : ""}`} />
          <text x={lane.x} y={51} textAnchor="middle" className="gf-seq-name">{lane.name}</text>
          <text x={lane.x} y={73} textAnchor="middle" className="gf-seq-tag">{lane.tag}</text>
        </g>
      ))}

      <SeqMessage from={100} to={320} y={132} label="your command + what you have selected" />
      <SeqMessage from={320} to={540} y={180} label="fit the document" />
      <SeqMessage from={540} to={760} y={224} label="read" />
      <SeqMessage from={760} to={540} y={268} label="geometry + intent" dashed />
      <SeqMessage from={540} to={320} y={312} label="the program — identical every time" dashed />
      <SeqMessage from={1160} to={320} y={356} label="a picture of the current board" dashed />

      <rect x={240} y={382} width={984} height={228} rx={12} className="gf-seq-loop" />
      <rect x={240} y={382} width={230} height={30} rx={8} className="gf-seq-loop-tab" />
      <text x={252} y={402} className="gf-seq-loop-label">repeat until it looks right</text>

      <SeqMessage from={320} to={980} y={438} label="a one-line change to the program" />
      <SeqMessage from={980} to={760} y={482} label="write geometry + intent — one save" />
      <SeqMessage from={760} to={1160} y={526} label="new geometry" />
      <SeqMessage from={1160} to={320} y={578} label="a fresh picture — the AI reviews it" dashed />

      <SeqMessage from={320} to={100} y={648} label="done — the board updates in front of you" dashed />
    </svg>
  );
}

const CORE_STEPS = [
  {
    title: "You say what should change",
    body: "Your command — plus anything you have selected — tells the AI what you want to accomplish.",
  },
  {
    title: "The fitter reads the current board",
    body: "It turns the saved canvas into the compact layout language: groups, rows, columns, grids, lanes, shared centerlines, and arrows. It does not interpret your command; it gives the AI a structural view of what is already there.",
  },
  {
    title: "The AI reads structure and sees the result",
    body: "The language explains how the board is organized. A screenshot, SVG, or other rendering shows how it actually looks. The AI uses both views together.",
  },
  {
    title: "It changes, solves, and checks",
    body: "The AI makes a small change to the language. The solver turns that change into geometry, the router redraws the lines, and a fresh rendering comes back for review. The loop repeats until the board looks right.",
  },
  {
    title: "The AI tells you it is done",
    body: "When the structure and the rendered result both look right, the AI stops iterating and returns the finished board.",
  },
] as const;

const FACTS = [
  {
    title: "The program is a view, not a file",
    body: "The language is derived fresh from the document on every edit and thrown away after. It can never go stale.",
  },
  {
    title: "Intent lives inside the document",
    body: "Grids, lanes, tiers, and fans are saved next to the geometry in the same file, so they cannot drift apart.",
  },
  {
    title: "Your hands stay on the canvas",
    body: "Dragging a box edits geometry directly. A reconcile pass then checks whether the stored intents still hold.",
  },
  {
    title: "Who owns what",
    body: "The AI owns structure and intent. The solver owns every pixel. The router owns every line. You own anything, any time.",
  },
] as const;

export function FlowView() {
  return (
    <div className="guide-shell">
      <article className="docs-article docs-article-wide">
        <header className="docs-page-header">
          <span className="docs-kicker">Overview</span>
          <h1>How it works</h1>
          <p className="docs-lede">
            The AI works with structure, not pixel coordinates. It keeps looking at the
            rendered board while deterministic tools handle placement and lines. Here is
            one edit, in order, from your command to the updated board.
          </p>
        </header>

        <section className="docs-section">
          <h2>One edit, in order</h2>
          <figure className="docs-figure" role="group" aria-label="Sequence diagram of one edit">
            <SequenceDiagram />
          </figure>
        </section>

        <section className="docs-section">
          <h2>Reading the diagram</h2>
          <ol className="docs-steps">
            {CORE_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="docs-step-number">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="docs-callout">
            <strong>The handoff is simple</strong>
            <span>The fitter reads. The AI decides. The solver places. The router draws.</span>
          </div>
        </section>

        <dl className="docs-facts" aria-label="Key facts">
          {FACTS.map((fact) => (
            <div key={fact.title} className="docs-fact">
              <dt>{fact.title}</dt>
              <dd>{fact.body}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
}
