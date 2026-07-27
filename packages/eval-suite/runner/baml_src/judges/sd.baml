type SDRequestedChangeStatus = "satisfied" | "partial" | "missed"
type SDChangeKind = "object" | "connection" | "annotation" | "document"
type SDChangeClassification = "requested" | "necessary_accommodation" | "collateral_rework"
type SDChangeImpact = "none" | "minor" | "major" | "destructive"
type SDEvidenceSource = "instruction"
  | "pre_json"
  | "post_json"
  | "diff"
  | "pre_png"
  | "post_png"
  | "commit_summary"
type SDEditScoringStatus = "scored" | "excluded_refusal"

class SDEvidence {
  source SDEvidenceSource
  locator string
  observation string
}

class SDRequestedChangeAssessment {
  requirement string
  status SDRequestedChangeStatus
  evidence SDEvidence[]
  note string
}

class SDChangeAssessment {
  object_id string
  object_kind SDChangeKind
  classification SDChangeClassification
  what_changed string
  impact SDChangeImpact
  declared bool
  evidence SDEvidence[]
}

class ScopeDisciplineEditVerdict {
  requested_changes SDRequestedChangeAssessment[]
  changes SDChangeAssessment[]
  collateral_change_count int
  scope_summary string
  scoring_status SDEditScoringStatus
  exclusion_reason string?
  score float?
}

template_string ScopeDisciplinePrompt(
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) #"
  {{ _.role("system") }}
  You are the SD scope-discipline judge for one freeform follow-up edit. Apply the
  supplied shared rules and SD rubric exactly. Derive scope only from the supplied
  edit instruction. Use only the embedded pre/post JSON and deterministic diff, the
  commit summary, and the attached pre/post PNGs. Do not invent invariants or infer
  requirements from an unseen original brief.

  <shared_rules>
  {{ shared_rules }}
  </shared_rules>

  <axis_rubric>
  {{ rubric }}
  </axis_rubric>

  {{ _.role("user") }}
  <axis_input_payload>
  {{ payload }}
  </axis_input_payload>

  <attached_image_payloads>
  {% for attached_image in attached_images %}
  <attached_image index="{{ loop.index }}">
  {{ attached_image }}
  </attached_image>
  {% endfor %}
  </attached_image_payloads>

  Return one requested_changes row for every atomic ask. Classify every changed,
  added, or removed object, connection, annotation, or document-level property in the
  changes list. Every row needs precise evidence. collateral_change_count must equal
  the number of collateral_rework rows. If the edit was honestly refused with no
  scope change, return excluded_refusal and a null score; otherwise return scored and
  the rubric score.

  {{ ctx.output_format }}
"#

template_string ScopeDisciplinePromptAfterError(
  previous_error: string,
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) #"
  {{ _.role("system") }}
  You are the SD scope-discipline judge for one freeform follow-up edit. Apply the
  supplied shared rules and SD rubric exactly. Derive scope only from the supplied
  edit instruction. Use only the embedded pre/post JSON and deterministic diff, the
  commit summary, and the attached pre/post PNGs. Do not invent invariants or infer
  requirements from an unseen original brief.

  <shared_rules>
  {{ shared_rules }}
  </shared_rules>

  <axis_rubric>
  {{ rubric }}
  </axis_rubric>

  <retry_context>
  The previous response failed structured parsing or validation. Correct only its
  schema, enum, field-name, nullability, and output-format mistakes. Do not mention
  the error in the response.
  <previous_error>
  {{ previous_error }}
  </previous_error>
  </retry_context>

  {{ _.role("user") }}
  <axis_input_payload>
  {{ payload }}
  </axis_input_payload>

  <attached_image_payloads>
  {% for attached_image in attached_images %}
  <attached_image index="{{ loop.index }}">
  {{ attached_image }}
  </attached_image>
  {% endfor %}
  </attached_image_payloads>

  Return one requested_changes row for every atomic ask. Classify every changed,
  added, or removed object, connection, annotation, or document-level property in the
  changes list. Every row needs precise evidence. collateral_change_count must equal
  the number of collateral_rework rows. If the edit was honestly refused with no
  scope change, return excluded_refusal and a null score; otherwise return scored and
  the rubric score.

  {{ ctx.output_format }}
"#

function JudgeScopeDiscipline(
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) -> ScopeDisciplineEditVerdict {
  client JudgeClient
  prompt #"
    {{ ScopeDisciplinePrompt(rubric, shared_rules, payload, attached_images) }}
  "#
}

function JudgeScopeDisciplineAfterError(
  previous_error: string,
  rubric: string,
  shared_rules: string,
  payload: string,
  attached_images: image[]
) -> ScopeDisciplineEditVerdict {
  client JudgeClient
  prompt #"
    {{ ScopeDisciplinePromptAfterError(previous_error, rubric, shared_rules, payload, attached_images) }}
  "#
}
