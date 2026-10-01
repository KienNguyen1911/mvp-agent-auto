import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  sanitizeFilename,
  isValidRunId,
  validateNonEmptyString,
} from "../src/utils/validator.js";

describe("sanitizeFilename", () => {
  test("returns empty string for empty input", () => {
    assert.strictEqual(sanitizeFilename(""), "");
  });

  test("returns empty string for non-string input", () => {
    assert.strictEqual(sanitizeFilename(null as any), "");
    assert.strictEqual(sanitizeFilename(undefined as any), "");
    assert.strictEqual(sanitizeFilename(123 as any), "");
  });

  test("trims leading and trailing whitespace", () => {
    assert.strictEqual(sanitizeFilename("  hello  "), "hello");
  });

  test("strips illegal filesystem characters", () => {
    assert.strictEqual(
      sanitizeFilename("file<>:\"/\\|?*name"),
      "filename"
    );
  });

  test("removes path traversal sequences", () => {
    assert.strictEqual(sanitizeFilename("../secret"), "secret");
    assert.strictEqual(sanitizeFilename("..\secret"), "secret");
    assert.strictEqual(sanitizeFilename("foo/../bar"), "foobar");
    assert.strictEqual(sanitizeFilename("./evil"), "evil");
  });

  test("collapses consecutive underscores", () => {
    assert.strictEqual(sanitizeFilename("hello___world"), "hello_world");
  });

  test("collapses consecutive dots", () => {
    assert.strictEqual(sanitizeFilename("hello...world"), "hello.world");
  });

  test("truncates overly long names to 200 chars", () => {
    const longName = "a".repeat(300);
    const result = sanitizeFilename(longName);
    assert.strictEqual(result.length, 200);
  });

  test("removes leading and trailing dots after sanitization", () => {
    assert.strictEqual(sanitizeFilename("...hello..."), "hello");
  });

  test("returns 'unnamed' when everything is stripped", () => {
    assert.strictEqual(sanitizeFilename("   <>:\"/\\|?*   "), "unnamed");
  });

  test("preserves valid alphanumeric and common characters", () => {
    assert.strictEqual(
      sanitizeFilename("my-valid_file.name-01"),
      "my-valid_file.name-01"
    );
  });
});

describe("isValidRunId", () => {
  test("returns true for valid run IDs", () => {
    assert.ok(isValidRunId("run-2026-09-30T19-05-23"));
    assert.ok(isValidRunId("run-2024-01-01T00-00-00"));
    assert.ok(isValidRunId("run-1999-12-31T23-59-59"));
  });

  test("returns false for strings without 'run-' prefix", () => {
    assert.ok(!isValidRunId("task-2026-09-30T19-05-23"));
    assert.ok(!isValidRunId("2026-09-30T19-05-23"));
  });

  test("returns false for malformed run IDs", () => {
    assert.ok(!isValidRunId("run-2026/09/30T19:05:23"));
    assert.ok(!isValidRunId("run-26-9-30T19-5-23"));
    assert.ok(!isValidRunId("run--09-30T19-05-23"));
    assert.ok(!isValidRunId("run-2026-9-30T19-5-23"));
  });

  test("returns false for empty or non-string input", () => {
    assert.ok(!isValidRunId(""));
    assert.ok(!isValidRunId(null as any));
    assert.ok(!isValidRunId(undefined as any));
    assert.ok(!isValidRunId(123 as any));
  });

  test("returns false for run IDs with extra characters", () => {
    assert.ok(!isValidRunId("run-2026-09-30T19-05-23-extra"));
    assert.ok(!isValidRunId("xrun-2026-09-30T19-05-23"));
  });
});

describe("validateNonEmptyString", () => {
  test("returns trimmed string for valid input", () => {
    assert.strictEqual(validateNonEmptyString("  hello  ", "name"), "hello");
    assert.strictEqual(validateNonEmptyString("world", "field"), "world");
  });

  test("throws for null input", () => {
    assert.throws(
      () => validateNonEmptyString(null, "field"),
      /Expected a non-empty string for "field"/
    );
  });

  test("throws for undefined input", () => {
    assert.throws(
      () => validateNonEmptyString(undefined, "field"),
      /Expected a non-empty string for "field"/
    );
  });

  test("throws for number input", () => {
    assert.throws(
      () => validateNonEmptyString(42, "age"),
      /Expected a non-empty string for "age"/
    );
  });

  test("throws for empty string", () => {
    assert.throws(
      () => validateNonEmptyString("", "name"),
      /Expected a non-empty string for "name"/
    );
  });

  test("throws for whitespace-only string", () => {
    assert.throws(
      () => validateNonEmptyString("   ", "name"),
      /Expected a non-empty string for "name"/
    );
  });

  test("throws for object input", () => {
    assert.throws(
      () => validateNonEmptyString({ key: "val" }, "obj"),
      /Expected a non-empty string for "obj"/
    );
  });

  test("throws for array input", () => {
    assert.throws(
      () => validateNonEmptyString(["a", "b"], "arr"),
      /Expected a non-empty string for "arr"/
    );
  });
});
