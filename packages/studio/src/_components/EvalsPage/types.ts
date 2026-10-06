export type EvalRunSummary = {
  run_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  scenario_count: number;
  has_scorecard: boolean;
  mean_score: number | null;
};

export type EvalStage = {
  name: string;
  png: boolean;
};

export type EvalJudge = {
  axis: string;
  score: number | null;
  flags: string[];
};

export type EvalScenarioManifest = {
  scenario: string;
  stages: EvalStage[];
  judges: EvalJudge[];
};

export type ScorecardScenario = {
  id: string;
  label?: string;
  status?: string;
  scores?: Record<string, number | null>;
  flags?: string[];
};

export type Scorecard = {
  status?: string;
  fingerprint?: Record<string, string>;
  sessions?: Record<string, number>;
  axes?: { code: string; order: number }[];
  scenarios?: ScorecardScenario[];
  means?: { scores?: Record<string, number | null>; flags?: string[] };
};

export type RunProgressScenario = {
  status?: string;
  stages_done?: string[];
};

export type RunProgress = {
  status?: string;
  started_at?: string | null;
  finished_at?: string | null;
  scenarios?: Record<string, RunProgressScenario>;
};

export type EvalRunDetail = {
  run_id: string;
  status: string;
  progress: RunProgress | null;
  scorecard: Scorecard | null;
  fingerprint_md: string | null;
  scenarios: EvalScenarioManifest[];
  live: { available: boolean; origin: string } | null;
};

export type Lightbox = { src: string; caption: string };
