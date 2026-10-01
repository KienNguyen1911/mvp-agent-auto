# 01 - VISION & SYSTEM BOUNDARIES

## 1. Goal
Provide a minimal, reliable **Thin Orchestration Bridge** that enables **Codex CLI**, **AGY CLI**, and **OpenCode CLI** to autonomously coordinate and hand off tasks until acceptance criteria are satisfied.

The user provides a single objective prompt. The bridge handles task assignment, CLI execution, output normalization, and cross-agent handoffs without requiring manual copy-pasting or direct agent-to-agent coupling.

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

## 2. Core Philosophy
1. **Thin Orchestration**: The bridge only does 4 things:
   - Receive task / objective
   - Invoke agent CLI via dedicated adapter
   - Normalize output into structured JSON contract
   - Forward structured handoff packet to the next agent
2. **Decoupled Agents**: No agent ever calls another agent directly. Agents only talk to the Bridge via a unified contract.
3. **Bounded Context**: We never dump raw multi-thousand token transcripts between agents. The Bridge compiles lightweight **Handoff Packets** (1-2k tokens) to prevent context bloat and speed degradation.
4. **File-based State**: Fast, transparent execution logs and artifacts stored in `.orchestrator/` using plain JSON and JSONL.

## 3. Explicit Non-Goals (MVP)
To maintain velocity and prevent over-engineering, the following are strictly out-of-scope for the MVP:
- ❌ No LangGraph, CrewAI, Temporal, or heavyweight workflow engines
- ❌ No Kubernetes, Docker clustering, or distributed workers
- ❌ No Vector DB, semantic embeddings, or long-term vector memory
- ❌ No direct Agent-to-Agent (A2A) network protocols
- ❌ No complex dynamic DAG schedulers or non-deterministic AI routing
- ❌ No concurrent write access to the repository (only one active writer at a time)
