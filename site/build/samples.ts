import { lex } from "../../src/compiler/lexer";
import { compileSource } from "../../src/compiler/compileSource";
import { buildShareURLFor } from "../../src/lib/share";
import { highlightMarey } from "../shared/highlight";
import { escapeHtml } from "./escape";

export type SampleMode = "live" | "run" | "error" | "fragment" | "solution" | "showcase";

export interface Sample {
  readonly mode: SampleMode;
  readonly source: string;
  /** The content file, as the repository path an error should name. */
  readonly file: string;
  /** The line of `file` on which the fence opens. */
  readonly line: number;
  /** For `error` mode, the diagnostic code the sample must raise; null accepts any error. */
  readonly code: string | null;
}

const PLAYGROUND = "https://marey.pages.dev/";

/** Every message the compiler gives for `source`, with the 1-based line it names. */
export function compileMessages(source: string): { readonly ok: boolean; readonly errors: ReadonlyArray<{ readonly message: string; readonly line: number | undefined }> } {
  const outcome = compileSource(source);
  return { ok: outcome.ok, errors: outcome.errors.map((e) => ({ message: e.message, line: e.line })) };
}

/** The compiler's messages for an `error` sample, ready to show. */
export function errorMessages(source: string): string[] {
  return compileMessages(source).errors.map((e) => e.message);
}

/** True when the source has a `scene` keyword followed by `{`; text in strings and comments does not count. */
function containsSceneBlock(source: string): boolean {
  try {
    const tokens = lex(source);
    return tokens.some((t, i) => t.type === "KEYWORD" && t.value === "scene" && tokens[i + 1]?.type === "LBRACE");
  } catch {
    // A fragment the lexer rejects cannot be tokenised; fall back to the text.
    return /\bscene\s*\{/.test(source);
  }
}

/**
 * What is wrong with a sample, as "file:line: message" entries. Compile errors
 * are placed by adding the error's line within the snippet to the fence's line,
 * so the first line of the snippet is the line after the fence.
 */
export function checkSample(sample: Sample): string[] {
  const at = (line: number): string => `${sample.file}:${line}`;
  const fence = at(sample.line);

  if (sample.mode === "fragment") {
    return containsSceneBlock(sample.source)
      ? [`${fence}: a fragment must not contain a scene block; drop "fragment" so the sample is compiled`]
      : [];
  }

  const result = compileMessages(sample.source);

  if (sample.mode === "error") {
    if (result.ok) return [`${fence}: the sample is marked as an error but it compiles`];
    if (sample.code === null) return [];
    const prefix = `[${sample.code}]`;
    if (result.errors.some((e) => e.message.startsWith(prefix))) return [];
    const got = result.errors
      .map((e) => /^\[[A-Z0-9_]+\]/.exec(e.message)?.[0])
      .filter((c): c is string => c !== undefined)
      .join(", ");
    return [`${fence}: expected an error ${prefix}, got ${got === "" ? "none" : got}`];
  }

  if (result.ok) return [];
  if (result.errors.length === 0) return [`${fence}: the sample does not compile`];
  return result.errors.map((e) => `${at(sample.line + (e.line ?? 0))}: ${e.message}`);
}

/** The figure the client enhances; see the sample contract in the site's build notes. */
export function renderSample(sample: Sample, messages: ReadonlyArray<string>): string {
  const share = buildShareURLFor(PLAYGROUND, sample.source);
  const attrs =
    `class="sample" data-mode="${sample.mode}" data-source="${escapeHtml(sample.source)}"` +
    (share === null ? "" : ` data-playground="${escapeHtml(share)}"`);
  const stage = sample.mode === "error" || sample.mode === "fragment" ? "" : `<div class="sample-stage"></div>\n`;
  const errors =
    sample.mode === "error"
      ? `<ol class="sample-errors">${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ol>\n`
      : "";
  const figure =
    `<figure ${attrs}>\n${stage}` +
    `<pre class="code" data-lang="marey"><code>${highlightMarey(sample.source)}</code></pre>\n${errors}</figure>\n`;
  return sample.mode === "solution"
    ? `<details class="solution"><summary>Show a solution</summary>\n${figure}</details>\n`
    : figure;
}
