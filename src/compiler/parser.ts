import type {
  Token,
  AstValue,
  ObjectNode,
  ObjectType,
  SceneNode,
  ScaleMode,
} from "./types";
import { NAMED_COLORS, KEYWORDS } from "./lexer";

// ─── Human-readable token descriptions ────────────────────────────────────────
// Never expose raw token type names (LBRACE, IDENT, etc.) in user-facing messages.

function describeToken(t: Token): string {
  switch (t.type) {
    case "KEYWORD":     return `keyword '${t.value as string}'`;
    case "IDENT":       return `identifier '${t.value as string}'`;
    case "NUMBER":      return `number ${t.value as number}`;
    case "HEX_COLOR":   return `color '${t.value as string}'`;
    case "NAMED_COLOR": return `color keyword '${t.value as string}'`;
    case "SCALE_MODE":  return `scaleMode value '${t.value as string}'`;
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

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parse(tokens: Token[]): SceneNode {
  let pos = 0;

  const peek = (): Token => tokens[pos];

  const consume = (expectedType?: Token["type"]): Token => {
    const t = tokens[pos];
    if (expectedType && t.type !== expectedType) {
      // Translate the expected type into something the author can act on.
      const expectedDesc = expectedTypeDescription(expectedType, t);
      throw {
        phase: "PARSE" as const,
        message: `Expected ${expectedDesc}, but found ${describeToken(t)}.`,
        line: t.line,
        col:  t.col,
      };
    }
    pos++;
    return t;
  };

  /**
   * Produces a context-aware description of what was expected,
   * without leaking internal token type names.
   */
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

  // ─── Value parser ──────────────────────────────────────────────────────────

  function parseValue(): AstValue {
    const t = peek();

    // Numeric literal
    if (t.type === "NUMBER") {
      consume();
      return { kind: "number", value: t.value as number };
    }

    // Hex color literal (#RGB | #RRGGBB)
    if (t.type === "HEX_COLOR") {
      consume();
      return { kind: "color", value: t.value as string };
    }

    // Named color keyword (red, blue, green, …)
    if (t.type === "NAMED_COLOR") {
      consume();
      return { kind: "color", value: NAMED_COLORS[t.value as string] };
    }

    // Quoted string literal
    if (t.type === "STRING") {
      consume();
      return { kind: "string", value: t.value as string };
    }

    // ScaleMode enum literal (contain | cover | fill | none)
    if (t.type === "SCALE_MODE") {
      consume();
      return { kind: "scaleMode", value: t.value as ScaleMode };
    }

    // Point literal: ( number , number )
    if (t.type === "LPAREN") {
      const openTok = consume("LPAREN");
      const xTok    = consume("NUMBER");
      consume("COMMA");
      const yTok    = consume("NUMBER");

      // Guard: extra numbers before the closing paren, e.g. (1, 2, 3)
      if (peek().type === "COMMA") {
        const extra = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `A point takes exactly two numbers, but found an extra ',' at ` +
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
            `Expected ')' to close the point opened at line ${openTok.line}, ` +
            `column ${openTok.col}, but found ${describeToken(bad)}.`,
          line: bad.line,
          col:  bad.col,
        };
      }
      consume("RPAREN");
      return { kind: "point", x: xTok.value as number, y: yTok.value as number };
    }

    // Point-list literal: [ ( n,n ) , ( n,n ) , … ]
    if (t.type === "LBRACKET") {
      const openTok = consume("LBRACKET");
      const pts: Array<{ x: number; y: number }> = [];

      while (peek().type !== "RBRACKET") {
        if (peek().type === "EOF") {
          throw {
            phase: "PARSE" as const,
            message:
              `Point list opened at line ${openTok.line}, column ${openTok.col} ` +
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
              `Expected a point '(x, y)' inside the point list, ` +
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
              `Expected ')' to close the point opened at line ${ptOpen.line}, ` +
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
            `Empty point list '[]' is not valid. ` +
            `A point list must contain at least 3 points for polygon use, ` +
            `e.g. [(0,0), (100,0), (50,80)].`,
          line: openTok.line,
          col:  openTok.col,
        };
      }

      consume("RBRACKET");
      return { kind: "pointList", value: pts };
    }

    // ── Specific, actionable errors for common mistakes ──────────────────────

    // Bare identifier in a value position (e.g. color: myColor)
    if (t.type === "IDENT") {
      throw {
        phase: "PARSE" as const,
        message:
          `'${t.value as string}' is not a recognised value. ` +
          `Bare names cannot be used as values in Declare v1.0. ` +
          `For colors, use a hex code (e.g. #ff0000) or a color keyword ` +
          `(red, green, blue, white, black, yellow, cyan, magenta, orange). ` +
          `For text, wrap the value in double quotes (e.g. "hello").`,
        line: t.line,
        col:  t.col,
      };
    }

    // Object keyword in a value position (e.g. color: circle)
    if (t.type === "KEYWORD") {
      throw {
        phase: "PARSE" as const,
        message:
          `'${t.value as string}' is an object keyword and cannot be used as a property value. ` +
          `If this was intended as a color, use a hex code or a named color keyword instead.`,
        line: t.line,
        col:  t.col,
      };
    }

    // Stray closing brace/bracket/paren in a value position
    if (t.type === "RBRACE" || t.type === "RBRACKET" || t.type === "RPAREN") {
      throw {
        phase: "PARSE" as const,
        message:
          `Unexpected ${describeToken(t)} where a property value was expected. ` +
          `This may indicate a missing value, an extra closing bracket, ` +
          `or a misplaced '}'.`,
        line: t.line,
        col:  t.col,
      };
    }

    // EOF inside a property value
    if (t.type === "EOF") {
      throw {
        phase: "PARSE" as const,
        message:
          `Reached end of file while reading a property value. ` +
          `A value (number, color, string, or point) is required after ':'.`,
        line: t.line,
        col:  t.col,
      };
    }

    // Catch-all
    throw {
      phase: "PARSE" as const,
      message:
        `Unexpected ${describeToken(t)} where a property value was expected. ` +
        `Valid value types are: number, hex color (#rrggbb), color keyword, ` +
        `quoted string, point (x, y), or point list [(x,y), ...].`,
      line: t.line,
      col:  t.col,
    };
  }

  // ─── Object block parser ───────────────────────────────────────────────────

  function parseObject(): ObjectNode {
    const typeTok = consume("KEYWORD");
    const objType = typeTok.value as string;

    // Missing object name — another keyword or brace follows immediately.
    if (peek().type !== "IDENT") {
      const bad = peek();
      const hint =
        bad.type === "LBRACE"
          ? ` Every object must have a name before its '{'. ` +
            `For example: ${objType} myObject { ... }`
          : bad.type === "KEYWORD"
          ? ` Another keyword was found instead. ` +
            `Did you forget the object name? ` +
            `For example: ${objType} myObject { ... }`
          : "";
      throw {
        phase: "PARSE" as const,
        message:
          `Expected a name for the '${objType}' object, ` +
          `but found ${describeToken(bad)}.${hint}`,
        line: bad.line,
        col:  bad.col,
      };
    }

    const nameTok = consume("IDENT");
    const objName = nameTok.value as string;

    // scaleMode / named-color / scale-mode words used as object names
    // are caught by the lexer (they are not IDENT tokens), but if someone
    // somehow uses a reserved-looking name, give a clear message.
    if (KEYWORDS.has(objName)) {
      throw {
        phase: "PARSE" as const,
        message:
          `'${objName}' is a reserved keyword and cannot be used as an object name. ` +
          `Choose a different name (e.g. '${objType}1' or 'my${objType}').`,
        line: nameTok.line,
        col:  nameTok.col,
      };
    }

    consume("LBRACE");

    const props: Record<string, AstValue> = {};
    const children: ObjectNode[]          = [];
    const seenProps  = new Set<string>();
    const seenNames  = new Set<string>();

    while (peek().type !== "RBRACE" && peek().type !== "EOF") {
      // ── Child object declaration ───────────────────────────────────────────
      if (peek().type === "KEYWORD") {
        const childNode = parseObject();

        // Duplicate child name check inside this block.
        if (seenNames.has(childNode.name)) {
          throw {
            phase: "PARSE" as const,
            message:
              `Duplicate object name '${childNode.name}' inside '${objName}'. ` +
              `Every object within the same block must have a unique name.`,
            line: peek().line,
            col:  peek().col,
          };
        }
        seenNames.add(childNode.name);
        children.push(childNode);
        continue;
      }

      // ── Property declaration ───────────────────────────────────────────────

      // A SCALE_MODE token as a property key is almost certainly a typo
      // (e.g. `contain: ...` instead of `scaleMode: contain`).
      if (peek().type === "SCALE_MODE") {
        const bad = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `'${bad.value as string}' is a scaleMode value keyword, not a property name. ` +
            `Did you mean: scaleMode: ${bad.value as string}`,
          line: bad.line,
          col:  bad.col,
        };
      }

      // A NAMED_COLOR token as a property key (e.g. `red: ...`).
      if (peek().type === "NAMED_COLOR") {
        const bad = peek();
        throw {
          phase: "PARSE" as const,
          message:
            `'${bad.value as string}' is a color keyword, not a property name. ` +
            `Property names must be plain identifiers (e.g. 'color', 'position').`,
          line: bad.line,
          col:  bad.col,
        };
      }

      const key = consume("IDENT");
      const keyName = key.value as string;

      // Duplicate property key inside this block.
      if (seenProps.has(keyName)) {
        throw {
          phase: "PARSE" as const,
          message:
            `Property '${keyName}' is defined more than once inside '${objName}'. ` +
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
          `The '${objType}' block '${objName}' was not closed before end of file. ` +
          `Add a closing '}'.`,
        line: typeTok.line,
        col:  typeTok.col,
      };
    }

    consume("RBRACE");
    return {
      type: typeTok.value as ObjectType,
      name: objName,
      props,
      children,
    };
  }

  // ─── Top-level: exactly one scene block ───────────────────────────────────

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

  consume("KEYWORD"); // 'scene'
  consume("LBRACE");

  const sceneProps: Record<string, AstValue> = {};
  const sceneChildren: ObjectNode[]          = [];
  const seenSceneProps = new Set<string>();
  const seenSceneNames = new Set<string>();

  while (peek().type !== "RBRACE" && peek().type !== "EOF") {
    if (peek().type === "KEYWORD") {
      const child = parseObject();

      if (seenSceneNames.has(child.name)) {
        throw {
          phase: "PARSE" as const,
          message:
            `Duplicate object name '${child.name}' in the scene. ` +
            `Every top-level object must have a unique name.`,
          line: peek().line,
          col:  peek().col,
        };
      }
      seenSceneNames.add(child.name);
      sceneChildren.push(child);
      continue;
    }

    if (peek().type === "SCALE_MODE") {
      const bad = peek();
      throw {
        phase: "PARSE" as const,
        message:
          `'${bad.value as string}' is a scaleMode value keyword, not a property name. ` +
          `Did you mean: scaleMode: ${bad.value as string}`,
        line: bad.line,
        col:  bad.col,
      };
    }

    if (peek().type === "NAMED_COLOR") {
      const bad = peek();
      throw {
        phase: "PARSE" as const,
        message:
          `'${bad.value as string}' is a color keyword, not a property name. ` +
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
          `Property '${keyName}' is defined more than once in the scene block. ` +
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
        "The 'scene' block was not closed before end of file. Add a closing '}'.",
      line: firstTok.line,
      col:  firstTok.col,
    };
  }

  consume("RBRACE"); // closing '}'

  // ── Trailing-token check ───────────────────────────────────────────────────
  // Nothing is permitted after the scene block closes.
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
      message:
        `Unexpected ${describeToken(trailing)} after the scene block closed.${hint}`,
      line: trailing.line,
      col:  trailing.col,
    };
  }

  return { type: "scene", props: sceneProps, children: sceneChildren };
}