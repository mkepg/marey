import type { Token, SceneNode, AstValue, ObjectNode, ParseResult } from "../types";
import { ParserState, describeToken, ParseException } from "./state";
import { parseObject } from "./parseObject";
import { parseValue } from "./parseValue";
import { parseDef } from "./parseDef";
import { parseGenerate } from "./parseGenerate";

export function parse(tokens: Token[]): ParseResult {
  const state = new ParserState(tokens);

  try {
    while (state.peek().type === "KEYWORD" && state.peek().value === "def") {
      parseDef(state);
    }

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

    state.consume("KEYWORD");
    state.consume("LBRACE");

    const prevEnv = state.env;
    state.env = Object.create(prevEnv);

    const sceneProps: Record<string, AstValue> = {};
    const sceneChildren: ObjectNode[]          = [];
    const seenSceneProps = new Set<string>();
    const seenSceneNames = new Set<string>();

    while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
      try {
        if (state.peek().type === "KEYWORD") {
          if (state.peek().value === "def") {
            parseDef(state);
            continue;
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

          const child = parseObject(state, 1);
          if (seenSceneNames.has(child.name)) {
            state.throwError(`In ${state.currentContext}: Duplicate object name '${child.name}' in the scene. Every top-level object must have a unique name.`, state.peek());
          }
          seenSceneNames.add(child.name);
          sceneChildren.push(child);
          continue;
        }

        if (state.peek().type === "SCENE_FIT" || state.peek().type === "NAMED_COLOR") {
          const bad = state.peek();
          state.throwError(`In ${state.currentContext}: '${bad.value as string}' is a keyword, not a property name.`, bad);
        }

        const key     = state.consume("IDENT");
        const keyName = key.value as string;

        if (seenSceneProps.has(keyName)) {
          state.throwError(`In ${state.currentContext}: Property '${keyName}' is defined more than once in the scene block.`, key);
        }
        seenSceneProps.add(keyName);

        state.consume("COLON");
        sceneProps[keyName] = parseValue(state);

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

    state.consume("RBRACE");
    state.env = prevEnv;

    const trailing = state.peek();
    if (trailing.type !== "EOF") {
      let hint = "";
      if (trailing.type === "KEYWORD") hint = ` Only one scene block is allowed per file.`;
      state.throwError(`Unexpected ${describeToken(trailing)} after the scene block closed.${hint}`, trailing);
    }

    const ast: SceneNode = { type: "scene", props: sceneProps, children: sceneChildren };
    return { ast, errors: state.errors, env: state.env };

  } catch (e) {
    if (e instanceof ParseException) {
      state.errors.push(e.error);
      return { ast: null, errors: state.errors, env: state.env };
    }
    throw e;
  }
}