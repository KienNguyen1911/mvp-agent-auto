import { AgentRole } from "./TaskEnvelope.js";

export type AgentName = "codex" | "agy" | "opencode" | "mock";

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
  durationMs?: number;
}
