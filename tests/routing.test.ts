import { test, describe } from "node:test";
import * as assert from "node:assert";
import { StaticRouter } from "../src/routing/StaticRouter.js";
import { MockAdapter } from "../src/agents/MockAdapter.js";
import { AgentResult } from "../src/protocol/AgentResult.js";

describe("StaticRouter", () => {
  const adapters = [
    new MockAdapter("agy", "planner"),
    new MockAdapter("opencode", "implementer"),
    new MockAdapter("codex", "verifier"),
  ];
  const router = new StaticRouter(adapters, 3);

  test("routes planner role to agy", () => {
    const adapter = router.resolveAdapter("planner");
    assert.strictEqual(adapter.name, "agy");
  });

  test("routes implementer role to opencode", () => {
    const adapter = router.resolveAdapter("implementer");
    assert.strictEqual(adapter.name, "opencode");
  });

  test("routes verifier role to codex", () => {
    const adapter = router.resolveAdapter("verifier");
    assert.strictEqual(adapter.name, "codex");
  });

  test("planner completion routes to implementer", () => {
    const plannerResult: AgentResult = {
      taskId: "task-01",
      runId: "run-01",
      agent: "agy",
      role: "planner",
      status: "completed",
      summary: "Plan ready",
      nextAction: {
        recommendedAgent: "opencode",
        role: "implementer",
        instruction: "Implement components",
      },
    };

    const decision = router.determineNextStep(plannerResult, 1);
    assert.strictEqual(decision.isTerminal, false);
    assert.strictEqual(decision.nextRole, "implementer");
    assert.strictEqual(decision.nextAgent, "opencode");
  });

  test("implementer completion routes to verifier", () => {
    const implementerResult: AgentResult = {
      taskId: "task-02",
      runId: "run-01",
      agent: "opencode",
      role: "implementer",
      status: "completed",
      summary: "Code implemented",
      filesChanged: ["src/app.ts"],
      nextAction: {
        recommendedAgent: "codex",
        role: "verifier",
        instruction: "Verify changes",
      },
    };

    const decision = router.determineNextStep(implementerResult, 1);
    assert.strictEqual(decision.isTerminal, false);
    assert.strictEqual(decision.nextRole, "verifier");
    assert.strictEqual(decision.nextAgent, "codex");
  });

  test("verifier pass terminates with COMPLETED", () => {
    const verifierResult: AgentResult = {
      taskId: "task-03",
      runId: "run-01",
      agent: "codex",
      role: "verifier",
      status: "completed",
      summary: "All criteria passed",
      verification: {
        passed: true,
        evidence: ["All tests pass"],
      },
    };

    const decision = router.determineNextStep(verifierResult, 1);
    assert.strictEqual(decision.isTerminal, true);
    assert.strictEqual(decision.terminalStatus, "COMPLETED");
  });

  test("verifier fail routes back to implementer if within max loops", () => {
    const verifierResult: AgentResult = {
      taskId: "task-03",
      runId: "run-01",
      agent: "codex",
      role: "verifier",
      status: "completed",
      summary: "Test failed",
      verification: {
        passed: false,
        evidence: ["Test case 2 failed"],
      },
      nextAction: {
        recommendedAgent: "opencode",
        role: "implementer",
        instruction: "Fix test case 2",
      },
    };

    const decision = router.determineNextStep(verifierResult, 1);
    assert.strictEqual(decision.isTerminal, false);
    assert.strictEqual(decision.nextRole, "implementer");
    assert.strictEqual(decision.nextAgent, "opencode");
  });

  test("verifier fail escalates to HUMAN_REQUIRED if max loops reached", () => {
    const verifierResult: AgentResult = {
      taskId: "task-05",
      runId: "run-01",
      agent: "codex",
      role: "verifier",
      status: "completed",
      summary: "Still failing after 3 attempts",
      verification: {
        passed: false,
        evidence: ["Persistent error"],
      },
    };

    const decision = router.determineNextStep(verifierResult, 3);
    assert.strictEqual(decision.isTerminal, true);
    assert.strictEqual(decision.terminalStatus, "HUMAN_REQUIRED");
  });
});
