# Gaps Marey could credibly move into

**Date:** 2026-09-09
**Status:** Research notes. Not a design, not a roadmap change. Nothing here
supersedes `docs/specs/2026-09-01-marey-product-roadmap-design.md`.

**Relationship to the prior research.** This is the third document in
`docs/research/`.
[`2026-09-08-marey-direction-primary-sources.md`](./2026-09-08-marey-direction-primary-sources.md)
tested the roadmap's external bets. [`2026-09-09-marey-adoption-viability.md`](./2026-09-09-marey-adoption-viability.md)
measured whether the current plan can be adopted. Neither is re-derived here.

**The question this document answers.** Where — including places the current
language and architecture cannot reach — is there a *structural* advantage for
a deterministic, text-first, physics-capable compiler that emits a portable
artifact? The brief explicitly removed the constraint of Marey's present
design, so each gap below states what would have to change and what that
change costs.

**Four niches were already analysed elsewhere and are not re-reported**: web
explainer motion, LLM/agent-authored motion, motion in CI-built docs, and
deterministic brand/product motion. Charts were judged foreclosed by
Flourish/Canva. §7 records where this document's evidence *contradicts* or
*materially strengthens* one of those.

---

## 0. How to read the evidence grades

Every gap carries a grade. The grades are about *what kind of source backs the
claim*, not about how attractive the opportunity is.

| Grade | Meaning |
|---|---|
| **A — Normative** | A specification, statute, licence, or standards document says it in normative text |
| **B — First-party** | A maintainer, vendor, or standards body says it about their own product, in their own docs or tracker |
| **C — Measured** | A retrievable number with a retrieval date |
| **D — Inferred** | I reasoned from A/B/C evidence; the conclusion is mine, not a source's |
| **E — Asserted** | No source found. Recorded in §8, never used as support |

**Market-size claims are the weakest evidence in this document and are graded
D or E throughout.** A total-addressable-market number is not a reason to
build anything; a normative requirement that current tools measurably fail to
meet is. The gaps are ranked by evidence strength, not by size of prize.

### The bounded answer

Stated as narrowly as the evidence allows:

- **The property that is actually unique to Marey is not determinism — it is
  *derivability*.** A Marey scene can be read and rewritten by a compiler
  because the source states property-level intent, and because the "no escape
  hatch" rule makes it statically analysable. Remotion and Motion Canvas source
  is a general-purpose program you cannot analyse; a `.riv` is binary; Lottie
  JSON is baked geometry with no semantics attached. §7.3 argues this is the
  correction the prior competitive framing needs.
- **Three gaps are the same capability seen from three sides** — reduced-motion
  variants (§1), design-system motion choreography (§2), and one-source-N-baked-
  variants (§3). All three are *derivations* from one source. §9 proposes a
  one-afternoon experiment that tests all three at once.
- **The single most useful structural finding**: producing many variants from
  one source **does not require breaking** the "data determines values, source
  structure determines shape" rule, provided variation is in *values* and not in
  *object count* (§3, Option A). The commercially loaded capability and the
  central design rule are compatible as literally written.
- **The strongest normative evidence in the document is accessibility** (§1):
  WCAG Level A criteria, against a Lottie spec whose reduced-motion issue has
  been open since 2024-01-23 and a `lottie-web` issue closed without shipping.
- **The weakest part of the whole document is the demand side**, and it is
  uniformly weak (§8.1). Every gap here was found by locating a specification or
  a tracker that stops short. That method finds structural holes reliably and
  finds *people standing in them* not at all.
- **One gap is unreachable by extension**: interactive physics education (§6.3)
  requires mutation, guards, input, and a shipped runtime — three explicit
  language cuts plus a direct contradiction of roadmap §1. Interactivity and
  runtime-free portable artifacts are mutually exclusive, and Marey has already
  chosen.

---

## 1. Gap: accessible motion — a reduced-motion variant that is *derived*, not hand-made

**Evidence grade: A (normative) + B (first-party trackers).** The strongest
gap in this document.

### The requirement is normative and it is law in the EU

