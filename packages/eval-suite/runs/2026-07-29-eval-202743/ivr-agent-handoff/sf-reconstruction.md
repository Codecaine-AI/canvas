# SF blind system reconstruction

## SYSTEM PURPOSE
Handle an inbound voice call by identifying the caller, selecting a personalized or generic greeting, capturing consent and intent, routing reliable and policy-allowed intents to an AI voice agent, handing unresolved, person-requested, or risky cases to a human-support path, and feeding recordings and transcripts into a quality-review policy loop.

## COMPONENTS
- 1 · Inbound & identity: Region containing inbound-call identification, caller lookup, and the account-found branch. [The upper-left region is explicitly titled "1 · Inbound & identity" and contains "Inbound call", "Caller lookup", and "Account found?".]
- Inbound call: Provide the incoming voice-call entry point. [A voice/telephone icon is labeled "Inbound call" at the start of the identity flow.]
- Caller lookup: Look up the caller using the inbound identifier. [A search icon labeled "Caller lookup" receives an arrow from "Inbound call" labeled "ANI".]
- Account found?: Branch according to whether the caller lookup found an account. [A decision diamond labeled "Account found?" follows "Caller lookup".]
- 1b · Greeting & context: Region selecting and delivering either a personalized or generic greeting before consent capture. [The lower-left region is titled "1b · Greeting & context" and contains the two message surfaces "Personalized greeting" and "Generic greeting".]
- Personalized greeting: Provide a caller-specific greeting when routed to this branch. [A message icon labeled "Personalized greeting" receives a blue incoming arrow from the account-decision area.]
- Generic greeting: Provide a non-personalized greeting when account lookup does not produce an account. [A message icon labeled "Generic greeting" receives the gray branch labeled "no / lookup failed".]
- 2 · Consent & intent: Region capturing consent, accepting speech or keypad input, testing intent reliability, and routing reliable intent. [The upper-middle region is titled "2 · Consent & intent" and contains "Consent capture", "Speech / keypad intent", and "Intent reliable?".]
- Consent capture: Apply a consent or safety gate before subsequent intent handling and provide material for recording/transcription. [A guardrail icon labeled "Consent capture" receives the greeting paths, points to "Speech / keypad intent", and has a blue downward line labeled "record + transcribe".]
- Speech / keypad intent: Collect the caller's intent through voice or keypad input. [A voice/telephone icon labeled "Speech / keypad intent" follows "Consent capture" and points downward to the intent decision.]
- Intent reliable?: Decide whether the collected intent is reliable enough to route onward. [A decision diamond labeled "Intent reliable?" receives the intent-input flow and has a teal outgoing route toward the AI voice agent.]
- 3 · AI self-service: Region where an AI voice agent uses read-only account facts and authorized actions. [The upper-right region is titled "3 · AI self-service" and contains "AI voice agent", "Read-only account facts", and "Authorized actions".]
- AI voice agent: Handle routed caller intent through automated voice self-service, read account facts, invoke authorized actions, and escalate specified cases. [An agent icon labeled "AI voice agent" receives the teal "routine intent" route and the dashed orange policy route; dashed links labeled "read" and "act" connect it to account facts and actions, while an orange downward path is labeled "unresolved / person / risk".]
- Read-only account facts: Provide account information for the AI voice agent without exposing a write operation. [A search icon labeled "Read-only account facts" is connected to the AI voice agent by a dashed line labeled "read".]
- Authorized actions: Provide the set of actions the AI voice agent is permitted to perform. [A tool icon labeled "Authorized actions" is connected after "Read-only account facts" by a dashed line labeled "act".]
- 4 · Human handoff: Region queuing escalated work, checking whether an agent is available in target, and routing to support or a callback offer. [The lower-right region is titled "4 · Human handoff" and contains "Human queue", "Agent available in target?", "Support agent", "Offer callback", and a handoff payload note.]
- Human queue: Queue cases escalated from AI self-service for human handling. [A queue icon labeled "Human queue" receives the orange vertical escalation path from the AI voice agent.]
- Handoff: transcript · account · intent · work done: Define the visible information package accompanying a human handoff. [A note adjacent to the human queue reads "Handoff: transcript · account · intent · work done".]
- Agent available in target?: Branch according to target-agent availability after human queuing. [A decision diamond labeled "Agent available in target?" follows the human queue.]
- Support agent: Receive the handoff on the green branch of the availability decision. [A human icon labeled "Support agent" is reached by a green line from "Agent available in target?".]
- Offer callback: Offer a callback on the orange branch of the availability decision. [A voice/telephone icon labeled "Offer callback" is reached by an orange line from "Agent available in target?".]
- 5 · Quality review & policy loop: Region receiving recordings and transcripts, performing quality review, and adjusting allowed-intent policy. [The lower-middle region is titled "5 · Quality review & policy loop" and contains "Recordings + transcripts", "Quality review", and "Allowed intent policy".]
- Recordings + transcripts: Hold recorded and transcribed interaction artifacts for review. [A multiple-documents icon labeled "Recordings + transcripts" receives the blue line labeled "record + transcribe" from consent capture.]
- Quality review: Review selected recordings and transcripts, including items marked unresolved or abandoned. [A human icon labeled "Quality review" receives an orange dashed arrow from "Recordings + transcripts" labeled "unresolved / abandoned".]
- Allowed intent policy: Represent the policy scope of intents allowed for AI handling and feed that policy to the AI voice agent. [A config/gear icon labeled "Allowed intent policy" receives an orange path from quality review labeled "adjust scope" and sends a dashed orange route labeled "allowed intents" to the AI voice agent.]

