import type {
  Token,
  AstValue,
  ObjectNode,
  ObjectType,
  SceneNode,
} from "./types";
import { NAMED_COLORS } from "./lexer";

// ─────────────────────────────────────────────────────────────────────────────
// Declare Parser  (recursive-descent, 1-token lookahead)
// ─────────────────────────────────────────────────────────────────────────────

export function parse(tokens: Token[]): SceneNode {
  let pos = 0;

  const peek = (): Token => tokens[pos];

  const consume = (expectedType?: Token["type"]): Token => {
    const t = tokens[pos];
    if (expectedType && t.type !== expectedType) {
      throw {
        phase: "PARSE" as const,
        message: `Expected ${expectedType} but got ${t.type} ('${t.value}')`,
        line: t.line,
        col: t.col,
      };
    }
    pos++;
    return t;
  };

  // ── Value parser ────────────────────────────────────────────────────────────
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

    if (t.type === "LPAREN") {
      consume("LPAREN");
      const x = consume("NUMBER");
      consume("COMMA");
      const y = consume("NUMBER");
      consume("RPAREN");
      return { kind: "point", x: x.value as number, y: y.value as number };
    }

    if (t.type === "LBRACKET") {
      consume("LBRACKET");
      const pts: Array<{ x: number; y: number }> = [];
      while (peek().type !== "RBRACKET") {
        consume("LPAREN");
        const x = consume("NUMBER");
        consume("COMMA");
        const y = consume("NUMBER");
        consume("RPAREN");
        pts.push({ x: x.value as number, y: y.value as number });
        if (peek().type === "COMMA") consume("COMMA");
      }
      consume("RBRACKET");
      return { kind: "pointList", value: pts };
    }

    throw {
      phase: "PARSE" as const,
      message: `Unexpected token '${t.value}' (${t.type}) where a value was expected`,
      line: t.line,
      col: t.col,
    };
  }

  // ── Object parser ───────────────────────────────────────────────────────────
  function parseObject(): ObjectNode {
    const typeTok = consume("KEYWORD");
    const nameTok = consume("IDENT");
    consume("LBRACE");

    const props: Record<string, AstValue> = {};
    const children: ObjectNode[] = [];

    while (peek().type !== "RBRACE" && peek().type !== "EOF") {
      if (peek().type === "KEYWORD") {
        children.push(parseObject());
      } else {
        const key = consume("IDENT");
        consume("COLON");
        props[key.value as string] = parseValue();
      }
    }

    consume("RBRACE");

    return {
      type: typeTok.value as ObjectType,
      name: nameTok.value as string,
      props,
      children,
    };
  }

  // ── Scene root ──────────────────────────────────────────────────────────────
  const sceneTok = peek();
  if (sceneTok.type !== "KEYWORD" || sceneTok.value !== "scene") {
    throw {
      phase: "PARSE" as const,
      message: `Expected 'scene' keyword at top level, got '${sceneTok.value}'`,
      line: sceneTok.line,
      col: sceneTok.col,
    };
  }
  consume("KEYWORD");
  consume("LBRACE");

  const sceneProps: Record<string, AstValue> = {};
  const sceneChildren: ObjectNode[] = [];

  while (peek().type !== "RBRACE" && peek().type !== "EOF") {
    if (peek().type === "KEYWORD") {
      sceneChildren.push(parseObject());
    } else {
      const key = consume("IDENT");
      consume("COLON");
      sceneProps[key.value as string] = parseValue();
    }
  }

  consume("RBRACE");

  return { type: "scene", props: sceneProps, children: sceneChildren };
}
