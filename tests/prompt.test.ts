import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  isShiftEnter,
  getStringVisualWidth,
  getPhysicalRowCount,
  normalizeSelectIndex,
  moveSelectIndex,
  getSelectWindow,
  promptSelect,
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

  test("normalizeSelectIndex clamps out-of-range indexes", () => {
    assert.strictEqual(normalizeSelectIndex(0, 0), 0);
    assert.strictEqual(normalizeSelectIndex(5, 0), 0);
    assert.strictEqual(normalizeSelectIndex(-3, 5), 0);
    assert.strictEqual(normalizeSelectIndex(0, 5), 0);
    assert.strictEqual(normalizeSelectIndex(4, 5), 4);
    assert.strictEqual(normalizeSelectIndex(5, 5), 4);
    assert.strictEqual(normalizeSelectIndex(99, 5), 4);
    assert.strictEqual(normalizeSelectIndex(NaN, 5), 0);
  });

  test("moveSelectIndex moves up/down with wrap-around", () => {
    assert.strictEqual(moveSelectIndex(0, "down", 3), 1);
    assert.strictEqual(moveSelectIndex(2, "down", 3), 0);
    assert.strictEqual(moveSelectIndex(0, "up", 3), 2);
    assert.strictEqual(moveSelectIndex(1, "up", 3), 0);
    // Empty list stays at 0
    assert.strictEqual(moveSelectIndex(0, "down", 0), 0);
  });

  test("moveSelectIndex respects wrap=false bounds clamping", () => {
    assert.strictEqual(moveSelectIndex(2, "down", 3, false), 2);
    assert.strictEqual(moveSelectIndex(0, "up", 3, false), 0);
    assert.strictEqual(moveSelectIndex(1, "down", 3, false), 2);
  });

  test("getSelectWindow shows full list when it fits in pageSize", () => {
    assert.deepStrictEqual(getSelectWindow(0, 5, 10), { start: 0, end: 5 });
    assert.deepStrictEqual(getSelectWindow(4, 5, 10), { start: 0, end: 5 });
  });

  test("getSelectWindow scrolls to keep selection visible", () => {
    const w0 = getSelectWindow(0, 20, 10);
    assert.strictEqual(w0.start, 0);
    assert.strictEqual(w0.end, 10);
    // Selection near the end pins window to the bottom
    assert.deepStrictEqual(getSelectWindow(19, 20, 10), { start: 10, end: 20 });
    // Middle selection stays inside window
    const mid = getSelectWindow(10, 20, 10);
    assert.ok(mid.start <= 10 && 10 < mid.end);
    assert.strictEqual(mid.end - mid.start, 10);
    // Clamped selection also yields a valid window
    const clamped = getSelectWindow(99, 20, 10);
    assert.deepStrictEqual(clamped, { start: 10, end: 20 });
  });

  test("promptSelect returns null immediately for empty choices (no hang)", async () => {
    const result = await promptSelect({ message: "empty", choices: [] });
    assert.strictEqual(result, null);
  });

  test("promptSelect navigates with arrow keys and emits precise cursor movements", async () => {
    const stream = await import("node:stream");
    const inStream = new stream.PassThrough();
    (inStream as any).isTTY = true;
    (inStream as any).setRawMode = () => {};

    let output = "";
    const outStream = new stream.PassThrough();
    (outStream as any).isTTY = true;
    (outStream as any).columns = 80;
    outStream.on("data", (d) => {
      output += d.toString();
    });

    const origStdin = process.stdin;
    const origStdout = process.stdout;
    Object.defineProperty(process, "stdin", { value: inStream, configurable: true });
    Object.defineProperty(process, "stdout", { value: outStream, configurable: true });

    try {
      const choices = [
        { label: "Option A", value: "a" },
        { label: "Option B", value: "b" },
        { label: "Option C", value: "c" },
      ];

      const promise = promptSelect({
        message: "Pick one",
        choices,
        initialIndex: 0,
      });

      // Send Down arrow, then Enter
      setTimeout(() => inStream.write("\x1b[B"), 20);
      setTimeout(() => inStream.write("\r"), 40);

      const res = await promise;
      assert.strictEqual(res, "b");

      // Verify that re-render moved cursor up by the exact row count (4 rows)
      const moveUps = output.match(/\x1b\[4A/g);
      assert.ok(moveUps && moveUps.length >= 1, "Should move cursor up exactly 4 rows");
    } finally {
      Object.defineProperty(process, "stdin", { value: origStdin, configurable: true });
      Object.defineProperty(process, "stdout", { value: origStdout, configurable: true });
    }
  });
});
