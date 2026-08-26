import { describe, it, expect } from "vitest";
import Matter from "matter-js";

declare module "matter-js" {
  namespace Common {
    const _baseDelta: number;
  }
  namespace Sleeping {
    function update(bodies: Matter.Body[], delta: number): void;
  }
}

describe("matter-js interop", () => {
  it("resolves the default export with the modules this phase uses", () => {
    expect(typeof Matter.Engine.create).toBe("function");
    expect(typeof Matter.Bodies.circle).toBe("function");
    expect(typeof Matter.Body.setVelocity).toBe("function");
    expect(typeof Matter.Sleeping.update).toBe("function");
    expect(typeof Matter.Vertices.hull).toBe("function");
  });

  it("is the version whose internals spec 6.3 and 6.4 were derived from", () => {
    // This phase depends on Matter internals that are not the documented API:
    // Body._baseDelta normalisation, and the phase order inside Engine.update.
    // If this fails, re-derive the conversions before bumping the dependency.
    expect(Matter.Common._baseDelta).toBe(1000 / 60);
  });
});
