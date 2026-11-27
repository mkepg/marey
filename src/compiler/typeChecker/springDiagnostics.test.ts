import { describe, it, expect } from "vitest";
import { compileSource } from "../compileSource";

function compile(src: string) {
  return compileSource(src);
}

function errorsOf(src: string): string[] {
  return compile(src).errors.map((e) => e.message);
}

/** A circle carrying one `animate` block with `props` written inside it. */
function withAnimate(props: string, extra = ""): string {
  return `scene {
  size: (400, 300)
  circle c {
    position: (100, 100)
    radius: 10
    animate { property: scale, to: 2, duration: 1, ${props} }
${extra}
  }
}`;
}

const BOUNCE_WITHOUT_SPRING = (easing: string) =>
  `[TYPE_BOUNCE_WITHOUT_SPRING] 'bounce' only shapes 'easing: spring', but this animation's easing is '${easing}'. Remove 'bounce' or set 'easing: spring'.`;

describe("spring diagnostics", () => {
  it("TYPE_BOUNCE_WITHOUT_SPRING names the easing written", () => {
    const src = withAnimate("easing: easeOut, bounce: 0.3");
    const { errors } = compile(src);
    expect(errors.map((e) => e.message)).toEqual([BOUNCE_WITHOUT_SPRING("easeOut")]);
    // Marked at the 'bounce' value.
    const lines = src.split("\n");
    const line = lines.findIndex((l) => l.includes("bounce: 0.3")) + 1;
    expect([errors[0].line, errors[0].col]).toEqual([line, lines[line - 1].indexOf("0.3") + 1]);
  });

  it("TYPE_BOUNCE_WITHOUT_SPRING names the default easing when none is written", () => {
    expect(errorsOf(withAnimate("bounce: 0.3"))).toEqual([BOUNCE_WITHOUT_SPRING("easeInOut")]);
  });

  it("leaves TYPE_BOUNCE_WITHOUT_SPRING out when the easing value is not an easing", () => {
    // That easing is already a kind mismatch. Naming the default for it would
    // tell the author an easing is in effect that they never wrote.
    const errors = errorsOf(withAnimate("easing: 3, bounce: 0.3"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'easing'");
    expect(errors[0]).not.toContain("TYPE_BOUNCE_WITHOUT_SPRING");
  });

  it("TYPE_HANDOFF_SPRING rejects a spring that would hand off", () => {
    const src = `scene {
  size: (400, 300)
  circle c {
    position: (100, 100)
    radius: 10
    animate { property: position, to: (200, 100), duration: 1, easing: spring, handoff: true }
    physics { duration: 3 }
  }
}`;
    expect(errorsOf(src)).toEqual([
      "[TYPE_HANDOFF_SPRING] 'easing: spring' settles at rest, so it has no momentum to hand over with 'handoff: true'. Use 'easing: easeOut', which still moves at its end.",
    ]);
    // The same scene with the suggested easing compiles, so the rejection is
    // the spring's alone.
    expect(errorsOf(src.replace("easing: spring", "easing: easeOut"))).toEqual([]);
  });

  it("rejects a bounce above 0.9 with the contract's range diagnostic", () => {
    expect(errorsOf(withAnimate("easing: spring, bounce: 0.95"))).toEqual([
      "The 'animate' block: 'bounce' must be between 0.0 and 0.9 inclusive, but got 0.95.",
    ]);
  });

  it("compiles bounce 0 and bounce 0.9 with easing: spring, into the IR", () => {
    for (const b of [0, 0.9]) {
      const out = compile(withAnimate(`easing: spring, bounce: ${b}`));
      expect(out.errors.map((e) => e.message)).toEqual([]);
      const anim = out.ir!.children[0].props.animations[0];
      expect(anim.easing).toBe("spring");
      expect(anim.bounce).toBe(b);
    }
  });

  it("builds bounce at its default 0.25 when it is absent", () => {
    const out = compile(withAnimate("easing: spring"));
    expect(out.errors.map((e) => e.message)).toEqual([]);
    expect(out.ir!.children[0].props.animations[0].bounce).toBe(0.25);
  });
});
