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
  "points", "content", "fontSize", "thickness", "property", "to",
  "duration", "easing", "loop", "yoyo", "velocity", "gravity",
  "airDrag", "bounce", "collideBounds", "handOff" // UPDATED: friction -> airDrag
]);

// ADDED: Specialized parsing for the parallel block
function parseParallelBlock(state: ParserState, parentContext: string): ObjectNode {
  const parTok = state.consume("KEYWORD");
  const braceTok = state.consume("LBRACE");
  const prevContext = state.currentContext;
  state.currentContext = `'parallel' block inside ${parentContext}`;
  
  const children: ObjectNode[] = [];
  
  while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
    try {
      if (state.peek().type !== "KEYWORD") {
        const bad = state.consume();
        state.throwError(
          `In ${state.currentContext}: Expected 'animate' or 'physics' inside a 'parallel' block, but found ${describeToken(bad)}.`,
          bad
        );
      }
      
      const kw = state.peek().value as string;
      if (kw !== "animate" && kw !== "physics") {
        const bad = state.peek();
        let hint = "";
        if (kw === "parallel") hint = " Nested 'parallel' blocks are not allowed.";
        else if (kw === "sequence") hint = " 'sequence' cannot be inside 'parallel'.";
        state.throwError(
          `In ${state.currentContext}: Only 'animate' and 'physics' blocks are allowed inside a 'parallel' block, but found '${kw}'.${hint}`,
          bad
        );
      }
      
      const child = parseObject(state, 0);
      children.push(child);
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
    state.throwError(
      `In ${state.currentContext}: The 'parallel' block was not closed before end of file. Add a closing '}'.`,
      braceTok
    );
  }
  
  const endTok = state.consume("RBRACE");
  state.currentContext = prevContext;
  
  return {
    type: "parallel",
    name: `parallel_${parTok.line}_${parTok.col}`,
    props: {},
    children,
    line: parTok.line,
    col: parTok.col,
    endLine: endTok.line,
    endCol: endTok.endCol
  };
}

