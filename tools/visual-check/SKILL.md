---
name: visual-check
description: Run the Marey playground in a real browser and capture what it renders. Use when verifying a renderer or physics change, checking that a scene settles where it should, that the ticker stops, or that a scene replays identically across a page reload — anything the headless Vitest suite structurally cannot see.
---

# Visual check

The renderer's unit tests are deliberately headless — `clock.ts`, `timeline.ts`,
`physicsWorld.ts` and `physicsSync.ts` import nothing from `pixi.js` so they run
in Node. That is what makes them fast, and it is also what they cannot do: none
of them can see a canvas.

This skill covers the gap. It drives the real app in Chromium, captures PNGs you
can look at, and measures three things the suite cannot.

**It has already earned its keep.** The first run found a determinism bug that
all 94 headless tests missed: a body frozen by `duration` expiry kept its
alpha-interpolated painted position, so it landed up to one tick of motion from
where the simulation stopped it, differently on each page load. Fixed in `f9de4a9`.

## Running it

The dev server must already be running:

```bash
npx vite --port 5199 --strictPort   # leave this running
```

**Use `--strictPort`.** Without it vite walks forward to 5200, 5201… when the
port is taken and prints the one it bound, while `check.mjs` still defaults to
`http://localhost:5199`. A stale server from an earlier run then absorbs every
capture and the check reports a confident pass without exercising your code at
all. This has happened twice. If you must use another port, pass
`--url http://localhost:<port>` to every `check.mjs` call.

Then:

```bash
node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/pile.marey \
  --at 300,1500,4000 --settle 9000 --out .visual-check/pile
```

| Flag | Meaning |
|---|---|
| `--scene <path>` | A `.marey` file, or `default` for the app's built-in test card |
| `--at a,b,c` | Milliseconds after load to capture, comma-separated |
| `--settle <ms>` | How long to wait before the at-rest capture (default 9000) |
| `--url <origin>` | Dev server origin (default `http://localhost:5199`) |
| `--headed` | Show the browser window — use if headless WebGL misbehaves |
| `--out <dir>` | Where PNGs and `report.json` go |

Scenes are injected through the app's `#code=<lz-string>` share-link hash, which
is far more robust than driving Monaco.

**Look at the PNGs.** The numbers below are a safety net; the images are the
point. Read them with the Read tool — a blank frame means WebGL failed to
initialise, not that the renderer is broken.

## What it measures

- **`rendered` / `compiled`** — scraped from the app's own output panel, so it
  reports the compile result in the app's own words rather than guessing at pixels.
- **`frozen at rest`** — two captures two seconds apart are byte-identical, i.e.
  nothing is still moving.
- **`cpu at rest`** — CPU seconds consumed over a 2s wall window, read from the
  DevTools protocol's `TaskDuration`. Near zero means `ticker.stop()` genuinely
  fired. This is the honest version of "watch the CPU graph": PixiJS's ticker runs
  off `requestAnimationFrame`, but so does Monaco, so counting rAF calls cannot
  tell them apart.
- **`deterministic`** — the same scene is loaded twice from cold and the at-rest
  frames compared byte-for-byte. **This is the check that cannot be done headlessly**,
  and the one worth caring about most, because baked-keyframe export depends on it.

## Two traps, both of which caught me

**Do not read canvas pixels in-page.** `drawImage`-ing the WebGL canvas onto a 2D
canvas returns a blank frame, because PixiJS does not set `preserveDrawingBuffer`.
Playwright's `.screenshot()` composites properly and is what this script uses.
An in-page pixel read will confidently report a working scene as blank.

**`deterministic: true` is weaker than it looks for a scene that settles.** A
pile converging on a stable resting configuration reaches the same fixed point
even if the trajectory diverged, so at-rest equality can hide real
non-determinism. To test a *trajectory*, use a scene that freezes mid-motion —
`physics { duration: 0.5 }` on a falling object — so the capture lands on a
transient state. `scenes/freeze.marey` does exactly this, which is how the
`f9de4a9` bug surfaced.

