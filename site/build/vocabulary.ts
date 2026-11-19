import { lex } from "../../src/compiler/lexer";
import { EDGE_VALUES } from "../../src/compiler/languageContract";
import type { LessonEntry } from "./types";

/** Token types whose value is itself a word of the language. */
const WORD_TOKENS = new Set(["KEYWORD", "EXPR_KEYWORD", "EASING", "FIT", "BOOLEAN", "DURATION_INDEFINITELY"]);
const EDGES = new Set<string>(EDGE_VALUES);

export interface WordUse {
  readonly word: string;
  readonly line: number;
}

/**
 * Every word of the language a source uses, in order, with its line: each
 * keyword, expression word, easing, fit, boolean and `indefinitely`; each
 * property name (a name followed by `:`); the property an `animate` names
 * after `property:`; and the edge words inside a `bounds` list. Names the
 * author chose, strings, comments and colours are not words of the language.
 */
export function vocabularyUses(source: string): WordUse[] {
  const tokens = lex(source);
  const uses: WordUse[] = [];
  let boundsDepth = 0;
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    if (WORD_TOKENS.has(t.type)) {
      uses.push({ word: String(t.value), line: t.line });
    } else if (t.type === "IDENT") {
      const word = String(t.value);
      if (next?.type === "COLON") {
        uses.push({ word, line: t.line });
        if (word === "bounds" && tokens[i + 2]?.type === "LBRACKET") boundsDepth = -1;
      } else if (prev?.type === "COLON" && tokens[i - 2]?.type === "IDENT" && tokens[i - 2]?.value === "property") {
        uses.push({ word, line: t.line });
      } else if (boundsDepth > 0 && EDGES.has(word)) {
        uses.push({ word, line: t.line });
      }
    }
    // A bounds list is the bracketed value that follows `bounds:`.
    if (boundsDepth === -1 && t.type === "LBRACKET") boundsDepth = 1;
    else if (boundsDepth > 0 && t.type === "LBRACKET") boundsDepth += 1;
    else if (boundsDepth > 0 && t.type === "RBRACKET") boundsDepth -= 1;
  });
  return uses;
}

/** The set of words of the language a source uses (see `vocabularyUses`). */
export function vocabularyOf(source: string): Set<string> {
  return new Set(vocabularyUses(source).map((u) => u.word));
}

export interface ShowcaseSource {
  /** The slug of the lesson whose showcase this is. */
  readonly lesson: string;
  /** The scene file, as an error should name it. */
  readonly file: string;
  readonly source: string;
}

/**
 * Checks that each lesson's showcase uses only the words introduced by that
 * lesson and the lessons before it, in `lessons` order. A word is reported
 * once, at its first line, with the lesson that introduces it, or with the
 * note that none does.
 */
export function showcaseVocabularyProblems(
  lessons: ReadonlyArray<LessonEntry>,
  showcases: ReadonlyArray<ShowcaseSource>,
): string[] {
  const introducedBy = new Map<string, number>();
  lessons.forEach((lesson, i) => {
    for (const word of lesson.vocabulary) if (!introducedBy.has(word)) introducedBy.set(word, i);
  });
  const name = (i: number): string => `lesson ${i + 1} (${lessons[i]!.slug})`;

  const problems: string[] = [];
  for (const showcase of showcases) {
    const at = lessons.findIndex((l) => l.slug === showcase.lesson);
    if (at < 0) {
      problems.push(`${showcase.file}:1: "${showcase.lesson}" is not a lesson in site/site.json`);
      continue;
    }
    const reported = new Set<string>();
    for (const use of vocabularyUses(showcase.source)) {
      if (reported.has(use.word)) continue;
      const from = introducedBy.get(use.word);
      if (from !== undefined && from <= at) continue;
      reported.add(use.word);
      const teacher = from === undefined ? "no lesson introduces" : `${name(from)} introduces`;
      problems.push(`${showcase.file}:${use.line}: the showcase of ${name(at)} uses "${use.word}", which ${teacher}`);
    }
  }
  return problems;
}
