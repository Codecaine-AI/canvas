import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { STRUCTURE_ALGORITHM_BY_ID, STRUCTURE_ALGORITHMS } from "./algorithms";
import { StructureCanvas } from "./render/StructureCanvas";
import {
  loadStarred,
  saveStarred,
  variationId,
  type StarredVariation,
} from "./store";
import type { AlgorithmDef, AlgorithmParams, AlgorithmValue } from "./types";

type StudioMode = "gallery" | "survey" | "starred";
type DisplayMode = "bones" | "inhabited" | "both";

const MONDRIAN_FAMILY_IDS = new Set(["mondrian-golden", "mondrian-streets", "hero-cascade"]);

type Aspect = {
  id: "16:10" | "4:3" | "1:1";
  label: string;
  width: number;
  height: number;
};

type Variation = {
  algorithm: AlgorithmDef;
  seed: number;
  params: AlgorithmParams;
};

const ASPECTS: readonly Aspect[] = [
  { id: "16:10", label: "16:10", width: 1280, height: 800 },
  { id: "4:3", label: "4:3", width: 1280, height: 960 },
  { id: "1:1", label: "1:1", width: 1000, height: 1000 },
];

function defaultsFor(algorithm: AlgorithmDef): AlgorithmParams {
  return Object.fromEntries(algorithm.params.map((param) => [param.key, param.default]));
}

function initialAlgorithmParams(): Record<string, AlgorithmParams> {
  return Object.fromEntries(
    STRUCTURE_ALGORITHMS.map((algorithm) => [algorithm.id, defaultsFor(algorithm)]),
  );
}

function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
}

function seedSeries(base: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (
    (base + Math.imul(index + 1, 0x9e3779b1)) >>> 0
  ) || index + 1);
}

function frameParams(params: AlgorithmParams, aspect: Aspect): AlgorithmParams {
  return { ...params, width: aspect.width, height: aspect.height };
}

function paramsSummary(algorithm: AlgorithmDef, params: AlgorithmParams): string {
  if (algorithm.params.length === 0) return "Canonical sequence";
  return algorithm.params
    .map((definition) => `${definition.label} ${String(params[definition.key] ?? definition.default)}`)
    .join(" · ");
}

function StarIcon({ filled }: { filled: boolean }) {
  return <span aria-hidden="true">{filled ? "★" : "☆"}</span>;
}

type VariationCardProps = {
  variation: Variation;
  gutter: number;
  depthTint: boolean;
  displayMode: DisplayMode;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  showAlgorithm?: boolean;
};

function VariationCard({
  variation,
  gutter,
  depthTint,
  displayMode,
  starred,
  onOpen,
  onToggleStar,
  showAlgorithm = false,
}: VariationCardProps) {
  const width = Number(variation.params.width) || 1280;
  const height = Number(variation.params.height) || 800;
  const regions = useMemo(
    () => variation.algorithm.run(variation.params, variation.seed),
    [variation],
  );

  return (
    <article className="variation-card">
      <button
        type="button"
        className="variation-preview"
        onClick={onOpen}
        aria-label={`Expand ${variation.algorithm.name}, seed ${variation.seed}`}
      >
        <span className={`variation-preview-pair ${displayMode}`}>
          {displayMode !== "inhabited" ? (
            <span className="variation-preview-pane" data-preview-label={displayMode === "both" ? "Bones" : undefined}>
              <StructureCanvas
                regions={regions}
                width={width}
                height={height}
                gutter={gutter}
                depthTint={depthTint}
              />
            </span>
          ) : null}
          {displayMode !== "bones" ? (
            <span className="variation-preview-pane" data-preview-label={displayMode === "both" ? "Inhabited" : undefined}>
              <StructureCanvas
                regions={regions}
                width={width}
                height={height}
                gutter={gutter}
                depthTint={depthTint}
                inhabited
                seed={variation.seed}
              />
            </span>
          ) : null}
        </span>
      </button>
      <div className="variation-meta">
        <div>
          {showAlgorithm ? <strong>{variation.algorithm.name}</strong> : null}
          <span className="variation-seed">seed {variation.seed}</span>
        </div>
        <button
          type="button"
          className={`star-button ${starred ? "is-starred" : ""}`}
          onClick={onToggleStar}
          aria-label={`${starred ? "Unstar" : "Star"} ${variation.algorithm.name}, seed ${variation.seed}`}
          aria-pressed={starred}
        >
          <StarIcon filled={starred} />
        </button>
      </div>
    </article>
  );
}

