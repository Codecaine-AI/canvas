# SF blind system reconstruction

## SYSTEM PURPOSE
A numbered operational map for a chat-assistant rollout covering customer chat input safety, turn-context assembly, guarded replies and actions, conversation distillation, transcript retention, champion/challenger experimentation, approval, live monitoring, promotion, and rollback.

## COMPONENTS
- 2026-07-29-eval-202743 · chat-assistant-rollout: Names the depicted rollout/evaluation board. [The title at the top reads “2026-07-29-eval-202743 · chat-assistant-rollout”.]
- 1 · Channels & input safety: Groups the customer, chat channel, and input-safety guardrail. [The first numbered region is labeled “1 · Channels & input safety” and contains Customer, Web + mobile chat, and Input safety.]
- Customer: Represents the person participating in the chat. [A human icon in region 1 is labeled “Customer”.]
- Web + mobile chat: Provides the conversation or message surface on web and mobile. [A message icon in region 1 is labeled “Web + mobile chat”.]
- Input safety: Acts as the safety gate for input. [A guardrail shield icon in region 1 is labeled “Input safety”.]
- 2 · Turn context assembly: Assembles profile data, transcript data, and searched help articles into model context. [The second region is labeled “2 · Turn context assembly”; its payload reads “Profile + transcript + searched help articles → model context”.]
- Turn-context store: Represents a store associated with turn-context assembly. [A blue memory/store icon appears in region 2 beside the context-assembly payload.]
- Model context: Receives the assembled profile, transcript, and searched help articles. [The region 2 payload explicitly ends with “→ model context”.]
- 3 · Guarded reply & actions: Provides guarded model replies, safe fallback, credentialed billing/account actions, and human handoff. [The third region is labeled “3 · Guarded reply & actions”; its payload reads “Guarded model reply • safe fallback • credentialed billing/account actions • human handoff”.]
- Guarded model reply: Produces a model reply under guarding. [The region 3 payload explicitly lists “Guarded model reply”.]
- Safe fallback: Provides a safe fallback outcome. [The region 3 payload explicitly lists “safe fallback”.]
- Credentialed billing/account actions: Performs billing or account actions that require credentials. [The region 3 payload explicitly lists “credentialed billing/account actions”.]
- Human handoff: Transfers handling to a human. [The region 3 payload explicitly lists “human handoff”.]
- 4 · Conversation distillation: Distills a transcript into sourced profile facts. [The fourth region is labeled “4 · Conversation distillation”; its payload reads “Transcript → distilled, sourced profile facts”.]
- 5 · Retention & compliance: Moves expired transcripts to cold archive. [The fifth region is labeled “5 · Retention & compliance”; its payload reads “Expired transcripts → cold archive”.]
- Cold archive: Receives expired transcripts. [The region 5 payload explicitly names “cold archive” as the destination of expired transcripts.]
- 6 · Champion & challengers: Maintains versioned champion/challenger configuration and serves one variant to sampled traffic. [The sixth region is labeled “6 · Champion & challengers”; its payload reads “Versioned config: champion + challengers” and “Sampled traffic serves one variant”.]
- Versioned config: Defines the champion and challenger variants across prompt, retrieval policy, and model. [The region 6 payload states “Versioned config: champion + challengers” followed by “Prompt • retrieval policy • model”.]
- Champion: Acts as the current champion variant and remains available as the prior champion after an approved challenger is promoted. [Region 6 names a “champion”; region 8 states “Approved challenger becomes champion; prior champion enables one-step rollback”.]
- Challengers: Provide alternative variants for sampled serving, evaluation, approval, monitoring, promotion, or removal. [Region 6 names “challengers”; region 7 requires an experiment report per challenger; region 8 describes pulling or promoting a challenger.]
- 7 · Evaluation & approval: Uses automated judges, produces an experiment report for each challenger, and has a product owner approve or reject promotion. [The seventh region is labeled “7 · Evaluation & approval” and lists automated judges, an experiment report per challenger, and product-owner approval or rejection.]
- Automated judges: Judge resolution, grounding, and tone. [The region 7 payload reads “Automated judges: resolution • grounding • tone”.]
- Experiment report: Reports experiment results separately for each challenger. [The region 7 payload states “Experiment report per challenger”.]
- Product owner: Approves or rejects promotion. [The region 7 payload states “Product owner approves or rejects promotion”.]
- 8 · Live monitoring & rollback: Tracks independent live metrics by variant, immediately pulls a challenger upon regression, promotes approved challengers, and preserves one-step rollback through the prior champion. [The eighth region is labeled “8 · Live monitoring & rollback” and explicitly describes per-variant metrics, regression removal, promotion, and rollback.]
- Independent live metrics by variant: Measures resolution, handoff, and safety independently for each variant. [The region 8 payload reads “Independent live metrics by variant: resolution • handoff • safety”.]

