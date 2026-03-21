import type { ObjectNode, ObjectType, AstValue } from "../types";
import { KEYWORDS } from "../lexer";
import { ParserState, describeToken, ParseException } from "./state";
import { parseValue } from "./parseValue";
import { parseDef } from "./parseDef";
import { parseGenerate } from "./parseGenerate";
import { parseUse } from "./parseUse";

const RESERVED_PROPS = new Set<string>([
  "background", "size", "sceneFit", "position", "radius", "color",
  "alpha", "rotation", "scale", "anchor", "z", "width", "height",
  "points", "content", "fontSize"
]);

export function parseObject(state: ParserState, depth: number = 0): ObjectNode {
  if (depth > 50) {
    state.throwError(`In ${state.currentContext}: Maximum nesting depth exceeded. Object nesting is limited to 50 levels.`, state.peek());
  }
  state.globalNodeCount++;
  if (state.globalNodeCount > 15000) {
    state.throwError(`In ${state.currentContext}: Global object limit exceeded. The scene contains too many objects (>15,000) and cannot be compiled.`, state.peek());
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
    state.throwError(`In ${state.currentContext}: Expected a valid, unique name for the '${objType}' object, but found ${describeToken(bad)}.${hint}`, bad);
  }
  
  const nameTok = state.consume("IDENT");
  const objName = nameTok.value as string;
  
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(objName)) {
    state.throwError(`In ${state.currentContext}: Invalid object name '${objName}'. Must start with a letter and contain only alphanumeric chars or underscores.`, nameTok);
  }
  if (RESERVED_PROPS.has(objName) || KEYWORDS.has(objName)) {
    state.throwError(`In ${state.currentContext}: '${objName}' is a reserved word and cannot be used as an object name.`, nameTok);
  }
  
  state.consume("LBRACE");
  const previousContext = state.currentContext;
  state.currentContext = `'${objType}' object '${objName}'`;
  
  const prevEnv = state.env;
  state.env = Object.create(prevEnv);
  
  const props: Record<string, AstValue> = {};
  const children: ObjectNode[]          = [];
  const seenProps  = new Set<string>();
  const seenNames  = new Set<string>();
  
  while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
    try {
      if (state.peek().type === "KEYWORD") {
        if (state.peek().value === "def") {
          parseDef(state);
          continue;
        }
        if (state.peek().value === "generate") {
          if (objType !== "group") {
            const bad = state.peek();
            state.throwError(`In ${state.currentContext}: Unexpected 'generate' block. '${objType}' objects cannot contain child objects or blocks.`, bad);
          }
          const generatedNodes = parseGenerate(state, depth + 1);
          for (const child of generatedNodes) {
            if (seenNames.has(child.name)) {
              state.throwError(`In ${state.currentContext}: Duplicate object name '${child.name}' generated inside '${objName}'.`, state.peek());
            }
            seenNames.add(child.name);
            children.push(child);
          }
          continue;
        }
        if (state.peek().value === "use") {
          if (objType !== "group") {
            const bad = state.peek();
            state.throwError(`In ${state.currentContext}: Unexpected 'use' block. '${objType}' objects cannot contain child objects or blocks.`, bad);
          }
          const usedNode = parseUse(state, depth + 1);
          if (seenNames.has(usedNode.name)) {
            state.throwError(`In ${state.currentContext}: Duplicate object name '${usedNode.name}' inside '${objName}'.`, state.peek());
          }
          seenNames.add(usedNode.name);
          children.push(usedNode);
          continue;
        }
        
        if (objType !== "group") {
          const bad = state.peek();
          state.throwError(`In ${state.currentContext}: Unexpected object keyword '${bad.value as string}'. '${objType}' objects cannot contain child objects.`, bad);
        }
        
        const childNode = parseObject(state, depth + 1);
        if (seenNames.has(childNode.name)) {
          state.throwError(`In ${state.currentContext}: Duplicate object name '${childNode.name}' inside '${objName}'.`, state.peek());
        }
        seenNames.add(childNode.name);
        children.push(childNode);
        continue;
      }
      
      if (state.peek().type === "SCENE_FIT") {
        const bad = state.peek();
        state.throwError(`In ${state.currentContext}: '${bad.value as string}' is a sceneFit value keyword, not a property name.`, bad);
      }
      if (state.peek().type === "NAMED_COLOR") {
        const bad = state.peek();
        state.throwError(`In ${state.currentContext}: '${bad.value as string}' is a color keyword, not a property name.`, bad);
      }
      
      const key = state.consume("IDENT");
      const keyName = key.value as string;
      if (seenProps.has(keyName)) {
        state.throwError(`In ${state.currentContext}: Property '${keyName}' is defined more than once inside '${objName}'.`, key);
      }
      seenProps.add(keyName);
      
      state.consume("COLON");
      props[keyName] = parseValue(state);
      
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
    state.throwError(`In ${state.currentContext}: The '${objType}' block '${objName}' was not closed before end of file. Add a closing '}'.`, typeTok);
  }
  
  state.consume("RBRACE");
  state.env = prevEnv;
  state.currentContext = previousContext;
  
  return {
    type: typeTok.value as ObjectType,
    name: objName,
    props,
    children,
    line: typeTok.line,
    col: typeTok.col
  };
}