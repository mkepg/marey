# Lexer, parser, and metaprogramming

- **`lexer/`** — tokens. Note `constants.ts`: `NAMED_COLORS` (red, cyan,
  magenta…) lex as their own token type, so **they cannot be used as
  identifiers** — `let cyan = ...` is a parse error.
- **`parser/`** — hand-written recursive descent with error recovery
  (`state.synchronize()`), so one bad block does not abort the whole file.
  `parseGenerate` and `parseUse` implement metaprogramming by **rewinding
  `state.pos` and re-parsing the same token range** with a new environment.
- **`typeChecker/`** — `validator.ts` produces coded, positioned errors with
  hints; `builder.ts` produces the Scene IR.

## Metaprogramming

`let name = value` (lexically scoped, immutable, shadowable),
`generate value, index in LIST { }` (loop; generated names get the 0-based ordinal suffixed),
`template Name(params) { }` + `use Name(args) instance { }` (parametric macros
with cycle detection). Template arguments carry **any** value kind, including
keywords — `use Racer(easeInOut) row { }` passes an easing.

Phase 3A renamed the surface vocabulary to its final spelling with no
compatibility aliases: `def` → `let`, `handOff` → `handoff`, `sceneFit` → `fit`,
`z` → `layer`. The old spellings are rejected at parse time with a named error
(`PARSE_RENAMED_KEYWORD`, `PARSE_RENAMED_PROPERTY` in
`parser/parseProperty.ts`) that names the replacement, driven by
`LEGACY_SOURCE_FORMS` in `languageContract.ts` — they are not silently
accepted or silently dropped.

## Non-obvious gotchas

- **`physics` inside a group is only legal under a *static* group** (D17,
  full detail in the renderer rule). Two validator rules enforce it —
  `TYPE_PHYSICS_IN_PHYSICS_GROUP` and `TYPE_PHYSICS_IN_ANIMATED_GROUP`. A
  `use` expansion wraps its template in a group, so this is also what decides
  whether a template may carry physics.
- **AST names are deterministic, not `Math.random()`-generated.** `animate`,
  `physics`, `sequence`, and `parallel` nodes are named from their own
  `line`/`col` (e.g. `animate_12_4` in `parser/parseObject.ts`), not a random
  suffix. The pin is `src/compiler/determinism.test.ts`'s repeat-compile
  test (`determinism.test.ts:146-159`): it parses the same source 20 times
  and requires every parse result to be deep-equal to the first, so a
  regression to random naming fails it immediately. The committed Scene IR
  snapshots in that same file do **not** pin this — `IRAnimation`/`IRPhysics`
  carry no `name` field, so `animate`/`physics` node names never reach the
  IR and the snapshots pass no matter how those nodes are named.
- **Every expression is folded to a literal at parse time, so no expression
  reaches the Scene IR.** `parseExpr` returns an `AstValue`
  (`parser/parseExpr.ts:1023`) — a literal union, not a node — so a list, an
  index, a comparison, a conditional, or a `sin`/`cos` call is gone by the time
  the type checker runs. `sceneIR.ts`'s only list type is `IRPointList`
  (`sceneIR.ts:28`), reachable through `polygon.points` and `line.points` and
  nothing else. This is why Phase 3B added a whole expression layer without
  touching `sceneIR.ts`, and why a committed IR golden is a real assertion
  about arithmetic rather than about the grammar. Do not add an IR node for an
  operator; if a construct cannot be evaluated during parsing, it does not fit
  the language as it currently works.
- **`sin`/`cos` are exact at the four cardinal angles on purpose, not by
  accident.** `sinDegrees` (`parser/parseExpr.ts:692`) reduces the angle modulo
  360 and returns `0`/`1`/`0`/`-1` outright at 0/90/180/270 instead of calling
  `Math.sin`, because `Math.sin(Math.PI)` is `1.2246e-16`, not `0`. Under a
  plain radian conversion **three of the four axis dots** in a radial layout
  miss their axis — `Math.cos(π/2)` is `6.12e-17`, `Math.sin(π)` is
  `1.22e-16`, `Math.cos(3π/2)` is `-1.84e-16`; only the 0° dot is exact in both
  coordinates — and that noise reaches a committed IR golden as a permanent
  eyesore rather than a rounding error wherever the centre offset is small
  enough not to round it away. Its own doc comment
  records the trade-off, including the cost: *off* the cardinal angles the
  reduction is slightly **less** accurate than a plain conversion —
  `sinDegrees(-30)` is `-0.5000000000000004` against `Math.sin(-30 * Math.PI /
  180)`'s `-0.49999999999999994` — because the two feed a different `d` into
  the same `Math.sin`. The pin for the exactness is the `it.each` table
  `"evaluates %s in degrees"` (`parser/parseExpr.test.ts:1132-1137`), whose
  `toMatchObject` compares primitives by exact equality: delete the four
  early-return lines and `sin(180)` and `cos(90)` go red, along with the
  `sin(-180)` row of `"reduces angles outside 0-360 before the cardinal check"`
  (`:1161`). **Nothing else in the suite catches it** — that mutation was run:
  3 failed / 599 passed, and `determinism.test.ts` stayed **6/6, including the
  Phase 3B IR golden**. In particular `determinism.test.ts`'s "places twelve
  dots on a circle of radius 180" does *not* pin cardinal exactness: at radius
  180 about (400, 300) the mutation moves nothing at all — all twelve `(x, y)`
  pairs are bit-identical either way, because `180 × 1.2246e-16` is under half
  a ULP of a coordinate near 300 — and its `toBeCloseTo(…, 9)` tolerance
  (5e-10) is four orders of magnitude past that noise regardless. What that
  test does pin is the *sign* of the fallback, and only through its *per-index*
  assertion; the distance-from-centre and distinct-point checks survive a sign
  error, because negating the fallback reflects a 30°-spaced sample onto
  itself.
