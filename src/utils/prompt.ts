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
 * ─────────────────────────────────────────────────────────────
 * Interactive arrow-key selection (zero-dependency).
 * Up/Down + Enter to pick an option, with non-TTY fallback.
 * ─────────────────────────────────────────────────────────────
 */

export interface SelectChoice<T> {
  label: string;
  value: T;
  hint?: string;
}

export interface PromptSelectOptions<T> {
  message: string;
  choices: Array<SelectChoice<T>>;
  initialIndex?: number;
  /** Max visible rows before scrolling. Defaults to 10. */
  pageSize?: number;
}

/**
 * Clamps an index into [0, length-1]. Returns 0 when list is empty.
 * Pure helper — unit tested.
 */
export function normalizeSelectIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return Math.trunc(index);
}

/**
 * Moves a selection pointer one step up/down with wrap-around.
 * Pure helper — unit tested.
 */
export function moveSelectIndex(
  current: number,
  direction: "up" | "down",
  length: number,
  wrap: boolean = true
): number {
  if (length <= 0) return 0;
  const cur = normalizeSelectIndex(current, length);
  if (direction === "down") {
    const next = cur + 1;
    if (next >= length) return wrap ? 0 : length - 1;
    return next;
  }
  const prev = cur - 1;
  if (prev < 0) return wrap ? length - 1 : 0;
  return prev;
}

/**
 * Computes the visible window [start, end) for a scrolling list so the
 * selected row is always visible. Pure helper — unit tested.
 */
export function getSelectWindow(
  selected: number,
  total: number,
  pageSize: number
): { start: number; end: number } {
  const size = Math.max(1, Math.trunc(pageSize) || 10);
  if (total <= size) return { start: 0, end: total };
  const sel = normalizeSelectIndex(selected, total);
  // Keep selection roughly centered, biased to top for short lists.
  let start = sel - Math.floor(size / 2);
  if (start < 0) start = 0;
  let end = start + size;
  if (end > total) {
    end = total;
    start = end - size;
  }
  return { start, end };
}

/**
 * Interactive single-select prompt.
 * - TTY: Arrow Up/Down (or k/j) to move, Enter to confirm,
 *   Esc / Ctrl+C to cancel (resolves null).
 * - Non-TTY: numbered-list fallback via readline question.
 * - Empty choices: resolves null immediately (no prompt).
 */
