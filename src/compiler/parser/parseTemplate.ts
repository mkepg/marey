// Updated src/compiler/parser/parseTemplate.ts
import { ParserState, describeToken, ParseException } from "./state";
import { parseObject } from "./parseObject";
import { parseBinding } from "./parseBinding";
import { parseGenerate } from "./parseGenerate";
import { parseUse } from "./parseUse";
import { rejectLegacyBinding } from "./parseProperty";
import { markDryRunPlaceholder } from "./dryRunPlaceholder";

export function parseTemplate(state: ParserState): void {
  state.consume("KEYWORD");

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`Expected a template name after 'template', but found ${describeToken(bad)}.`, bad);
  }

  const nameTok = state.consume("IDENT");
  const templateName = nameTok.value as string;

  if (state.templates[templateName]) {
    state.throwError(`Template '${templateName}' is already defined.`, nameTok);
  }

  state.consume("LPAREN");
  const params: string[] = [];
  while (state.peek().type !== "RPAREN" && state.peek().type !== "EOF") {
    if (state.peek().type !== "IDENT") {
      const bad = state.peek();
      state.throwError(`Expected a parameter name, but found ${describeToken(bad)}.`, bad);
    }
    const paramTok = state.consume("IDENT");
    const paramName = paramTok.value as string;
    if (params.includes(paramName)) {
      state.throwError(`Duplicate parameter name '${paramName}' in template '${templateName}'.`, paramTok);
    }
    params.push(paramName);
    if (state.peek().type !== "RPAREN") state.consume("COMMA");
  }
  state.consume("RPAREN");

  const braceTok = state.consume("LBRACE");
  const startPos = state.pos;

  // --- NEW: Dry-Run Syntax Validation ---
  const snapshot = { pos: state.pos, env: state.env, count: state.globalNodeCount };
  state.env = Object.create(state.env);
  params.forEach(p => {
    // Marked so a list-valued use (`generate`'s collection, or indexing) can
    // treat this as a placeholder instead of a genuine type mismatch — see
    // dryRunPlaceholder.ts. Real `use` expansion overwrites this binding with
    // the real evaluated argument and never applies the marker.
    state.env[p] = markDryRunPlaceholder({ kind: "number", value: 0, line: 0, col: 0, endLine: 0, endCol: 0 });
  });

  let nesting = 1;
  while (state.pos < state.tokens.length) {
    const t = state.peek();
    try {
      rejectLegacyBinding(state);
      if (t.type === "LBRACE") nesting++;
      if (t.type === "RBRACE") {
        nesting--;
        if (nesting === 0) break;
      }
      // Briefly validate tokens without committing nodes to the scene
      if (t.type === "KEYWORD") {
        if (t.value === "let") parseBinding(state);
        else if (t.value === "generate") parseGenerate(state, 1);
        else if (t.value === "use") parseUse(state, 1);
        else parseObject(state, 1);
      } else {
        state.pos++;
      }
    } catch (e) {
      if (e instanceof ParseException) {
        state.errors.push(e.error);
        state.synchronize();
      } else throw e;
    }
  }
  const endPos = state.pos;
  state.pos = snapshot.pos;
  state.env = snapshot.env;
  state.globalNodeCount = snapshot.count;
  // ---------------------------------------

  if (nesting !== 0) {
    state.throwError(`Template '${templateName}' was not closed.`, braceTok);
  }

  state.templates[templateName] = { name: templateName, params, startPos, endPos };
  state.pos = endPos + 1;
}
