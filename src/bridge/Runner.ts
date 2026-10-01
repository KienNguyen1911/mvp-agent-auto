import { Bridge } from "./Bridge.js";
import { StaticRouter } from "../routing/StaticRouter.js";
import { FileStateStore, RunMetadata } from "../state/FileStateStore.js";
import { TaskEnvelope } from "../protocol/TaskEnvelope.js";
import { AgentResult } from "../protocol/AgentResult.js";
import { HandoffBuilder } from "./HandoffBuilder.js";

export interface RunnerOptions {
  objective: string;
  workingDirectory: string;
  maxVerificationLoops?: number;
  runId?: string;
  onStepStart?: (task: TaskEnvelope, agentName: string) => void;
  onStepComplete?: (result: AgentResult) => void;
  onHandoff?: (from: string, to: string, role: string, reason: string) => void;
}

export interface RunnerResult {
  runId: string;
  status: RunMetadata["status"];
  totalIterations: number;
  finalResult?: AgentResult;
  history: AgentResult[];
  runDirectory: string;
}

export class Runner {
  private router: StaticRouter;
  private stateStore: FileStateStore;
  private bridge: Bridge;
  private options: RunnerOptions;
  private isCancelled = false;

  constructor(router: StaticRouter, options: RunnerOptions) {
    this.router = router;
    this.options = options;

    const runId =
      options.runId ||
      `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

    this.stateStore = new FileStateStore(options.workingDirectory, runId);
    this.bridge = new Bridge(this.stateStore);
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  public async run(): Promise<RunnerResult> {
    const {
      objective,
      workingDirectory,
      maxVerificationLoops = 3,
      onStepStart,
      onStepComplete,
      onHandoff,
    } = this.options;

    const runId = (this.stateStore as any).runId;
    await this.stateStore.init(objective, workingDirectory);

    let taskIndex = 1;
    let iteration = 1;
    const history: AgentResult[] = [];

    // 1. Initial TaskEnvelope starting with Planner
    let currentTask: TaskEnvelope = {
      taskId: `task-${String(taskIndex).padStart(2, "0")}`,
      runId,
      objective,
      workingDirectory,
      acceptanceCriteria: [
        "Fulfill the stated objective completely and accurately.",
        "Produce tests or verification evidence.",
      ],
      requestedRole: "planner",
      iteration: 1,
      maxIterations: maxVerificationLoops,
    };

    let finalStatus: RunMetadata["status"] = "RUNNING";
    let lastResult: AgentResult | undefined;

    while (!this.isCancelled) {
      const adapter = this.router.resolveAdapter(
        currentTask.requestedRole,
        (currentTask as any).preferredAgent
      );

      if (onStepStart) {
        onStepStart(currentTask, adapter.name);
      }

      // Execute through bridge
      lastResult = await this.bridge.executeStep(currentTask, adapter);
      history.push(lastResult);

      if (onStepComplete) {
        onStepComplete(lastResult);
      }

      // Check next routing step
      const decision = this.router.determineNextStep(lastResult, iteration);

      if (decision.isTerminal) {
        finalStatus = decision.terminalStatus || "COMPLETED";
        break;
      }

      if (this.isCancelled) {
        finalStatus = "CANCELLED";
        break;
      }

      // If returning to implementer due to verification failure, increment iteration count
      if (lastResult.role === "verifier" && decision.nextRole === "implementer") {
        iteration++;
      }

      // Build handoff packet
      const handoff = HandoffBuilder.buildHandoff(
        currentTask,
        lastResult,
        decision.nextAgent,
        decision.nextRole,
        decision.reason
      );

      await this.stateStore.saveHandoff(handoff);

      if (onHandoff) {
        onHandoff(handoff.fromAgent, handoff.toAgent, handoff.role, handoff.reason);
      }

      // Prepare next task envelope
      taskIndex++;
      const nextContext = HandoffBuilder.formatHandoffContext(handoff);

      currentTask = {
        taskId: `task-${String(taskIndex).padStart(2, "0")}`,
        runId,
        objective,
        context: nextContext,
        workingDirectory,
        acceptanceCriteria: handoff.verificationCriteria,
        inputs: {
          files: handoff.relevantFiles,
        },
        requestedRole: decision.nextRole,
        iteration,
        maxIterations: maxVerificationLoops,
        previousResults: history.map((h) => ({
          agent: h.agent,
          role: h.role,
          status: h.status,
          summary: h.summary,
          findings: h.findings,
          filesChanged: h.filesChanged,
          verificationPassed: h.verification?.passed,
        })),
      };
      (currentTask as any).preferredAgent = decision.nextAgent;
    }

    if (this.isCancelled) {
      finalStatus = "CANCELLED";
    }

    await this.stateStore.updateRunStatus(finalStatus, iteration, lastResult);

    return {
      runId,
      status: finalStatus,
      totalIterations: iteration,
      finalResult: lastResult,
      history,
      runDirectory: this.stateStore.getRunDirectory(),
    };
  }
}
