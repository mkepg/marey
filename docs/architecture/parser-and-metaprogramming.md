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
- **`sin`/`cos` fold through `detMath`, exact at the cardinal angles and
  portable by construction.** The fold (`parser/parseExpr.ts:736`) calls `sinDeg`
  and `cosDeg` from `src/compiler/detMath.ts` (Phase 10A), which replaced the
  parser's own `sinDegrees` and its call to `Math.sin`. Two properties matter
  here, and the module's header and `firstOctant`'s comment record how each is
  reached:
  - *Exact where an author expects it.* The angle is reduced in degrees with
    `%` and folded by symmetry into [0°, 45°] with subtractions IEEE 754 does
    exactly, so a cardinal angle reaches the polynomial as exactly 0 and
    `sin(180)`, `cos(90)` and `cos(270)` are `0`, not float noise. A plain
    radian conversion leaves `Math.sin(Math.PI)` at `1.2246e-16`, which puts
    three of the four axis dots of a radial layout off their axis and leaves
    that noise in committed IR goldens. The degrees-to-radians step is an
    exact Dekker product plus the pi/180 tail, so `sin(30)` is exactly `0.5`
    (the old `sinDegrees` gave `0.49999999999999994`, and `-0.5000000000000004`
    for `sin(-30)`).
  - *Portable.* Only `+ - * /`, `%`, `Math.floor`, `Math.abs` and
    `Math.trunc` are used, each specified to the last bit, so the folded
    literal should not depend on the engine. Before this, `Math.sin` itself
    differed between Node's and Chromium's V8 (at 240°, `docs/determinism.md`)
    and `eval/scenes-3b/radial-dots` hashed differently in the two; they now
    agree (`eval/RESULTS-PHASE-10A.md`, section 4). Only those two V8 builds
    were measured.

  The pins are `parser/parseExpr.test.ts`'s `"evaluates %s in degrees"` and
  `"folds %s to the exact value"` tables, whose `toMatchObject` compares
  primitives by exact equality, and `detMath.test.ts`'s `"are exact at the
  cardinal angles"`, `"give exactly 1/2 at 30 degrees and its reflections"`,
  the ulp sweeps against a 160-bit reference, and the source scan `"calls no
  Math function but floor, abs and trunc"`.
