# 05 - GOLDEN WORKFLOW & LIFECYCLE

## 1. Flow Diagram

```text
               USER
                 │ (Objective prompt)
                 ▼
          ┌─────────────┐
          │     AGY     │ (Role: planner)
          │   Planner   │
          └──────┬──────┘
                 │ Plan + Acceptance Criteria
                 ▼
          ┌─────────────┐
          │  OpenCode   │◄─────────────────────────┐
          │ Implementer │                          │
          └──────┬──────┘                          │
                 │ Files changed + Test evidence   │ (Verification FAIL)
                 ▼                                 │ Loop count <= 3
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

## 2. Step-by-Step Execution Sequence

1. **Initialization**:
   - User invokes `orchestrator-bridge run "<objective>"`.
   - Bridge assigns `runId` (e.g. `run-20261001-013000-xyz`) and initializes `.orchestrator/runs/<runId>/`.
   - Task `task-01` is minted with `requestedRole = "planner"`, routed to **AGY**.

2. **Planning Phase (AGY)**:
   - AGY generates architectural steps, key files, and acceptance criteria.
   - Bridge records `task-01.agy.json` in `results/`.
   - Bridge builds Handoff `handoff-01` -> OpenCode.

3. **Implementation Phase (OpenCode)**:
   - OpenCode receives `TaskEnvelope` with role `"implementer"`.
   - OpenCode writes files, executes builds/tests, and returns changed files + commands run.
   - Bridge records `task-02.opencode.json`.
   - Bridge builds Handoff `handoff-02` -> Codex.

4. **Verification Phase (Codex)**:
   - Codex verifies repository status against acceptance criteria.
   - If `verification.passed === true`:
     - Bridge marks the run as `COMPLETED`.
     - Output summary delivered to user.
   - If `verification.passed === false`:
     - Verification loop counter increments (`iteration++`).
     - If `iteration > MAX_VERIFICATION_LOOPS` (default 3):
       - Run enters `HUMAN_REQUIRED` state and halts safely.
     - Else:
       - Bridge sends failure details + recommendations back to **OpenCode** as a targeted fix task.
