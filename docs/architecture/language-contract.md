# The language contract

**One property contract, not four hand-synced lists.** Every object and
block's properties — kind, required-ness, default, local constraint,
description, example, and Monaco placeholder — are declared exactly once,
in `LANGUAGE_CONTRACT` in `src/compiler/languageContract.ts`. The type
checker's `PROP_TYPES`/`REQUIRED_PROPS`/`RESERVED_PROPERTY_NAMES`
(`typeChecker/validator.ts`, `parser/parseObject.ts`), the Monaco hovers and
snippets (`components/Editor/MonacoEditor/constants.ts`), and the editor
completions (`language.ts`) all derive from that one contract at import
time rather than maintaining their own copies — see `languageContract.ts`
and `languageContract.test.ts`. This replaced an earlier scheme (pre-Phase
3A) where those four call sites each held an independent, hand-written copy
and had already drifted — `RESERVED_PROPS` reserved `anchor`, `width`, and
`height`, none of which exist as properties. Adding a property today means
editing `LANGUAGE_CONTRACT` once; every consumer picks it up automatically.

**`airDrag` is inverted**: `0.0` = vacuum, `1.0` = maximum resistance, and
the property **defaults** to `0` (a vacuum). The Monaco `physics` snippet's
`airDrag` placeholder is a separate field — read from that property's
`placeholder` in `languageContract.ts` (`0.006`, a realistic light drag,
not the default) by `constants.ts`'s `propertyPlaceholder` — so the snippet
cannot regress to the pre-inversion `0.99` placeholder; `constants.test.ts`
pins that.
