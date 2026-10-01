import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentAdapter, buildAgentPrompt } from "./AgentAdapter.js";
import { TaskEnvelope, AgentRole } from "../protocol/TaskEnvelope.js";
import { AgentResult, AgentName } from "../protocol/AgentResult.js";
import { parseAgentResult } from "../protocol/schemas.js";
import { ProcessSupervisor } from "../process/ProcessSupervisor.js";

const DEFAULT_PLANNER_INSTRUCTIONS = `You are the primary Planner & Architect for this codebase.
Analyze the user objective, review files, create a plan with acceptance criteria, and recommend an implementer agent.
You MUST output your final answer as JSON with keys: taskId, runId, agent ("agy"), role ("planner"), status ("completed"), summary, findings, filesChanged, commandsExecuted, nextAction.`;

export class AgyAdapter implements AgentAdapter {
  public readonly name: AgentName = "agy";
  public readonly defaultRole: AgentRole = "planner";

  private supervisor: ProcessSupervisor;
  private promptTemplate: string = DEFAULT_PLANNER_INSTRUCTIONS;
  public model?: string;

  constructor(
    supervisor: ProcessSupervisor,
    promptTemplatePath?: string,
    model?: string
  ) {
    this.supervisor = supervisor;
    this.model = model;
    if (promptTemplatePath) {
      this.loadPromptTemplate(promptTemplatePath);
    }
  }

  private async loadPromptTemplate(filePath: string): Promise<void> {
    try {
      this.promptTemplate = await fs.readFile(filePath, "utf8");
    } catch {
      // Fallback to default
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.supervisor.execute({
        command: "agy",
        args: ["--help"],
        cwd: process.cwd(),
        timeoutMs: 10_000,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async execute(task: TaskEnvelope): Promise<AgentResult> {
    const fullPrompt = buildAgentPrompt(task, this.promptTemplate);

    const cliArgs = [
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
    ];

    if (this.model) {
      cliArgs.push("--model", this.model);
    }

    cliArgs.push("-p", fullPrompt);

    const procResult = await this.supervisor.execute({
      command: "agy",
      args: cliArgs,
      cwd: task.workingDirectory,
      timeoutMs: 300_000,
    });

    const parsed = parseAgentResult(procResult.stdout || procResult.stderr, {
      taskId: task.taskId,
      runId: task.runId,
      agent: this.name,
      role: task.requestedRole,
    });

    parsed.durationMs = procResult.durationMs;

    if (procResult.state === "TIMEOUT") {
      parsed.status = "failed";
      parsed.summary = `Execution timed out after ${procResult.durationMs}ms`;
    } else if (procResult.state === "FAILED" && parsed.status === "completed") {
      // If exit code failed and parsed was default
      if (procResult.exitCode !== 0 && !parsed.summary) {
        parsed.status = "failed";
        parsed.summary = `CLI process exited with code ${procResult.exitCode}. Stderr: ${procResult.stderr}`;
      }
    }

    return parsed;
  }

  public async cancel(): Promise<void> {
    this.supervisor.cancelAll();
  }
}
