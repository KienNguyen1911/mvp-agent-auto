# 02 - AGENT CONTRACT SPECIFICATION

The bridge interacts with all agent CLIs through two fundamental JSON data contracts: `TaskEnvelope` (input to agent) and `AgentResult` (output from agent).

## 1. TaskEnvelope (Input)

```ts
export type AgentRole =
  | "planner"
  | "investigator"
  | "implementer"
  | "reviewer"
  | "verifier";

export interface TaskInputs {
  files?: string[];
  artifacts?: string[];
  environment?: Record<string, string>;
}

export interface TaskEnvelope {
  taskId: string;
  runId: string;
  objective: string;
  context?: string;
  workingDirectory: string;
  acceptanceCriteria: string[];
  inputs?: TaskInputs;
  requestedRole: AgentRole;
  iteration: number;
  maxIterations?: number;
  previousResults?: AgentResultSummary[];
}

export interface AgentResultSummary {
  agent: "codex" | "agy" | "opencode";
  role: AgentRole;
  status: AgentStatus;
  summary: string;
  findings?: string[];
  filesChanged?: string[];
  verificationPassed?: boolean;
}
```

## 2. AgentResult (Output)

```ts
export type AgentName = "codex" | "agy" | "opencode";

export type AgentStatus =
  | "completed"
  | "blocked"
  | "failed"
  | "needs_followup";

export interface VerificationReport {
  passed: boolean;
  evidence: string[];
}

export interface NextActionRecommendation {
  recommendedAgent?: AgentName;
  role?: AgentRole;
  instruction: string;
}

export interface AgentResult {
  taskId: string;
  runId: string;
  agent: AgentName;
  role: AgentRole;
  status: AgentStatus;
  summary: string;
  findings?: string[];
  filesChanged?: string[];
  commandsExecuted?: string[];
  verification?: VerificationReport;
  nextAction?: NextActionRecommendation;
  rawOutput?: string;
}
```

## 3. Contract Invariants
1. `taskId` and `runId` must be strictly preserved across all operations.
2. If `status` is `"completed"` and role is `"verifier"`, `verification.passed` MUST be explicitly set.
3. Every agent response must be parseable as an `AgentResult` object.
