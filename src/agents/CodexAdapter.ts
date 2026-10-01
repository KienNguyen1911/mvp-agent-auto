import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { AgentAdapter, buildAgentPrompt } from "./AgentAdapter.js";
import { TaskEnvelope, AgentRole } from "../protocol/TaskEnvelope.js";
import { AgentResult, AgentName } from "../protocol/AgentResult.js";
import { parseAgentResult } from "../protocol/schemas.js";
import { ProcessSupervisor } from "../process/ProcessSupervisor.js";

const DEFAULT_VERIFIER_INSTRUCTIONS = `You are the primary Verifier & Reviewer for this codebase.
Verify that all acceptance criteria are met, examine modified files, run test commands if needed, and decide if the task passes or fails.
You MUST output your final answer as JSON with keys: taskId, runId, agent ("codex"), role ("verifier"), status ("completed"), summary, findings, filesChanged, commandsExecuted, verification (object with passed: boolean and evidence: string[]), nextAction.`;

export class CodexAdapter implements AgentAdapter {
  public readonly name: AgentName = "codex";
  public readonly defaultRole: AgentRole = "verifier";

  private supervisor: ProcessSupervisor;
  private promptTemplate: string = DEFAULT_VERIFIER_INSTRUCTIONS;
  public model: string;

  constructor(
    supervisor: ProcessSupervisor,
    promptTemplatePath?: string,
    model: string = "gpt-5.6-terra"
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
        command: "codex",
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

    const tempOutputDir = os.tmpdir();
    const outputFile = path.join(
      tempOutputDir,
      `codex-output-${task.runId}-${task.taskId}-${Date.now()}.json`
    );

    const cliArgs = [
      "exec",
      "-m",
      this.model,
      "--dangerously-bypass-approvals-and-sandbox",
      "-o",
      outputFile,
      "-",
    ];

    const procResult = await this.supervisor.execute({
      command: "codex",
      args: cliArgs,
      cwd: task.workingDirectory,
      input: fullPrompt,
      timeoutMs: 300_000,
    });

    let rawResponse = procResult.stdout;

    // Check if output file was created and contains the last message
    try {
      const fileContent = await fs.readFile(outputFile, "utf8");
      if (fileContent && fileContent.trim().length > 0) {
        rawResponse = fileContent;
      }
      await fs.unlink(outputFile).catch(() => {});
    } catch {
      // Use stdout
    }

    const parsed = parseAgentResult(rawResponse || procResult.stderr, {
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
        parsed.summary = `Codex CLI exited with code ${procResult.exitCode}. Stderr: ${procResult.stderr}`;
      }
    }

    return parsed;
  }

  public async cancel(): Promise<void> {
    this.supervisor.cancelAll();
  }
}
