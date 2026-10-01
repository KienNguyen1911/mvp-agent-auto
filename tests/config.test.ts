import { test, describe, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  DEFAULT_MODEL_CONFIG,
  loadConfigFile,
  saveConfigFile,
  resolveModelConfig,
} from "../src/utils/config.js";

const TEST_DIR = path.join(process.cwd(), ".tmp-config-test");

describe("Model Configuration Management", () => {
  before(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  test("resolveModelConfig returns default values when no config is present", async () => {
    const config = await resolveModelConfig({
      workdir: TEST_DIR,
      env: {},
    });

    assert.strictEqual(config.agy, DEFAULT_MODEL_CONFIG.agy);
    assert.strictEqual(config.opencode, DEFAULT_MODEL_CONFIG.opencode);
    assert.strictEqual(config.codex, DEFAULT_MODEL_CONFIG.codex);
  });

  test("saveConfigFile writes and loadConfigFile reads .orchestrator/config.json", async () => {
    await saveConfigFile(TEST_DIR, {
      agy: "custom-agy-model",
      opencode: "custom-opencode-model",
    });

    const loaded = await loadConfigFile(TEST_DIR);
    assert.strictEqual(loaded.agy, "custom-agy-model");
    assert.strictEqual(loaded.opencode, "custom-opencode-model");
    assert.strictEqual(loaded.codex, undefined);
  });

  test("resolveModelConfig applies file configuration over defaults", async () => {
    const config = await resolveModelConfig({
      workdir: TEST_DIR,
      env: {},
    });

    assert.strictEqual(config.agy, "custom-agy-model");
    assert.strictEqual(config.opencode, "custom-opencode-model");
    assert.strictEqual(config.codex, DEFAULT_MODEL_CONFIG.codex);
  });

  test("resolveModelConfig prioritizes environment variables over file config", async () => {
    const config = await resolveModelConfig({
      workdir: TEST_DIR,
      env: {
        AGY_MODEL: "env-agy-model",
      },
    });

    assert.strictEqual(config.agy, "env-agy-model");
    assert.strictEqual(config.opencode, "custom-opencode-model");
  });

  test("resolveModelConfig prioritizes CLI overrides over all else", async () => {
    const config = await resolveModelConfig({
      workdir: TEST_DIR,
      cliOverrides: {
        agy: "cli-agy-model",
        codex: "cli-codex-model",
      },
      env: {
        AGY_MODEL: "env-agy-model",
      },
    });

    assert.strictEqual(config.agy, "cli-agy-model");
    assert.strictEqual(config.opencode, "custom-opencode-model");
    assert.strictEqual(config.codex, "cli-codex-model");
  });
});
