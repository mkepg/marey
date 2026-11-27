/**
 * The geometry checker for the layout briefs, and the reference scenes that
 * show it discriminates: each brief has one correct scene that passes every
 * clause and one wrong scene per non-`brief` clause that fails that clause.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileSource } from "../src/compiler/compileSource";
import { worldBoxes, type WorldShape } from "./layout/geometry";
import { BRIEFS, checkScene, type BriefId } from "./layout/predicates";

const REF_DIR = "eval/layout/reference";

function shapesOf(source: string): WorldShape[] {
  const outcome = compileSource(source);
  expect(outcome.errors).toEqual([]);
  expect(outcome.ir).not.toBeNull();
  return worldBoxes(outcome.ir!);
}

function scene(body: string): string {
  return `scene {\n  size: (800, 600)\n  background: #0a0e1a\n${body}\n}\n`;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe("worldBoxes", () => {
  it("a 60×40 rectangle at (100, 100) has box (70, 80)–(130, 120)", () => {
    const [s] = shapesOf(scene(`rectangle r { position: (100, 100), size: (60, 40), color: red }`));
    expect(s.box).toEqual({ minX: 70, minY: 80, maxX: 130, maxY: 120 });
  });

  it("a rectangle with origin (0, 0) at (100, 100) has box (100, 100)–(160, 140)", () => {
    const [s] = shapesOf(scene(`rectangle r { position: (100, 100), size: (60, 40), origin: (0, 0), color: red }`));
    expect(s.box).toEqual({ minX: 100, minY: 100, maxX: 160, maxY: 140 });
  });

  it("a 60×40 rectangle rotated 90° about its centre has box 40×60", () => {
    const [s] = shapesOf(scene(`rectangle r { position: (100, 100), size: (60, 40), rotation: 90, color: red }`));
    expect(near(s.box.maxX - s.box.minX, 40)).toBe(true);
    expect(near(s.box.maxY - s.box.minY, 60)).toBe(true);
    expect(near((s.box.minX + s.box.maxX) / 2, 100)).toBe(true);
  });

  it("a rectangle with origin (0, 0), rotated 90°, at (100, 100) has box (60, 100)–(100, 160)", () => {
    const [s] = shapesOf(
      scene(`rectangle r { position: (100, 100), size: (60, 40), origin: (0, 0), rotation: 90, color: red }`),
    );
    expect(near(s.box.minX, 60) && near(s.box.minY, 100) && near(s.box.maxX, 100) && near(s.box.maxY, 160)).toBe(true);
  });

  it("a circle r10 at (5, 5) inside a group at (100, 0) rotated 90° and scaled (2, 2) has pivot (90, 10) and box 40×40", () => {
    const [s] = shapesOf(
      scene(`group g {
        position: (100, 0), rotation: 90, scale: (2, 2)
        circle c { position: (5, 5), radius: 10, color: red }
      }`),
    );
    expect(near(s.pivot.x, 90) && near(s.pivot.y, 10)).toBe(true);
    expect(near(s.box.maxX - s.box.minX, 40) && near(s.box.maxY - s.box.minY, 40)).toBe(true);
  });

  it("composes two nested groups in order, rotation and scale included", () => {
    // Outer: at (200, 100), rotated 90°. Inner: at (10, 0), scaled (3, 3).
    // Child at (4, 0): inner -> (10 + 12, 0) = (22, 0); outer rotation -> (0, 22); translate -> (200, 122).
    const [s] = shapesOf(
      scene(`group outer {
        position: (200, 100), rotation: 90
        group inner {
          position: (10, 0), scale: (3, 3)
          rectangle r { position: (4, 0), size: (10, 10), color: red }
        }
      }`),
    );
    expect(near(s.pivot.x, 200) && near(s.pivot.y, 122)).toBe(true);
    expect(near(s.rotation, 90)).toBe(true);
    expect(near(s.scale.x, 3)).toBe(true);
    // 10×10 scaled 3× and turned a quarter: 30×30 about the pivot.
    expect(near(s.box.maxX - s.box.minX, 30) && near((s.box.minX + s.box.maxX) / 2, 200)).toBe(true);
  });

  it("a use instance's children carry the wrapper group's position", () => {
    const source = `template Dot() {
      circle c { position: (0, 0), radius: 10, color: red }
    }
    scene {
      size: (800, 600)
      background: #0a0e1a
      use Dot() d { position: (250, 125) }
    }`;
    const [s] = shapesOf(source);
    expect(near(s.pivot.x, 250) && near(s.pivot.y, 125)).toBe(true);
    expect(s.box).toEqual({ minX: 240, minY: 115, maxX: 260, maxY: 135 });
  });

  it("a scene-filling background rectangle is ignored by every L1 clause", () => {
    const ok = readFileSync(join(REF_DIR, "L1-ok.marey"), "utf8");
    const withBackground = ok.replace(
      "  generate",
      "  rectangle backdrop {\n    position: (400, 300)\n    size: (800, 600)\n    color: #111111\n    layer: -1\n  }\n\n  generate",
    );
    expect(withBackground).not.toBe(ok);
    const r = checkScene("L1", withBackground);
    expect(r.compiled).toBe(true);
    expect(r.results.filter((c) => !c.pass)).toEqual([]);
  });

  it("a wrong shape count fails the count clause and every other clause", () => {
    const ok = readFileSync(join(REF_DIR, "L1-ok.marey"), "utf8");
    const xsLine = ok.split("\n").find((l) => l.startsWith("let xs"))!;
    const fewer = ok.replace(xsLine, "let xs = [200, 280, 360, 440, 520]");
    const r = checkScene("L1", fewer);
    expect(r.results.every((c) => !c.pass)).toBe(true);
  });
});

describe("reference scenes", () => {
  const files = readdirSync(REF_DIR).filter((f) => f.endsWith(".marey")).sort();
  const parsed = files.map((f) => {
    const m = /^(L[1-9])-(.+)\.marey$/.exec(f)!;
    return { file: f, brief: m[1] as BriefId, kind: m[2], source: readFileSync(join(REF_DIR, f), "utf8") };
  });

  it("has an -ok scene for every brief and a wrong scene for every non-brief clause", () => {
    for (const id of Object.keys(BRIEFS) as BriefId[]) {
      expect(parsed.some((p) => p.brief === id && p.kind === "ok"), `${id} ok`).toBe(true);
      for (const clause of BRIEFS[id]) {
        if (clause.tag === "brief") continue;
        expect(parsed.some((p) => p.brief === id && p.kind === clause.name), `${id} ${clause.name}`).toBe(true);
      }
    }
    for (const p of parsed) {
      if (p.kind === "ok") continue;
      expect(BRIEFS[p.brief].some((c) => c.name === p.kind && c.tag !== "brief"), p.file).toBe(true);
    }
  });

  it("every -ok reference passes every clause", () => {
    for (const p of parsed.filter((x) => x.kind === "ok")) {
      const r = checkScene(p.brief, p.source);
      expect(r.compiled, p.file).toBe(true);
      expect(r.results.filter((c) => !c.pass).map((c) => c.clause), p.file).toEqual([]);
    }
  });

  it("every wrong reference fails its named clause and passes every clause with a different tag", () => {
    for (const p of parsed.filter((x) => x.kind !== "ok")) {
      const r = checkScene(p.brief, p.source);
      expect(r.compiled, p.file).toBe(true);
      const named = r.results.find((c) => c.clause === p.kind)!;
      expect(named.pass, `${p.file} must fail ${p.kind}`).toBe(false);
      const others = r.results.filter((c) => c.tag !== named.tag);
      expect(others.filter((c) => !c.pass).map((c) => c.clause), p.file).toEqual([]);
    }
  });
});

/**
 * The blind corpus: every `<author>-<brief>.marey` in eval/scenes-layout is
 * checked against its brief and written to eval/report-layout.json. This
 * reports; it does not fail on a geometric failure, because a wrong layout is
 * the measurement, not a defect. It fails only if a file cannot be mapped to
 * a brief.
 */
const CORPUS_DIR = "eval/scenes-layout";
const BRIEF_BY_FILE: Record<string, BriefId> = {
  "toolbar-row": "L1",
  "mixed-row": "L2",
  "spread-dots": "L3",
  "left-stack": "L4",
  "badge-row": "L5",
  "card-grid": "L6",
  "stack-columns": "L7",
  "ring-12": "L8",
  "clock-ticks": "L9",
};

describe.runIf(existsSync(CORPUS_DIR))("the blind layout corpus", () => {
  it("checks every scene against its brief and writes eval/report-layout.json", () => {
    const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".marey")).sort();
    const report = files.map((f) => {
      const m = /^([A-Z])-(.+)\.marey$/.exec(f);
      expect(m, f).not.toBeNull();
      const brief = BRIEF_BY_FILE[m![2]];
      expect(brief, f).toBeDefined();
      const r = checkScene(brief, readFileSync(join(CORPUS_DIR, f), "utf8"));
      return { scene: f, author: m![1], brief, compiled: r.compiled, clauses: r.results };
    });
    writeFileSync("eval/report-layout.json", JSON.stringify(report, null, 2) + "\n");
    expect(report.length).toBe(files.length);
  });
});
