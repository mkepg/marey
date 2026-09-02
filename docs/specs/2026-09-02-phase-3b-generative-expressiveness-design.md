# Phase 3B — Generative Expressiveness

**Date:** 2026-09-02
**Status:** Approved design.
**Executes:** §8 of `2026-09-01-declare-product-roadmap-design.md`, which remains
authoritative for capability and success criteria. That document states the
syntax "receives its own phase design"; this is that design.
**Depends on:** Phase 3A (`2026-09-01-phase-3a-language-foundations-design.md`),
merged at `aa4ba0f`, for `LANGUAGE_CONTRACT` as the single property contract.

---

## 1. What this phase is for

`eval/RESULTS.md` measured that three of four data-driven briefs required
hand-unrolling, and named the cause: *"`generate` handles 'N of the same thing,
spaced linearly.' It does not handle **data**."* Three scenes are the evidence,
and they are the acceptance test:

| Scene | What the author had to do instead | Cause |
|---|---|---|
| `bar-chart` | Seven `rectangle` blocks and seven `let`s for seven values | No lists, no indexing |
| `radial-dots` | Twelve hand-computed coordinates written as literals | No trigonometry |
| `timeline-ticks` | Two overlapping `generate` loops, the wider one drawing over the narrower | No modulo, no conditional |

Both rounds independently reached the same workarounds, and both authors wrote
comments explaining *why* they were hand-unrolling — `eval/scenes/radial-dots.declare:4-11`
and `eval/scenes-r2/timeline-ticks.declare:4-9` name the missing feature
directly. The exit criterion is that those comments become deletable.

This is the first phase measured by authoring compression rather than
compilation rate. Compilation rate is already 100% and cannot improve.

---

## 2. The governing line

Roadmap §4 cuts "a general scripting runtime," "user-defined functions in the
macro layer," and "general mutable variables," while §8.1 requires lists,
iteration, indexing, modulo, comparison, a conditional, and trig. Those pull in
opposite directions. This section is the line between them, and it is the
actual design problem of the phase.

### 2.1 The rule

> **Data determines *values*. The source's literal structure determines
> *shape*.**
>
> Reading the source alone, without evaluating any predicate, tells you how
> many objects the program emits and what they are named. Data freely decides a
> bar's height, a tick's thickness, a dot's colour. No predicate ever decides
> whether an object exists.

A list's *length* determining an object count is not a violation — the length
is literally in the source, and `generate v, i in values` emits exactly
`length(values)` objects named `bar_0 … bar_6`, a visible 1:1 map. A predicate
gating emission is a violation, because you would have to run the data to know
what the program produces.

### 2.2 What follows mechanically

- **Conditionals live in value position only.** `thickness: if c then 3 else 2`
  is in. `if c { circle x { } }` is out. So is filtering inside `generate`,
  `while`, `break`, `continue`, and early exit.
- **No user-definable abstraction.** `sin`, `cos` and `length` are *operators
  spelled like calls*, in the same category as `+`. There is no call syntax
  over user-chosen names, no first-class function values, and no way to define
  a new operator. `template`/`use` remains the only abstraction, and remains
  macro expansion with cycle detection.
- **No mutation, no statements with side effects, no maps, no I/O.** Unchanged
  from §8.2.
- **Everything is still evaluated once, at parse time, to a literal.** No
  expression reaches the Scene IR. This is not a new constraint; it is how the
  language already works (§3.1) and this phase does not weaken it.

### 2.3 Why this line and not another

Three reasons, in decreasing order of how much they should be trusted:

1. **It keeps `generate`'s deterministic name suffixing meaningful.** Object
   names are the IR registry's keys (`sceneIR.ts:145`). If a predicate could
   skip iterations, `bar_3` would or would not exist depending on the data, and
   nothing in the source would say which.
2. **It is what makes roadmap §15.4 — "a pull request shows a readable source
   diff" — true.** A diff tells you what changed visually only if you can see
   the shape without running the predicates.
3. **It is decidable and therefore testable.** §11.3 makes it an executable
   regression matrix rather than a paragraph of intent, which is the only form
   of a design boundary that survives contact with a later phase.

It is worth being honest that (1) and (2) are arguments about *this* line being
good, not about it being the only defensible one. A language that allowed
filtering would still compile, still export, and still be deterministic. The
claim is narrower: filtering buys little that a conditional value does not —
`timeline-ticks` needs a *decision about a value*, exactly as roadmap R4 says —
and it costs the property that a reader can see a program's shape.

