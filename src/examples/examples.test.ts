import { describe, expect, it } from "vitest";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import { encodeCode, MAX_SHARE_LENGTH } from "../lib/share";
import { DEFAULT_EXAMPLE, EXAMPLES } from "./index";

describe("the examples registry", () => {
  it("lists the examples, titles and descriptions, in order", () => {
    expect(EXAMPLES.map((e) => [e.id, e.title, e.description])).toEqual([
      ["dusk-hills", "Dusk over layered hills", "The sun sets, sleeps and rises again, on a 12-second loop."],
      ["physics-pile", "Physics pile", "Shapes tumble, collide and settle under gravity."],
      ["bar-chart-reveal", "Bar chart reveal", "A list of numbers grows into bars, one after another."],
      ["logo-reveal", "Logo reveal", "A logo assembles from its parts in sequence."],
    ]);
    expect(DEFAULT_EXAMPLE.id).toBe("dusk-hills");
  });
});

describe.each(EXAMPLES.map((e) => [e.id, e] as const))("%s", (_id, example) => {
  const outcome = compileSource(example.source);

  it("compiles with no errors", () => {
    expect(outcome.errors).toEqual([]);
    expect(outcome.ir).not.toBeNull();
  });

  it("exports as loaded, at the buttons' 30 fps", () => {
    expect(outcome.ir!.duration).not.toBeNull();
    const planned = planExport(outcome.ir!, { fps: 30 });
    expect(planned.ok ? [] : planned.diagnostics).toEqual([]);
  });

  it("is small enough to share", () => {
    const encoded = encodeCode(example.source);
    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
  });

  it("opens with a header comment of at most three lines", () => {
    const lines = example.source.split("\n");
    const header = lines.findIndex((l) => !l.startsWith("//"));
    expect(header).toBeGreaterThanOrEqual(1);
    expect(header).toBeLessThanOrEqual(3);
  });
});
