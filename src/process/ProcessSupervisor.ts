import { spawn, ChildProcess } from "node:child_process";

export type ProcessState =
  | "STARTING"
  | "RUNNING"
  | "COMPLETED"
  | "TIMEOUT"
  | "FAILED"
  | "CANCELLED";

export interface ProcessRunOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  input?: string;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface ProcessRunResult {
  command: string;
  args: string[];
  pid?: number;
  state: ProcessState;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  startTime: number;
  endTime: number;
  durationMs: number;
}

export class ProcessSupervisor {
  private activeProcesses = new Map<number, ChildProcess>();

  /**
   * Spawns a command and monitors its lifecycle, output streams, timeout, and exit codes.
   */
  public async execute(options: ProcessRunOptions): Promise<ProcessRunResult> {
    const {
      command,
      args,
      cwd,
      env = {},
      timeoutMs = 300_000,
      input,
      onStdout,
      onStderr,
    } = options;

    const startTime = Date.now();
    let state: ProcessState = "STARTING";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killedByTimeout = false;
    let killedByCancel = false;

    return new Promise<ProcessRunResult>((resolve) => {
      const isWindows = process.platform === "win32";

      let child: ChildProcess;
      const isExe = command === "agy" || command.endsWith(".exe");
      if (isWindows && !isExe) {
        const escapeCmdArg = (arg: string): string => {
          if (arg === "") return '""';
          if (/[\s\t\n\v"]/.test(arg)) {
            return `"${arg.replace(/"/g, '""')}"`;
          }
          return arg;
        };
        const fullCmd = [command, ...args.map(escapeCmdArg)].join(" ");
        child = spawn(fullCmd, {
          cwd,
          env: { ...process.env, ...env },
          shell: true,
          windowsHide: true,
        });
      } else {
        child = spawn(command, args, {
          cwd,
          env: { ...process.env, ...env },
          shell: false,
        });
      }

      const pid = child.pid;
      if (pid) {
        this.activeProcesses.set(pid, child);
      }
      state = "RUNNING";

      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          killedByTimeout = true;
          state = "TIMEOUT";
          this.killChild(child);
        }, timeoutMs);
      }

      if (child.stdin) {
        if (input) {
          child.stdin.write(input);
        }
        child.stdin.end();
      }

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuffer += text;
        if (onStdout) {
          try {
            onStdout(text);
          } catch {
            // Ignore subscriber error
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        if (onStderr) {
          try {
            onStderr(text);
          } catch {
            // Ignore subscriber error
          }
        }
      });

      child.on("error", (err: Error) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (pid) this.activeProcesses.delete(pid);

        state = "FAILED";
        stderrBuffer += `\n[ProcessSupervisor Error] ${err.message}`;

        resolve({
          command,
          args,
          pid,
          state,
          exitCode: -1,
          signal: null,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
        });
      });

      child.on("close", (code, signal) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (pid) this.activeProcesses.delete(pid);

        const endTime = Date.now();

        if (killedByTimeout) {
          state = "TIMEOUT";
        } else if (killedByCancel) {
          state = "CANCELLED";
        } else if (code === 0) {
          state = "COMPLETED";
        } else {
          state = "FAILED";
        }

        resolve({
          command,
          args,
          pid,
          state,
          exitCode: code,
          signal,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          startTime,
          endTime,
          durationMs: endTime - startTime,
        });
      });
    });
  }

  private killChild(child: ChildProcess): void {
    try {
      if (process.platform === "win32" && child.pid) {
        // On Windows, taskkill /pid ... /T /F ensures tree termination
        spawn("taskkill", ["/pid", child.pid.toString(), "/T", "/F"], {
          windowsHide: true,
        });
      } else {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 3000);
      }
    } catch {
      // Process might already be dead
    }
  }

  /**
   * Cancel all currently active processes
   */
  public cancelAll(): void {
    for (const [pid, child] of this.activeProcesses.entries()) {
      this.killChild(child);
      this.activeProcesses.delete(pid);
    }
  }
}
