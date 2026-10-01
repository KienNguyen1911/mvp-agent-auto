import { AgentResult, AgentName, AgentStatus } from "./AgentResult.js";
import { AgentRole } from "./TaskEnvelope.js";

export const AGENT_RESULT_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "AgentResult",
  type: "object",
  properties: {
    taskId: { type: "string" },
    runId: { type: "string" },
    agent: { type: "string", enum: ["codex", "agy", "opencode", "mock"] },
    role: {
      type: "string",
      enum: ["planner", "investigator", "implementer", "reviewer", "verifier"],
    },
    status: {
      type: "string",
      enum: ["completed", "blocked", "failed", "needs_followup"],
    },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: { type: "string" },
    },
    filesChanged: {
      type: "array",
      items: { type: "string" },
    },
    commandsExecuted: {
      type: "array",
      items: { type: "string" },
    },
    verification: {
      type: "object",
      properties: {
        passed: { type: "boolean" },
        evidence: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["passed", "evidence"],
    },
    nextAction: {
      type: "object",
      properties: {
        recommendedAgent: {
          type: "string",
          enum: ["codex", "agy", "opencode", "mock"],
        },
        role: {
          type: "string",
          enum: ["planner", "investigator", "implementer", "reviewer", "verifier"],
        },
        instruction: { type: "string" },
      },
      required: ["instruction"],
    },
  },
  required: ["taskId", "runId", "agent", "role", "status", "summary"],
  additionalProperties: true,
};

/**
 * Robust parser that extracts JSON from agent stdout.
 * Handles markdown fences (```json ... ```), raw objects, and loose JSON substrings.
 */
export function extractAndParseJson(text: string): Record<string, any> | null {
  if (!text || typeof text !== "string") return null;

  const trimmed = text.trim();

  // If text contains multiple lines (NDJSON streaming from opencode or similar tools)
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    let errorObj: Record<string, any> | null = null;
    let isNdjsonStream = false;
    let validJsonCount = 0;
    const filesChanged = new Set<string>();
    const commandsExecuted: string[] = [];
    let lastText = "";

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj === "object") {
          validJsonCount++;
          if (obj.type || obj.sessionID || obj.part) {
            isNdjsonStream = true;
          }
          if (obj.type === "error" || obj.error) {
            const msg = obj.error?.message || obj.message || JSON.stringify(obj.error);
            errorObj = {
              status: "blocked",
              summary: msg,
              findings: [obj.error?.type ? `Error type: ${obj.error.type}` : "Process error"],
            };
          }
          if (obj.taskId || (obj.role && obj.summary) || (obj.status && obj.summary)) {
            return obj;
          }
          if (obj.part?.text || obj.text) {
            const textContent = obj.part?.text || obj.text;
            if (typeof textContent === "string" && textContent.trim()) {
              lastText = textContent.trim();
            }
            const inner = extractAndParseJson(textContent);
            if (inner) return inner;
          }
          // Collect tool calls for file changes and commands
          if (obj.type === "tool_use" || obj.part?.type === "tool") {
            const tool = obj.part?.tool || obj.tool;
            const input = obj.part?.state?.input || obj.input;
            if ((tool === "write" || tool === "edit" || tool === "patch") && input?.path) {
              filesChanged.add(input.path);
            }
            if ((tool === "shell" || tool === "execute" || tool === "bash" || tool === "cmd") && (input?.command || input?.code)) {
              commandsExecuted.push(input.command || input.code);
            }
          }
        }
      } catch {
        // Continue
      }
    }
    if (errorObj) return errorObj;

    // If this was an NDJSON session where tools ran or text was produced, but model returned natural language text
    if ((isNdjsonStream || validJsonCount >= 2) && (lastText || filesChanged.size > 0 || commandsExecuted.length > 0)) {
      return {
        status: "completed",
        summary: lastText || "Tasks completed successfully by agent.",
        filesChanged: Array.from(filesChanged),
        commandsExecuted,
        findings: lastText ? [lastText.split("\n")[0].replace(/^#+\s*/, "").trim()] : [],
      };
    }
  }

  let directParsed: Record<string, any> | null = null;
  try {
    directParsed = JSON.parse(trimmed);
  } catch {
    // Continue to regex fallbacks
  }

  if (directParsed) {
    if (directParsed.type === "error" || directParsed.error) {
      const msg = directParsed.error?.message || directParsed.message || JSON.stringify(directParsed.error);
      return {
        status: "blocked",
        summary: msg,
        findings: [directParsed.error?.type ? `Error type: ${directParsed.error.type}` : "Process error"],
      };
    }
    if (typeof directParsed.response === "string") {
      const inner = extractAndParseJson(directParsed.response);
      if (inner) return inner;
      return {
        summary: directParsed.response,
        status: "completed",
      };
    }
    return directParsed;
  }

  // Look for ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed) return parsed;
    } catch {
      // Continue
    }
  }

  // Look for the first outer {...} in the text
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed) {
        if (typeof parsed.response === "string") {
          const inner = extractAndParseJson(parsed.response);
          if (inner) return inner;
        }
        return parsed;
      }
    } catch {
      // Continue
    }
  }

  return null;
}

export function parseAgentResult(
  rawText: string,
  defaults: {
    taskId: string;
    runId: string;
    agent: AgentName;
    role: AgentRole;
  }
): AgentResult {
  const parsed = extractAndParseJson(rawText);

  if (!parsed) {
    return {
      taskId: defaults.taskId,
      runId: defaults.runId,
      agent: defaults.agent,
      role: defaults.role,
      status: "failed",
      summary: "Agent produced output that could not be parsed into a structured AgentResult JSON.",
      findings: ["Unparseable output received from agent process."],
      filesChanged: [],
      commandsExecuted: [],
      rawOutput: rawText,
    };
  }

  // Normalize fields
  const status: AgentStatus =
    ["completed", "blocked", "failed", "needs_followup"].includes(parsed.status)
      ? parsed.status
      : "completed";

  const agent: AgentName =
    ["codex", "agy", "opencode", "mock"].includes(parsed.agent)
      ? parsed.agent
      : defaults.agent;

  const role: AgentRole =
    ["planner", "investigator", "implementer", "reviewer", "verifier"].includes(parsed.role)
      ? parsed.role
      : defaults.role;

  return {
    taskId: parsed.taskId || defaults.taskId,
    runId: parsed.runId || defaults.runId,
    agent,
    role,
    status,
    summary: String(parsed.summary || ""),
    findings: Array.isArray(parsed.findings) ? parsed.findings.map(String) : [],
    filesChanged: Array.isArray(parsed.filesChanged) ? parsed.filesChanged.map(String) : [],
    commandsExecuted: Array.isArray(parsed.commandsExecuted)
      ? parsed.commandsExecuted.map(String)
      : [],
    verification:
      parsed.verification && typeof parsed.verification.passed === "boolean"
        ? {
            passed: parsed.verification.passed,
            evidence: Array.isArray(parsed.verification.evidence)
              ? parsed.verification.evidence.map(String)
              : [],
          }
        : undefined,
    nextAction:
      parsed.nextAction && typeof parsed.nextAction.instruction === "string"
        ? {
            recommendedAgent: parsed.nextAction.recommendedAgent,
            role: parsed.nextAction.role,
            instruction: parsed.nextAction.instruction,
          }
        : undefined,
    rawOutput: rawText,
  };
}
