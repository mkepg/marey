# Can Marey realistically be adopted?

**Date:** 2026-09-09
**Status:** Research notes. Not a design, not a roadmap change. Nothing here
supersedes `docs/specs/2026-09-01-marey-product-roadmap-design.md`.

**Relationship to the prior research.**
`docs/research/2026-09-08-marey-direction-primary-sources.md` established the
Mermaid distribution split (§5) and the competitive/licensing frame (§6). This
document does not re-derive either. It cites them and extends them with
*measured trajectories*, *documented spread mechanisms*, and *quantified
structural barriers*.

---

## 0. What primary sources can and cannot answer

**They cannot answer the question as asked.** No registry, API, spec or
repository can tell you whether a not-yet-published project will be adopted.
Anyone who says otherwise is forecasting.

What the primary record *can* supply, and what the rest of this document is
limited to:

| Class | What it is | Where it appears here |
|---|---|---|
| **Measured** | Download counts, star counts, release dates, contributor counts — retrievable numbers with a retrieval date | §1, §2 |
| **Structural** | Facts about the design that are not opinions: how much syntax exists, what a host will and will not render, what a licence permits | §3, §5 |
| **First-party claim** | What a project says about itself in its own docs/repo | §2 |
| **Unknowable / unverified** | Everything else | §6 |

Section 6 is the honest part of the document. Read it before acting on any of
the rest.

### The bounded answer

Stated as narrowly as the evidence allows, and nothing further:

- **Nothing measured here rules adoption out.** No structural barrier found is
  disqualifying, and the closest competitors are beatable on licence (§5) and on
  the one design property none of them has (§3.3).
- **Nothing measured here predicts adoption either**, and two facts should
  lower any expectation of speed. Every comparable took **four to six years**
  from first release to meaningful traction, with no fast take-off anywhere in
  the record (§1.2). And the comparable that most resembles Marey — Motion
  Canvas, code-first, deterministic, MIT, 19,070 stars — has ~345 downloads a
  day and has not published a release in 21 months (§1.2).
- **The mechanism that actually worked twice was artifact-first, not
  tool-first** (§2). Marey's roadmap ladder describes a conversion path, not an
  acquisition one.
- **The project's own authorability evidence is real but at a ceiling** — 40/40
  first-pass compiles across two blind runs, with the one metric designed to
  discriminate producing no data at all, and no blind round run since Phase 3B
  landed (§4).
- **One deliverable is currently unmet and gates everything else**: there is no
  `LICENSE` file and `package.json` says `"private": true` (§5.3).

---

## 1. Measured trajectories of comparable projects

**All figures retrieved 2026-09-09** from the npm registry download API
(`https://api.npmjs.org/downloads/...`), the npm registry metadata API
(`https://registry.npmjs.org/<pkg>`), the GitHub REST API
(`https://api.github.com/repos/<owner>/<repo>`), PyPI's JSON API
(`https://pypi.org/pypi/<pkg>/json`), and the crates.io API
(`https://crates.io/api/v1/crates/typst`). Every number below is reproducible
by re-issuing those calls.

### 1.1 The table

