import type {
  AnyJudgeEnvelope,
  CraftVerdict,
  PHTranscriptMoment,
  PHVerdict,
  ReadabilityVerdict,
  RequirementCoverageVerdict,
  ScopeDisciplineVerdict,
  SkippedVerdict,
  SystemFidelityVerdict,
  SystemReconstruction,
} from "../contract.ts";

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replaceAll("|", "\\|").replace(/\s*\n\s*/g, " ");
}

function scoreText(score: number | null): string {
  return score === null ? "SKIPPED" : Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);
}

function isSkipped(verdict: unknown): verdict is SkippedVerdict {
  return typeof verdict === "object"
    && verdict !== null
    && typeof (verdict as Record<string, unknown>).skipped_reason === "string";
}

function evidenceList(evidence: Array<{ source: string; locator: string; observation: string }>): string {
  return evidence.map((item) => `${item.source}:${item.locator} — ${item.observation}`).join("; ");
}

function renderVisual(verdict: ReadabilityVerdict | CraftVerdict): string[] {
  return [
    `Rationale: ${verdict.score_rationale}`,
    "",
    "| sub-check | score | finding |",
    "|---|---:|---|",
    ...verdict.sub_checks.map((item) => `| ${cell(item.name)} | ${cell(item.score)} | ${cell(item.note)} |`),
  ];
}

function renderSf(verdict: SystemFidelityVerdict): string[] {
  return [
    `Strongest transmitted behavior: ${verdict.strongest_transmitted_behavior}`,
    "",
    `Most consequential loss: ${verdict.most_consequential_loss}`,
    "",
    `Summary: ${verdict.overall_summary}`,
    "",
    "| brief element | importance | main flow | status | brief evidence | reconstruction evidence | note |",
    "|---|---|---|---|---|---|---|",
    ...verdict.elements.map((item) =>
      `| ${cell(item.brief_element)} | ${cell(item.importance)} | ${cell(item.is_main_end_to_end_flow)} | ${cell(item.status)} | ${cell(item.brief_evidence)} | ${cell(item.reconstruction_evidence)} | ${cell(item.note)} |`
    ),
    "",
    "## Unsupported reconstruction claims",
    "",
    "| claim | reconstruction evidence | why unsupported |",
    "|---|---|---|",
    ...verdict.unsupported_claims.map((item) =>
      `| ${cell(item.claim)} | ${cell(item.reconstruction_evidence)} | ${cell(item.why_unsupported)} |`
    ),
  ];
}

function renderRc(verdict: RequirementCoverageVerdict): string[] {
  const caps = verdict.caps_applied.length > 0
    ? verdict.caps_applied
      .map((cap) => `${cap.cap} via ${cap.requirement_id}: ${cap.reason}`)
      .join("; ")
    : "none";
  return [
    `Weighted coverage: ${cell(verdict.coverage_fraction)} · Caps applied: ${caps}`,
    "",
    `Strongest covered cluster: ${verdict.strongest_covered_cluster}`,
    "",
    `Most consequential gap: ${verdict.most_consequential_gap}`,
    "",
    `Summary: ${verdict.coverage_summary}`,
    "",
    "| id | requirement | importance | status | brief evidence | board evidence | note |",
    "|---|---|---|---|---|---|---|",
    ...verdict.requirements.map((item) =>
      `| ${cell(item.id)} | ${cell(item.requirement)} | ${cell(item.importance)} | ${cell(item.status)} | ${cell(item.brief_evidence)} | ${cell(evidenceList(item.representation_evidence))} | ${cell(item.note)} |`
    ),
  ];
}

function renderSd(verdict: ScopeDisciplineVerdict): string[] {
  const lines: string[] = [];
  for (const edit of verdict.edits) {
    lines.push(
      `## ${edit.stage} — ${edit.verdict.scoring_status} (${scoreText(edit.verdict.score)})`,
      "",
      `Scope summary: ${edit.verdict.scope_summary}`,
      "",
      `Collateral changes: ${edit.verdict.collateral_change_count}`,
      "",
      "| requested change | status | note | evidence |",
      "|---|---|---|---|",
      ...edit.verdict.requested_changes.map((item) =>
        `| ${cell(item.requirement)} | ${cell(item.status)} | ${cell(item.note)} | ${cell(evidenceList(item.evidence))} |`
      ),
      "",
      "| object | kind | classification | change | impact | declared | evidence |",
      "|---|---|---|---|---|---|---|",
      ...edit.verdict.changes.map((item) =>
        `| ${cell(item.object_id)} | ${cell(item.object_kind)} | ${cell(item.classification)} | ${cell(item.what_changed)} | ${cell(item.impact)} | ${cell(item.declared)} | ${cell(evidenceList(item.evidence))} |`
      ),
      "",
    );
    if (edit.verdict.exclusion_reason) {
      lines.push(`Exclusion: ${edit.verdict.exclusion_reason}`, "");
    }
  }
  return lines;
}

function renderMoments(moments: PHTranscriptMoment[]): string {
  return moments
    .map((moment) => `${moment.stage} turn ${moment.turn_number}: ${moment.finding} [${moment.transcript_excerpt}]`)
    .join("; ");
}