---

## 3. Where the expressions live, and why the IR is unaffected

### 3.1 The pipeline fact this design rests on

Declare has no expression layer. Everything is evaluated during parsing:

- `parseMathExpr` returns a JavaScript `number`, not a node
  (`parser/parseValue.ts:46-75`). `let spacing = base * 2 + 10` stores
  `{kind:"number", value:50}`.
- Names resolve from `state.env`, which holds *already-evaluated* `AstValue`s
  spliced in at the use site (`parser/parseValue.ts:199-203`,
  `parser/parseBinding.ts:30-33`).
- `generate` rewinds `state.pos` and re-parses the same token span with the
  loop variable rebound per iteration (`parser/parseGenerate.ts:87-98`).

By the time `typeCheck` runs, every value is a literal. **Every expression this
phase adds is therefore constant-folded before the type checker sees it, and no
list, conditional, comparison or trig call can reach the Scene IR.**

### 3.2 Consequence for `sceneIR.ts`

**No change.** `IRPointList` (`sceneIR.ts:28`) remains the only list type in the
IR and remains reachable only through `polygon.points` and `line.points`. A
`let`-bound data list is consumed and erased at parse time.

### 3.3 Consequence for the contract's default machinery

**No change.** `ContractDefault` (`languageContract.ts:6`) and the
`contractNumberDefault` / `contractPointDefault` / `contractStringDefault` /
`contractBooleanDefault` family (`typeChecker/resolvers.ts:18-38`) would need a
new variant only if some property had a *list-valued default*. None does, and
none is proposed. `derivedDefault` (`languageContract.ts:31`) is likewise
untouched.

### 3.4 Consequence for `validateLocalConstraint`

`validateLocalConstraint` (`typeChecker/validator.ts:39-125`) switches on
`constraint.kind` and each case guards on `val.kind`. Adding a *value* kind
requires no change to it. Adding a *constraint* kind does, and the exhaustive
`never` at `typeChecker/validator.ts:120-123` fails the typecheck until the
case is written. §4.3 adds exactly one constraint kind.

---

## 4. The language surface

### 4.1 Values and operators

```declare
let values = [3, 7, 2, 9, 5, 8, 4]     // list literal
let n      = length(values)             // 7
let ring   = 0 to n - 1                 // [0,1,2,3,4,5,6] — inclusive
let third  = values[2]                  // 2
let grid   = [[1, 2], [3, 4]]           // nested lists are allowed
```

| Added | Form | Result |
|---|---|---|
| List literal | `[a, b, c]` | list |
| Range | `A to B` | list of integers, both ends inclusive |
| Index | `l[i]` | element; chainable as `grid[r][c]` |
| Length | `length(l)` | number |
| Modulo | `a % b` | number |
| Comparison | `== != < > <= >=` | boolean |
| Combinators | `and` `or` `not` | boolean |
| Conditional | `if C then A else B` | value of the taken branch |
| Trig | `sin(d)` `cos(d)` | number, `d` in **degrees** |

### 4.2 Precedence

Loosest to tightest:

1. `if … then … else …` (right-associative)
2. `or`
3. `and`
4. `not` (unary prefix)
5. `== != < > <= >=` — **non-associative**
6. `to` — **non-associative**
7. `+` `-`
8. `*` `/` `%`
9. unary `-`
10. postfix `[…]`
11. primary: number, list literal, name, `(…)`, `sin(…)`, `cos(…)`, `length(…)`

`to` therefore sits between comparison and additive: its operands are additive
expressions, so `0 to count - 1` parses as `0 to (count - 1)`, which is the
form every range in §7's rewrites uses. `not` sitting looser than comparison
gives `not a == b` the reading `not (a == b)`, which is the only useful one.
`a to b to c` and `a < b < c` are parse errors naming the non-associativity
rather than silently regrouping.

### 4.3 Type rules

- **`%`** takes two numbers. `a % 0` is a compile error, matching the existing
  treatment of division by zero (`parser/parseValue.ts:69`).
- **`==` and `!=`** compare two values *of the same kind* — number, string,
  boolean, or color. Comparing different kinds is a compile error, **not**
  `false`. A silent `false` is the kind of result that compiles, renders
  something wrong, and gives the author nothing to read.
