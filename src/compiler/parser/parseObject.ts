import type { ObjectNode, ObjectType, AstValue } from "../types";
import { KEYWORDS } from "../lexer";
import { ParserState, describeToken } from "./state";
import { parseValue } from "./parseValue";

const RESERVED_PROPS = new Set<string>([
  "background", "size", "sceneFit", "position", "radius", "color",
  "alpha", "rotation", "scale", "anchor", "z", "width", "height",
  "points", "content", "fontSize"
]);

export function parseObject(state: ParserState, depth: number = 0): ObjectNode {
  if (depth > 50) {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Maximum nesting depth exceeded. Object nesting is limited to 50 levels.`,
      line: state.peek().line,
      col:  state.peek().col,
    };
  }

  const typeTok = state.consume("KEYWORD");
  const objType = typeTok.value as string;

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    let hint = "";
    if (bad.type === "KEYWORD") hint = ` '${bad.value}' is a reserved object keyword.`;
    else if (bad.type === "NAMED_COLOR") hint = ` '${bad.value}' is a reserved color keyword.`;
    else if (bad.type === "SCENE_FIT") hint = ` '${bad.value}' is a reserved sceneFit keyword.`;
    else if (bad.type === "LBRACE") hint = ` Every object must have a name before its '{'.`;

    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected a valid, unique name for the '${objType}' object, but found ${describeToken(bad)}.${hint}`,
      line: bad.line,
      col:  bad.col,
    };
  }

  const nameTok = state.consume("IDENT");
  const objName = nameTok.value as string;

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(objName)) {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Invalid object name '${objName}'. Must start with a letter and contain only alphanumeric chars or underscores.`,
      line: nameTok.line,
      col:  nameTok.col,
    };
  }

  if (RESERVED_PROPS.has(objName) || KEYWORDS.has(objName)) {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: '${objName}' is a reserved word and cannot be used as an object name.`,
      line: nameTok.line,
      col:  nameTok.col,
    };
  }

  state.consume("LBRACE");
  const previousContext = state.currentContext;
  state.currentContext = `'${objType}' object '${objName}'`;

  const props: Record<string, AstValue> = {};
  const children: ObjectNode[]          = [];
  const seenProps  = new Set<string>();
  const seenNames  = new Set<string>();

  while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
    if (state.peek().type === "KEYWORD") {
      if (objType !== "group") {
        const bad = state.peek();
        throw {
          phase: "PARSE" as const,
          message: `In ${state.currentContext}: Unexpected object keyword '${bad.value as string}'. '${objType}' objects cannot contain child objects.`,
          line: bad.line,
          col:  bad.col,
        };
      }

      const childNode = parseObject(state, depth + 1);
      if (seenNames.has(childNode.name)) {
        throw {
          phase: "PARSE" as const,
          message: `In ${state.currentContext}: Duplicate object name '${childNode.name}' inside '${objName}'.`,
          line: state.peek().line,
          col:  state.peek().col,
        };
      }
      seenNames.add(childNode.name);
      children.push(childNode);
      continue;
    }

    if (state.peek().type === "SCENE_FIT") {
      const bad = state.peek();
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: '${bad.value as string}' is a sceneFit value keyword, not a property name.`,
        line: bad.line,
        col:  bad.col,
      };
    }

    if (state.peek().type === "NAMED_COLOR") {
      const bad = state.peek();
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: '${bad.value as string}' is a color keyword, not a property name.`,
        line: bad.line,
        col:  bad.col,
      };
    }

    const key = state.consume("IDENT");
    const keyName = key.value as string;

    if (seenProps.has(keyName)) {
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: Property '${keyName}' is defined more than once inside '${objName}'.`,
        line: key.line,
        col:  key.col,
      };
    }
    seenProps.add(keyName);

    state.consume("COLON");
    props[keyName] = parseValue(state);
  }

  if (state.peek().type === "EOF") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: The '${objType}' block '${objName}' was not closed before end of file. Add a closing '}'.`,
      line: typeTok.line,
      col:  typeTok.col,
    };
  }
  
  state.consume("RBRACE");
  state.currentContext = previousContext;

  return {
    type: typeTok.value as ObjectType,
    name: objName,
    props,
    children,
  };
}