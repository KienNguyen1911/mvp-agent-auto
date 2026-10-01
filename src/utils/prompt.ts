import * as readline from "node:readline";

/**
 * Checks if a keypress or raw buffer corresponds to Shift+Enter (or newline intent).
 * Supports standard terminals, Windows Terminal, CSI u protocol, modifyOtherKeys, and Alt+Enter.
 */
export function isShiftEnter(str?: string, key?: any, raw?: string): boolean {
  if (raw) {
    if (
      raw === "\x1b[13;2u" ||
      raw === "\x1b[27;2;13~" ||
      raw === "\x1b[13;5u" ||
      raw === "\x1b\r" ||
      raw === "\x1b\n"
    ) {
      return true;
    }
  }

  if (key) {
    // Explicit Shift + Return / Enter
    if (key.shift && (key.name === "return" || key.name === "enter")) {
      return true;
    }
    // Alt + Return / Enter
    if (key.meta && (key.name === "return" || key.name === "enter")) {
      return true;
    }
    // Ctrl + Return / Enter
    if (key.ctrl && (key.name === "return" || key.name === "enter")) {
      return true;
    }
    // LineFeed character
    if (key.name === "enter" && key.sequence === "\n") {
      return true;
    }
    // Terminal escape sequences parsed into key
    if (key.sequence === "\x1b[13;2u" || key.code === "[13;2u") {
      return true;
    }
    if (key.sequence === "\x1b[27;2;13~" || (key.sequence && key.sequence.includes("13;2"))) {
      return true;
    }
  }

  return false;
}

/**
 * Computes the visual column width of a string in a monospace terminal.
 * Correctly accounts for single-width characters (including accented Latin/Vietnamese),
 * combining diacritics (width 0), fullwidth/East Asian characters & emojis (width 2),
 * and ignores ANSI escape codes.
 */
export function getStringVisualWidth(str: string): number {
  // Strip ANSI escape sequences
  const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0) || 0;
    // Combining diacritical marks (Unicode 0x0300 - 0x036F): width 0
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    // Fullwidth, East Asian Wide, and common emojis: width 2
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Calculates the exact number of physical rows that a rendered multiline string occupies
 * in a terminal of the given column width, taking terminal line-wrapping into account.
 */
export function getPhysicalRowCount(formattedText: string, columns: number): number {
  const cols = Math.max(10, columns || 80);
  const lines = formattedText.split("\n");
  let totalRows = 0;
  for (const line of lines) {
    const width = getStringVisualWidth(line);
    totalRows += Math.max(1, Math.ceil(width / cols));
  }
  return totalRows;
}

/**
 * Prompts the user interactively in the terminal for a multiline objective.
 * Allows Shift+Enter (and Alt+Enter) to insert newlines, and Enter to submit.
 * Accurately calculates terminal line wrapping to prevent duplicate lines on long inputs.
 */
export async function promptUserForObjective(): Promise<string> {
  // Fallback for non-interactive / piped environments
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.once("end", () => {
        resolve(data.trim());
      });
    });
  }

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ 💬 Nhập Objective / Prompt (Yêu cầu công việc):              │
│    • [Enter]: Bắt đầu chạy                                  │
│    • [Shift + Enter] hoặc [Alt + Enter]: Xuống dòng         │
│    • [Ctrl + C]: Thoát                                      │
└─────────────────────────────────────────────────────────────┘
`);

  return new Promise((resolve) => {
    let currentText = "";
    let previousPhysicalRowCount = 0;

    const render = () => {
      const cols =
        process.stdout.columns && process.stdout.columns > 0
          ? process.stdout.columns
          : 80;

      // 1. Move cursor up to the top row of the previously rendered block
      if (previousPhysicalRowCount > 1) {
        readline.moveCursor(process.stdout, 0, -(previousPhysicalRowCount - 1));
      }
      // 2. Move to column 0 of that top row
      readline.cursorTo(process.stdout, 0);
      // 3. Clear from that top row all the way down
      readline.clearScreenDown(process.stdout);

      // 4. Format lines with prompt prefix
      const lines = currentText.split("\n");
      const formatted = lines
        .map((l, i) => (i === 0 ? " > " : "   ") + l)
        .join("\n");

      // 5. Output formatted text
      process.stdout.write(formatted);

      // 6. Record physical row count taking line wrapping into account
      previousPhysicalRowCount = getPhysicalRowCount(formatted, cols);
    };

    // Initial render
    render();

    // Enable raw mode and keypress events
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    readline.emitKeypressEvents(process.stdin);

    const onResize = () => {
      render();
    };
    process.stdout.on("resize", onResize);

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.removeListener("data", onRawData);
      process.stdout.removeListener("resize", onResize);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    let lastRawData = "";
    const onRawData = (chunk: Buffer | string) => {
      lastRawData = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    };
    process.stdin.on("data", onRawData);

    const onKeypress = (str: string, key: any) => {
      const raw = lastRawData;
      lastRawData = "";

      // 1. Handle Ctrl+C (Interrupt/Exit)
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n\n🛑 Đã hủy nhập prompt.\n");
        process.exit(0);
      }

      // 2. Handle Shift + Enter (or Alt+Enter, Ctrl+Enter, etc.) -> Add newline
      if (isShiftEnter(str, key, raw)) {
        currentText += "\n";
        render();
        return;
      }

      // 3. Handle Normal Enter (Submit)
      if (
        (key && (key.name === "return" || key.name === "enter")) ||
        raw === "\r" ||
        raw === "\r\n"
      ) {
        const trimmed = currentText.trim();
        if (trimmed.length === 0) {
          // Empty input, do not submit yet
          return;
        }

        cleanup();
        process.stdout.write(
          "\n\n─────────────────────────────────────────────────────────────\n"
        );
        resolve(trimmed);
        return;
      }

      // 4. Handle Backspace / Delete
      if (
        (key && (key.name === "backspace" || key.name === "delete")) ||
        raw === "\b" ||
        raw === "\x7f"
      ) {
        if (currentText.length > 0) {
          // Remove last character safely for UTF-8 unicode
          const chars = Array.from(currentText);
          chars.pop();
          currentText = chars.join("");
          render();
        }
        return;
      }

      // 5. Handle Ctrl+U (Clear line/text)
      if (key && key.ctrl && key.name === "u") {
        currentText = "";
        render();
        return;
      }

      // 6. Handle Regular character typing
      if (str && !key?.ctrl && !key?.meta && !str.startsWith("\x1b")) {
        currentText += str;
        render();
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}
