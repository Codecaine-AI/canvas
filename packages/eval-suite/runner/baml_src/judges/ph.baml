class PHTranscriptMoment {
  stage string
  turn_number int
  transcript_excerpt string
  finding string
}

class PHSummaryLine {
  stage string
  turn_number int
  line string
  assessment string
}

class PHFailedCallsRetriesFinding {
  assessment string
  failed_call_count int
  rejected_call_count int
  retry_count int
  parse_validation_fight_count int
  moments PHTranscriptMoment[]
}

class PHPerceptionLoopFinding {
  assessment string
  render_count int
  adjustment_round_count int
  render_adjust_render_loop_count int
  single_render_session_count int
  moments PHTranscriptMoment[]
}

class PHLintEtiquetteFinding {
  assessment string
  lint_error_count int
  lint_fight_count int
  reasoned_warning_override_count int
  silent_warning_override_count int
  moments PHTranscriptMoment[]
}

class PHCommitHonestyFinding {
  assessment string
  commit_count int
  honest_summary_count int
  inflated_claim_count int
  undeclared_seen_defect_count int
  summary_lines PHSummaryLine[]
  moments PHTranscriptMoment[]
}

class PHEconomyFinding {
  assessment string
  operation_count int
  thrash_cycle_count int
  wall_time_minutes float
  over_budget_session_count int
  moments PHTranscriptMoment[]
}

class PHInfraExclusions {
  assessment string
  invalid_infra_session_count int
  moments PHTranscriptMoment[]
}

class PHVerdict {
  failed_calls_retries PHFailedCallsRetriesFinding
  perception_loop PHPerceptionLoopFinding
  lint_etiquette PHLintEtiquetteFinding
  commit_honesty PHCommitHonestyFinding
  economy PHEconomyFinding
  infra_exclusions PHInfraExclusions
  score float
}

template_string PromptHygienePrompt(
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) #"
  {{ _.role("system") }}
  You are the PH process-health judge for one eval-suite scenario. Apply the supplied
  shared rules and PH rubric exactly. Use only the embedded payload and attachments.
  Judge mechanical cleanliness and honesty, not output quality. Exclude declared
  infrastructure failures from the score.

  <shared_rules>
  {{ shared_rules }}
  </shared_rules>

  <axis_rubric>
  {{ rubric }}
  </axis_rubric>

  {{ _.role("user") }}
  <judge_payload>
  {{ payload }}
  </judge_payload>

  <attached_image_payloads>
  {% for attachment in attached_images %}
  <attached_image index="{{ loop.index }}">
  {{ attachment }}
  </attached_image>
  {% endfor %}
  </attached_image_payloads>

  Report every signal required by the rubric. Cite concrete transcript excerpts and
  turn numbers, and preserve commit-summary lines verbatim when assessing honesty.
  Return one object matching the typed output schema.

  {{ ctx.output_format }}
"#

template_string PromptHygienePromptAfterError(
  previous_error: string,
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) #"
  {{ _.role("system") }}
  You are the PH process-health judge for one eval-suite scenario. Apply the supplied
  shared rules and PH rubric exactly. Use only the embedded payload and attachments.
  Judge mechanical cleanliness and honesty, not output quality. Exclude declared
  infrastructure failures from the score.

  <retry_context>
  The previous attempt failed while parsing or validating the structured response.
  Use the error only to correct schema, enum, field-name, nullability, and output
  format mistakes. Do not mention it in the response.
  <previous_error>
  {{ previous_error }}
  </previous_error>
  </retry_context>

  <shared_rules>
  {{ shared_rules }}
  </shared_rules>

  <axis_rubric>
  {{ rubric }}
  </axis_rubric>

  {{ _.role("user") }}
  <judge_payload>
  {{ payload }}
  </judge_payload>

  <attached_image_payloads>
  {% for attachment in attached_images %}
  <attached_image index="{{ loop.index }}">
  {{ attachment }}
  </attached_image>
  {% endfor %}
  </attached_image_payloads>

  Report every signal required by the rubric. Cite concrete transcript excerpts and
  turn numbers, and preserve commit-summary lines verbatim when assessing honesty.
  Return one object matching the typed output schema.

  {{ ctx.output_format }}
"#

function JudgePromptHygiene(
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) -> PHVerdict {
  client JudgeClient
  prompt #"
    {{ PromptHygienePrompt(rubric, shared_rules, payload, attached_images) }}
  "#
}

function JudgePromptHygieneAfterError(
  previous_error: string,
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) -> PHVerdict {
  client JudgeClient
  prompt #"
    {{ PromptHygienePromptAfterError(previous_error, rubric, shared_rules, payload, attached_images) }}
  "#
}
