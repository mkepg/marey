import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import {
  ANIMATABLE_PROPERTIES,
  KIND_LABEL,
  LANGUAGE_CONTRACT,
  LIST_ELEMENT_NOUN_PLURAL,
  type ContractDefault,
  type LocalConstraint,
  type PropertySpec,
  type ValueKind,
} from "../../src/compiler/languageContract";

/** Where a repository link that is not a rendered document points. */
export const REPO_BLOB = "https://github.com/mkepg/marey/blob/main/";

/** Repository documents the site renders, and the page each becomes. */
const RENDERED_DOCUMENTS: Readonly<Record<string, string>> = {
  "docs/LANGUAGE.md": "/reference/language/",
  "docs/determinism.md": "/reference/determinism/",
};

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Rewrites a link written in a repository document so it works on the site.
 * Links to a document the site renders become that page; links to any other
 * repository file become the file on GitHub. Absolute URLs, root-relative
 * paths and bare fragments are left alone.
 */
export function rewriteRepoLink(href: string, fromFile: string): string {
  if (href === "" || href.startsWith("#") || href.startsWith("/") || ABSOLUTE.test(href)) return href;
  const hashAt = href.indexOf("#");
  const path = hashAt < 0 ? href : href.slice(0, hashAt);
  const fragment = hashAt < 0 ? "" : href.slice(hashAt);
  const target = posix.normalize(posix.join(posix.dirname(fromFile), path));
  if (target.startsWith("..")) return href;
  return (RENDERED_DOCUMENTS[target] ?? REPO_BLOB + target) + fragment;
}

// ------------------------------------------------------------- property tables

const KIND_ORDER = Object.keys(LANGUAGE_CONTRACT) as Array<keyof typeof LANGUAGE_CONTRACT>;

/** Block kinds whose objects `animate` can target. */
const ANIMATABLE_OWNERS: ReadonlySet<string> = new Set(["circle", "rectangle", "polygon", "line", "text", "group"]);

function formatDefault(value: ContractDefault, spec: PropertySpec): string {
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "object") {
    const p = value as { x: number; y: number };
    return `(${p.x}, ${p.y})`;
  }
  if (typeof value === "string" && spec.kinds === "string") return JSON.stringify(value);
  return String(value);
}

function describeConstraint(c: LocalConstraint | undefined): string {
  if (!c) return "";
  switch (c.kind) {
    case "range":
      return `${c.min} to ${c.max} inclusive`;
    case "positive":
      return "greater than 0";
    case "nonNegative":
      return "0 or more";
    case "positivePoint":
      return "both numbers greater than 0";
    case "nonNegativeScale":
      return "a number or point of 0 or more; zero is rejected on an object that takes part in physics";
    case "maxLength":
      return `at most ${c.max} characters`;
    case "listOf":
      return `${c.min} to ${c.max} ${LIST_ELEMENT_NOUN_PLURAL[c.element]}`;
  }
}

/** The "required, or default" cell as Markdown. */
function describeNeed(spec: PropertySpec): string {
  if (spec.required) return "required";
  if (spec.default !== undefined) return codeCell(formatDefault(spec.default, spec));
  if (spec.derivedDefault === "polygonMinPoint") {
    return cell("the smallest x and smallest y among the points");
  }
  if (spec.absentMeans === "indefinite") {
    return cell("none: omit it and the scene runs indefinitely");
  }
  if (spec.absentMeans === "physicsGravity") {
    return cell("none: omit it and each physics block keeps its own gravity");
  }
  return "none";
}

function isAnimatable(kind: string, name: string): boolean {
  if (!ANIMATABLE_OWNERS.has(kind)) return false;
  return (ANIMATABLE_PROPERTIES as ReadonlyArray<string>).includes(name);
}

/** Escapes text that goes into a Markdown table cell. */
function cell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([`*_|<>[\]])/g, "\\$1")
    .replace(/\s*\n\s*/g, " ");
}

function codeCell(text: string): string {
  return `\`${text.replace(/\|/g, "\\|")}\``;
}

/**
 * The property reference as Markdown: one table per block kind that has
 * properties, one row per property, read from `LANGUAGE_CONTRACT`. A property
 * added to the contract appears here with no edit.
 */
export function propertiesMarkdown(): string {
  const out: string[] = [
    "This page is generated from the compiler's property contract, the same table the type checker, the editor's completions and its hovers read. A property added to the language appears here when the site is built.",
    "",
    "`color` is animatable on every shape that has one. A `group` has no `color`, so it has no row for it.",
    "",
  ];
  for (const kind of KIND_ORDER) {
    const entries = Object.entries<PropertySpec>(LANGUAGE_CONTRACT[kind].properties);
    if (entries.length === 0) continue;
    out.push(`## \`${kind}\``, "");
    out.push("| Property | Value | Required, or default | Constraint | Animatable | Meaning |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const [name, spec] of entries) {
      const kinds: ReadonlyArray<ValueKind> = typeof spec.kinds === "string" ? [spec.kinds] : spec.kinds;
      const value = kinds.map((k) => KIND_LABEL[k]).join(" or ");
      const meaning = `${cell(spec.description)} Example: ${codeCell(spec.example)}`;
      out.push(
        `| \`${name}\` | ${cell(value)} | ${describeNeed(spec)} | ${cell(describeConstraint(spec.constraint))} | ${isAnimatable(kind, name) ? "yes" : "no"} | ${meaning} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}

// ------------------------------------------------------------------- the pages

export interface ReferenceSource {
  readonly file: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
  /** Markdown shown above the body, rendered separately from it. */
  readonly banner: string;
  readonly bodyLine: number;
  /** When set, the body's links are rewritten as if written in this repository file. */
  readonly linksFrom: string | null;
}

const BANNER = ":::note\nFormal reference. New to Marey? Start with the [course](/learn/).\n:::\n";

/** Drops the document's own title line: the page title is the only h1. Keeps the line count. */
function withoutTitle(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.startsWith("# ")) lines[0] = "";
  return lines.join("\n");
}

const DOCUMENT_PAGES: Readonly<Record<string, { file: string; title: string; description: string; banner: string }>> = {
  language: {
    file: "docs/LANGUAGE.md",
    title: "The Marey language",
    description: "The formal reference for Marey: what each construct does, in what units, and what happens at its edges.",
    banner: BANNER,
  },
  determinism: {
    file: "docs/determinism.md",
    title: "Determinism in Marey",
    description: "Why a Marey scene replays identically, how that is checked, and the one place it is not guaranteed.",
    banner: "",
  },
};

/** Reads a reference page's source, or reports why it cannot. */
export function loadReference(repoRoot: string, slug: string, errors: string[]): ReferenceSource | null {
  if (slug === "properties") {
    return {
      file: "site/build/reference.ts",
      title: "Properties",
      description: "Every property of every object kind, with its value, default, constraint and whether it can be animated.",
      body: propertiesMarkdown(),
      banner: "",
      bodyLine: 1,
      linksFrom: null,
    };
  }
  const doc = DOCUMENT_PAGES[slug];
  if (!doc) {
    errors.push(`site/site.json:1: reference page "${slug}" has no source; the reference pages are language, properties and determinism`);
    return null;
  }
  const path = `${repoRoot}/${doc.file}`;
  if (!existsSync(path)) {
    errors.push(`${doc.file}:1: the reference page is listed but its file does not exist`);
    return null;
  }
  return { ...doc, body: withoutTitle(readFileSync(path, "utf8")), bodyLine: 1, linksFrom: doc.file };
}
