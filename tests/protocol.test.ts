import { test, describe } from "node:test";
import * as assert from "node:assert";
import { parseAgentResult, extractAndParseJson } from "../src/protocol/schemas.js";

describe("Protocol & Schemas", () => {
  test("extractAndParseJson handles raw JSON", () => {
    const raw = JSON.stringify({
      taskId: "task-01",
      status: "completed",
      summary: "All good",
    });
    const parsed = extractAndParseJson(raw);
    assert.ok(parsed);
    assert.strictEqual(parsed.taskId, "task-01");
    assert.strictEqual(parsed.status, "completed");
  });

  test("extractAndParseJson handles markdown fenced JSON blocks", () => {
    const text = `
Here is my evaluation:

\`\`\`json
{
  "taskId": "task-02",
  "status": "completed",
  "summary": "Implementation done",
  "filesChanged": ["src/index.ts"]
}
\`\`\`

Hope that helps!
    `;
    const parsed = extractAndParseJson(text);
    assert.ok(parsed);
    assert.strictEqual(parsed.taskId, "task-02");
    assert.deepStrictEqual(parsed.filesChanged, ["src/index.ts"]);
  });

  test("extractAndParseJson handles JSON embedded inside text without code blocks", () => {
    const text = `Prefix logs... {"taskId": "task-03", "summary": "Direct object"} ...suffix logs`;
    const parsed = extractAndParseJson(text);
    assert.ok(parsed);
    assert.strictEqual(parsed.taskId, "task-03");
  });

  test("parseAgentResult falls back gracefully on unparseable output", () => {
    const result = parseAgentResult("Random invalid text without any JSON", {
      taskId: "task-99",
      runId: "run-test",
      agent: "agy",
      role: "planner",
    });

    assert.strictEqual(result.taskId, "task-99");
    assert.strictEqual(result.agent, "agy");
    assert.strictEqual(result.role, "planner");
    assert.strictEqual(result.status, "failed");
    assert.ok(result.summary.includes("could not be parsed"));
  });

  test("parseAgentResult normalizes verifier results with verification object", () => {
    const raw = JSON.stringify({
      taskId: "task-03",
      runId: "run-10",
      agent: "codex",
      role: "verifier",
      status: "completed",
      summary: "Verification complete",
      verification: {
        passed: true,
        evidence: ["Unit tests passed", "Build succeeded"],
      },
      nextAction: {
        instruction: "Done",
      },
    });

    const parsed = parseAgentResult(raw, {
      taskId: "task-03",
      runId: "run-10",
      agent: "codex",
      role: "verifier",
    });

    assert.strictEqual(parsed.verification?.passed, true);
    assert.strictEqual(parsed.verification?.evidence.length, 2);
  });

  test("extractAndParseJson extracts filesChanged and summary from NDJSON streaming tool events", () => {
    const ndjson = [
      JSON.stringify({ type: "step_start", timestamp: 100 }),
      JSON.stringify({
        type: "tool_use",
        part: { tool: "write", state: { input: { path: "src/utils/checksum.ts" } } },
      }),
      JSON.stringify({
        type: "tool_use",
        part: { tool: "shell", state: { input: { command: "npm test" } } },
      }),
      JSON.stringify({
        type: "text",
        part: { text: "All done. Here's what was implemented:\n- calculateSha256 in src/utils/checksum.ts\nResults: npm test passed." },
      }),
      JSON.stringify({ type: "step_finish", timestamp: 200 }),
    ].join("\n");

    const parsed = extractAndParseJson(ndjson);
    assert.ok(parsed);
    assert.strictEqual(parsed.status, "completed");
    assert.ok(parsed.summary.includes("All done"));
    assert.deepStrictEqual(parsed.filesChanged, ["src/utils/checksum.ts"]);
    assert.deepStrictEqual(parsed.commandsExecuted, ["npm test"]);
  });
});
