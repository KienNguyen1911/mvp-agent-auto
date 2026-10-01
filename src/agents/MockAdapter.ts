import { AgentAdapter } from "./AgentAdapter.js";
import { TaskEnvelope, AgentRole } from "../protocol/TaskEnvelope.js";
import { AgentResult, AgentName } from "../protocol/AgentResult.js";

export interface MockBehaviorConfig {
  simulateVerificationFailureCount?: number;
  shouldTimeout?: boolean;
  shouldError?: boolean;
}

export class MockAdapter implements AgentAdapter {
  public readonly name: AgentName;
  public readonly defaultRole: AgentRole;
  private behavior: MockBehaviorConfig;
  private verificationFailureCount = 0;

  constructor(
    name: AgentName = "mock",
    defaultRole: AgentRole = "planner",
    behavior: MockBehaviorConfig = {}
  ) {
    this.name = name;
    this.defaultRole = defaultRole;
    this.behavior = behavior;
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async execute(task: TaskEnvelope): Promise<AgentResult> {
    // Delay slightly to simulate real execution
    await new Promise((r) => setTimeout(r, 50));

    if (this.behavior.shouldError) {
      return {
        taskId: task.taskId,
        runId: task.runId,
        agent: this.name,
        role: task.requestedRole,
        status: "failed",
        summary: "Simulated agent process crash.",
        findings: ["Mock crash triggered."],
        durationMs: 50,
      };
    }

    if (task.requestedRole === "planner") {
      return {
        taskId: task.taskId,
        runId: task.runId,
        agent: this.name,
        role: "planner",
        status: "completed",
        summary: `Analyzed objective: "${task.objective}". Formulated architecture plan and acceptance criteria.`,
        findings: [
          "Identified target files and component boundaries.",
          "Derived 3 testable acceptance criteria.",
        ],
        filesChanged: [],
        commandsExecuted: [],
        nextAction: {
          recommendedAgent: "opencode",
          role: "implementer",
          instruction: "Implement components according to architectural plan and run test suite.",
        },
        durationMs: 50,
      };
    }

    if (task.requestedRole === "implementer") {
      return {
        taskId: task.taskId,
        runId: task.runId,
        agent: this.name,
        role: "implementer",
        status: "completed",
        summary: `Implemented changes for task: "${task.objective}". Executed build and unit tests.`,
        findings: [
          "Source files generated/modified.",
          "Unit test runner executed with 0 errors.",
        ],
        filesChanged: ["src/feature.ts", "tests/feature.test.ts"],
        commandsExecuted: ["npm test"],
        verification: {
          passed: true,
          evidence: ["Local tests passed with exit code 0"],
        },
        nextAction: {
          recommendedAgent: "codex",
          role: "verifier",
          instruction: "Verify implementation against all acceptance criteria.",
        },
        durationMs: 75,
      };
    }

    if (task.requestedRole === "verifier") {
      const maxSimulatedFailures = this.behavior.simulateVerificationFailureCount ?? 0;
      if (this.verificationFailureCount < maxSimulatedFailures) {
        this.verificationFailureCount++;
        return {
          taskId: task.taskId,
          runId: task.runId,
          agent: this.name,
          role: "verifier",
          status: "completed",
          summary: `Verification failed on attempt ${this.verificationFailureCount}. Edge cases unsatisfied.`,
          findings: [
            "Acceptance criteria partially met, but edge case test failed.",
          ],
          filesChanged: [],
          commandsExecuted: ["npm test -- --coverage"],
          verification: {
            passed: false,
            evidence: [
              `Regression test failed on iteration ${task.iteration}: expected 200 OK, got 500.`,
            ],
          },
          nextAction: {
            recommendedAgent: "opencode",
            role: "implementer",
            instruction: "Fix regression failure in edge case handling.",
          },
          durationMs: 60,
        };
      }

      return {
        taskId: task.taskId,
        runId: task.runId,
        agent: this.name,
        role: "verifier",
        status: "completed",
        summary: `Verification passed successfully. All acceptance criteria satisfied.`,
        findings: [
          "All acceptance criteria validated.",
          "Code review passed without regressions.",
        ],
        filesChanged: [],
        commandsExecuted: ["npm test"],
        verification: {
          passed: true,
          evidence: [
            "All unit and integration tests passed.",
            "Static analysis checks passed with 0 warnings.",
          ],
        },
        nextAction: {
          instruction: "Task completed.",
        },
        durationMs: 60,
      };
    }

    return {
      taskId: task.taskId,
      runId: task.runId,
      agent: this.name,
      role: task.requestedRole,
      status: "completed",
      summary: "Generic task completed.",
      durationMs: 40,
    };
  }

  public async cancel(): Promise<void> {}
}
