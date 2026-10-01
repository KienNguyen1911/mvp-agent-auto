# 04 - AGENT CAPABILITIES & DEFAULT ROLES

The MVP leverages the specialized strengths of each CLI tool:

| Agent | Primary Role | Secondary Roles | Strengths | CLI Execution Model |
| :--- | :--- | :--- | :--- | :--- |
| **AGY CLI** (`agy`) | `planner` | `investigator` | High-level reasoning, system architecture, task decomposition, acceptance criteria specification | Headless print mode: `agy --print --output-format json --json-schema ... --dangerously-skip-permissions` |
| **OpenCode CLI** (`opencode`) | `implementer` | `investigator` | Fast codebase manipulation, editing files, applying diffs, running unit tests | Non-interactive run: `opencode run -m agnes/agnes-2.5-flash --auto --format json "<prompt>"` |
| **Codex CLI** (`codex`) | `verifier` | `reviewer`, `investigator` | Strict code review, edge-case analysis, test verification, regression validation | Non-interactive exec: `codex exec -m gpt-5.5 --dangerously-bypass-approvals-and-sandbox -o <last_msg_file> "<prompt>"` |

## 1. Role Definitions
- **`planner`**: Evaluates the objective, inspects repository layout, defines concise step-by-step tasks, and specifies verifiable acceptance criteria.
- **`implementer`**: Reads the plan, writes or modifies the necessary files, executes local test commands, and collects evidence of code modifications.
- **`verifier`**: Independently evaluates changed files and test suites against the acceptance criteria, reporting `passed: true` or specific failure evidence.

## 2. Default Capability Mapping
```yaml
roles:
  planner: agy
  implementer: opencode
  verifier: codex
  investigator: codex
  reviewer: codex
```
The Bridge router uses this map to select which adapter executes each stage.
