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

export interface AgentResultSummary {
  agent: "codex" | "agy" | "opencode" | "mock";
  role: AgentRole;
  status: "completed" | "blocked" | "failed" | "needs_followup";
  summary: string;
  findings?: string[];
  filesChanged?: string[];
  verificationPassed?: boolean;
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