| Project | First public release (source) | GitHub stars | Forks | Open issues | Contributors † | Licence (GitHub API `license.spdx_id`) | Downloads, 30 days to 2026-09-08 |
|---|---|---|---|---|---|---|---|
| [`mermaid`](https://registry.npmjs.org/mermaid) | 0.2.11, **2014-12-02** (npm `time`) | 90,165 | 9,239 | 1,773 | ~367 | MIT | **54,092,231** |
| [`lottie-web`](https://registry.npmjs.org/lottie-web) | 5.0.1, **2017-11-21** (npm `time`; repo created 2015-02-20) | 32,084 | 2,941 | 857 | ~84 | MIT | **28,374,972** |
| [`remotion`](https://registry.npmjs.org/remotion) | `1.0.0`, **2021-02-06** (npm `time`; first prerelease 2020-12-15) | 58,637 | 4,463 | 175 | ~387 | `NOASSERTION` (source-available) | **6,566,168** |
| [`@rive-app/canvas`](https://registry.npmjs.org/@rive-app/canvas) | 1.0.2, **2021-12-16** (npm `time`) | 1,173 ‡ | 120 ‡ | 67 ‡ | — | MIT ‡ | **4,590,044** |
| [`@motion-canvas/core`](https://registry.npmjs.org/@motion-canvas/core) | 2.0.0, **2023-02-04** (npm `time`) | 19,070 | 814 | 173 | ~96 | MIT | **10,366** |
| [`manim`](https://pypi.org/pypi/manim/json) (Community) | 0.1.0, **2020-11-09** (PyPI `upload_time`) | 40,719 | 3,096 | 500 | ~416 | MIT | ~205,381/month (PyPI, Aug 2026) § |
| [`manimgl`](https://pypi.org/pypi/manimgl/json) (3b1b) | 1.0.0, **2021-02-15** (PyPI `upload_time`; repo created **2015-03-22**) | 93,489 | 7,680 | 497 | ~183 | MIT | — |
| [`typst`](https://crates.io/api/v1/crates/typst) | crate published **2023-03-21**; repo created 2019-09-24 | 55,920 | 1,707 | 1,288 | ~449 | Apache-2.0 | 1,034,080 recent crate downloads; 282,354 GitHub asset downloads on v0.15.1 alone |
| [`d2`](https://github.com/d2lang/d2) | v0.0.12, **2022-11-15** (GitHub releases) | 25,318 | 743 | 522 | ~65 | MPL-2.0 | GitHub release assets: v0.7.1 (2025-08-19) → **645,789** |

† Contributor counts are read from the `Link: …rel="last"` header of
`GET /repos/<r>/contributors?per_page=1`, i.e. the number of pages of one
contributor each. They are approximate by construction and exclude anonymous
contributors.

‡ `rive-app/rive-runtime` is the C++ runtime repo; the npm package
`@rive-app/canvas` has no separate public repo, so stars are not a like-for-like
comparison with the others.

§ PyPI publishes no first-party download API. The monthly figure is from
`pypistats.org`, which is a third-party front end over PyPI's own BigQuery
download dataset — a derived source, flagged as such, and the weakest number in
this table.

**A caution on two rows.** The npm packages literally named `typst` and `d2` are
**not** these projects. [`npm:typst`](https://registry.npmjs.org/typst) is
`typst-community/typst.js`, a JS wrapper last published 2023-12-18;
[`npm:d2`](https://registry.npmjs.org/d2) is
[`dhis2/d2`](https://github.com/dhis2/d2), "Javascript library for DHIS2", last
published 2021-11-18. Anyone benchmarking these two DSLs against npm numbers is
measuring the wrong packages. Their real distribution channels are cargo/GitHub
releases and Go/GitHub releases respectively.

### 1.2 The shapes, not the totals

Yearly npm download totals (`https://api.npmjs.org/downloads/point/YYYY-01-01:YYYY-12-31/<pkg>`),
retrieved 2026-09-09:

| Package | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 YTD (to 09-08) |
|---|---|---|---|---|---|---|
| `mermaid` | 6,082,948 | 10,558,383 | 21,532,092 | 36,311,590 | 74,663,623 | 264,585,640 |
| `lottie-web` | 28,778,893 | 55,204,071 | 81,569,058 | 97,874,348 | 142,686,705 | 195,677,648 |
| `remotion` | 61,497 | 252,999 | 951,673 | 2,333,025 | 4,531,334 | 29,553,195 |
| `@rive-app/canvas` | 1,402 | 342,524 | 3,186,433 | 8,062,255 | 16,391,766 | 30,390,843 |
| `@motion-canvas/core` | 0 | 0 | **31,018** | **28,902** | **24,629** | **92,867** |

**Read the 2026 column with suspicion.** Every package in it is up by a
multiple, not a margin — Remotion 6.5×, Mermaid 3.5×, Motion Canvas 3.8× — over
eight months. A rise that uniform is an ecosystem-wide artifact (registry
traffic, CI, mirrors, agentic tooling) rather than five simultaneous product
successes. Only the *relative* ordering of the 2026 column is safe to use; the
absolute magnitudes are not comparable to earlier years. §6 records this as a
known weakness.

Mermaid's earlier years, same API:

| `mermaid` | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 |
|---|---|---|---|---|---|---|
| downloads | 6,429 | 33,867 | 134,840 | 526,937 | 2,039,092 | 4,149,559 |

**Three things the shapes show, and one of them is the most decision-relevant
number in this document.**

1. **Time to traction is measured in years, not months, in every single case.**
   Mermaid took from Dec 2014 to 2018 to pass half a million downloads a year,
   and to 2019 to pass two million — four to five years. Remotion went from
   61,497 (2021) to 4.53M (2025): roughly a doubling every year for five
   straight years, with no step change. Rive's npm package went 1,402 → 16.4M
   over the same five years. There is no example here of a fast take-off.

2. **Stars and downloads are close to uncorrelated for a code-first motion
   tool.** `@motion-canvas/core` has **19,070 stars** and **10,366 downloads in
   the last 30 days** — a project with more GitHub stars than Rive's entire
   runtime repo and roughly 1/440th of Rive's npm traffic. This is the closest
   structural analogue to Marey in the whole table: a code-first, deterministic,
   MIT-licensed 2D motion-graphics tool aimed at explanatory animation.

3. **Motion Canvas's release cadence stopped while its stars kept counting.**
   Downloads peaked in 2023 (31,018), fell for two straight years
   (28,902 → 24,629), and then rose sharply in 2026 (92,867 YTD) — but see the
   caution above, and note the shape of that rise: monthly downloads went
   3,996 (Apr) → 15,875 (May) → **31,831 (Jun)** → 18,754 (Jul) → 10,660 (Aug)
   (`https://api.npmjs.org/downloads/range/2026-01-01:2026-09-08/@motion-canvas/core`).
   A single month exceeding the whole of 2025 and then falling back is not the
   signature of user adoption.

   Meanwhile the project's own release record stopped. Its latest npm release is
   [`3.17.2`, published 2024-12-14](https://registry.npmjs.org/@motion-canvas/core);
   the newest GitHub release is
   [`v3.18.0-alpha.0`, 2025-02-16](https://api.github.com/repos/motion-canvas/motion-canvas/releases);
   the repo's `pushed_at` is 2026-07-02. **Twenty-one months with no published
   release, against 19,070 stars.**

   Even at 2026's elevated rate, the last 30 days are **10,366 downloads — about
   345 a day**, versus 4,590,044 for `@rive-app/canvas` over the same window: a
   ratio of roughly **1:443**.

   That is the single most decision-relevant measured fact in this document,
   because Motion Canvas is the comparable that most resembles Marey — code-first,
   deterministic, MIT, aimed at explanatory 2D motion. It is **not** evidence
   that Marey will fail; one case is not a trend, and the causes are not in the
   primary record (§6.1). It **is** proof that "a well-regarded code-first 2D
   motion tool with heavy GitHub attention" is a demonstrated way to reach five
   figures of stars and three figures of daily installs.

4. **The two adjacent output formats are enormous and the tools are not.**
   `lottie-web` alone did 28.4M downloads in 30 days versus Remotion's 6.6M and
   Motion Canvas's 10K. Marey's Phase 5A bet — emit into a format that already
   has distribution rather than asking anyone to adopt a runtime — is pointed at
   the right end of this table. See the prior doc's §2 for what that format
   actually guarantees.

---

## 2. How the successful comparables actually spread

The prior research (§5 of
[`2026-09-08-marey-direction-primary-sources.md`](./2026-09-08-marey-direction-primary-sources.md))
established Mermaid's *build-time vs view-time* split and concluded that only
the build-time mechanism is available to Marey. This section adds the part that
document did not test: **what the record shows about the ordering — whether host
integration caused traction or followed it.**

### 2.1 Mermaid: GitHub adopted Mermaid because it was already big

GitHub's announcement,
["Include diagrams in your Markdown files with Mermaid"](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/),
carries the byline **"February 14, 2022 | Updated July 23, 2024"** (verified by
fetching the page 2026-09-09). Monthly npm downloads around that date
(`https://api.npmjs.org/downloads/range/2021-01-01:2022-06-30/mermaid`,
retrieved 2026-09-09):

| Month | Downloads | | Month | Downloads |
|---|---|---|---|---|
| 2021-09 | 566,574 | | 2022-01 | 610,113 |
| 2021-10 | 559,218 | | **2022-02** | **667,407** |
| 2021-11 | 597,983 | | 2022-03 | 776,925 |
| 2021-12 | 547,205 | | 2022-04 | 743,848 |

**There is no step function at the host-integration date.** Mermaid was already
doing ~600K downloads a month before GitHub shipped anything, having grown from
6,429 downloads in the whole of 2015 by compounding for seven years. The
post-announcement months continue the same trend line the pre-announcement
months were on. The much larger inflection in the series arrives later — 2023-07
(1.84M) through 2023-10 (2.44M) — well after the integration.

The causal reading the primary record supports is the reverse of the popular
one: **GitHub picked Mermaid because Mermaid had already won on its own**, and
GitHub's own docs confirm the list is curated and closed (prior doc §5;
[Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)
still documents exactly three formats). Host integration is a *reward* for
traction in this record, not a *route* to it.

This matters for Marey's roadmap because it removes an implicit hope. Roadmap
§11.2's "Native GitHub rendering is not an initial dependency" is correct and,
on this evidence, should be read as "not a dependency at any stage, and not a
milestone to plan toward."

### 2.2 Manim: the tool was a byproduct of a demo channel, published years later

This is the mechanism the primary record documents most clearly, and it is not
a distribution mechanism at all.

From the [3b1b/manim README](https://github.com/3b1b/manim/blob/master/README.md):

> Note, there are two versions of manim. This repository began as a personal
> project by the author of [3Blue1Brown](https://www.3blue1brown.com/) for the
> purpose of animating those videos, with video-specific code available
> [here](https://github.com/3b1b/videos). In 2020 a group of developers forked
> it into what is now the [community edition](https://github.com/ManimCommunity/manim/) …

Corroborated by the [ManimCommunity README](https://github.com/ManimCommunity/manim/blob/main/README.md):

> Manim is an animation engine for explanatory math videos. It's used to create
> precise animations programmatically, as demonstrated in the videos of
> [3Blue1Brown](https://www.3blue1brown.com/).

> The community edition of Manim (ManimCE) is a version maintained and developed
> by the community. It was forked from 3b1b/manim, a tool originally created and
> open-sourced by Grant Sanderson, also creator of the 3Blue1Brown educational
> math videos.

The dates make the ordering unambiguous:

| Event | Date | Source |
|---|---|---|
| `3b1b/manim` repo created | **2015-03-22** | GitHub API `created_at` |
| Community fork's first release `v0.1.0` | **2020-10-22** | [GitHub releases](https://api.github.com/repos/ManimCommunity/manim/releases) |
| Community `manim` first on PyPI | **2020-11-09** | [PyPI JSON](https://pypi.org/pypi/manim/json) |
| `3b1b/videos` repo (the actual scene source) created | **2020-12-31** | [GitHub API](https://api.github.com/repos/3b1b/videos) |
| 3b1b's own `manimgl` first on PyPI | **2021-02-15** | [PyPI JSON](https://pypi.org/pypi/manimgl/json) |

**For its first five and a half years Manim had no package distribution at
all.** No PyPI release, no installer, no docs site. What it had was a stream of
widely-watched videos whose look was unmistakable, and eventually a public repo
of the exact source that produced them. Packaging, documentation, tests and a
governance structure were added *by other people*, five years in, as a fork —
and that fork now has ~416 contributors and 40,719 stars against the original's
~183 and 93,489.

The transferable mechanism is: **artifacts circulated first; the tool was
adopted because people wanted to make things that looked like the artifacts.**
`3b1b/videos` is the primary-source form of that — 11,201 stars for a repo that
is nothing but scene files.

### 2.3 What this implies for the roadmap's adoption ladder

Roadmap §11.1's ladder starts at "Try a share link without an account" and ends
at "Embed the artifact without the Marey runtime." Both comparables above spread
in the opposite direction from the one the ladder describes: **the artifact
circulated first and the authoring tool was pulled in behind it.** Nobody
climbed a ladder from a share link.

That is not an argument against the ladder — it is a well-formed onboarding
path, and it is what Gate C tests. It is an argument that the ladder is a
*conversion* mechanism and not an *acquisition* one, and the primary record
contains no evidence about how Marey would acquire the person who steps onto
rung 1. §6 records that as unknowable.

---

## 3. Structural barriers specific to Marey, quantified from this repo

### 3.1 The learning surface, counted from the compiler

These counts are read from the compiler's own single source of truth, not from
prose, so they cannot drift. `LANGUAGE_CONTRACT`
(`src/compiler/languageContract.ts:372-384`) is the authority; `KEYWORDS` in
`src/compiler/lexer/constants.ts:11-17` is defined as
`Object.keys(LANGUAGE_CONTRACT)` plus the four macro keywords.

| Surface | Count | Source |
|---|---|---|
| Block types | **11** | `scene, circle, rectangle, polygon, line, text, animate, physics, group, sequence, parallel` (`languageContract.ts:372-384`) |
| Macro keywords | **4** | `let, generate, template, use` (`lexer/constants.ts:13-16`) |
| Expression words | **11** | `in, to, if, then, else, and, or, not, sin, cos, length` (`EXPRESSION_WORD_LIST`, `lexer/constants.ts:46-48`) |
| Named colour keywords | **9** | `red, green, blue, white, black, yellow, cyan, magenta, orange` (`NAMED_COLORS`, `languageContract.ts:54`) |
| Enumerated keyword values | **11** | `fit` 4 + `easing` 4 + boolean 2 + `indefinitely` 1 (`languageContract.ts:48-51`) |
| **Total reserved words** | **46** (deduped) | union of the five rows above |
| Distinct property names | **26** | union over all blocks (`RESERVED_PROPERTY_NAMES`, `languageContract.ts:461`) |
| Property slots (block × property pairs) | **58** | scene 3, circle 7, rectangle 7, polygon 7, line 8, text 8, animate 7, physics 6, group 5 |
| Operator symbols | **11** | `+ - * / %` and `== != < > <= >=` (`TWO_CHAR_MAP`/`SINGLE_CHAR_MAP`, `lexer/constants.ts:59-83`), plus `and/or/not` and indexing |
| Precedence levels a reader must internalise | **11** | `docs/LANGUAGE.md`, "Precedence, loosest to tightest" |
| Named diagnostic codes | **29** | `grep -rhoE '\b(TYPE\|PARSE\|LEX)_[A-Z0-9_]+' src/` |
| Reference length | **1,075 lines** | `docs/LANGUAGE.md` |

**Honest read: this is a small language.** Forty-six reserved words and
twenty-six property names is smaller than most configuration formats, let alone
most languages. It is not the raw size that is the barrier.

### 3.2 The barrier is not size, it is that the count is greater than zero

The correct comparison is not "46 words versus some other language's 300." It is
"46 words versus **zero** new words":

- **Remotion requires no new language.** Its published package metadata declares
  `"peerDependencies": {"react": ">=16.8.0", "react-dom": ">=16.8.0"}` and
  **zero runtime dependencies**
  ([`registry.npmjs.org/remotion/4.0.522`](https://registry.npmjs.org/remotion/4.0.522)).
  A Remotion user writes React components in TypeScript, in their existing
  editor, with their existing type checker, linter, formatter, test runner,
  refactoring tools and AI completions all working unchanged.
- **Motion Canvas requires no new language either** — TypeScript generators
  (prior doc §6).

Remotion's own API surface is not free: the root module of `remotion@4.0.522`
exports **92 symbols** (counted from
[`dist/cjs/index.d.ts`](https://cdn.jsdelivr.net/npm/remotion@4.0.522/dist/cjs/index.d.ts),
187 lines, retrieved 2026-09-09) — `Composition`, `Sequence`, `interpolate`,
`spring`, `useCurrentFrame`, `random` and so on. So the fair statement is
**not** "Marey costs 46 words and Remotion costs nothing." It is:

> Marey's 46 words and 26 properties are of comparable magnitude to Remotion's
> 92 root exports. The asymmetric cost is not vocabulary — it is **tooling and
> transfer**. Remotion's 92 symbols arrive inside an ecosystem the user's
> editor, type checker and model already know. Marey's 46 arrive with a
> single Monaco integration and one 1,075-line reference.

That is the structural disadvantage, stated as a fact rather than a worry: every
piece of general-purpose-language infrastructure that a Remotion or Motion Canvas
user gets for free, Marey must build, and `docs/LANGUAGE.md`'s own closing
section concedes one such gap today — "This document deliberately has no
exhaustive per-property type table … Until that phase lands, the editor's own
completions and hovers are the authority."

### 3.3 The rule that is both the differentiator and the ceiling

`docs/LANGUAGE.md`'s "Where expressions stop" states the design position:

> **Data determines *values*. The source's literal structure determines
> *shape*.**

and enumerates the consequences: no `if` as a guard, no filter on `generate`, no
`while`/`break`/`continue`, no user-definable abstraction ("There is no call
syntax over names you choose"), no mutation, no maps, no I/O, and no `sqrt`,
`atan2`, `pow`, `abs`, `min`, `max`, `floor` or `round`.

The prior doc's §6 correctly identifies this as the one property none of the
four competitors has. The adoption-relevant corollary is the other edge of the
same rule: **a user who hits any of those walls has no escape hatch inside the
language.** In Remotion or Motion Canvas the equivalent wall does not exist,
because the whole of TypeScript is available. This is a structural fact about
the design, not a defect — the roadmap chose it deliberately — but it is a real
input to adoption, because the population of scenes Marey can express is bounded
by a rule and the competitors' is not.

---

## 4. What the project's own `eval/` evidence shows about authorability

This is the only *measured* evidence anywhere about whether Marey can actually
be authored. It is the project's own, and it is unusually candid about its own
limits. Summarised faithfully, including the failures.

### 4.1 What was measured

Per [`eval/BRIEFS.md`](../../eval/BRIEFS.md): 20 briefs in five categories
(simple, systematic, data-driven, physics, sequence), written by someone who
knew the language. Authors were fresh subagents permitted to read **only the
user-facing surface** — the default scene, the Monaco language/constants files,
and (from R2 onward) `docs/LANGUAGE.md`. They were forbidden the compiler, the
spec, the plans and `AGENTS.md`. Round 1 was blind: every scene was written
before anything was compiled.

Three runs exist:

| Run | Date | Corpus | Surface available | Result |
|---|---|---|---|---|
| R1 baseline | 2026-08-27 | `eval/scenes/` | no language reference | **20/20 compiled first pass** |
| R2 | 2026-08-27 | `eval/scenes-r2/` | + `docs/LANGUAGE.md` | **20/20 compiled first pass** |
| 3B demo | 2026-09-07 | `eval/scenes-3b/` | — | **3/3 compiled** |

### 4.2 What it found — including the failures

**The headline number is at a ceiling and the project says so.** From
[`eval/RESULTS.md`](../../eval/RESULTS.md):

> **20 / 20 compiled clean on the first pass (100%).**
>
> That is a **ceiling**, and it makes the result less informative than it looks.
> The metric intended to be the discriminator — how many error-feedback rounds a
> model needs to converge, which is what would prove the validator is a moat —
> **could not be measured at all**, because nothing failed.

So the one measurement designed to test whether Marey's positioned errors help a
machine converge **produced no data**, and still has not. That is a failure of
the experiment, not of the language, and it is the single biggest hole in the
project's own authorability evidence.

**Authoring did fail, twice, in ways compile rate cannot see.**

1. *Expressiveness.* R1's finding 1: "The metaprogramming layer cannot express
   the cases that justify it." Three of four data-driven briefs had to be partly
   hand-unrolled — `radial-dots` (no trig: twelve coordinates computed by hand),
   `bar-chart` (no arrays or indexing: seven `rectangle` blocks and seven
   bindings), `timeline-ticks` (no modulo or conditionals: two overlapping
   `generate` loops drawing over each other). RESULTS.md's own verdict on
   `bar-chart`: *"This makes the data-driven use case largely unreachable."*

2. *Undocumented semantics.* R1's finding 2: the headline feature of two phases
   of engineering — object-to-object collision — was documented nowhere a user
   could reach. The `collide-stack` author wrote, verbatim:

   > there is no documented property for object-to-object collision … I'm
   > relying on an implicit "shared world" behavior … If objects don't actually
   > collide, this scene would just show four boxes falling straight through the
   > floor.

**R2 is the interesting run because it moves one variable and holds the other.**
Adding `docs/LANGUAGE.md` took the four physics/sequencing uncertainties from
**0 of 4 answered to 4 of 4, each with a file-and-section citation**, and left
hand-unrolling **byte-for-byte identical** (`eval/RESULTS-R2.md`). The document
explicitly calls the second half the control: *"Had hand-unrolling vanished, the
measurement would be broken, not the language fixed."*

R2's most transferable finding is about documentation form rather than content:

> For a machine author, **a rule stated abstractly is weaker evidence than the
> same rule shown once in an example.**

The concrete case: `let` bound to an arithmetic expression is legal, is stated
correctly in the reference, and the author *avoided it anyway* because no
example showed it — *"The only `def` examples in all four files bind literals…
I kept every `def` bound to plain literals."* An undocumented capability was
worked around at a cost.

**3B measured the expressiveness fix, not authorability.**
[`eval/RESULTS-3B.md`](../../eval/RESULTS-3B.md) shows `bar-chart` going from 7
hand-unrolled `rectangle` blocks to 1 loop body, `radial-dots` from 12
declarations and 14 literal coordinate pairs to 1 and 2, `timeline-ticks` from 2
`generate` blocks to 1. The strongest number is the cost of one representative
change: taking `radial-dots` from 12 dots to 24 costs **+23/−11 lines and 24
hand-computed sines and cosines** in the baselines, and **+1/−1 — one character**
in the rewrite.

But `eval/scenes-3b/README.md` disqualifies it as authorability evidence in its
own words:

> **This is not an authorability round.** … These three were written by the
> implementer of the feature they exercise, so they measure whether the
> capability removes the hand-unrolling — not whether an unfamiliar author would
> find it. The blind round that `eval/RESULTS.md`'s "Re-running after phase 3"
> section describes is a separate exercise and has not been run.

### 4.3 Honest weight of this evidence

The project's own caveats (both RESULTS files) are the right ones and are
repeated here rather than softened: 20 briefs, one model family, one attempt —
"Not a benchmark"; the briefs were written by someone who knows the language;
the default scene is an unusually strong worked example doing a lot of the work;
**16 of 20 R1 scenes and all 20 R2 scenes were never rendered**, and "compiling
is not being correct."

What it does support, and this is not nothing: **an unfamiliar model, given the
whole user-facing surface, wrote 40 non-trivial scenes across two runs with a
zero first-pass failure rate.** What it does not support: any claim about the
error messages as a differentiator, any claim about visual correctness beyond
four checked scenes, and any claim at all about post-3B authorability.

### 4.4 Primary evidence on LLMs and unfamiliar DSLs: there isn't any

Searched for, and **not found**:

- **A benchmark measuring DSL generation.** The most relevant published,
  methodologically-documented multilingual code-generation benchmark is
  [MultiPL-E](https://github.com/nuprl/MultiPL-E) ("MultiPL-E: A Scalable and
  Polyglot Approach to Benchmarking Neural Code Generation", IEEE TSE;
  [DOI record](https://ieeexplore.ieee.org/abstract/document/10103177)). It
  translates HumanEval and MBPP into 18 additional languages — **all
  general-purpose**. It measures nothing about DSLs, and its low-resource
  results are an analogy for Marey's situation, not a measurement of it.
- **A model-provider claim about DSLs.** Anthropic's
  [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
  publishes no coding benchmark figures and makes no statement about
  domain-specific, custom, or low-resource languages. Its only relevant claim is
  the generic *"Top-tier results in reasoning, coding, multilingual tasks…"*

**Do not fill this gap.** The `eval/` corpus is currently the only measurement
of Marey-specific machine authorability that exists, in this repo or anywhere.

### 4.5 One structural fact that does favour Marey

This is a genuine, checkable structural advantage rather than a hope. Marey's
entire user-facing language surface is **1,075 lines** (`docs/LANGUAGE.md`) —
46 reserved words, 26 property names (§3.1). Current frontier context windows are
**1M tokens ≈ 555k words**
([Models overview](https://platform.claude.com/docs/en/about-claude/models/overview),
retrieved 2026-09-09). The whole language therefore fits in a prompt with room
to spare, which is precisely the condition the `eval/` protocol reproduces.

The same is not true of React + TypeScript + Remotion's 92 root exports and 206
type-declaration files (§3.2): that surface is learnable by a model only through
*training*, not through *context*. So the vocabulary disadvantage of §3.2
partially inverts for machine authors — a small DSL can be taught in-context in
a way a large framework cannot.

The corresponding fact on the other side is that current models have **no
training data on Marey by construction** — the repo is private, `package.json`
declares `"private": true`, there is no published package, and the reliable
knowledge cutoffs of currently-shipping models (Jan 2026 – Jun 2026, same
source) all predate any public release. Every `eval/` result is therefore a
measurement of the *in-context* case only, forever, until Marey is published.

---

## 5. Governance and licensing as adoption inputs

The prior doc's §6 established the competitor licence landscape. This section
extends it in two directions: what the landscape looks like from SPDX/OSI rather
than from individual repos, and what Marey's choice actually buys or costs.

### 5.1 The landscape, from the registries

Retrieved 2026-09-09 from the
[SPDX license list data](https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json)
(list version `01b8052`, released 2026-09-03): **739 licence identifiers, of
which 152 are OSI-approved.** MIT, Apache-2.0 and MPL-2.0 are all
`isOsiApproved: true` and `isFsfLibre: true`; none is deprecated.

Competitor licences as reported by the GitHub API's own
`license.spdx_id` field, retrieved 2026-09-09:

| Project | `license.spdx_id` |
|---|---|
| `mermaid-js/mermaid` | MIT |
| `airbnb/lottie-web` | MIT |
| `rive-app/rive-runtime` | MIT |
| `motion-canvas/motion-canvas` | MIT |
| `ManimCommunity/manim`, `3b1b/manim` | MIT |
| `typst/typst` | Apache-2.0 |
| `d2lang/d2` | MPL-2.0 |
| `remotion-dev/remotion` | **`NOASSERTION`** |

`NOASSERTION` is the GitHub API's value when its licence detector cannot match
the file to a known SPDX identifier — the machine-readable confirmation of what
the prior doc established by reading the text: Remotion's Free License caps free
commercial use at "a for-profit organization with up to 3 employees."

**MIT is the default in this space, by a wide margin.** Six of eight. It is also
one of [GitHub's 13 "featured" licences](https://api.github.com/licenses).

### 5.2 What MIT or Apache-2.0 actually buys

- **It buys removal of a blocker, not a reason to adopt.** Every direct
  competitor except Remotion is already OSI-approved and permissive. Choosing
  MIT puts Marey at parity with the field, not ahead of it. The prior doc's §6
  reads MIT/Apache as placing Marey "above Remotion" and "outside GSAP's
  proprietary grant" — true, and worth keeping, but it is a *differentiator
  against exactly one and a half competitors*, not against the category.
- **Apache-2.0 buys an explicit patent grant that MIT does not have.** From the
  [SPDX text of Apache-2.0](https://raw.githubusercontent.com/spdx/license-list-data/main/text/Apache-2.0.txt),
  §3:

  > each Contributor hereby grants to You a perpetual, worldwide, non-exclusive,
  > no-charge, royalty-free, irrevocable (except as stated in this section)
  > patent license to make, have made, use, offer to sell, sell, import, and
  > otherwise transfer the Work

  MIT's text contains no patent clause at all. For a project whose *output* is
  embedded in other people's products — which is exactly Marey's Phase 5A/5B
  position — this is the one substantive difference between the two choices.
  Apache-2.0 costs the §4(b) "modified files carry prominent notices" and §4(d)
  NOTICE-file obligations; MIT costs a single attribution line.
- **It costs approximately nothing in defensibility, because the moat was never
  the licence.** Nothing in §1's measured record suggests licence choice moved
  any of these projects' curves.

### 5.3 The structural fact the roadmap has not discharged yet

Roadmap §11.2's first deliverable is "A public compiler package and explicit
open-source license." As of 2026-09-09, in this repository:

- there is **no `LICENSE` file** at the repository root (`ls LICENSE*` → no
  match);
- `package.json` declares `"name": "marey", "version": "0.3.1", "private": true`
  and has **no `license` field at all**.

So today Marey is, in the strict legal sense, **not open source and not
distributable** — `"private": true` is npm's publish blocker, and absent a
licence grant the default is exclusive copyright. Every adoption mechanism in
§2 (artifacts circulating, a repo of scenes people copy, a CI action) is gated
on discharging that one deliverable. This is stated as a fact about the current
tree, not a criticism of sequencing: Phase 5B is where it belongs.

---

## 6. Unknowable / not verified

### 6.1 Genuinely unknowable from any primary source

1. **Whether Marey will be adopted.** No source can answer this. Everything in
   §1 is other projects' history.
2. **Why Motion Canvas stalled.** §1.2 measures the decline (31,018 → 24,629
   downloads/yr, last npm release 2024-12-14). The *cause* — maintainer
   attrition, market absence, a competitor, funding — is not in the primary
   record I examined, and the difference matters enormously for how much weight
   to put on it as a precedent for Marey.
3. **How Marey acquires the first user.** §2 shows two comparables that spread
   artifact-first. Neither tells you how to originate the artifact stream.
   Manim's mechanism (be the tool behind an already-popular video channel) is
   not a strategy that can be adopted, only inherited.
4. **Whether Mermaid's growth would have looked different without GitHub.** §2.1
   shows no step function at the announcement date; it cannot show the
   counterfactual.
5. **Whether the "data determines values, structure determines shape" rule (§3.3)
   is net positive or negative for adoption.** It is simultaneously the
   differentiator and the ceiling and no source arbitrates.

### 6.2 Searched for and not found

6. **Any benchmark measuring LLM generation of unfamiliar DSLs** (§4.4).
   MultiPL-E covers 20 general-purpose languages only. No provider publishes a
   DSL claim.
7. **Any first-party statement from GitHub about *why* Mermaid was chosen.**
   Checked directly on 2026-09-09: the announcement gives no selection
   criterion. It describes Mermaid's capabilities and mentions collaboration
   with its maintainer, and explains the *implementation* (the Viewscreen
   iframe), but never says why Mermaid over an alternative. §2.1's causal
   reading therefore rests on the download timeline, not on a GitHub statement.
8. **Subscriber/view figures for 3Blue1Brown.** The YouTube Data API requires a
   key that was not available in this environment, so §2.2's "widely-watched"
   rests on the two READMEs' own framing plus `3b1b/videos`' 11,201 stars, not
   on a measured audience number.

### 6.3 Measured but weak — do not over-read

9. **The whole 2026 download column** (§1.2). Every package rose by a multiple
    in the same eight months. Whatever caused that is not a property of any of
    these projects, and I did not identify it. Treat 2026 figures as ordinal
    only. This is also why §1.2's Motion Canvas reading leans on the *release
    record* (21 months without a published release) rather than on the
    download curve alone.
10. **PyPI download figures for `manim`** (§1.1). PyPI publishes no first-party
    download API; the number is from `pypistats.org`, a third-party front end
    over PyPI's BigQuery dataset. Weakest number in the table.
11. **Contributor counts** (§1.1). Derived from `Link` header page counts,
    excluding anonymous contributors. Approximate.
12. **GitHub release asset download counts for typst and d2** (§1.1). These
    exclude every install through Homebrew, apt, `cargo install`, `go install`
    and Docker, so they undercount by an unknown factor and are not comparable
    to npm figures.
13. **Remotion's 92 root exports** (§3.2). Counted by regex over one
    `index.d.ts`; type-only re-exports are included and sub-path exports
    (`remotion/no-react` etc.) are not. It is an order-of-magnitude figure, not
    an exact API count.
14. **Marey's 58 property slots and 46 reserved words** (§3.1). Exact for the
    tree at commit time, and they will change — Phase 6 and Phase 7 both add
    language surface (roadmap §12, §13). Re-count before quoting later.

### 6.4 Deliberately not repeated here

The Mermaid build-time/view-time distribution analysis and the
GSAP/Rive/Lottie/Remotion/Motion Canvas competitive and licence-text frame are
in §5 and §6 of
[`2026-09-08-marey-direction-primary-sources.md`](./2026-09-08-marey-direction-primary-sources.md).
That document's own §7 lists eight further unverified claims, and its header
records that most of its external citations were written but never
self-checked — a caveat that carries forward to anything cited from it here.

### 6.5 Not attempted

- Any survey of *user demand* — job postings, issue trackers, forum volume.
  Not primary-source-tractable in this budget.
- Docs-site integration targets named in roadmap §11.2 (MDX, Docusaurus,
  VitePress): no measurement of how hard a third-party plugin is to land in
  each.
- Whether any existing tool already occupies "deterministic physics as a
  bakeable authoring construct." The prior doc's §6 asserts none of the four
  documents an equivalent; that was not re-verified and no fifth candidate was
  searched for.
