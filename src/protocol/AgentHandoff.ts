import { AgentName } from "./AgentResult.js";
import { AgentRole } from "./TaskEnvelope.js";

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
