export const AXIS_CODES = ["sf", "rc", "rd", "cf", "sd", "ph"] as const;

export type AxisCode = (typeof AXIS_CODES)[number];
export type ScenarioId = string;
export type StageId = "stage0" | `e${number}`;
export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";
export const SUT_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
export type SutThinkingLevel = (typeof SUT_THINKING_LEVELS)[number];
export const TOOL_CALL_CAPS = [1, 2, 3] as const;
export type ToolCallCap = (typeof TOOL_CALL_CAPS)[number];
export type ToolCallCapSource = "agent default" | "--tool-call-cap";

export interface JudgeIdentity {
  model: string;
  reasoning_effort: ReasoningEffort;
  baml_fn: string;
  attempts: number;
}

export interface JudgeUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface SkippedVerdict {
  skipped_reason: string;
}

export interface JudgeEnvelope<A extends AxisCode, V> {
  axis: A;
  scenario: ScenarioId;
  run_id: string;
  judge: JudgeIdentity;
  score: number | null;
  verdict: V | SkippedVerdict;
  usage: JudgeUsage;
  flags: string[];
}

export type RDSubCheckName =
  | "corridors_and_air"
  | "grouping"
  | "edge_legibility"
  | "density_and_decomposition";

export type CFSubCheckName =
  | "frame_use"
  | "color"
  | "machinery_leakage"
  | "alignment_and_rhythm";

export interface VisualSubCheck<Name extends string> {
  name: Name;
  score: number;
  note: string;
}

export interface ReadabilityVerdict {
  score: number;
  score_rationale: string;
  sub_checks: Array<VisualSubCheck<RDSubCheckName>>;
}

export interface CraftVerdict {
  score: number;
  score_rationale: string;
  sub_checks: Array<VisualSubCheck<CFSubCheckName>>;
}

export type SFFlowKind = "data" | "control" | "failure";

export interface SFReconstructedComponent {
  name: string;
  responsibility: string;
  visible_evidence: string;
}

export interface SFReconstructedFlow {
  name: string;
  kind: SFFlowKind;
  steps: string[];
  visible_evidence: string;
}

export interface SFReconstructedFailurePath {
  trigger: string;
  path: string[];
  outcome: string;
  visible_evidence: string;
}

export interface SFReconstructedConstraint {
  constraint: string;
  visible_evidence: string;
}

export interface SFReconstructionUncertainty {
  observation: string;
  ambiguity: string;
}

export interface SystemReconstruction {
  system_purpose: string;
  components: SFReconstructedComponent[];
  flows: SFReconstructedFlow[];
  failure_paths: SFReconstructedFailurePath[];
  constraints: SFReconstructedConstraint[];
  uncertain: SFReconstructionUncertainty[];
}

export type SFBriefElementImportance = "system_defining" | "supporting";
export type SFBriefElementStatus = "recovered" | "partial" | "missed" | "contradicted";

export interface SFFidelityElementAssessment {
  brief_element: string;
  brief_evidence: string;
  importance: SFBriefElementImportance;
  is_main_end_to_end_flow: boolean;
  status: SFBriefElementStatus;
  reconstruction_evidence: string;
  note: string;
}

export interface SFUnsupportedClaim {
  claim: string;
  reconstruction_evidence: string;
  why_unsupported: string;
}

export interface SystemFidelityVerdict {
  elements: SFFidelityElementAssessment[];
  unsupported_claims: SFUnsupportedClaim[];
  strongest_transmitted_behavior: string;
  most_consequential_loss: string;
  overall_summary: string;
  score: number;
}

export type RCRequirementImportance = "system_defining" | "supporting";
export type RCRequirementStatus = "represented" | "partial" | "absent" | "contradicted";
export type RCEvidenceSource = "png" | "json";

export interface RCRepresentationEvidence {
  source: RCEvidenceSource;
  locator: string;
  observation: string;
}

export interface RCRequirementAssessment {
  id: string;
  requirement: string;
  brief_evidence: string;
  importance: RCRequirementImportance;
  status: RCRequirementStatus;
  representation_evidence: RCRepresentationEvidence[];
  note: string;
}

export interface RCAppliedCap {
  cap: number;
  requirement_id: string;
  reason: string;
}

export interface RequirementCoverageVerdict {
  requirements: RCRequirementAssessment[];
  coverage_fraction: number;
  caps_applied: RCAppliedCap[];
  strongest_covered_cluster: string;
  most_consequential_gap: string;
  coverage_summary: string;
  score: number;
}

export type SDRequestedChangeStatus = "satisfied" | "partial" | "missed";
export type SDChangeKind = "object" | "connection" | "annotation" | "document";
export type SDChangeClassification =
  | "requested"
  | "necessary_accommodation"
  | "collateral_rework";
