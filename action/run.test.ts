import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { escapeData as cliData, escapeProperty as cliProp } from "../src/cli/check";
// @ts-expect-error plain ESM without type declarations
import { countErrors, escapeData, escapeProperty, exportCwd, main, parseFiles, parseFormats } from "./run.mjs";

describe("parsing helpers", () => {
  it("parseFiles defaults and splits on whitespace", () => {
    expect(parseFiles("")).toEqual(["*.marey"]);
    expect(parseFiles(" a.marey\n scenes/*.marey ")).toEqual(["a.marey", "scenes/*.marey"]);
  });

  it("parseFormats dedupes, splits on commas and spaces, and reports unknowns", () => {
    expect(parseFormats("apng, lottie apng")).toEqual({ formats: ["apng", "lottie"], unknown: [] });
    expect(parseFormats("gif").unknown).toEqual(["gif"]);
    expect(parseFormats("").formats).toEqual([]);
  });

  it("exportCwd mirrors the scene's directory", () => {
    expect(exportCwd("marey-export", "scenes/a/logo.marey")).toBe(join("marey-export", "scenes", "a"));
    expect(exportCwd("marey-export", "hello.marey")).toBe("marey-export");
  });

  it("countErrors counts ::error lines", () => {
    expect(countErrors("a: ok\n::error file=b::x\n::error file=c::y\n")).toBe(2);
  });

  it("escapes identically to the CLI's copies", () => {
    for (const s of ["", "plain", "100%", "a\r\nb", "x:y,z", "%0A literal"]) {
      expect(escapeData(s)).toBe(cliData(s));
      expect(escapeProperty(s)).toBe(cliProp(s));
    }
  });
});

const STUB = `
import { appendFileSync } from "node:fs";
const argv = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, JSON.stringify({ argv, cwd: process.cwd() }) + "\\n");
if (argv[0] === "check") {
  const files = argv.filter((a) => a.endsWith(".marey"));
  let bad = false;
  for (const f of files) {
    if (f.endsWith("bad.marey")) { bad = true; console.log("::error file=" + f + ",line=1,col=1,title=marey check::boom"); }
    else console.log(f + ": ok");
  }
  process.exit(bad ? 1 : 0);
}
if (argv[0] === "export") {
  if (argv[1].endsWith("noexport.marey")) { console.error("cannot export"); process.exit(1); }
  console.log("wrote x");
}
`;

