# Thin Orchestration Bridge (Codex • AGY • OpenCode)

A minimal, high-velocity multi-agent orchestration bridge that connects **Codex CLI**, **AGY CLI**, and **OpenCode CLI** through a unified data contract.

Agents do not execute each other directly. Instead, they communicate with a central bridge process through structured **Task Envelopes**, **Agent Results**, and **Handoff Packets**.

---

## Architecture Overview

```text
                 ┌─────────────────┐
                 │     BRIDGE      │
                 │   Node.js/TS    │
                 └────────┬────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
        Codex Adapter  AGY Adapter  OpenCode Adapter
              │           │           │
              ▼           ▼           ▼
         codex CLI     agy CLI    opencode CLI
```

### Golden Workflow

```text
               USER (Objective Prompt)
                         │
                         ▼
                  ┌─────────────┐
                  │     AGY     │  (Planner)
                  │   Planner   │
                  └──────┬──────┘
                         │ Task + Acceptance Criteria
                         ▼
                  ┌─────────────┐
                  │  OpenCode   │◄─────────────────────────┐
                  │ Implementer │                          │
                  └──────┬──────┘                          │
                         │ Files changed + Test evidence   │ (Verification FAIL)
                         ▼                                 │ Loop <= 3
                  ┌─────────────┐                          │
                  │    Codex    │                          │
                  │  Verifier   │                          │
                  └──────┬──────┘                          │
                         │                                 │
                     [Verdict]                             │
                     /       \                             │
            (PASS)  /         \ (FAIL)                     │
                   ▼           ▼                           │
                [ DONE ]   [ Loop <= 3? ] ─── YES ─────────┘
                               │
                               │ NO (> 3)
                               ▼
                       [ HUMAN_REQUIRED ]
```

---

## Documentation & Protocol Specs

Complete technical specifications are organized under [`docs/`](file:///D:/Dev/mvp-agent-auto/docs):

1. [**01-VISION.md**](file:///D:/Dev/mvp-agent-auto/docs/01-VISION.md): High-level system boundary, goals, and explicit non-goals.
2. [**02-AGENT-CONTRACT.md**](file:///D:/Dev/mvp-agent-auto/docs/02-AGENT-CONTRACT.md): Protocol data schemas (`TaskEnvelope`, `AgentResult`).
3. [**03-HANDOFF-PROTOCOL.md**](file:///D:/Dev/mvp-agent-auto/docs/03-HANDOFF-PROTOCOL.md): Context compaction rules to prevent quadratic transcript explosion.
4. [**04-AGENT-CAPABILITIES.md**](file:///D:/Dev/mvp-agent-auto/docs/04-AGENT-CAPABILITIES.md): CLI invocation models and default role mappings.
5. [**05-WORKFLOW.md**](file:///D:/Dev/mvp-agent-auto/docs/05-WORKFLOW.md): Golden path lifecycle and verification retry state machine.
6. [**06-FAILURE-POLICY.md**](file:///D:/Dev/mvp-agent-auto/docs/06-FAILURE-POLICY.md): Deterministic failure matrix, process crash handling, and escalation.

Prompt templates are located under [`prompts/`](file:///D:/Dev/mvp-agent-auto/prompts):
- [`prompts/planner.md`](file:///D:/Dev/mvp-agent-auto/prompts/planner.md)
- [`prompts/implementer.md`](file:///D:/Dev/mvp-agent-auto/prompts/implementer.md)
- [`prompts/verifier.md`](file:///D:/Dev/mvp-agent-auto/prompts/verifier.md)
- [`prompts/handoff.md`](file:///D:/Dev/mvp-agent-auto/prompts/handoff.md)

---

## Quick Start

### 1. Check Tool Availability in PATH

Verify that `agy`, `opencode`, and `codex` CLIs are installed and reachable:

```bash
npm run check
# or
node dist/cli.js check
```

Output:
```text
🔍 Diagnosing CLI Tools Availability in System PATH...

• Checking AGY CLI (agy)... ✅ OK
• Checking OpenCode CLI (opencode)... ✅ OK
• Checking Codex CLI (codex)... ✅ OK

✨ All 3 CLIs are installed and ready for autonomous orchestration!
```

---

### 2. Run Autonomous Multi-Agent Pipeline

#### Live Mode (Invokes Real CLI Agents)

```bash
npm start -- run "Fix retry race condition in task scheduler"
```

#### Mock Simulation Mode (Zero Token Cost / Offline Testing)

```bash
npm start -- run "Fix retry race condition in task scheduler" --mock
```

#### Simulate Verification Retry Loop (Mock Mode)

```bash
# Simulates 1 failed verification by Codex, causing automatic handoff back to OpenCode before passing:
npm start -- run "Fix race condition" --mock --simulate-fail 1

# Simulates repeated failures triggering HUMAN_REQUIRED escalation when exceeding max loops:
npm start -- run "Impossible task" --mock --simulate-fail 99 --max-loops 2
```

---

### 3. Run Test Suite

```bash
npm test
```

Executes 18 automated unit and integration tests covering:
- JSON parsing and Markdown fence extraction (`tests/protocol.test.ts`)
- Static router state transitions and role resolution (`tests/routing.test.ts`)
- FileStateStore persistence, runs, and `events.jsonl` append logs (`tests/state.test.ts`)
- Full autonomous Golden Flow, retry loops, and failure escalation (`tests/runner.test.ts`)

---

## Shared Working State: `.orchestrator/`

Every execution creates an isolated run bundle under `.orchestrator/runs/<runId>/`:

```text
.orchestrator/
└── runs/
    └── run-2026-09-30T18-34-47/
        ├── run.json                  # Overall run metadata, status, duration
        ├── events.jsonl              # Chronological event log
        ├── tasks/                    # Serialized TaskEnvelope inputs
        │   ├── task-01.json
        │   ├── task-02.json
        │   └── task-03.json
        ├── results/                  # Serialized AgentResult outputs
        │   ├── task-01.agy.json
        │   ├── task-02.opencode.json
        │   └── task-03.codex.json
        ├── handoffs/                 # Compressed handoff packets between steps
        │   ├── handoff-task-01-xxx.json
        │   └── handoff-task-02-yyy.json
        └── logs/                     # Raw agent CLI outputs for audit
            ├── task-01.agy.log
            └── task-02.opencode.log
```
