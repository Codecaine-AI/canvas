import { useMemo, useState, type MouseEvent } from "react";
import { OBJECT_TYPE_DEFAULTS } from "@codecaine-ai/canvas";
import { parseSketch } from "../sketch/serialize";
import { expandSketch } from "../sketch/expand";
import { routeSketchEdges } from "../sketch/route";
import type { ExpandedSketch } from "../sketch/types";
import { SpatialCanvas } from "../sketch/SketchView";
import {
  ANATOMY_TOKENS,
  LANGUAGE_ENTRIES,
  LANGUAGE_EXPAND_SIZE,
  NESTING_EXAMPLE_DSL,
  WORKED_EXPAND_SIZE,
  WORKED_STEPS,
} from "./examples";
import { DslCode, DslLine } from "./dsl";
import { RULE_CARDS, type RuleCard } from "./rulesScenes";
import { CANDIDATE_RULE_CARDS } from "./candidateRules";
import { navigate } from "../routing";
import "./guide.css";

const ALL_RULES: readonly RuleCard[] = [...RULE_CARDS, ...CANDIDATE_RULE_CARDS];

/** Maps a language entry to the line-head context its doc chips tokenize under. */
const DOC_CONTEXT: Record<string, string> = {
  leaf: "leaf",
  split: "row",
  hug: "row",
  sec: "sec",
  grid: "grid",
  tier: "tier",
  fan: "fan",
  edges: "edges",
};

interface Solved {
  expanded: ExpandedSketch;
  routed: ReturnType<typeof routeSketchEdges>;
  error: string | null;
}

