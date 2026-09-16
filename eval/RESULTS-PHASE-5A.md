# Phase 5A evidence — the three exit criteria

**Date:** 2026-09-16, Phase 5A Task 5. Every command below was re-run against
this branch (`phase-5a-baked-lottie`) before being pasted here — see roadmap
§14.2 and Global Constraint 3: evidence is reproducible from the repository,
commands rather than claims. Commits this task produced, in order:

- `a984f92` — `feat(5a): add --compare-png pixel comparison to lottie-check.mjs`
- `019761c` — `feat(5a): add dotlottie-web as an optional second renderer in lottie-check.mjs`

Design §9 (`docs/specs/2026-09-11-marey-phase-5a-baked-lottie-design.md`)
states three exit criteria. Three sections below, one per criterion, plus a
fourth for the second-renderer evaluation design §10 asks for.

Dev server for every command below: `npx vite --port 5199 --strictPort`
(left running for the whole task; killed and confirmed free at the end — see
"Environment" at the bottom).

---

## Criterion 1 — a physics scene plays correctly in a third-party player, with no Marey code

**Claim:** `compound-logo.marey` — design §9's own choice, "the one canonical
scene that genuinely animates, hands off, and settles under simulation; the
other three are static by declaration" — exported to Lottie and played in
lottie-web in Chromium, with the frames read, and the emitted file containing
no reference to Marey or Matter.js.

**Command:**

```bash
node tools/visual-check/lottie-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --fps 30 \
  --frames 0,48,75,180,239 \
  --out .visual-check/lottie/compound-logo
```

**Result:** exit 0. `fps / frameCount 30 / 240`, snapshot hash `26cca4e9`
(the simulation-state hash). Zero page errors, zero console errors, zero
lottie `'error'` events.

**The load-bearing hash claim for this document is not a match against
GATE-B — it is that the Lottie export and Marey's own PNG export of the
same scene produce the *same* hash as each other**: Criterion 2 below
independently exports the same scene via `window.__mareyExportPng` and
records `pngExportMeta.hash: 26cca4e9`, identical to this section's
`26cca4e9`. That equality is what makes the Criterion 2 pixel comparison a
comparison of two renderings of *one* simulation run rather than of two
different simulation runs — the actual property this document needs.

**A prior draft of this section additionally claimed `26cca4e9` "match[ed]
… `eval/RESULTS-GATE-B.md`'s Criterion 2" — that was checked and found
false** (task-5-review.md, Important 1): GATE-B.md's own text
(`eval/RESULTS-GATE-B.md:91,102,103,114`) records `b0b119ad` for this same
scene, not `26cca4e9`. `26cca4e9` itself is genuine — reproduced
independently by the reviewer, and it is what `compound-logo.marey`
produces on this tree today. The divergence is a **pre-existing Phase 4
staleness, not a Task 5 defect**: a later Phase-4 commit added a field to
`ObjectSnapshot`, and `hashFrames`'s JSON-based digest necessarily picks
that up, so GATE-B.md's recorded value no longer reproduces on current
source. `eval/RESULTS-GATE-B.md` is a prior phase's record and is not
edited here; this divergence is being carried forward to Task 6's execution
notes as an inherited finding rather than retconned into GATE-B.md.

**No Marey or Matter.js reference in the emitted document:**

```bash
grep -io "marey\|matter" .visual-check/lottie/compound-logo/doc.json
# (no output)
```

