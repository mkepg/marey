/**
 * The geometry checker for the layout briefs, and the reference scenes that
 * show it discriminates: each brief has one correct scene that passes every
 * clause and one wrong scene per non-`brief` clause that fails that clause.
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileSource } from "../src/compiler/compileSource";
import { worldBoxes, type WorldShape } from "./layout/geometry";
import { BRIEFS, checkScene, type BriefId } from "./layout/predicates";
import { tokenize, tokenShare, type TokenShare } from "./layout/tokenShare";

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

describe("tokenShare", () => {
  it("counts let lines with their continuations, generate headers and position lines, and drops comments", () => {
    const source = [
      "let xs = [1,", //           let, xs, =, [, 1, ,            6 layout
      "  2]", //                   continuation: 2, ]             2 layout
      "scene {", //                scene, {                       2
      "  background: #0a0e1a", //  background, :, #0a0e1a        3 (the colour is one token)
      "  // a comment, 0 tokens",
      "  generate x in xs {", //   generate, x, in, xs, {         5 layout
      "    circle c { position: (x, 0), radius: 5 }", // 15 tokens, a position line: 15 layout
      "  }", //                    }                              1
      "}", //                      }                              1
    ].join("\n");
    expect(tokenize(source).map((t) => t.text).slice(0, 8)).toEqual(["let", "xs", "=", "[", "1", ",", "2", "]"]);
    expect(tokenShare(source)).toEqual({ tokens: 35, layoutTokens: 28, share: 28 / 35 });
  });

  it("a let whose brackets close on its own line does not continue", () => {
    expect(tokenShare("let a = (1 + 2)\nscene {\n}\n")).toEqual({ tokens: 11, layoutTokens: 8, share: 8 / 11 });
  });
});

/**
 * The blind corpus: every `<author>-<brief>.marey` in eval/scenes-layout is
 * checked against its brief and written to eval/report-layout.json, with its
 * layout-token share and a mutation sweep over the whole corpus. This
 * reports; it does not fail on a geometric failure, because a wrong layout is
 * the measurement, not a defect, and it does not fail on a surviving mutant.
 * It fails only if a file cannot be mapped to a brief.
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

interface SceneEntry {
  scene: string;
  author: string;
  brief: BriefId;
  compiled: boolean;
  clauses: { clause: string; tag: string; pass: boolean }[];
  tokenShare: TokenShare;
}

type MutantOutcome = "killed" | "briefOnly" | "notCompiling" | "survived";
/** Where a mutant was made: its scene, 1-based line and column, and the literal before and after. */
interface MutantSite {
  scene: string;
  line: number;
  column: number;
  from: string;
  to: string;
}

/**
 * Every numeric literal in `source` except the scene's own `size:` (the
 * brief fixes the 800×600 frame, and no clause reads it), as offsets.
 */
function mutableLiterals(source: string): { offset: number; text: string; line: number; column: number }[] {
  const tokens = tokenize(source);
  const out: { offset: number; text: string; line: number; column: number }[] = [];
  let braces = 0;
  let parens = 0;
  let inScene = false; // inside the top-level `scene { }` block
  let skipBelow = -1; // while >= 0: inside the scene's size value, which closes when parens returns to it
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    if (t === "scene" && tokens[i + 1]?.text === "{" && braces === 0) inScene = true;
    if (t === "{") braces++;
    else if (t === "}") {
      braces--;
      if (braces === 0) inScene = false;
    } else if (t === "(") parens++;
    else if (t === ")") {
      parens--;
      if (parens === skipBelow) skipBelow = -1;
    }
    if (inScene && braces === 1 && t === "size" && tokens[i + 1]?.text === ":") skipBelow = parens;
    if (/^\d/.test(t) && skipBelow === -1) {
      const { offset, line } = tokens[i];
      out.push({ offset, text: t, line: line + 1, column: offset - source.lastIndexOf("\n", offset - 1) });
    }
  }
  return out;
}

describe.runIf(existsSync(CORPUS_DIR))("the blind layout corpus", () => {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".marey")).sort();
  const briefOf = (f: string): BriefId => {
    const m = /^([A-Z])-(.+)\.marey$/.exec(f);
    expect(m, f).not.toBeNull();
    const brief = BRIEF_BY_FILE[m![2]];
    expect(brief, f).toBeDefined();
    return brief;
  };
  let scenes: SceneEntry[] | undefined;
  let mutationSweep: Record<string, unknown> | undefined;

  afterAll(() => {
    if (scenes && mutationSweep) {
      writeFileSync("eval/report-layout.json", JSON.stringify({ scenes, mutationSweep }, null, 2) + "\n");
    }
  });

  it("checks every scene against its brief and records its layout-token share", () => {
    scenes = files.map((f) => {
      const source = readFileSync(join(CORPUS_DIR, f), "utf8");
      const brief = briefOf(f);
      const r = checkScene(brief, source);
      return { scene: f, author: f[0], brief, compiled: r.compiled, clauses: r.results, tokenShare: tokenShare(source) };
    });
    expect(scenes.length).toBe(files.length);
  });

  // For every scene, each numeric literal in turn is raised by 2, in memory,
  // and the scene re-checked against its brief. A mutant is killed when a
  // non-`brief` clause fails, brief-only when only `brief` clauses fail, and
  // survives when every clause still passes. Survivors are listed so each
  // can be read as an equivalent mutant or a blind spot of the checker.
  it("records a +2 mutation sweep over every numeric literal of the corpus", () => {
    const counts: Record<MutantOutcome, number> = { killed: 0, briefOnly: 0, notCompiling: 0, survived: 0 };
    const survivors: MutantSite[] = [];
    const briefOnly: MutantSite[] = [];
    const notCompiling: MutantSite[] = [];
    let excludedSceneSize = 0;
    for (const f of files) {
      const source = readFileSync(join(CORPUS_DIR, f), "utf8");
      const brief = briefOf(f);
      const literals = mutableLiterals(source);
      excludedSceneSize += tokenize(source).filter((t) => /^\d/.test(t.text)).length - literals.length;
      for (const lit of literals) {
        const to = String(Number(lit.text) + 2);
        const mutated = source.slice(0, lit.offset) + to + source.slice(lit.offset + lit.text.length);
        const r = checkScene(brief, mutated);
        const failed = r.results.filter((c) => !c.pass);
        const outcome: MutantOutcome = !r.compiled
          ? "notCompiling"
          : failed.some((c) => c.tag !== "brief")
            ? "killed"
            : failed.length > 0
              ? "briefOnly"
              : "survived";
        counts[outcome]++;
        const where: MutantSite = { scene: f, line: lit.line, column: lit.column, from: lit.text, to };
        if (outcome === "survived") survivors.push(where);
        if (outcome === "briefOnly") briefOnly.push(where);
        if (outcome === "notCompiling") notCompiling.push(where);
      }
    }
    const mutants = counts.killed + counts.briefOnly + counts.notCompiling + counts.survived;
    mutationSweep = {
      mutation: "one numeric literal raised by 2; the scene's own size is not mutated",
      excludedSceneSizeLiterals: excludedSceneSize,
      mutants,
      ...counts,
      survivors,
      briefOnlyMutants: briefOnly,
      notCompilingMutants: notCompiling,
    };
    expect(mutants).toBeGreaterThan(0);
  });
});
