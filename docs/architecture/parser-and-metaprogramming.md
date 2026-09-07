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
  `Math.sin`, because `Math.sin(Math.PI)` is `1.2246e-16`, not `0` — a plain
  radian conversion never lands a dot in a radial layout exactly on its axis,
  and bakes that noise into the committed IR goldens, where it is a permanent
  eyesore rather than a rounding error. Its own doc comment
  records the trade-off, including the cost: *off* the cardinal angles the
  reduction is slightly **less** accurate than a plain conversion —
  `sinDegrees(-30)` is `-0.5000000000000004` against `Math.sin(-30 * Math.PI /
  180)`'s `-0.49999999999999994` — because the two feed a different `d` into
  the same `Math.sin`. The regression test is
  `determinism.test.ts`'s "places twelve dots on a circle of radius 180" —
  and note that only its *per-index* assertion discriminates a sign error;
  the distance-from-centre and distinct-point checks survive one, because
  negating the fallback reflects a 30°-spaced sample onto itself.