[WCAG 2.2](https://www.w3.org/TR/WCAG22/), retrieved 2026-09-09:

> **2.2.2 Pause, Stop, Hide (Level A)** — For moving, blinking, scrolling, or
> auto-updating information, all of the following are true: Moving, blinking,
> scrolling: For any moving, blinking or scrolling information that (1) starts
> automatically, (2) lasts more than five seconds, and (3) is presented in
> parallel with other content, there is a mechanism for the user to pause,
> stop, or hide it…

> **2.3.1 Three Flashes or Below Threshold (Level A)** — Web pages do not
> contain anything that flashes more than three times in any one second
> period, or the flash is below the general flash and red flash thresholds.

> **2.3.3 Animation from Interactions (Level AAA)** — Motion animation
> triggered by interaction can be disabled, unless the animation is essential
> to the functionality or the information being conveyed.

> **1.1.1 Non-text Content (Level A)** — If non-text content is time-based
> media, then text alternatives at least provide descriptive identification of
> the non-text content.

Note the levels: **2.2.2 and 2.3.1 are Level A**, the floor. 2.3.3 is AAA and
therefore not a compliance requirement under most regimes — do not overstate
it.

**The EU deadline has already passed.**
[Directive (EU) 2019/882](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32019L0882)
(the European Accessibility Act) requires Member States to apply the
transposing measures **by 28 June 2025**; products "placed on the market after
28 June 2025" and services "provided to consumers after 28 June 2025" must
comply, with a five-year transitional arrangement for pre-existing products
and up to twenty years for self-service terminals already in use (retrieved
2026-09-09).

*Caveat, graded honestly:* the Directive's own Annex I states functional
accessibility requirements; **it does not name WCAG**. The route from the
statute to the specific success criteria above runs through the harmonised
standard EN 301 549, **which I did not read** (§8.2). So "WCAG 2.2 SC 2.2.2 is
legally binding in the EU as of June 2025" is a **D-grade inference**, not an
A-grade one. What is A-grade is: the WCAG criteria exist and are Level A, and
the EAA's application date is 28 June 2025.

### What current motion formats do about it — from their own trackers

- **Lottie's specification has no reduced-motion concept.** The proposal is an
  *open issue* on the spec repo:
  [`lottie/lottie-spec#7`, "[For Consideration] - Prefers reduced motion
  fallback"](https://github.com/lottie/lottie-spec/issues/7) — **state: open,
  created 2024-01-23, last updated 2024-01-29, 1 comment** (fetched from
  `api.github.com` 2026-09-09). The proposal is a *convention*, not a
  mechanism: name a marker "reduced motion" and have players seek to it. The
  issue's own support table records iOS yes, Android no, Web no.
- **`lottie-web` closed its reduced-motion request without shipping it.**
  [`airbnb/lottie-web#1986`](https://github.com/airbnb/lottie-web/issues/1986)
  — **state: closed, opened 2020-02-13, closed 2020-03-06, 8 comments**. The
  CSS remedy discussed in it does not work: Lottie's SVG/canvas renderers are
  driven by a JavaScript rAF loop, so `animation: none` in a
  `prefers-reduced-motion` block stops nothing.

So: the dominant portable motion format (28.4M npm downloads/30d, prior doc
§1.1) has **no normative reduced-motion story, an open spec issue two and a
half years cold, and a closed player issue** — while the accessibility
requirement it collides with is Level A.

### Why this is structural for Marey rather than incidental

A reduced-motion variant is a *transformation of the animation*, and you can
only transform what you can read. The comparison is exact:

| Format | Can a tool derive a reduced-motion variant from it? |
|---|---|
| MP4/WebM | No. Pixels. |
| Lottie JSON | Only by editing baked bezier keyframes with no semantics attached — you cannot tell a decorative wobble from an essential state change |
| Rive `.riv` | Binary; authored in the editor |
| **Marey source** | The animation is *named property intent*: `animate { property: position, to: …, duration: … }` (`src/compiler/languageContract.ts:372-384`). A compiler pass can drop, shorten, or freeze animations by property class |

Marey's `animate` block declares *which property* is moving
(`property`, `to`, `duration`, `easing`, `loop`, `yoyo`, `handoff` — exactly
seven). That is enough structure for a compiler to emit two artifacts from one
source: full motion, and a reduced variant where (say) `position`/`rotation`
animations collapse to their end state while `alpha` cross-fades survive.
Nothing in Lottie or a video file carries the information needed to make that
choice.

The same structure supports the 1.1.1 obligation: a text description of a
scene can be *generated* from the source, because the source names the objects
and states what happens to them. From a `.riv` or an `.mp4`, it cannot.

### What Marey would have to change

**Small, and mostly additive.** This is the cheapest gap in the document.

1. An export-time transform pass over the IR with a documented reduction
   policy (which property classes freeze, which survive). New code, no new
   syntax.
2. A per-`animate` or per-object annotation for *essential vs decorative* —
   because 2.3.3's exception is "unless the animation is essential". That is
   **one new property on one block**, e.g. `motion: essential | decorative`.
   Against the measured surface of 26 property names and 58 property slots
   (adoption doc §3.1) this is a rounding error.
3. A text-description emitter. Pure output, no language change.
4. Emit paired artifacts, and a `<picture>`-style or JS snippet that selects
   between them on `prefers-reduced-motion`.

**Cost:** low. **Risk:** the reduction policy is a design judgement nobody has
specified, and a wrong one produces motion that is neither accessible nor
correct.

### What would have to be true

- That someone is *forced* to produce reduced-motion variants and currently
  hand-makes them. **Not verified** (§8.1). The normative requirement is
  proven; that it converts into tool-purchasing behaviour is not.
- That flash-threshold checking (2.3.1) is worth automating. Marey *could*
  statically analyse a scene for >3 flashes/second, which no motion tool in
  the comparison set claims to do — but I found no source showing anyone wants
  this (§8.1).

---

## 2. Gap: motion in design systems — the standard stops before choreography

**Evidence grade: A (spec text).**

The [Design Tokens Format Module](https://www.designtokens.org/TR/drafts/format/)
(version 2025.10, retrieved 2026-09-09) is the interchange format that design
systems are converging on. It defines thirteen types: color, dimension, font
family, font weight, duration, cubic Bézier, number, and the composites stroke
style, border, transition, shadow, gradient, typography.

Three of those touch motion, and the spec's own definitions show exactly where
it stops:

> **duration** — "Represents the length of time in milliseconds an animation
> or animation cycle takes to complete, such as 200 milliseconds."

> **cubicBezier** — "Represents how the value of an animated property
> progresses towards completion over the duration of an animation… The value
> _MUST_ be an array containing four numbers."

> **transition** — "Represents a animated transition between two states. The
> `$type` property _MUST_ be set to the string `transition`. The value _MUST_
> be an object with the following properties: `duration`, `delay`, and
> `timingFunction`."

**The spec defines no type for keyframes, multi-step animation, choreography,
or sequencing.** A design system can therefore standardise *how fast* and
*what curve*, and then has no standard vocabulary at all for *what actually
moves, in what order*. That part is currently prose in a guidelines page plus
a video or Lottie file that is not machine-checkable against the tokens.

This is a documented boundary in an active standard, which is a stronger form
of evidence than a market claim: the gap is visible in the spec's own type
list.

### The gap is acknowledged in the standards body's own tracker, and unfilled for four years

`GET https://api.github.com/search/issues?q=repo:design-tokens/community-group+animation+OR+keyframe+in:title+is:issue`
returns `total_count: 2` (retrieved 2026-09-09), and both are open:

**[#158, "Animation description by solely Bezier Curve is inadequate"](https://github.com/design-tokens/community-group/issues/158)**
— opened **2022-07-09**, still open, 7 comments:

> As far as I can tell, the sole type for describing animation in tokens is
> the Cubic Bezier. The motivation for this limitation _may_ be that CSS
> currently natively only supports Cubic Bezier. … I think it's important that
> design tokens provide more comprehensive support for UX animation. **Tools
> are already ahead of the standard.**

**Four years open.**

**[#429, "Motion beyond `transition`: gauging interest in choreography-level
token types (spring, keyframe sequences, named patterns)"](https://github.com/design-tokens/community-group/issues/429)**
— opened **2026-06-28**, open, 8 comments. Quoting it at length because it
states the gap better than I could, and it is first-party to the standards
community rather than to any vendor:

> **Keyframe / multi-step sequences.** `transition` is two-state. Real brand
> motion is frequently multi-step (overshoot-and-settle,
> anticipation→action→follow-through, staggered entrances). A `keyframes`-style
> composite … would let a sequence be a single named token instead of escaping
> to code.

> **Named motion patterns / presets.** The thing design systems actually
> publish ("emphasized-decelerate", "enter", "exit", a brand's signature
> reveal) is a *named, reusable choreography*, not a raw curve.

> **Why it matters / why now:** motion is the one foundation most design
> systems still document in prose (a PDF, a Notion doc, a slide deck) rather
> than govern as tokens — precisely because the token format stops at
> single-property transitions. Tooling and AI assistants increasingly *consume*
> tokens to generate or QA motion; without a choreography type they fall back
> to guessing, which is exactly where brand-specific motion breaks down.

> **Spring / physics-based motion.** Springs are now the default in a lot of
> modern systems (SwiftUI, Framer Motion, CSS `linear()`-approximated springs).
> They're parameterized by stiffness/damping/mass (or response/bounce), *not*
> by a single cubic-bézier. There's no token type that captures a spring today,
> so design systems that standardize on springs can't express their core motion
> as a token at all.

**Honest grading.** These are *individual community-group issues*, not
working-group resolutions or normative text. The A-grade claim is only "the
spec's type list stops at `transition`". The B-grade claim is "people in the
standards community say the choreography layer is missing and want it". Neither
is evidence that a *product* would sell.

### Three consequences for Marey, one of them immediately actionable

1. **`sequence` / `parallel` / `template` are already the missing vocabulary.**
   Ordered and concurrent composition of named property animations, referenced
   by name, is exactly items 2 and 3 of #429.
2. **Spring easing has external demand evidence now.** Roadmap §12 defers spring
   easing until "briefs demonstrate demand". #158 (2022, open, 7 comments) and
   #429 (2026, open, 8 comments) are demand from outside this repo, naming
   SwiftUI and Framer Motion as the reason. That is a concrete input the roadmap
   did not have. It is also the one item where Marey's Matter.js integration is
   an asset rather than decoration — a spring is a physics primitive.
3. **"AI assistants consume tokens to generate or QA motion … they fall back to
   guessing"** is, in a standards tracker, the same argument the repo makes for
   machine authorability. It is not proof, but it is the closest thing to
   external corroboration of that thesis found anywhere in this research.

Marey's `sequence` and `parallel` blocks
(`src/compiler/languageContract.ts:372-384`) are that vocabulary, and a
`.marey` file is diffable text CI can compile — which is what a *spec* has to
be if it is to be reviewed in a pull request alongside the tokens it
references.

### What Marey would have to change

**Medium, and it cuts against a current design rule.**

1. **Consume tokens.** A motion spec that hardcodes `duration: 300` instead of
   referencing `motion.duration.medium` is not part of the design system.
   Marey has `let` bindings, but "no I/O" is explicit in
   `docs/LANGUAGE.md`'s "Where expressions stop" — *"There are no maps and no
   I/O."* Importing a token JSON file is I/O. Options: a CLI flag that injects
   bindings, or an `import`-like construct. The first is cheap and preserves
   the rule; the second breaks it. This is the same decision as §3's Option A
   versus Option C, arrived at from a different direction.
2. **Cubic-bezier easing.** DTCG's `cubicBezier` is four numbers. Marey's
   easing is *quadratic* with four keywords — verified directly at
   `src/compiler/renderer/sceneRuntime.ts:57-66`:
   `case "easeIn": return t * t;` / `case "easeOut": return t * (2 - t);` /
   `case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;` /
   `default: return t;`. Accepting a token-defined curve means adding
   cubic-bezier easing. The prior doc's §7.1 flags the same quadratic-versus-cubic
   mismatch as an open question for Lottie easing round-trip, so the two
   motivations coincide and one change discharges both.
3. **`delay`.** DTCG's `transition` composite requires `duration`, `delay`,
   and `timingFunction`. Marey's `animate` has no `delay`. It is already
   scheduled for Phase 6 ("add `delay` and `stagger`", roadmap §12), so this
   costs nothing extra.

**Cost:** medium. Two of the three items are already on the roadmap for other
reasons; the token-import item is the one with a real design decision in it.

### What would have to be true

- That design-system teams want motion specified as executable source rather
  than a Figma prototype plus prose. **Not verified** (§8.1) — I found the
  *spec-side* gap, not demand-side evidence.
- That "the tokens and the motion spec are checked together in CI" is a thing
  anyone asks for. Unverified.

---

## 3. Gap: baked variants at scale — the incumbents answer variation with a *runtime*, and a large class of delivery channels forbids one

**Evidence grade: B (first-party engineering accounts and product docs) +
C (measured).** This is the gap that requires the largest language change, and
the one where the structural argument is cleanest.

### The shape of the problem, from the people who hit it

**Tinder** documented the naive path and rejected it. From
["How Tinder Solves Complex Lottie Localizations with Server Driven UI"](https://medium.com/tinder/how-tinder-solves-complex-lottie-localizations-with-server-driven-ui-e307c6bab137)
(Tinder Tech Blog): making a new animation per campaign locale "would require
an After Effects engineer to create **40 different animations** in different
languages"; it "technically worked" but "the manpower and manual processes
made it difficult to scale."

*Sourcing caveat, stated plainly:* `medium.com` returned **HTTP 403** to
`WebFetch` in this environment. The passage above is reconstructed from two
independent `WebSearch` retrievals of the same URL, which agreed on the number,
the `textProvider` mechanism, and the layer-naming requirement. I did not read
the page directly. Treat it as B-minus.

Their fix, and Lottie's only real answer, is **runtime substitution**: name
each text layer, keep it a live text layer rather than a shape, ship
translations from the backend, and override them on the client via the SDK's
`textProvider`.

**Rive's answer is the same shape.** Its
[Text runtime guide](https://help.rive.app/runtimes/text) documents
`.getTextRunValue()` / `.setTextRunValue()` against named text runs, and notes
that "if the name is not set manually in the editor, the name will not be part
of the exported .riv". The newer recommended path is
[Data Binding](https://rive.app/docs/scripting/data-binding) — "instead of
pushing pixels, developers push data". For *full* localisation, not just
string swaps but per-language styling, the
[community-recommended pattern](https://community.rive.app/c/support/language-localization-in-rive)
is an enum plus **one state-machine timeline per language**.

Both are runtime mechanisms. Both require you to ship the player.

### The structural point: where you cannot ship a player, neither answer exists

`textProvider` and `setTextRunValue` are unavailable in every channel that
accepts a *file* rather than hosting *your code*:

- video-first ad platforms and broadcast/CTV delivery, which ingest an encoded
  file;
- email, which supports GIF/APNG and little else;
- digital-signage players and kiosk firmware;
- PDF and print derivatives;
- microcontroller displays (§5).

**Evidence grade for that channel list: D (inferred).** I did not verify each
platform's ingest specification (§8.1). The *mechanism* — that a runtime
substitution API cannot help a consumer who never runs your runtime — is not
inferred; it is definitional.

For those channels the only options today are (a) N hand-exports, exactly the
cost Tinder measured and rejected, or (b) a hosted render API. Option (b) is a
real, populated, competitive market — **not an empty gap**:

| Vendor | Model | Indicative price |
|---|---|---|
| [Shotstack](https://shotstack.io) | JSON timeline to rendered video | from ~$49/mo for 200 min |
| [Creatomate](https://creatomate.com) | template + data, batch renders | from ~$41/mo for ~144 min |
| [JSON2Video](https://json2video.com) | JSON to video | $49/mo for 200 min |
| Plainly | After Effects templates rendered by API | — |

Pricing retrieved 2026-09-09 from search results. **Every one of those pages is
vendor-authored comparison marketing and none was independently verified — grade
C-minus at best, and the brief's own rule says marketing from hosted
alternatives is not evidence of a gap.** The decision-relevant fact is not the
prices; it is that **four or more funded vendors bill per rendered minute for
exactly this**, which is simultaneously evidence of demand and evidence that
the territory is contested.

The brief asked whether programmatic video at volume is "genuinely served or
just claimed". On this record it is **genuinely served**, and Marey would enter
a price-competitive hosted market from behind.

### Where Marey's advantage would be, if it has one

Not "we can make videos from data" — they all can. Three things none of them
has:

1. **The variant source is a diffable file in your repository**, reviewed in a
   pull request, rather than a template in a vendor console.
2. **Rendering is local or in your own CI**, so the marginal cost of the 41st
   locale is CPU time rather than a metered minute — and the data never leaves
   the building.
3. **Deterministic output**, which matters when a legal or brand reviewer
   approved variant 17 and you must show variant 17 is byte-for-byte unchanged.
   Note the prior doc's §3 limit: byte-identical *video* across machines is not
   achievable; frame-buffer hashes within one environment are.

### What Marey would have to change

**The largest language change in this document, and it touches a stated design
rule.** `docs/LANGUAGE.md`'s "Where expressions stop" says:

> **Nothing mutates.** … There are no maps and no I/O.

and the roadmap's non-goals (§4) include "arbitrary objects, file access, and
network access in source."

| Option | Mechanism | Breaks the rule? | Cost |
|---|---|---|---|
| **A. Parameter injection** | `marey render scene.marey --set locale=fr --set name="…"` binds CLI values to `let` names | **No.** Only *values* come from outside; the source's literal structure still determines shape | Low |
| **B. Data-file binding** | `marey render scene.marey --data rows.json`, one artifact per row, `generate` over the rows | The shape rule, yes — `generate`'s cardinality would come from a file | Medium; a genuine semantic decision |
| **C. `import` in source** | Source reads files directly | Yes. This is I/O in source, explicitly cut | High, and probably not worth it |

**Option A is the sharp result here.** The rule is *"Data determines values.
The source's literal structure determines shape."* A CLI flag supplying values
does not violate it at all — reading the source still tells you exactly how many
objects exist and what they are named, for every variant. **Marey can support
one-source-many-variants without amending its central design rule**, provided
the object *count* never varies by variant.

Option B is where it bites. A middle path exists — require a declared
cardinality (`generate i in 0 to 11 { … }` indexing into injected data), so the
shape stays literal and only values come from data — and that middle path is
worth designing before anyone reaches for full B.

**Also required, and currently missing entirely: text metrics.** Localised
strings change width. Marey has a `text` block but no measured-width concept
and no `min`/`max`/`abs` or layout arithmetic ("Where expressions stop"), so a
French string 40% longer than the English one overflows with no recourse in the
language. Rive advertises automatic typographic reflow as a localisation
benefit; Marey has no equivalent. This is a specific, currently-unsolved
blocker for the localisation use case and it is not on the roadmap.

### What would have to be true

- That enough teams need **baked** variants rather than runtime-substituted
  ones. Tinder chose runtime substitution *because they control the client*.
  The target is everyone who does not, and I found no measurement of that
  population (§8.1).
- That local rendering beats ~$49/month. Unverified; plausible only at volume
  or where data cannot leave the building.

---

## 4. Gap: Lottie's specification is smaller than Lottie's usage, and the shortfall is enumerated in its own tracker

**Evidence grade: A (spec text) + B (the spec repo's own open issues).**

The prior research (§2 of the 2026-09-08 doc) established that the Lottie spec
is incomplete and has no text layer. This section adds what that document did
not have: **the maintainers' own list of what is missing.**

Re-verified 2026-09-09 against
[the 1.0.1 Layers section](https://lottie.github.io/lottie-spec/1.0.1/specs/layers/):
still exactly five layer types — `ty` 0 Precomposition, 1 Solid, 2 Image,
3 Null, 4 Shape. **Still no text layer.** The prior doc's finding stands.

`GET https://api.github.com/search/issues?q=repo:lottie/lottie-spec+is:issue+is:open`
returns **`total_count: 30`** (retrieved 2026-09-09). Fourteen are
missing-capability requests, most opened in one batch on 2025-01-21:

| # | Title | Created | State |
|---|---|---|---|
| 128 | **Add Text Layer** | 2025-01-21 | open — 8 comments, last activity 2026-06-08 |
| 125 | Video layers | 2025-01-21 | open |
| 124 | Audio layers / assets | 2025-01-21 | open |
| 131 | Layer effects | 2025-01-21 | open |
| 132 | Layer styles | 2025-01-21 | open |
| 133 | Data layer | 2025-01-21 | open |
| 118–123 | Repeater, Rounded Corners, Merge Path, Offset Path, Zig Zag, Mask Expansion | 2025-01-21 | all open |
| 156 | Expressions | 2025-10-14 | open |
| 129 | Add Compatibility Profiles | 2025-01-21 | open |
| 27 | Features missing from the specs | 2024-04-17 | open |
| 7 | Prefers reduced motion fallback | 2024-01-23 | open |

**"Add Text Layer" has been open for nineteen months** on the specification of
a format doing 28.4M `lottie-web` downloads per 30 days (prior doc §1.1) plus
**5,774,992 downloads in the 30 days to 2026-09-08** for
[`@lottiefiles/dotlottie-web`](https://api.npmjs.org/downloads/point/2026-08-09:2026-09-08/@lottiefiles/dotlottie-web)
(retrieved 2026-09-09). That dotLottie figure **exceeds `@rive-app/canvas`'s
4,590,044** over a comparable window, and it is a package the prior research did
not measure at all — worth adding to any future competitor table.

The independent reimplementation confirms the same shape from the other side.
[ThorVG's Lottie support matrix](https://github.com/thorvg/thorvg/wiki/Lottie-Support)
reports a **"75% Overall Support Rate (72% fully supported + 3% partially
supported)"** for the expressions engine, lists `velocity`, `speed`, `smooth()`,
`key(markerName)`, `inTangents`, `outTangents`, `isClosed` and `lookAt()` as
unsupported, and states for audio: "All audio-related properties return default
values (`false` or `0`). No actual audio processing."

### Why this matters to Marey, and the honest counter-argument

**The optimistic reading**: the format everyone exports to cannot express text,
effects, video, audio or expressions in its normative form, so users fall back
to MP4 and lose everything text-first buys them.

**The counter-argument, which I judge stronger**: this is a gap in *Lottie*, not
a gap in the *market*. Players implement far more than the spec — ThorVG's text
support is extensive, `lottie-web` renders After Effects text fine. Users are
not blocked; they are relying on player behaviour rather than spec text. The
consequence is portability risk, not unmet need, and practitioners tolerate
portability risk constantly.

**What it does establish**, and this is the load-bearing conclusion: Marey's
Phase 5A bet targets a **moving, incomplete format with 30 open spec issues and
no rendering conformance suite** (prior doc §2). Planning Marey→Lottie fidelity
as if the spec were stable is the risk. Emitting the shape-layer subset — exactly
what roadmap §10.1 scoped — remains correct, and the reason is now sharper: the
shape-layer subset is the *only* part of Lottie that is both normative and
stable.

**Change required of Marey: none.** This is a risk finding, not a new direction.

---

## 5. Gap: motion on microcontrollers — where "a compiled artifact beats shipping a runtime" is literally true

**Evidence grade: B (first-party issue tracker) + D (inferred).**

The embedded-UI stack has converged on [LVGL](https://github.com/lvgl/lvgl),
and LVGL's Lottie support is a **ThorVG-backed vector rasteriser running on the
device**. That is visible in LVGL's own issue titles (fetched from
`api.github.com/search/issues?q=repo:lvgl/lvgl+lottie+in:title`, 2026-09-09):
"lottie with the new ThorVG support" (#5427, 2024-01-23), "fix(lottie): use
non-premultipled colors in ThorVG" (#7771, 2025-02-13), "Failed to build THORVG
for lottie on esp-idf" (#7373, 2024-11-29), "feat(lottie): support rendering
Lotties with draw units" (#9544, 2026-01-09).

The cost is documented in the tracker. From
[`lvgl/lvgl#7402`, "LVGL Lottie draw buffer cannot allocate from external memory
esp32"](https://api.github.com/repos/lvgl/lvgl/issues/7402) (closed, opened
2024-12-03): on an **ESP32-S3 with 8 MB of external PSRAM**, the reporter could
not get `lv_lottie_set_buffer` past **180×180 pixels**, despite allocating
240×240×4 bytes from SPIRAM via
`heap_caps_malloc(240 * 240 * 4, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`.

So playing a Lottie on a mid-range MCU costs a full-frame ARGB scratch buffer,
plus a general-purpose bezier rasteriser, plus a JSON parser — to move a few
shapes.

### The structural argument

Marey's IR is a scene graph of primitives with per-tick transforms
(`src/compiler/sceneIR.ts`), and the deterministic fixed-tick clock
(`TICK_HZ = 120`, `src/compiler/sceneIR.ts:14`) means every frame's transform is
computable ahead of time. An export target emitting **a table of transforms over
LVGL's own native objects** would need no vector rasteriser, no JSON parser and
no scratch buffer. That is a category difference in resource cost, not a
percentage one.

This is not a claim that it beats Lottie *visually*. It cannot do gradients,
trim paths, or arbitrary bezier art. It is a claim about a specific trade:
Marey's language is *already* restricted to circle, rectangle, polygon, line,
text and group (`src/compiler/languageContract.ts:372-384`) — a set that maps
almost one-to-one onto what an embedded UI toolkit draws natively. **The
language's deliberate smallness, a liability everywhere else in this document,
is the asset here.**

### What Marey would have to change

**Medium-to-large, and it is all new backend — no language change.**

1. A non-web export backend emitting C source or a binary transform table.
   Everything today assumes a browser: the PixiJS renderer
   (`src/compiler/renderer/adapter.ts`), the Monaco IDE, WebCodecs export
   (roadmap §10.2).
2. A resource budget model. Frame count × animated objects × properties is flash
   and RAM on an MCU, and Marey currently permits 10,000-element lists and
   15,000 total expansions (`docs/LANGUAGE.md`, "Limits the compiler enforces").
   Those limits are absurd for a 512 KB part.
3. Integer or fixed-point evaluation. Marey folds expressions to
   double-precision literals at parse time; an MCU without an FPU wants Q16.16.
4. A device-side player, plus build integration. Small in bytes, not small in
   maintenance: this is a second platform, permanently.

**Cost: high.** The prior doc §3 already found `marey export` cannot run
WebCodecs on Node without a headless browser or a native polyfill. Targeting
MCUs means a compiler backend that never touches a browser at all — a bigger
architectural commitment than any language change in this document.

### What would have to be true

- That embedded product teams want motion beyond what they hand-code today.
  **Not verified** (§8.1). LVGL's Lottie tickets prove *some* do — they are
  paying real cost to get Lottie onto an ESP32 — but I have no measure of how
  many.
- That "no vendor cloud, no runtime, source in the firmware repo" is worth
  something to an embedded team. Plausible, unmeasured.
- That the visual ceiling (no gradients, no arbitrary paths) is acceptable.
  Unknown.

---

## 6. Weaker gaps, ranked below the four above but not dismissed

### 6.1 Motion is the one part of a UI that nobody regression-tests

**Evidence grade: A (first-party tool docs).**

The industry-standard browser test runner turns motion **off by default** in
order to take a screenshot. From
[Playwright's `toHaveScreenshot` documentation](https://playwright.dev/docs/api/class-pageassertions):

> When set to `"disabled"`, stops CSS animations, CSS transitions and Web
> Animations. Animations get different treatment depending on their duration:
> finite animations are fast-forwarded to completion, so they'll fire
> `transitionend` event. infinite animations are canceled to initial state,
> and then played over after the screenshot.

and the default value of the option is `"disabled"`.

That is a candid admission encoded in a default: **animation is the thing that
makes visual testing non-deterministic, so the tooling excises it.** The
practical consequence is that a UI's motion is the only visual property with no
regression gate at all — a designer's 300 ms ease-out can silently become 900 ms
linear and no test in the repository will notice.

Marey's Phase 4 Gate B ("repeated exports produce identical frame hashes",
roadmap §9.4) is, structurally, a motion regression harness. Two ways to
exploit that, of very different cost:

- **Cheap and tractable**: Marey is the *reference*. The motion spec compiles to
  golden frames in CI; the application's recorded frames are compared to them
  within tolerance. No runtime, no new output target, and it composes directly
  with §2's design-token angle.
- **Expensive and probably wrong**: Marey drives the application's motion,
  which needs a DOM/CSS/Web Animations output target and therefore a runtime
  inside the product — the opposite of "artifacts that play without the Marey
  runtime" (roadmap §1).

**Not verified**: that anyone wants a motion regression gate. Playwright's
default proves the *problem* is real and universally worked around; it does not
prove anyone would buy a fix (§8.1).

### 6.2 Evidentiary, forensic, and regulated visualisation

**Evidence grade: A on the rule text, E on demand.** Listed because the brief
asked about contexts where determinism is a hard requirement; kept low because
I found no demand evidence at all.

The requirement is statutory. [Federal Rule of Evidence 901](https://www.law.cornell.edu/rules/fre/rule_901):

> **(a) In General.** To satisfy the requirement of authenticating or
> identifying an item of evidence, the proponent must produce evidence
> sufficient to support a finding that the item is what the proponent claims it
> is.

> **(b)(9) Evidence About a Process or System.** Evidence describing a process
> or system and showing that it produces an accurate result.

A demonstrative animation offered under 901(b)(9) must be defended as the output
of a described, accurate process. A text source that is diffable, re-runnable,
and produces identical output on repeat is a materially better artifact to
defend under cross-examination than a `.riv` file or an After Effects project.

**Why it still ranks low, and these are disqualifying-shaped rather than
minor:**

1. **Matter.js is not a validated engineering solver.** Marey's physics is a 2D
   game-quality rigid-body engine with a documented body cap
   (`MAX_PHYSICS_BODIES = 500`, `src/compiler/typeChecker/physicsCost.ts:3`).
   Offering it as the basis of an accident reconstruction would be
   irresponsible, and the existing tools in that field (PC-Crash, HVE) are
   validated against test data. Marey could credibly animate a *timeline* or a
   *schematic*, not a *reconstruction*.
2. **No units.** Marey numbers are unitless pixels. Evidentiary work is metres
   and seconds.
3. **No demand evidence whatsoever.** I did not find a practitioner complaint, a
   tooling gap, or a market. Grade E (§8.1).

The same structure applies to regulated promotional material (pharma MLR
review, financial disclosures) where every asset is versioned and re-approved.
I did not research that at all (§8.3) — flagging it as the adjacent variant with
a plausibly better demand story, since the review burden there is recurring
rather than one-off.

### 6.3 Interactive physics education — the biggest change, and it contradicts the product statement

**Evidence grade: C-minus (search-derived; primary fetch failed).**

The brief asked about "education/simulation of physical systems — where the
physics engine is the product". The dominant incumbent is
[PhET Interactive Simulations](https://phet.colorado.edu/) at CU Boulder.
Figures surfaced by search on 2026-09-09 — **`phet.colorado.edu` pages I fetched
returned no statistics and the numbers below come from search-result summaries,
not from a page I read** — put it at 170+ simulations, 130+ languages, ~250M sim
uses per year and ~1.9B total since 2002, all open source. Treat every one of
those as unverified (§8.2).

Whatever the exact figures, the structural finding does not depend on them:
**PhET's product is interactivity.** A student drags a mass, changes gravity,
and observes. Marey has no input model, no state machine, and no runtime API.

**What Marey would have to change: everything the product statement rules out.**
Adding input events, mutable state, and per-user branching would require:

- mutation, which "Where expressions stop" forbids outright;
- a conditional *guard* (`if c { circle x { } }`), which the "structure
  determines shape" rule forbids by name;
- a shipped runtime — which is in direct opposition to roadmap §1's "portable
  artifacts that do not require the Marey runtime."

**This is the one gap in the document that cannot be reached by extension.** It
is a different product. Recording it because the brief asked, and because
naming the contradiction explicitly is more useful than omitting the option:
**interactivity and runtime-free portable artifacts are mutually exclusive
goals, and Marey has already chosen.** Rive chose the other branch and, on the
prior doc's §6 evidence, is now adding Lua scripting and state machines on top
of it.

---

## 7. Where this research contradicts or strengthens the two prior documents

Recorded separately because the brief asked for contradictions rather than
confirmation, and because a correction is more useful than agreement.

### 7.1 Correction: Motion Canvas's release gap is 19 months, not 21

The adoption doc (§1.2) states "the project's own release record stopped. Its
latest npm release is `3.17.2`, published 2024-12-14; the newest GitHub release
is `v3.18.0-alpha.0`, 2025-02-16" and concludes "**Twenty-one months with no
published release**."

Verified 2026-09-09 against
[`registry.npmjs.org/@motion-canvas/core`](https://registry.npmjs.org/@motion-canvas/core):
the latest version is **`3.18.0-alpha.0`, published 2025-02-16**, and it *is on
npm*, not only on GitHub. Preceding versions: `3.17.2` (2024-12-14), `3.17.0`
(2024-08-13), `3.16.0` (2024-05-16). Nothing published in 2026.

The accurate statement is: **no stable release in 21 months, no release of any
kind in 19 months.** The conclusion is unchanged; the number should be corrected
if quoted.

### 7.2 Addition: the competitor table omits a package larger than Rive's

`@lottiefiles/dotlottie-web` did **5,774,992 downloads in the 30 days to
2026-09-08** (§4), which is larger than `@rive-app/canvas`'s 4,590,044 over a
comparable window. It appears in neither prior document. Any future
Lottie-versus-Rive framing should include it, and it strengthens the prior
doc's §1 point 4 — the output *formats* are much larger than the authoring
*tools*.

### 7.3 Strengthening: "deterministic" is not the differentiator, but *derivable* is

The prior doc §6 concluded, correctly, that "deterministic is not a
differentiator" because Remotion and Motion Canvas both document seeded-RNG
determinism.

§1 of this document identifies what does survive that objection: not that Marey
*runs* the same twice, but that a Marey scene can be **read and transformed by a
compiler** because the source states property-level intent. A reduced-motion
variant, a generated text description, a flash-rate analysis, and a
locale-swapped variant are all *derivations* — and none of Remotion, Motion
Canvas, Rive or a Lottie file supports them, for different reasons in each case
(a React component is a Turing-complete program you cannot analyse; a `.riv` is
binary; Lottie JSON is baked beziers with no semantics attached).

**Derivability, not determinism, is the property that is actually unique.** It
is a direct consequence of the same "no escape hatch" rule that the adoption doc
§3.3 identified as the ceiling. That rule is what makes Marey source
statically analysable — the ceiling and the moat are the same wall, seen from
opposite sides.

### 7.4 Strengthening: the central design rule does not block the commercial case

The adoption doc §3.3 frames "data determines values; structure determines
shape" as a hard bound on expressible scenes. §3 of this document finds that the
single most commercially-loaded capability adjacent to it —
**one source, N baked variants** — is compatible with the rule *as literally
written*, via CLI value injection (Option A). Only the harder form (object
*count* varying with external data) breaks it.

This is a materially stronger version of a prior conclusion rather than a
contradiction: the rule bounds *shape*, and most variant work is about *values*.

### 7.5 Not contradicted

- The Mermaid build-time/view-time split (prior doc §5). Not re-examined.
- The finding that charts are foreclosed by Flourish/Canva. Not re-examined; no
  evidence found either way.
- The Lottie spec's incompleteness (prior doc §2). Re-verified and extended
  (§4).

---

## 8. Not verified, not found, and not attempted

The honest section. Nothing below should be quoted as a finding.

### 8.1 The demand side is unverified for every single gap in this document

This is the most important limitation and it applies uniformly. What I found is
**supply-side**: specifications that stop short, trackers with open issues,
tools whose defaults concede a problem, and engineering blogs describing a cost.
What I did not find, for any gap, is a measurement of how many people have the
pain or would pay to remove it.

Specifically not found:

1. Anyone stating they hand-make reduced-motion animation variants (§1).
2. Any measurement of what fraction of users enable OS reduce-motion. Chrome
   Platform Status returned no content to `WebFetch`; search surfaced only
   secondary blog figures, which I have excluded.
3. Any demand for automated flash-threshold (WCAG 2.3.1) analysis of animation
   (§1).
4. Any design-system team asking for motion as executable, CI-checked source
   (§2). DTCG #429 is a request to a standards body, not a purchase signal.
5. Any measurement of the population that needs **baked** rather than
   runtime-substituted variants (§3).
6. Any measurement of embedded teams wanting richer motion (§5).
7. Any demand at all for evidentiary/forensic motion tooling (§6.2).
8. Whether local rendering economics beat a ~$49/month hosted render API (§3).

**Market-size claims are the weakest evidence in this document.** None is made.

### 8.2 Retrieval failures — sources I could not read directly

Recorded so the citations can be re-checked rather than trusted.

| Source | Result | Consequence |
|---|---|---|
| `medium.com` (Tinder article) | **HTTP 403** | §3's "40 different animations" quote is reconstructed from two agreeing `WebSearch` retrievals, not a direct read |
| `www.loc.gov` and `loc.gov` (Sustainability of Digital Formats) | **HTTP 403** on three paths | The archival/preservation angle was **abandoned unverified** — see §8.3 |
| `lottiefiles.com/supported-features` | **HTTP 403** | Lottie's own unsupported-feature list is cited only via the spec tracker (§4) and ThorVG's matrix, not via LottieFiles |
| `chromestatus.com` metrics | Returned page title only | No usage number for `prefers-reduced-motion` |
| `phet.colorado.edu` (`/`, `/en/about`, `/en/about/impact`) | 200 with no statistics, or 404 | §6.3's figures are search-derived only |
| `api.github.com/search/code` | **HTTP 401** (needs auth) | Could not confirm by code search whether `lottie-web` references `matchMedia` today; §1 rests on the issue trackers instead |
| `docs.lvgl.io`, `raw.githubusercontent.com/lvgl/…/lv_lottie.h`, LVGL docs `.rst` | 301/404 | §5's buffer requirement rests on issue #7402's reporter rather than on LVGL's own documentation |
| `tr.designtokens.org` | 301 → `designtokens.org/TR/drafts/format/` | Followed; §2 cites the redirect target |
| EN 301 549 (the EU harmonised accessibility standard) | **Not attempted** | §1's link from the EAA statute to specific WCAG criteria is a D-grade inference, not a read of the standard |
| `developer.apple.com` HIG "Motion" | 200 with no body content returned | Could not confirm what Apple's own guidance says about Reduce Motion alternatives |

Note that `curl` and all outbound HTTP from the shell are blocked in this
environment; `WebFetch`/`WebSearch` were the only channels available, so a 403
here does not mean the source is unavailable generally.

### 8.3 Considered and set aside, with the reason

- **Long-term preservation / archival motion.** The intended argument was that
  the Library of Congress's sustainability factors (disclosure, transparency,
  self-documentation) structurally favour a text source over a binary or a
  video, and that the death of Flash is the cautionary case. **Abandoned**: every
  `loc.gov` fetch returned 403, so I could not obtain the factor definitions
  verbatim, and a preservation argument built on a search summary is not worth
  making. Also, the honest counter is that institutions archive the *rendered
  artifact*, not the source, so the advantage may be theoretical.
- **Scientific animated figures.** Real and specified — the AAS journals treat
  animations as numbered "animated figures" rather than supplementary material,
  require MPEG-4, exclude animated GIF, and require a still-frame proxy for the
  typeset PDF. **Set aside** because the incumbents (matplotlib's `animation`
  module, Manim at ~197K PyPI downloads/month) own it and Marey's language has
  no numerical surface at all: no `sqrt`, `pow`, `abs`, `min`, `max`, `floor`,
  `round`, no arrays of computed data, no plotting. The gap between Marey and a
  usable scientific-figure tool is a numerical stack, not a feature.
- **Programmatic/personalised video at volume.** Investigated in §3 and found
  **served**, by at least four hosted vendors billing per rendered minute plus
  Remotion. Not an empty gap.
- **Regulated promotional material** (pharma MLR, financial). Named in §6.2 as
  the more plausible variant of the evidentiary angle. **Not researched.**
- **Ad-tech / dynamic creative optimisation.** Not researched; overlaps §3 and is
  visibly occupied by hosted platforms.
- **Non-web, non-embedded runtimes** (game engines, native mobile). Not
  researched.
- **Whether Marey's Matter.js determinism survives across platforms.** Not
  researched here and not researched in either prior document. It is a
  precondition for §1, §3 and §5 and nobody has checked it.

### 8.4 A weakness in my own method

Every gap in §1–§5 was found by looking for *specifications and trackers that
stop short*. That method reliably finds structural holes and reliably fails to
find whether anyone is standing in them. A second study aimed at practitioners —
issue-tracker volume in design-system repos, job postings mentioning motion
specs, accessibility-audit findings — would be the natural complement and was
outside this budget.

---

## 9. Ranking, and the cheapest way to test the top of it

Ranked by **evidence strength**, which is not the same as ranked by size of
prize. Cost is my estimate of the change to Marey, graded against the current
tree.

| # | Gap | Evidence | Change to Marey | Contradicts a design rule? |
|---|---|---|---|---|
| 1 | **Derived reduced-motion + described motion** (§1) | **A** — WCAG Level A criteria; Lottie spec issue open since 2024-01-23; `lottie-web` issue closed unshipped | **Low** — one export pass, one optional property, one text emitter | No |
| 2 | **Choreography layer for design-system motion** (§2) | **A** spec text + **B** two open DTCG issues, one four years old | **Medium** — cubic-bezier easing, `delay`, spring, and a token-injection decision | Only if tokens are imported *in source* |
| 3 | **One source, N baked variants** (§3) | **B** Tinder + Rive/Lottie first-party docs; **C** four hosted competitors | **Low for values (Option A), high for shape (Option B)**; text metrics missing entirely | **No, for Option A** — this is the key finding |
| 4 | **Lottie spec instability** (§4) | **A** + **B** — 30 open spec issues, "Add Text Layer" open 19 months | **None** — this is a risk to Phase 5A, not a direction | No |
| 5 | **Embedded / MCU targets** (§5) | **B** LVGL tracker; **D** the resource argument | **High** — a second, non-browser compiler backend | No, but it forks the architecture |
| 6 | **Motion regression testing** (§6.1) | **A** — Playwright disables animation by default | Low as *reference*, very high as *driver* | Only in the "driver" form |
| 7 | **Evidentiary / regulated** (§6.2) | **A** on FRE 901(b)(9), **E** on demand | Medium (units, provenance) + an unsolvable solver-validation problem | No |
| 8 | **Interactive physics education** (§6.3) | **C-minus**, unverified | **Total** — mutation, guards, input, a shipped runtime | **Yes — three of them, plus roadmap §1** |

### The two that compound

Gaps 1, 2 and 3 are the same capability seen three ways: **a compiler that can
read a motion source and emit a family of related artifacts** — reduced/full,
token-conformant/token-checked, locale-A/locale-B. Nothing else in the surveyed
landscape can do that, for a reason that is structural rather than
circumstantial: Remotion and Motion Canvas source is a general-purpose program
and cannot be analysed; Rive's is binary; Lottie's is baked geometry. Marey's
"no escape hatch" rule is precisely what makes its source machine-transformable.

### The cheapest experiment that would discriminate

If any of this is worth acting on, the smallest decisive test is **not** to
build a feature. It is to take one existing `eval/` scene and produce, from
that single unmodified source, four artifacts: full motion, reduced motion, a
generated text description, and one locale variant via CLI value injection. That
exercises §1 and §3's Option A, requires no new syntax, and would either
demonstrate derivability concretely or expose that the IR does not carry enough
intent to support it. The existing `eval/` protocol is the right harness and
already has 40 scenes to draw from.

That experiment also fails fast in a useful way: if reduced-motion derivation
requires an "essential vs decorative" annotation that authors must supply by
hand, the automation claim weakens considerably, and it is better to learn that
in an afternoon than in a phase.
