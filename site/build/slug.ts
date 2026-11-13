/**
 * Heading ids, by GitHub's rule: lower-case, drop everything except letters,
 * digits, spaces and hyphens, turn spaces into hyphens, and number repeats
 * `-1`, `-2`. `seen` holds the ids already given on one page.
 */
export function slugify(text: string, seen: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/ /g, "-");
  const count = seen.get(base);
  if (count === undefined) {
    seen.set(base, 0);
    return base;
  }
  let n = count + 1;
  let candidate = `${base}-${n}`;
  while (seen.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  seen.set(base, n);
  seen.set(candidate, 0);
  return candidate;
}