A scene with `loop: true` animations never comes to rest at all, so
`deterministic` and `frozen at rest` are meaningless for it — including for
`--scene default`. Use it to confirm the card renders and the handoff arcs, not
for determinism.

## Scenes

`scenes/` holds the standing checks. Each isolates one property:

| Scene | Property |
|---|---|
| `pile.marey` | Five boxes stack without interpenetrating — the headline Phase 1 feature |
| `idle.marey` | A ball settles and the ticker stops |
| `ghost.marey` | A ball falls **through** a ledge that has no `physics` block (decision D13) |
| `tumble.marey` | A polygon rotates on impact, and its drawn shape stays on its collision shape (D15) |
| `freeze.marey` | `duration` expiry freezes a settling pile mid-motion, reproducibly |
| `freeze-midair.marey` | Minimal repro of the `f9de4a9` bug: one box, no contacts, frozen in free fall. The tightest determinism check here — nothing else can absorb a divergence. |
| `logo.marey` | A three-bar group welds into one compound body and tumbles rigidly, settling on its own arms (Phase 2, D16). If the bars ever separate, the welding has stopped happening. |
| `logo-freeze.marey` | The same idea frozen mid-tumble in free air — determinism on a transient state rather than at rest. |
| `fit-contain.marey` | `fit: contain` — letterboxed, aspect preserved, all four corner markers visible (Phase 3A, `sceneFit → fit` rename). |
| `fit-cover.marey` | `fit: cover` — no letterbox, aspect preserved, corner markers cropped off the short axis. |
| `fit-fill.marey` | `fit: fill` — no letterbox, aspect **not** preserved; the disc renders as an ellipse. |
| `fit-none.marey` | `fit: none` — unscaled, anchored top-left, smallest disc of the four. |
| `bars-reveal.marey` | Phase 3C's headline idiom: `delay` staggers seven bars, `origin: (0.5, 1)` stands each on the baseline, `scale: (1, 0)` starts them at nothing. Every bar must **stand on** the grey rule, not straddle it — a bar centred on it means the origin pivot has stopped reaching the renderer, which still compiles and still type-checks. |
| `ring-pulse.marey` | A fixed-period phase offset: one shared `duration`, `delay` varying by ordinal. Dot sizes must vary smoothly around the ring. Loops, so `frozen at rest` and `deterministic` do not apply. |
| `wave-row.marey` | Roadmap exit criterion 3, in the form where a still frame shows it: fifteen beads, one constant `duration`, `delay` spanning one full cycle, so exactly one wavelength fits the row and travels along it. Loops. |
| `timeline-sweep.marey` | The control from the same set — a generated diagram plus one moving playhead, the one of the three that needed no Phase 3C workaround, so it is unchanged in substance. Loops. |
| `origin-physics.marey` | `origin` through the physics seam, both halves. LEFT: a bottom-origin pillar falls and must land **standing on** the ledge — its body is placed at its bbox centre, not at its origin point. RIGHT: a bottom-origin bar grows upward under a scale animation and must carry the rider ball up on its top edge — Matter scales a body about its own centre, so the centre has to be moved to match. Settles, so `frozen at rest` and `deterministic` both apply. |

Add a scene rather than editing one when checking something new — these are
regression checks, and their expected images are their value.

## Environment

Needs `playwright` (a devDependency) and its Chromium download:

```bash
npx playwright install chromium
```

Headless Chromium has no GPU, so the launch args force SwiftShader. Without them
PixiJS cannot get a WebGL context and every capture is blank. WebGPU is
unavailable headless; PixiJS falls back to WebGL, which is fine.

If captures come back blank, check whether the browser has WebGL at all before
suspecting the renderer:

```bash
node tools/visual-check/smoke.mjs
# expect: {"ok":true,"renderer":"ANGLE (... SwiftShader ...)"}
```

Output goes to `.visual-check/`, which is gitignored.
