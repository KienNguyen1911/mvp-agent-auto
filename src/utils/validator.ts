/**
 * Data validation utilities for the orchestration bridge.
 */

/**
 * Sanitizes a filename by stripping illegal filesystem characters,
 * removing path traversal sequences, and trimming whitespace.
 *
 * @param name - The raw filename string.
 * @returns A sanitized filename safe for filesystem use.
 */
export function sanitizeFilename(name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    return "";
  }

  // Trim whitespace
  let sanitized = name.trim();

  // Remove path traversal sequences (../, ..\, .\, .\\, etc.)
  sanitized = sanitized.replace(/(?:\.\.[\\/]|[/\\]\.\.?)/g, "");

  // Strip characters illegal in filenames across common filesystems:
  // < > : " / \ | ? * and control characters (0x00-0x1F)
  sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1F]/g, "");

  // Collapse consecutive underscores/dots to avoid ugly names
  sanitized = sanitized.replace(/[_]{2,}/g, "_");
  sanitized = sanitized.replace(/[.]{2,}/g, ".");

  // Truncate to a reasonable max length (255 is NTFS max, use 200 for safety)
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 200);
  }

  // Remove leading/trailing dots and spaces left after sanitization
  sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, "");

  // If empty after all sanitization, return a default
  return sanitized || "unnamed";
}

/**
 * Validates that a string conforms to the orchestration run ID format.
 *
 * Run IDs follow the pattern: `run-YYYY-MM-DDTHH-MM-SS`
 * (ISO 8601 timestamp with colons and dots replaced by hyphens).
 *
 * @param runId - The string to validate.
 * @returns `true` if the string is a valid run ID; otherwise `false`.
 */
export function isValidRunId(runId: string): boolean {
  if (typeof runId !== "string" || runId.length === 0) {
    return false;
  }

  // Pattern: run-YYYY-MM-DDTHH-MM-SS
  const runIdRegex = /^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
  return runIdRegex.test(runId);
}

/**
 * Validates that a value is a non-empty string and returns it.
 * Throws an error with a descriptive message if validation fails.
 *
 * @param val - The value to validate.
 * @param fieldName - The field name used in error messages.
 * @returns The validated, trimmed string.
 * @throws Error if val is not a non-empty string.
 */
export function validateNonEmptyString(
  val: unknown,
  fieldName: string
): string {
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new Error(
      `Expected a non-empty string for "${fieldName}", but received: ${
        val === null ? "null" : val === undefined ? "undefined" : typeof val
      }`
    );
  }
  return val.trim();
}