export type SDChangeImpact = "none" | "minor" | "major" | "destructive";
export type SDEvidenceSource =
  | "instruction"
  | "pre_json"
  | "post_json"
  | "diff"
  | "pre_png"
  | "post_png"
  | "commit_summary";

export interface SDEvidence {
  source: SDEvidenceSource;
  locator: string;
  observation: string;
}

export interface SDRequestedChangeAssessment {
  requirement: string;
  status: SDRequestedChangeStatus;
  evidence: SDEvidence[];
  note: string;
}

export interface SDChangeAssessment {
  object_id: string;
  object_kind: SDChangeKind;
  classification: SDChangeClassification;
  what_changed: string;
  impact: SDChangeImpact;
  declared: boolean;
  evidence: SDEvidence[];
}

export interface ScopeDisciplineEditVerdict {
  requested_changes: SDRequestedChangeAssessment[];
  changes: SDChangeAssessment[];
  collateral_change_count: number;
  scope_summary: string;
  scoring_status: "scored" | "excluded_refusal";
  exclusion_reason: string | null;
  score: number | null;
}

export interface ScopeDisciplineVerdict {
  edits: Array<{ stage: `e${number}`; verdict: ScopeDisciplineEditVerdict }>;
  score: number;
}

export interface PHTranscriptMoment {
  stage: string;
  turn_number: number;
  transcript_excerpt: string;
  finding: string;
}

export interface PHSummaryLine {
  stage: string;
  turn_number: number;
  line: string;
  assessment: string;
}

export interface PHFailedCallsRetriesFinding {
  assessment: string;
  failed_call_count: number;
  rejected_call_count: number;
  retry_count: number;
  parse_validation_fight_count: number;
  moments: PHTranscriptMoment[];
}

export interface PHPerceptionLoopFinding {
  assessment: string;
  render_count: number;
  adjustment_round_count: number;
  render_adjust_render_loop_count: number;
  single_render_session_count: number;
  moments: PHTranscriptMoment[];
}

export interface PHLintEtiquetteFinding {
  assessment: string;
  lint_error_count: number;
  lint_fight_count: number;
  reasoned_warning_override_count: number;
  silent_warning_override_count: number;
  moments: PHTranscriptMoment[];
}

export interface PHCommitHonestyFinding {
  assessment: string;
  commit_count: number;
  honest_summary_count: number;
  inflated_claim_count: number;
  undeclared_seen_defect_count: number;
  summary_lines: PHSummaryLine[];
  moments: PHTranscriptMoment[];
}

export interface PHEconomyFinding {
  assessment: string;
  operation_count: number;
  thrash_cycle_count: number;
  wall_time_minutes: number;
  over_budget_session_count: number;
  moments: PHTranscriptMoment[];
}

export interface PHInfraExclusions {
  assessment: string;
  invalid_infra_session_count: number;
  moments: PHTranscriptMoment[];
}

export interface PHVerdict {
  failed_calls_retries: PHFailedCallsRetriesFinding;
  perception_loop: PHPerceptionLoopFinding;
  lint_etiquette: PHLintEtiquetteFinding;
  commit_honesty: PHCommitHonestyFinding;
  economy: PHEconomyFinding;
  infra_exclusions: PHInfraExclusions;
  score: number;
}

export type AnyJudgeEnvelope =
  | JudgeEnvelope<"sf", SystemFidelityVerdict>
  | JudgeEnvelope<"rc", RequirementCoverageVerdict>
  | JudgeEnvelope<"rd", ReadabilityVerdict>
  | JudgeEnvelope<"cf", CraftVerdict>
  | JudgeEnvelope<"sd", ScopeDisciplineVerdict>
  | JudgeEnvelope<"ph", PHVerdict>;

export type ScenarioProgressStatus =
  | "pending"
  | "building"
  | "sessions_done"
  | "judging"
  | "graded"
  | "failed"
  | "invalid_infra";

export interface ScenarioProgress {
  status: ScenarioProgressStatus;
  stages_done: StageId[];
  pid: number | null;
  finished_at: string | null;
}

export interface RunProgress {
  run_id: string;
  tier: "system";
  sut_thinking: SutThinkingLevel;
  tool_call_cap: ToolCallCap;
  tool_call_cap_source: ToolCallCapSource;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  scenarios: Record<ScenarioId, ScenarioProgress>;
}

export type ScenarioOutcome =
  | "committed"
  | "rejected"
  | "invalid-infra"
  | "agent-abandon";

export interface ScenarioResult {
  run_id: string;
  scenario: ScenarioId;
  stages: StageId[];
  outcomes: Partial<Record<StageId, ScenarioOutcome>>;
  timings: Partial<Record<StageId, number>>;
  session_ids: Partial<Record<StageId, string>>;
}
