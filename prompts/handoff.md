# HANDOFF CONTEXT TEMPLATE

The following context represents an active task handoff from a previous agent in the pipeline.

---
## HANDOFF PACKET
- **Run ID**: {{RUN_ID}}
- **Task ID**: {{TASK_ID}}
- **Iteration**: {{ITERATION}} / {{MAX_ITERATIONS}}
- **Previous Agent**: {{FROM_AGENT}} (role: {{FROM_ROLE}})
- **Target Role**: {{TARGET_ROLE}}
- **Objective**: {{OBJECTIVE}}

### Key Findings:
{{FINDINGS}}

### Relevant / Modified Files:
{{RELEVANT_FILES}}

### Acceptance Criteria:
{{ACCEPTANCE_CRITERIA}}

### Recommended Next Action:
{{RECOMMENDED_ACTION}}
---

Please execute your role based on the handoff instructions above, and provide your final result strictly adhering to the JSON schema.
