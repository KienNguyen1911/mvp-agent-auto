import { test, describe, afterEach } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Runner } from "../src/bridge/Runner.js";
import { StaticRouter } from "../src/routing/StaticRouter.js";
import { MockAdapter } from "../src/agents/MockAdapter.js";

describe("Runner (Autonomous End-to-End Orchestration)", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("golden flow succeeds: AGY -> OpenCode -> Codex (PASS)", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-golden-"));

    const adapters = [
      new MockAdapter("agy", "planner"),
      new MockAdapter("opencode", "implementer"),
      new MockAdapter("codex", "verifier"),
    ];

    const router = new StaticRouter(adapters, 3);
    const runner = new Runner(router, {
      objective: "Build user profile component",
      workingDirectory: tempDir,
    });

    const result = await runner.run();

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.history.length, 3);
    assert.strictEqual(result.history[0].agent, "agy");
    assert.strictEqual(result.history[0].role, "planner");
    assert.strictEqual(result.history[1].agent, "opencode");
    assert.strictEqual(result.history[1].role, "implementer");
    assert.strictEqual(result.history[2].agent, "codex");
    assert.strictEqual(result.history[2].role, "verifier");
    assert.strictEqual(result.history[2].verification?.passed, true);
  });

  test("verification retry flow: AGY -> OpenCode -> Codex (FAIL) -> OpenCode -> Codex (PASS)", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-retry-"));

    const adapters = [
      new MockAdapter("agy", "planner"),
      new MockAdapter("opencode", "implementer"),
      new MockAdapter("codex", "verifier", {
        simulateVerificationFailureCount: 1, // fails once, then passes
      }),
    ];

    const router = new StaticRouter(adapters, 3);
    const runner = new Runner(router, {
      objective: "Fix race condition in task queue",
      workingDirectory: tempDir,
    });

    const result = await runner.run();

    assert.strictEqual(result.status, "COMPLETED");
    // Steps:
    // 0: agy (planner)
    // 1: opencode (implementer)
    // 2: codex (verifier - failed)
    // 3: opencode (implementer - fix)
    // 4: codex (verifier - passed)
    assert.strictEqual(result.history.length, 5);
    assert.strictEqual(result.history[2].verification?.passed, false);
    assert.strictEqual(result.history[4].verification?.passed, true);
    assert.strictEqual(result.totalIterations, 2);
  });

  test("escalates to HUMAN_REQUIRED when verification fails repeatedly", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "runner-exhaust-"));

    const adapters = [
      new MockAdapter("agy", "planner"),
      new MockAdapter("opencode", "implementer"),
      new MockAdapter("codex", "verifier", {
        simulateVerificationFailureCount: 99, // always fails
      }),
    ];

    const router = new StaticRouter(adapters, 2); // max 2 loops
    const runner = new Runner(router, {
      objective: "Impossible task",
      workingDirectory: tempDir,
      maxVerificationLoops: 2,
    });

    const result = await runner.run();

    assert.strictEqual(result.status, "HUMAN_REQUIRED");
    assert.strictEqual(result.totalIterations, 2);
  });
});
