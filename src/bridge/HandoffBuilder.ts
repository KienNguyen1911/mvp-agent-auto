import { AgentResult } from "../protocol/AgentResult.js";
import { TaskEnvelope, AgentRole } from "../protocol/TaskEnvelope.js";
import { AgentHandoff } from "../protocol/AgentHandoff.js";

export class HandoffBuilder {
  /**
   * Constructs a compact AgentHandoff packet from the previous step result.
   */
  public static buildHandoff(
    previousTask: TaskEnvelope,
    previousResult: AgentResult,
    toAgent: AgentResult["agent"],
    toRole: AgentRole,
    reason: string
  ): AgentHandoff {
    const handoffId = `handoff-${previousTask.taskId}-${Date.now().toString(36)}`;

    const relevantFiles = [
      ...(previousTask.inputs?.files || []),
      ...(previousResult.filesChanged || []),
    ];
    // Deduplicate
    const uniqueFiles = Array.from(new Set(relevantFiles));

    const recommendedAction =
      previousResult.nextAction?.instruction ||
      `Proceed with ${toRole} role on objective: ${previousTask.objective}`;

    const verificationCriteria =
      previousResult.verification?.evidence && !previousResult.verification.passed
        ? previousResult.verification.evidence
        : previousTask.acceptanceCriteria;

    return {
      handoffId,
      runId: previousTask.runId,
      taskId: previousTask.taskId,
      fromAgent: previousResult.agent,
      toAgent,
      role: toRole,
      reason,
      summary: previousResult.summary,
      findings: previousResult.findings || [],
      relevantFiles: uniqueFiles,
      recommendedAction,
      verificationCriteria,
      iteration: previousTask.iteration,
    };
  }

  /**
   * Formats the AgentHandoff into a clean, compact markdown text for the next TaskEnvelope.context
   */
  public static formatHandoffContext(handoff: AgentHandoff): string {
    const findingsStr =
      handoff.findings.length > 0
        ? handoff.findings.map((f) => `- ${f}`).join("\n")
        : "- None recorded.";

    const filesStr =
      handoff.relevantFiles.length > 0
        ? handoff.relevantFiles.map((f) => `- ${f}`).join("\n")
        : "- None modified yet.";

    const criteriaStr =
      handoff.verificationCriteria.length > 0
        ? handoff.verificationCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
        : "- Fulfill core objective.";

    return [
      `### Handoff Packet (${handoff.fromAgent} -> ${handoff.toAgent})`,
      `**Reason:** ${handoff.reason}`,
      `**Summary of Previous Step:** ${handoff.summary}`,
      `**Findings:**\n${findingsStr}`,
      `**Relevant / Modified Files:**\n${filesStr}`,
      `**Criteria / Evidence to address:**\n${criteriaStr}`,
      `**Recommended Action:** ${handoff.recommendedAction}`,
    ].join("\n\n");
  }
}