function parseSequenceBlock(state: ParserState, parentContext: string): ObjectNode {
  const seqTok = state.consume("KEYWORD");
  const braceTok = state.consume("LBRACE");
  const prevContext = state.currentContext;
  state.currentContext = `'sequence' block inside ${parentContext}`;
  
  const children: ObjectNode[] = [];
  
  while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
    try {
      if (state.peek().type !== "KEYWORD") {
        const bad = state.consume();
        state.throwError(
          `In ${state.currentContext}: Expected 'animate', 'physics', or 'parallel' inside a 'sequence' block, but found ${describeToken(bad)}.`,
          bad
        );
      }
      
      const kw = state.peek().value as string;
      // UPDATED: allowed parallel inside sequence
      if (kw !== "animate" && kw !== "physics" && kw !== "parallel") {
        const bad = state.peek();
        let hint = "";
        if (kw === "sequence") hint = " Nested 'sequence' blocks are not allowed.";
        state.throwError(
          `In ${state.currentContext}: Only 'animate', 'physics', and 'parallel' blocks are allowed inside a 'sequence' block, but found '${kw}'.${hint}`,
          bad
        );
      }
      
      let child: ObjectNode;
      if (kw === "parallel") {
        child = parseParallelBlock(state, state.currentContext);
      } else {
        child = parseObject(state, 0);
      }
      
      children.push(child);
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
    state.throwError(
      `In ${state.currentContext}: The 'sequence' block was not closed before end of file. Add a closing '}'.`,
      braceTok
    );
  }
  
  const endTok = state.consume("RBRACE");
  state.currentContext = prevContext;
  
  return {
    type: "sequence",
    name: `sequence_${seqTok.line}_${seqTok.col}`,
    props: {},
    children,
    line: seqTok.line,
    col: seqTok.col,
    endLine: endTok.line,
    endCol: endTok.endCol
  };
}

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

  let objName = "";
  if (objType === "animate" || objType === "physics") {
    objName = `${objType}_${Math.random().toString(36).slice(2, 8)}`;
  } else {
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
    objName = nameTok.value as string;

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(objName)) {
      state.throwError(`In ${state.currentContext}: Invalid object name '${objName}'. Must start with a letter and contain only alphanumeric chars or underscores.`, nameTok);
    }
    if (RESERVED_PROPS.has(objName) || KEYWORDS.has(objName)) {
      state.throwError(`In ${state.currentContext}: '${objName}' is a reserved word and cannot be used as an object name.`, nameTok);
    }
  }

  state.consume("LBRACE");

  const previousContext = state.currentContext;
  state.currentContext = `'${objType}' ${objType === "animate" || objType === "physics" ? 'block' : `object '${objName}'`}`;

  const prevEnv = state.env;
  state.env = Object.create(prevEnv);

  const props: Record<string, AstValue> = {};
  const children: ObjectNode[]          = [];
  const seenProps  = new Set<string>();
  const seenNames  = new Set<string>();

  while (state.peek().type !== "RBRACE" && state.peek().type !== "EOF") {
    try {
      if (state.peek().type === "KEYWORD") {
        if (state.peek().value === "template") {
          state.throwError(`In ${state.currentContext}: Unexpected keyword 'template'. Templates must be defined at the top level of the file, outside of the scene block.`, state.peek());
        }
        if (state.peek().value === "def") {
          parseDef(state);
          continue;
        }
        if (objType === "animate" || objType === "physics") {
          const bad = state.peek();
          state.throwError(`In ${state.currentContext}: '${objType}' blocks cannot contain nested objects or blocks. Found '${bad.value as string}'.`, bad);
        }
        
        // ADDED: Prevent orphaned parallel blocks
        if (state.peek().value === "parallel") {
          const bad = state.peek();
          state.throwError(`In ${state.currentContext}: Unexpected 'parallel' block. 'parallel' blocks are only allowed directly inside a 'sequence' block.`, bad);
        }

        if (state.peek().value === "sequence") {
          if (objType !== "group"
              && objType !== "circle"
              && objType !== "rectangle"
              && objType !== "polygon"
              && objType !== "line"
              && objType !== "text") {
            const bad = state.peek();
            state.throwError(`In ${state.currentContext}: Unexpected 'sequence' block inside '${objType}'. Sequence blocks are only allowed directly on renderable objects.`, bad);
          }
          const seqNode = parseSequenceBlock(state, state.currentContext);
          children.push(seqNode);
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

        if (state.peek().value === "animate" || state.peek().value === "physics") {
          const childNode = parseObject(state, depth + 1);
          children.push(childNode);
          continue;
        }

        if (objType !== "group") {
          const bad = state.peek();
          state.throwError(`In ${state.currentContext}: Unexpected object keyword '${bad.value as string}'. '${objType}' objects cannot contain child objects (except 'animate', 'physics', and 'sequence' blocks).`, bad);
        }
        
        const childNode = parseObject(state, depth + 1);
        if (seenNames.has(childNode.name)) {
          state.throwError(`In ${state.currentContext}: Duplicate object name '${childNode.name}' inside '${objName}'.`, state.peek());
        }
        seenNames.add(childNode.name);
        children.push(childNode);
        continue;
      }

      const peekType = state.peek().type;
      if (peekType === "IDENT" || peekType === "SCENE_FIT" || peekType === "NAMED_COLOR" || peekType === "BOOLEAN" || peekType === "EASING") {
        const key = state.consume();
        const keyName = key.value as string;

        if (seenProps.has(keyName)) {
          state.throwError(`In ${state.currentContext}: Property '${keyName}' is defined more than once.`, key);
        }
        seenProps.add(keyName);

        state.consume("COLON");
        props[keyName] = parseValue(state, keyName);
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
    state.throwError(`In ${state.currentContext}: The block was not closed before end of file. Add a closing '}'.`, typeTok);
  }
  
  const endTok = state.consume("RBRACE");
  state.env = prevEnv;
  state.currentContext = previousContext;
  
  return {
    type: typeTok.value as ObjectType,
    name: objName,
    props,
    children,
    line: typeTok.line,
    col: typeTok.col,
    endLine: endTok.line,
    endCol: endTok.endCol
  };
}