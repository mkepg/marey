import type { ObjectNode } from "../types";
import { ParserState, describeToken } from "./state";
import { parseObject } from "./parseObject";
import { parseDef } from "./parseDef";
import { parseValue } from "./parseValue";

export function parseGenerate(state: ParserState, depth: number): ObjectNode[] {
  state.consume("KEYWORD"); // consume 'generate'

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected a loop variable name after 'generate', but found ${describeToken(bad)}.`,
      line: bad.line,
      col: bad.col,
    };
  }
  const loopVarTok = state.consume("IDENT");
  const loopVar = loopVarTok.value as string;

  const fromTok = state.consume("KEYWORD");
  if (fromTok.value !== "from") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected 'from' after loop variable, but found '${fromTok.value as string}'.`,
      line: fromTok.line,
      col: fromTok.col,
    };
  }

  const prevContext = state.currentContext;
  state.currentContext = `generate block loop bounds`;

  const startVal = parseValue(state);
  if (startVal.kind !== "number") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected a numeric start value, but got ${startVal.kind}.`,
      line: state.peek().line,
      col: state.peek().col,
    };
  }
  const start = startVal.value;

  const toTok = state.consume("KEYWORD");
  if (toTok.value !== "to") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected 'to' after start bound, but found '${toTok.value as string}'.`,
      line: toTok.line,
      col: toTok.col,
    };
  }

  const endVal = parseValue(state);
  if (endVal.kind !== "number") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected a numeric end value, but got ${endVal.kind}.`,
      line: state.peek().line,
      col: state.peek().col,
    };
  }
  const end = endVal.value;

  state.currentContext = prevContext;

  if (end - start > 10000) {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Generate block exceeds maximum loop limit of 10,000 iterations to prevent freezing.`,
      line: toTok.line,
      col: toTok.col,
    };
  }

  const braceTok = state.consume("LBRACE");
  const blockStartPos = state.pos;

  // Scan ahead to find the matching closing brace so we can skip past it after looping
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
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: 'generate' block was not closed before end of file. Add a closing '}'.`,
      line: braceTok.line,
      col: braceTok.col,
    };
  }

  const generatedNodes: ObjectNode[] = [];
  const prevEnv = state.env;

  for (let i = start; i <= end; i++) {
    // Rewind the parser and inject the iteration index into the block's scope
    state.pos = blockStartPos;
    state.env = Object.create(prevEnv);
    state.env[loopVar] = { kind: "number", value: i };

    const iterNodes: ObjectNode[] = [];

    while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
      const t = state.peek();
      if (t.type === "KEYWORD") {
        if (t.value === "def") {
          parseDef(state);
          continue;
        }
        if (t.value === "generate") {
          const subNodes = parseGenerate(state, depth);
          for (const sn of subNodes) {
            // Suffix with current loop index to ensure collision safety for nested unrolling
            const suffixedSn: ObjectNode = { ...sn, name: `${sn.name}_${i}` };
            iterNodes.push(suffixedSn);
          }
          continue;
        }

        const child = parseObject(state, depth);
        const suffixedChild: ObjectNode = { ...child, name: `${child.name}_${i}` };
        iterNodes.push(suffixedChild);
        continue;
      }

      const bad = state.consume();
      throw {
        phase: "PARSE" as const,
        message: `In 'generate' block: Expected an object definition, 'def', or 'generate', but found ${describeToken(bad)}.`,
        line: bad.line,
        col: bad.col,
      };
    }

    generatedNodes.push(...iterNodes);
  }

  // Restore the parser to immediately after the closing brace and pop the environment
  state.pos = blockEndPos + 1;
  state.env = prevEnv;

  return generatedNodes;
}