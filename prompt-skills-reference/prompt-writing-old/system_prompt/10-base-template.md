---
covers: Canonical XML structure for all instruction artifacts
type: overview
concepts: [base-template, xml-structure, purpose, knowledge, goal, workflow]
depends-on: [system_prompt/00-overview.md]
---

# Base Template

The canonical structure for all instruction artifacts. See [Overview](00-overview.md) for artifact types and pattern selection.

> **File Format**: All prompt artifacts are **Markdown files (.md)** that use XML tags for structure, not actual XML files. Markdown keeps the artifact readable; XML tags provide clear structural boundaries.

## Resources

| Resource | File | Purpose |
|----------|------|---------|
| **Formatting Rules** | `11-formatting-rules.md` | Bullet, numbering, and indentation rules for XML prompt artifacts |
| **Reference Template** | `12-reference-template.md` | Complete copy-paste XML template with inline documentation |

## Canonical Structure

```
Instruction Artifact
├─ Purpose              # Mission, not role
├─ Key Knowledge        # Domain expertise to prioritize
├─ Goal                 # Ultimate success condition
├─ Background           # The WHY - differentiator
├─ Workflow
│   ├─ Overview
│   ├─ Inputs           # Named variables with type + required/optional
│   ├─ Phases / Steps   # Phases for multi-turn, Steps for single-completion
│   ├─ Global Constraints
│   └─ Output Format
└─ Important Rules      # Optional critical numbered constraints
```

## Usage

1. Read `11-formatting-rules.md` before creating or editing a prompt artifact.
2. Copy from `12-reference-template.md`.
3. Remove sections that do not earn their token cost.
4. Adapt workflow structure to the artifact's execution model.
