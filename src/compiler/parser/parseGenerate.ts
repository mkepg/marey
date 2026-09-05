import type { AstValue, ObjectNode, Token } from "../types";
import { ParserState, describeToken, ParseException } from "./state";
import { parseObject } from "./parseObject";
import { parseBinding } from "./parseBinding";
import { parseValue } from "./parseValue";
import { parseUse } from "./parseUse";
import { rejectLegacyBinding } from "./parseProperty";
import {
  carryPredicateDerivedCardinality,
  hasPredicateDerivedCardinality,
} from "./cardinalityProvenance";
import { isDryRunPlaceholder, markDryRunPlaceholder } from "./dryRunPlaceholder";

export function parseGenerate(state: ParserState, depth: number): ObjectNode[] {
  state.consume("KEYWORD");
  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`In ${state.currentContext}: Expected a loop variable name after 'generate', but found ${describeToken(bad)}.`, bad);
  }
  const loopVarTok = state.consume("IDENT");
  const loopVar = loopVarTok.value as string;

  let indexVar: string | null = null;
  let duplicateBinderTok: Token | null = null;
  if (state.peek().type === "COMMA") {
    state.consume("COMMA");
    if (state.peek().type !== "IDENT") {
      state.throwError(`In ${state.currentContext}: Expected an index variable name after ',', but found ${describeToken(state.peek())}.`, state.peek());
    }
    indexVar = state.consume("IDENT").value as string;
    if (indexVar === loopVar) {
      duplicateBinderTok = state.tokens[state.pos - 1];
    }
  }

  const inTok = state.peek();
  if (inTok.type === "IDENT" && inTok.value === "from") {
    state.throwError(
      `[PARSE_RENAMED_KEYWORD] 'generate ${loopVar} from A to B' was replaced by 'generate ${loopVar} in A to B'. 'A to B' is now an ordinary list, so 'generate' has one header shape for both ranges and data lists.`,
      inTok,
    );
  }
  if (inTok.type !== "EXPR_KEYWORD" || inTok.value !== "in") {
    state.throwError(`In ${state.currentContext}: Expected 'in' after the loop variable, but found ${describeToken(inTok)}.`, inTok);
  }
  state.consume();

  const prevContext = state.currentContext;
  state.currentContext = "generate block collection";
  const collection = parseValue(state);
  state.currentContext = prevContext;

  let items: ReadonlyArray<AstValue>;
  if (collection.kind === "list") {
    items = collection.value;
  } else if (isDryRunPlaceholder(collection)) {
    // `parseTemplate.ts`'s dry run binds every parameter to a numeric
    // placeholder before a real argument exists, so a list-valued parameter
    // (direct, aliased through 'let', or reached by indexing) looks like a
    // number here. Rejecting it would fail template *definition* for a
    // header a real list argument makes perfectly legal at 'use' expansion.
    // One synthesized element is enough for the loop below to walk the body
    // once and still catch a genuine syntax defect inside it.
    items = [markDryRunPlaceholder<AstValue>({ kind: "number", value: 0, line: inTok.line, col: inTok.col, endLine: inTok.line, endCol: inTok.endCol })];
  } else {
    state.throwError(`In ${state.currentContext}: 'generate' requires a list to iterate, but got ${collection.kind}. Write a list literal, a range such as '0 to 9', or a 'let' bound to one.`, inTok);
  }

  const braceTok = state.consume("LBRACE");
  const blockStartPos = state.pos;
  let nesting = 1;
  let blockEndPos = state.pos;
  while (blockEndPos < state.tokens.length) {
    const t = state.tokens[blockEndPos];
    if (t.type === "LBRACE") nesting++;
    else if (t.type === "RBRACE") {
      nesting--;
      if (nesting === 0) break;
    }
    blockEndPos++;
  }
  if (nesting !== 0) {
    state.throwError(`In ${state.currentContext}: 'generate' block was not closed before end of file. Add a closing '}'.`, braceTok);
  }

  // Both rejections below have already scanned this construct's own closing
  // '}' (`blockEndPos`), so each records its diagnostic and repositions `pos`
  // itself, then returns normally instead of throwing. A caller's
  // `catch { state.errors.push(...); state.synchronize(); }` would otherwise
  // run on top of an already-correct position: `synchronize()`
  // unconditionally advances `pos` by at least one token before it starts
  // scanning, which — when the very next token is a sibling's leading
  // keyword — consumes exactly the sibling this position was already
  // pointing at correctly.
  if (hasPredicateDerivedCardinality(collection)) {
    state.pos = blockEndPos + 1;
    state.pushError(
      `[PARSE_GENERATE_CONDITIONAL_COLLECTION] In ${state.currentContext}: 'generate' cannot iterate a list whose cardinality is derived from 'if'. A conditional may choose element values inside a fixed literal list, but cannot influence the iterable's length because literal structure must determine emitted object shape.`,
      inTok,
    );
    return [];
  }
  if (duplicateBinderTok !== null) {
    state.pos = blockEndPos + 1;
    state.pushError(`In ${state.currentContext}: The element and ordinal variable names in 'generate' must be different.`, duplicateBinderTok);
    return [];
  }

  const generatedNodes: ObjectNode[] = [];
  const prevEnv = state.env;
  const initialErrorCount = state.errors.length;
  for (let ordinal = 0; ordinal < items.length; ordinal++) {
    if (state.errors.length > initialErrorCount) break;
    state.globalNodeCount++;
    if (state.globalNodeCount > 15000) {
      state.throwError(`In ${state.currentContext}: Global iteration limit exceeded (>15,000) to prevent freezing.`, state.peek());
    }
    state.pos = blockStartPos;
    state.env = Object.create(prevEnv);
    state.env[loopVar] = carryPredicateDerivedCardinality(
      { ...items[ordinal], line: loopVarTok.line, col: loopVarTok.col, endLine: loopVarTok.line, endCol: loopVarTok.endCol },
      items[ordinal],
    );
    if (indexVar !== null) {
      state.env[indexVar] = { kind: "number", value: ordinal, line: loopVarTok.line, col: loopVarTok.col, endLine: loopVarTok.line, endCol: loopVarTok.endCol };
    }

    const iterNodes: ObjectNode[] = [];
    while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
      try {
        rejectLegacyBinding(state);
        const t = state.peek();
        if (t.type === "KEYWORD") {
          if (t.value === "template") {
            state.throwError(`In ${state.currentContext}: Unexpected keyword 'template'. Templates must be defined at the top level of the file, outside of the scene block.`, t);
          }
          if (t.value === "let") {
            parseBinding(state);
            continue;
          }
          if (t.value === "generate") {
            const subNodes = parseGenerate(state, depth);
            for (const sn of subNodes) iterNodes.push({ ...sn, name: `${sn.name}_${ordinal}` });
            continue;
          }
          if (t.value === "use") {
            const usedNode = parseUse(state, depth);
            iterNodes.push({ ...usedNode, name: `${usedNode.name}_${ordinal}` });
            continue;
          }
          const child = parseObject(state, depth);
          iterNodes.push({ ...child, name: `${child.name}_${ordinal}` });
          continue;
        }
        const bad = state.consume();
        state.throwError(`In 'generate' block: Expected an object definition, 'let', 'use', or 'generate', but found ${describeToken(bad)}.`, bad);
      } catch (e) {
        if (e instanceof ParseException) {
          state.errors.push(e.error);
          state.synchronize();
        } else {
          throw e;
        }
      }
    }
    generatedNodes.push(...iterNodes);
  }
  state.pos = blockEndPos + 1;
  state.env = prevEnv;
  return generatedNodes;
}