## FLOWS
- control · Inbound identification: Inbound call → ANI → Caller lookup → Account found? [Gray arrows run from "Inbound call" to "Caller lookup" with the on-line label "ANI", then from the lookup to the "Account found?" decision.]
- control · Account-found greeting path: Account found? → Personalized greeting → Consent capture [A blue branch descends from the account-decision area to "Personalized greeting"; a blue routed line then reaches "Consent capture".]
- failure · Lookup-failure greeting path: Account found? → no / lookup failed → Generic greeting → Consent capture [The gray branch from "Account found?" is explicitly labeled "no / lookup failed", enters "Generic greeting", and then routes to "Consent capture".]
- control · Consent and intent routing: Consent capture → Speech / keypad intent → Intent reliable? → routine intent → AI voice agent [Gray arrows connect consent capture to speech/keypad intent and then to the reliability decision; a teal route labeled "routine intent" points into the AI voice agent.]
- data · Interaction recording and transcription: Consent capture → record + transcribe → Recordings + transcripts [A blue downward line from "Consent capture" is labeled "record + transcribe" and terminates at "Recordings + transcripts".]
- data · AI account-fact access: AI voice agent → read → Read-only account facts [A dashed gray connection from the AI voice agent toward the account-facts node carries the label "read".]
- control · AI authorized action access: AI voice agent → Read-only account facts → act → Authorized actions [The displayed dashed gray chain runs across the account-facts node toward the tool node, with "read" before "Read-only account facts" and "act" before "Authorized actions".]
- failure · AI escalation to human queue: AI voice agent → unresolved / person / risk → Human queue [An orange vertical arrow descends from the AI voice agent into the human-handoff region and is labeled "unresolved / person / risk".]
- control · Human handoff availability routing: Human queue → Agent available in target? → Support agent or Offer callback [A gray arrow connects "Human queue" to the availability decision; a green branch runs to "Support agent" and an orange branch runs to "Offer callback".]
- failure · Quality-review selection: Recordings + transcripts → unresolved / abandoned → Quality review [An orange dashed arrow from the documents node to the quality-review human is labeled "unresolved / abandoned".]
- control · Policy adjustment loop: Quality review → adjust scope → Allowed intent policy → allowed intents → AI voice agent [An orange route from quality review to the policy gear is labeled "adjust scope"; a dashed orange route labeled "allowed intents" loops from the policy area to an arrow entering the AI voice agent.]
- data · Human handoff payload: transcript → account → intent → work done → Human handoff context [The note beside the queue explicitly lists "Handoff: transcript · account · intent · work done".]

