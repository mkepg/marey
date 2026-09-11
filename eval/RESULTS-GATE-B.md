# Gate B evidence — deterministic frame export

**Date:** 2026-09-11, Phase 4 Task 8b. Every command below was re-run on a
clean tree at commit `cc552b3` (the tip of `phase-4-composition-and-export`
at the time this document was written) before being pasted here — see
roadmap §14.2 and Global Constraint 3: evidence is reproducible from the
repository, commands rather than claims. Where a criterion has a cheap
revert, the revert was actually performed, watched RED, and restored;
`git diff --stat` was empty before and after every revert in this document.

Gate B (`docs/specs/2026-09-09-marey-engineering-roadmap-design.md`
§8) is five criteria. Five sections below, one per criterion.

---

## Criterion 1 — exact frame counts at 24/30/60fps

**Claim:** exporting at a supported fps produces exactly `duration × fps`
frames, with frame 0 at tick 0 and even spacing between frames.

**Command:**

```bash
npx vitest run src/compiler/renderer/frameSampler.test.ts
```

**Result:** 29/29 pass, including
`it.each([[24,120],[30,150],[60,300]])("produces %i frames at %ifps for a 5s scene", ...)`
and a physical-consequence check (`frame intervals are uniform in simulated
time, not just labelled that way`) that reads the falling body's own
displacement ratio rather than comparing a label to the formula that wrote
it — see that test's own comment for why the label-only version is vacuous.

**Revert performed:** `ticksPerFrame = TICK_HZ / request.fps` →
`TICK_HZ / request.fps + 1` in `exportContract.ts`. 12/29 tests in this file
went red, including the three `it.each` frame-count cases and the
canonical-corpus tests that depend on the same arithmetic. Restored;
`git diff --stat` empty; 29/29 green again.

A second, narrower revert (`Math.floor` → `Math.round` in the same
`frameCount` line) does **not** redden this file — the fixture's 5s duration
is exactly divisible by every supported `ticksPerFrame`, so `floor` and
`round` agree on it. It reddens exactly one test in
`src/compiler/export/exportContract.test.ts` instead —
`"floors a fractional frame count instead of rounding up past the scene's
end"`, which was written for precisely this reason (a whole-number fixture
cannot pin the rounding choice). Both reverts restored; both suites green.

---

## Criterion 2 — repeated exports produce identical frame hashes

**Claim:** exporting the same scene twice yields the same `hashFrames`
digest, and the digest is sensitive to content, not just to sequence length.

**Command:**

```bash
npx vitest run src/compiler/renderer/frameSampler.test.ts
```

29/29 pass, including three tests scoped to this criterion: same hash twice
from cold; a different hash at a different fps (guards a constant hash);
and a same-length, different-content pair that must hash differently
(guards a length-only hash — see the revert below, which is the literal
historical case this test was added to close).

**Revert performed:** `hashFrames` body replaced with
`frames.length.toString(16)` in `frameHash.ts`. 1/29 reddened —
`"distinguishes two same-length sequences that differ only in content"` —
exactly the shape of hash this test exists to reject. The two "same hash
twice" / "different hash at a different rate" tests stayed green under this
mutation, which is exactly why the third test exists (AGENT-LESSONS §2a: a
hash sensitive only to length satisfies both of the others vacuously).
Restored; `git diff --stat` empty; 29/29 green again.

**The cross-environment pairing.** The instruction inherited from the
previous implementer's last action was to make the cross-machine claim
reproducible from a command, by pairing the snapshot hash the headless test
prints with the one `export-check.mjs` reports from a real Chromium run.
That pairing was carried out, and **it produced a genuine, unexpected
finding that changes what this document can honestly claim** — see "What
this does not prove" below before citing this criterion as cross-machine.

Headless print (added by the prior implementer, kept — printed rather than
asserted against a literal, so a legitimate physics change reddens the
tests that describe physics rather than this one):

```bash
npx vitest run src/compiler/renderer/frameSampler.test.ts --disable-console-intercept
# [gate-b] compound-logo.marey @30fps snapshot hash: b0b119ad
# [gate-b] radial-dots.marey @30fps snapshot hash: de456263
```

