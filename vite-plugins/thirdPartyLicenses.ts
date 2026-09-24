import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { Plugin } from "vite";

/**
 * Writes `third-party-licenses.txt` into the production build: every npm
 * package whose code ended up in the shipped bundle, and every font served
 * from `public/`, with its licence, where to get its source, and the full
 * licence text the package or font ships with.
 *
 * It walks the modules the bundler actually emitted rather than reading
 * `package.json`, so it lists what ships — including transitive packages
 * such as pixi.js's `earcut` — and nothing that does not. The export
 * pipeline's lazy chunk counts, because it is a chunk of the same bundle.
 *
 * **The build fails** if a shipped package has no licence field or no
 * licence file, or a font carries no copyright and licence metadata. A
 * notices file that silently skips what it cannot attribute would look
 * complete and not be.
 *
 * Not covered: modules the bundler synthesises itself (Vite's preload
 * helper and the like, which live under no `node_modules` package), and
 * the Monaco editor worker, which is built in a separate pass this hook does
 * not see. Every module in that worker comes from `monaco-editor`, which the
 * main bundle also ships and this file therefore lists.
 */
export const LICENSES_FILE = "third-party-licenses.txt";

export interface LicenseText {
  readonly file: string;
  readonly content: string;
}

export interface PackageNotice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly source: readonly string[];
  readonly texts: readonly LicenseText[];
}

export interface FontNotice {
  readonly family: string;
  readonly version: string;
  readonly files: readonly string[];
  readonly copyright: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly source: string;
}

/** The directory of the npm package a bundled module came from, or null. */
export function packageDirOf(moduleId: string): string | null {
  const id = moduleId.replace(/^\0/, "").split("?")[0].replace(/\\/g, "/");
  const marker = "/node_modules/";
  const at = id.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = id.slice(at + marker.length).split("/");
  const nameParts = parts[0].startsWith("@") ? 2 : 1;
  if (parts.length < nameParts || parts.slice(0, nameParts).some((p) => p === "")) return null;
  return id.slice(0, at + marker.length) + parts.slice(0, nameParts).join("/");
}

interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly license?: string | { readonly type?: string };
  readonly licenses?: readonly { readonly type?: string }[];
  readonly repository?: string | { readonly url?: string };
  readonly homepage?: string;
}

/**
 * Where a recipient can get this exact package's source: its repository if
 * it declares one (else its homepage), and always the registry tarball for
 * the exact version shipped — MPL-2.0 §3.2 asks for exactly this.
 */
export function sourceLocations(pkg: PackageJson & { name: string; version: string }): string[] {
  const out: string[] = [];
  const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (raw) {
    const shorthand = /^(?:github:)?([\w.-]+)\/([\w.-]+)$/.exec(raw);
    out.push(
      shorthand
        ? `https://github.com/${shorthand[1]}/${shorthand[2]}`
        : raw.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/^ssh:\/\/git@/, "https://").replace(/\.git$/, "")
    );
  } else if (pkg.homepage) {
    out.push(pkg.homepage);
  }
  const unscoped = pkg.name.includes("/") ? pkg.name.split("/")[1] : pkg.name;
  out.push(`https://registry.npmjs.org/${pkg.name}/-/${unscoped}-${pkg.version}.tgz`);
  return out;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-._][\w.-]+)?$|^third[-_]?party[-_]?notices(\.[a-z]+)?$/i;

/** The files in a package directory that carry its licence text. */
export function isLicenseFile(file: string): boolean {
  return LICENSE_FILE.test(file);
}

/** A notice for one package, or a sentence saying why it cannot have one. */
export function packageNotice(pkg: PackageJson, texts: readonly LicenseText[]): PackageNotice | string {
  const where = pkg.name ?? "(unnamed package)";
  if (!pkg.name || !pkg.version) return `${where}: package.json has no name or version`;
  const license =
    typeof pkg.license === "string"
      ? pkg.license
      : pkg.license?.type ?? pkg.licenses?.map((l) => l.type).filter(Boolean).join(" OR ");
  if (!license) return `${where}@${pkg.version}: package.json declares no licence`;
  if (texts.length === 0) return `${where}@${pkg.version}: no LICENSE, COPYING or NOTICE file in the package`;
  return {
    name: pkg.name,
    version: pkg.version,
    license,
    source: sourceLocations({ ...pkg, name: pkg.name, version: pkg.version }),
    texts: [...texts].sort((a, b) => a.file.localeCompare(b.file)),
  };
}

