import type { CliExportFormat } from "../exportPage/protocol";

export interface ExportArgs {
  readonly file: string;
  readonly format: CliExportFormat;
  readonly fps: number;
  readonly durationSeconds: number | null;
  readonly out: string;
  readonly error: string | null;
}

/**
 * The one array the usage text, the unknown-format diagnostic and
 * `parseExportArgs` all read from, so the five formats never drift apart
 * into three separate hand-typed lists (engineering-lessons §5).
 */
const FORMATS = ["png", "apng", "webm", "mp4", "lottie"] as const satisfies readonly CliExportFormat[];

/**
 * 30 fps (`EXPORT_FPS` in `useExport.ts`) — the export button's default, so a
 * plain `marey export a.marey --format webm` reproduces what the button
 * would produce (global constraint 6).
 */
const DEFAULT_FPS = 30;

/**
 * `main.ts`'s overall usage text composes this rather than retyping the
 * synopsis, so there is exactly one copy of it (PF-R4). It holds only the
 * synopsis lines, indented to the `marey export ` column (13 characters) so
 * `check` and `export`'s own lines share a column in `--help`'s combined
 * listing (spec §3); this file's own error messages supply their own
 * "Usage: " label, since `main.ts`'s combined listing supplies just one
 * heading for every command instead.
 */
export const EXPORT_USAGE =
  `marey export <file> --format <${FORMATS.join("|")}>\n` +
  `             [--fps <n>] [--duration <s>] [--out <path>]`;

/**
 * `logo.marey` -> `logo`: strips the directory and the `.marey` extension,
 * by hand rather than with `node:path`, so the result is identical whether
 * the path arrived with `/` or `\` separators regardless of which platform
 * is running the test or the CLI (this repository's determinism ethos:
 * export defaults should not depend on the host's path-separator convention).
 */
function baseName(file: string): string {
  const cut = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  const name = cut >= 0 ? file.slice(cut + 1) : file;
  return name.endsWith(".marey") ? name.slice(0, -".marey".length) : name;
}

const EXTENSION_BY_FORMAT: Record<Exclude<CliExportFormat, "png">, string> = {
  apng: "png",
  webm: "webm",
  mp4: "mp4",
  lottie: "json",
};

/** Matches the button's file names (spec §3), in the working directory. */
export function defaultOutPath(file: string, format: CliExportFormat): string {
  const base = baseName(file);
  return format === "png" ? `${base}-frames` : `${base}.${EXTENSION_BY_FORMAT[format]}`;
}

/**
 * `frame_0007.png` for a plan of up to 10,000 frames, one digit wider for
 * each higher power of ten. The width is sized to the largest index that
 * will actually be formatted (`frameCount - 1`), not to `frameCount` itself,
 * so a plan of exactly 10,000 frames (indices 0..9999) still fits four
 * digits rather than being bumped to five for a round number that is never
 * itself a file name.
 */
export function frameFileName(index: number, frameCount: number): string {
  const width = Math.max(4, String(frameCount - 1).length);
  return `frame_${String(index).padStart(width, "0")}.png`;
}

/**
 * Pure, `check.ts`'s `parseArgs`-style: the first error wins, and any
 * unrecognized `--`-prefixed token is an error, never a file name (spec §3
 * has no `--scale`, so a stray one must not be silently read as a file).
 */
export function parseExportArgs(argv: readonly string[]): ExportArgs {
  const files: string[] = [];
  let format: CliExportFormat | null = null;
  let fps = DEFAULT_FPS;
  let durationSeconds: number | null = null;
  let out: string | null = null;
  let error: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--format") {
      const raw = argv[i + 1];
      i++;
      if (error === null) {
        if (raw !== undefined && (FORMATS as readonly string[]).includes(raw)) {
          format = raw as CliExportFormat;
        } else {
          error = `Unrecognized format '${raw ?? "nothing"}'. ${EXPORT_USAGE}`;
        }
      }
      continue;
    }

    if (arg === "--fps") {
      const raw = argv[i + 1];
      i++;
      const parsed = raw === undefined ? NaN : Number(raw);
      if (error === null) {
        if (!Number.isFinite(parsed)) {
          error = `--fps requires a numeric value, got ${raw ?? "nothing"}. ${EXPORT_USAGE}`;
        } else {
          fps = parsed;
        }
      }
      continue;
    }

    if (arg === "--duration") {
      const raw = argv[i + 1];
      i++;
      const parsed = raw === undefined ? NaN : Number(raw);
      if (error === null) {
        if (!Number.isFinite(parsed) || parsed <= 0) {
          error = `--duration requires a positive number of seconds, got ${raw ?? "nothing"}. ${EXPORT_USAGE}`;
        } else {
          durationSeconds = parsed;
        }
      }
      continue;
    }

    if (arg === "--out") {
      const raw = argv[i + 1];
      i++;
      if (error === null) {
        if (raw === undefined) {
          error = `--out requires a path. ${EXPORT_USAGE}`;
        } else {
          out = raw;
        }
      }
      continue;
    }

    // Same reasoning as check.ts's parseArgs: an unrecognized `--`-prefixed
    // token (e.g. a mistyped flag, or `--scale`, which spec §3 does not
    // offer) must not fall through to `files` and be reported as a missing
    // file later.
    if (arg.startsWith("--")) {
      if (error === null) {
        error = `Unrecognized option '${arg}'. ${EXPORT_USAGE}`;
      }
      continue;
    }

    files.push(arg);
  }

  if (error === null && files.length === 0) {
    error = `no file given. ${EXPORT_USAGE}`;
  } else if (error === null && files.length > 1) {
    error = `marey export takes exactly one file, got ${files.length}. ${EXPORT_USAGE}`;
  }

  if (error === null && format === null) {
    error = `--format is required. ${EXPORT_USAGE}`;
  }

  const file = files[0] ?? "";
  const resolvedFormat = format ?? FORMATS[0];

  return {
    file,
    format: resolvedFormat,
    fps,
    durationSeconds,
    out: out ?? defaultOutPath(file, resolvedFormat),
    error,
  };
}