Chromium, same two scenes, same 30fps, dev server on port 5199
(`npx vite --port 5199 --strictPort`):

```bash
node tools/visual-check/export-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey --fps 30 \
  --out .visual-check/export/compound-logo
# runA snapshot hash       b0b119ad
# runB snapshot hash       b0b119ad
# snapshot hash matches across cold reload   true

node tools/visual-check/export-check.mjs \
  --scene eval/scenes-3b/radial-dots.marey --fps 30 \
  --out .visual-check/export/radial-dots
# runA snapshot hash       b3eb544f
# runB snapshot hash       b3eb544f
# snapshot hash matches across cold reload   true
```

`compound-logo`: headless `b0b119ad`, Chromium `b0b119ad` — **match.**
`radial-dots`: headless `de456263`, Chromium `b3eb544f` — **do not match.**

### What this does and does not prove

Both scenes are internally consistent — every repeat, in every single
environment, agrees with itself:

- Headless-to-headless (two `sampleOnce()` calls in the same Node process):
  matches for every scene, every run, confirmed above and by the file's own
  `"produces the same hash twice from cold"` test.
- Chromium-to-Chromium (`runA` vs `runB`, two independent cold page loads):
  matches for both scenes — `snapshotHashMatch: true` and
  `pngFramesMatch: true` in both `report.json`s.

**Criterion 2 as literally worded — "repeated exports produce identical
frame hashes" — holds fully, in both environments, for both scenes,
demonstrated above and reproducible from the commands above.**

The cross-environment pairing is a stronger, additional claim this document
was asked to attempt, and it holds for `compound-logo` but not for
`radial-dots`. Traced to source, not left as an anomaly:

```bash
node -e "console.log(process.version, process.versions.v8)"
# v22.13.1 12.4.254.21-node.22
npx playwright --version
# Version 1.62.1  (bundles HeadlessChrome/151.0.7922.34, a different V8 build)

node -e "const r=240*Math.PI/180; console.log(Math.sin(r).toPrecision(20))"
# -0.86602540378443848557   (Node)
```

The same expression evaluated inside the Playwright-launched Chromium page
(`page.evaluate(() => Math.sin(240 * Math.PI / 180).toPrecision(20))`)
returns `-0.86602540378443837454` — a one-ULP-scale difference at exactly
this angle. `radial-dots.marey` places twelve dots with
`generate i in 0 to count - 1 { let angle = i * 360 / count; ... cos(angle)
... sin(angle) ... }`; dot index 8 has `angle = 240`, and
`sin`/`cos` (`parseExpr.ts:698`, `Math.sin((d * Math.PI) / 180)`) fold to a
literal **at parse time**, in whichever engine `compileSource` runs in —
Node for the headless test, Chromium's V8 for the browser. That one dot's
baked coordinate differs by ~1e-16px between the two environments, which
`hashFrames` (byte-exact, deliberately unrounded — see its own docstring)
correctly reports as a different digest.

This is not a bug in the sampler, the hasher, or the physics engine: `+`,
`-`, `*`, `/` and `Math.sqrt` are the operations IEEE-754 and ECMA-262
require every conformant engine to compute identically; `Math.sin` and
`Math.cos` are explicitly **"implementation-approximated"** by the
specification and carry no such guarantee, even between two builds of the
same V8 engine. `compound-logo.marey` has no `sin`/`cos` in source — its
motion is animation arithmetic and Matter.js collision response, both pure
`+ - * /` — and its cross-environment match is consistent with that: **it
is evidence that scene contains no source of the gap, not evidence that the
gap cannot occur elsewhere in the corpus.** `frameHash.ts`'s docstring
previously claimed the hash "carries the determinism claim across machines
as well as across runs" without qualification; corrected in this same
commit to state the boundary precisely, since an unqualified claim in the
code is exactly the kind of statement AGENT-LESSONS records as
mis-briefing the next agent.