function renderPh(verdict: PHVerdict): string[] {
  const failed = verdict.failed_calls_retries;
  const perception = verdict.perception_loop;
  const lint = verdict.lint_etiquette;
  const honesty = verdict.commit_honesty;
  const economy = verdict.economy;
  const infra = verdict.infra_exclusions;
  return [
    "| signal | counts | finding | transcript evidence |",
    "|---|---|---|---|",
    `| failed calls & retries | failed ${failed.failed_call_count}; rejected ${failed.rejected_call_count}; retries ${failed.retry_count}; parse fights ${failed.parse_validation_fight_count} | ${cell(failed.assessment)} | ${cell(renderMoments(failed.moments))} |`,
    `| perception loop | renders ${perception.render_count}; adjustments ${perception.adjustment_round_count}; loops ${perception.render_adjust_render_loop_count}; single-render sessions ${perception.single_render_session_count} | ${cell(perception.assessment)} | ${cell(renderMoments(perception.moments))} |`,
    `| lint etiquette | errors ${lint.lint_error_count}; fights ${lint.lint_fight_count}; reasoned overrides ${lint.reasoned_warning_override_count}; silent overrides ${lint.silent_warning_override_count} | ${cell(lint.assessment)} | ${cell(renderMoments(lint.moments))} |`,
    `| commit honesty | commits ${honesty.commit_count}; honest ${honesty.honest_summary_count}; inflated ${honesty.inflated_claim_count}; undeclared seen defects ${honesty.undeclared_seen_defect_count} | ${cell(honesty.assessment)} | ${cell(renderMoments(honesty.moments))} |`,
    `| economy | ops ${economy.operation_count}; thrash ${economy.thrash_cycle_count}; wall ${economy.wall_time_minutes} min; over budget ${economy.over_budget_session_count} | ${cell(economy.assessment)} | ${cell(renderMoments(economy.moments))} |`,
    `| infra exclusions | sessions ${infra.invalid_infra_session_count} | ${cell(infra.assessment)} | ${cell(renderMoments(infra.moments))} |`,
    "",
    "## Commit-summary honesty lines",
    "",
    "| stage | turn | verbatim line | assessment |",
    "|---|---:|---|---|",
    ...honesty.summary_lines.map((line) =>
      `| ${cell(line.stage)} | ${cell(line.turn_number)} | ${cell(line.line)} | ${cell(line.assessment)} |`
    ),
  ];
}

export function renderJudgeMarkdown(envelope: AnyJudgeEnvelope): string {
  const lines = [
    `# ${envelope.axis.toUpperCase()} judge — ${envelope.scenario}`,
    "",
    `Score: ${scoreText(envelope.score)}`,
    "",
    `Run: ${envelope.run_id} · Model: ${envelope.judge.model} · Effort: ${envelope.judge.reasoning_effort} · Function: ${envelope.judge.baml_fn} · Attempts: ${envelope.judge.attempts}`,
    `Usage: ${envelope.usage.input_tokens} input / ${envelope.usage.output_tokens} output tokens`,
    `Flags: ${envelope.flags.length > 0 ? envelope.flags.join(", ") : "none"}`,
    "",
  ];
  if (isSkipped(envelope.verdict)) {
    lines.push(`Skipped: ${envelope.verdict.skipped_reason}`);
  } else if (envelope.axis === "sf") {
    lines.push(...renderSf(envelope.verdict));
  } else if (envelope.axis === "rc") {
    lines.push(...renderRc(envelope.verdict));
  } else if (envelope.axis === "rd" || envelope.axis === "cf") {
    lines.push(...renderVisual(envelope.verdict));
  } else if (envelope.axis === "sd") {
    lines.push(...renderSd(envelope.verdict));
  } else {
    lines.push(...renderPh(envelope.verdict));
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderSystemReconstructionMarkdown(
  reconstruction: SystemReconstruction,
): string {
  return [
    "# SF blind system reconstruction",
    "",
    "## SYSTEM PURPOSE",
    reconstruction.system_purpose,
    "",
    "## COMPONENTS",
    ...reconstruction.components.map((item) =>
      `- ${item.name}: ${item.responsibility} [${item.visible_evidence}]`
    ),
    "",
    "## FLOWS",
    ...reconstruction.flows.map((item) =>
      `- ${item.kind} · ${item.name}: ${item.steps.join(" → ")} [${item.visible_evidence}]`
    ),
    "",
    "## FAILURE PATHS",
    ...reconstruction.failure_paths.map((item) =>
      `- ${item.trigger}: ${item.path.join(" → ")} → ${item.outcome} [${item.visible_evidence}]`
    ),
    "",
    "## CONSTRAINTS & BOUNDARIES",
    ...reconstruction.constraints.map((item) =>
      `- ${item.constraint} [${item.visible_evidence}]`
    ),
    "",
    "## UNCERTAIN",
    ...reconstruction.uncertain.map((item) =>
      `- ${item.observation}: ${item.ambiguity}`
    ),
    "",
  ].join("\n");
}