**Images read** (`.visual-check/lottie/compound-logo/frame_<n>.png`, via the
Read tool — not inferred from the harness's pass line):

| Frame | What it shows |
|---|---|
| 0 | The three-bar "F" logo at its authored animate-in start position, upper-left, upright |
| 48 | Animated further in, moved and grown toward centre, still upright — animation phase, not yet handed to physics |
| 75 | Displaced well down and to the right of frame 48's position — physics has visibly taken over. Rotation at this frame is subtle: the logo reads as close to its original upright orientation, not clearly tipped, in clear contrast to frame 180's obvious ~90° tip. (An earlier draft of this row described frame 75 as "rotated off-axis" — a generous reading of what the image actually shows; task-5-review.md, Minor 4) |
| 180 | Settled, resting on its own arms in a "table" orientation, rotated roughly 90° from its start |
| 239 | Pixel-identical to frame 180 (see below) — still settled |

This is design §9's whole story for Criterion 1 — genuinely animates in,
hands off to physics, settles under simulation — played entirely inside a
real lottie-web player, not Marey's own renderer.

**Frames 180 and 239 are byte-identical**, confirming the scene has actually
come to rest inside lottie-web's own playback, not merely stopped moving in
Marey's simulation before export:

```bash
node -e "
const fs = require('fs');
const a = fs.readFileSync('.visual-check/lottie/compound-logo/frame_180.png');
const b = fs.readFileSync('.visual-check/lottie/compound-logo/frame_239.png');
console.log('byte-identical:', a.equals(b));
"
# byte-identical: true
```

**Net:** Criterion 1 holds. Reproducible from the commands above; nothing in
this section depended on a claim not re-derived on this tree.

---

## Criterion 2 — frame comparison against Marey is within a documented, measured tolerance

**Claim:** design §8.3's pixel half — render the emitted file in lottie-web
and compare selected frames against Marey's own PNG export of the same
scene at the same frames, stating the tolerance as two **measured** numbers
(a maximum per-channel delta and the share of pixels exceeding it), not a
number picked in advance and asserted.

**What "exceeding it" means here, stated explicitly rather than left
implicit.** The comparison method (`--compare-png`, added to
`lottie-check.mjs` in `a984f92`) computes, per pixel, the maximum absolute
difference across its four channels (R,G,B,A) between the two renderers,
then reports two things over the whole frame: the single largest such value
found anywhere (**the maximum per-channel delta**), and the fraction of
pixels whose value is **not exactly zero** — i.e. not byte-identical between
the two renderers (**the share of pixels exceeding it**, read as "exceeding
an exact match"). This is the threshold-free reading: it does not pick an
arbitrary cutoff, it reports how many pixels differ AT ALL and how bad the
worst one is. The brief's explicit warning — "if interiors differ, that is a
real defect, not a tolerance question" — is exactly answered by this choice:
a nonzero share in a flat interior is unambiguous evidence of a problem, not
a threshold argument.

**Command:**

```bash
node tools/visual-check/lottie-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --fps 30 \
  --frames 0,48,75,180,239 \
  --compare-png \
  --out .visual-check/lottie/compound-logo-compare
```

**Measured, per frame** (`800×600` = 480,000 pixels each; `pngExportMeta`:
`fps 30, frameCount 240, hash 26cca4e9` — the same snapshot hash as
Criterion 1's Lottie export, confirming both exports sampled the identical
simulation run):

| Frame | Max per-channel delta | At (x,y) | Mismatching pixels | Share |
|---|---|---|---|---|
| 0 | 61 | (185,47) | 373 / 480000 | 0.0777% |
| 48 | 61 | (407,128) | 393 / 480000 | 0.0819% |
| 75 | 71 | (480,470) | 559 / 480000 | 0.1165% |
| 180 | 81 | (516,569) | 569 / 480000 | 0.1185% |
| 239 | 81 | (516,569) | 569 / 480000 | 0.1185% |

**The two numbers, as design §8.3 asks for them, taken as the maximum
across the five sampled frames:**

- **Maximum per-channel delta: 81** (frames 180 and 239, at pixel (516,569)).
- **Maximum share of pixels exceeding it (i.e. not byte-identical): 0.1185%**
  (frames 180 and 239 — 569 of 480,000 pixels).

**Frame indices these came from:** 0, 48, 75, 180, 239 — the same milestones
Criterion 1 used (animate-in start, animate-in advanced, physics handoff,
settled, settled-again), so the tolerance is measured across the whole
motion, not only a convenient still frame.

**Where the differing pixels actually are — read, not inferred.** Each
compared frame also has a diff-visualization PNG
(`frame_<n>_diff.png`; black = byte-identical, red = any channel differs),
generated by the same `--compare-png` run. Read for frames 0, 48, 75 and 180:

- Frame 0 (`.visual-check/lottie/compound-logo-compare/frame_0_diff.png`):
  a thin red outline tracing the F-logo's own edges, fully black background
  and fully black interior.
- Frame 48 (`frame_48_diff.png`): same shape — thin red outline on the
  logo's edges only.
- Frame 75 (`frame_75_diff.png`): same again, on the now-tumbled logo's
  edges.
- Frame 180 (`frame_180_diff.png`): same, on the settled logo's edges —
  the interior of every bar, and the entire background, is solid black.

**Net: every mismatching pixel sits exactly on an antialiased shape edge, in
every sampled frame across the whole motion. No flat interior or background
pixel differs at all**, which is what "expect antialiasing differences at
shape edges; expect none in flat interiors" (Step 2's own instruction) asks
to be checked rather than assumed. This is not a tolerance being picked to
make a threshold pass — it is what was measured, and it is consistent with
the delta's own worst-case magnitude (~81/255, i.e. roughly a third of full
scale) being confined to a boundary of one pixel's width between two
independent antialiasing implementations (PixiJS's WebGL rasterizer vs.
lottie-web's `canvas` 2D renderer) drawing the same rotated geometry.

**Net for this document:** Criterion 2 holds, with the tolerance stated as
measured: **max per-channel delta 81, max share of pixels exceeding an exact
match 0.1185%, confined to shape edges in every sampled frame.**

---

## Criterion 3 — every refusal is named

**Claim:** a `LOTTIE_*` diagnostic per refused feature, each with a test, and
a delete-and-run check per diagnostic confirming the suite notices its
absence.

**Every `LOTTIE_*` diagnostic in the codebase**, confirmed exhaustively:

```bash
grep -rn "LOTTIE_" src/ --include=*.ts | grep -v "\.test\.ts" | grep "code:"
# src/compiler/export/lottieGeometry.ts:202:  code: "LOTTIE_UNSUPPORTED_TEXT",
# src/compiler/export/lottieGeometry.ts:208:  code: "LOTTIE_UNSUPPORTED_LINE",
```

Exactly two: `LOTTIE_UNSUPPORTED_TEXT` (design §10: "cut for this phase,
R17") and `LOTTIE_UNSUPPORTED_LINE` (design §10: "deferred, not cut").

**Baseline:**

```bash
npx vitest run src/compiler/export/lottieGeometry.test.ts
# Test Files  1 passed (1)
#      Tests  12 passed (12)
```

**Delete-and-run, one diagnostic at a time** (per AGENT-LESSONS §2c: "where a
change touches N call sites, revert each separately" — here N=2, and a
combined revert would not show which of the two is actually guarded).
Method: delete the `case` branch in `planLottie`'s switch
(`src/compiler/export/lottieGeometry.ts`), run the file's suite, record which
tests redden, restore, confirm `git diff --stat` is empty and the suite is
12/12 green again before moving to the next.

| Diagnostic disabled | Reddened | Failing tests |
|---|---|---|
| `LOTTIE_UNSUPPORTED_TEXT` (deleted `case "text":`) | 3/12 | `"refuses a text node by name"`, `"finds an unsupported node nested inside a group"`, `"reports every unsupported node, not only the first"` |
| `LOTTIE_UNSUPPORTED_LINE` (deleted `case "line":`) | 2/12 | `"refuses a line node by name"`, `"reports every unsupported node, not only the first"` |

Both deletions redden the shared `"reports every unsupported node, not only
the first"` test (a fixture combining one text node and one line node), and
each also reddens its own name-specific test — no diagnostic passes purely
by riding on the other's coverage. In both cases the deleted branch's node
kind falls through to `planLottie`'s `default:` case, which calls
`shapeGeometryFor` — itself throwing `[LOTTIE] shapeGeometryFor called with
unsupported kind '…'` (its own comment: "Unreachable: `walk` above only
calls this for the four kinds `planLottie` accepts… this function is ever
invoked" for `text`/`line`). So the revert doesn't merely fail an assertion,
it demonstrates the *reason* the branch exists: without it, an unsupported
node reaches code that assumes it can never see one.

Restored after each; confirmed both times:

```bash
git diff --stat -- src/compiler/export/lottieGeometry.ts
# (no output)
npx vitest run src/compiler/export/lottieGeometry.test.ts
# Test Files  1 passed (1)
#      Tests  12 passed (12)
```

**Net: Criterion 3 holds for both `LOTTIE_*` diagnostics — each has a test,
and deleting its branch reddens the suite, checked individually rather than
inferred from a combined revert.**

---

## Step 4 — the second renderer: evaluated, and added

Design §10: "Evaluated during implementation, not promised. Added only if it
is genuinely cheap inside the same harness; if it is not, the report says so
rather than quietly dropping it."

**Renderer tried:** `@lottiefiles/dotlottie-web` (0.80.0), a WASM-based
Lottie/dotLottie player. Installed as a devDependency
(`package.json`/`package-lock.json`, committed in `019761c`).

**Why this one, not ThorVG.** `@lottiefiles/dotlottie-web` ships a plain npm
package with a browser-ready ESM bundle and no build step of its own,
installable the same way every other devDependency here is
(`npm install --save-dev`, confirmed working in this environment despite
`curl` returning `000` from Bash — see "A network note" below). ThorVG's web
distribution requires either compiling its C++ core to WASM or consuming a
separately-published web-component wrapper with its own packaging; trying it
too was judged not to add evidence proportional to the extra integration
surface, once the first renderer's result was in hand. Not tried; named
rather than silently skipped.

**Integration approach.** `lottie-check.mjs`'s frame-sampling loop, `--at`
pixel reads, PNG screenshot capture, and `--compare-png` logic all reach the
player through exactly two things: `window.__lottieCheckAnim.goToAndStop(f,
true)` and a canvas reachable via the `#__lottieCheck canvas` selector.
Adding `--renderer dotlottie-web` means building a shim exposing that same
interface — `window.__lottieCheckAnim = { goToAndStop: (frame) =>
player.setFrame(frame) }` — over dotlottie-web's own `DotLottie` class, with
its canvas appended inside the same `#__lottieCheck` container. Every other
flag works unchanged against either renderer: there is no parallel harness,
only a different ~150 lines constructing the player itself
(`tools/visual-check/lottie-check.mjs`, diff in `019761c`).

**Two problems solved, not glossed over:**

1. **The bundle's own export is not directly importable via
   `addScriptTag({ path })`.** dotlottie-web's ESM bundle ends
   `export{be as DotLottie,...}` — an ESM export clause does not create a
   `DotLottie` binding inside the module's own top-level scope, only in its
   external interface, so appending `window.__DotLottie = DotLottie` after
   the injected script text throws `ReferenceError: DotLottie is not
   defined` (measured directly, not assumed — this was the first scratch-test
   failure). Fixed by reading the bundle's actual local alias with a regex
   (`/export\{(\w+) as DotLottie/`) and assigning that name instead
   (`window.__DotLottie = ${localName}`), with a named, loud failure if a
   future dotlottie-web upgrade changes the bundle's shape.
2. **The WASM binary's default source is a CDN, not `node_modules`.** Reading
   the bundle directly: `` gt(ut,`https://cdn.jsdelivr.net/npm/${Q}@${Z}/dist/dotlottie-player.wasm`,`https://unpkg.com/${Q}@${Z}/dist/dotlottie-player.wasm`) ``
   — a jsdelivr URL with an unpkg fallback. Playwright's Chromium here does
   have outbound network access (confirmed directly: a `fetch()` to that
   exact jsdelivr URL from inside a real page returned `200`), unlike this
   repository's Bash tool (`curl` returns `000`), so the CDN fetch would
   actually have worked. Routed to the local copy anyway
   (`page.route(/dotlottie-player\.wasm/, route => route.fulfill({ path:
   … }))`), matching how lottie-web is already loaded with no network
   dependency, so the harness stays reproducible somewhere that outbound
   access is genuinely unavailable.

**A network note**, since Global Constraint 12 states "no outbound HTTP from
bash — curl returns 000": that restriction is on the Bash tool specifically.
`npm view`/`npm install` reach the real registry (used here to install
`@lottiefiles/dotlottie-web`), and Playwright's launched Chromium reaches
the real internet too (measured above). Neither contradicts the constraint
as written; both are outside Bash.

**The critical test — the opacity double-application finding handed to this
task.** A prior review found that `lottieEncode.ts` emits both the parent's
alpha on a group's null layer AND the fully-flattened product on the child
layer, and ruled it inert only because lottie-web specifically does not
propagate opacity through parenting. This is the exact place a second,
independently-implemented renderer could disagree.

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-opacity-flatten.marey \
  --renderer dotlottie-web \
  --fps 30 --frames 0 \
  --at 50,50 \
  --out .visual-check/lottie/opacity-flatten-dotlottie
# frame 0:
#   (50,50) -> rgba(63,63,63,255)
```

The fixture is a `group` at alpha 0.5 containing a white `rectangle` at alpha
0.5 on a black background — so the composited channel value at the child's
centre IS the composed opacity times 255, read directly off the pixel: ~64
(25%) means flattening is right; ~32 (12.5%) would mean dotlottie-web ALSO
propagates opacity through its parent chain and the flattening
double-applies. **Measured: 63/255 ≈ 24.7%** — matching the flattened value,
not a double-applied one. Image read directly:
`.visual-check/lottie/opacity-flatten-dotlottie/frame_0.png` — a mid-grey
square, visibly nowhere near black.

**Re-measured through lottie-web with the now-refactored harness**, to rule
out the refactor itself having changed anything and to give a clean paired
comparison:

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-opacity-flatten.marey \
  --fps 30 --frames 0 \
  --at 50,50 \
  --out .visual-check/lottie/opacity-flatten-lottieweb-recheck
# frame 0:
#   (50,50) -> rgba(64,64,64,255)
```

`64/255 ≈ 25.1%` — unchanged from Task 4's original measurement of this same
fixture (design §11's correction cites the identical value). The two
renderers agree to within 1/255, both squarely at the flattened value and
nowhere near the ~32 a double-application would produce.

**A second, independent sanity check** (stacking order, design §11.1),
because one passing fixture is thin evidence for "this integration works
generally":

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-layer-order.marey \
  --renderer dotlottie-web \
  --fps 30 --frames 0 \
  --at 100,100 --at 30,100 \
  --out .visual-check/lottie/layer-order-dotlottie
# (100,100) -> rgba(0,0,255,255)   [front, blue -- matches lottie-web's §11.1 measurement]
# (30,100)  -> rgba(255,0,0,255)   [back, red  -- matches lottie-web's §11.1 measurement]
```

Both points match lottie-web's own §11.1 measurement exactly: array-earlier
layers draw above later ones in dotlottie-web too.

**Regression check on the refactor itself, against all six of Task 4's §11
fixtures — not just one.** A prior draft of this section re-verified only
`opacity-flatten` against lottie-web after the ~500-line `--renderer`
refactor and presented that single fixture, plus a one-frame
`--compare-png` arithmetic check, as "the regression check" — narrower than
its framing implied (task-5-review.md, Important 2: the diff shows the
lottie-web branch was moved essentially verbatim into a conditional rather
than rewritten, which is real mitigation, but an argument is not a
measurement). The remaining five fixtures are re-run here, each against the
exact command and expected values from design §11's 2026-09-12 correction:

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-layer-order.marey \
  --fps 30 --frames 0 --at 100,100 --at 30,100 \
  --out .visual-check/lottie/layer-order-refactor-recheck
# (100,100) -> rgba(0,0,255,255)   [expected: blue, front]
# (30,100)  -> rgba(255,0,0,255)   [expected: red, back]
```

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-version-field.marey \
  --fps 30 --frames 0 --at 50,50 \
  --out .visual-check/lottie/version-field-refactor-recheck
# (50,50) -> rgba(34,204,136,255)   [as emitted (v); expected #22cc88]

node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-version-field.marey \
  --fps 30 --frames 0 --at 50,50 --unset v --set ver=550502 \
  --out .visual-check/lottie/version-field-patched-refactor-recheck
# (50,50) -> rgba(34,204,136,255)   [patched to ver; expected identical #22cc88]
```

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-outpoint.marey \
  --fps 30 --frames 0,1,2,3,4 \
  --at 20,30 --at 55,30 --at 144,30 --at 180,30 --at 100,5 \
  --out .visual-check/lottie/outpoint-refactor-recheck
# frame 0: (20,30)  -> rgba(255,204,0,255)   [mover at start]
# frame 1: (55,30)  -> rgba(255,204,0,255)   [mover mid-slide]
# frame 2: (144,30) -> rgba(255,204,0,255)   [mover mid-slide]
# frame 3: (180,30) -> rgba(255,204,0,255)   [mover at end]
# frame 4: every sampled point -> rgba(0,0,0,0)   [op is exclusive: fully transparent]
```

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-easing-halfframe.marey \
  --fps 30 --frames 0,0.25,0.5,0.75,1 \
  --at 10,20 --at 35,20 --at 60,20 --at 85,20 --at 110,20 \
  --out .visual-check/lottie/easing-halfframe-refactor-recheck
# frame 0:    (10,20)  -> rgba(255,255,255,255), all other points black
# frame 0.25: (35,20)  -> rgba(255,255,255,255), all other points black
# frame 0.5:  (60,20)  -> rgba(255,255,255,255), all other points black
# frame 0.75: (85,20)  -> rgba(255,255,255,255), all other points black
# frame 1:    (110,20) -> rgba(255,255,255,255), all other points black
```

**All five reproduce design §11's recorded values exactly** — same colours,
same coordinates, same exclusive-`op` transparency at frame 4, same exact
linear positions at every quarter-frame. Combined with `opacity-flatten`
(re-verified earlier in this section: `rgba(64,64,64,255)`, unchanged from
Task 4), **all six of Task 4's §11 fixtures now have a confirmed,
post-refactor reproduction against lottie-web, not five gaps covered by an
argument about the diff's shape.** No regression from the `--renderer`
refactor was found in any of the six.

A one-frame `--compare-png` arithmetic check was also re-run and remains
identical to Criterion 2's frame-0 row above:

```bash
node tools/visual-check/lottie-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --fps 30 --frames 0 --compare-png \
  --out .visual-check/lottie/regression-check-after-renderer-refactor
# --compare-png: maxDelta=61 at {"x":185,"y":47}, mismatching pixels=373/480000 (share=0.0777%)
```

`npm test` (817/817) and `npx tsc -b --noEmit` (clean) were also re-run
after every commit in this task, including this fix round; no regression in
either.

**Decision: added.** Measured cost was ~150 net lines reusing 100% of the
existing per-frame sampling/reporting/comparison logic through the
`goToAndStop` shim — no parallel harness, no duplicated report schema, no
second `--compare-png` implementation. That is what "genuinely cheap inside
the same harness" (design §10) asks for. The renderer is now a standing,
documented `--renderer` flag rather than a one-off script, and it produced a
substantive result: **dotlottie-web does not propagate opacity through
parenting either**, so the finding handed to this task is confirmed inert
across two independently-implemented renderers, not asserted from one.

**What this does NOT establish.** Two fixtures (opacity-flatten,
layer-order) is not the six-question sweep Task 4 ran against lottie-web —
the version-field, `op` inclusive/exclusive, and easing-handle questions
were not re-run against dotlottie-web, and `--compare-png` was not run
against dotlottie-web output at all (only against lottie-web's, in Criterion
2 above). Named as a gap rather than implied covered: a future task wanting
dotlottie-web as a genuine parity check, not just an opacity/stacking
cross-check, would need to re-run all of §11's fixtures and a
`--compare-png` pass against it specifically.

---

## Environment

Dev server: `npx vite --port 5199 --strictPort`, left running for the whole
task, killed at the end. Confirmed free with a boundary-safe match (bare
`:5199` also matches `:51999`):

```bash
netstat -ano | grep -E ":5199[^0-9]" | grep -i LISTENING
# (no output after kill)
```

`npm test`: 817/817 pass on this tree, both before and after this task's
commits. `npx tsc -b --noEmit`: clean.
