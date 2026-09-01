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

  const fromTok = state.consume("IDENT");
  if (fromTok.value !== "from") {
    state.throwError(`In ${state.currentContext}: Expected 'from' after loop variable, but found '${fromTok.value as string}'.`, fromTok);
  }

  const prevContext = state.currentContext;
  state.currentContext = `generate block loop bounds`;
  const startVal = parseValue(state);
  if (startVal.kind !== "number") {
    state.throwError(`In ${state.currentContext}: Expected a numeric start value, but got ${startVal.kind}.`, state.peek());
  }
  const start = startVal.value;

  const toTok = state.consume("IDENT");
  if (toTok.value !== "to") {
    state.throwError(`In ${state.currentContext}: Expected 'to' after start bound, but found '${toTok.value as string}'.`, toTok);
  }

  const endVal = parseValue(state);
  if (endVal.kind !== "number") {
    state.throwError(`In ${state.currentContext}: Expected a numeric end value, but got ${endVal.kind}.`, state.peek());
  }
  const end = endVal.value;
  state.currentContext = prevContext;

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    state.throwError(`In ${state.currentContext}: 'generate' bounds must be integers. Got start: ${start}, end: ${end}.`, toTok);
  }
  if (end - start > 10000) {
    state.throwError(`In ${state.currentContext}: Generate block exceeds maximum loop limit of 10,000 iterations to prevent freezing.`, toTok);
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

  const generatedNodes: ObjectNode[] = [];
  const prevEnv = state.env;
  
  // Track errors so we don't spam 10,000 identical syntax errors if the loop body is malformed
  const initialErrorCount = state.errors.length;

  for (let i = start; i <= end; i++) {
    // Break early if a syntax error was caught during the loop execution to prevent crashing the worker
    if (state.errors.length > initialErrorCount) {
      break; 
    }

    state.globalNodeCount++;
    if (state.globalNodeCount > 15000) {
      state.throwError(`In ${state.currentContext}: Global iteration limit exceeded (>15,000) to prevent freezing.`, state.peek());
    }

    state.pos = blockStartPos;
    state.env = Object.create(prevEnv);
    
    // Inject the loop variable into the environment for this iteration
    state.env[loopVar] = {
      kind: "number",
      value: i,
      line: loopVarTok.line,
      col: loopVarTok.col,
      endLine: loopVarTok.line,
      endCol: loopVarTok.endCol
    };

    const iterNodes: ObjectNode[] = [];

    while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
      try {
        rejectLegacyBinding(state);
        const t = state.peek();
        if (t.type === "KEYWORD") {
          if (state.peek().value === "template") {
            state.throwError(`In ${state.currentContext}: Unexpected keyword 'template'. Templates must be defined at the top level of the file, outside of the scene block.`, state.peek());
          }
          if (t.value === "let") {
            parseBinding(state);
            continue;
          }
          if (t.value === "generate") {
            const subNodes = parseGenerate(state, depth);
            for (const sn of subNodes) {
              const suffixedSn: ObjectNode = { ...sn, name: `${sn.name}_${i}` };
              iterNodes.push(suffixedSn);
            }
            continue;
          }
          if (t.value === "use") {
            const usedNode = parseUse(state, depth);
            const suffixedNode: ObjectNode = { ...usedNode, name: `${usedNode.name}_${i}` };
            iterNodes.push(suffixedNode);
            continue;
          }

          const child = parseObject(state, depth);
          const suffixedChild: ObjectNode = { ...child, name: `${child.name}_${i}` };
            iterNodes.push(suffixedChild);
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