/**
 * The strings in an OpenType/TrueType `name` table, by name ID. Only
 * Windows/Unicode (UTF-16BE) and Macintosh Roman records are decoded; the
 * first record for each ID wins.
 */
export function readFontNames(font: Uint8Array): Map<number, string> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = view.getUint16(4);
  let nameAt = -1;
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(font[rec], font[rec + 1], font[rec + 2], font[rec + 3]);
    if (tag === "name") nameAt = view.getUint32(rec + 8);
  }
  const names = new Map<number, string>();
  if (nameAt < 0) return names;
  const count = view.getUint16(nameAt + 2);
  const strings = nameAt + view.getUint16(nameAt + 4);
  for (let i = 0; i < count; i++) {
    const rec = nameAt + 6 + i * 12;
    const platform = view.getUint16(rec);
    const id = view.getUint16(rec + 6);
    const length = view.getUint16(rec + 8);
    const start = strings + view.getUint16(rec + 10);
    if (names.has(id)) continue;
    if (platform === 0 || platform === 3) {
      let s = "";
      for (let j = 0; j + 1 < length; j += 2) s += String.fromCharCode(view.getUint16(start + j));
      names.set(id, s);
    } else if (platform === 1) {
      names.set(id, String.fromCharCode(...font.subarray(start, start + length)));
    }
  }
  return names;
}

/** A notice for one font file, or a sentence saying why it cannot have one. */
export function fontNotice(file: string, names: Map<number, string>): FontNotice | string {
  const copyright = names.get(0);
  const license = names.get(13);
  if (!copyright || !license) return `${file}: font has no copyright (name ID 0) or licence (name ID 13) metadata`;
  const inCopyright = /\((https?:\/\/[^)\s]+)\)/.exec(copyright)?.[1];
  return {
    family: names.get(1) ?? file,
    version: names.get(5) ?? "",
    files: [file],
    copyright,
    license,
    licenseUrl: names.get(14) ?? "",
    source: inCopyright ?? names.get(11) ?? "",
  };
}

/** Merge per-file font notices into one notice per family. */
export function byFamily(fonts: readonly FontNotice[]): FontNotice[] {
  const families = new Map<string, FontNotice>();
  for (const f of fonts) {
    const seen = families.get(f.family);
    families.set(f.family, seen ? { ...seen, files: [...seen.files, ...f.files].sort() } : f);
  }
  return [...families.values()].sort((a, b) => a.family.localeCompare(b.family));
}

const RULE = "-".repeat(72);

