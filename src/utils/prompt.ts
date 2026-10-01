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
 * Prompts the user interactively in the terminal for a multiline objective.
 * Allows Shift+Enter (and Alt+Enter) to insert newlines, and Enter to submit.
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
    let previousRenderedLineCount = 0;

    const render = () => {
      // Clear previously rendered lines
      if (previousRenderedLineCount > 1) {
        readline.moveCursor(process.stdout, 0, -(previousRenderedLineCount - 1));
      }
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);

      const lines = currentText.split("\n");
      const formatted = lines
        .map((l, i) => (i === 0 ? " > " : "   ") + l)
        .join("\n");

      process.stdout.write(formatted);
      previousRenderedLineCount = lines.length;
    };

    // Initial render
    render();

    // Enable raw mode and keypress events
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    readline.emitKeypressEvents(process.stdin);

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.removeListener("data", onRawData);
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
        process.stdout.write("\n\n─────────────────────────────────────────────────────────────\n");
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

      // 6. Handle Pasted multiline text (not starting with escape code)
      if (raw && !raw.startsWith("\x1b") && (raw.includes("\n") || raw.includes("\r"))) {
        const cleanPaste = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        currentText += cleanPaste;
        render();
        return;
      }

      // 7. Handle Regular character typing
      if (str && !key?.ctrl && !key?.meta && !str.startsWith("\x1b")) {
        currentText += str;
        render();
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}
