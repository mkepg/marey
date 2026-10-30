import type { CompilerError } from "../compiler/types";

/** `m:ss` for a position or duration in seconds; the infinity sign for an indefinite scene. */
export function formatTime(seconds: number): string {
  if (seconds === Infinity) return "∞";
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * The lines a failed player prints: the player's code and message, then one
 * line per compiler error. The compiler's message already starts with its own
 * `[CODE]`, and a position is only known for some phases, so an error without
 * a line is printed as its message alone.
 */
export function diagnosticLines(
  code: string,
  message: string,
  errors: ReadonlyArray<CompilerError>,
): string[] {
  return [
    `${code}: ${message}`,
    ...errors.map((e) => (e.line !== undefined ? `${e.line}:${e.col ?? 1} ${e.message}` : e.message)),
  ];
}
