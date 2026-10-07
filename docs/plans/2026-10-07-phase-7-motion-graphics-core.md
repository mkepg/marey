# Phase 7 — Motion-Graphics Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship colour animation through every output, replay-to-frame scrubbing, and a playhead that survives live recompilation.

**Architecture:** Colour becomes a fifth animatable property whose runtime value is a rounded `0xRRGGBB` integer on the container layout, drawn as a tint only on shapes that animate colour, carried in frame snapshots and baked into Lottie colour tracks. Playback is a headless `Playback` class in `src/compiler/renderer/playback.ts` that implements every jump in time as a replay from tick 0 with the frame sampler's own loop; the PixiJS adapter wraps it with the ticker, and the playground adds a transport strip and remembers the playhead across compiles.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `verbatimModuleSyntax`), Preact + zustand, PixiJS 8, Matter.js, Vitest, Playwright Chromium for browser checks.

**Spec:** `docs/specs/2026-10-07-marey-phase-7-motion-graphics-core-design.md`

## Global Constraints

1. Run commands from `C:\Users\gomez\...` with a **capital** drive letter; a lower-case `c:` makes Vitest report "no tests" (engineering-lessons §6).
2. Every commit passes all four checks: `npm test`; `npx vitest run --config eval/vitest.config.ts`; `npm run build`; `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`. Baseline before this plan: **61 test files, 1306 tests** in `npm test`; 5 eval tests.
3. Stage paths explicitly and read `git diff --staged` before committing. Never `git add -A`, `git add .` or `git add -f`. Commit subjects follow Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`) with an optional scope. No `Co-Authored-By` or "Generated with" lines. Committed text describes the engineering, never the workflow that produced it.
4. Never commit generated output (`dist/`, `.visual-check/`, `eval/render/`) or any file over 1 MB. Scratch and evidence captures go under `.visual-check/phase7/`.
5. `core.autocrlf` is on: judge changes with `git diff --stat -- <path>`, never `git status`.
6. Browser checks: `npx vite --port 5199 --strictPort`, and kill the server afterwards and confirm port 5199 is free. "The file plays" is not evidence: measure outputs against a reference.
7. A colour's runtime value is a 24-bit integer `0xRRGGBB`. Interpolation is per sRGB channel at the eased progress `e`: `c = Math.round(c0 + (c1 - c0) * e)`, clamped to 0–255, rounded where it is written (spec §2.2).
8. Only a shape that some `animate { property: color }` belongs to (directly, or in its `sequence`/`parallel` steps) is drawn white (`0xffffff`) and tinted; the tint goes on its own `Graphics`/`Text` child, never the wrapper. Every other shape is drawn exactly as before (spec §2.3, D6).
9. Every jump in time is a replay from tick 0 using the sampler's loop — `advanceOneTick(); paintExactTick();` per tick — except a forward seek, which continues from the current tick (spec §3.1).
10. Error wording, verbatim: `[TYPE_ANIM_MISMATCH] Property 'color' expects a colour for 'to' (e.g., to: #ff8800).` and `[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with a 'color' (circle, rectangle, polygon, line or text); '<name>' is a group.`
11. Renderer invariants 1–3 in `docs/architecture/renderer.md` hold: nothing that mutates state takes a time argument; state mutation in the tick phase, painting in the paint phase; nothing fed to the physics world derives from the wall clock.
12. No new runtime dependency.

## Review Focus

1. **A colour animation on a physics body** must not change one call the physics world receives — colour is display-only (Task 2 pins it with the recording world).
2. **A three-digit hex `to`** (`to: #f80`) must animate to `#ff8800`, not to a malformed colour (Task 1 pins the IR value).
3. **A burst of seek requests in one animation frame** (a fast drag) must cost one replay, not one per request (Task 4 counts rebuilds).
4. **A recompile that lengthens `duration` while paused at the old end** must leave the playhead paused at the old tick, and play must continue forward from it rather than restart (Task 4).
5. **A compile result that arrives after a newer compile started** (rapid typing) must never become the remembered playhead (Task 5 pins the pure helper).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/compiler/languageContract.ts` | `color` animatable; `to` admits colour; derived `animProperty` label | 1 |
| `src/compiler/typeChecker/validator.ts` | colour mismatch row; `TYPE_ANIM_COLOR_TARGET` | 1 |
| `src/compiler/typeChecker/resolvers.ts` | `resolveAnimToValue` returns a normalised colour | 1 |
| `docs/LANGUAGE.md` | colour animation documented; "not supported" passages removed | 1 |
| `src/compiler/renderer/color.ts` (new) | `colorToInt`, `lerpColor` | 2 |
| `src/compiler/renderer/builder.ts` | `currentColor`; white + tint for colour-animated shapes; `__applyColor` | 2 |
| `src/compiler/renderer/sceneRuntime.ts` | colour branch in `applyAnim`, `getCurrentVal`, `spawnAnim` | 2 |
| `docs/architecture/renderer.md` | colour section replaces the "half-built" note | 2 |
| `src/compiler/renderer/frameSampler.ts`, `src/compiler/export/frameRaster.ts` | `color` in snapshots, read and written | 3 |
| `src/compiler/export/lottieGeometry.ts`, `lottieEncode.ts` | colour track per layer | 3 |
| `src/compiler/renderer/playback.ts` (new) | headless playback: seek-by-replay, end clamp, idle, state, hashes | 4 |
| `src/compiler/renderer/adapter.ts`, `renderer/index.ts`, `src/compiler/index.ts` | wrap `Playback` with the ticker; return a controller | 5 |
| `src/store/index.ts`, `src/hooks/useCompile.ts`, `src/lib/playhead.ts` (new) | playback state, controller, remembered playhead | 5 |
| `src/components/Preview/Transport.tsx` + `.module.scss` (new) | transport strip | 5 |
| `src/lib/devPlaybackSeam.ts` (new), `src/main.tsx` | dev-only `window.__mareyPlayback` | 5 |
| `tools/visual-check/scenes/color-sequence.marey` (new), `tools/visual-check/color-check.mjs` (new) | colour evidence | 6 |
| `tools/visual-check/transport-check.mjs` (new) | playback evidence | 7 |
| `eval/RESULTS-PHASE-7.md` (new), roadmap and status docs | evidence and status | 6, 7 |

---

### Task 1: Colour animation in the language

**Files:**
- Modify: `src/compiler/languageContract.ts` (`ANIMATABLE_PROPERTIES` at line 77; `animate.to` at ~line 300; `KIND_LABEL.animProperty` at ~line 446)
- Modify: `src/compiler/typeChecker/validator.ts` (the `animate` block at ~lines 572–620)
- Modify: `src/compiler/typeChecker/resolvers.ts` (`resolveAnimToValue` at line 159)
- Modify: `docs/LANGUAGE.md`
- Test: `src/compiler/typeChecker/validator.test.ts`, `src/compiler/typeChecker/colorAnimation.test.ts` (new)

**Interfaces:**
- Produces: `ANIMATABLE_PROPERTIES` includes `"color"`. An `IRAnimation` with `property: "color"` has `to` as a normalised `#rrggbb` string (`IRColor`). Later tasks rely on that exact form.

- [ ] **Step 0: Capture the static-colour baseline (before anything renders differently).**

This task changes no rendering, so its starting commit is the reference Task 6 compares against. Build the CLI and export PNG frames and a Lottie document for each of these scenes, writing under `.visual-check/phase7/baseline/<scene>/<format>/`:
`eval/scenes-3b/bar-chart.marey`, `eval/scenes-3b/radial-dots.marey`, `eval/scenes-3b/compound-logo.marey`, `eval/scenes-3b/timeline-ticks.marey`, and every `src/examples/*.marey`.

```bash
npm run build:cli
node bin/marey.mjs export eval/scenes-3b/bar-chart.marey --format png --fps 30 --out .visual-check/phase7/baseline/bar-chart/png
node bin/marey.mjs export eval/scenes-3b/bar-chart.marey --format lottie --fps 30 --out .visual-check/phase7/baseline/bar-chart/lottie.json
```

A scene with no `duration` needs `--duration 3`; record which scenes needed it. Then write `.visual-check/phase7/baseline/manifest.txt` with one `sha256  relative/path` line per output file (`sha256sum` over every file, sorted by path), plus the commit hash (`git rev-parse HEAD`) on the first line. Nothing under `.visual-check/` is committed.

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/typeChecker/colorAnimation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRObjectNode, IRAnimation, IRSequence } from "../sceneIR";

