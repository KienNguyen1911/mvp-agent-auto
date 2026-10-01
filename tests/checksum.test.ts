import { test, describe, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { calculateSha256, verifyChecksum } from "../src/utils/checksum.js";

const TEST_DIR = join(process.cwd(), ".tmp-checksum-tests");

describe("checksum utilities", () => {
  let filePath: string;
  let fileContent: string;
  let knownHash: string;

  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    fileContent = "hello, this is a test file for checksum verification.";
    filePath = join(TEST_DIR, "testfile.txt");
    writeFileSync(filePath, fileContent, "utf8");
  });

  after(() => {
    try {
      unlinkSync(filePath);
      // Clean up the temp directory if empty
      const { readdirSync } = require("node:fs");
      if (readdirSync(TEST_DIR).length === 0) {
        readdirSync(TEST_DIR).forEach((f: string) =>
          unlinkSync(join(TEST_DIR, f))
        );
        rmdirSync(TEST_DIR);
      }
    } catch {
      // Best-effort cleanup — do not fail tests on cleanup errors
    }
  });

  // Helper: compute expected hash synchronously for assertion
  function expectedSha256(content: string): string {
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(content).digest("hex");
  }

  function rmdirSync(dir: string): void {
    const { readdirSync, rmdirSync: _rmdir } = require("node:fs");
    _rmdir(dir);
  }

  test("calculateSha256 returns a 64-char lowercase hex string", async () => {
    const hash = await calculateSha256(filePath);
    assert.strictEqual(typeof hash, "string");
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), "hash must be lowercase hex");
  });

  test("calculateSha256 matches known value for deterministic content", async () => {
    const hash = await calculateSha256(filePath);
    const expected = expectedSha256(fileContent);
    assert.strictEqual(hash, expected);
  });

  test("calculateSha256 differs for different file contents", async () => {
    const otherPath = join(TEST_DIR, "other.txt");
    writeFileSync(otherPath, "completely different content", "utf8");
    try {
      const hashA = await calculateSha256(filePath);
      const hashB = await calculateSha256(otherPath);
      assert.notStrictEqual(hashA, hashB);
    } finally {
      unlinkSync(otherPath);
    }
  });

  test("calculateSha256 throws for a non-existent file", async () => {
    const missingPath = join(TEST_DIR, "does-not-exist.txt");
    await assert.rejects(
      calculateSha256(missingPath),
      /ENOENT|Cannot read|.*read/i
    );
  });

  test("verifyChecksum returns true for a matching checksum", async () => {
    const correctHash = expectedSha256(fileContent);
    const result = await verifyChecksum(filePath, correctHash);
    assert.strictEqual(result, true);
  });

  test("verifyChecksum returns false for a wrong checksum", async () => {
    const result = await verifyChecksum(filePath, "0000000000000000000000000000000000000000000000000000000000000000");
    assert.strictEqual(result, false);
  });

  test("verifyChecksum is case-insensitive", async () => {
    const correctHash = expectedSha256(fileContent);
    // Pass the same hash with mixed case
    const mixedCase = correctHash.substring(0, 4).toUpperCase() + correctHash.substring(4);
    const result = await verifyChecksum(filePath, mixedCase);
    assert.strictEqual(result, true);
  });

  test("verifyChecksum trims whitespace from expected checksum", async () => {
    const correctHash = expectedSha256(fileContent);
    const result = await verifyChecksum(filePath, `  ${correctHash}  `);
    assert.strictEqual(result, true);
  });

  test("verifyChecksum throws when the file does not exist", async () => {
    const missingPath = join(TEST_DIR, "missing.txt");
    await assert.rejects(verifyChecksum(missingPath, "abcd"), /ENOENT|Cannot read|.*read/i);
  });
});