type ParameterControlProps = {
  algorithm: AlgorithmDef;
  params: AlgorithmParams;
  onChange: (key: string, value: AlgorithmValue) => void;
};

function ParameterControls({ algorithm, params, onChange }: ParameterControlProps) {
  if (algorithm.params.length === 0) {
    return <p className="studio-static-note">A fixed eight-square sequence; only the frame changes.</p>;
  }

  return (
    <div className="studio-param-list">
      {algorithm.params.map((param) => {
        const value = params[param.key] ?? param.default;
        if (param.type === "select") {
          return (
            <label className="studio-param" key={param.key}>
              <span>{param.label}</span>
              <select value={String(value)} onChange={(event) => onChange(param.key, event.target.value)}>
                {param.options?.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label className="studio-param" key={param.key}>
            <span className="studio-param-label">
              <span>{param.label}</span>
              <output>{String(value)}</output>
            </span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={Number(value)}
              onChange={(event) => onChange(param.key, Number(event.target.value))}
            />
          </label>
        );
      })}
    </div>
  );
}

export function StructureStudio({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<StudioMode>("gallery");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");
  const [selectedId, setSelectedId] = useState(STRUCTURE_ALGORITHMS[0].id);
  const [aspectId, setAspectId] = useState<Aspect["id"]>("16:10");
  const [gutter, setGutter] = useState(0);
  const [depthTint, setDepthTint] = useState(true);
  const [algorithmParams, setAlgorithmParams] = useState(initialAlgorithmParams);
  const [seedBase, setSeedBase] = useState(randomSeed);
  const [starred, setStarred] = useState<StarredVariation[]>(loadStarred);
  const [expanded, setExpanded] = useState<Variation | null>(null);
  const [copyStatus, setCopyStatus] = useState("Copy selections");

  const selectedAlgorithm = STRUCTURE_ALGORITHM_BY_ID.get(selectedId) ?? STRUCTURE_ALGORITHMS[0];
  const aspect = ASPECTS.find((candidate) => candidate.id === aspectId) ?? ASPECTS[0];
  const gallerySeeds = useMemo(() => seedSeries(seedBase, 6), [seedBase]);
  const surveySeed = useMemo(() => seedSeries(seedBase, 1)[0], [seedBase]);

  const reroll = useCallback(() => {
    setSeedBase(randomSeed());
    setExpanded(null);
  }, []);

  useEffect(() => saveStarred(starred), [starred]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isEditing = target instanceof HTMLElement
        && target.matches("input, select, textarea, [contenteditable='true']");
      if (mode !== "starred" && event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditing) {
        event.preventDefault();
        reroll();
      }
      if (event.key === "Escape") setExpanded(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, mode, reroll]);

  function paramsFor(algorithm: AlgorithmDef): AlgorithmParams {
    return frameParams(algorithmParams[algorithm.id] ?? defaultsFor(algorithm), aspect);
  }

  function isStarred(variation: Variation): boolean {
    const id = variationId(variation.algorithm.id, variation.seed, variation.params);
    return starred.some((item) => item.id === id);
  }

  function toggleStar(variation: Variation) {
    const id = variationId(variation.algorithm.id, variation.seed, variation.params);
    setStarred((current) => current.some((item) => item.id === id)
      ? current.filter((item) => item.id !== id)
      : [...current, {
        id,
        algorithmId: variation.algorithm.id,
        seed: variation.seed,
        params: { ...variation.params },
      }]);
  }

  const galleryVariations: Variation[] = gallerySeeds.map((seed) => ({
    algorithm: selectedAlgorithm,
    seed,
    params: paramsFor(selectedAlgorithm),
  }));

  const surveyVariations: Variation[] = STRUCTURE_ALGORITHMS.map((algorithm) => ({
    algorithm,
    seed: surveySeed,
    params: paramsFor(algorithm),
  }));

  const starredVariations: Variation[] = starred.flatMap((item) => {
    const algorithm = STRUCTURE_ALGORITHM_BY_ID.get(item.algorithmId);
    return algorithm ? [{ algorithm, seed: item.seed, params: item.params }] : [];
  });

  async function copySelections() {
    const output = starredVariations.map((variation) => ({
      algorithm: variation.algorithm.id,
      seed: variation.seed,
      params: variation.params,
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus("Copy selections"), 1400);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  const activeVariations = mode === "gallery"
    ? galleryVariations
    : mode === "survey" ? surveyVariations : starredVariations;

  return (
    <main className="studio-shell">
      <aside className="studio-rail">
        <div className="studio-heading">
          <p className="eyebrow">Mathematical partitions</p>
          <h1>Structure Studio</h1>
          <p className="lede">Seeded layouts, shown as bones and lived-in diagrams. Audition how each structure carries content.</p>
        </div>

        <nav className="algorithm-list" aria-label="Structure algorithms">
          {STRUCTURE_ALGORITHMS.map((algorithm, index) => (
            <Fragment key={algorithm.id}>
              {algorithm.id === "mondrian-golden" ? (
                <p className="algorithm-group-label">Mondrian family</p>
              ) : null}
              <button
                type="button"
                className={algorithm.id === selectedAlgorithm.id ? "active" : ""}
                onClick={() => {
                  setSelectedId(algorithm.id);
                  setMode("gallery");
                }}
              >
                <span className="algorithm-index">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>
                    {algorithm.name}
                    {MONDRIAN_FAMILY_IDS.has(algorithm.id) ? <em className="algorithm-new">new</em> : null}
                  </strong>
                  <small>{algorithm.description}</small>
                </span>
              </button>
            </Fragment>
          ))}
        </nav>

        <section className="studio-controls" aria-labelledby="global-controls-title">
          <h2 id="global-controls-title">Global controls</h2>
          <fieldset className="display-control">
            <legend>Display</legend>
            <div>
              {(["bones", "inhabited", "both"] as const).map((candidate) => (
                <button
                  type="button"
                  key={candidate}
                  className={candidate === displayMode ? "active" : ""}
                  aria-pressed={candidate === displayMode}
                  onClick={() => setDisplayMode(candidate)}
                >
                  {candidate[0].toUpperCase() + candidate.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="studio-param">
            <span className="studio-param-label"><span>Gutter</span><output>{gutter}px</output></span>
            <input
              type="range"
              min={0}
              max={64}
              step={1}
              value={gutter}
              onChange={(event) => setGutter(Number(event.target.value))}
            />
          </label>
          <label className="studio-toggle">
            <span>
              <strong>Depth tint</strong>
              <small>Warm / cool nesting wash</small>
            </span>
            <input
              type="checkbox"
              checked={depthTint}
              onChange={(event) => setDepthTint(event.target.checked)}
            />
          </label>
          <fieldset className="aspect-control">
            <legend>Frame aspect</legend>
            <div>
              {ASPECTS.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className={candidate.id === aspect.id ? "active" : ""}
                  onClick={() => setAspectId(candidate.id)}
                >
                  {candidate.label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="studio-controls algorithm-controls" aria-labelledby="algorithm-controls-title">
          <h2 id="algorithm-controls-title">{selectedAlgorithm.name}</h2>
          <ParameterControls
            algorithm={selectedAlgorithm}
            params={algorithmParams[selectedAlgorithm.id]}
            onChange={(key, value) => setAlgorithmParams((current) => ({
              ...current,
              [selectedAlgorithm.id]: { ...current[selectedAlgorithm.id], [key]: value },
            }))}
          />
        </section>

        <button
          type="button"
          className="studio-reroll"
          onClick={reroll}
          disabled={mode === "starred"}
          title={mode === "starred" ? "Saved selections keep their original seeds." : undefined}
        >
          <span>{mode === "starred" ? "Saved seeds fixed" : "Reroll all"}</span>
          {mode === "starred" ? null : <kbd>R</kbd>}
        </button>
      </aside>

      <section className="studio-main">
        <header className="studio-toolbar">
          <div className="studio-tabs" role="tablist" aria-label="Studio views">
            {(["gallery", "survey", "starred"] as const).map((candidate) => (
              <button
                type="button"
                role="tab"
                aria-selected={mode === candidate}
                key={candidate}
                className={mode === candidate ? "active" : ""}
                onClick={() => setMode(candidate)}
              >
                {candidate === "starred" ? `Starred ${starred.length}` : candidate[0].toUpperCase() + candidate.slice(1)}
              </button>
            ))}
          </div>
          {mode === "starred" ? (
            <button
              type="button"
              className="copy-selections"
              onClick={copySelections}
              disabled={starred.length === 0}
            >
              {copyStatus}
            </button>
          ) : (
            <div className="studio-context">
              <strong>{mode === "gallery" ? selectedAlgorithm.name : "Head-to-head survey"}</strong>
              <span>{mode === "gallery" ? paramsSummary(selectedAlgorithm, paramsFor(selectedAlgorithm)) : `shared seed ${surveySeed}`}</span>
            </div>
          )}
        </header>

        {mode === "starred" && activeVariations.length === 0 ? (
          <div className="starred-empty">
            <span>☆</span>
            <h2>No structures saved yet</h2>
            <p>Star any variation that has the right rhythm. It will wait here for the final cut.</p>
            <button type="button" onClick={() => setMode("gallery")}>Return to gallery</button>
          </div>
        ) : (
          <div className={`variation-grid ${mode} display-${displayMode}`}>
            {activeVariations.map((variation) => (
              <VariationCard
                key={`${variation.algorithm.id}-${variation.seed}-${variationId(variation.algorithm.id, variation.seed, variation.params)}`}
                variation={variation}
                gutter={gutter}
                depthTint={depthTint}
                displayMode={displayMode}
                starred={isStarred(variation)}
                onOpen={() => setExpanded(variation)}
                onToggleStar={() => toggleStar(variation)}
                showAlgorithm={mode !== "gallery"}
              />
            ))}
          </div>
        )}
      </section>

      {expanded ? (
        <div className="structure-lightbox" role="dialog" aria-modal="true" aria-label="Expanded structure">
          <button
            type="button"
            className="lightbox-backdrop"
            onClick={() => setExpanded(null)}
            aria-label="Close expanded structure"
          />
          <div className="lightbox-panel">
            <div className="lightbox-header">
              <div>
                <p className="eyebrow">{expanded.algorithm.description}</p>
                <h2>{expanded.algorithm.name}</h2>
                <p className="lightbox-meta">seed {expanded.seed} · {paramsSummary(expanded.algorithm, expanded.params)}</p>
              </div>
              <div className="lightbox-actions">
                <button
                  type="button"
                  className={`star-button ${isStarred(expanded) ? "is-starred" : ""}`}
                  onClick={() => toggleStar(expanded)}
                  aria-label={isStarred(expanded) ? "Unstar variation" : "Star variation"}
                >
                  <StarIcon filled={isStarred(expanded)} />
                </button>
                <button type="button" onClick={() => setExpanded(null)} aria-label="Close">×</button>
              </div>
            </div>
            <div className="lightbox-canvas lightbox-pair">
              <div className="lightbox-pane" data-preview-label="Bones">
                <StructureCanvas
                  regions={expanded.algorithm.run(expanded.params, expanded.seed)}
                  width={Number(expanded.params.width) || 1280}
                  height={Number(expanded.params.height) || 800}
                  gutter={gutter}
                  depthTint={depthTint}
                />
              </div>
              <div className="lightbox-pane" data-preview-label="Inhabited">
                <StructureCanvas
                  regions={expanded.algorithm.run(expanded.params, expanded.seed)}
                  width={Number(expanded.params.width) || 1280}
                  height={Number(expanded.params.height) || 800}
                  gutter={gutter}
                  depthTint={depthTint}
                  inhabited
                  seed={expanded.seed}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
