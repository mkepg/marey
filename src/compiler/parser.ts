import type {
  Token,
  AstValue,
  ObjectNode,
  ObjectType,
  SceneNode,
  SceneFit,
} from "./types";
import { NAMED_COLORS, KEYWORDS } from "./lexer";

function describeToken(t: Token): string {
  switch (t.type) {
    case "KEYWORD":     return `keyword '${t.value as string}'`;
    case "IDENT":       return `identifier '${t.value as string}'`;
    case "NUMBER":      return `number ${t.value as number}`;
    case "HEX_COLOR":   return `color '${t.value as string}'`;
    case "NAMED_COLOR": return `color keyword '${t.value as string}'`;
    case "SCENE_FIT":   return `sceneFit value '${t.value as string}'`;
    case "STRING":      return `string "${t.value as string}"`;
    case "LBRACE":      return "'{'";
    case "RBRACE":      return "'}'";
    case "LBRACKET":    return "'['";
    case "RBRACKET":    return "']'";
    case "LPAREN":      return "'('";
    case "RPAREN":      return "')'";
    case "COMMA":       return "','";
    case "COLON":       return "':'";
    case "EOF":         return "end of file";
  }
}

export function parse(tokens: Token[]): SceneNode {
  let pos = 0;
  let currentContext = "the scene";

  const peek = (): Token => tokens[pos];

  const consume = (expectedType?: Token["type"]): Token => {
    const t = tokens[pos];
    if (expectedType && t.type !== expectedType) {
      const expectedDesc = expectedTypeDescription(expectedType, t);
      throw {
        phase: "PARSE" as const,
        message: `In ${currentContext}: Expected ${expectedDesc}, but found ${describeToken(t)}.`,
        line: t.line,
        col:  t.col,
      };
    }
    pos++;
    return t;
  };

  function expectedTypeDescription(expected: Token["type"], got: Token): string {
    switch (expected) {
      case "LBRACE":  return "'{' to open a block";
      case "RBRACE":  return "'}' to close the block";
      case "LBRACKET":return "'[' to open a point list";
      case "RBRACKET":return "']' to close the point list";
      case "LPAREN":  return "'(' to open a point";
      case "RPAREN":  return "')' to close the point";
      case "COMMA":   return "','";
      case "COLON":   return "':' after the property name";
      case "NUMBER":  return `a number${got.type === "IDENT" ? ` (did you mean to write a numeric value here?)` : ""}`;
      case "IDENT":   return "an object or property name (an identifier)";
      case "KEYWORD": return "an object type keyword (circle, rectangle, polygon, text, or group)";
      default:        return expected;
    }
  }

  function parseValue(): AstValue {
    const t = peek();

    if (t.type === "NUMBER") {
      consume();
      return { kind: "number", value: t.value as number };
    }
    if (t.type === "HEX_COLOR") {
      consume();
      return { kind: "color", value: t.value as string };
    }
    if (t.type === "NAMED_COLOR") {
      consume();
      return { kind: "color", value: NAMED_COLORS[t.value as string] };
    }
    if (t.type === "STRING") {
      consume();
      return { kind: "string", value: t.value as string };
    }
    if (t.type === "SCENE_FIT") {
      consume();
      return { kind: "sceneFit", value: t.value as SceneFit };
    }

    if (t.type === "LPAREN") {
      const openTok = consume("LPAREN");
      const xTok    = consume("NUMBER");
      consume("COMMA");
      const yTok    = consume("NUMBER");

      if (peek().type === "COMMA") {
        const extra = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: A point takes exactly two numbers, but found an extra ',' at ` +
            `line ${extra.line}, column ${extra.col}. ` +
            `Point syntax is (x, y) — for example (400, 300).`,
          line: extra.line,
          col:  extra.col,
        };
      }
      if (peek().type !== "RPAREN") {
        const bad = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: Expected ')' to close the point opened at line ${openTok.line}, ` +
            `column ${openTok.col}, but found ${describeToken(bad)}.`,
          line: bad.line,
          col:  bad.col,
        };
      }
      consume("RPAREN");
      return { kind: "point", x: xTok.value as number, y: yTok.value as number };
    }

    if (t.type === "LBRACKET") {
      const openTok = consume("LBRACKET");
      const pts: Array<{ x: number; y: number }> = [];

      while (peek().type !== "RBRACKET") {
        if (peek().type === "EOF") {
          throw {
            phase: "PARSE" as const,
            message:
              `In ${currentContext}: Point list opened at line ${openTok.line}, column ${openTok.col} ` +
              `was not closed before end of file. Add a closing ']'.`,
            line: openTok.line,
            col:  openTok.col,
          };
        }
        if (peek().type !== "LPAREN") {
          const bad = peek();
          throw {
            phase: "PARSE" as const,
            message:
              `In ${currentContext}: Expected a point '(x, y)' inside the point list, ` +
              `but found ${describeToken(bad)}. ` +
              `Each entry in a point list must be a point, e.g. [(0,0), (100,0), (50,80)].`,
            line: bad.line,
            col:  bad.col,
          };
        }

        const ptOpen = consume("LPAREN");
        const x      = consume("NUMBER");
        consume("COMMA");
        const y      = consume("NUMBER");

        if (peek().type !== "RPAREN") {
          const bad = peek();
          throw {
            phase: "PARSE" as const,
            message:
              `In ${currentContext}: Expected ')' to close the point opened at line ${ptOpen.line}, ` +
              `column ${ptOpen.col}, but found ${describeToken(bad)}.`,
            line: bad.line,
            col:  bad.col,
          };
        }
        consume("RPAREN");
        pts.push({ x: x.value as number, y: y.value as number });

        if (peek().type === "COMMA") consume("COMMA");
      }

      if (pts.length === 0) {
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: Empty point list '[]' is not valid. ` +
            `A point list must contain at least 3 points for polygon use, ` +
            `e.g. [(0,0), (100,0), (50,80)].`,
          line: openTok.line,
          col:  openTok.col,
        };
      }
      consume("RBRACKET");
      return { kind: "pointList", value: pts };
    }

    if (t.type === "IDENT") {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: '${t.value as string}' is not a recognised value. ` +
          `Bare names cannot be used as values in Declare v1.0. ` +
          `For colors, use a hex code (e.g. #ff0000) or a color keyword ` +
          `(red, green, blue, white, black, yellow, cyan, magenta, orange). ` +
          `For text, wrap the value in double quotes (e.g. "hello").`,
        line: t.line,
        col:  t.col,
      };
    }

    if (t.type === "KEYWORD") {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: '${t.value as string}' is an object keyword and cannot be used as a property value. ` +
          `If this was intended as a color, use a hex code or a named color keyword instead.`,
        line: t.line,
        col:  t.col,
      };
    }

    if (t.type === "RBRACE" || t.type === "RBRACKET" || t.type === "RPAREN") {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: Unexpected ${describeToken(t)} where a property value was expected. ` +
          `This may indicate a missing value, an extra closing bracket, ` +
          `or a misplaced '}'.`,
        line: t.line,
        col:  t.col,
      };
    }

    if (t.type === "EOF") {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: Reached end of file while reading a property value. ` +
          `A value (number, color, string, or point) is required after ':'.`,
        line: t.line,
        col:  t.col,
      };
    }

    throw {
      phase: "PARSE" as const,
      message:
        `In ${currentContext}: Unexpected ${describeToken(t)} where a property value was expected. ` +
        `Valid value types are: number, hex color (#rrggbb), color keyword, ` +
        `quoted string, point (x, y), or point list [(x,y), ...].`,
      line: t.line,
      col:  t.col,
    };
  }

  function parseObject(depth: number = 0): ObjectNode {
    if (depth > 50) {
      throw {
        phase: "PARSE" as const,
        message: `In ${currentContext}: Maximum nesting depth exceeded. Object nesting is limited to 50 levels to prevent stack overflows.`,
        line: peek().line,
        col:  peek().col,
      };
    }

    const typeTok = consume("KEYWORD");
    const objType = typeTok.value as string;

    if (peek().type !== "IDENT") {
      const bad = peek();
      const hint =
        bad.type === "LBRACE"
          ? ` Every object must have a name before its '{'. For example: ${objType} myObject { ... }`
          : bad.type === "KEYWORD"
          ? ` Another keyword was found instead. Did you forget the object name? For example: ${objType} myObject { ... }`
          : "";

      throw {
        phase: "PARSE" as const,
        message: `In ${currentContext}: Expected a name for the '${objType}' object, but found ${describeToken(bad)}.${hint}`,
        line: bad.line,
        col:  bad.col,
      };
    }

    const nameTok = consume("IDENT");
    const objName = nameTok.value as string;

    if (KEYWORDS.has(objName)) {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: '${objName}' is a reserved keyword and cannot be used as an object name. ` +
          `Choose a different name (e.g. '${objType}1' or 'my${objType}').`,
        line: nameTok.line,
        col:  nameTok.col,
      };
    }

    consume("LBRACE");

    const previousContext = currentContext;
    currentContext = `'${objType}' object '${objName}'`;

    const props: Record<string, AstValue> = {};
    const children: ObjectNode[]          = [];

    const seenProps  = new Set<string>();
    const seenNames  = new Set<string>();

    while (peek().type !== "RBRACE" && peek().type !== "EOF") {
      if (peek().type === "KEYWORD") {
        if (objType !== "group") {
          const bad = peek();
          throw {
            phase: "PARSE" as const,
            message:
              `In ${currentContext}: Unexpected object keyword '${bad.value as string}'. ` +
              `'${objType}' objects cannot contain child objects. Did you forget a closing '}' for '${objName}'?`,
            line: bad.line,
            col:  bad.col,
          };
        }

        const childNode = parseObject(depth + 1);
        if (seenNames.has(childNode.name)) {
          throw {
            phase: "PARSE" as const,
            message:
              `In ${currentContext}: Duplicate object name '${childNode.name}' inside '${objName}'. ` +
              `Every object within the same block must have a unique name.`,
            line: peek().line,
            col:  peek().col,
          };
        }
        seenNames.add(childNode.name);
        children.push(childNode);
        continue;
      }

      if (peek().type === "SCENE_FIT") {
        const bad = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: '${bad.value as string}' is a sceneFit value keyword, not a property name. ` +
            `Did you mean: sceneFit: ${bad.value as string}`,
          line: bad.line,
          col:  bad.col,
        };
      }
      if (peek().type === "NAMED_COLOR") {
        const bad = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: '${bad.value as string}' is a color keyword, not a property name. ` +
            `Property names must be plain identifiers (e.g. 'color', 'position').`,
          line: bad.line,
          col:  bad.col,
        };
      }

      const key = consume("IDENT");
      const keyName = key.value as string;

      if (seenProps.has(keyName)) {
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: Property '${keyName}' is defined more than once inside '${objName}'. ` +
            `Each property may only appear once per block.`,
          line: key.line,
          col:  key.col,
        };
      }
      seenProps.add(keyName);

      consume("COLON");
      props[keyName] = parseValue();
    }

    if (peek().type === "EOF") {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: The '${objType}' block '${objName}' was not closed before end of file. ` +
          `Add a closing '}'.`,
        line: typeTok.line,
        col:  typeTok.col,
      };
    }

    consume("RBRACE");
    currentContext = previousContext;

    return {
      type: typeTok.value as ObjectType,
      name: objName,
      props,
      children,
    };
  }

  const firstTok = peek();

  if (firstTok.type === "EOF") {
    throw {
      phase: "PARSE" as const,
      message:
        "The file is empty. A Declare program must contain a scene block, " +
        "e.g.:\n\nscene {\n  size: (800, 600)\n  background: #1e1e1e\n}",
      line: firstTok.line,
      col:  firstTok.col,
    };
  }

  if (firstTok.type !== "KEYWORD" || firstTok.value !== "scene") {
    const hint =
      firstTok.type === "KEYWORD"
        ? ` '${firstTok.value as string}' is an object keyword — ` +
          `objects must be placed inside a scene block.`
        : firstTok.type === "IDENT"
        ? ` Did you forget to open with 'scene {'?`
        : "";

    throw {
      phase: "PARSE" as const,
      message:
        `A Declare program must begin with the 'scene' keyword, ` +
        `but found ${describeToken(firstTok)}.${hint}`,
      line: firstTok.line,
      col:  firstTok.col,
    };
  }

  consume("KEYWORD");
  consume("LBRACE");

  const sceneProps: Record<string, AstValue> = {};
  const sceneChildren: ObjectNode[]          = [];

  const seenSceneProps = new Set<string>();
  const seenSceneNames = new Set<string>();

  while (peek().type !== "RBRACE" && peek().type !== "EOF") {
    if (peek().type === "KEYWORD") {
      const child = parseObject(1);
      if (seenSceneNames.has(child.name)) {
        throw {
          phase: "PARSE" as const,
          message:
            `In ${currentContext}: Duplicate object name '${child.name}' in the scene. ` +
            `Every top-level object must have a unique name.`,
          line: peek().line,
          col:  peek().col,
        };
      }
      seenSceneNames.add(child.name);
      sceneChildren.push(child);
      continue;
    }

    if (peek().type === "SCENE_FIT") {
      const bad = peek();
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: '${bad.value as string}' is a sceneFit value keyword, not a property name. ` +
          `Did you mean: sceneFit: ${bad.value as string}`,
        line: bad.line,
        col:  bad.col,
      };
    }

    if (peek().type === "NAMED_COLOR") {
      const bad = peek();
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: '${bad.value as string}' is a color keyword, not a property name. ` +
          `Property names must be plain identifiers (e.g. 'background', 'size').`,
        line: bad.line,
        col:  bad.col,
      };
    }

    const key     = consume("IDENT");
    const keyName = key.value as string;

    if (seenSceneProps.has(keyName)) {
      throw {
        phase: "PARSE" as const,
        message:
          `In ${currentContext}: Property '${keyName}' is defined more than once in the scene block. ` +
          `Each property may only appear once.`,
        line: key.line,
        col:  key.col,
      };
    }
    seenSceneProps.add(keyName);

    consume("COLON");
    sceneProps[keyName] = parseValue();
  }

  if (peek().type === "EOF") {
    throw {
      phase: "PARSE" as const,
      message:
        `In ${currentContext}: The 'scene' block was not closed before end of file. Add a closing '}'.`,
      line: firstTok.line,
      col:  firstTok.col,
    };
  }

  consume("RBRACE");

  const trailing = peek();
  if (trailing.type !== "EOF") {
    let hint = "";
    if (trailing.type === "RPAREN") {
      hint = " This may be an unmatched closing parenthesis ')'.";
    } else if (trailing.type === "RBRACE") {
      hint = " This may be an extra closing brace '}' with no matching '{'.";
    } else if (trailing.type === "RBRACKET") {
      hint = " This may be an extra closing bracket ']' with no matching '['.";
    } else if (trailing.type === "KEYWORD") {
      hint =
        ` Only one scene block is allowed per file. ` +
        `All objects must be declared inside the scene block.`;
    }

    throw {
      phase: "PARSE" as const,
      message: `Unexpected ${describeToken(trailing)} after the scene block closed.${hint}`,
      line: trailing.line,
      col:  trailing.col,
    };
  }

  return { type: "scene", props: sceneProps, children: sceneChildren };
}