**Net for this document:** cite same-machine, same-process and
cross-reload determinism as proven for the whole corpus. Cite
cross-environment (Node vs. Chromium) hash equality as proven for
`compound-logo` specifically and **not** as a corpus-wide property —
`radial-dots` is a measured counter-example, caused by a documented,
spec-sanctioned engine difference in transcendental math, not by anything
Phase 4 built.

---

## Criterion 3 — frame pacing cannot affect exported state

**Claim:** the tick a frame samples, and what that tick's state is, does
not depend on the requested export frame rate.

**Command:**

```bash
npx vitest run src/compiler/renderer/frameSampler.test.ts
```

29/29 pass, including the two coincident-frame tests: 30fps frame `k` vs
60fps frame `2k` (every coincident tick), and 24fps frame `k` vs 60fps frame
`5k/2` (coincident on even `k`, since 24 and 60 share tick 5 vs 2). Both
compare full object content, not just the tick label.

**Revert performed:** `runtime.paintExactTick()` → `runtime.paint(0)` in
`frameSampler.ts`'s sampling loop (the historical defect class this file's
own comments describe — a wall-clock paint in place of a tick-aligned one).
2/29 reddened:

- `"frame intervals are uniform in simulated time, not just labelled that
  way"` — `expected 5 to be less than 3` (the predicted factor-of-two lag
  the test's comment derives by hand).
- `"uses paintExactTick to paint, never paint"` — the spy assertion, which
  exists specifically because the coincident-frame tests **do not** catch
  this mutation (the one-tick lag is a function of tick alone and cancels
  in every cross-rate comparison — documented in the test file and
  independently reconfirmed here).

Restored; `git diff --stat` empty; 29/29 green again. This is the one
criterion where the two-test pairing above matters: either test alone
leaves a gap the other closes, which is why both are cited as this
criterion's guard rather than either individually.

---

## Criterion 4 — invalid or unbounded requests fail before rendering begins

**Claim:** a scene with no `duration` and no explicit bound, or a request
with an invalid fps/duration/frame budget, is refused by `planExport`
before any `SceneRuntime` is constructed — `sampleFrames` requires a
`SamplerPlan`, and `planExport` is the only function that produces one.

**Command:**

```bash
npx vitest run src/compiler/export/exportContract.test.ts
```

**Result:** 21/21 pass — unbounded-scene refusal, invalid explicit duration
(`0`, `-1`, `NaN`, `+Infinity`), unsupported fps (`25, 0, -30, 7, 1.5, 240`
— anything not dividing 120), a bound too short for one frame, over the
7,200-frame budget, and multiple simultaneous diagnostics reported together
rather than only the first.

**Revert performed:** the `EXPORT_UNBOUNDED_SCENE` branch in
`exportContract.ts` replaced with `seconds = 5` (i.e. silently defaulting
an unbounded scene instead of refusing it). 2/21 reddened:
`"refuses an indefinite scene with no explicit bound"` and
`"reports every applicable diagnostic, not only the first"`. Restored;
`git diff --stat` empty; 21/21 green again.

**Reproducible end-to-end, post-fix — constraint 4.** Task 7 Step 5's own
evidence cited `marey check --export-ready bar-chart.marey` exiting 1 with
`EXPORT_UNBOUNDED_SCENE`; that was true only because Task 8b Step 2 had not
yet given the scene a `duration`, and it is **not** reproducible after this
task. Re-run against the committed corpus, all four exit 0:

```bash
npm run build:cli
node bin/marey.mjs check --export-ready eval/scenes-3b/bar-chart.marey
# eval/scenes-3b/bar-chart.marey: ok        exit=0
node bin/marey.mjs check --export-ready eval/scenes-3b/compound-logo.marey
# eval/scenes-3b/compound-logo.marey: ok    exit=0
node bin/marey.mjs check --export-ready eval/scenes-3b/radial-dots.marey
# eval/scenes-3b/radial-dots.marey: ok      exit=0
node bin/marey.mjs check --export-ready eval/scenes-3b/timeline-ticks.marey
# eval/scenes-3b/timeline-ticks.marey: ok   exit=0
```

To see the CLI genuinely refuse an unbounded scene (rather than citing a
now-stale transcript), point it at any scene with no `duration` — e.g. the
app's own built-in default scene has none:

```bash
echo 'scene { size: (100, 100) }' > /tmp/unbounded.marey
node bin/marey.mjs check --export-ready /tmp/unbounded.marey
# /tmp/unbounded.marey: EXPORT_UNBOUNDED_SCENE ...   exit=1
```

---

## Criterion 5 — the canonical scenes export through one sampler

**Claim:** every scene in `eval/scenes-3b/` — the corpus old §5.3 names —
goes through the same `compileSource` → `planExport` → `sampleFrames` path
the browser exporter uses, with no per-scene special-casing.

**Command:**

```bash
npx vitest run src/compiler/renderer/frameSampler.test.ts
```

29/29 pass, 11 of them in the
`"the canonical scenes export through one sampler (Gate B criterion 5)"`
describe block:

1. A corpus-coverage guard: the four files actually present in
   `eval/scenes-3b/` equal exactly the table the tests describe, so a
   fifth scene added to the directory without a matching table entry fails
   this test rather than silently going unexercised. (Not reverted here —
   creating a throwaway fifth scene file to prove it would leave a probe
   artifact; the assertion's mechanism, `Object.keys(...).sort()` against
   `CANONICAL_SCENES.map(s => s.file)`, is a direct equality and needs no
   further demonstration that it is sensitive to its input.)
2. `it.each` over all four scenes: each compiles, `ir.duration` matches the
   scene's own declared value, `countTextBlocks(ir)` matches the expected
   count, and `planExport` at 24/30/60fps gives exactly
   `durationSeconds × fps` frames.
3. A guard that the headlessly-buildable subset is neither empty nor the
   whole corpus (so the browser-only caveat below stays honest either
   direction it might drift).
4. The two headlessly-buildable scenes (`compound-logo`, `radial-dots`)
   each build, sample to exactly their planned frame count at all three
   rates, and export identically on a repeat run (this is where the
   snapshot hashes printed above come from).
5. `compound-logo` specifically: genuinely animates in (frame 0 at its
   authored position, frame 48 well advanced, rotation still untouched —
   still pure animation), hands off to physics (frame 75 far beyond where a
   dead stop would leave it), and settles under simulation rather than at
   the freeze (frames 180 and 239 agree to full precision, while frame 0
   and frame 180 disagree by more than 0.1 rad of rotation and 300px of
   fall — the "guard the guard" pair that rules out "it never moved" as a
   false pass).

**Revert performed:** `compound-logo`'s `durationSeconds` in the
`CANONICAL_SCENES` table changed from `8` to `6` (the scene's real,
committed duration is 8). 2/29 reddened — the `it.each` compile/duration
check (`expected 8 to be 6`) and the headless build/sample check
(`expected [...(192)] to have a length of 144 but got 192`) — both against
the real committed `.marey` file, not a hypothetical. Restored;
`git diff --stat` empty; 29/29 green again.

### What this criterion does not reach

**`bar-chart.marey` and `timeline-ticks.marey` cannot be built headlessly.**
Both declare a `text title` block, and PixiJS's `Text` reads `.width` at
build time, which calls `CanvasTextMetrics.measureText` →
`document.createElement("canvas")`. Vitest's `environment: "node"` has no
`document`, so this throws before any sampling can begin. Confirmed
directly (not inferred from the doc comment) with a scratch probe, deleted
after use:

```
ReferenceError: document is not defined
    at Object.createCanvas (node_modules/pixi.js/lib/environment-browser/BrowserAdapter.mjs:4:20)
    ...
    at Text.get width [as width] (node_modules/pixi.js/lib/scene/text/AbstractText.mjs:201:42)
    at buildNode (src/compiler/renderer/builder.ts:329:28)
```

So criterion 5's **build-and-sample** half (frame counts, hash stability,
the round-trip through `sampleFrames`) is proven headlessly for exactly
**two of the four** canonical scenes — `compound-logo` and `radial-dots`.
For `bar-chart` and `timeline-ticks`, only the **compile-and-plan** half is
proven headlessly (they are in the `it.each(CANONICAL_SCENES)` table above,
so their `ir.duration` and `planExport` frame counts at all three rates are
checked); whether they **build and sample** correctly rests entirely on the
browser. This was exercised for `bar-chart` during Task 8a's Chromium run
of `tools/visual-check/scenes/logo.marey` (a different scene, also
with no `text`) and is not separately re-verified for `bar-chart.marey`
itself in this task — that is a gap, named rather than papered over. A
direct check is one command:

```bash
node tools/visual-check/export-check.mjs \
  --scene eval/scenes-3b/bar-chart.marey --fps 30 \
  --out .visual-check/export/bar-chart
```

This was run for this document (see below) and passed: `runA ok true`,
`frameCount 30`, `snapshot hash matches across cold reload true`,
`per-frame PNG hashes match across cold reload true`. So the browser half
of criterion 5 **is** demonstrated for `bar-chart`, just not headlessly.
`timeline-ticks.marey` was not separately export-checked in this task; it
carries the same `text` limitation and the same reasoning applies, but is
not independently confirmed working in the browser here.

**Two of the four canonical scenes are static by declaration, and — after
this task's own correction — so is the third.** `bar-chart` and
`radial-dots` declare no `animate`/`physics`/`sequence` at all.
`timeline-ticks` was assumed in the original brief to "loop," but its own
committed comment (Task 8b Step 2, already merged at `8a8bd38`) corrects
that: its only loop is `generate`, a compile-time unroll, not a runtime
animation — there is no `animate`, `physics`, or `sequence` block in the
file. So **all three of the original canonical scenes are static exports**
(one still frame repeated `duration × fps` times), and every claim this
corpus makes about *motion* — animating in, handing off, settling under
simulation — rests on `compound-logo.marey` alone, the scene this task
added. That is a narrow evidentiary base for criterion 5's "exports as
baked transforms" half of old §5.3, and it is why the
`"compound-logo genuinely animates in..."` test above exists and is
detailed rather than a one-line frame-count check.

