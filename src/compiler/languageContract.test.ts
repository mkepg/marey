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
});
