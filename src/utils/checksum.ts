import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

/**
 * Computes the SHA-256 checksum of a file.
 *
 * @param filePath - Absolute or relative path to the target file.
 * @returns A lowercase hexadecimal SHA-256 digest string.
 * @throws Error if the file cannot be read.
 */
export async function calculateSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  const stream = createReadStream(filePath);

  await pipeline(stream, hash);

  return hash.digest("hex");
}

/**
 * Verifies that the SHA-256 checksum of a file matches an expected value.
 *
 * Both the computed and expected checksums are normalized to lowercase
 * before comparison so the check is case-insensitive.
 *
 * @param filePath - Absolute or relative path to the target file.
 * @param expectedChecksum - The expected SHA-256 digest in hexadecimal form.
 * @returns `true` if the checksums match; otherwise `false`.
 * @throws Error if the file cannot be read.
 */
export async function verifyChecksum(
  filePath: string,
  expectedChecksum: string
): Promise<boolean> {
  const computed = await calculateSha256(filePath);
  return computed === expectedChecksum.toLowerCase().trim();
}
