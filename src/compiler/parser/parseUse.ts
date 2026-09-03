import type { ObjectNode, AstValue } from "../types";
import { ParserState, describeToken, ParseException } from "./state";
import { parseValue } from "./parseValue";
import { parseObject } from "./parseObject";
import { parseGenerate } from "./parseGenerate";
import { parseBinding } from "./parseBinding";
import { consumePropertyName, rejectLegacyBinding, isPropertyNameStart, reservedExpressionWordHint } from "./parseProperty";

export function parseUse(state: ParserState, depth: number): ObjectNode {
  if (depth > 50) {
    state.throwError(`In ${state.currentContext}: Maximum nesting depth exceeded. Object nesting is limited to 50 levels.`, state.peek());
  }
  state.globalNodeCount++;
  if (state.globalNodeCount > 15000) {
    state.throwError(`In ${state.currentContext}: Global object limit exceeded. The scene contains too many objects (>15,000) and cannot be compiled.`, state.peek());
  }

  const useTok = state.consume("KEYWORD");

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`In ${state.currentContext}: Expected a template name after 'use', but found ${describeToken(bad)}.`, bad);
  }

  const templateNameTok = state.consume("IDENT");
  const templateName = templateNameTok.value as string;

  const template = state.templates[templateName];
  if (!template) {
    state.throwError(`In ${state.currentContext}: Undefined template '${templateName}'. Ensure it is defined at the top of the file before the scene block.`, templateNameTok);
  }

  if (state.activeTemplates.has(templateName)) {
    state.throwError(`[TYPE_RECURSION] Cyclic template dependency detected. Template '${templateName}' is already being expanded.`, templateNameTok);
  }

  state.consume("LPAREN");
  const args: AstValue[] = [];
  while (state.peek().type !== "RPAREN" && state.peek().type !== "EOF") {
    args.push(parseValue(state));
    if (state.peek().type !== "RPAREN") {
      state.consume("COMMA");
    }
  }

  const rparen = state.consume("RPAREN");
  if (args.length !== template.params.length) {
    state.throwError(`In ${state.currentContext}: Template '${templateName}' expects ${template.params.length} arguments, but got ${args.length}.`, rparen);
  }

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`In ${state.currentContext}: Expected a unique instance name for the template after arguments, but found ${describeToken(bad)}.${reservedExpressionWordHint(bad)}`, bad);
  }

  const instanceNameTok = state.consume("IDENT");
  const instanceName = instanceNameTok.value as string;
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(instanceName)) {
    state.throwError(`In ${state.currentContext}: Invalid instance name '${instanceName}'. Must start with a letter and contain only alphanumeric chars or underscores.`, instanceNameTok);
  }

  const props: Record<string, AstValue> = {};
  if (state.peek().type === "LBRACE") {
    state.consume("LBRACE");
    const prevContext = state.currentContext;
    state.currentContext = `'use' instance '${instanceName}'`;

    const seenProps = new Set<string>();

    while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
      rejectLegacyBinding(state);
      const peekType = state.peek().type;
      if (isPropertyNameStart(peekType)) {
          const key = consumePropertyName(state);
          const keyName = key.value as string;

          if (seenProps.has(keyName)) {
            state.throwError(`In ${state.currentContext}: Property '${keyName}' is defined more than once inside '${instanceName}'.`, key);
          }
          seenProps.add(keyName);

          state.consume("COLON");
          props[keyName] = parseValue(state, keyName);

          // NEW: Graciously consume optional inline commas
          while (state.peek().type === "COMMA") {
            state.consume("COMMA");
          }
      } else {
          const bad = state.consume();
          state.throwError(`In ${state.currentContext}: Expected a property name, but found ${describeToken(bad)}.`, bad);
      }
    }
    state.consume("RBRACE");
    state.currentContext = prevContext;
  }

  const prevPos = state.pos;
  const prevEnv = state.env;
  const prevContext2 = state.currentContext;

  state.env = Object.create(prevEnv);
  template.params.forEach((p, i) => { state.env[p] = args[i]; });
  state.pos = template.startPos;
  state.currentContext = `template '${template.name}' expansion for '${instanceName}'`;

  const children: ObjectNode[] = [];
  const seenNames = new Set<string>();

  state.activeTemplates.add(templateName);
  try {
    while (state.pos < template.endPos) {
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
            const generatedNodes = parseGenerate(state, depth + 1);
            for (const child of generatedNodes) {
              if (seenNames.has(child.name)) {
                state.throwError(`In ${state.currentContext}: Duplicate object name '${child.name}'.`, state.peek());
              }
              seenNames.add(child.name);
              children.push(child);
            }
            continue;
          }
          if (t.value === "use") {
            const usedNode = parseUse(state, depth + 1);
            if (seenNames.has(usedNode.name)) {
              state.throwError(`In ${state.currentContext}: Duplicate object name '${usedNode.name}'.`, state.peek());
            }
            seenNames.add(usedNode.name);
            children.push(usedNode);
            continue;
          }

          const childNode = parseObject(state, depth + 1);
          if (childNode.type !== "animate") {
              if (seenNames.has(childNode.name)) {
                state.throwError(`In ${state.currentContext}: Duplicate object name '${childNode.name}'.`, state.peek());
              }
              seenNames.add(childNode.name);
          }
          children.push(childNode);
          continue;
        }

        const bad = state.consume();
        state.throwError(`In ${state.currentContext}: Expected an object definition, 'let', 'generate', or 'use', but found ${describeToken(bad)}.`, bad);
      } catch (e) {
        if (e instanceof ParseException) {
          state.errors.push(e.error);
          state.synchronize();
        } else {
          throw e;
        }
      }
    }
  } finally {
    state.activeTemplates.delete(templateName);
  }

  state.pos = prevPos;
  state.env = prevEnv;
  state.currentContext = prevContext2;

  const lastTok = state.tokens[state.pos - 1];

  return {
    type: "group",
    name: instanceName,
    props,
    children,
    line: useTok.line,
    col: useTok.col,
    endLine: lastTok.line,
    endCol: lastTok.endCol,
    isUse: true
  };
}
