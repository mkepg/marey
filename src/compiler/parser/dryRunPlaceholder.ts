import type { AstValue } from "../types";

// Parser-only side-channel state, mirroring cardinalityProvenance.ts's shape
// for an unrelated concern: `parseTemplate.ts`'s dry run binds every
// parameter to a fixed `{kind:"number", value:0}` placeholder so it can walk
// the template body once and catch genuine syntax defects before any real
// `use` expansion exists. `AstValue` is a discriminated union keyed by a
// literal `kind` field, so no single placeholder kind can satisfy both
// ordinary numeric parameter uses (arithmetic) and list-shaped ones
// (`generate`'s collection, indexing's base) — the placeholder's real kind is
// unknown until a real argument is substituted.
//
// This marks such a placeholder so the two call sites that would otherwise
// reject it outright (`parseGenerate`'s "requires a list" check and
// `parsePostfix`'s "only a list can be indexed" check) can instead synthesize
// a placeholder of the kind they need and keep walking, rather than failing
// template *definition* for a parameter shape that is perfectly valid once a
// real list argument arrives. Real `use` expansion (`parseUse.ts`) binds real
// evaluated arguments, never a dry-run placeholder, so this marker never
// reaches real expansion.
const dryRunPlaceholder = new WeakSet<AstValue>();

export function isDryRunPlaceholder(value: AstValue): boolean {
  return dryRunPlaceholder.has(value);
}

export function markDryRunPlaceholder<T extends AstValue>(value: T): T {
  dryRunPlaceholder.add(value);
  return value;
}

export function carryDryRunPlaceholder<T extends AstValue>(
  value: T,
  ...sources: readonly AstValue[]
): T {
  return sources.some(isDryRunPlaceholder) ? markDryRunPlaceholder(value) : value;
}