function check(source: string) {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return { errors: errors.map((e) => e.message), ir: null };
  const out = typeCheck(ast!);
  return { errors: out.errors.map((e) => e.message), ir: out.ir };
}

function scene(body: string): string {
  return `scene {\n  size: (200, 200)\n${body}\n}`;
}

function firstAnim(node: IRObjectNode): IRAnimation {
  return node.props.animations[0];
}

describe("animate { property: color }", () => {
  it("accepts a hex colour and carries it into the IR normalised", () => {
    const { errors, ir } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: color, to: #f80, duration: 1 } }`));
    expect(errors).toEqual([]);
    expect(firstAnim(ir!.children[0]).to).toBe("#ff8800");
  });

  it("accepts a named colour and a let binding", () => {
    const { errors, ir } = check(`let accent = #00ff80\n` + scene(`
      circle a { position: (50, 50), radius: 10, color: red
        animate { property: color, to: blue, duration: 1 } }
      circle b { position: (150, 50), radius: 10, color: red
        animate { property: color, to: accent, duration: 1 } }`));
    expect(errors).toEqual([]);
    expect(firstAnim(ir!.children[0]).to).toBe("#0000ff");
    expect(firstAnim(ir!.children[1]).to).toBe("#00ff80");
  });

  it("accepts colour steps inside a sequence and a parallel", () => {
    const { errors, ir } = check(scene(`
      rectangle r { position: (100, 100), size: (40, 40), color: red
        sequence {
          animate { property: color, to: blue, duration: 0.5 }
          parallel {
            animate { property: color, to: #00ff80, duration: 0.5 }
            animate { property: alpha, to: 0.5, duration: 0.5 }
          }
        } }`));
    expect(errors).toEqual([]);
    const seq: IRSequence = ir!.children[0].props.sequences[0];
    expect((seq.steps[0] as IRAnimation).to).toBe("#0000ff");
  });

  it("rejects a non-colour 'to' with the colour mismatch wording", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: color, to: 0.5, duration: 1 } }`));
    expect(errors).toContain("[TYPE_ANIM_MISMATCH] Property 'color' expects a colour for 'to' (e.g., to: #ff8800).");
  });

  it("rejects a colour 'to' on a numeric property", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: alpha, to: blue, duration: 1 } }`));
    expect(errors.join("\n")).toContain("[TYPE_ANIM_MISMATCH] Property 'alpha' expects a number for 'to'.");
  });

  it("rejects colour animation on a group, directly and through a sequence", () => {
    const direct = check(scene(`
      group g { position: (100, 100)
        circle c { position: (0, 0), radius: 10, color: red }
        animate { property: color, to: blue, duration: 1 } }`));
    expect(direct.errors).toContain("[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with a 'color' (circle, rectangle, polygon, line or text); 'g' is a group.");

    const viaSeq = check(scene(`
      group g { position: (100, 100)
        circle c { position: (0, 0), radius: 10, color: red }
        sequence { animate { property: color, to: blue, duration: 1 } } }`));
    expect(viaSeq.errors).toContain("[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with a 'color' (circle, rectangle, polygon, line or text); 'g' is a group.");
  });

  it("lists five animatable properties when one is unknown", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: radius, to: 5, duration: 1 } }`));
    expect(errors).toContain("[TYPE_ANIM_PROP] Cannot animate property 'radius'. Supported properties are: position, rotation, scale, alpha, color.");
  });

  it("rejects handoff on a colour animation through the existing rule", () => {
    const { errors } = check(scene(`
      circle c { position: (100, 100), radius: 10, color: red
        animate { property: color, to: blue, duration: 1, handoff: true }
        physics { gravity: (0, 900), duration: 2 } }`));
    expect(errors.join("\n")).toContain("[TYPE_HANDOFF_PROP]");
  });
});
```

