import { describe, expect, it } from "vitest";
import {
  LANGUAGE_CONTRACT,
  RESERVED_PROPERTY_NAMES,
  REQUIRED_PROPS,
  PROP_TYPES,
  propertyDefault,
} from "./languageContract";

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
});