- **`< > <= >=`** take two numbers only.
- **`and` `or` `not`** take booleans only. There is no truthiness.
- **`if C then A else B`** requires `C` boolean, and requires **`A` and `B` to
  be the same kind**. Without that rule `radius: if flag then 5 else red`
  compiles whenever `flag` is true, and a value's kind becomes data-dependent —
  which would break §2.1 in the one place it is easiest to break by accident.
- **`sin(d)` / `cos(d)`** take a number of **degrees** and return a number.
- **`length(l)`** takes a list. Applying it to a non-list is a compile error
  naming the actual kind.
- **`l[i]`** requires `l` a list and `i` an integer in `0 … length(l)-1`. Out of
  range is a compile error stating the index and the length; a non-integer
  index is a compile error. There is no negative indexing and no wrap-around.

### 4.4 Iteration

`generate` gains one header shape and loses the old one:

```declare
generate i in 0 to 10 { … }            // range: a list of integers
generate v in values { … }             // each element
generate v, i in values { … }          // element and 0-based ordinal
```

`generate NAME from A to B` is **removed**. `A to B` is now an ordinary list
expression, so the range form is a special case of the list form rather than a
second construct: one keyword, one header shape, one rule — *`generate` NAME
[`,` INDEX] `in` LIST*.

**Name suffixing changes from the loop value to the 0-based ordinal.** Today
`parser/parseGenerate.ts:117,124,130` suffix with `i`, the loop variable's
value; that cannot generalize to a list of colors or strings. The ordinal is
the only choice that does. This is observable only for a range whose start is
not 0, and §10.2 records that no compiled first-party scene has one.

---

## 5. Type-system changes

