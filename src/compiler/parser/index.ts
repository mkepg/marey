import type { Token, SceneNode, AstValue, ObjectNode } from "../types";
import { ParserState, describeToken } from "./state";
import { parseObject } from "./parseObject";
import { parseValue } from "./parseValue";
import { parseDef } from "./parseDef";

export function parse(tokens: Token[]): SceneNode {
  const state = new ParserState(tokens);
  
  while (state.peek().type === "KEYWORD" && state.peek().value === "def") {
    parseDef(state);
  }

  const firstTok = state.peek();
  if (firstTok.type === "EOF") {
    throw {
      phase: "PARSE" as const,
      message: "The file is empty. A Declare program must contain a scene block.",
      line: firstTok.line,
      col:  firstTok.col,
    };
  }

  if (firstTok.type !== "KEYWORD" || firstTok.value !== "scene") {
    const hint = firstTok.type === "KEYWORD"
      ? ` '${firstTok.value as string}' is an object keyword — objects must be placed inside a scene block.`
      : firstTok.type === "IDENT"
      ? ` Did you forget to open with 'scene {'?` : "";
    throw {
      phase: "PARSE" as const,
      message: `A Declare program must begin with the 'scene' keyword, but found ${describeToken(firstTok)}.${hint}`,
      line: firstTok.line,
      col:  firstTok.col,
    };
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
    if (state.peek().type === "KEYWORD") {
      if (state.peek().value === "def") {
        parseDef(state);
        continue;
      }
      
      const child = parseObject(state, 1);
      if (seenSceneNames.has(child.name)) {
        throw {
          phase: "PARSE" as const,
          message: `In ${state.currentContext}: Duplicate object name '${child.name}' in the scene. Every top-level object must have a unique name.`,
          line: state.peek().line,
          col:  state.peek().col,
        };
      }
      seenSceneNames.add(child.name);
      sceneChildren.push(child);
      continue;
    }

    if (state.peek().type === "SCENE_FIT" || state.peek().type === "NAMED_COLOR") {
      const bad = state.peek();
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: '${bad.value as string}' is a keyword, not a property name.`,
        line: bad.line,
        col:  bad.col,
      };
    }

    const key     = state.consume("IDENT");
    const keyName = key.value as string;
    if (seenSceneProps.has(keyName)) {
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: Property '${keyName}' is defined more than once in the scene block.`,
        line: key.line,
        col:  key.col,
      };
    }
    seenSceneProps.add(keyName);
    state.consume("COLON");
    sceneProps[keyName] = parseValue(state);
  }

  if (state.peek().type === "EOF") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: The 'scene' block was not closed before end of file. Add a closing '}'.`,
      line: firstTok.line,
      col:  firstTok.col,
    };
  }

  state.consume("RBRACE");
  state.env = prevEnv;

  const trailing = state.peek();
  if (trailing.type !== "EOF") {
    let hint = "";
    if (trailing.type === "KEYWORD") hint = ` Only one scene block is allowed per file.`;
    throw {
      phase: "PARSE" as const,
      message: `Unexpected ${describeToken(trailing)} after the scene block closed.${hint}`,
      line: trailing.line,
      col:  trailing.col,
    };
  }

  return { type: "scene", props: sceneProps, children: sceneChildren };
}