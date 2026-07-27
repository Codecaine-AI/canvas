---
covers: Complete copy-paste XML template for instruction artifacts
type: template
concepts: [reference-template, xml-structure, purpose, workflow, output-format]
depends-on: [system_prompt/10-base-template.md, system_prompt/11-formatting-rules.md]
---

# Reference Template

The complete structure with inline documentation. Works for system prompts, agent definitions, skills, and workflow files.

```xml
<!--
  PURPOSE
  Format: Bullet list (2-4 items)

  Define the model's core reason for being in this interaction.
  - Use evocative, precise language (not generic roles)
  - State the mission, not the identity
  - Include why success matters

  BAD: "You are a helpful assistant"
  GOOD: "Expert technical writer specializing in simplifying complex cloud concepts"
-->
<purpose>
    - [Primary mission statement with specific domain]
    - [Secondary objective that supports the mission]
    - [Why successful completion matters]
</purpose>

<!--
  KEY KNOWLEDGE
  Format: Bullet list (3-6 items)

  Specify the essential skills, expertise, or information to prioritize.
  - Be specific about domains of knowledge
  - Include frameworks, methodologies, or standards
  - List technical competencies if relevant
-->
<key_knowledge>
    - [Domain expertise area 1]
    - [Specific frameworks or methodologies]
    - [Technical competencies or tools]
</key_knowledge>

<!--
  GOAL
  Format: Bullet list (2-4 items)

  State the ultimate, strategic objective - not procedural steps.
  - Focus on the high-level outcome
  - What does "done well" look like?
  - Include quality criteria
-->
<goal>
    - [Primary deliverable or outcome]
    - [Quality criteria for success]
    - [How to measure completion]
</goal>

<!--
  BACKGROUND
  Format: Bullet list (3-5 items)

  Explain the why: situational context, history, motivation.
  This is the differentiator that resolves ambiguity toward true objectives.

  Include:
  - Why the task needs to be done
  - What larger context it operates within
  - What pain point it solves
  - What are the stakes or implications
-->
<background>
    - [Current situation or problem]
    - [Why this matters / stakes involved]
    - [Larger context or process this fits into]
    - [Pain point being solved]
</background>

<!--
  WORKFLOW
  Format: Nested XML structure

  The explicit steps, constraints, and output format.

  Why explicit steps matter:
  1. Inject Expertise: Your methodology overrides model defaults
  2. Control & Reliability: Explicit algorithms constrain processing
  3. Iteration Points: Test, tweak, and debug specific steps

  DON'T: "1. Read input 2. Think about it 3. Generate output"
  DO: Describe WHAT to do, HOW to do it, and WHY it matters.
-->
<workflow>
    <!--
      OVERVIEW
      Format: Numbered list of phases (order matters here)

      High-level outline of main phases or stages.
      Give the model a mental map of the process.
    -->
    <overview>
        1. [First major stage]
        2. [Second major stage]
        3. [Final stage / synthesis]
    </overview>

    <!--
      INPUTS
      Format: Named inputs with type and required/optional designation

      Define the variables the model will receive at runtime.
      Each input has a name, type, and whether it's required.
    -->
    <inputs>
        <input name="[input_name]" type="[type]" required="true">
            [Description of what this input contains and how to use it]
        </input>
        <input name="[optional_input]" type="[type]" required="false">
            [Description and when this input is provided]
        </input>
    </inputs>

    <!--
      EXECUTION STRUCTURE
      Choose ONE based on workflow type:

      - Phases: Multi-turn workflows with external actions (tool calls, state updates, user input)
      - Steps:  Single-completion workflows where reasoning is internal

      See: 20-workflow-design/10-base.md for detailed tag reference
    -->

    <!-- OPTION A: PHASES (multi-turn / agent definitions / interactive workflows) -->
    <phases>
        <phase id="1" name="[phase_name]">
            <description>
                [What this phase accomplishes and why]
            </description>
            <steps>
                - [What happens in this phase]
                - [Next action in this phase]
                - [Next action in this phase]
            </steps>
            <constraints>
                - [Rules that apply ONLY to this phase]
            </constraints>
        </phase>

        <phase id="2" name="[next_phase]">
            <steps>
                - [Actions for this phase]
            </steps>
            <!-- constraints optional if no phase-specific rules -->
        </phase>
    </phases>

    <!-- OPTION B: STEPS (single-completion / internal reasoning) -->
    <steps>
        <step name="[action_verb]">
            <description>
                - [What to do in this step]
                - [How to do it - specific logic or transformation]
                - [Why it matters for the overall goal]
            </description>
            <constraints>
                - [Rules that apply ONLY to this step]
                - [Limits or edge case handling]
            </constraints>
        </step>

        <step name="[next_action]">
            <description>
                - [Processing logic for this step]
            </description>
            <!-- constraints optional if no step-specific rules -->
        </step>
    </steps>

    <!--
      GLOBAL CONSTRAINTS
      Format: Bullet list

      Rules that apply universally across all steps.
      Tone, style, formatting rules, things to avoid.
    -->
    <global_constraints>
        - [Universal tone/style requirement]
        - [What to always do]
        - [What to never do]
    </global_constraints>

    <!--
      OUTPUT FORMAT
      Format: Structured schema (bullets, JSON, or XML)

      Specify the required structure of the final output.
      Define fields, data types, and expected content.
    -->
    <output_format>
        - [Section 1]: [description of content]
        - [Section 2]: [description of content]
        - [Section 3]: [description of content]
    </output_format>
</workflow>

<!--
  IMPORTANT RULES (Optional)
  Format: Numbered list (3-5 items max)

  Critical constraints that must not be violated.
  Numbered for emphasis and easy reference.
  Reserve for truly critical rules - overuse dilutes impact.
-->
<important_rules>
    1. [Critical safety or quality constraint]
    2. [Non-negotiable behavior requirement]
    3. [Hard boundary or limitation]
</important_rules>
```

## Quick Reference

| Section | Purpose | Format |
|---------|---------|--------|
| `<purpose>` | Mission statement, not role | 2-4 bullet points |
| `<key_knowledge>` | Domain expertise to prioritize | 3-6 bullet points |
| `<goal>` | Ultimate success condition | 2-4 bullet points |
| `<background>` | The WHY - context and motivation | 3-5 bullet points |
| `<workflow>` | Execution structure | Nested XML |
| `<overview>` | High-level phase map | Numbered list |
| `<inputs>` | Variables received at runtime | Named input elements with type/required |
| `<phases>` | Multi-turn execution units (agent/interactive workflows) | Named phase blocks with steps |
| `<steps>` | Single-completion reasoning units (internal processing) | Named step blocks |
| `<global_constraints>` | Universal rules | Bullet list |
| `<output_format>` | Output structure | Schema definition |
| `<important_rules>` | Critical constraints (optional) | 3-5 numbered items |
