import type { AstValue } from "../types";

// Parser-only side-channel state: provenance must guide validation without
// becoming part of the public AST or any raw/JSON serialization of it.
const predicateDerivedCardinality = new WeakSet<AstValue>();

export function hasPredicateDerivedCardinality(value: AstValue): boolean {
  return predicateDerivedCardinality.has(value);
}

export function markPredicateDerivedCardinality<T extends AstValue>(value: T): T {
  predicateDerivedCardinality.add(value);
  return value;
}

export function carryPredicateDerivedCardinality<T extends AstValue>(
  value: T,
  ...sources: readonly AstValue[]
): T {
  return sources.some(hasPredicateDerivedCardinality)
    ? markPredicateDerivedCardinality(value)
    : value;
}
