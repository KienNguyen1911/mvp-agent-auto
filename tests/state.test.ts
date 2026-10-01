import { test, describe, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileStateStore } from "../src/state/FileStateStore.js";
import { TaskEnvelope } from "../src/protocol/TaskEnvelope.js";
import { AgentResult } from "../src/protocol/AgentResult.js";

describe("FileStateStore", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("initializes directory structure and writes run.json & events.jsonl", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orchestrator-test-"));
    const store = new FileStateStore(tempDir, "run-test-1");

    await store.init("Test Objective", tempDir);

    const runDir = store.getRunDirectory();
    const runJsonPath = path.join(runDir, "run.json");
    const eventsPath = path.join(runDir, "events.jsonl");

    const runJsonExists = await fs.stat(runJsonPath).then(() => true).catch(() => false);
    const eventsExists = await fs.stat(eventsPath).then(() => true).catch(() => false);

    assert.strictEqual(runJsonExists, true);
    assert.strictEqual(eventsExists, true);

    const runContent = JSON.parse(await fs.readFile(runJsonPath, "utf8"));
    assert.strictEqual(runContent.runId, "run-test-1");
    assert.strictEqual(runContent.objective, "Test Objective");
    assert.strictEqual(runContent.status, "RUNNING");
  });

  test("saves tasks, results, logs, and events", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orchestrator-test-"));
    const store = new FileStateStore(tempDir, "run-test-2");

    await store.init("Save Check", tempDir);

    const task: TaskEnvelope = {
      taskId: "task-01",
      runId: "run-test-2",
      objective: "Do work",
      workingDirectory: tempDir,
      acceptanceCriteria: ["Must work"],
      requestedRole: "implementer",
      iteration: 1,
    };
    await store.saveTask(task);

    const result: AgentResult = {
      taskId: "task-01",
      runId: "run-test-2",
      agent: "opencode",
      role: "implementer",
      status: "completed",
      summary: "Done work",
      filesChanged: ["file.ts"],
    };
    await store.saveResult(result);
    await store.saveLog("opencode", "task-01", "Raw log content here");

    const taskFile = path.join(store.getRunDirectory(), "tasks", "task-01.json");
    const resultFile = path.join(store.getRunDirectory(), "results", "task-01.opencode.json");
    const logFile = path.join(store.getRunDirectory(), "logs", "task-01.opencode.log");

    assert.strictEqual(await fs.stat(taskFile).then(() => true).catch(() => false), true);
    assert.strictEqual(await fs.stat(resultFile).then(() => true).catch(() => false), true);
    assert.strictEqual(await fs.stat(logFile).then(() => true).catch(() => false), true);

    const eventsContent = await fs.readFile(path.join(store.getRunDirectory(), "events.jsonl"), "utf8");
    const eventLines = eventsContent.trim().split("\n");
    assert.ok(eventLines.length >= 3); // RUN_STARTED, TASK_STARTED, TASK_COMPLETED
  });
});