function solve(dsl: string, size: { width: number; height: number }): Solved {
  try {
    const raw = expandSketch(parseSketch(dsl), size);
    const expanded: ExpandedSketch = {
      ...raw,
      objects: raw.objects.map((object) => (
        object.type === "section" ? object : { ...object, label: object.label ?? object.id }
      )),
    };
    return { expanded, routed: routeSketchEdges(expanded, "corridors"), error: null };
  } catch (error) {
    return {
      expanded: { objects: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 }, gutters: [], regions: [] },
      routed: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function LiveBoard({ dsl, size, title, overlay }: {
  dsl: string;
  size: { width: number; height: number };
  title: string;
  overlay?: (unit: number) => React.ReactNode;
}) {
  const solved = useMemo(() => solve(dsl, size), [dsl, size]);
  if (solved.error) {
    return <div className="guide-solve-error">solver error: {solved.error}</div>;
  }
  return (
    <SpatialCanvas
      objects={solved.expanded.objects}
      connections={solved.routed}
      title={title}
      overlay={overlay}
    />
  );
}

/** Sub-sidebar row rendered as a real link so deep links stay copyable. */
function SubNavLink({ href, active, glyph, onFollow, children }: {
  href: string;
  active: boolean;
  glyph: string;
  onFollow: () => void;
  children: React.ReactNode;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onFollow();
  }
  return (
    <a
      href={href}
      className={`guide-subnav-row${active ? " active" : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={handleClick}
    >
      <span>{glyph}</span>
      {children}
    </a>
  );
}

function RuleDetail({ card }: { card: RuleCard }) {
  const [state, setState] = useState<"before" | "after">("after");
  const scene = state === "before" && card.before ? card.before : card.after;
  return (
    <article className="docs-article">
      <header className="docs-page-header">
        <div className="docs-kicker-row">
          <span className="docs-kicker">Rule reference · {card.id}</span>
          <span className={`guide-status guide-status-${card.status}`}>
            {card.status === "confirmed" ? "Confirmed — measured from real boards" : "Possible — up for review"}
          </span>
        </div>
        <h1>{card.name}</h1>
        <p className="docs-lede">{card.statement}</p>
      </header>
      <div className="guide-rule-stage">
        {card.before ? (
          <div className="guide-toggle" role="group" aria-label={`${card.id} state`}>
            <button
              type="button"
              className={state === "before" ? "active" : ""}
              onClick={() => setState("before")}
            >
              Rule ignored
            </button>
            <button
              type="button"
              className={state === "after" ? "active" : ""}
              onClick={() => setState("after")}
            >
              Rule followed
            </button>
          </div>
        ) : (
          <p className="guide-rule-footnote">{card.afterOnlyNote}</p>
        )}
        <div className={`guide-scene-frame${state === "before" && card.before ? " guide-scene-off" : ""}`}>
          <svg viewBox={scene.viewBox} role="img" aria-label={`${card.id} ${state}`}>
            {scene.content}
          </svg>
        </div>
      </div>
      {card.measure || card.evidence ? (
        <div className="guide-rule-notes">
          {card.measure ? (
            <div className="guide-aside-block">
              <h4>How it&rsquo;s enforced</h4>
              <p>{card.measure}</p>
            </div>
          ) : null}
          {card.evidence ? (
            <div className="guide-aside-block">
              <h4>{card.status === "confirmed" ? "Evidence from the boards" : "Why it might earn its place"}</h4>
              <p>{card.evidence}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RulesView({ selectedId, onSelect }: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = ALL_RULES.find((card) => card.id === selectedId) ?? ALL_RULES[0];
  const confirmed = ALL_RULES.filter((card) => card.status === "confirmed");
  const possible = ALL_RULES.filter((card) => card.status === "possible");

  const group = (title: string, cards: readonly RuleCard[]) => (
    <div className="guide-rule-group">
      <p className="guide-rule-group-title">{title}</p>
      {cards.map((card) => (
        <SubNavLink
          key={card.id}
          href={`/rules/${card.id}`}
          active={card.id === selected.id}
          glyph={card.id}
          onFollow={() => onSelect(card.id)}
        >
          {card.name}
        </SubNavLink>
      ))}
    </div>
  );

  return (
    <div className="guide-shell">
      <div className="guide-split-layout">
        <div className="guide-subnav">
          <nav className="guide-rules-nav" aria-label="Rules">
            {group("Confirmed rules", confirmed)}
            {group("Possible rules", possible)}
          </nav>
        </div>
        <div className="guide-rules-panel">
          <RuleDetail key={selected.id} card={selected} />
        </div>
      </div>
    </div>
  );
}

const ANATOMY_LINE = "leaf: N 2=checkout#pill(M)";
const ANATOMY_PROGRAM = LANGUAGE_ENTRIES.find((entry) => entry.id === "edges");

function FieldReference({
  fields,
  context,
}: {
  fields: readonly { token: string; meaning: string; kind?: string }[];
  context?: string;
}) {
  return (
    <dl className="docs-params" aria-label="Parameters">
      {fields.map((field) => (
        <div key={field.token} className="docs-param">
          <dt>
            <code className="tok-chip">
              {field.kind
                ? <span className={`tok-${field.kind}`}>{field.token}</span>
                : <DslLine line={field.token} context={context} />}
            </code>
          </dt>
          <dd>{field.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

function SolvedOutput({ dsl, title, muted }: { dsl: string; title: string; muted?: boolean }) {
  return (
    <div className={`guide-output-panel${muted ? " guide-output-panel-muted" : ""}`}>
      <div className="guide-output-bar">
        <span>{title}</span>
        <span>solver output</span>
      </div>
      <div className="guide-board-frame">
        <LiveBoard dsl={dsl} size={LANGUAGE_EXPAND_SIZE} title={title} />
      </div>
    </div>
  );
}

/** Every placeable #type, straight from the canvas schema's defaults table. */
const SHAPE_TYPES: readonly { type: string; label: string }[] = Object.entries(OBJECT_TYPE_DEFAULTS)
  .filter(([type]) => type !== "section") // sections are declared with `sec`, never as an item
  .map(([type, def]) => ({ type, label: def.label }));

const KEYWORD_VALUES = [
  { token: "sec", meaning: "a labeled container — wraps exactly one child" },
  { token: "row", meaning: "split a region into side-by-side bands, one child per weight" },
  { token: "col", meaning: "split a region into stacked bands, one child per weight" },
  { token: "leaf:", meaning: "place loose items in a region by compass slot" },
  { token: "grid", meaning: "rows × columns of identical cells, filled row by row" },
  { token: "tier", meaning: "align members on one shared centerline — written after the tree" },
  { token: "fan", meaning: "a hub with children spread out beside it — written after the tree" },
  { token: "edges:", meaning: "declare the arrows — always the last line, even when empty" },
  { token: "label", meaning: "optional display label on a sec header chip" },
  { token: "@NW", meaning: "corner marker on a split weight — pins that band to a corner", kind: "slot" as const },
];

const SIZE_VALUES = [
  { token: "(S)", meaning: "small — 0.72× the base size", kind: "size" as const },
  { token: "(M)", meaning: "standard — the 1× base every shape defaults to", kind: "size" as const },
  { token: "(L)", meaning: "large, for emphasis — 1.35×", kind: "size" as const },
];

const GAP_VALUES = [
  { token: "flush", meaning: "cells touching — tables", kind: "size" as const },
  { token: "g32", meaning: "32px gap — the tight step of the spacing ladder", kind: "size" as const },
  { token: "g64", meaning: "64px gap — the standard step", kind: "size" as const },
  { token: "g96", meaning: "96px gap — the loose step", kind: "size" as const },
];

const WEIGHT_VALUES = [
  { token: "1|2|1", meaning: "one positive number per child, separated by | — proportions of the band, never pixels" },
  { token: "1@NW|3", meaning: "a weight with an @corner suffix is pinned: that child keeps its natural size, tucked into the corner" },
];

const REFERENCE_VALUES = [
  { token: "2=", meaning: "declares reference number 2 — any positive integer, written once where the object first appears", kind: "ord" as const },
  { token: "2", meaning: "refers back to that object from tier, fan, and edges lines", kind: "ord" as const },
];

const AXIS_VALUES = [
  { token: "y:", meaning: "tier axis — y lines up y-centers (one horizontal row)", kind: "op" as const },
  { token: "x:", meaning: "tier axis — x lines up x-centers (one column)", kind: "op" as const },
  { token: "N S E W", meaning: "fan directions — which side of the hub the children sit on", kind: "slot" as const },
];

const NESTING_RULES = [
  { token: "(indent)", meaning: "two spaces per level. The lines indented under a container are its children, in order — indentation is the only thing that marks nesting, exactly like YAML.", kind: "punct" as const },
  { token: "sec", meaning: "has exactly one child: the single line indented under it" },
  { token: "row 1|2", meaning: "row and col have one child per weight, in order" },
  { token: "leaf: · grid", meaning: "always leaves — nothing is ever indented under them", kind: "op" as const },
  { token: "tier · fan", meaning: "come after the tree, at the left margin, never indented", kind: "op" as const },
  { token: "edges:", meaning: "always the last line of every program, even when there are no arrows" },
];

const COMPASS_SLOTS = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"] as const;

interface NestNode {
  line: string;
  children: NestNode[];
}

/** Parses indentation (2 spaces per level) into the tree the solver sees. */
function parseNesting(dsl: string): NestNode[] {
  const roots: NestNode[] = [];
  const stack: NestNode[] = [];
  for (const raw of dsl.split("\n")) {
    if (raw.trim() === "") continue;
    const depth = Math.floor((raw.match(/^ */)?.[0].length ?? 0) / 2);
    const node: NestNode = { line: raw.trim(), children: [] };
    stack.length = Math.min(stack.length, depth);
    if (depth === 0 || stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return roots;
}

function nestTag(line: string): string | null {
  if (line.startsWith("tier") || line.startsWith("fan")) return "after the tree";
  if (line.startsWith("edges:")) return "always last";
  return null;
}

function NestTree({ nodes }: { nodes: readonly NestNode[] }) {
  return (
    <div className="guide-nest-children">
      {nodes.map((node, index) => {
        const tag = nestTag(node.line);
        return (
          <div
            key={index}
            className={`guide-nest-box${node.children.length === 0 ? " guide-nest-leaf" : ""}`}
          >
            <code className="guide-nest-line">
              <span className="guide-nest-code"><DslLine line={node.line} /></span>
              {tag ? <span className="guide-nest-tag">{tag}</span> : null}
            </code>
            {node.children.length > 0 ? <NestTree nodes={node.children} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function AnatomyDetail() {
  const nesting = useMemo(() => parseNesting(NESTING_EXAMPLE_DSL), []);
  return (
    <article className="docs-article docs-article-narrow">
      <header className="docs-page-header">
        <span className="docs-kicker">Language reference</span>
        <h1>How to read a program</h1>
        <p className="docs-lede">
          The language is a small, coordinate-free description of a board. Read the
          indented tree first, then alignment constraints, then connections. The
          fitter generates this view; the AI edits it; the solver expands it.
        </p>
      </header>

      <section className="docs-section">
        <h2>Read one statement</h2>
        <p className="docs-note">Each token answers one specific layout question.</p>
        <DslCode code={ANATOMY_LINE} title="statement.layout" lineNumbers />
        <FieldReference fields={ANATOMY_TOKENS} context="leaf" />
      </section>

      <section className="docs-section">
        <h2>Every legal value, by token</h2>
        <p className="docs-note">
          The language is small on purpose. These are all the values each slot can take —
          there are no others.
        </p>

        <div className="docs-subsection">
          <h3>Statement keywords</h3>
          <FieldReference fields={KEYWORD_VALUES} />
        </div>

        <div className="docs-subsection">
          <h3>Compass slots</h3>
          <p className="docs-note">
            Nine slots, two jobs: they place items inside a region on a <code>leaf:</code> line,
            and they pin a band to a corner as an <code>@corner</code> suffix on a split weight.
          </p>
          <div className="docs-chip-grid docs-chip-grid-compass" aria-label="The nine compass slots">
            {COMPASS_SLOTS.map((slot) => (
              <code key={slot} className="tok-chip"><span className="tok-slot">{slot}</span></code>
            ))}
          </div>
        </div>

        <div className="docs-subsection">
          <h3>Shape types</h3>
          <p className="docs-note">
            The complete set, straight from the canvas schema — any of these can follow
            a <code>#</code>. Sections are the one exception: they are declared
            with <code>sec</code>, never placed as an item.
          </p>
          <div className="docs-chip-grid" aria-label="All shape types">
            {SHAPE_TYPES.map((shape) => (
              <span key={shape.type} className="docs-chip-item">
                <code className="tok-chip"><span className="tok-type">#{shape.type}</span></code>
                <em>{shape.label}</em>
              </span>
            ))}
          </div>
        </div>

        <div className="docs-subsection">
          <h3>Sizes</h3>
          <FieldReference fields={SIZE_VALUES} />
        </div>

        <div className="docs-subsection">
          <h3>Grid gaps</h3>
          <FieldReference fields={GAP_VALUES} />
        </div>

        <div className="docs-subsection">
          <h3>Split weights</h3>
          <FieldReference fields={WEIGHT_VALUES} context="row" />
        </div>

        <div className="docs-subsection">
          <h3>Reference numbers</h3>
          <FieldReference fields={REFERENCE_VALUES} />
        </div>

        <div className="docs-subsection">
          <h3>Tier axes &amp; fan directions</h3>
          <FieldReference fields={AXIS_VALUES} context="tier" />
        </div>
      </section>

      <section className="docs-section">
        <h2>How a program is shaped</h2>
        <p className="docs-note">
          Indentation is the grammar, exactly like YAML: the lines indented under a
          container are its children, in order. Nothing else marks nesting.
        </p>
        <FieldReference fields={NESTING_RULES} />
        <div className="guide-nest-duo">
          <DslCode code={NESTING_EXAMPLE_DSL} title="what-you-type.layout" lineNumbers />
          <div className="guide-nest" aria-label="How the indentation nests">
            <div className="guide-nest-caption">how it nests</div>
            <NestTree nodes={nesting} />
          </div>
        </div>
      </section>

      {ANATOMY_PROGRAM ? (
        <section className="docs-section">
          <h2>Read the whole file from top to bottom</h2>
          <p className="docs-note">
            Lines 1–7 form the nested layout tree. The final line declares the
            arrows. A <code>tier</code> or <code>fan</code> line would sit between them.
          </p>
          <div className="guide-lang-duo">
            <DslCode code={ANATOMY_PROGRAM.dsl} title="pipeline.layout" lineNumbers />
            <SolvedOutput dsl={ANATOMY_PROGRAM.dsl} title="pipeline.preview" />
          </div>
        </section>
      ) : null}
    </article>
  );
}

function LanguageDetail({ entry, onOpenRule }: {
  entry: (typeof LANGUAGE_ENTRIES)[number];
  onOpenRule: (id: string) => void;
}) {
  const context = DOC_CONTEXT[entry.id];
  const relatedRule = useMemo(() => {
    const match = entry.meaning.match(/rule (R\d+)/);
    if (!match) return null;
    return ALL_RULES.find((card) => card.id === match[1]) ?? null;
  }, [entry.meaning]);
  return (
    <article className="docs-article">
      <header className="docs-page-header">
        <span className="docs-kicker">Language reference</span>
        <h1>{entry.name}</h1>
        <p className="docs-lede">{entry.meaning}</p>
      </header>

      <div className="docs-split">
        <div className="docs-main">
          <section className="docs-section">
            <h2>Syntax</h2>
            <div className="guide-signature" aria-label={`${entry.name} syntax`}>
              <DslLine line={entry.syntax} context={context} />
            </div>
          </section>

          <section className="docs-section">
            <h2>Parameters</h2>
            <FieldReference fields={entry.docs} context={context} />
          </section>

          {relatedRule ? (
            <section className="docs-section">
              <h2>Related rule</h2>
              <a
                className="docs-related"
                href={`/rules/${relatedRule.id}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onOpenRule(relatedRule.id);
                }}
              >
                <span>{relatedRule.id}</span>
                <strong>{relatedRule.name}</strong>
                <em aria-hidden="true">&rarr;</em>
              </a>
            </section>
          ) : null}
        </div>

        <aside className="docs-rail">
          <DslCode code={entry.dsl} title={`${entry.id}.layout`} lineNumbers />
          <SolvedOutput dsl={entry.dsl} title={`${entry.id}.preview`} />
          {entry.contrastDsl ? (
            <div className="docs-without">
              <div className="docs-without-label">
                <span>Without</span>
                {entry.contrastNote}
              </div>
              <DslCode
                code={entry.contrastDsl}
                title={`${entry.id}-without.layout`}
                lineNumbers
                className="guide-code-muted"
              />
              <SolvedOutput
                dsl={entry.contrastDsl}
                title={`${entry.id}-without.preview`}
                muted
              />
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

export function LanguageView({ selectedId, onSelect }: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = LANGUAGE_ENTRIES.find((entry) => entry.id === selectedId) ?? null;

  return (
    <div className="guide-shell">
      <div className="guide-split-layout">
        <div className="guide-subnav">
          <nav className="guide-rules-nav" aria-label="Language">
            <div className="guide-rule-group">
              <p className="guide-rule-group-title">Start here</p>
              <SubNavLink
                href="/language"
                active={selected === null}
                glyph="abc"
                onFollow={() => onSelect("anatomy")}
              >
                How to read a line
              </SubNavLink>
            </div>
            <div className="guide-rule-group">
              <p className="guide-rule-group-title">Statements</p>
              {LANGUAGE_ENTRIES.map((entry) => (
                <SubNavLink
                  key={entry.id}
                  href={`/language/${entry.id}`}
                  active={entry.id === selectedId}
                  glyph={entry.id === "split" ? "row" : entry.id === "hug" ? "@" : entry.id}
                  onFollow={() => onSelect(entry.id)}
                >
                  {entry.name}
                </SubNavLink>
              ))}
            </div>
          </nav>
        </div>
        <div className="guide-rules-panel">
          {selected
            ? (
              <LanguageDetail
                key={selected.id}
                entry={selected}
                onOpenRule={(id) => navigate(`/rules/${id}`)}
              />
            )
            : <AnatomyDetail />}
        </div>
      </div>
    </div>
  );
}

interface StepDiff {
  movedIds: Set<string>;
  pinnedIds: Set<string>;
}

function diffExpansions(previous: ExpandedSketch | null, current: ExpandedSketch): StepDiff {
  const movedIds = new Set<string>();
  const pinnedIds = new Set<string>();
  const previousById = new Map(
    (previous?.objects ?? []).map((object) => [object.id, object.geometry]),
  );
  for (const object of current.objects) {
    const before = previousById.get(object.id);
    const unchanged = before
      && before.x === object.geometry.x
      && before.y === object.geometry.y
      && before.width === object.geometry.width
      && before.height === object.geometry.height;
    if (unchanged) pinnedIds.add(object.id);
    else movedIds.add(object.id);
  }
  return { movedIds, pinnedIds };
}

function changedLines(previous: string | null, current: string): Set<number> {
  const changed = new Set<number>();
  const previousLines = new Set((previous ?? "").split("\n"));
  current.split("\n").forEach((line, index) => {
    if (!previousLines.has(line)) changed.add(index);
  });
  return changed;
}

export function WorkedView() {
  const [step, setStep] = useState(0);
  const current = WORKED_STEPS[step];
  const previous = step > 0 ? WORKED_STEPS[step - 1] : null;

  const solved = useMemo(() => solve(current.dsl, WORKED_EXPAND_SIZE), [current.dsl]);
  const previousSolved = useMemo(
    () => (previous ? solve(previous.dsl, WORKED_EXPAND_SIZE) : null),
    [previous],
  );
  const diff = useMemo(
    () => diffExpansions(previousSolved?.expanded ?? null, solved.expanded),
    [previousSolved, solved],
  );
  // Step 1 has no previous step: everything is "new", so a diff is pure noise.
  const showDiff = previous !== null;
  const highlighted = useMemo(
    () => (previous ? changedLines(previous.dsl, current.dsl) : new Set<number>()),
    [previous, current.dsl],
  );

  const overlay = (unit: number) => (
    <g className="guide-diff-overlay">
      {solved.expanded.objects
        .filter((object) => diff.movedIds.has(object.id))
        .map((object) => (
          <rect
            key={object.id}
            className="guide-diff-moved"
            x={object.geometry.x - 4 * unit}
            y={object.geometry.y - 4 * unit}
            width={object.geometry.width + 8 * unit}
            height={object.geometry.height + 8 * unit}
            rx={8 * unit}
            strokeWidth={1.6 * unit}
          />
        ))}
    </g>
  );

  return (
    <div className="guide-shell guide-worked-shell">
      <header className="docs-page-header docs-page-header-compact">
        <span className="docs-kicker">Worked example</span>
        <h1>A board in seven edits</h1>
      </header>
      <div className="guide-step-bar">
        <div className="guide-step-nav">
          <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>&larr; Back</button>
          <button
            type="button"
            className="guide-step-next"
            disabled={step === WORKED_STEPS.length - 1}
            onClick={() => setStep(step + 1)}
          >
            Next step &rarr;
          </button>
        </div>
        <div className="guide-step-dots" role="group" aria-label="Steps">
          {WORKED_STEPS.map((entry, index) => (
            <button
              key={entry.title}
              type="button"
              className={index === step ? "active" : index < step ? "done" : ""}
              aria-label={`Step ${index + 1}: ${entry.title}`}
              aria-current={index === step ? "step" : undefined}
              onClick={() => setStep(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="guide-step-title">
          <span>Step {step + 1} of {WORKED_STEPS.length}</span>
          <strong>{current.title}</strong>
        </div>
        <span className="guide-step-rules" aria-label="Rules used in this step">
          {current.rules.map((rule) => <em key={rule}>{rule}</em>)}
        </span>
      </div>
      <p className="guide-step-annotation">
        {current.annotation}
        {showDiff ? (
          <span className="guide-step-counts">
            <span className="guide-key-moved">{diff.movedIds.size} moved</span>
            <span className="guide-key-pinned">{diff.pinnedIds.size} unchanged</span>
          </span>
        ) : null}
      </p>
      <div className="guide-worked-panes">
        <pre className="guide-code guide-code-steps">
          {current.dsl.split("\n").map((line, index) => {
            const note = current.notes?.[line.trim()];
            return (
              <div key={index} className={`guide-code-line${highlighted.has(index) ? " guide-line-new" : ""}`}>
                <span className="guide-line-body"><DslLine line={line} /></span>
                {note ? <span className="guide-line-note">&#8627; {note}</span> : null}
              </div>
            );
          })}
        </pre>
        <div className="guide-board-frame guide-board-tall">
          {solved.error
            ? <div className="guide-solve-error">solver error: {solved.error}</div>
            : (
              <SpatialCanvas
                objects={solved.expanded.objects}
                connections={solved.routed}
                title={`Worked example step ${step + 1}`}
                overlay={showDiff ? overlay : undefined}
              />
            )}
        </div>
      </div>
    </div>
  );
}
