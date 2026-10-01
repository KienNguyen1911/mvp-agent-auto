import { AgentName, AgentResult } from "../protocol/AgentResult.js";
import { AgentRole, TaskEnvelope } from "../protocol/TaskEnvelope.js";
import { AgentAdapter } from "../agents/AgentAdapter.js";

export interface RoutingDecision {
  nextAgent: AgentName;
  nextRole: AgentRole;
  isTerminal: boolean;
  terminalStatus?: "COMPLETED" | "FAILED" | "BLOCKED" | "HUMAN_REQUIRED";
  reason: string;
}

export class StaticRouter {
  private adapters: Map<AgentName, AgentAdapter>;
  private maxVerificationLoops: number;

  constructor(adapters: AgentAdapter[], maxVerificationLoops = 3) {
    this.adapters = new Map(adapters.map((a) => [a.name, a]));
    this.maxVerificationLoops = maxVerificationLoops;
  }

  /**
   * Resolves the adapter instance for a given role or agent name
   */
  public resolveAdapter(role: AgentRole, preferredAgent?: AgentName): AgentAdapter {
    if (preferredAgent && this.adapters.has(preferredAgent)) {
      return this.adapters.get(preferredAgent)!;
    }

    // Default capability mapping
    switch (role) {
      case "planner":
        return this.getAdapterOrFallback(["agy", "codex", "opencode", "mock"]);
      case "implementer":
        return this.getAdapterOrFallback(["opencode", "codex", "agy", "mock"]);
      case "verifier":
      case "reviewer":
      case "investigator":
        return this.getAdapterOrFallback(["codex", "opencode", "agy", "mock"]);
      default:
        return this.adapters.values().next().value!;
    }
  }

  private getAdapterOrFallback(preference: AgentName[]): AgentAdapter {
    for (const name of preference) {
      const adapter = this.adapters.get(name);
      if (adapter) return adapter;
    }
    // Return first available adapter
    const first = this.adapters.values().next().value;
    if (!first) {
      throw new Error("No agent adapters registered in StaticRouter.");
    }
    return first;
  }

  /**
   * Computes the next routing step based on the outcome of an agent's execution.
   */
  public determineNextStep(
    lastResult: AgentResult,
    currentIteration: number
  ): RoutingDecision {
    // If agent explicitly blocked or failed
    if (lastResult.status === "blocked") {
      return {
        nextAgent: lastResult.agent,
        nextRole: lastResult.role,
        isTerminal: true,
        terminalStatus: "BLOCKED",
        reason: `Agent reported blocked: ${lastResult.summary}`,
      };
    }

    if (lastResult.status === "failed") {
      return {
        nextAgent: lastResult.agent,
        nextRole: lastResult.role,
        isTerminal: true,
        terminalStatus: "FAILED",
        reason: `Agent failed: ${lastResult.summary}`,
      };
    }

    // Golden path transitions:
    // 1. Planner completed -> Handoff to Implementer
    if (lastResult.role === "planner") {
      const nextAgentName = lastResult.nextAction?.recommendedAgent || "opencode";
      const adapter = this.resolveAdapter("implementer", nextAgentName);
      return {
        nextAgent: adapter.name,
        nextRole: "implementer",
        isTerminal: false,
        reason: "Planning completed. Handing off to implementer.",
      };
    }

    // 2. Implementer completed -> Handoff to Verifier
    if (lastResult.role === "implementer") {
      const nextAgentName = lastResult.nextAction?.recommendedAgent || "codex";
      const adapter = this.resolveAdapter("verifier", nextAgentName);
      return {
        nextAgent: adapter.name,
        nextRole: "verifier",
        isTerminal: false,
        reason: "Implementation completed. Handing off to verifier.",
      };
    }

    // 3. Verifier completed -> Check verification verdict
    if (lastResult.role === "verifier") {
      const passed = lastResult.verification?.passed === true;

      if (passed) {
        return {
          nextAgent: lastResult.agent,
          nextRole: "verifier",
          isTerminal: true,
          terminalStatus: "COMPLETED",
          reason: "Verification passed! All acceptance criteria satisfied.",
        };
      }

      // Verification failed
      if (currentIteration >= this.maxVerificationLoops) {
        return {
          nextAgent: lastResult.agent,
          nextRole: "verifier",
          isTerminal: true,
          terminalStatus: "HUMAN_REQUIRED",
          reason: `Verification failed ${currentIteration} times, exceeding max allowed loops (${this.maxVerificationLoops}). Escalating to human.`,
        };
      }

      // Route back to implementer for a fix cycle
      const nextAgentName = lastResult.nextAction?.recommendedAgent || "opencode";
      const adapter = this.resolveAdapter("implementer", nextAgentName);
      return {
        nextAgent: adapter.name,
        nextRole: "implementer",
        isTerminal: false,
        reason: `Verification failed on attempt ${currentIteration}. Returning to implementer to address issues.`,
      };
    }

    // Default fallback
    return {
      nextAgent: lastResult.agent,
      nextRole: lastResult.role,
      isTerminal: true,
      terminalStatus: "COMPLETED",
      reason: "Execution concluded.",
    };
  }
}