Before relying on the `use` case, read how `use` expands (`grep -rn "\"use\"" src/compiler/parser`) and add one more `it` that animates colour on a `use` instance and expects `TYPE_ANIM_COLOR_TARGET` naming the instance — written against the real `use` syntax in `docs/LANGUAGE.md`. If a `use` instance never reaches the validator as a `group` node, report that and assert whatever error it does produce instead, with the reason in a comment.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/compiler/typeChecker/colorAnimation.test.ts`
Expected: FAIL. Read each failure: the acceptance tests fail on `[TYPE_ANIM_PROP] Cannot animate property 'color'`, the mismatch test on a missing message, the group test on a missing `TYPE_ANIM_COLOR_TARGET`. A failure for any other reason (a parse error in the fixture) is a fixture defect: fix the fixture, not the code.

- [ ] **Step 3: Implement**

`languageContract.ts`:

```ts
export const ANIMATABLE_PROPERTIES = ["position", "rotation", "scale", "alpha", "color"] as const;
```

`animate.to` kinds become `["number", "point", "color"]`, description unchanged. The `KIND_LABEL.animProperty` entry becomes derived (engineering-lessons §5) — it is defined after `ANIMATABLE_PROPERTIES`, so:

```ts
animProperty: `an animatable property name (${ANIMATABLE_PROPERTIES.join(", ")})`,
```

Check the second hand-written list at ~line 472 (`"animatable property names"`) and leave it if it lists no names.

`resolvers.ts`:

```ts
export function resolveAnimToValue(props: Record<string, AstValue>, key: string): number | IRPoint | IRColor {
  const v = props[key];
  if (v === undefined) {
    throw new Error(`[IR] Required animation property '${key}' is missing.`);
  }
  if (v.kind === "number") return v.value;
  if (v.kind === "point") return { x: v.x, y: v.y };
  if (v.kind === "color") return normaliseColor((v as ColorValue).value);
  throw new Error(`[IR] Animation property '${key}' must be a number, point or colour.`);
}
```

`validator.ts`, inside `if (propVal && toVal && propVal.kind === "animProperty")`, beside the existing mismatch rows:

```ts
if (p === "color" && toVal.kind !== "color") {
  errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property 'color' expects a colour for 'to' (e.g., to: #ff8800).`, line: toVal.line, col: toVal.col, endLine: toVal.endLine, endCol: toVal.endCol });
}
if (p === "color") {
  const ownerIdx = ownerIndex(ancestors);
  const owner = ownerIdx >= 0 ? ancestors[ownerIdx] : undefined;
  if (owner && owner.type === "group") {
    errors.push({ phase: "TYPE", message: `[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with a 'color' (circle, rectangle, polygon, line or text); '${owner.name}' is a group.`, line: propVal.line, col: propVal.col, endLine: propVal.endLine, endCol: propVal.endCol });
  }
}
```

Read how the validator names an object (the field the existing `label` at ~line 354 is built from) and use that field, not a guess at `owner.name`; the asserted wording names the object as written in source (`'g'`).

- [ ] **Step 4: Run the tests to verify they pass, then the whole suite**

Run: `npx vitest run src/compiler/typeChecker/colorAnimation.test.ts` → PASS.
Run: `npm test`. Existing tests that assert the four-property `TYPE_ANIM_PROP` wording or the old `animProperty` label will fail; update each to the new wording and list them in the report. Any other failure is a regression: stop and report it.

- [ ] **Step 5: Revert checks.** For each of the three behaviours (mismatch row, group target, IR normalisation), delete the implementing line, run the new test file, record the failing test names, restore. Then flip the one judgment call in this task: change the owner lookup to `parentNode` instead of `ownerIndex(ancestors)` and confirm the "through a sequence" assertion fails.

- [ ] **Step 6: Docs.** In `docs/LANGUAGE.md`:
  - Under `animate`, add a short "Animating colour" subsection: `property: color` takes a colour `to`; channels blend in sRGB at the eased progress and land on whole 8-bit values; `delay`/`loop`/`yoyo`/`sequence`/`parallel` apply; a group has no colour, so animating one is `TYPE_ANIM_COLOR_TARGET`; `handoff` stays position-only. Include one fenced `marey` example (a circle fading from `red` to `#00ff80` with `yoyo: true, loop: true`) — `src/compiler/languageDocs.test.ts` compiles every fenced example, so it must compile.
  - "**Colours neither animate nor do arithmetic.**" becomes "**Colours do no arithmetic.**" and its first sentence (about `animate`'s `property`) goes.
  - The closing "Colour animation is not supported…" paragraph (~line 1292) goes; the `animProperty` list sentence above it, if any, gains `color`.
  - Grep `docs/LANGUAGE.md` for `not supported`, `alpha\`` lists of four properties, and `TYPE_ANIM_PROP`; every list of animatable properties says five.

- [ ] **Step 7: Run all four checks (Global Constraint 2), then commit**

```bash
git add src/compiler/languageContract.ts src/compiler/typeChecker/validator.ts src/compiler/typeChecker/resolvers.ts src/compiler/typeChecker/colorAnimation.test.ts docs/LANGUAGE.md
# plus each existing test file whose wording you updated, by path
git diff --staged
git commit -m "feat(language): animate a shape's colour"
```

---

### Task 2: Colour animation in the renderer

**Files:**
- Create: `src/compiler/renderer/color.ts`, `src/compiler/renderer/color.test.ts`
- Modify: `src/compiler/renderer/builder.ts` (container field declarations at ~line 10–60; `applyAnchorAndPivot` at ~line 72; the five shape cases at ~lines 205–340)
- Modify: `src/compiler/renderer/sceneRuntime.ts` (`applyAnim` ~line 111, `getCurrentVal` ~line 142, `spawnAnim` ~line 509)
- Modify: `docs/architecture/renderer.md` (the "Colour animation is half-built" bullet, ~line 633)
- Test: `src/compiler/renderer/builder.test.ts`, `src/compiler/renderer/sceneRuntime.test.ts`

**Interfaces:**
- Consumes: Task 1's IR — colour `to` is `#rrggbb`.
- Produces:
  - `colorToInt(hex: IRColor): number`, `lerpColor(a: number, b: number, e: number): number` from `renderer/color.ts`.
  - `__mareyLayout.currentColor?: number` — set on every non-group shape to its declared colour; absent on groups.
  - `__applyColor?: () => void` on a container — present exactly on shapes drawn white and tinted; writes `currentColor` to the drawing's `tint`.

- [ ] **Step 1: Write the failing tests**

`src/compiler/renderer/color.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { colorToInt, lerpColor } from "./color";

describe("colorToInt", () => {
  it("reads a normalised #rrggbb", () => {
    expect(colorToInt("#ff8800")).toBe(0xff8800);
    expect(colorToInt("#00FF80")).toBe(0x00ff80);
  });
  it("throws on a colour the IR should never carry", () => {
    expect(() => colorToInt("#f80")).toThrow(/#rrggbb/);
  });
});

describe("lerpColor", () => {
  it("hits both endpoints exactly", () => {
    expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
  it("blends each channel independently and rounds half up", () => {
    // red 255→0 at 0.5 = 127.5 → 128; blue 0→255 at 0.5 = 127.5 → 128.
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    // green 0x10→0x20 at 0.25 = 16 + 4 = 20 = 0x14.
    expect(lerpColor(0x001000, 0x002000, 0.25)).toBe(0x001400);
  });
  it("clamps a progress outside [0, 1] to valid channels", () => {
    expect(lerpColor(0x000000, 0xffffff, 1.2)).toBe(0xffffff);
    expect(lerpColor(0xffffff, 0x000000, 1.2)).toBe(0x000000);
  });
});
```

In `builder.test.ts` (read its existing helpers first; it builds from compiled source in Node — `Text` needs a DOM, so these use non-text shapes):
- A circle with **no** colour animation: its `Graphics` child has `tint === 0xffffff` (PixiJS's default, i.e. untinted), its `__mareyLayout.currentColor === 0xff0000` for `color: red`, and it has no `__applyColor`. Assert the fill colour the `Graphics` context recorded is red — inspect `gfx.context.instructions` (log one once to find the fill colour's field; assert on that field, and say in a comment which field it is).
- The same circle with `animate { property: color, to: blue, duration: 1 }`: fill recorded as white, `tint === 0xff0000`, `__applyColor` present; set `currentColor = 0x00ff00`, call `__applyColor()`, and `tint === 0x00ff00`. The wrapper container's own `tint` stays `0xffffff`.
- A shape whose colour animation sits only inside a `parallel` inside its `sequence` is also tinted.
- A `line` with a colour animation: its stroke is white and its `Graphics` is tinted.
- A group: `currentColor` is `undefined`.

In `sceneRuntime.test.ts` — read the file's helpers (`RecordingWorld`, `anim()`, `makeContainer()`, `makeRoot()`) first; if `makeContainer` cannot produce a container with `currentColor` and `__applyColor`, extend it with an optional `color` field rather than duplicating it:
- A colour runner `red → blue`, `linear`, `duration: 1` (120 ticks): after 60 `advanceOneTick()` + `paintExactTick()`, `currentColor === lerpColor(0xff0000, 0x0000ff, 0.5) === 0x800080` and `__applyColor` was called with that value on the drawing (record calls in the fake).
- A two-step `sequence` red → blue → `#00ff80`: the second step starts from exactly `0x0000ff` even when the first step's last paint was at `paint(0.5)` (live cadence): run with `paint(0.5)` between every tick and assert the value at the first tick of step 2 equals the straight `paintExactTick` run's. This is invariant 3 for colour.
- **Review Focus 1:** the frame-pacing harness pattern (renderer.md invariant 3): the same physics object with and without a concurrent colour animation, run 120 ticks at 1, 7 and 12 ticks per paint — the `RecordingWorld` call log is identical across all six runs.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/compiler/renderer/color.test.ts src/compiler/renderer/builder.test.ts src/compiler/renderer/sceneRuntime.test.ts`
Expected: FAIL — `color.ts` does not exist; the builder has no `currentColor`; the runtime has no colour branch. Confirm each failure message says that, not something about the fixture.

- [ ] **Step 3: Implement `color.ts`**

```ts
import type { IRColor } from "../sceneIR";

/**
 * `#rrggbb` → `0xRRGGBB`. `resolvers.ts`'s `normaliseColor` expands `#rgb`
 * before anything reaches the IR, so a short form here is a compiler defect,
 * and it throws rather than draw the wrong colour.
 */
export function colorToInt(hex: IRColor): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`[renderer] Expected a normalised #rrggbb colour, got '${hex}'.`);
  }
  return parseInt(hex.slice(1), 16);
}

/**
 * Per-channel sRGB blend at eased progress `e`, each channel rounded where
 * it is written (Phase 7 spec §2.2), so paint, snapshot, hash, raster and
 * Lottie all read the same integer.
 */
