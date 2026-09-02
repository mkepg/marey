import type { Token, SceneNode, AstValue, ObjectNode, ParseResult } from "../types";
import { ParserState, describeToken, ParseException } from "./state";
import { parseObject } from "./parseObject";
import { parseValue } from "./parseValue";
import { parseBinding } from "./parseBinding";
import { parseGenerate } from "./parseGenerate";
import { parseTemplate } from "./parseTemplate";
import { parseUse } from "./parseUse";
import { consumePropertyName, rejectLegacyBinding } from "./parseProperty";

export function parse(tokens: Token[]): ParseResult {
  const state = new ParserState(tokens);

  try {
    rejectLegacyBinding(state);
    while (state.peek().type === "KEYWORD" && (state.peek().value === "let" || state.peek().value === "template")) {
      if (state.peek().value === "let") {
        parseBinding(state);
      } else {
        parseTemplate(state);
      }
    }
    rejectLegacyBinding(state);

    const firstTok = state.peek();
    if (firstTok.type === "EOF") {
      state.throwError("The file is empty. A Declare program must contain a scene block.", firstTok);
    }

    if (firstTok.type !== "KEYWORD" || firstTok.value !== "scene") {
      const hint = firstTok.type === "KEYWORD"
        ? ` '${firstTok.value as string}' is an object keyword — objects must be placed inside a scene block.`
        : firstTok.type === "IDENT"
        ? ` Did you forget to open with 'scene {'?` : "";
      
      state.throwError(`A Declare program must begin with the 'scene' keyword, but found ${describeToken(firstTok)}.${hint}`, firstTok);
    }

    const sceneTok = state.consume("KEYWORD");
    state.consume("LBRACE");

    const prevEnv = state.env;
    state.env = Object.create(prevEnv);

    const sceneProps: Record<string, AstValue> = {};
    const sceneChildren: ObjectNode[]          = [];
    const seenSceneProps = new Set<string>();
    const seenSceneNames = new Set<string>();

    while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
      try {
        rejectLegacyBinding(state);
        if (state.peek().type === "KEYWORD") {
          if (state.peek().value === "template") {
            state.throwError(`In ${state.currentContext}: Unexpected keyword 'template'. Templates must be defined at the top level of the file, outside of the scene block.`, state.peek());
          }
          if (state.peek().value === "let") {
            parseBinding(state);
            continue;
          }
          if (state.peek().value === "animate") {
            state.throwError(`In ${state.currentContext}: Unexpected 'animate' block. Animations must be placed inside a renderable object (e.g., circle, group), not at the root scene level.`, state.peek());
          }
          if (state.peek().value === "generate") {
            const generatedNodes = parseGenerate(state, 1);
            for (const child of generatedNodes) {
              if (seenSceneNames.has(child.name)) {
                state.throwError(`In ${state.currentContext}: Duplicate object name '${child.name}' generated in the scene. Every top-level object must have a unique name.`, state.peek());
              }
              seenSceneNames.add(child.name);
              sceneChildren.push(child);
            }
            continue;
          }
          if (state.peek().value === "use") {
            const usedNode = parseUse(state, 1);
            if (seenSceneNames.has(usedNode.name)) {
              state.throwError(`In ${state.currentContext}: Duplicate object name '${usedNode.name}' in the scene. Every top-level object must have a unique name.`, state.peek());
            }
            seenSceneNames.add(usedNode.name);
            sceneChildren.push(usedNode);
            continue;
          }

          const child = parseObject(state, 1);
          if (seenSceneNames.has(child.name)) {
            state.throwError(`In ${state.currentContext}: Duplicate object name '${child.name}' in the scene. Every top-level object must have a unique name.`, state.peek());
          }
          seenSceneNames.add(child.name);
          sceneChildren.push(child);
          continue;
        }

        const peekType = state.peek().type;
        if (peekType === "IDENT" || peekType === "FIT" || peekType === "NAMED_COLOR" || peekType === "BOOLEAN" || peekType === "EASING") {
            const key = consumePropertyName(state);
            const keyName = key.value as string;

            if (seenSceneProps.has(keyName)) {
              state.throwError(`In ${state.currentContext}: Property '${keyName}' is defined more than once in the scene block.`, key);
            }
            seenSceneProps.add(keyName);

            state.consume("COLON");
            sceneProps[keyName] = parseValue(state, keyName);

            // NEW: Graciously consume optional inline commas
            while (state.peek().type === "COMMA") {
              state.consume("COMMA");
            }
        } else {
            const bad = state.consume();
            state.throwError(`In ${state.currentContext}: Expected a property name, but found ${describeToken(bad)}.`, bad);
        }
      } catch (e) {
        if (e instanceof ParseException) {
          state.errors.push(e.error);
          state.synchronize();
        } else {
          throw e;
        }
      }
    }

    if (state.peek().type === "EOF") {
      state.throwError(`In ${state.currentContext}: The 'scene' block was not closed before end of file. Add a closing '}'.`, firstTok);
    }
    
    const endTok = state.consume("RBRACE");
    state.env = prevEnv;

    const trailing = state.peek();
    rejectLegacyBinding(state);
    if (trailing.type !== "EOF") {
      let hint = "";
      if (trailing.type === "KEYWORD") hint = ` Only one scene block is allowed per file.`;
      state.throwError(`Unexpected ${describeToken(trailing)} after the scene block closed.${hint}`, trailing);
    }

    const ast: SceneNode = { type: "scene", props: sceneProps, children: sceneChildren, line: sceneTok.line, col: sceneTok.col, endLine: endTok.line, endCol: endTok.endCol };
    return { ast, errors: state.errors, env: state.env, templates: state.templates };

  } catch (e) {
    if (e instanceof ParseException) {
      state.errors.push(e.error);
      return { ast: null, errors: state.errors, env: state.env, templates: state.templates };
    }
    throw e;
  }
}
