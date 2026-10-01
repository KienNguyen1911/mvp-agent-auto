#!/usr/bin/env node
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { ProcessSupervisor } from "./process/ProcessSupervisor.js";
import { AgyAdapter } from "./agents/AgyAdapter.js";
import { OpenCodeAdapter } from "./agents/OpenCodeAdapter.js";
import { CodexAdapter } from "./agents/CodexAdapter.js";
import { MockAdapter } from "./agents/MockAdapter.js";
import { StaticRouter } from "./routing/StaticRouter.js";
import { Runner } from "./bridge/Runner.js";
import { promptUserForObjective } from "./utils/prompt.js";
import { resolveModelConfig, interactiveConfigMenu } from "./utils/config.js";

function printBanner(): void {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│       🚀 THIN ORCHESTRATION BRIDGE (Codex - AGY - OpenCode)  │
└─────────────────────────────────────────────────────────────┘`);
}

function printHelp(): void {
  printBanner();
  console.log(`
Usage:
  npm start                            Interactive mode (prompts for objective with Shift+Enter support)
  npm start --config                   Interactive menu to configure agent models
  npm start -- --mock                  Interactive mode using Mock simulation
  bridge config                        Interactive menu to configure agent models
  bridge run "<objective>" [options]   Run multi-agent orchestration directly
  bridge check                         Check health & availability of CLI tools
  bridge status                        Show status & timeline of the latest run
  bridge --help, -h                    Display help message

Options for "run" / interactive:
  --mock, --dry-run                    Simulate execution using mock adapters
  --simulate-fail <n>                  Simulate <n> verification failures (mock mode)
  --max-loops <number>                 Max verification retry loops (default: 3)
  --workdir <path>                     Target repository directory (default: current)
  --agy-model <model>                  Model for AGY planner (default: gemini-3.8-flash)
  --opencode-model <model>             Model for OpenCode implementer (default: agnes/agnes-2.5-flash)
  --codex-model <model>                Model for Codex verifier (default: gpt-5.6-terra)

Environment Variables for Models:
  AGY_MODEL, OPENCODE_MODEL, CODEX_MODEL

Configuration File:
  .orchestrator/config.json {"models": {"agy": "...", "opencode": "...", "codex": "..."}}

Keyboard Shortcuts in Interactive Prompt:
  [Enter]                              Submit prompt and start orchestration
  [Shift + Enter] / [Alt + Enter]      Insert a new line (xuống dòng)
  [Ctrl + C]                           Cancel and exit

Examples:
  npm start
  npm start -- --mock
  npm start -- run "Fix race condition in task scheduler" --mock
  npm start -- check
`);
}

async function runCheck(): Promise<void> {
  printBanner();
  console.log("\n🔍 Diagnosing CLI Tools Availability in System PATH...\n");

  const supervisor = new ProcessSupervisor();
  const agy = new AgyAdapter(supervisor);
  const opencode = new OpenCodeAdapter(supervisor);
  const codex = new CodexAdapter(supervisor);

  const checks = [
    { name: "AGY CLI (agy)", adapter: agy, command: "agy --help" },
    { name: "OpenCode CLI (opencode)", adapter: opencode, command: "opencode --version" },
    { name: "Codex CLI (codex)", adapter: codex, command: "codex --version" },
  ];

  let allHealthy = true;

  for (const check of checks) {
    process.stdout.write(`• Checking ${check.name}... `);
    const ok = await check.adapter.healthCheck();
    if (ok) {
      console.log("✅ OK");
    } else {
      console.log(`❌ FAILED (Command '${check.command}' did not return code 0)`);
      allHealthy = false;
    }
  }

  console.log();
  if (allHealthy) {
    console.log("✨ All 3 CLIs are installed and ready for autonomous orchestration!");
  } else {
    console.log("⚠️ Some CLI tools were not reachable. You can still test with '--mock'.");
  }
}

async function runOrchestration(args: string[]): Promise<void> {
  const flagParams = new Set([
    "--max-loops",
    "--simulate-fail",
    "--workdir",
    "--agy-model",
    "--opencode-model",
    "--codex-model",
  ]);
  const positionalArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      if (flagParams.has(arg)) {
        i++; // skip value of flag
      }
      continue;
    }
    positionalArgs.push(arg);
  }
  let objective = positionalArgs.join(" ").trim();
  let bannerPrinted = false;

  if (!objective) {
    printBanner();
    bannerPrinted = true;
    objective = await promptUserForObjective();
    if (!objective) {
      console.log("\n❌ Không có objective nào được nhập. Dừng chương trình.\n");
      process.exit(1);
    }
  }

  const isMock = args.includes("--mock") || args.includes("--dry-run");
  const maxLoopsIdx = args.indexOf("--max-loops");
  const maxVerificationLoops =
    maxLoopsIdx !== -1 && args[maxLoopsIdx + 1]
      ? parseInt(args[maxLoopsIdx + 1], 10)
      : 3;

  const simulateFailIdx = args.indexOf("--simulate-fail");
  const simulateFailCount =
    simulateFailIdx !== -1 && args[simulateFailIdx + 1]
      ? parseInt(args[simulateFailIdx + 1], 10)
      : 0;

  const workdirIdx = args.indexOf("--workdir");
  const workingDirectory =
    workdirIdx !== -1 && args[workdirIdx + 1]
      ? path.resolve(args[workdirIdx + 1])
      : process.cwd();

  const agyModelIdx = args.indexOf("--agy-model");
  const agyModelCli =
    agyModelIdx !== -1 && args[agyModelIdx + 1]
      ? args[agyModelIdx + 1]
      : undefined;

  const opencodeModelIdx = args.indexOf("--opencode-model");
  const opencodeModelCli =
    opencodeModelIdx !== -1 && args[opencodeModelIdx + 1]
      ? args[opencodeModelIdx + 1]
      : undefined;

  const codexModelIdx = args.indexOf("--codex-model");
  const codexModelCli =
    codexModelIdx !== -1 && args[codexModelIdx + 1]
      ? args[codexModelIdx + 1]
      : undefined;

  const modelConfig = await resolveModelConfig({
    workdir: workingDirectory,
    cliOverrides: {
      agy: agyModelCli,
      opencode: opencodeModelCli,
      codex: codexModelCli,
    },
  });

  if (!bannerPrinted) {
    printBanner();
  }
  console.log(`\n🎯 Objective: "${objective}"`);
  console.log(`📂 Working Directory: ${workingDirectory}`);
  console.log(`⚙️ Mode: ${isMock ? "MOCK SIMULATION" : "LIVE CLI AGENTS"}`);
  console.log(`🔄 Max Verification Loops: ${maxVerificationLoops}`);
  if (!isMock) {
    console.log(`🤖 Models:`);
    console.log(`   • Planner (AGY):          ${modelConfig.agy}`);
    console.log(`   • Implementer (OpenCode):   ${modelConfig.opencode}`);
    console.log(`   • Verifier (Codex):        ${modelConfig.codex}`);
  }
  console.log();

  const supervisor = new ProcessSupervisor();
  const promptsDir = path.join(workingDirectory, "prompts");

  let adapters;
  if (isMock) {
    adapters = [
      new MockAdapter("agy", "planner"),
      new MockAdapter("opencode", "implementer"),
      new MockAdapter("codex", "verifier", {
        simulateVerificationFailureCount: simulateFailCount,
      }),
    ];
  } else {
    adapters = [
      new AgyAdapter(
        supervisor,
        path.join(promptsDir, "planner.md"),
        modelConfig.agy
      ),
      new OpenCodeAdapter(
        supervisor,
        path.join(promptsDir, "implementer.md"),
        modelConfig.opencode
      ),
      new CodexAdapter(
        supervisor,
        path.join(promptsDir, "verifier.md"),
        modelConfig.codex
      ),
    ];
  }

  const router = new StaticRouter(adapters, maxVerificationLoops);

  const runner = new Runner(router, {
    objective,
    workingDirectory,
    maxVerificationLoops,
    onStepStart: (task, agentName) => {
      console.log(`\n▶️ [${task.taskId}] Starting Role '${task.requestedRole}' -> Assigned to agent '${agentName}'...`);
    },
    onStepComplete: (result) => {
      const icon = result.status === "completed" ? "✅" : "⚠️";
      console.log(`${icon} [${result.taskId}] Agent '${result.agent}' completed with status: ${result.status} (${result.durationMs ?? 0}ms)`);
      console.log(`   📝 Summary: ${result.summary}`);
      if (result.filesChanged && result.filesChanged.length > 0) {
        console.log(`   📁 Files changed: ${result.filesChanged.join(", ")}`);
      }
      if (result.verification) {
        const vIcon = result.verification.passed ? "🟢 PASS" : "🔴 FAIL";
        console.log(`   🔎 Verification: ${vIcon}`);
        if (result.verification.evidence?.length) {
          result.verification.evidence.forEach((ev) => console.log(`      - ${ev}`));
        }
      }
    },
    onHandoff: (from, to, role, reason) => {
      console.log(`\n🤝 [HANDOFF] ${from.toUpperCase()} ──> ${to.toUpperCase()} (Role: ${role})`);
      console.log(`   Reason: ${reason}`);
    },
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Interrupt received! Stopping orchestrator gracefully...");
    runner.cancel();
    supervisor.cancelAll();
  });

  try {
    const outcome = await runner.run();
    console.log("\n=============================================================");
    console.log(`🏁 RUN TERMINATED: ${outcome.status}`);
    console.log(`🔢 Total Iterations: ${outcome.totalIterations}`);
    console.log(`📁 Artifacts & Logs saved at:`);
    console.log(`   ${outcome.runDirectory}`);
    console.log("=============================================================\n");

    if (outcome.status === "COMPLETED") {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Fatal Error during run: ${err.message}`);
    process.exit(1);
  }
}