export function lerpColor(a: number, b: number, e: number): number {
  const channel = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(ca + (cb - ca) * e)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
```

- [ ] **Step 4: Implement the builder change**

- Declare `currentColor?: number` in the `__mareyLayout` type and `__applyColor?: () => void` on the container (same `declare module` block as `__updateLayout`).
- Add, near the top of the file:

```ts
/**
 * Whether any `animate { property: color }` belongs to this shape: directly,
 * or as a step (or a `parallel` sub-step) of its sequence. Decided once at
 * build time, because only such a shape is drawn white and tinted (Phase 7
 * spec §2.3, D6) — every other shape keeps its colour in its fill, so its
 * pixels cannot change.
 */
function animatesColor(props: IRObjectProps): boolean {
  if (props.kind === "group") return false;
  const isColor = (s: IRAnimation | IRPhysics): boolean =>
    "property" in s && s.property === "color";
  if (props.animations.some(isColor)) return true;
  return props.sequences.some((seq) =>
    seq.steps.some((step) =>
      "type" in step && step.type === "parallel" ? step.steps.some(isColor) : isColor(step as IRAnimation | IRPhysics),
    ),
  );
}

/** Seed `currentColor`, and give a tinted shape the hook that applies it. */
function bindColor(wrapper: Container, drawing: Container, color: IRColor, tinted: boolean): void {
  const layout = wrapper.__mareyLayout!;
  layout.currentColor = colorToInt(color);
  if (!tinted) return;
  wrapper.__applyColor = () => {
    drawing.tint = layout.currentColor!;
  };
  wrapper.__applyColor();
}
```

- In each of `circle`, `rectangle`, `polygon`, `line` and `text`: compute `const tinted = animatesColor(props);`, draw with `tinted ? 0xffffff : props.color` (fill for circle/rectangle/polygon, stroke `color` for line, `TextStyle.fill` for text), and after `wrapper.addChild(...)` call `bindColor(wrapper, gfx /* or textObj */, props.color, tinted)`.
- Untinted shapes must call `.fill(props.color)` with the same argument as before — a string, not the converted integer — so their recorded draw instructions are unchanged.

- [ ] **Step 5: Implement the runtime change**

In `sceneRuntime.ts`:
- `applyAnim`, a new branch:

```ts
} else if (ra.anim.property === "color" && ra.container.__mareyLayout) {
  ra.container.__mareyLayout.currentColor = lerpColor(ra.startVal as number, ra.targetVal as number, e);
  // Unreachable unless `animatesColor` and the validator disagree about which
  // shapes animate colour; drawing nothing would be silent, so throw.
  if (!ra.container.__applyColor) {
    throw new Error(`[renderer] Container '${ra.container.__mareyId}' animates colour but was not built tinted.`);
  }
  ra.container.__applyColor();
}
```

- `getCurrentVal`: `if (prop === "color") return container.__mareyLayout?.currentColor ?? 0;`
- `spawnAnim`: after computing `tVal`, `if (anim.property === "color") tVal = colorToInt(anim.to as IRColor);`
- `pushAnimToWorld` already acts only on `position`, `scale` and `rotation`; read it and confirm a colour runner reaches none of its branches. Review Focus 1's test is the proof.

- [ ] **Step 6: Run the tests to verify they pass, then the whole suite**

Run the three files → PASS. Run `npm test` → all green; the count is the Task 1 count plus this task's new tests.

- [ ] **Step 7: Revert checks.** Separately: (a) make `animatesColor` return `false` for sequence steps — the sequence-only builder test fails; (b) remove the `colorToInt` in `spawnAnim` — the runner test fails; (c) delete the colour branch in `applyAnim` — the runner test fails. Record each failing test name. Also flip D6 deliberately: draw every shape white and tinted, and confirm the untinted-circle fill assertion fails.

- [ ] **Step 8: Docs.** Replace `docs/architecture/renderer.md`'s "Colour animation is half-built…" bullet with a short description of the mechanism: the integer value and rounding; `currentColor` on the layout; why only colour-animated shapes are tinted (the premultiplied 8-bit text-edge argument from spec §2.3); `__applyColor` as the colour counterpart of `__updateLayout`; colour never reaching the world.

- [ ] **Step 9: Run all four checks, then commit**

```bash
git add src/compiler/renderer/color.ts src/compiler/renderer/color.test.ts src/compiler/renderer/builder.ts src/compiler/renderer/builder.test.ts src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts docs/architecture/renderer.md
git diff --staged
git commit -m "feat(renderer): animate colour as a tint on the shapes that change it"
```

---

### Task 3: Colour in snapshots, rasters and Lottie

**Files:**
- Modify: `src/compiler/renderer/frameSampler.ts` (`ObjectSnapshot`, `snapshotFor`)
- Modify: `src/compiler/export/frameRaster.ts` (`applySnapshot`)
- Modify: `src/compiler/export/lottieEncode.ts` (`shapeItemsFor`, `encodeLottie`)
- Modify: `src/compiler/export/lottieGeometry.ts` (export a `rgb01OfInt` helper beside `hexToRgb01`)
- Test: `src/compiler/renderer/frameSampler.test.ts`, `src/compiler/export/frameRaster.test.ts`, `src/compiler/export/lottieEncode.test.ts`

**Interfaces:**
- Consumes: Task 2's `currentColor` and `__applyColor`.
- Produces: `ObjectSnapshot.color: number | null` (null for a group). `rgb01OfInt(c: number): readonly [number, number, number]`.

- [ ] **Step 1: Write the failing tests**

- `frameSampler.test.ts`: compile a 1 s scene (30 fps) with a rectangle animating `red → blue`, `linear`, `duration: 1`, beside a static circle and a group. Sample with `sampleFrames`. Frame 15 (tick 60): the rectangle's `color === 0x800080`; the circle's `color` is its declared colour on every frame; the group's `color === null`.
- `frameRaster.test.ts`: read its existing round-trip test (`snapshotFor` ∘ `applySnapshot`) and extend the fixture with a colour-animated shape: apply frame 15's snapshot onto a fresh tree, and the shape's drawing `tint === 0x800080` and `snapshotFor` reads `color` back unchanged.
- `lottieEncode.test.ts` (read the existing fixtures — `LayerSpec` and snapshot builders — first):
  - A layer whose snapshots all carry the same colour encodes its fill as `{ a: 0, k: hexToRgb01(declared) }` — `toEqual` against the exact array, so a value from different arithmetic fails.
  - A layer whose colour changes across three frames encodes `fl.c` as `a: 1` with three keyframes whose `s` are `rgb01OfInt` of each frame's colour.
  - A `line` layer does the same on `st.c`.
  - A `group` layer's `null` colour never reaches a shape item.

- [ ] **Step 2: Run them to verify they fail** — the snapshot has no `color`; `applySnapshot` never sets a tint; the encoder only knows the static `spec.color`.

- [ ] **Step 3: Implement**

`frameSampler.ts`: add to `ObjectSnapshot`:

```ts
  /**
   * The shape's colour as `0xRRGGBB`, or null for a group, which has none.
   * Added in Phase 7: without it every exported frame showed the starting
   * colour, because `frameRaster.ts` replays snapshots onto the one tree
   * `sampleFrames` drove to its final state.
   */
  readonly color: number | null;
```

and in `snapshotFor`: `color: layout.currentColor ?? null,`.

`frameRaster.ts` `applySnapshot`, after `c.visible = snap.visible;`:

```ts
        if (snap.color !== null) {
          layout.currentColor = snap.color;
          // Only a tinted shape has the hook; any other shape's colour never
          // changes, so the snapshot already equals what it draws.
          c.__applyColor?.();
        }
```

`lottieGeometry.ts`:

```ts
/** `0xRRGGBB` → the same 0–1 triple `hexToRgb01` gives for its hex form. */
export function rgb01OfInt(c: number): readonly [number, number, number] {
  return [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255];
}
```

`lottieEncode.ts`: in `encodeLottie`'s per-frame loop also collect `colors.push(snap.color === null ? null : [...rgb01OfInt(snap.color)])`. When `spec.color !== null`, build the colour property with `track(colors as number[][])` and pass it to `shapeItemsFor` in place of the static `color`; `shapeItemsFor`'s `c` fields take that property directly (`c: colorProp`). `track` collapses a constant colour to `{ a: 0, k: first }`, and `first` equals `hexToRgb01(declared)` element for element (same `parseInt / 255` arithmetic) — that equality is what keeps every colour-static document byte-identical. `hexOf` and solid layers are untouched.

- [ ] **Step 4: Run them to verify they pass; run `npm test`.** Existing tests that construct `ObjectSnapshot` literals now fail to typecheck for the missing `color`; add `color: null` (groups) or the shape's colour to each, listing the files in the report.

- [ ] **Step 5: Revert checks.** (a) Drop `color` from `snapshotFor` → the sampler test fails; (b) drop the `__applyColor?.()` call → the raster test fails; (c) build `fl.c` from `spec.color` again → the animated-layer encode test fails.

- [ ] **Step 6: Run all four checks, then commit**

```bash
git add src/compiler/renderer/frameSampler.ts src/compiler/renderer/frameSampler.test.ts src/compiler/export/frameRaster.ts src/compiler/export/frameRaster.test.ts src/compiler/export/lottieEncode.ts src/compiler/export/lottieEncode.test.ts src/compiler/export/lottieGeometry.ts
# plus each test file whose snapshot literals gained `color`, by path
git diff --staged
git commit -m "feat(export): carry colour through snapshots, rasters and Lottie colour tracks"
```

---

### Task 4: Headless playback — seek by replay

**Files:**
- Create: `src/compiler/renderer/playback.ts`, `src/compiler/renderer/playback.test.ts`
- Modify: `src/compiler/renderer/frameSampler.ts` (docstring only: the open question about sequence-bearing scenes, answered by this task's test)
- Modify: `docs/architecture/renderer.md` (a "Playback" section), `docs/determinism.md` (a paragraph on seek as replay)

**Interfaces:**
- Consumes: `SceneRuntime` (`advanceOneTick`, `paint`, `paintExactTick`, `isIdle`, `destroy`), `LiveDriver` from `clock.ts`, `snapshotFor` from `frameSampler.ts`, `hashFrames` from `../export/frameHash`.
- Produces (exact names; Task 5 and Task 7 use them):

```ts
export interface PlaybackState {
  readonly tick: number;
  readonly playing: boolean;
  readonly endTick: number | null;
  readonly reachedTick: number;
}

export interface PlaybackController {
  play(): void;
  pause(): void;
  /** Recorded; the next `frame()` performs the latest one and leaves playback paused. */
  seek(tick: number): void;
  /** Replay to tick 0 now and play. */
  restart(): void;
  subscribe(listener: (s: PlaybackState) => void): () => void;
  getState(): PlaybackState;
}

