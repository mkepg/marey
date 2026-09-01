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
      easing: "easing", loop: "boolean", yoyo: "boolean", handOff: "boolean",
    });
    expect(Object.keys(LANGUAGE_CONTRACT.scene.properties)).toEqual([
      "background", "size", "sceneFit",
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
    expect(contractStringDefault("scene", "sceneFit")).toBe(propertyDefault("scene", "sceneFit"));
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
      z: propertyDefault("circle", "z"),
      physics: {
        velocity: propertyDefault("physics", "velocity"),
        gravity: propertyDefault("physics", "gravity"),
        airDrag: propertyDefault("physics", "airDrag"),
        bounce: propertyDefault("physics", "bounce"),
        collideBounds: propertyDefault("physics", "collideBounds"),
      },
    });
    expect(result.ir!.background).toBe(propertyDefault("scene", "background"));
    expect(result.ir!.sceneFit).toBe(propertyDefault("scene", "sceneFit"));
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
});
