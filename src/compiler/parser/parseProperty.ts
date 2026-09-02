import type { Token } from "../types";
import { LEGACY_SOURCE_FORMS } from "../languageContract";
import type { ParserState } from "./state";

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
