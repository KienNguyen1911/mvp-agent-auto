import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TaskEnvelope } from "../protocol/TaskEnvelope.js";
import { AgentResult } from "../protocol/AgentResult.js";
import { AgentHandoff } from "../protocol/AgentHandoff.js";

export interface RunMetadata {
  runId: string;
  objective: string;
  workingDirectory: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "HUMAN_REQUIRED" | "CANCELLED";
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  iterations: number;
  finalResult?: AgentResult;
}

export interface OrchestratorEvent {
  timestamp: string;
  type:
    | "RUN_STARTED"
    | "TASK_STARTED"
    | "TASK_COMPLETED"
    | "TASK_FAILED"
    | "HANDOFF"
    | "VERIFICATION_PASSED"
    | "VERIFICATION_FAILED"
    | "MAX_LOOPS_EXCEEDED"
    | "RUN_COMPLETED"
    | "RUN_FAILED";
  runId: string;
  taskId?: string;
  agent?: string;
  role?: string;
  details?: Record<string, any>;
}

export class FileStateStore {
  private baseDir: string;
  private runDir: string;
  private tasksDir: string;
  private resultsDir: string;
  private logsDir: string;
  private handoffsDir: string;
  private eventsFile: string;
  private runFile: string;
  private runId: string;

  constructor(workspaceDir: string, runId: string) {
    this.runId = runId;
    this.baseDir = path.join(workspaceDir, ".orchestrator");
    this.runDir = path.join(this.baseDir, "runs", runId);
    this.tasksDir = path.join(this.runDir, "tasks");
    this.resultsDir = path.join(this.runDir, "results");
    this.logsDir = path.join(this.runDir, "logs");
    this.handoffsDir = path.join(this.runDir, "handoffs");
    this.eventsFile = path.join(this.runDir, "events.jsonl");
    this.runFile = path.join(this.runDir, "run.json");
  }

  public async init(objective: string, workingDirectory: string): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
    await fs.mkdir(this.resultsDir, { recursive: true });
    await fs.mkdir(this.logsDir, { recursive: true });
    await fs.mkdir(this.handoffsDir, { recursive: true });

    const metadata: RunMetadata = {
      runId: this.runId,
      objective,
      workingDirectory,
      status: "RUNNING",
      startTime: new Date().toISOString(),
      iterations: 0,
    };

    await fs.writeFile(this.runFile, JSON.stringify(metadata, null, 2), "utf8");
    await this.logEvent({
      timestamp: new Date().toISOString(),
      type: "RUN_STARTED",
      runId: this.runId,
      details: { objective, workingDirectory },
    });
  }

  public async saveTask(task: TaskEnvelope): Promise<void> {
    const filePath = path.join(this.tasksDir, `${task.taskId}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), "utf8");
    await this.logEvent({
      timestamp: new Date().toISOString(),
      type: "TASK_STARTED",
      runId: this.runId,
      taskId: task.taskId,
      role: task.requestedRole,
      details: { iteration: task.iteration },
    });
  }

  public async saveResult(result: AgentResult): Promise<void> {
    const filename = `${result.taskId}.${result.agent}.json`;
    const filePath = path.join(this.resultsDir, filename);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2), "utf8");

    await this.logEvent({
      timestamp: new Date().toISOString(),
      type: result.status === "completed" ? "TASK_COMPLETED" : "TASK_FAILED",
      runId: this.runId,
      taskId: result.taskId,
      agent: result.agent,
      role: result.role,
      details: {
        status: result.status,
        summary: result.summary,
        filesChanged: result.filesChanged,
      },
    });
  }

  public async saveHandoff(handoff: AgentHandoff): Promise<void> {
    const filePath = path.join(this.handoffsDir, `${handoff.handoffId}.json`);
    await fs.writeFile(filePath, JSON.stringify(handoff, null, 2), "utf8");

    await this.logEvent({
      timestamp: new Date().toISOString(),
      type: "HANDOFF",
      runId: this.runId,
      taskId: handoff.taskId,
      agent: handoff.fromAgent,
      details: {
        from: handoff.fromAgent,
        to: handoff.toAgent,
        role: handoff.role,
        reason: handoff.reason,
      },
    });
  }

  public async saveLog(agent: string, taskId: string, logContent: string): Promise<void> {
    const logPath = path.join(this.logsDir, `${taskId}.${agent}.log`);
    await fs.writeFile(logPath, logContent, "utf8");
  }

  public async logEvent(event: OrchestratorEvent): Promise<void> {
    const line = JSON.stringify(event) + "\n";
    await fs.appendFile(this.eventsFile, line, "utf8");
  }

  public async updateRunStatus(
    status: RunMetadata["status"],
    iterations: number,
    finalResult?: AgentResult
  ): Promise<void> {
    try {
      const raw = await fs.readFile(this.runFile, "utf8");
      const data: RunMetadata = JSON.parse(raw);
      data.status = status;
      data.iterations = iterations;
      data.endTime = new Date().toISOString();
      data.totalDurationMs = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();
      if (finalResult) {
        data.finalResult = finalResult;
      }
      await fs.writeFile(this.runFile, JSON.stringify(data, null, 2), "utf8");

      await this.logEvent({
        timestamp: new Date().toISOString(),
        type: status === "COMPLETED" ? "RUN_COMPLETED" : "RUN_FAILED",
        runId: this.runId,
        details: { status, totalDurationMs: data.totalDurationMs },
      });
    } catch (err: any) {
      console.error(`Failed to update run status: ${err.message}`);
    }
  }

  public getRunDirectory(): string {
    return this.runDir;
  }
}
