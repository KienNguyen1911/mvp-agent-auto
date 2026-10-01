import * as fs from "node:fs/promises";
import { AgentAdapter, buildAgentPrompt } from "./AgentAdapter.js";
import { TaskEnvelope, AgentRole } from "../protocol/TaskEnvelope.js";
import { AgentResult, AgentName } from "../protocol/AgentResult.js";
import { parseAgentResult } from "../protocol/schemas.js";
import { ProcessSupervisor } from "../process/ProcessSupervisor.js";

const DEFAULT_IMPLEMENTER_INSTRUCTIONS = `You are the primary Implementer for this codebase in automated execution mode.
DO NOT say hello or ask what to do. Immediately execute the implementation tasks, write or edit files, run local tests, and record modified files.
You MUST output your final answer as JSON with keys: taskId, runId, agent ("opencode"), role ("implementer"), status ("completed"), summary, findings, filesChanged, commandsExecuted, verification, nextAction.`;

export class OpenCodeAdapter implements AgentAdapter {
  public readonly name: AgentName = "opencode";
  public readonly defaultRole: AgentRole = "implementer";

  private supervisor: ProcessSupervisor;
  private promptTemplate: string = DEFAULT_IMPLEMENTER_INSTRUCTIONS;
  public model: string;

  constructor(
    supervisor: ProcessSupervisor,
    promptTemplatePath?: string,
    model: string = "agnes/agnes-2.5-flash"
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
      // Fallback
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.supervisor.execute({
        command: "opencode",
        args: ["--version"],
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
      "run",
      "-m",
      this.model,
      "--auto",
      "--format",
      "json",
    ];

    const procResult = await this.supervisor.execute({
      command: "opencode",
      args: cliArgs,
      cwd: task.workingDirectory,
      input: fullPrompt,
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
      if (procResult.exitCode !== 0 && !parsed.summary) {
        parsed.status = "failed";
        parsed.summary = `OpenCode CLI exited with code ${procResult.exitCode}. Stderr: ${procResult.stderr}`;
      }
    }

    return parsed;
  }

  public async cancel(): Promise<void> {
    this.supervisor.cancelAll();
  }
}
