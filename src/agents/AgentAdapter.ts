import { TaskEnvelope, AgentRole } from "../protocol/TaskEnvelope.js";
import { AgentResult, AgentName } from "../protocol/AgentResult.js";

export interface AgentAdapter {
  readonly name: AgentName;
  readonly defaultRole: AgentRole;

  execute(task: TaskEnvelope): Promise<AgentResult>;
  healthCheck(): Promise<boolean>;
  cancel(): Promise<void>;
}

export function buildAgentPrompt(
  task: TaskEnvelope,
  systemInstructions: string
): string {
  const criteriaList =
    task.acceptanceCriteria.length > 0
      ? task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "- Meet all specified requirements.";

  const filesList =
    task.inputs?.files && task.inputs.files.length > 0
      ? task.inputs.files.map((f) => `- ${f}`).join("\n")
      : "None explicitly provided.";

  let prompt = `${systemInstructions}\n\n`;
  prompt += `================== TASK ASSIGNMENT ==================\n`;
  prompt += `TASK ID: ${task.taskId}\n`;
  prompt += `RUN ID: ${task.runId}\n`;
  prompt += `ROLE: ${task.requestedRole}\n`;
  prompt += `ITERATION: ${task.iteration}${task.maxIterations ? " / " + task.maxIterations : ""}\n`;
  prompt += `WORKING DIRECTORY: ${task.workingDirectory}\n`;
  prompt += `OBJECTIVE:\n${task.objective}\n\n`;

  if (task.context) {
    prompt += `CONTEXT & HANDOFF FROM PREVIOUS STEP:\n${task.context}\n\n`;
  }

  prompt += `RELEVANT FILES:\n${filesList}\n\n`;
  prompt += `ACCEPTANCE CRITERIA:\n${criteriaList}\n\n`;
  prompt += `CRITICAL FINAL STEP:\n`;
  prompt += `When all edits and local verification commands are complete, your VERY LAST MESSAGE must be a valid JSON object in a \`\`\`json\`\`\` block matching this format:\n`;
  prompt += `\`\`\`json\n`;
  prompt += `{\n`;
  prompt += `  "taskId": "${task.taskId}",\n`;
  prompt += `  "runId": "${task.runId}",\n`;
  prompt += `  "agent": "<your-agent-name>",\n`;
  prompt += `  "role": "${task.requestedRole}",\n`;
  prompt += `  "status": "completed",\n`;
  prompt += `  "summary": "<summary of what was done>",\n`;
  prompt += `  "findings": ["<key finding or detail>"],\n`;
  prompt += `  "filesChanged": ["<path/to/modified/file>"],\n`;
  prompt += `  "commandsExecuted": ["<command executed>"]\n`;
  prompt += `}\n`;
  prompt += `\`\`\`\n`;
  prompt += `=====================================================\n`;

  return prompt;
}
