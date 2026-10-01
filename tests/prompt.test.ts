import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  isShiftEnter,
  getStringVisualWidth,
  getPhysicalRowCount,
} from "../src/utils/prompt.js";

describe("Prompt Utilities & Key Detection", () => {
  test("isShiftEnter identifies standard Shift+Enter keypress", () => {
    assert.strictEqual(
      isShiftEnter(undefined, { name: "return", shift: true, ctrl: false, meta: false }),
      true
    );
    assert.strictEqual(
      isShiftEnter(undefined, { name: "enter", shift: true, ctrl: false, meta: false }),
      true
    );
  });

  test("isShiftEnter identifies Alt+Enter / Meta+Return keypress", () => {
    assert.strictEqual(
      isShiftEnter(undefined, { name: "return", shift: false, ctrl: false, meta: true }),
      true
    );
    assert.strictEqual(
      isShiftEnter(undefined, { name: "enter", shift: false, ctrl: false, meta: true }),
      true
    );
  });

  test("isShiftEnter identifies Ctrl+Enter keypress", () => {
    assert.strictEqual(
      isShiftEnter(undefined, { name: "return", shift: false, ctrl: true, meta: false }),
      true
    );
  });

  test("isShiftEnter identifies CSI u and Kitty escape sequences", () => {
    assert.strictEqual(isShiftEnter(undefined, undefined, "\x1b[13;2u"), true);
    assert.strictEqual(isShiftEnter(undefined, undefined, "\x1b[13;5u"), true);
    assert.strictEqual(isShiftEnter(undefined, { sequence: "\x1b[13;2u" }), true);
  });

  test("isShiftEnter identifies xterm modifyOtherKeys sequence", () => {
    assert.strictEqual(isShiftEnter(undefined, undefined, "\x1b[27;2;13~"), true);
    assert.strictEqual(isShiftEnter(undefined, { sequence: "\x1b[27;2;13~" }), true);
  });

  test("isShiftEnter identifies raw Alt+Enter", () => {
    assert.strictEqual(isShiftEnter(undefined, undefined, "\x1b\r"), true);
  });

  test("isShiftEnter returns false for normal Enter / Return", () => {
    assert.strictEqual(
      isShiftEnter("\r", { name: "return", shift: false, ctrl: false, meta: false }, "\r"),
      false
    );
    assert.strictEqual(
      isShiftEnter("\r\n", { name: "enter", shift: false, ctrl: false, meta: false }, "\r\n"),
      false
    );
  });

  test("isShiftEnter returns false for standard characters", () => {
    assert.strictEqual(
      isShiftEnter("a", { name: "a", shift: false, ctrl: false, meta: false }, "a"),
      false
    );
    assert.strictEqual(
      isShiftEnter("A", { name: "a", shift: true, ctrl: false, meta: false }, "A"),
      false
    );
  });

  test("getStringVisualWidth handles ASCII and Vietnamese characters", () => {
    assert.strictEqual(getStringVisualWidth("hello"), 5);
    // Vietnamese accented characters should have width 1
    assert.strictEqual(
      getStringVisualWidth("tôi muốn chỉnh sửa code"),
      23
    );
    // Ignores ANSI codes
    assert.strictEqual(
      getStringVisualWidth("\x1b[32mhello\x1b[0m"),
      5
    );
    // Fullwidth / Emojis take 2 columns
    assert.strictEqual(getStringVisualWidth("🚀"), 2);
  });

  test("getPhysicalRowCount calculates line wrapping accurately", () => {
    // Single line within column width
    assert.strictEqual(getPhysicalRowCount("hello world", 80), 1);

    // Empty line takes 1 row
    assert.strictEqual(getPhysicalRowCount("", 80), 1);

    // Exact boundary
    assert.strictEqual(getPhysicalRowCount("a".repeat(80), 80), 1);

    // 81 chars wraps to 2 rows on 80-col terminal
    assert.strictEqual(getPhysicalRowCount("a".repeat(81), 80), 2);

    // 160 chars takes 2 rows, 161 takes 3 rows
    assert.strictEqual(getPhysicalRowCount("a".repeat(160), 80), 2);
    assert.strictEqual(getPhysicalRowCount("a".repeat(161), 80), 3);

    // Multiline string with wrapping:
    // Line 1: 90 chars (2 rows)
    // Line 2: 20 chars (1 row)
    // Total: 3 rows
    const multiline = "a".repeat(90) + "\n" + "b".repeat(20);
    assert.strictEqual(getPhysicalRowCount(multiline, 80), 3);

    // The user's actual prompt from screenshot with " > " prefix:
    const userPrompt =
      " > tôi muốn chỉnh sửa code, thay vì phải nhập số để chọn từng model trong npm run --config như hiện tại thì";
    // Total width is 107 characters. On 80 columns, it occupies 2 physical rows.
    assert.strictEqual(getPhysicalRowCount(userPrompt, 80), 2);
    // On 120 columns, it occupies 1 physical row.
    assert.strictEqual(getPhysicalRowCount(userPrompt, 120), 1);
  });
});
