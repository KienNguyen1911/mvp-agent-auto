import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { isShiftEnter } from "../src/utils/prompt.js";

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
});