---

## Appendix: the `logo.marey` ledge

Not a Gate B criterion, but flagged by both Task 8a's controller and this
task's brief as worth settling: in
`tools/visual-check/scenes/logo.marey`, the grey "ledge" rectangle
is a **dynamic** Matter body, not a static platform:

```
rectangle ledge {
  position: (400, 520)
  size: (420, 24)
  color: #334155
  physics {
    gravity: (0, 0)
    duration: 12
    collideBounds: true
  }
}
```

**This is very likely unintended, and it is a language-capability gap, not
an authoring mistake.** Marey has no static/locked-body syntax yet —
`lockPosition`/`lockRotation` are explicitly Phase 8
(`docs/architecture/roadmap-and-process.md`) — and D13 means an object
needs a `physics` block to collide at all ("animate-only objects are not
colliders"). Giving the ledge `gravity: (0, 0)` is the only way, today, to
make it collide without falling under its own weight, but it is still an
ordinary dynamic Matter body with no rotational or positional lock, so a
collision impulse from the falling logo is free to nudge and rotate it. The
scene's own commit message (`600100f`, Phase 2) describes its purpose as
checking that the logo's three bars "stay rigidly attached" and "settle
rigidly on its own arms" — nothing there asserts the ledge itself must stay
still, and no code or comment anywhere claims the tilt is deliberate. Task
8a's controller independently observed the tilt across frames 0/45/89 of a
Chromium export; this task's own reading of the scene source confirms the
mechanism (`physics` + zero gravity + no lock). **Net: the ledge tilting
under impact is a real, currently-unavoidable consequence of a missing
language feature, not a bug in Phase 4's export path** — but it does make
`logo.marey` a weaker "does the compound body land on a fixed surface"
reference than a first look suggests, since a viewer comparing frame 89 to
frame 0 sees two things moving, not one. Worth a one-line comment in the
scene file when Phase 8 lands lock syntax; not blocking here.