## FAILURE PATHS
- No account is found or caller lookup fails.: Account found? → no / lookup failed → Generic greeting → Consent capture → The caller receives a generic greeting and continues to consent capture. [The branch leaving the account decision is labeled "no / lookup failed" and points to "Generic greeting", whose route continues to "Consent capture".]
- The AI case is unresolved, the caller requests a person, or risk is detected.: AI voice agent → unresolved / person / risk → Human queue → Agent available in target? → The case enters human handoff and is evaluated for target-agent availability. [The orange path from the AI voice agent is labeled "unresolved / person / risk", enters "Human queue", and then proceeds to "Agent available in target?".]
- The availability decision takes the orange branch.: Agent available in target? → Offer callback → A callback is offered. [An orange branch leaves the right side of "Agent available in target?" and terminates at the voice/telephone node labeled "Offer callback".]
- A recording or transcript is categorized as unresolved or abandoned.: Recordings + transcripts → unresolved / abandoned → Quality review → adjust scope → Allowed intent policy → The item enters quality review, which can adjust the scope of allowed-intent policy. [The documents-to-review dashed line is labeled "unresolved / abandoned", and the review-to-policy route is labeled "adjust scope".]

## CONSTRAINTS & BOUNDARIES
- Caller lookup uses ANI as the explicitly labeled inbound identifier. [The arrow between "Inbound call" and "Caller lookup" is labeled "ANI".]
- A failed or negative lookup must use the generic-greeting branch. [The account-decision branch labeled "no / lookup failed" points to "Generic greeting".]
- Consent capture precedes speech/keypad intent handling in the depicted sequence. [The arrow from "Consent capture" points to "Speech / keypad intent".]
- Routine intent reaches AI self-service only through the "Intent reliable?" decision route shown. [The teal line labeled "routine intent" leaves the reliability decision and points to the AI voice agent.]
- Account facts exposed to the AI are read-only. [The account-information node is explicitly labeled "Read-only account facts", and its connection is labeled "read".]
- The AI's action surface is limited to authorized actions. [The tool node is explicitly labeled "Authorized actions" and is reached through the connection labeled "act".]
- The AI self-service scope is governed by allowed intents. [A dashed orange route labeled "allowed intents" runs from "Allowed intent policy" to the AI voice agent.]
- Human handoff carries transcript, account, intent, and work-done context. [The handoff note explicitly lists "transcript · account · intent · work done".]
- Human routing tests whether an agent is available in the target. [The queue routes to the decision "Agent available in target?" before either the support-agent or callback endpoint.]
- Quality review can adjust the scope of the allowed-intent policy. [The orange connection from "Quality review" to "Allowed intent policy" is labeled "adjust scope".]

## UNCERTAIN
- The blue branch from "Account found?" reaches "Personalized greeting".: The branch itself has no readable on-line outcome label; interpreting it as the positive or yes outcome is structurally likely but not explicitly written.
- Only the teal route from "Intent reliable?" is drawn toward the AI voice agent.: No explicit branch label such as yes/no and no alternate outcome for unreliable intent are visible.
- The green availability branch reaches "Support agent" and the orange branch reaches "Offer callback".: Neither branch has a readable yes/no outcome label, so the exact condition assigned to each color is not explicitly stated.
- The AI, account facts, and authorized actions appear in a dashed left-to-right chain labeled "read" and "act".: Small arrowheads or directional markers on the dashed gray links are not fully clear at image resolution; only the displayed ordering and labels are certain.
- The handoff payload note is adjacent to the human queue.: No explicit connector line visibly attaches the note to a particular node, so its exact edge ownership is not shown beyond its placement in the human-handoff region.
- The orange dashed allowed-intents route loops from the policy area into the AI voice agent.: The route direction into the AI is visible, but the long loop crosses region boundaries without intermediate nodes, and no additional meaning beyond "allowed intents" is shown.