This is the complete set. Every item is in `languageContract.ts` or derives
from it; no consumer gains a hand-written list (Phase 3A's rule).

| # | Change | Location |
|---|---|---|
| 1 | `ValueKind`: remove `pointList`, add `list` | `languageContract.ts:2-4` |
| 2 | `KIND_LABEL` entry for `list` | `languageContract.ts:384-395` — the total `Record<ValueKind,string>` fails the typecheck until filled in |
| 3 | `PointListValue` → `ListValue { kind:"list"; value: readonly AstValue[] }` | `types.ts:72-79`, `types.ts:127-137` |
| 4 | New `LocalConstraint` variant `{ kind:"listOf"; element: ValueKind; min: number; max: number }`, replacing `pointCount` | `languageContract.ts:8-14` |
| 5 | `validateLocalConstraint` case for `listOf` | `typeChecker/validator.ts:109-118` replaced; the `never` at `:120-123` forces it |
| 6 | `polygon.points` → `list` + `listOf` point 3…10000; `line.points` → `list` + `listOf` point 2…10000 | `languageContract.ts:199-205`, `:211-217` |
| 7 | `getReqPointList` narrows a `ListValue`'s elements to points | `typeChecker/resolvers.ts:166-169` |
| 8 | New token types and the two-char lexer path | §6 |

**One list concept, not two.** Folding `pointList` into `list` is what makes
`tri[0]` and `length(tri)` work on a point list without specifying every list
operation twice. `sceneIR.ts`, `ContractDefault`, and the `contract*Default`
family are all untouched (§3.2, §3.3).

**A diagnostic moves on purpose.** `points: [(0,0), 5]` currently fails at parse
time with *"Each entry in a point list must be a point"*
(`parser/parseValue.ts:122-125`). It will fail at type-check time, from the
contract, naming the offending element's position and kind. That is the better
home for it — it is a property-shape rule, and every other property-shape rule
is contract-driven since Phase 3A. It moves a case in
`languageCuts.test.ts:179-187`, deliberately (§11.3).

---

## 6. Lexer changes

- New token types: `PERCENT`, `LT`, `GT`, `EQ_EQ`, `BANG_EQ`, `LT_EQ`, `GT_EQ`
  (`types.ts:1-25`).
- Two-character operators must be matched **before** `SINGLE_CHAR_MAP`, which
  currently consumes `=` unconditionally at `lexer/index.ts:35-40`. Otherwise
  `==` lexes as two `EQUALS` and `let x = = y` and `x == y` become
  indistinguishable.
- A bare `!` is a lex error hinting at `!=` and `not`.
- The allowed-symbols sentence at `lexer/index.ts:64` must list the new
  symbols. It is user-facing and currently enumerates them exhaustively.

### 6.1 Reserved words and a new token class

`if then else and or not sin cos length in to` become reserved.

They must **not** join `KEYWORDS` (`lexer/constants.ts:11`), which is
`Object.keys(LANGUAGE_CONTRACT)` plus the four macro keywords and means "names
a block." `parseValue` reports any `KEYWORD` in value position as *"is an
object keyword and cannot be used as a property value"*
(`parser/parseValue.ts:208-210`) — false for `if`. They get their own token
class, with their own diagnostics.

**`to` must be both a reserved operator and a legal property name**, because
`animate { to: (100, 100) }` exists. That works because property names are
consumed positionally: `consumePropertyName` (`parser/parseProperty.ts:5-16`)
consumes whatever token is present, and the gate deciding what may start a
property is a token-type test at `parser/parseObject.ts:281` and
`parser/parseUse.ts:73`, which already admits `FIT`, `NAMED_COLOR`, `BOOLEAN`
and `EASING` for exactly this reason. The new class joins that list.

### 6.2 Migration cost of reserving them

Verified across all 52 tracked `.declare` files, `src/store/defaultScene.ts`,
and `docs/LANGUAGE.md`: **no first-party source uses any of these words as an
identifier**, in a binding, an object name, or a value reference. The only
occurrences are in prose comments.

It does invert three permission cases in `languageCuts.test.ts:340-353`, which
currently pins `if`, `sin` and `cos` as usable ordinary identifiers. That is a
deliberate change of position, recorded in §11.3.

---

## 7. The three acceptance scenes

These are the target rewrites. They are the phase's definition of done, and
each must be materially shorter and cheaper to modify than its baseline.

### 7.1 `bar-chart` — one list, one loop

```declare
let values   = [3, 7, 2, 9, 5, 8, 4]
let scale    = 30
let baseline = 500

generate v, i in values {
  rectangle bar {
    position: (100 + i * 100, baseline - (v * scale) / 2)
    size: (70, v * scale)
    color: sky
  }
}
```

Adding an eighth bar becomes a one-token diff.

### 7.2 `radial-dots` — one loop, no hand-computed coordinates

```declare
let count = 12
generate i in 0 to count - 1 {
  let angle = i * 360 / count
  circle dot {
    position: (400 + 180 * cos(angle), 300 + 180 * sin(angle))
    radius: 9
    color: dotColor
  }
}
```

Changing 12 dots to 24 becomes a one-token diff. The twelve literal coordinate
pairs and the eight-line apology comment both disappear.

### 7.3 `timeline-ticks` — one loop, not two overlapping ones

```declare
generate i in 0 to 10 {
  let major = i % 5 == 0
  let half  = if major then 14 else 6
  line tick {
    position: (startX + i * spacing, axisY)
    points: [(0, -half), (0, half)]
    thickness: if major then 3 else 2
    color: if major then amber else sky
  }
}
```

The second loop, the overdraw, and the `layer: 1` that made the overdraw work
all disappear.

---

## 8. Limits and diagnostics

Every limit below is a compile error with a position, never a silent clamp.

- **List length: 10,000**, matching the existing point-list ceiling. This
  applies to literals and to ranges alike, so `parseGenerate.ts:47-49`'s
  separate `end - start > 10000` check folds into it — one limit, not two.
- **Range bounds must be integers**, preserving `parseGenerate.ts:44-46`.
  `5 to 1` produces the empty list rather than an error; iterating it emits
  nothing, which is the honest reading of "inclusive from 5 to 1."
- **The 15,000 global node budget is unchanged** and still counts every object,
  `use` expansion, and `generate` iteration.
- **Index out of range** states the index and the length.
- **Modulo by zero**, **`length` of a non-list**, **indexing a non-list**,
  **mixed-kind `==`**, **mixed-kind `if` branches**, and **non-boolean
  conditions** each get a distinct, positioned, coded diagnostic.
- **Expression nesting depth stays at 50**, matching `parser/parseValue.ts:6-8`
  and applying to the new operators, index chains and conditionals alike.

---

## 9. The pre-existing physics silent-drop defect

`typeChecker/builder.ts:118-119` collects `animate` children with `.filter` but
`physics` children with `.find`, and `:127-130` attaches only that one. **A
second direct `physics` block on a renderable compiles with zero errors and
never reaches the IR** — silent data loss, present since `8390e58`. Phase 3A
found it in final review and deferred it
(`docs/plans/2026-09-01-phase-3a-language-foundations.md:1644-1664`).

**This phase fixes it.** A new `TYPE_ONE_PHYSICS` rule, modelled on the
existing `TYPE_ONE_STORY` rule for `sequence` (`typeChecker/validator.ts:166-173`):
at most one direct `physics` block per renderable, independent of `handoff`.
The existing `TYPE_HANDOFF_SCHEDULE_AMBIGUOUS` rule (`:375-379`) catches only
the narrower shape where a `handoff: true` animation is also present.

The argument for fixing rather than deferring again is Phase 3A's own. The
seconds-versus-ticks handoff gap was deferred with a note to schedule it before
export; the external reviewer judged that deferral **wrong**, because the
defect made a published exit criterion false immediately rather than only once
an export driver existed
(`…phase-3a-language-foundations.md:1580-1591`). This has the same shape, and
Phase 4 is export: a silently dropped `physics` block that bakes into a frame
sequence is unrecoverable and emits no runtime signal.

The regression test must be **mutation-tested** — seen failing against reverted
code — not merely seen passing. Phase 3A shipped six lifecycle tests that never
had a genuine red (`…phase-3a-language-foundations.md:1375-1379`).

---

## 10. What moves, and why each move is a decision

### 10.1 The evaluation corpora are frozen

`eval/scenes/` and `eval/scenes-r2/` are **not edited**. They are a record of
what four blind authors actually wrote, and `eval/RESULTS.md:117-125` sets the
re-run protocol itself: *"Keep the briefs and the protocol identical."*
Rewriting the fixtures destroys the "before" and the comparison with it.
Roadmap §8.3 independently requires both corpora stay green, meaning still
compiling — and both must still report 20/20 with `report.json` and
`report-r2.json` byte-unchanged.

The rewrites live in a new `eval/scenes-3b/`, a **demonstration corpus**, with
a README stating plainly that it is not an authorability round. A blind-author
R3 round is explicitly **not** in this phase; it is the separate exercise
`eval/RESULTS.md:117-125` describes, and running it with authors who have seen
this spec would measure nothing.

`eval/RESULTS-3B.md` records roadmap §5's metrics for each of the three
scenes, against the frozen baselines: source lines, literal-coordinate count,
hand-unrolled object count, and the diff size for one representative change
(add a bar; change 12 dots to 24; change 11 ticks to 21).

### 10.2 Which golden snapshots move

`src/compiler/determinism.test.ts` holds committed IR snapshots. The rule is
that a moving golden is a decision with a recorded reason, never a re-record.

- **Existing fixtures gain no new syntax**, so their snapshots must not move.
- **`generate`'s ordinal suffixing** (§4.4) changes object names only for a
  range whose start is not 0. Verified: the only such header anywhere in the
  repo is inside a Monaco hover string in
  `src/components/Editor/MonacoEditor/constants.ts:35`, not a compiled scene.
  **No existing snapshot moves from this change.**
- **A new fixture** exercising lists, indexing, `%`, comparison, the
  conditional and trig gets its own new snapshot — added, not modified.
- Any snapshot that does move without a reason in this list is a defect, not a
  re-record.

### 10.3 `languageCuts.test.ts` — lifted, retained, and newly drawn

The file is the executable record of what the language deliberately does not
do. Three distinct kinds of change, each recorded:

**Lifted** — these become permission cases, each commented with the roadmap
authority (§8.1) and this spec: the number list at `:179-187`, indexing at
`:189-198`, `%` at `:202-210`, `<` at `:212-220`, `==` at `:222-230`, the
conditional at `:234-242`, and trig at `:163-176`. The identifier-permission
cases for `if`, `sin` and `cos` at `:340-353` invert to reservation cases.

**Retained unchanged** — the physics cuts at `:67-92`, mutable variables at
`:94-114`, arbitrary objects at `:139-149`, network/file access at `:151-161`,
and the top-level construct rejections at `:116-137` for every word except
`if`.

**Newly drawn** — §2's line becomes executable, with a case for each of:
conditional emission (`if c { circle x { } }`), filtering inside `generate`,
`while`/`break`/`continue`, calling a `let`-bound name as a function, defining
an operator, list mutation, and assigning to an index.

That last group is the part that matters. Without it, §2 is a paragraph of
intent that a later phase can cross without any test noticing — which is
exactly the failure mode Phase 3A built this file to prevent.

### 10.4 Documentation

`docs/LANGUAGE.md`'s "Current limits (as of v0.3.x)" section
(`docs/LANGUAGE.md:816-840`) exists to describe precisely these three gaps and
is largely deleted. Its replacement states the new capability *and* §2's line,
because a reader needs to know what the language will not do as much as what it
will.

`languageDocs.test.ts` compiles every `declare` fence in the reference, so the
reference cannot describe syntax that does not work. It does **not** check
prose, which is how three false statements survived a green suite in Phase 3A
— so the prose needs reading, not just a green run.

Monaco hovers, completions and snippets derive from `LANGUAGE_CONTRACT` and
pick up the property changes automatically. The `generate` hover at
`src/components/Editor/MonacoEditor/constants.ts:35` is hand-written prose
about a construct whose syntax changes, and must be updated with it.

---

## 11. Recorded deviations from the roadmap

Roadmap §8.1's settled decisions are to be treated as deliberate. Two are not
followed, and are recorded here rather than quietly dropped.

1. **No π constant.** §8.1 requires "`sin`, `cos`, and a π constant with
   explicitly documented angle units." `sin`/`cos` take **degrees**, matching
   `rotation`, which is the only other angle in the language
   (`languageContract.ts:111-117`). A π constant alongside degree-based trig is
   a trap: `sin(pi)` would be `0.0274`, not `0`. The requirement §8.1 was
   protecting — that angle units are explicit — is met more strongly by having
   exactly one angle unit in the language than by shipping a constant that
   contradicts it.

2. **Indexing and `length` ship *alongside* direct iteration, not instead of
   it.** §8.1 offers "indexing and list length, **or** a direct list-iteration
   form that makes those operations unnecessary for the common case."
   `generate v, i in values` covers the common case; indexing covers parallel
   lists — values with labels — which is an ordinary motion-graphics need and
   the immediate next thing anyone writing `bar-chart` asks for. Folding
   `pointList` into `list` (§5) also means indexing must be specified anyway,
   since `tri[0]` on a point list would otherwise be an arbitrary hole.

---

## 12. Exit criteria — Product Gate A

Roadmap §8.3's criteria, made checkable:

1. `eval/scenes-3b/bar-chart.declare` uses **one** literal data list and
   **one** loop, with zero hand-unrolled `rectangle` blocks.
2. `eval/scenes-3b/radial-dots.declare` uses **one** loop and **zero**
   hand-computed coordinate literals.
3. `eval/scenes-3b/timeline-ticks.declare` uses **one** loop, not two.
4. Each is materially shorter than its baseline, with the reduction and the
   representative-change diff size recorded in `eval/RESULTS-3B.md`.
5. `eval/scenes/` and `eval/scenes-r2/` are **byte-unchanged**, both compile
   20/20, and `report.json` / `report-r2.json` are byte-unchanged after a
   re-run — the same clean-`git status` proof Phase 3A used.
6. Every `declare` fence in `docs/LANGUAGE.md` compiles, and the "Current
   limits" section no longer claims gaps that are closed.
7. Every lifted cut has a permission test; every retained cut keeps its
   rejection test; §2's line has a rejection test per clause (§10.3).
8. `TYPE_ONE_PHYSICS` rejects a second direct `physics` block, and its test is
   mutation-verified against reverted code (§9).
9. `sin`/`cos` correctness is proven by an **IR-level assertion** against
   independently computed coordinates — not by compilation, since
   `radial-dots` compiles with the signs wrong — and confirmed by a Chromium
   capture.
10. Typecheck, production build, full unit suite, and language-doc tests green.
11. Repeated compilation of identical source still produces identical AST and
    IR, and every moved golden appears in §10.2's list with its reason.

If the three scenes are not convincingly improved, roadmap §8.3 says to stop
and reassess the DSL before adding another major subsystem. That instruction
stands.

---

## 13. Explicitly out of scope

- **Semantic layout primitives** — `row`, `column`, `grid`, `radial`,
  `distribute`, `align`. Roadmap R11 and §8.3 both require observing the
  evidence from *this* phase first. `eval/RESULTS-3B.md` is that evidence;
  reading it is a later phase's job.
- **The blind-author R3 authorability round** (§10.1).
- **String operations** beyond equality. Concatenation is already rejected
  (`parser/parseValue.ts:99-101`) and stays rejected.
- **Color arithmetic and color animation.** Colour animation remains
  half-built across three layers and is Phase 6's.
- **`sqrt`, `atan2`, `pow`, `abs`, `min`, `max`, `floor`, `round`.** None is
  needed by the three scenes. They are a coherent later addition under §2's
  line, but adding operators nothing demands is how a small language stops
  being small.
- **Everything in roadmap §4's cut list**, which remains in force.