## FLOWS
- control · Numbered board ordering: 1 · Channels & input safety → 2 · Turn context assembly → 3 · Guarded reply & actions → 4 · Conversation distillation → 5 · Retention & compliance → 6 · Champion & challengers → 7 · Evaluation & approval → 8 · Live monitoring & rollback [The board regions are explicitly numbered 1 through 8 with these labels.]
- data · Model-context assembly: Profile → Transcript → Searched help articles → Model context [Region 2 explicitly reads “Profile + transcript + searched help articles → model context”.]
- data · Conversation distillation: Transcript → Distilled, sourced profile facts [Region 4 explicitly reads “Transcript → distilled, sourced profile facts”.]
- data · Expired-transcript retention: Expired transcripts → Cold archive [Region 5 explicitly reads “Expired transcripts → cold archive”.]
- control · Variant serving: Versioned config contains champion and challengers → Sampled traffic serves one variant [Region 6 states “Versioned config: champion + challengers” and “Sampled traffic serves one variant”.]
- control · Challenger evaluation and promotion decision: Automated judges evaluate resolution, grounding, and tone → An experiment report is produced per challenger → The product owner approves or rejects promotion [These three ordered lines appear in region 7 under “Evaluation & approval”.]
- control · Approved challenger promotion: A challenger is approved → The approved challenger becomes champion → The prior champion remains available to enable one-step rollback [Region 8 states “Approved challenger becomes champion; prior champion enables one-step rollback”.]
- data · Live variant observation: Observe independent live metrics by variant → Measure resolution → Measure handoff → Measure safety [Region 8 states “Independent live metrics by variant: resolution • handoff • safety”.]
- failure · Regression response: A regression occurs → Pull the challenger immediately [Region 8 explicitly reads “Any regression → pull challenger immediately”.]

## FAILURE PATHS
- Any regression: A regression is observed in live operation → The challenger is pulled immediately → The challenger is removed from live serving immediately. [Region 8 explicitly states “Any regression → pull challenger immediately”.]
- Product owner rejects promotion: Automated judges assess resolution, grounding, and tone → An experiment report is produced for the challenger → The product owner rejects promotion → Promotion is rejected. [Region 7 states “Automated judges: resolution • grounding • tone”, “Experiment report per challenger”, and “Product owner approves or rejects promotion”.]

## CONSTRAINTS & BOUNDARIES
- Inputs are within an explicit input-safety boundary. [Region 1 is titled “Channels & input safety” and contains an “Input safety” guardrail icon.]
- Model context is composed from profile, transcript, and searched help articles. [Region 2 reads “Profile + transcript + searched help articles → model context”.]
- Billing/account actions are credentialed. [Region 3 explicitly lists “credentialed billing/account actions”.]
- Conversation-derived profile facts are both distilled and sourced. [Region 4 reads “Transcript → distilled, sourced profile facts”.]
- Only expired transcripts are explicitly directed to cold archive. [Region 5 reads “Expired transcripts → cold archive”.]
- Champion and challenger configuration is versioned. [Region 6 states “Versioned config: champion + challengers”.]
- Sampled traffic serves one variant. [Region 6 explicitly states “Sampled traffic serves one variant”.]
- Variant dimensions include prompt, retrieval policy, and model. [Region 6 lists “Prompt • retrieval policy • model”.]
- Automated judging covers resolution, grounding, and tone. [Region 7 states “Automated judges: resolution • grounding • tone”.]
- There is one experiment report per challenger. [Region 7 states “Experiment report per challenger”.]
- Promotion requires a product-owner approve-or-reject decision. [Region 7 states “Product owner approves or rejects promotion”.]
- Live metrics are independent by variant and cover resolution, handoff, and safety. [Region 8 states “Independent live metrics by variant: resolution • handoff • safety”.]
- Any regression requires immediate challenger removal. [Region 8 states “Any regression → pull challenger immediately”.]
- An approved challenger becomes champion. [Region 8 explicitly states “Approved challenger becomes champion”.]
- The prior champion must enable one-step rollback. [Region 8 explicitly states “prior champion enables one-step rollback”.]

## UNCERTAIN
- The eight regions are numbered in a semantic sequence.: No visible connecting edges run between the regions, so the numbers preserve ordering but do not prove a direct then-edge from each region to the next.
- Customer, Web + mobile chat, and Input safety appear together in region 1.: No visible edges specify direction or standing relationships among these three components.
- A blue memory/store icon appears in region 2.: The icon has no readable label and no visible edge; the picture does not specify exactly what it stores or whether it is read, written, or both.
- Region 3 lists guarded model reply, safe fallback, credentialed billing/account actions, and human handoff.: The bullet-separated items have no arrows or branch labels, so their mutual ordering and triggering conditions are not shown.
- The board specifies safe fallback and human handoff.: No explicit trigger or failure condition is shown for either outcome.
- The product owner approves or rejects promotion.: The picture does not show the criteria, thresholds, or subsequent route after rejection beyond the rejection of promotion itself.
- The prior champion enables one-step rollback.: The trigger that executes rollback and the exact rollback routing are not drawn; only the retained capability is stated.
