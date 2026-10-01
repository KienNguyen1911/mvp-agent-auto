import { test, describe, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  DEFAULT_MODEL_CONFIG,
  loadConfigFile,
  saveConfigFile,
  resolveModelConfig,
  buildAgentChoices,
  buildModelChoices,
  findInitialModelIndex,
  CUSTOM_MODEL_SENTINEL,
  EXIT_SENTINEL,
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

  test("buildAgentChoices exposes arrow-select options with exit sentinel", () => {
    const choices = buildAgentChoices({
      agy: "a",
      opencode: "b",
      codex: "c",
    });
    assert.strictEqual(choices.length, 4);
    assert.deepStrictEqual(
      choices.map((c) => c.value),
      ["agy", "codex", "opencode", EXIT_SENTINEL]
    );
  });

  test("buildModelChoices appends custom entry and marks current model", () => {
    const models = ["m1", "m2", "m3"];
    const choices = buildModelChoices(models, "m2", 15);
    assert.strictEqual(choices.length, 4);
    assert.strictEqual(choices[1].hint, "(Đang chọn)");
    assert.strictEqual(choices[0].hint, undefined);
    assert.strictEqual(choices[3].value, CUSTOM_MODEL_SENTINEL);
  });

  test("buildModelChoices respects displayCount limit", () => {
    const models = ["m1", "m2", "m3", "m4"];
    const choices = buildModelChoices(models, "m1", 2);
    assert.strictEqual(choices.length, 3); // 2 models + custom
    assert.strictEqual(choices[0].value, "m1");
    assert.strictEqual(choices[1].value, "m2");
  });

  test("findInitialModelIndex highlights current model or falls back to 0", () => {
    const choices = buildModelChoices(["m1", "m2"], "m2", 15);
    assert.strictEqual(findInitialModelIndex(choices, "m2"), 1);
    assert.strictEqual(findInitialModelIndex(choices, "unknown"), 0);
  });
});