export function renderNotices(packages: readonly PackageNotice[], fonts: readonly FontNotice[]): string {
  const pkgs = [...packages].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const lines: string[] = [
    "Third-party software shipped with Marey",
    "=======================================",
    "",
    "The Marey web app contains the third-party software listed below, each",
    "under its own licence. This file is generated at build time from the",
    "modules that ended up in the shipped bundle and the fonts it serves, so",
    "it lists what actually ships.",
    "",
    "Contents",
    "",
    ...pkgs.map((p) => `  ${p.name} ${p.version} (${p.license})`),
    ...fonts.map((f) => `  ${f.family} font${f.version ? `, ${f.version}` : ""}`),
    "",
  ];
  for (const p of pkgs) {
    lines.push(RULE, `${p.name} ${p.version}`, `Licence: ${p.license}`, `Source:  ${p.source[0]}`);
    for (const s of p.source.slice(1)) lines.push(`         ${s}`);
    for (const t of p.texts) lines.push("", `--- ${t.file} ---`, "", t.content.replace(/\r\n/g, "\n").trimEnd());
    lines.push("");
  }
  for (const f of fonts) {
    lines.push(
      RULE,
      `${f.family} font${f.version ? ` (${f.version})` : ""}`,
      `Files:   ${f.files.join(", ")}`,
      `Source:  ${f.source}`,
      "",
      f.copyright,
      "",
      f.license,
      ...(f.licenseUrl ? ["", `Licence text: ${f.licenseUrl}`] : []),
      ""
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Where a checked-in licence text for a package that ships none lives:
 * `vite-plugins/licenses/<name, with "/" as "__">.txt`. Each such file says
 * in its own first lines where its text came from. It is used only when the
 * package itself ships no licence file, so a later release that adds one
 * takes over without anyone having to remember to delete the supplement.
 */
export function suppliedLicensePath(suppliedDir: string, packageName: string): string {
  return join(suppliedDir, `${packageName.replace("/", "__")}.txt`);
}

function readPackage(dir: string, suppliedDir: string): PackageNotice | string {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
  let texts: LicenseText[] = readdirSync(dir)
    .filter((f) => isLicenseFile(f) && statSync(join(dir, f)).isFile())
    .map((f) => ({ file: f, content: readFileSync(join(dir, f), "utf8") }));
  const supplied = pkg.name ? suppliedLicensePath(suppliedDir, pkg.name) : "";
  if (texts.length === 0 && supplied && existsSync(supplied)) {
    texts = [{ file: "licence supplied by Marey (the package ships none)", content: readFileSync(supplied, "utf8") }];
  }
  return packageNotice(pkg, texts);
}

const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function readFonts(publicDir: string): { notices: FontNotice[]; problems: string[] } {
  const notices: FontNotice[] = [];
  const problems: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (statSync(path).isDirectory()) walk(path, relPath);
      else if (FONT_EXT.has(extname(entry).toLowerCase())) {
        if (![".ttf", ".otf"].includes(extname(entry).toLowerCase())) {
          problems.push(`${relPath}: only .ttf and .otf fonts can be read for licence metadata`);
          continue;
        }
        const notice = fontNotice(basename(entry), readFontNames(readFileSync(path)));
        if (typeof notice === "string") problems.push(notice);
        else notices.push(notice);
      }
    }
  };
  if (existsSync(publicDir)) walk(publicDir, "");
  return { notices: byFamily(notices), problems };
}

export function thirdPartyLicenses(): Plugin[] {
  let publicDir = "";
  let suppliedDir = "";
  return [
    {
      name: "marey:third-party-licenses",
      apply: "build",
      configResolved(config) {
        publicDir = config.publicDir;
        // From the project root, not `import.meta.url`: Vite bundles its
        // config into `node_modules/.vite-temp/` before running it.
        suppliedDir = join(config.root, "vite-plugins", "licenses");
      },
      generateBundle(_options, bundle) {
        const dirs = new Set<string>();
        for (const output of Object.values(bundle)) {
          if (output.type !== "chunk") continue;
          for (const id of Object.keys(output.modules)) {
            const dir = packageDirOf(id);
            if (dir) dirs.add(dir);
          }
        }
        // This app bundles pixi.js, preact and Monaco, so finding no package
        // at all means the module ids stopped looking the way `packageDirOf`
        // expects (a bundler upgrade, say) — not that nothing ships.
        if (dirs.size === 0) {
          this.error(`Cannot write ${LICENSES_FILE}: no bundled module came from a node_modules package, so the module ids were not recognised`);
        }
        const packages: PackageNotice[] = [];
        const problems: string[] = [];
        for (const dir of dirs) {
          const notice = readPackage(dir, suppliedDir);
          if (typeof notice === "string") problems.push(notice);
          else packages.push(notice);
        }
        const fonts = readFonts(publicDir);
        problems.push(...fonts.problems);
        if (problems.length > 0) {
          this.error(`Cannot write ${LICENSES_FILE}:\n  ${problems.sort().join("\n  ")}`);
        }
        this.emitFile({ type: "asset", fileName: LICENSES_FILE, source: renderNotices(packages, fonts.notices) });
      },
    },
    {
      // The file only exists in a build; say so rather than 404 in dev.
      name: "marey:third-party-licenses-dev",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(`/${LICENSES_FILE}`, (_req, res) => {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(`${LICENSES_FILE} is generated by \`npm run build\` from the modules in the production bundle.\n`);
        });
      },
    },
  ];
}
