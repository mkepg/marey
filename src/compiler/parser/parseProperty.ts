import type { Token, TokenType } from "../types";
import { LEGACY_SOURCE_FORMS } from "../languageContract";
import type { ParserState } from "./state";

/**
 * Token types that may start a property name, in parseObject's, parseUse's,
 * and the top-level scene loop's property-parsing branch. One predicate
 * instead of the same six-way disjunction hand-copied at all three call
 * sites — each token class here (FIT, NAMED_COLOR, BOOLEAN, EASING,
 * EXPR_KEYWORD) is a value-position token that is *also* legal as a bare
 * property name, since consumePropertyName reads it positionally rather
 * than requiring IDENT specifically.
 */
const PROPERTY_NAME_START: ReadonlySet<TokenType> = new Set<TokenType>([
  "IDENT", "FIT", "NAMED_COLOR", "BOOLEAN", "EASING", "EXPR_KEYWORD",
]);

export function isPropertyNameStart(type: TokenType): boolean {
  return PROPERTY_NAME_START.has(type);
}

/**
 * The hint appended when a reserved expression word (EXPR_KEYWORD) is found
 * where an identifier was required — an object name, a 'let' binding name,
 * or a 'use' instance name. Extracted so the three call sites can't drift
 * the way parseBinding.ts's copy briefly did (uncaught because it had no
 * test asserting the exact wording).
 */
export function reservedExpressionWordHint(bad: Token): string {
  return bad.type === "EXPR_KEYWORD" ? ` '${bad.value as string}' is a reserved expression word.` : "";
}

export function consumePropertyName(state: ParserState): Token {
  const token = state.consume();
  const old = token.value as string;
  const replacement = LEGACY_SOURCE_FORMS.property[old as keyof typeof LEGACY_SOURCE_FORMS.property];
  if (replacement) {
    state.throwError(
      `[PARSE_RENAMED_PROPERTY] '${old}' was renamed to '${replacement}'. Replace '${old}: ...' with '${replacement}: ...'.`,
      token,
    );
  }
  return token;
}

export function rejectLegacyBinding(state: ParserState): void {
  const token = state.peek();
  if (token.type === "IDENT" && token.value === "def") {
    state.throwError(
      `[PARSE_RENAMED_KEYWORD] 'def' was renamed to 'let'. Replace 'def name = ...' with 'let name = ...'.`,
      token,
    );
  }
}