/** What `Playback` needs from whoever owns the stage. */
export interface PlaybackHost {
  /** A fresh tree, world and runtime from the cached IR. Does not touch the stage. */
  build(): { root: Container; runtime: SceneRuntime };
  /** Put `root` on the stage, destroying whatever tree was there. */
  attach(root: Container): void;
  /** Draw the current frame now. */
  render(): void;
}

export interface PlaybackStart {
  readonly tick: number;
  readonly playing: boolean;
}

export class Playback implements PlaybackController {
  constructor(host: PlaybackHost, endTick: number | null, start?: PlaybackStart);
  /** Called once per animation frame by the owner's ticker. */
  frame(deltaMS: number): void;
  /** Whether a seek is waiting for the next `frame()`. */
  hasPendingSeek(): boolean;
  /** `hashFrames` over the live tree's current snapshot. */
  snapshotHash(): string;
  /** The same hash for a fresh build replayed `tick` ticks with the sampler's loop. */
  referenceHash(tick: number): string;
  destroy(): void;
}
```

- [ ] **Step 1: Write the failing tests** in `playback.test.ts`.

A test host built from real compiled scenes, in Node:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { MatterWorld } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
import { snapshotFor } from "./frameSampler";
import { Playback, type PlaybackHost } from "./playback";
import { compileSource } from "../compileSource";
import { secondsToTicks, TICK_HZ, type IRObjectNode, type IRSceneNode } from "../sceneIR";
import { TICK_MS } from "./clock";

function irOf(path: string): IRSceneNode {
  const out = compileSource(readFileSync(path, "utf8"));
  if (!out.ir) throw new Error(`${path} did not compile`);
  return out.ir;
}

function hasText(nodes: ReadonlyArray<IRObjectNode>): boolean {
  return nodes.some((n) => n.props.kind === "text" || hasText(n.children ?? []));
}

class TestHost implements PlaybackHost {
  builds = 0;
  renders = 0;
  root: Container | null = null;
  constructor(private readonly ir: IRSceneNode) {}
  build() {
    this.builds++;
    const root = new Container();
    for (const n of this.ir.children) root.addChild(buildNode(n));
    const runtime = new SceneRuntime(new MatterWorld(this.ir.width, this.ir.height), root);
    return { root, runtime };
  }
  attach(root: Container) { this.root = root; }
  render() { this.renders++; }
}

function endTickOf(ir: IRSceneNode): number | null {
  return ir.duration === null ? null : secondsToTicks(ir.duration);
}
```

Read `IRObjectNode` for the real name of the children field before using `n.children`.

Tests:

