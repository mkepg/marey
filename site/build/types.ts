export type Section = "learn" | "guides" | "gallery" | "reference" | "root";

export interface Heading {
  readonly depth: 2 | 3;
  readonly text: string;
  readonly id: string;
}

export interface SitePage {
  /** The page's address, for example "/learn/animate/". */
  readonly url: string;
  /** Where the page lands in the build output, for example "learn/animate/index.html". */
  readonly outFile: string;
  readonly section: Section;
  readonly title: string;
  readonly description: string;
  /** The complete document. */
  readonly html: string;
  readonly headings: ReadonlyArray<Heading>;
  /** Plain text for search. */
  readonly text: string;
  readonly links: ReadonlyArray<{
    readonly href: string;
    readonly line: number;
    readonly file: string;
  }>;
}

export interface BuiltSite {
  readonly pages: ReadonlyArray<SitePage>;
  /** Each entry reads "file:line: message". */
  readonly errors: ReadonlyArray<string>;
  readonly sitemap: string;
  /** JSON. */
  readonly searchIndex: string;
}

export interface LessonEntry {
  readonly slug: string;
  /** The words this lesson introduces, checked against its showcase. */
  readonly vocabulary: ReadonlyArray<string>;
}

/** The parsed `site/site.json`: the order of every section's pages. */
export interface SiteConfig {
  readonly learn: ReadonlyArray<LessonEntry>;
  readonly guides: ReadonlyArray<string>;
  readonly reference: ReadonlyArray<string>;
  readonly gallery: ReadonlyArray<string>;
}