async function runStatus(): Promise<void> {
  printBanner();
  const runsBase = path.join(process.cwd(), ".orchestrator", "runs");

  try {
    const entries = await fs.readdir(runsBase, { withFileTypes: true });
    const runDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    if (runDirs.length === 0) {
      console.log("\nℹ️ No runs found in .orchestrator/runs yet.");
      console.log("Run a task first using: npm start -- run \"<objective>\" --mock");
      return;
    }

    // Sort descending (latest run first)
    runDirs.sort().reverse();
    const latestRunId = runDirs[0];
    const latestRunDir = path.join(runsBase, latestRunId);

    const runJsonPath = path.join(latestRunDir, "run.json");
    const eventsPath = path.join(latestRunDir, "events.jsonl");

    const runRaw = await fs.readFile(runJsonPath, "utf8");
    const runMeta = JSON.parse(runRaw);

    console.log(`\n📋 LATEST ORCHESTRATION RUN: ${runMeta.runId}`);
    console.log(`🎯 Objective: "${runMeta.objective}"`);
    console.log(`📊 Status: ${runMeta.status}`);
    console.log(`⏱️ Duration: ${runMeta.totalDurationMs ? runMeta.totalDurationMs + "ms" : "In progress"}`);
    console.log(`🔄 Total Iterations: ${runMeta.iterations}`);

    try {
      const eventsRaw = await fs.readFile(eventsPath, "utf8");
      const lines = eventsRaw.trim().split("\n").filter(Boolean);
      console.log("\n📜 Event Timeline:");
      for (const line of lines) {
        const ev = JSON.parse(line);
        const time = new Date(ev.timestamp).toLocaleTimeString();
        if (ev.type === "TASK_STARTED") {
          console.log(`  [${time}] ⏳ Task ${ev.taskId} started (Role: ${ev.role})`);
        } else if (ev.type === "TASK_COMPLETED") {
          console.log(`  [${time}] ✅ Task ${ev.taskId} completed by ${ev.agent} (Role: ${ev.role})`);
        } else if (ev.type === "HANDOFF") {
          console.log(`  [${time}] 🤝 Handoff: ${ev.details.from.toUpperCase()} ──> ${ev.details.to.toUpperCase()} (${ev.details.role})`);
        } else if (ev.type === "RUN_COMPLETED") {
          console.log(`  [${time}] 🏁 Run COMPLETED successfully!`);
        } else if (ev.type === "RUN_FAILED") {
          console.log(`  [${time}] ❌ Run ended with status: ${ev.details?.status}`);
        }
      }
    } catch {
      // Events file may be empty
    }

    if (runMeta.finalResult) {
      console.log(`\n📝 Final Summary:\n   ${runMeta.finalResult.summary}`);
      if (runMeta.finalResult.verification) {
        console.log(`\n🔎 Final Verification: ${runMeta.finalResult.verification.passed ? "🟢 PASSED" : "🔴 FAILED"}`);
        runMeta.finalResult.verification.evidence?.forEach((ev: string) => {
          console.log(`   - ${ev}`);
        });
      }
    }

    console.log(`\n📂 Artifacts Directory: ${latestRunDir}\n`);
  } catch (err: any) {
    console.log("\nℹ️ No .orchestrator directory found in the current workspace.");
    console.log("Run a task first using: npm start -- run \"<objective>\" --mock");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const isConfig =
    command === "--config" ||
    command === "config" ||
    args.includes("--config") ||
    args.includes("config") ||
    process.env.npm_config_config === "true" ||
    process.env.npm_config_config === "";

  if (isConfig) {
    const workdirIdx = args.indexOf("--workdir");
    const workingDirectory =
      workdirIdx !== -1 && args[workdirIdx + 1]
        ? path.resolve(args[workdirIdx + 1])
        : process.cwd();
    await interactiveConfigMenu(workingDirectory);
    return;
  }

  if (command === "check") {
    await runCheck();
    return;
  }

  if (command === "status") {
    await runStatus();
    return;
  }

  if (command === "run") {
    await runOrchestration(args.slice(1));
    return;
  }

  // If running npm start without args or passing options directly (e.g. npm start -- --mock)
  if (!command || command.startsWith("-")) {
    await runOrchestration(args);
    return;
  }

  // Any other argument is treated directly as the objective
  await runOrchestration(args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
