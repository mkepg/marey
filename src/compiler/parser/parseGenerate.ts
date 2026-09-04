import type { ObjectNode } from "../types";
import { ParserState, describeToken, ParseException } from "./state";
import { parseObject } from "./parseObject";
import { parseBinding } from "./parseBinding";
import { parseValue } from "./parseValue";
import { parseUse } from "./parseUse";
import { rejectLegacyBinding } from "./parseProperty";

export function parseGenerate(state: ParserState, depth: number): ObjectNode[] {
  state.consume("KEYWORD");
  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`In ${state.currentContext}: Expected a loop variable name after 'generate', but found ${describeToken(bad)}.`, bad);
  }
  const loopVarTok = state.consume("IDENT");
  const loopVar = loopVarTok.value as string;

  let indexVar: string | null = null;
  if (state.peek().type === "COMMA") {
    state.consume("COMMA");
    if (state.peek().type !== "IDENT") {
      state.throwError(`In ${state.currentContext}: Expected an index variable name after ',', but found ${describeToken(state.peek())}.`, state.peek());
    }
    indexVar = state.consume("IDENT").value as string;
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
  if (collection.kind !== "list") {
    state.throwError(`In ${state.currentContext}: 'generate' requires a list to iterate, but got ${collection.kind}. Write a list literal, a range such as '0 to 9', or a 'let' bound to one.`, inTok);
  }
  const items = collection.value;

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
    state.env[loopVar] = { ...items[ordinal], line: loopVarTok.line, col: loopVarTok.col, endLine: loopVarTok.line, endCol: loopVarTok.endCol };
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
