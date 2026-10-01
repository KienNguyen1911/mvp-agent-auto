# 06 - FAILURE & FAULT RECOVERY POLICY

To guarantee predictable, deterministic execution and avoid infinite agent loops or unhandled exceptions, the Bridge enforces the following explicit failure handling matrix:

| Failure Mode | Trigger Condition | System Action | Terminal State |
| :--- | :--- | :--- | :--- |
| **CLI Missing / Not Installed** | CLI binary or wrapper not found in system PATH | Abort run immediately with diagnostics and installation hints | `FAILED` |
| **Process Crash / Non-zero Exit** | Child process exits with code != 0 or uncaught signal | Capture stderr, retry task once with increased error context | If retry fails: `FAILED` |
| **Execution Timeout** | CLI takes longer than configured timeout (default: 300s) | Send SIGTERM, then SIGKILL after 5s. Log timeout event. | `TIMEOUT` |
| **Invalid JSON Output** | Agent returns non-JSON or fails schema validation | Run an extraction fallback (regex JSON block matching ` ```json ... ``` `). If still unparseable, retry with format enforcement. | If retry fails: `FAILED` |
| **Agent Blocked** | Agent returns status `"blocked"` or requests external credentials/human input | Log reason and halt pipeline gracefully | `BLOCKED` |
| **Verification Failure** | Codex reports `verification.passed = false` | Increment loop counter; route back to OpenCode with explicit failure evidence | Return to `implementer` |
| **Max Loops Exceeded** | Verification fails > 3 consecutive times (`MAX_VERIFICATION_LOOPS`) | Stop loop, dump complete diff, audit logs, and require developer intervention | `HUMAN_REQUIRED` |
| **User Abort** | SIGINT (Ctrl+C) received by Bridge | Gracefully signal active child process, flush state to disk, save run status | `CANCELLED` |
