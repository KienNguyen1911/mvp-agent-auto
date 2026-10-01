# 03 - HANDOFF PROTOCOL

## 1. The Context Explosion Problem
If Agent A produces 25,000 tokens of raw stdout, thought transcripts, and file diffs, passing all 25k tokens to Agent B causes:
1. Quadratic context bloat
2. Exponentially slower inference
3. Loss of focus / hallucination on stale logs

## 2. Handoff Packet
The Bridge intercepts `AgentResult`, extracts essential findings, changed files, and recommendations, and packages them into a clean, compact **`AgentHandoff`** packet (typically 500-1,500 tokens).

```ts
export interface AgentHandoff {
  handoffId: string;
  runId: string;
  taskId: string;
  fromAgent: AgentName;
  toAgent: AgentName;
  role: AgentRole;
  reason: string;
  summary: string;
  findings: string[];
  relevantFiles: string[];
  recommendedAction: string;
  verificationCriteria: string[];
  iteration: number;
}
```

## 3. Protocol Rules
1. **Bridge is the Decider**: The agent may recommend `nextAction.recommendedAgent`, but the Bridge router determines the definitive next step according to the workflow rules.
2. **Lossless Storage, Lossy Handoff**:
   - The full agent logs and raw outputs are written to `.orchestrator/runs/<runId>/logs/` on disk for debugging.
   - The agent receiving the handoff receives only the structured `AgentHandoff` packet inside its `TaskEnvelope.context`.
3. **Traceability**: Every handoff generates an event in `.orchestrator/runs/<runId>/events.jsonl`:
   ```json
   {"type":"HANDOFF","runId":"run-001","from":"agy","to":"opencode","role":"implementer","reason":"plan completed"}
   ```