export async function promptSelect<T>(
  options: PromptSelectOptions<T>
): Promise<T | null> {
  const { message, choices } = options;
  if (!choices || choices.length === 0) return null;

  const pageSize = Math.max(1, options.pageSize ?? 10);
  const initial = normalizeSelectIndex(options.initialIndex ?? 0, choices.length);

  const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (m: boolean) => void };
  const stdout = process.stdout;

  const isTTY = Boolean(
    stdin.isTTY && stdout.isTTY && typeof stdin.setRawMode === "function"
  );
  if (!isTTY) {
    return promptSelectFallback(message, choices);
  }

  return new Promise<T | null>((resolve) => {
    let selected = initial;
    let renderedRows = 0;
    let settled = false;

    const hideCursor = "\x1B[?25l";
    const showCursor = "\x1B[?25h";

    const render = () => {
      const cols = stdout.columns && stdout.columns > 0 ? stdout.columns : 80;

      // Clear previously rendered rows.
      if (renderedRows > 1) {
        readline.moveCursor(stdout, 0, -(renderedRows - 1));
      }
      readline.cursorTo(stdout, 0);
      readline.clearScreenDown(stdout);

      const { start, end } = getSelectWindow(selected, choices.length, pageSize);
      const lines: string[] = [];
      lines.push(`? ${message}`);
      lines.push(`  (↑↓ di chuyển • Enter chọn • Esc hủy)`);
      if (choices.length > pageSize) {
        lines.push(`  [${selected + 1}/${choices.length}]`);
      }
      for (let i = start; i < end; i++) {
        const c = choices[i];
        const isSel = i === selected;
        const pointer = isSel ? "❯" : " ";
        const hint = c.hint ? ` ${c.hint}` : "";
        lines.push(`${pointer} ${c.label}${hint}`);
      }
      if (start > 0) lines.push(`  … (${start} mục phía trên)`);
      if (end < choices.length) lines.push(`  … (${choices.length - end} mục phía dưới)`);

      const fullOutput = lines.join("\n");
      stdout.write(hideCursor + fullOutput);
      renderedRows = getPhysicalRowCount(fullOutput, cols);
    };

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      try {
        if (typeof stdin.setRawMode === "function") {
          stdin.setRawMode(false);
        }
      } catch {
        // ignore
      }
      stdout.write(showCursor);
    };

    const done = (value: T | null) => {
      if (settled) return;
      settled = true;
      cleanup();

      // Clear the rendered interactive menu
      if (renderedRows > 1) {
        readline.moveCursor(stdout, 0, -(renderedRows - 1));
      }
      readline.cursorTo(stdout, 0);
      readline.clearScreenDown(stdout);

      // Print clean summary line
      if (value !== null) {
        const choice = choices[selected];
        stdout.write(`✔ ${message}: ${choice ? choice.label : String(value)}\n`);
      } else {
        stdout.write(`✖ ${message} (Đã hủy)\n`);
      }

      resolve(value);
    };

    const onKeypress = (_str: string, key: any) => {
      if (!key) return;
      // Ctrl+C → cancel
      if (key.ctrl && key.name === "c") {
        done(null);
        return;
      }
      // Esc / Ctrl+[ → cancel
      if (key.name === "escape" || key.sequence === "\x1b") {
        done(null);
        return;
      }
      if (key.name === "up" || key.name === "k") {
        selected = moveSelectIndex(selected, "up", choices.length, true);
        render();
        return;
      }
      if (key.name === "down" || key.name === "j") {
        selected = moveSelectIndex(selected, "down", choices.length, true);
        render();
        return;
      }
      // Page up/down for long lists
      if (key.name === "pageup") {
        for (let i = 0; i < pageSize; i++) {
          selected = moveSelectIndex(selected, "up", choices.length, false);
        }
        render();
        return;
      }
      if (key.name === "pagedown") {
        for (let i = 0; i < pageSize; i++) {
          selected = moveSelectIndex(selected, "down", choices.length, false);
        }
        render();
        return;
      }
      if (key.name === "home") {
        selected = 0;
        render();
        return;
      }
      if (key.name === "end") {
        selected = choices.length - 1;
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        done(choices[selected].value);
        return;
      }
      // Number shortcuts: pressing 1-9 jumps to that visible option
      if (_str && /^[1-9]$/.test(_str)) {
        const { start } = getSelectWindow(selected, choices.length, pageSize);
        const idx = start + parseInt(_str, 10) - 1;
        if (idx < choices.length) {
          selected = idx;
          render();
        }
        return;
      }
    };

    render();

    try {
      stdin.setRawMode!(true);
    } catch {
      // If raw mode fails, fall back to numbered input.
      cleanup();
      promptSelectFallback(message, choices).then(resolve);
      return;
    }
    stdin.resume();
    readline.emitKeypressEvents(stdin);
    process.stdin.on("keypress", onKeypress);
  });
}

async function promptSelectFallback<T>(
  message: string,
  choices: Array<SelectChoice<T>>
): Promise<T | null> {
  choices.forEach((c, idx) => {
    const hint = c.hint ? ` ${c.hint}` : "";
    console.log(`  [${idx + 1}] ${c.label}${hint}`);
  });
  const answer = await askSimpleQuestion(
    `👉 ${message} [1-${choices.length}]: `
  );
  if (answer === null) return null;
  const trimmed = answer.trim();
  if (trimmed === "") return null;
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= choices.length) {
    return choices[num - 1].value;
  }
  // Allow typing the value/label directly for passthrough inputs.
  const direct = choices.find(
    (c) => String(c.value) === trimmed || c.label === trimmed
  );
  if (direct) return direct.value;
  return null;
}

async function askSimpleQuestion(prompt: string): Promise<string | null> {
  const mod = await import("node:readline/promises");
  const rl = mod.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await rl.question(prompt);
  } catch (err: any) {
    if (err.code === "ERR_USE_AFTER_CLOSE" || err.message?.includes("closed")) {
      return null;
    }
    throw err;
  } finally {
    try {
      rl.close();
    } catch {
      // ignore
    }
  }
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