1. **Seeking equals playing, every first-party scene without text.** Collect every `*.marey` under `src/examples/`, `eval/scenes-3b/` and `tools/visual-check/scenes/` (`git ls-files '*.marey'` filtered to those directories), compile, skip any with `hasText` and record the skipped names. For each, with `T = min(endTick ?? 480, 480)` ticks:
   - `straight`: `new Playback(host, endTick, { tick: T, playing: false })`, then `snapshotHash()`.
   - `jumpy`: start at 0 paused, `seek(T)`, `frame(0)`, `seek(Math.floor(T / 3))`, `frame(0)`, `seek(T)`, `frame(0)`, then `snapshotHash()`.
   - `live`: start at 0, `play()`, then call `frame(d)` with `d` cycling through `[1.25 * TICK_MS, 7.5 * TICK_MS, 12.75 * TICK_MS]` (bursts of 1, 7 and 12 ticks with alphas near 0.25, 0.5 and 0.75 — the driver's carried remainder shifts them, which is fine) until `getState().tick >= T` or playback stops, then `pause()`. Let `P = getState().tick`.
   - `straight` and `jumpy` equal `referenceHash(T)`; `live` equals `referenceHash(P)`. The live path cannot land on an exact tick, so it is compared at the tick it actually paused on.
   - Guard against a vacuous corpus: assert the included set contains `src/examples/physics-pile.marey`, at least one scene whose IR has a non-empty `sequences`, and at least one with a `handoff: true` animation. Any assertion failure names the scene.
2. **A forward seek does not rebuild; a backward one does.** At tick 0 after construction (`builds === 1`): `seek(100); frame(0)` → `builds === 1`; `seek(40); frame(0)` → `builds === 2`, and `getState().tick === 40`.
3. **Review Focus 3 — a burst of seeks in one frame costs one replay.** `seek(300); seek(10); seek(200); seek(50)` then one `frame(0)`: `builds` grows by exactly 1 and `tick === 50`.
4. **Stops at `endTick`.** A 2 s scene (`endTick === 240`) played with `frame(1000)` repeatedly (`LiveDriver` caps a frame at 12 ticks): `tick` never exceeds 240; once it reaches 240, `playing === false`; the snapshot equals `referenceHash(240)`. Then `play()` → `tick === 0`, `playing === true`.
5. **Indefinite scene: the bar grows and idles.** A scene with no `duration` whose only animation lasts 0.5 s: played to rest, `playing` becomes false at the tick `isIdle()` first holds, `reachedTick === tick`, and `seek(reachedTick + 50)` clamps to `reachedTick`. `play()` then continues from there (no restart).
6. **Review Focus 4.** Construct with `endTick 240` and `start { tick: 240, playing: false }`; then construct a second `Playback` for the same IR with `endTick 480` and the first one's `{ tick, playing }`: `tick === 240`, `playing === false`; `play()` then one `frame(TICK_MS)` → `tick === 241` (continued, not restarted).
7. **Start clamps to a shorter scene.** `start { tick: 400, playing: true }` with `endTick 240` → `tick === 240`, `playing === false`.
8. **Every state change notifies.** A subscriber records states; `play`, `pause`, a seek and reaching the end each produce a notification with the new values, and `subscribe`'s return unsubscribes.
9. **Restart plays from zero.** Paused at tick 150, `restart()` → `tick === 0`, `playing === true`, `builds` grew by 1; one `frame(TICK_MS * 1.5)` → `tick === 1`. Contrast pinned in the same test: `seek(0)` then `play()` then `frame(0)` leaves playback **paused** at 0, because a performed seek pauses — which is why the transport's restart button calls `restart()`.

- [ ] **Step 2: Run them to verify they fail** — `playback.ts` does not exist.

- [ ] **Step 3: Implement `playback.ts`**

```ts
import type { Container } from "pixi.js";
import type { SceneRuntime } from "./sceneRuntime";
import { LiveDriver } from "./clock";
import { snapshotFor } from "./frameSampler";
import { hashFrames } from "../export/frameHash";

// (interfaces exactly as in this task's Interfaces block)

export class Playback implements PlaybackController {
  private root!: Container;
  private runtime!: SceneRuntime;
  private tick = 0;
  private playing = false;
  private reachedTick = 0;
  private pendingSeek: number | null = null;
  private readonly driver = new LiveDriver();
  private readonly listeners = new Set<(s: PlaybackState) => void>();

  constructor(
    private readonly host: PlaybackHost,
    private readonly endTick: number | null,
    start: PlaybackStart = { tick: 0, playing: false },
  ) {
    this.mount();
    const target = this.endTick === null ? start.tick : Math.min(start.tick, this.endTick);
    this.replayTo(Math.max(0, target));
    this.playing = start.playing && !this.atEnd();
    this.host.render();
  }

  getState(): PlaybackState {
    return { tick: this.tick, playing: this.playing, endTick: this.endTick, reachedTick: this.reachedTick };
  }

  subscribe(listener: (s: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(): void {
    if (this.atEnd()) this.replayTo(0);
    this.playing = true;
    this.driver.reset();
    this.notify();
  }

  pause(): void {
    this.playing = false;
    this.driver.reset();
    // A paused frame is always an exportable frame (spec §3.1).
    this.runtime.paintExactTick();
    this.host.render();
    this.notify();
  }

  /** Recorded only; `frame()` performs the latest one (spec §3.2). */
  seek(tick: number): void {
    const end = this.endTick ?? this.reachedTick;
    this.pendingSeek = Math.max(0, Math.min(Math.round(tick), end));
  }

  hasPendingSeek(): boolean {
    return this.pendingSeek !== null;
  }

  restart(): void {
    this.pendingSeek = null;
    this.replayTo(0);
    this.playing = true;
    this.driver.reset();
    this.host.render();
    this.notify();
  }

  frame(deltaMS: number): void {
    if (this.pendingSeek !== null) {
      const target = this.pendingSeek;
      this.pendingSeek = null;
      this.playing = false;
      this.driver.reset();
      this.replayTo(target);
      this.host.render();
      this.notify();
      return;
    }
    if (!this.playing) return;

    let ticks = this.driver.pump(deltaMS);
    if (this.endTick !== null) ticks = Math.min(ticks, this.endTick - this.tick);
    for (let i = 0; i < ticks; i++) {
      this.runtime.advanceOneTick();
      this.tick++;
    }
    this.reachedTick = Math.max(this.reachedTick, this.tick);

    if (this.atEnd() || (this.endTick === null && this.runtime.isIdle())) {
      this.playing = false;
      this.runtime.paintExactTick();
    } else {
      this.runtime.paint(this.driver.alpha);
    }
    this.host.render();
    this.notify();
  }

  snapshotHash(): string {
    return hashFrames([{ index: 0, tick: this.tick, objects: snapshotFor(this.root) }]);
  }

  referenceHash(tick: number): string {
    const { root, runtime } = this.host.build();
    for (let i = 0; i < tick; i++) {
      runtime.advanceOneTick();
      runtime.paintExactTick();
    }
    const hash = hashFrames([{ index: 0, tick, objects: snapshotFor(root) }]);
    runtime.destroy();
    root.destroy({ children: true });
    return hash;
  }

  destroy(): void {
    this.runtime.destroy();
    this.listeners.clear();
  }

  private atEnd(): boolean {
    return this.endTick !== null && this.tick >= this.endTick;
  }

  private mount(): void {
    const { root, runtime } = this.host.build();
    this.root = root;
    this.runtime = runtime;
    this.host.attach(root);
    this.tick = 0;
  }

  /** Spec §3.1: backward rebuilds; forward continues. The sampler's loop, exactly. */
  private replayTo(target: number): void {
    if (target < this.tick) {
      this.runtime.destroy();
      this.mount();
    }
    while (this.tick < target) {
      this.runtime.advanceOneTick();
      this.runtime.paintExactTick();
      this.tick++;
    }
    this.runtime.paintExactTick();
    this.reachedTick = Math.max(this.reachedTick, this.tick);
  }

  private notify(): void {
    const s = this.getState();
    for (const l of this.listeners) l(s);
  }
}
```

`hashFrames` takes `FrameSnapshot[]`; if its object type requires `Object.freeze`d arrays, match how `sampleFrames` builds them. `frameSampler.ts` imports `SceneRuntime` as a type, and `playback.ts` must not import `pixi.js` at runtime (type-only import, like `sceneRuntime.ts`).

- [ ] **Step 4: Run them to verify they pass; run `npm test`.** If test 1's `live` path differs from `straight` on any scene, **do not adjust the test**: that is a determinism defect in the live paint path (invariant 3). Stop and report the scene, the first tick at which `snapshotHash` diverges (bisect `T`), and which object's fields differ.

- [ ] **Step 5: Revert checks.** (a) In `replayTo`, skip the rebuild on a backward seek → test 2 fails; (b) make `frame()` perform every recorded seek rather than the latest → test 3 fails; (c) drop the `endTick` clamp on `ticks` → test 4 fails; (d) remove `pause()`'s `paintExactTick()` → test 1's `live` path fails on at least one scene — if it does not, say so (the live state may already equal exact at the paused tick for every corpus scene), and keep the call, which spec §3.1 requires regardless.

- [ ] **Step 6: Docs.**
  - `docs/architecture/renderer.md`: a "Playback" section — seek is replay from tick 0 with the sampler's loop; forward seek continues; seeks are coalesced to one per frame; pause and the end of a scene paint the exact tick; a declared `duration` bounds playback; an indefinite scene's bar is `reachedTick` and it pauses on idle; `Playback` is headless and `adapter.ts` owns the ticker.
  - `frameSampler.ts`'s docstring and renderer.md's frame-sampler paragraph: replace "whether a mid-scene sequence step could still observe paint-phase state some other way is untested here and open" with the result of test 1 — the live-cadence path equals the exact path on every sequence-bearing first-party scene in the corpus, naming how many scenes that was.
  - `docs/determinism.md`: one paragraph — seek is replay, so a sought or paused frame is the frame an exporter samples at that tick; `referenceHash` compares the two in the same engine.

- [ ] **Step 7: Run all four checks, then commit**

```bash
git add src/compiler/renderer/playback.ts src/compiler/renderer/playback.test.ts src/compiler/renderer/frameSampler.ts docs/architecture/renderer.md docs/determinism.md
git diff --staged
git commit -m "feat(renderer): seek any tick by replaying from zero with the sampler's loop"
```

---

### Task 5: Transport and the remembered playhead in the playground

**Files:**
- Modify: `src/compiler/renderer/adapter.ts`, `src/compiler/renderer/index.ts`, `src/compiler/index.ts`
- Modify: `src/store/index.ts`, `src/hooks/useCompile.ts`, `src/components/Preview/Preview.tsx`, `src/components/Preview/Preview.module.scss`
- Create: `src/lib/playhead.ts`, `src/lib/playhead.test.ts`, `src/components/Preview/Transport.tsx`, `src/components/Preview/Transport.module.scss`, `src/lib/devPlaybackSeam.ts`
- Modify: `src/main.tsx` (install the seam beside the others), `docs/LANGUAGE.md` (the `scene` `duration` paragraph)

**Interfaces:**
- Consumes: Task 4's `Playback`, `PlaybackController`, `PlaybackState`, `PlaybackStart`.
- Produces:
  - `IRendererAdapter.render(scene, host, isDark, start?: PlaybackStart): Promise<{ cleanup: () => void; playback: Playback }>`; `renderScene` passes it through.
  - `compile(source, host, isDark, start?: PlaybackStart)`; `CompileResultWithCleanup` gains `playback: Playback | null`.
  - Store: `playback: PlaybackState | null`, `playbackController: PlaybackController | null`, `setPlayback(state)`, `setPlaybackController(c)`.
  - `src/lib/playhead.ts`: `formatPlayhead(s: PlaybackState): string` and `nextStart(remembered: PlaybackStart | null, fileChanged: boolean): PlaybackStart | undefined`.
  - `LivePlayback = PlaybackController & { readonly inner: Playback }`, exported from `adapter.ts`.
  - `window.__mareyPlayback` (dev only): `{ state(): PlaybackState; play(): void; pause(): void; restart(): void; seek(tick: number): Promise<PlaybackState>; snapshotHash(): string; referenceHash(tick: number): string }`.

- [ ] **Step 1: Write the failing tests** — `src/lib/playhead.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatPlayhead, nextStart } from "./playhead";

const s = (tick: number, endTick: number | null, reachedTick = tick) =>
  ({ tick, playing: false, endTick, reachedTick });

describe("formatPlayhead", () => {
  it("shows position and length for a scene with a duration", () => {
    expect(formatPlayhead(s(150, 480))).toBe("1.25 / 4.00 s");
  });
  it("shows position alone for an indefinite scene", () => {
    expect(formatPlayhead(s(1488, null))).toBe("12.40 s");
  });
});

describe("nextStart", () => {
  it("restores the remembered playhead after an edit", () => {
    expect(nextStart({ tick: 90, playing: true }, false)).toEqual({ tick: 90, playing: true });
  });
  it("starts from zero when the file was replaced", () => {
    expect(nextStart({ tick: 90, playing: true }, true)).toBeUndefined();
  });
  it("starts from zero when nothing is remembered", () => {
    expect(nextStart(null, false)).toBeUndefined();
  });
});
```

**Review Focus 5** is a property of `useCompile`, not of a pure function: the playhead is remembered only from the controller of the compile that is currently displayed. Implement it so the subscription is attached only after the `currentId !== compileIdRef.current` race check has passed, and the previous controller's subscription is removed in the same place the previous `cleanup` is called. Task 7's browser check exercises rapid edits; say in the report that this is where it is pinned.

- [ ] **Step 2: Run them to verify they fail** — `playhead.ts` does not exist.

- [ ] **Step 3: Implement `playhead.ts`**

```ts
import type { PlaybackStart, PlaybackState } from "../compiler/renderer/playback";
import { TICK_HZ } from "../compiler/sceneIR";

/** `1.25 / 4.00 s`, or `12.40 s` for a scene with no declared length (spec §3.4). */
export function formatPlayhead(s: PlaybackState): string {
  const sec = (ticks: number): string => (ticks / TICK_HZ).toFixed(2);
  return s.endTick === null ? `${sec(s.tick)} s` : `${sec(s.tick)} / ${sec(s.endTick)} s`;
}

/** Spec §3.5: an edit keeps the playhead; a replaced file starts at 0. */
export function nextStart(remembered: PlaybackStart | null, fileChanged: boolean): PlaybackStart | undefined {
  if (fileChanged || remembered === null) return undefined;
  return { tick: remembered.tick, playing: remembered.playing };
}
```

- [ ] **Step 4: Adapter.** In `adapter.ts`'s `render`, keep everything up to building `sceneRoot` and the layout/resize code; replace the runtime/driver/ticker block with a `Playback` whose host builds a fresh scene subtree under `sceneRoot` each time:

```ts
    const objectsLayer = new Container();
    sceneRoot.addChild(objectsLayer);

    const host: PlaybackHost = {
      build() {
        const root = new Container();
        for (const node of scene.children) root.addChild(buildNode(node));
        const runtime = new SceneRuntime(new MatterWorld(logicalWidth, logicalHeight), root);
        return { root, runtime };
      },
      attach(root) {
        for (const old of objectsLayer.removeChildren()) old.destroy({ children: true });
        objectsLayer.addChild(root);
      },
      render() {
        sharedApp?.render();
      },
    };

    const endTick = scene.duration === null ? null : secondsToTicks(scene.duration);
    const playback = new Playback(host, endTick, start);

    // `ticker.deltaMS` still appears exactly once in the renderer: here.
    activeTickerCallback = (ticker: Ticker) => {
      playback.frame(ticker.deltaMS);
      if (!playback.getState().playing && !playback.hasPendingSeek()) sharedApp?.ticker.stop();
    };
    sharedApp.ticker.add(activeTickerCallback);
    const wake = (): void => { sharedApp?.ticker.start(); };
```

The objects layer is added after the background and the mask, so paint order is unchanged and the mask stays on `sceneRoot`.

The ticker is stopped whenever playback is paused, and a `seek` does not notify until the next `frame()` performs it, so `play`, `seek` and `restart` must also wake the ticker. The adapter therefore returns a wrapper, not the bare `Playback`:

```ts
export type LivePlayback = PlaybackController & { readonly inner: Playback };

    const control: LivePlayback = {
      inner: playback,
      play: () => { playback.play(); wake(); },
      pause: () => playback.pause(),
      seek: (tick) => { playback.seek(tick); wake(); },
      restart: () => { playback.restart(); wake(); },
      subscribe: (l) => playback.subscribe(l),
      getState: () => playback.getState(),
    };
```

`render` returns `{ cleanup, playback: control }`, typed `Promise<{ cleanup: () => void; playback: LivePlayback }>`, and `compile`'s result uses `LivePlayback` too (the dev seam needs `inner` for the hashes). Call `wake()` once after construction when `start?.playing` is true. `cleanup` calls `playback.destroy()` where the old code called `runtime.destroy()`.

The old code stopped the ticker when `runtime.isIdle()`; that logic now lives in `Playback.frame` (spec §3.3), so no idle check remains in the adapter.

- [ ] **Step 5: Store, `compile`, `useCompile`.**
  - Store: the four fields/setters from the Interfaces block, initialised to `null`; `newFile` and `loadExample` also set `playback: null` (the controller is replaced by the next compile).
  - `src/compiler/index.ts`: thread `start` through `compile` to `renderScene`, and put the adapter's `playback` on the resolved result (`null` on every failure path).
  - `useCompile`: keep `rememberedRef = useRef<PlaybackStart | null>(null)` and `lastFileIdRef = useRef(fileId)` (read `fileId` from the store like the other selectors). In `runCompile`, before `compile(...)`: `const fileChanged = fileIdRef.current !== lastFileIdRef.current; lastFileIdRef.current = fileIdRef.current; if (fileChanged) rememberedRef.current = null; const start = nextStart(rememberedRef.current, fileChanged);`. Where the old `cleanup` is called, also call the previous unsubscribe and `setPlaybackController(null)`. After the race check passes: `setPlaybackController(result.playback)`, then `unsubscribeRef.current = result.playback?.subscribe((st) => { rememberedRef.current = { tick: st.tick, playing: st.playing }; setPlayback(st); }) ?? null;` and seed both with `result.playback.getState()`. On a failed compile, leave `rememberedRef` untouched (spec §3.5) and set `playback` to `null`.

- [ ] **Step 6: Transport component.** `Transport.tsx` reads `playback` and `playbackController` from the store and renders nothing when either is null. Layout and controls per spec §3.4:

```tsx
export const Transport: FunctionComponent = () => {
  const state = useAppStore((s) => s.playback);
  const control = useAppStore((s) => s.playbackController);
  if (!state || !control) return null;
  const max = state.endTick ?? state.reachedTick;
  return (
    <div className={styles.transport} data-transport>
      <button type="button" className={styles.button} data-transport-toggle
        aria-label={state.playing ? "Pause" : "Play"}
        onClick={() => (state.playing ? control.pause() : control.play())}>
        {state.playing ? "❚❚" : "▶"}
      </button>
      <button type="button" className={styles.button} data-transport-restart aria-label="Restart"
        onClick={() => control.restart()}>
        ↺
      </button>
      <input type="range" className={styles.scrub} data-transport-scrub aria-label="Playhead"
        min={0} max={max} step={1} value={state.tick}
        onInput={(e) => control.seek(Number((e.target as HTMLInputElement).value))} />
      <span className={styles.readout} data-transport-readout>{formatPlayhead(state)}</span>
    </div>
  );
};
```

`Transport.module.scss`: a flex row along the pane's bottom edge, height 32px, gap 8px, padding `0 12px`, `font-family: var(--font-ui)`, `font-variant-numeric: tabular-nums`, `font-size: 12px`, `color: var(--text-secondary)`; the range input takes the remaining width (`flex: 1`); buttons are unstyled icon buttons in the same colour, `color: var(--text-primary)` on hover. Check both themes render it legibly.

`Preview.tsx`: render `<Transport />` as the last child of the pane wrapper, and make the host box end above it — change `.host`'s bottom inset (read `Preview.module.scss`) to leave the strip's 32px, so `plateRect` keeps measuring the host's own client box and plate geometry needs no change.

- [ ] **Step 7: Dev seam.** `src/lib/devPlaybackSeam.ts`, following `devExportSeam.ts`'s pattern (declare the global; `installPlaybackSeam()`), reading the controller from `useAppStore.getState().playbackController`:
  - `state()`, `play()`, `pause()`, `restart()` delegate.
  - `seek(tick)` calls `seek` and resolves with the state after the next notification (subscribe, resolve, unsubscribe).
  - `snapshotHash()` and `referenceHash(tick)` call through `inner`.
  - Throws `"[devPlaybackSeam] no scene is mounted"` when the controller is null.
  Install it in `main.tsx` inside the existing `if (import.meta.env.DEV)` block, like the others.

- [ ] **Step 8: Docs.** Rewrite `docs/LANGUAGE.md`'s `duration` paragraph: `duration` declares the scene's length; the preview stops there and an exporter samples up to it; a scene that omits it is indefinite — the preview plays on until the scene comes to rest, and export needs an explicit bound.

- [ ] **Step 9: Run `npm test` and `npm run build`.** Then a browser smoke check (Global Constraint 6): start Vite, open the playground with `tools/visual-check/playground-check.mjs` or a short Playwright script under `.visual-check/phase7/`, and confirm: the strip renders under the plate in both themes; the default example plays and the readout counts; scrubbing moves the frame; editing a colour while paused keeps the readout. Save screenshots under `.visual-check/phase7/transport/` and look at them. Kill Vite and confirm port 5199 is free.

- [ ] **Step 10: Run all four checks, then commit**

```bash
git add src/compiler/renderer/adapter.ts src/compiler/renderer/index.ts src/compiler/index.ts src/store/index.ts src/hooks/useCompile.ts src/lib/playhead.ts src/lib/playhead.test.ts src/lib/devPlaybackSeam.ts src/main.tsx src/components/Preview/Preview.tsx src/components/Preview/Preview.module.scss src/components/Preview/Transport.tsx src/components/Preview/Transport.module.scss docs/LANGUAGE.md
git diff --staged
git commit -m "feat(playground): scrub the preview and keep the playhead across edits"
```

---

### Task 6: Colour evidence across every output

**Files:**
- Create: `tools/visual-check/scenes/color-sequence.marey`, `tools/visual-check/color-check.mjs`, `eval/RESULTS-PHASE-7.md`
- Modify: `tools/visual-check/README.md` (a short "Checking colour animation" section)

**Interfaces:**
- Consumes: the dev seams `window.__mareyExportPng` (`src/lib/devExportSeam.ts`), Task 1's baseline manifest at `.visual-check/phase7/baseline/manifest.txt`, `lottie-check.mjs`, `apng-check.mjs`, `video-check.mjs`/`quality-check.mjs` as documented in `tools/visual-check/README.md`.

- [ ] **Step 1: The fixture.** `color-sequence.marey`, 800×600, `duration: 2` (60 frames at 30 fps):
  - `rectangle swatch` at (200, 300), 160×160, `color: red`, with a `sequence` of `animate { property: color, to: blue, duration: 1, easing: easeInOut }` then `animate { property: color, to: #00ff80, duration: 1, easing: easeInOut }`.
  - `circle pulse` at (450, 300), radius 70, `color: #202020`, with `animate { property: color, to: yellow, duration: 0.5, easing: linear, loop: true, yoyo: true }`.
  - `line stroke` from (560, 200) to (740, 400), `thickness: 24`, `color: white`, with `animate { property: color, to: magenta, duration: 2, easing: linear }`.
  - `text label` at (400, 520), `"colour"`, `fontSize: 48`, `color: cyan`, with `animate { property: color, to: orange, duration: 2, easing: easeIn }`.
  Read `docs/LANGUAGE.md` for the exact property names of `line` and `text` before writing it; it must pass `node bin/marey.mjs check`.

- [ ] **Step 2: `color-check.mjs`.** A Node script in the style of `export-check.mjs` (read it first; reuse its server/launch helpers from `tools/visual-check/lib/` if they exist):
  - Calls `window.__mareyExportPng(source, { fps: 30 })` on the fixture, decodes frames 0, 15, 30, 45 and 59 in-page (an `ImageBitmap` drawn to an `OffscreenCanvas`, then `getImageData`).
  - Reads the pixel at each non-text shape's centre: swatch (200, 300), pulse (450, 300), and the line's midpoint (650, 300).
  - Computes the expected colour **independently** — re-implement the easing curves and the §2.2 formula in the script from `src/compiler/renderer/easing.ts`'s documented formulas, not by importing the renderer — at the frame's tick (`frame × 4`), including the sequence's step boundary at tick 120 and the loop/yoyo phase of `pulse`.
  - Writes `report.json` with `{ frame, shape, expected, actual, delta }` rows and exits non-zero if any channel differs by more than 1.
  - Saves the five PNGs to look at.

- [ ] **Step 3: Run every colour check** (Vite on 5199 with `--strictPort`):
  - `node tools/visual-check/color-check.mjs --scene tools/visual-check/scenes/color-sequence.marey --out .visual-check/phase7/color/png`
  - `lottie-check.mjs` on the fixture with `--compare-png --frames 0,15,30,45,59 --at 200,300 --at 450,300 --at 650,300 --out .visual-check/phase7/color/lottie`; then confirm each `--at` sample is within ±2 per channel of the PNG export's pixel at that frame, and **open the diff PNGs**: mismatches only along edges (and text), never inside a flat region.
  - `apng-check.mjs` on the fixture: 0 differing bytes on every frame.
  - The video check from `tools/visual-check/README.md` ("Measuring video quality") on the fixture, against its PNG frames: within the existing gate.
  - Kill Vite; confirm 5199 is free.

- [ ] **Step 4: Static colours unchanged.** Rebuild the CLI and re-export exactly the scenes, formats and flags Task 1 Step 0 recorded, to `.visual-check/phase7/after/`, write the same manifest, and `diff` the two manifests (ignoring the commit line). Every PNG and every Lottie document must match. If any differs, stop and report the file and the first differing byte offset; do not proceed.

- [ ] **Step 5: `eval/RESULTS-PHASE-7.md`.** Create it with: the commits measured; the colour fixture; a table of `color-check` rows; the Lottie `--at` samples and what the diff images showed (with the share/maxDelta numbers); the APNG and video results; the static-colour manifest comparison (count of files, all identical); and a note that frame hashes changed once in Phase 7 because snapshots gained `color`, so hashes recorded in earlier RESULTS files predate the field. Every number comes from a file under `.visual-check/phase7/`; cite the path.

- [ ] **Step 6: README.** Add a short "Checking colour animation" section to `tools/visual-check/README.md`: what `color-check.mjs` measures, its flags, and the exit rule.

- [ ] **Step 7: Run all four checks, then commit**

```bash
git add tools/visual-check/scenes/color-sequence.marey tools/visual-check/color-check.mjs tools/visual-check/README.md eval/RESULTS-PHASE-7.md
git diff --staged
git commit -m "test(export): measure colour animation in PNG, APNG, video and Lottie"
```

---

### Task 7: Playback evidence, status and the roadmap amendment

**Files:**
- Create: `tools/visual-check/transport-check.mjs`
- Modify: `eval/RESULTS-PHASE-7.md`, `tools/visual-check/README.md`, `docs/specs/2026-09-09-marey-engineering-roadmap-design.md` (§10), `docs/architecture/roadmap-and-process.md`, `docs/architecture/README.md`

**Interfaces:**
- Consumes: `window.__mareyPlayback` (Task 5), the playground's editor. Read how `playground-check.mjs` drives the page and sets editor content, and reuse that.

- [ ] **Step 1: `transport-check.mjs`.** Against the running dev server, for each of the five `src/examples/*.marey` (load through the example picker the way a person would — read `TopBar.tsx` for the control) and the colour fixture (pasted into the editor):
  1. **Seek equals reference.** For ticks `[0, 37, 120, endTick or 480]` in a shuffled order, `await __mareyPlayback.seek(t)`, then require `snapshotHash() === referenceHash(t)`. Record the time each backward seek took (`performance.now()` around the awaited seek).
  2. **Live play equals reference.** `play()`, wait ~1.5 s of wall clock, `pause()`, read `state().tick`, require `snapshotHash() === referenceHash(tick)`.
  3. **Stops at the end** (scenes with a duration): `seek(endTick - 10)`, `play()`, wait until `state().playing === false`; require `tick === endTick`; then click the play toggle and require `tick` restarted below 30.
  4. **Recompile keeps the playhead** (the colour fixture): pause at tick 90; change `to: blue` to `to: green` in the editor; wait for the compile; require `state().tick === 90` and `snapshotHash() === referenceHash(90)` on the new scene. Repeat while playing: the tick after recompile is ≥ the tick before. Then change `duration: 2` to `duration: 0.5` while paused at 90: the tick becomes 60 (`endTick`). Then **rapid edits**: five edits 100 ms apart while playing; after the last compile settles, `state()` belongs to the displayed scene (its `endTick` matches the last edit's duration) and `snapshotHash() === referenceHash(state().tick)`.
  5. **File replacement resets.** Pause at a nonzero tick, choose another example: `tick === 0`.
  6. A screenshot of the transport in both themes.
  Exit non-zero on any failed requirement; write `report.json`.

- [ ] **Step 2: Run it.** Vite on 5199 `--strictPort`; `node tools/visual-check/transport-check.mjs --out .visual-check/phase7/transport`. Look at the screenshots. Kill Vite; confirm 5199 is free.

- [ ] **Step 3: RESULTS.** Add a "Playback" section to `eval/RESULTS-PHASE-7.md`: the headless result from `playback.test.ts` (scene count, which were skipped for `text` and why, that the corpus includes physics, sequence and handoff scenes); every `transport-check` requirement with its result; the measured backward-seek times per example, set beside spec §3.6's headless numbers; and the six spec §4 criteria, each marked met with its evidence, or not met with what was found.

- [ ] **Step 4: Status and the roadmap amendment.**
  - `docs/specs/2026-09-09-marey-engineering-roadmap-design.md` §10: a dated amendment block (the file's existing `> **Amended …**` style): `stagger` was dropped on 2026-10-07 because Phase 3C's `delay` already writes a linear stagger in one line, and finish-line item 5 is met by it; non-linear distributions need `abs`/`min`/`max` and are further capability.
  - `docs/architecture/roadmap-and-process.md`: the Phase 7 bullet records what shipped, the stagger drop, and where the design, plan and evidence are; it does not claim a merge.
  - `docs/architecture/README.md`: the current-phase line matches. Both status locations are edited in this one commit (engineering-lessons §5b).
  - `tools/visual-check/README.md`: a short "Checking playback" section for `transport-check.mjs`.

- [ ] **Step 5: Run all four checks plus `npm run check:export` and `npm run check:pack`; then commit**

```bash
git add tools/visual-check/transport-check.mjs tools/visual-check/README.md eval/RESULTS-PHASE-7.md docs/specs/2026-09-09-marey-engineering-roadmap-design.md docs/architecture/roadmap-and-process.md docs/architecture/README.md
git diff --staged
git commit -m "docs(7): record playback evidence, drop stagger from the roadmap, update status"
```