describe("main (end to end)", () => {
  let tmp: string;
  let log: string[];
  let env: Record<string, string>;

  const real = (p: string) => realpathSync.native(p);
  const calls = () =>
    readFileSync(env.STUB_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { argv: string[]; cwd: string });
  const outputs = () => {
    const out: Record<string, string> = {};
    for (const line of readFileSync(env.GITHUB_OUTPUT, "utf8").split("\n").filter(Boolean)) {
      const i = line.indexOf("=");
      out[line.slice(0, i)] = line.slice(i + 1);
    }
    return out;
  };
  const setup = (files: string[]) => {
    for (const f of files) {
      const p = join(tmp, f);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, "scene\n");
    }
    spawnSync("git", ["init", "-q"], { cwd: tmp });
    spawnSync("git", ["add", ...files], { cwd: tmp });
  };

  beforeEach(() => {
    tmp = real(mkdtempSync(join(tmpdir(), "marey-action-")));
    log = [];
    writeFileSync(join(tmp, "stub-cli.mjs"), STUB);
    writeFileSync(join(tmp, "stub.log"), "");
    writeFileSync(join(tmp, "gh-output"), "");
    env = {
      MAREY_CLI: join(tmp, "stub-cli.mjs"),
      STUB_LOG: join(tmp, "stub.log"),
      GITHUB_OUTPUT: join(tmp, "gh-output"),
    };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("checks only when no export is requested", async () => {
    setup(["a.marey", "scenes/b.marey"]);
    const code = await main([], { ...env, INPUT_FILES: "a.marey scenes/b.marey", INPUT_EXPORT: "" }, tmp, (s: string) => log.push(s));
    expect(code).toBe(0);
    expect(outputs()).toEqual({ checked: "2", errors: "0", "export-dir": "" });
    const c = calls();
    expect(c).toHaveLength(1);
    expect(c[0].argv).toEqual(["check", "--reporter", "github", "a.marey", "scenes/b.marey"]);
  });

  it("stops before exporting when the check fails", async () => {
    setup(["a.marey", "bad.marey"]);
    const code = await main([], { ...env, INPUT_FILES: "*.marey", INPUT_EXPORT: "apng" }, tmp, (s: string) => log.push(s));
    expect(code).toBe(1);
    expect(outputs().errors).toBe("1");
    const c = calls();
    expect(c).toHaveLength(1);
    expect(c[0].argv[0]).toBe("check");
    expect(c[0].argv).toContain("--export-ready");
    expect(existsSync(join(tmp, "marey-export"))).toBe(false);
  });

  it("exports every scene in every format into a mirrored directory", async () => {
    setup(["a.marey", "scenes/b.marey"]);
    const code = await main(
      [],
      { ...env, INPUT_FILES: "a.marey scenes/b.marey", INPUT_EXPORT: "apng, lottie", INPUT_EXPORT_DIR: "out" },
      tmp,
      (s: string) => log.push(s),
    );
    expect(code).toBe(0);
    const exports = calls().filter((c) => c.argv[0] === "export");
    expect(exports).toHaveLength(4);
    for (const scene of ["a.marey", "scenes/b.marey"]) {
      const abs = resolve(tmp, scene);
      const wantCwd = scene === "a.marey" ? join(tmp, "out") : join(tmp, "out", "scenes");
      expect(existsSync(wantCwd)).toBe(true);
      for (const format of ["apng", "lottie"]) {
        const hit = exports.find((c) => c.argv[1] === abs && c.argv[3] === format);
        expect(hit).toBeDefined();
        expect(hit!.argv).toEqual(["export", abs, "--format", format]);
        expect(real(hit!.cwd)).toBe(real(wantCwd));
      }
    }
    expect(outputs()["export-dir"]).toBe("out");
  });

  it("carries on after an export failure and reports it", async () => {
    setup(["a.marey", "noexport.marey"]);
    const code = await main([], { ...env, INPUT_FILES: "*.marey", INPUT_EXPORT: "apng" }, tmp, (s: string) => log.push(s));
    expect(code).toBe(1);
    expect(outputs().errors).toBe("1");
    const exported = calls().filter((c) => c.argv[0] === "export").map((c) => c.argv[1]);
    expect(exported).toContain(resolve(tmp, "a.marey"));
    expect(log.some((l) => l.startsWith("::error file=noexport.marey,title=marey export::cannot export"))).toBe(true);
  });

  it("fails when no tracked file matches", async () => {
    setup(["a.marey"]);
    const code = await main([], { ...env, INPUT_FILES: "nothing/*.marey" }, tmp, (s: string) => log.push(s));
    expect(code).toBe(1);
    expect(log).toContain("::error title=marey check::No tracked file matches nothing/*.marey");
  });

  it("validate rejects unknown formats without calling the CLI", async () => {
    const code = await main(["validate"], { ...env, INPUT_EXPORT: "apng gif" }, tmp, (s: string) => log.push(s));
    expect(code).toBe(1);
    expect(log).toEqual(["::error title=marey action::Unknown export format 'gif'. Valid formats: png, apng, webm, mp4, lottie"]);
    expect(readFileSync(env.STUB_LOG, "utf8")).toBe("");
    expect(await main(["validate"], { ...env, INPUT_EXPORT: "apng" }, tmp, (s: string) => log.push(s))).toBe(0);
  });
});
