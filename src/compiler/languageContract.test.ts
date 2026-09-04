import { describe, expect, it } from "vitest";
import {
  LANGUAGE_CONTRACT,
  RESERVED_PROPERTY_NAMES,
  REQUIRED_PROPS,
  PROP_TYPES,
  propertyDefault,
} from "./languageContract";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import { buildIR } from "./typeChecker/builder";
import {
  contractBooleanDefault,
  contractNumberDefault,
  contractPointDefault,
  contractStringDefault,
} from "./typeChecker/resolvers";

describe("language contract", () => {
  it("derives required and accepted properties from one data object", () => {
    expect(REQUIRED_PROPS.circle).toEqual(["position", "radius"]);
    expect(PROP_TYPES.animate).toEqual({
      property: "animProperty", to: ["number", "point"], duration: "number",
      easing: "easing", loop: "boolean", yoyo: "boolean", handoff: "boolean",
    });
    expect(Object.keys(LANGUAGE_CONTRACT.scene.properties)).toEqual([
      "background", "size", "fit",
    ]);
  });

  it("derives reservations without the three ghost properties", () => {
    expect(RESERVED_PROPERTY_NAMES.has("position")).toBe(true);
    expect(RESERVED_PROPERTY_NAMES.has("anchor")).toBe(false);
    expect(RESERVED_PROPERTY_NAMES.has("width")).toBe(false);
    expect(RESERVED_PROPERTY_NAMES.has("height")).toBe(false);
  });

  it("stores semantic defaults separately from completion placeholders", () => {
    expect(propertyDefault("physics", "airDrag")).toBe(0);
    expect(propertyDefault("physics", "collideBounds")).toBe(true);
    expect(LANGUAGE_CONTRACT.scene.properties.size.default).toBeUndefined();
    expect(LANGUAGE_CONTRACT.scene.properties.size.placeholder).toBe("(600, 400)");
  });

  it("exposes typed defaults for compiler consumers", () => {
    expect(contractNumberDefault("physics", "airDrag")).toBe(propertyDefault("physics", "airDrag"));
    expect(contractBooleanDefault("physics", "collideBounds")).toBe(propertyDefault("physics", "collideBounds"));
    expect(contractPointDefault("physics", "gravity")).toEqual(propertyDefault("physics", "gravity"));
    expect(contractStringDefault("scene", "fit")).toBe(propertyDefault("scene", "fit"));
  });

  it("builds optional IR values from contract defaults", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      circle c {
        position: (50, 50)
        radius: 10
        physics { duration: 1 }
      }
    }`));
    expect(errors).toEqual([]);
    const result = typeCheck(ast!);
    expect(result.errors).toEqual([]);
    expect(result.ir).not.toBeNull();

    const circle = result.ir!.children[0].props;
    expect(circle).toMatchObject({
      color: propertyDefault("circle", "color"),
      alpha: propertyDefault("circle", "alpha"),
      rotation: propertyDefault("circle", "rotation"),
      scale: propertyDefault("circle", "scale"),
      layer: propertyDefault("circle", "layer"),
      physics: {
        velocity: propertyDefault("physics", "velocity"),
        gravity: propertyDefault("physics", "gravity"),
        airDrag: propertyDefault("physics", "airDrag"),
        bounce: propertyDefault("physics", "bounce"),
        collideBounds: propertyDefault("physics", "collideBounds"),
      },
    });
    expect(result.ir!.background).toBe(propertyDefault("scene", "background"));
    expect(result.ir!.fit).toBe(propertyDefault("scene", "fit"));
  });

  it("uses the contract's group origin default", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      group g {
        circle c { position: (0, 0), radius: 10 }
      }
    }`));
    expect(errors).toEqual([]);
    const result = typeCheck(ast!);
    expect(result.errors).toEqual([]);
    expect(propertyDefault("group", "position")).toEqual({ x: 0, y: 0 });

    const group = result.ir!.children[0].props;
    if (group.kind !== "group") throw new Error("Expected a group IR node");
    expect(group.transform.position).toEqual(contractPointDefault("group", "position"));
  });

  it("rejects a missing required animation target when building IR directly", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      circle c {
        position: (50, 50)
        radius: 10
        animate { property: rotation, duration: 1 }
      }
    }`));
    expect(errors).toEqual([]);
    expect(() => buildIR(ast!)).toThrow("Required animation property 'to' is missing");
  });

  it("rejects an invalid animation target when building IR directly", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      circle c {
        position: (50, 50)
        radius: 10
        animate { property: rotation, to: "bad", duration: 1 }
      }
    }`));
    expect(errors).toEqual([]);
    expect(() => buildIR(ast!)).toThrow("Animation property 'to' must be a number or point");
  });

  it("gives every optional property a contract default or a named derived-default strategy", () => {
    // The structural guarantee behind §7 item 3: an optional property with
    // neither a `default` nor a `derivedDefault` is a gap where the builder
    // would have to hold private fallback knowledge the contract doesn't
    // know about — exactly the polygon.position defect this test exists to
    // make impossible to reintroduce.
    const gaps: string[] = [];
    for (const [blockName, contract] of Object.entries(LANGUAGE_CONTRACT)) {
      for (const [propName, spec] of Object.entries(contract.properties)) {
        if (spec.required) continue;
        if (spec.default !== undefined) continue;
        if (spec.derivedDefault !== undefined) continue;
        gaps.push(`${blockName}.${propName}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("names polygon.position's fallback as a derived-default strategy, not a fixed default", () => {
    expect(LANGUAGE_CONTRACT.polygon.properties.position.required).toBeUndefined();
    expect(LANGUAGE_CONTRACT.polygon.properties.position.default).toBeUndefined();
    expect(LANGUAGE_CONTRACT.polygon.properties.position.derivedDefault).toBe("polygonMinPoint");
  });

  it("keeps polygon's derived position default identical to the builder's old private min-point fallback", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      polygon p {
        points: [(10, 20), (50, 5), (30, 80)]
      }
    }`));
    expect(errors).toEqual([]);
    const result = typeCheck(ast!);
    expect(result.errors).toEqual([]);
    const polygon = result.ir!.children[0].props;
    if (polygon.kind !== "polygon") throw new Error("Expected a polygon IR node");
    // minX = 10, minY = 5 — the same fallback builder.ts used to compute
    // inline before Fix 1 moved it behind the contract's named strategy.
    expect(polygon.position).toEqual({ x: 10, y: 5 });
  });

  it("falls back to (0, 0) for a polygon built directly with no points, matching the old inline default", () => {
    // Bypasses typeCheck (which would reject fewer than 3 points via the
    // listOf constraint) to exercise buildIR's defensive empty-points
    // path directly, the same way the file's other "building IR directly"
    // tests bypass validation above.
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      polygon p {
        points: []
      }
    }`));
    expect(errors).toEqual([]);
    const ir = buildIR(ast!);
    const polygon = ir.children[0].props;
    if (polygon.kind !== "polygon") throw new Error("Expected a polygon IR node");
    expect(polygon.position).toEqual({ x: 0, y: 0 });
  });
});

describe("position and gravity descriptions (Fix 2)", () => {
  it("describes circle/rectangle/text position as the geometric center", () => {
    for (const block of ["circle", "rectangle", "text"] as const) {
      expect(LANGUAGE_CONTRACT[block].properties.position.description).toContain("geometric center");
    }
  });

  it("describes polygon/line position as the bounding-box midpoint, not the centroid — D15", () => {
    for (const block of ["polygon", "line"] as const) {
      const desc = LANGUAGE_CONTRACT[block].properties.position.description;
      expect(desc.toLowerCase()).toContain("bounding");
      expect(desc.toLowerCase()).toContain("centroid");
      expect(desc).not.toContain("geometric center");
    }
  });

  it("describes group position as the local origin, never derived from its children — D16", () => {
    const desc = LANGUAGE_CONTRACT.group.properties.position.description;
    expect(desc.toLowerCase()).toContain("local origin");
    expect(desc).not.toContain("geometric center");
  });

  it("describes gravity as injected per simulation tick, not applied each frame", () => {
    const desc = LANGUAGE_CONTRACT.physics.properties.gravity.description;
    expect(desc.toLowerCase()).toContain("tick");
    expect(desc.toLowerCase()).not.toContain("applied each frame");
  });
});

describe("one list kind (Phase 3B)", () => {
  // Two tests used to open this block:
  //   it("declares points as a list constrained to point elements", ...)
  //   it("labels the list kind", ...)
  // Both were deleted (Fix 3, post-Task-4 review): each read a value straight
  // out of LANGUAGE_CONTRACT or KIND_LABEL — `polygon.points.kinds`,
  // `polygon.points.constraint`, `line.points.constraint`, `KIND_LABEL.list`
  // — and asserted it equal to a hand-typed transcription of that exact same
  // literal, so the assertion was a copy of the data rather than a check of
  // any derivation or behaviour; none of the four involved a computed value
  // or an absence check. The `constraint` values are covered behaviourally by
  // this file's own min/max/element tests just below (including the
  // "rejects a line above the contract's maximum point count" test — added
  // after code review found the deleted echo was, until then, the only place
  // pinning line.points's `max: 10000`) and by `languageCuts.test.ts`'s
  // non-point-element rejection test, so nothing about `kinds`/`constraint`
  // went unguarded. `KIND_LABEL.list`'s exact string is the one genuine gap:
  // nothing else in the suite drives a `list` value through the "expects X,
  // but got Y" message path (no test gives a list where a non-list is
  // expected, or vice versa), so that specific wording is no longer pinned
  // anywhere.
  /**
   * The `listOf` count checks carry the two messages the old `pointCount`
   * constraint carried, unchanged. Nothing pinned either of them: deleting
   * both length checks outright, and separately mangling each message, left
   * all 411 tests green. They are the reason a 2-point polygon is rejected at
   * all, so they are pinned here rather than left to the next rewrite.
   *
   * The two "maximum point count" tests below no longer reach the `max`
   * branch they were originally written to pin: Phase 3B's `A to B` range
   * task added `parser/parseExpr.ts`'s `MAX_LIST_LENGTH` (10,000), a
   * parse-time ceiling on every list literal, and parsing always finishes
   * before type-checking runs. A 10,001-entry `points:` list literal now
   * throws that parser diagnostic before `typeChecker/validator.ts`'s own
   * `listOf` `max` check — the one that produces `[TYPE_POLYGON_TOO_LARGE]`
   * — ever runs. Both tests below now assert the parser's message instead,
   * so a reader of a "type contract" test file asserting parser wording
   * isn't left wondering why: the type-check-time branch is still there
   * (see the comment above it in `validator.ts`) but is presently
   * unreachable by construction.
   */
  const messagesFor = (source: string): string[] => {
    const { ast, errors } = parse(lex(source));
    if (errors.length || !ast) return errors.map((e) => e.message);
    return typeCheck(ast).errors.map((e) => e.message);
  };

  it("rejects a polygon with fewer than the contract's minimum points", () => {
    expect(messagesFor(`scene { size:(100,100) polygon p { position:(0,0), points: [(0,0), (10,10)] } }`))
      .toEqual(["'polygon' object 'p': 'polygon' requires at least 3 points."]);
  });

  it("rejects a line with fewer than the contract's minimum points", () => {
    expect(messagesFor(`scene { size:(100,100) line l { position:(0,0), thickness: 2, points: [(0,0)] } }`))
      .toEqual(["'line' object 'l': 'line' requires at least 2 points."]);
  });

  /**
   * `getReqPointList` narrows the one list kind down to `IRPointList`, so it
   * has to say what it does with a list the validator would never have let
   * through. Both branches are "cannot happen" guards, exercised the same way
   * this file's other direct-buildIR tests exercise theirs: by bypassing
   * typeCheck, which is what would normally have rejected the input.
   */
  it("refuses to build IR from a points list containing a non-point", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      polygon p { position: (0, 0), points: [(0,0), 5, (5,10)] }
    }`));
    expect(errors).toEqual([]);
    expect(() => buildIR(ast!)).toThrow(
      "Point list 'points' contains a 'number' element; the validator should have rejected this.",
    );
  });

  it("refuses to build IR from a polygon with no points at all", () => {
    const { ast, errors } = parse(lex(`scene {
      size: (100, 100)
      polygon p { position: (0, 0) }
    }`));
    expect(errors).toEqual([]);
    expect(() => buildIR(ast!)).toThrow("Required point list 'points' is missing or is not a list.");
  });

  it("rejects a polygon above the contract's maximum point count", () => {
    const tooMany = Array.from({ length: 10001 }, (_, i) => `(${i},0)`).join(",");
    expect(messagesFor(`scene { size:(100,100) polygon p { position:(0,0), points: [${tooMany}] } }`))
      .toEqual([
        "In 'polygon' object 'p': A list of 10,001 values exceeds the maximum list length of 10,000.",
      ]);
  });

  // Mirrors the polygon case directly above. Added after code review found
  // that deleting the two data-echo tests (this block's former first two
  // `it`s) had left line.points's max — unlike its min just above — with no
  // coverage anywhere: the deleted echo test was the only place pinning
  // `line.points.constraint`'s `max: 10000`, and nothing else in the suite
  // ever builds a line with more than 10,000 points. `line` shares
  // `TYPE_POLYGON_TOO_LARGE` with `polygon` here because both declare
  // `element: "point"` (languageContract.ts's `listTooLargeCode` keys off
  // the element kind, not the block name — see Fix 1).
  it("rejects a line above the contract's maximum point count", () => {
    const tooMany = Array.from({ length: 10001 }, (_, i) => `(${i},0)`).join(",");
    expect(messagesFor(`scene { size:(100,100) line l { position:(0,0), thickness: 2, points: [${tooMany}] } }`))
      .toEqual([
        "In 'line' object 'l': A list of 10,001 values exceeds the maximum list length of 10,000.",
      ]);
  });
});
