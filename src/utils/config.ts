import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface AgentModelConfig {
  agy: string;
  opencode: string;
  codex: string;
}

export const DEFAULT_MODEL_CONFIG: AgentModelConfig = {
  agy: "gemini-3.8-flash",
  opencode: "agnes/agnes-2.5-flash",
  codex: "gpt-5.6-terra",
};

/**
 * Loads model configuration from .orchestrator/config.json if it exists.
 */
export async function loadConfigFile(
  workdir: string = process.cwd()
): Promise<Partial<AgentModelConfig>> {
  const configPath = path.join(workdir, ".orchestrator", "config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const data = JSON.parse(raw);
    const models = data.models || data;
    return {
      ...(typeof models.agy === "string" ? { agy: models.agy.trim() } : {}),
      ...(typeof models.opencode === "string"
        ? { opencode: models.opencode.trim() }
        : {}),
      ...(typeof models.codex === "string"
        ? { codex: models.codex.trim() }
        : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Saves or updates model configuration in .orchestrator/config.json.
 */
export async function saveConfigFile(
  workdir: string = process.cwd(),
  models: Partial<AgentModelConfig>
): Promise<void> {
  const orchestratorDir = path.join(workdir, ".orchestrator");
  await fs.mkdir(orchestratorDir, { recursive: true });
  const configPath = path.join(orchestratorDir, "config.json");

  let existing: Record<string, any> = {};
  try {
    const raw = await fs.readFile(configPath, "utf8");
    existing = JSON.parse(raw);
  } catch {
    // New config file
  }

  existing.models = {
    ...(existing.models || {}),
    ...models,
  };

  await fs.writeFile(configPath, JSON.stringify(existing, null, 2), "utf8");
}

/**
 * Resolves the effective model configuration by applying priority:
 * 1. CLI flags (--agy-model, --opencode-model, --codex-model)
 * 2. Environment variables (AGY_MODEL, OPENCODE_MODEL, CODEX_MODEL)
 * 3. Config file (.orchestrator/config.json)
 * 4. Default values
 */
export async function resolveModelConfig(options: {
  workdir?: string;
  cliOverrides?: Partial<AgentModelConfig>;
  env?: Record<string, string | undefined>;
} = {}): Promise<AgentModelConfig> {
  const {
    workdir = process.cwd(),
    cliOverrides = {},
    env = process.env,
  } = options;

  // 1. File config
  const fileConfig = await loadConfigFile(workdir);

  // 2. Env config
  const envConfig: Partial<AgentModelConfig> = {
    ...(env.AGY_MODEL ? { agy: env.AGY_MODEL.trim() } : {}),
    ...(env.OPENCODE_MODEL ? { opencode: env.OPENCODE_MODEL.trim() } : {}),
    ...(env.CODEX_MODEL ? { codex: env.CODEX_MODEL.trim() } : {}),
  };

  return {
    agy:
      cliOverrides.agy ||
      envConfig.agy ||
      fileConfig.agy ||
      DEFAULT_MODEL_CONFIG.agy,
    opencode:
      cliOverrides.opencode ||
      envConfig.opencode ||
      fileConfig.opencode ||
      DEFAULT_MODEL_CONFIG.opencode,
    codex:
      cliOverrides.codex ||
      envConfig.codex ||
      fileConfig.codex ||
      DEFAULT_MODEL_CONFIG.codex,
  };
}

/**
 * Dynamically fetches available models for a given agent CLI tool.
 */
export async function fetchModelsForAgent(
  agent: "agy" | "codex" | "opencode",
  workdir: string = process.cwd()
): Promise<string[]> {
  if (agent === "agy") {
    try {
      const { execSync } = await import("node:child_process");
      const out = execSync("agy models", {
        encoding: "utf8",
        timeout: 10_000,
        cwd: workdir,
      });
      const models: string[] = [];
      out.split("\n").forEach((l) => {
        const trimmed = l.trim();
        if (!trimmed || trimmed.startsWith("Fetching")) return;
        const id = trimmed.split(/\s+/)[0];
        if (id) models.push(id);
      });
      return Array.from(
        new Set(["gemini-3.8-flash", "gemini-3.8-flash-high", ...models])
      );
    } catch {
      return [
        "gemini-3.8-flash",
        "gemini-3.8-flash-high",
        "gemini-3.8-flash-medium",
        "gemini-3.7-flash-high",
        "gemini-3.1-pro-high",
        "claude-sonnet-4-6",
      ];
    }
  }

  if (agent === "codex") {
    try {
      const os = await import("node:os");
      const codexHome =
        process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
      const cachePath = path.join(codexHome, "models_cache.json");
      const raw = await fs.readFile(cachePath, "utf8");
      const data = JSON.parse(raw);
      const list = (data.models || [])
        .map((m: any) => m.slug || m.name || m.id)
        .filter(Boolean);
      if (list.length > 0) {
        return Array.from(new Set(["gpt-5.6-terra", ...list]));
      }
    } catch {
      // Fallback
    }
    return [
      "gpt-5.6-terra",
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-6.1-sol",
      "gpt-5.5",
      "gpt-reserve",
    ];
  }

  if (agent === "opencode") {
    try {
      const { execSync } = await import("node:child_process");
      const out = execSync("opencode models", {
        encoding: "utf8",
        timeout: 10_000,
        cwd: workdir,
      });
      const list = out
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const popular = [
        "agnes/agnes-2.5-flash",
        "openrouter/google/gemini-2.5-pro",
        "openrouter/anthropic/claude-3.5-sonnet",
        "openrouter/openai/gpt-4o",
        "openrouter/openai/o3-mini",
      ];
      return Array.from(new Set([...popular, ...list]));
    } catch {
      return [
        "agnes/agnes-2.5-flash",
        "openrouter/openai/gpt-4o",
        "openrouter/anthropic/claude-3.5-sonnet",
        "openrouter/google/gemini-2.5-pro",
      ];
    }
  }

  return [];
}

async function askQuestion(
  rl: any,
  prompt: string
): Promise<string | null> {
  try {
    return await rl.question(prompt);
  } catch (err: any) {
    if (err.code === "ERR_USE_AFTER_CLOSE" || err.message?.includes("closed")) {
      return null;
    }
    throw err;
  }
}

/**
 * Interactive menu to view current model configuration,
 * pick an agent, fetch its models, and save the chosen model.
 */
export async function interactiveConfigMenu(
  workdir: string = process.cwd()
): Promise<void> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let running = true;
    while (running) {
      const currentConfig = await resolveModelConfig({ workdir });

      console.log(`
┌─────────────────────────────────────────────────────────────┐
│       ⚙️  CẤU HÌNH MODEL CHO CÁC AGENT (Orchestrator)        │
└─────────────────────────────────────────────────────────────┘

📋 Cấu hình model hiện tại:
  1. agy:      ${currentConfig.agy}
  2. codex:    ${currentConfig.codex}
  3. opencode: ${currentConfig.opencode}
  4. Thoát (Lưu cấu hình)
`);

      const answer = await askQuestion(
        rl,
        "👉 Chọn agent để thay đổi model [1-3] hoặc [4/q để thoát]: "
      );
      if (answer === null) {
        break;
      }
      const choice = answer.trim();

      if (
        choice === "4" ||
        choice.toLowerCase() === "q" ||
        choice.toLowerCase() === "exit"
      ) {
        console.log("\n✅ Cấu hình đã sẵn sàng. Bạn có thể chạy `npm start` bất cứ lúc nào!\n");
        running = false;
        break;
      }

      if (choice === "") {
        continue;
      }

      let targetAgent: "agy" | "codex" | "opencode" | null = null;
      if (choice === "1" || choice.toLowerCase() === "agy") targetAgent = "agy";
      else if (choice === "2" || choice.toLowerCase() === "codex") targetAgent = "codex";
      else if (choice === "3" || choice.toLowerCase() === "opencode") targetAgent = "opencode";

      if (!targetAgent) {
        console.log("⚠️ Lựa chọn không hợp lệ, vui lòng chọn từ 1 đến 4.");
        continue;
      }

      console.log(`\n⏳ Đang fetch danh sách models khả dụng cho '${targetAgent}'...`);
      const models = await fetchModelsForAgent(targetAgent, workdir);

      const displayCount = Math.min(models.length, 15);
      const displayModels = models.slice(0, displayCount);

      console.log(`\n📦 Danh sách models cho '${targetAgent}':`);
      displayModels.forEach((m, idx) => {
        const isCurrent = m === currentConfig[targetAgent!];
        console.log(`  [${idx + 1}] ${m}${isCurrent ? " (Đang chọn)" : ""}`);
      });
      console.log(`  [0] Nhập tên model tùy chỉnh khác\n`);

      const modelAnswer = await askQuestion(
        rl,
        `👉 Chọn model cho '${targetAgent}' [1-${displayCount}] hoặc nhập tên: `
      );
      if (modelAnswer === null) {
        break;
      }
      const modelChoice = modelAnswer.trim();

      let selectedModel = "";
      const num = parseInt(modelChoice, 10);
      if (!isNaN(num) && num >= 1 && num <= displayCount) {
        selectedModel = displayModels[num - 1];
      } else if (modelChoice === "0") {
        const customName = await askQuestion(rl, "👉 Nhập tên model tùy chỉnh: ");
        selectedModel = customName ? customName.trim() : "";
      } else if (modelChoice.length > 0) {
        selectedModel = modelChoice;
      }

      if (selectedModel) {
        await saveConfigFile(workdir, { [targetAgent]: selectedModel });
        console.log(`\n✅ Đã lưu cấu hình: ${targetAgent} -> ${selectedModel}`);
      } else {
        console.log("\n⚠️ Không có thay đổi nào được lưu.");
      }
    }
  } finally {
    try {
      rl.close();
    } catch {
      // ignore
    }
  }
}
