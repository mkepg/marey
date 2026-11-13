/**
 * The lesson editor: a textarea laid over a highlighted copy of its own text.
 * The textarea is transparent and keeps the caret, selection and input; the
 * copy underneath is drawn by `highlightMarey`. Both sit in one grid cell and
 * take the size of the copy, so they scroll together by construction and the
 * page never needs to keep two scroll positions in step.
 *
 * Imports no Monaco (spec 9C C5): the playground's editor is 900 kB gzipped.
 */
import type { CompilerError } from "../../src/compiler/types";
import { highlightMarey } from "../shared/highlight";

const INDENT = "  ";

export interface TabResult {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/**
 * What Tab and Shift+Tab do to `value` with the selection `start`..`end`. A
 * lone caret takes two spaces on Tab; a selection indents every line it
 * touches (not a last line it only reaches the start of); Shift+Tab removes up
 * to two leading spaces from each such line, or from the caret's line.
 */
export function applyTab(value: string, start: number, end: number, outdent: boolean): TabResult {
  if (!outdent && start === end) {
    return { value: value.slice(0, start) + INDENT + value.slice(end), start: start + INDENT.length, end: start + INDENT.length };
  }
  const first = value.lastIndexOf("\n", start - 1) + 1;
  // A selection that ends on a line's very start does not include that line.
  const reach = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const eol = value.indexOf("\n", reach);
  const last = eol === -1 ? value.length : eol;
  const lines = value.slice(first, last).split("\n");
  let offset = first;
  let nextStart = start;
  let nextEnd = end;
  const out = lines.map((line) => {
    const at = offset;
    offset += line.length + 1;
    if (!outdent) {
      if (line === "") return line;
      if (at <= start) nextStart += INDENT.length;
      if (at < end) nextEnd += INDENT.length;
      return INDENT + line;
    }
    const lead = /^ {1,2}/.exec(line)?.[0].length ?? 0;
    if (lead === 0) return line;
    nextStart -= Math.min(lead, Math.max(0, start - at));
    nextEnd -= Math.min(lead, Math.max(0, end - at));
    return line.slice(lead);
  });
  return { value: value.slice(0, first) + out.join("\n") + value.slice(last), start: nextStart, end: nextEnd };
}

export interface ErrorLocation {
  readonly line: number;
  readonly col: number;
  readonly message: string;
}

/**
 * The compiler's errors in reading order. Errors the compiler gives no line
 * come last with line 0 and col 0, which the list shows without a location.
 */
export function errorLocations(errors: ReadonlyArray<CompilerError>): ErrorLocation[] {
  return errors
    .map((e, index) => ({
      index,
      line: typeof e.line === "number" ? e.line : 0,
      col: typeof e.line === "number" ? (e.col ?? 1) : 0,
      message: e.message,
    }))
    .sort((a, b) => {
      if ((a.line === 0) !== (b.line === 0)) return a.line === 0 ? 1 : -1;
      return a.line - b.line || a.col - b.col || a.index - b.index;
    })
    .map(({ line, col, message }) => ({ line, col, message }));
}

/** The number of lines in `text`: one more than its newlines. */
export function lineCount(text: string): number {
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

/** The character offset of a 1-based line and column, clamped to the text. */
export function offsetOf(text: string, line: number, col: number): number {
  let at = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf("\n", at);
    if (nl === -1) return text.length;
    at = nl + 1;
  }
  const eol = text.indexOf("\n", at);
  const lineEnd = eol === -1 ? text.length : eol;
  return Math.min(at + Math.max(col - 1, 0), lineEnd);
}

/**
 * Puts `next` in the textarea. The changed span goes in through the browser's
 * own insertText command, so Ctrl+Z still undoes a Tab; where the command is
 * refused the value is assigned, which keeps the text but not the undo history.
 */
function replaceWhole(textarea: HTMLTextAreaElement, next: string): void {
  const before = textarea.value;
  let prefix = 0;
  while (prefix < before.length && prefix < next.length && before[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < next.length - prefix &&
    before[before.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  textarea.focus();
  textarea.setSelectionRange(prefix, before.length - suffix);
  let done = false;
  try {
    done = document.execCommand("insertText", false, next.slice(prefix, next.length - suffix));
  } catch {
    done = false;
  }
  if (!done || textarea.value !== next) textarea.value = next;
}

export interface Editor {
  readonly element: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  getValue(): string;
  setValue(value: string): void;
  /** Marks these 1-based lines as holding an error; an empty list clears them. */
  markLines(lines: ReadonlyArray<number>): void;
  /** Puts the caret at a 1-based line and column and focuses the text. */
  moveCaret(line: number, col: number): void;
}

/** Builds the editor. `onInput` runs after every edit made by the reader. */
export function createEditor(initial: string, label: string, onInput: (value: string) => void): Editor {
  const element = document.createElement("div");
  element.className = "editor";

  const gutter = document.createElement("div");
  gutter.className = "editor-gutter";
  gutter.setAttribute("aria-hidden", "true");

  const scroller = document.createElement("div");
  scroller.className = "editor-scroll";
  const cell = document.createElement("div");
  cell.className = "editor-cell";
  const marks = document.createElement("div");
  marks.className = "editor-marks";
  marks.setAttribute("aria-hidden", "true");
  const pre = document.createElement("pre");
  pre.className = "editor-highlight code";
  pre.setAttribute("aria-hidden", "true");
  const code = document.createElement("code");
  pre.append(code);

  const textarea = document.createElement("textarea");
  textarea.className = "editor-input";
  textarea.name = "marey-source";
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.autocapitalize = "off";
  textarea.setAttribute("autocomplete", "off");
  textarea.setAttribute("autocorrect", "off");
  textarea.setAttribute("aria-label", label);

  cell.append(marks, pre, textarea);
  scroller.append(cell);
  element.append(gutter, scroller);

  let marked: ReadonlyArray<number> = [];
  let lines = 0;

  const paintGutter = (): void => {
    const n = lineCount(textarea.value);
    if (n !== lines) {
      lines = n;
      gutter.replaceChildren(
        ...Array.from({ length: n }, (_, i) => {
          const span = document.createElement("span");
          span.textContent = String(i + 1);
          return span;
        }),
      );
    }
    [...gutter.children].forEach((child, i) => child.classList.toggle("is-error", marked.includes(i + 1)));
  };

  const paintMarks = (): void => {
    marks.replaceChildren(
      ...marked.map((line) => {
        const bar = document.createElement("div");
        bar.style.setProperty("--line", String(line - 1));
        return bar;
      }),
    );
  };

  const paint = (): void => {
    // A trailing newline in a <pre> draws no empty last line; the extra space does,
    // so the copy is as tall as the textarea.
    code.innerHTML = highlightMarey(textarea.value) + "\n";
    paintGutter();
  };

  textarea.addEventListener("input", () => {
    paint();
    onInput(textarea.value);
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Releases focus so Tab leaves the editor again.
      event.preventDefault();
      textarea.blur();
      return;
    }
    if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const result = applyTab(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.shiftKey);
    if (result.value === textarea.value && result.start === textarea.selectionStart && result.end === textarea.selectionEnd) return;
    replaceWhole(textarea, result.value);
    textarea.setSelectionRange(result.start, result.end);
    paint();
    onInput(textarea.value);
  });

  textarea.value = initial;
  paint();

  return {
    element,
    textarea,
    getValue: () => textarea.value,
    setValue(value) {
      textarea.value = value;
      paint();
    },
    markLines(next) {
      marked = [...new Set(next)];
      paintMarks();
      paintGutter();
    },
    moveCaret(line, col) {
      const at = offsetOf(textarea.value, line, col);
      textarea.focus();
      textarea.setSelectionRange(at, at);
    },
  };
}
