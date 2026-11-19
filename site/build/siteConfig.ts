import type { LessonEntry, SiteConfig } from "./types";

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SECTIONS = ["learn", "guides", "reference", "gallery"] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Checks the parsed contents of `site/site.json`. `learn` holds
 * `{ slug, vocabulary }` objects; `guides`, `reference` and `gallery` hold
 * plain slugs. Every problem is reported rather than just the first.
 */
export function parseSiteConfig(
  json: unknown,
  file: string,
): { config: SiteConfig; errors: string[] } {
  const errors: string[] = [];
  const empty: SiteConfig = { learn: [], guides: [], reference: [], gallery: [] };
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { config: empty, errors: [`${file}:1: expected an object with ${SECTIONS.join(", ")}`] };
  }
  const obj = json as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!(SECTIONS as ReadonlyArray<string>).includes(key)) {
      errors.push(`${file}:1: unknown key "${key}"`);
    }
  }

  const learn: LessonEntry[] = [];
  const lessons = obj.learn;
  if (!Array.isArray(lessons)) {
    errors.push(`${file}:1: "learn" must be an array of { slug, vocabulary } objects`);
  } else {
    lessons.forEach((entry: unknown, i) => {
      const e = entry as Record<string, unknown> | null;
      if (
        typeof e !== "object" ||
        e === null ||
        typeof e.slug !== "string" ||
        !isStringArray(e.vocabulary)
      ) {
        errors.push(`${file}:1: learn[${i}] must be { "slug": string, "vocabulary": string[] }`);
        return;
      }
      learn.push({ slug: e.slug, vocabulary: e.vocabulary });
    });
  }

  const lists: Record<"guides" | "reference" | "gallery", string[]> = {
    guides: [],
    reference: [],
    gallery: [],
  };
  for (const key of ["guides", "reference", "gallery"] as const) {
    const value = obj[key];
    if (!isStringArray(value)) {
      errors.push(`${file}:1: "${key}" must be an array of slugs`);
    } else {
      lists[key] = value;
    }
  }

  return { config: { learn, ...lists }, errors };
}
