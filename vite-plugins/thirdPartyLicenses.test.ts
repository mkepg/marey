import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  byFamily,
  fontNotice,
  isLicenseFile,
  packageDirOf,
  packageNotice,
  readFontNames,
  renderNotices,
  sourceLocations,
  suppliedLicensePath,
  type FontNotice,
} from "./thirdPartyLicenses";

describe("packageDirOf", () => {
  it("finds the package a module came from, on either path style", () => {
    expect(packageDirOf("/app/node_modules/pixi.js/lib/index.mjs")).toBe("/app/node_modules/pixi.js");
    expect(packageDirOf("C:\\app\\node_modules\\pixi.js\\lib\\index.mjs")).toBe("C:/app/node_modules/pixi.js");
  });

  it("keeps a scope with its package name", () => {
    expect(packageDirOf("/app/node_modules/@pixi/colord/index.mjs")).toBe("/app/node_modules/@pixi/colord");
  });

  it("takes the innermost package when node_modules nests", () => {
    expect(packageDirOf("/app/node_modules/a/node_modules/b/x.js")).toBe("/app/node_modules/a/node_modules/b");
  });

  it("ignores a virtual-module prefix and a query suffix", () => {
    expect(packageDirOf("\0/app/node_modules/monaco-editor/x.css?inline")).toBe("/app/node_modules/monaco-editor");
  });

  it("returns null for the app's own code and for synthesised modules", () => {
    expect(packageDirOf("/app/src/main.tsx")).toBeNull();
    expect(packageDirOf("\0vite/preload-helper.js")).toBeNull();
  });
});

describe("sourceLocations", () => {
  it("expands a GitHub shorthand and always adds the exact-version tarball", () => {
    expect(sourceLocations({ name: "@pixi/colord", version: "2.9.6", repository: "omgovich/colord" })).toEqual([
      "https://github.com/omgovich/colord",
      "https://registry.npmjs.org/@pixi/colord/-/colord-2.9.6.tgz",
    ]);
  });

  it("turns a git+https repository object into a browsable URL", () => {
    const [repo] = sourceLocations({
      name: "mediabunny",
      version: "1.58.0",
      repository: { url: "git+https://github.com/Vanilagy/mediabunny.git" },
    });
    expect(repo).toBe("https://github.com/Vanilagy/mediabunny");
  });

  it("falls back to the homepage when no repository is declared", () => {
    expect(sourceLocations({ name: "x", version: "1.0.0", homepage: "https://x.dev" })[0]).toBe("https://x.dev");
  });
});

describe("isLicenseFile", () => {
  it("accepts the names packages ship licence text under", () => {
    for (const f of ["LICENSE", "LICENSE.md", "licence.txt", "LICENSE-MIT", "COPYING", "NOTICE", "ThirdPartyNotices.txt"]) {
      expect(isLicenseFile(f), f).toBe(true);
    }
  });

  it("rejects files that only mention licences", () => {
    for (const f of ["package.json", "README.md", "licenses.json", "index.js"]) {
      expect(isLicenseFile(f), f).toBe(false);
    }
  });
});

describe("packageNotice", () => {
  const text = { file: "LICENSE", content: "MIT text" };

  it("refuses a package that declares no licence", () => {
    expect(packageNotice({ name: "x", version: "1.0.0" }, [text])).toMatch(/declares no licence/);
  });

  it("refuses a package that ships no licence text", () => {
    expect(packageNotice({ name: "x", version: "1.0.0", license: "MIT" }, [])).toMatch(/no LICENSE/);
  });

  it("reads a legacy `licenses` array", () => {
    const n = packageNotice({ name: "x", version: "1.0.0", licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }, [text]);
    expect(typeof n === "string" ? n : n.license).toBe("MIT OR Apache-2.0");
  });
});

describe("suppliedLicensePath", () => {
  it("maps a scoped name to a single file name", () => {
    expect(suppliedLicensePath("dir", "@pixi/colord").replace(/\\/g, "/")).toBe("dir/@pixi__colord.txt");
  });
});

describe("font metadata", () => {
  // The real shipped font, so a change to either the reader or the file shows.
  const names = readFontNames(readFileSync("public/fonts/JetBrainsMono-Regular.ttf"));

  it("reads copyright, licence and URLs from a shipped TrueType font", () => {
    expect(names.get(0)).toBe("Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)");
    expect(names.get(13)).toMatch(/SIL Open Font License, Version 1\.1/);
    expect(names.get(14)).toBe("https://scripts.sil.org/OFL");
  });

  it("takes the source from the URL in the copyright line", () => {
    const n = fontNotice("JetBrainsMono-Regular.ttf", names);
    expect(typeof n === "string" ? n : n.source).toBe("https://github.com/JetBrains/JetBrainsMono");
  });

  it("refuses a font with no copyright or licence metadata", () => {
    expect(fontNotice("bare.ttf", new Map([[1, "Bare"]]))).toMatch(/no copyright/);
  });

  it("merges files of one family into one entry", () => {
    const f = (file: string): FontNotice => ({
      family: "Syne", version: "2.2", files: [file], copyright: "c", license: "l", licenseUrl: "", source: "",
    });
    expect(byFamily([f("Syne-Regular.ttf"), f("Syne-Bold.ttf")])).toEqual([
      { ...f("Syne-Bold.ttf"), files: ["Syne-Bold.ttf", "Syne-Regular.ttf"] },
    ]);
  });
});

describe("renderNotices", () => {
  const out = renderNotices(
    [
      { name: "zeta", version: "1.0.0", license: "MIT", source: ["https://z", "https://t"], texts: [{ file: "LICENSE", content: "Z text\r\n" }] },
      { name: "alpha", version: "2.0.0", license: "MPL-2.0", source: ["https://a"], texts: [{ file: "LICENSE", content: "A text" }] },
    ],
    []
  );

  it("lists packages alphabetically with licence, every source location and the full text", () => {
    expect(out.indexOf("alpha 2.0.0")).toBeLessThan(out.indexOf("zeta 1.0.0"));
    expect(out).toContain("Licence: MPL-2.0\nSource:  https://a");
    expect(out).toContain("Source:  https://z\n         https://t");
    expect(out).toContain("--- LICENSE ---\n\nA text");
  });

  it("normalises CRLF licence files", () => {
    expect(out).not.toContain("\r");
  });
});
