# Phase 10A — `from`, spring easing, portable trigonometry and follow-ups: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `from` and `easing: spring` (with `bounce`) to `animate`, compute
trigonometry portably, reject two physics blocks in one `parallel`, and
frame-hash every first-party scene.

**Architecture:**
- A pure `detMath.ts` (only `+ - * /`, `%` and `Math.floor`) backs parse-time
  `sin`/`cos` and the spring curve.
- `from` and `bounce` are new defaulted fields on `IRAnimation`.
  - `from` only changes the runner's start value.
  - `spring` is one more curve in `easing.ts`.
- One new validator rule covers the `parallel` case.
- The hash test becomes a closed table over every `.marey` file.

**Tech Stack:** TypeScript (strict), Vitest, PixiJS (renderer only),
Matter.js, Playwright for the browser checks.

**Spec:** `docs/specs/2026-11-27-marey-phase-10a-from-spring-and-determinism-design.md`

## Global Constraints

- Repository rules in `AGENTS.md` apply to every commit:
  - Stage explicit paths and read `git diff --staged`.
  - Never use `git add -A`, `git add .` or `git add -f`.
  - Commit subjects use Conventional Commits.
  - No `Co-Authored-By` lines, and committed text never names tools or the workflow.
- Before every commit, all four pass:
  - `npm test`
  - `npx vitest run --config eval/vitest.config.ts`
  - `npm run build`
  - `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`
- Run the shell from `C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`, with a capital `C:`. With a lower-case drive letter, vitest reports "no tests".
- `core.autocrlf` is on: judge changes with `git diff --stat -- <path>`, never `git status`.
- Branch `phase-10a`. Do not push; the controller merges and pushes.
- Browser checks run against `npx vite --port 5199 --strictPort`. Kill it afterwards and confirm the port is free.
- `easing.ts` and `detMath.ts` import nothing from `pixi.js`.
- `bounce` on `animate`: number, range `[0, 0.9]`, default `0.25`. Settle tolerance `ε = 1e-4`.
- `from`: kinds `number`, `point`, `color`; no default; IR value `null` when absent.
- New diagnostic codes, spelled exactly: `TYPE_BOUNCE_WITHOUT_SPRING`, `TYPE_HANDOFF_SPRING`, `TYPE_PARALLEL_ONE_PHYSICS`.
- `detMath` functions are within 2 ulp of the correctly rounded value, measured, and exact at the cardinal angles (0, 90, 180, 270 degrees).
- `from` or `spring` alone moves no existing frame hash. Only Task 3 (trig) may move hashes, and only for scenes that call `sin` or `cos`.
- For every rule a task adds, delete the line that implements it, run the suite, see red, and restore. Report the failing output in the task report (engineering-lessons §2c).
  - A gap this check finds in a behaviour the task *requires* is in scope.
  - A gap in an adjacent behaviour is filed, not fixed.
- Site version notes read "0.8.0 or later". Do not change `package.json`'s version.

## Review Focus

1. A `from` inside a `sequence` step, where an earlier step animates the same property. The object must not show the later `from` at tick 0 (Task 5, test 4).
2. A `from` on `position`, with a `delay`, for an object with a sibling `physics` block. The body is held at `from` through the delay and never simulates from its declared position (Task 5, test 5).
3. A spring with `loop: true` and `yoyo: true`. Every cycle ends exactly on its end value, and the value at each wrap equals the first cycle's: no drift (Task 6, test 3).
4. `bounce: 0.95` is rejected by the range constraint, while `bounce: 0` and `bounce: 0.9` compile and end exactly (Task 6, tests 1–2).
5. `from: #ff0000` on a group's colour animation gets `TYPE_ANIM_COLOR_TARGET`, and `from: (-1, 1)` on scale gets `TYPE_INVALID_SCALE`, through the same function as `to` (Task 5, test 2).

---

### Task 1: Frame-hash every first-party scene

Corpus only, and no production change. This fixes the "before" values for the whole phase.

**Files:**
- Modify: `src/compiler/renderer/sceneFrameHashes.test.ts`

**Interfaces:**
- Produces: `BASELINE: Readonly<Record<string, string>>`, where each value is an 8-hex hash, `"text"` or `"error"`. Later tasks edit entries and give a reason in their commit message.

- [ ] **Step 1: Widen `SOURCES` to every tracked `.marey` file.**
  Use one `import.meta.glob("../../../**/*.marey", { query: "?raw", import: "default", eager: true })` that excludes `node_modules`, `dist`, `.visual-check` and `.superpowers`, with `!` patterns.
- [ ] **Step 2: Add the closed-table test** `"has an entry for every first-party scene and no stale entries"`:
  ```ts
  expect(Object.keys(SOURCES).sort()).toEqual(Object.keys(BASELINE).sort());
  ```
- [ ] **Step 3: Classify and hash each file.**
  - An `"error"` entry must fail `compileSource`. Assert it fails, so an error sample that starts compiling turns red.
  - A `"text"` entry must contain text (`hasText`).
  - Every other entry is hashed as `hashScene` does today: 4 s at 30 fps.
- [ ] **Step 4: Fill the table.** Generate values with a throwaway local script, never committed. Then cross-check by hand:
  - The 25 existing Phase 8 hashes are unchanged.
  - The set of files equals `git ls-files '*.marey'`.
- [ ] **Step 5: Run the checks.** Run `npx vitest run src/compiler/renderer/sceneFrameHashes.test.ts`; it should pass. Then delete one table entry and confirm the closed-table test goes red, and restore it.
- [ ] **Step 6: Commit.** Subject: `test(renderer): frame-hash every first-party scene`

### Task 2: `detMath`

**Files:**
- Create: `src/compiler/detMath.ts`, `src/compiler/detMath.test.ts`

**Interfaces:**
- Produces:
  - `export function sinDeg(deg: number): number`
  - `export function cosDeg(deg: number): number`
  - `export function detExp(x: number): number`
  - `export const RAD_TO_DEG = 57.29577951308232`
- `detExp` must be accurate on `[-50, 0]`, which covers the spring. Outside `[-708, 709]` it returns `0` or `Infinity` exactly. `NaN` returns `NaN`.

- [ ] **Step 1: Write the tests.**
  - Cardinal angles: `sinDeg(0) === 0`, `sinDeg(90) === 1`, `sinDeg(180) === 0`, `sinDeg(270) === -1`, `cosDeg(0) === 1`, `cosDeg(90) === 0`.
  - Negative angles and angles above 360: `sinDeg(-90) === -1` and `sinDeg(450) === 1`.
  - `detExp(0) === 1`.
  - A dense sweep against a high-precision reference:
    - Every 0.01° on [-720, 720] for `sinDeg`/`cosDeg`, and every 0.001 on [-50, 0] for `detExp`.
    - The reference is `BigInt` fixed-point Taylor at 40 decimal digits, written in the test file. `Math.*` is not the reference: it is the thing being replaced.
    - Assert max ulp error ≤ 2, and print the measured maximum.
  - **Portability guard:** a test that reads `detMath.ts`'s source and asserts it contains no `Math.` other than `Math.floor`, `Math.abs` and `Math.trunc`.
- [ ] **Step 2: Run the tests** and see them fail on the missing module.
- [ ] **Step 3: Implement.**
  - Degrees: exact `%` reduction, then quadrant and octant folding into [0°, 45°], then one multiply by `π/180`, then fixed-degree odd and even polynomials.
  - Exp: Cody–Waite reduction by `ln 2`, with a two-part constant so the first product is exact. Evaluate a polynomial on `[-ln2/2, ln2/2]` and build `2^k` exactly, multiplying by powers of two.
  - The header documents the no-FMA requirement for any port (`-ffp-contract=off`).
- [ ] **Step 4: Run the tests** and see them pass. Record each measured max ulp in the report.
- [ ] **Step 5: Commit.** Subject: `feat(compiler): add portable sin, cos and exp`

### Task 3: Parse-time `sin`/`cos` through `detMath`, measured across engines

**Files:**
- Modify: `src/compiler/parser/parseExpr.ts` (the `sinDegrees` helper and the `cos` call site), `src/compiler/__snapshots__/determinism.test.ts.snap`, `src/compiler/renderer/sceneFrameHashes.test.ts` (entries for trig scenes only), `src/compiler/export/frameHash.ts` (docstring)

**Interfaces:**
- Consumes: `sinDeg` and `cosDeg` from Task 2.

- [ ] **Step 1: Replace the helper.** `parseExpr.ts`'s `sinDegrees`, and whatever computes `cos`, now call `sinDeg`/`cosDeg`. Move the float-noise rationale into `detMath.ts`'s docstring.
- [ ] **Step 2: Run the suite.**
  - The determinism snapshot's trig case may change in last digits. List every moved literal, old → new, in the report. Update the snapshot with `-u` only after reading that diff.
  - Hash-table entries may change only for scenes whose source contains `sin(` or `cos(`. Confirm each one by grep. If any other hash moves, stop and report.
- [ ] **Step 3: Measure across engines** with `tools/visual-check/export-check.mjs`, as `eval/RESULTS-GATE-B.md` lines 95–115 did, against a fresh Vite server on 5199:
  - Run `radial-dots.marey` and `compound-logo.marey`, plus every non-physics, non-text scene in `eval/scenes-3b/`.
  - Record headless and Chromium hashes for each, before this task (on Task 2's commit) and after.
  - Expected: `radial-dots` differed before and matches after.
  - Save the raw output to `.visual-check/10a/cross-engine.txt` for Task 8.
  - Kill the server and confirm 5199 is free.
- [ ] **Step 4: Fix the docstring.** In `frameHash.ts`, record the measured new state: trig-only scenes now agree, and Matter's own trig still keeps physics-rotation scenes engine-dependent.
- [ ] **Step 5: Commit.** Subject: `fix(compiler): fold sin and cos portably so trig scenes hash the same in every engine`. The body lists the moved hashes.

### Task 4: `TYPE_PARALLEL_ONE_PHYSICS`

**Files:**
- Modify: `src/compiler/typeChecker/validator.ts`, `src/compiler/renderer/sceneRuntime.ts` (the `spawnPhysics` last-block-wins comment only), `src/compiler/typeChecker/phase8Diagnostics.test.ts`

- [ ] **Step 1: Write the tests.**
  - `"rejects a second physics block in one parallel"`: two `physics` blocks inside one `parallel` give exactly one diagnostic. It contains `[TYPE_PARALLEL_ONE_PHYSICS]` and is positioned on the second block.
  - `"rejects the split spin and lockRotation case"`: the `eval/RESULTS-PHASE-8.md` "What this does not show" fixture is `spin` in one physics block and `lockRotation: true` in its sibling, inside a `parallel`, with a position animation spanning both. It now fails with `TYPE_PARALLEL_ONE_PHYSICS`.
  - `"allows physics blocks in separate sequence steps"`: two physics blocks as consecutive `sequence` steps still compile.
- [ ] **Step 2: Run the tests** and see the first two red.
- [ ] **Step 3: Implement the rule.**
  - Message: `[TYPE_PARALLEL_ONE_PHYSICS] A 'parallel' can run only one 'physics' block for its object. Found ${n}. Both would drive the same body, and only the last one's settings would apply. Merge them into one block.`
  - Update the `spawnPhysics` comment to say the case is now rejected by this rule.
- [ ] **Step 4: Run all the checks.** Run all four checks. `marey check` over every file must report no `TYPE_PARALLEL_ONE_PHYSICS`. Do the revert check.
- [ ] **Step 5: Commit.** Subject: `fix(compiler): reject two physics blocks in one parallel`

### Task 5: `from` on `animate`

**Files:**
- Modify: `src/compiler/languageContract.ts` (animate properties), `src/compiler/sceneIR.ts` (`IRAnimation.from`), `src/compiler/typeChecker/builder.ts` (`buildAnimationFromNode`), `src/compiler/typeChecker/resolvers.ts` (if `resolveAnimToValue` needs a nullable sibling), `src/compiler/typeChecker/validator.ts`, `src/compiler/renderer/sceneRuntime.ts` (`spawnAnim`), `src/compiler/__snapshots__/determinism.test.ts.snap`
- Test: `src/compiler/typeChecker/fromAnimation.test.ts` (new) and `src/compiler/renderer/fromRuntime.test.ts` (new, headless, same harness style as `phase8Runtime.test.ts`)

**Interfaces:**
- Produces: `IRAnimation.from: number | IRPoint | IRColor | null`, and the validator helper `animateValueErrors(slot: "to" | "from", value, propName, label, ancestors): CompileError[]`. That helper is now the only place `to` and `from` kind and scale rules live.

- [ ] **Step 1: Write the tests.**
  1. IR: `from: 0` on `alpha` builds `from: 0`. Absent, it builds `from: null`.
  2. Validation through the shared helper:
     - `from: (1, 1)` on `alpha` gives `TYPE_ANIM_MISMATCH`, naming `'from'`.
     - `from: (-1, 1)` on `scale` gives `TYPE_INVALID_SCALE`.
     - `from: (1, 0)` on `scale` for a physics object gives `TYPE_ZERO_SCALE_PHYSICS`.
     - `from: #ff0000` on a group's colour animation gives `TYPE_ANIM_COLOR_TARGET`.
  3. Runtime: an `alpha` animation, `from: 0`, `to: 1`, `duration: 1`, `delay: 1`, on an object declared `alpha: 1`:
     - alpha is `0` at ticks 1, 60 and 119;
     - it rises after the delay;
     - it is `1` at the end.
  4. Runtime, sequence: step 1 animates `alpha` to `0.5`, and step 2 has `from: 0.2`. At tick 1 alpha is not `0.2`. Step 2 starts at `0.2`.
  5. Runtime, position with physics: `from: (100, 100)`, `delay: 0.5`, with a sibling physics block in a `sequence` after it. Through the delay the body reads `(100, 100)` and the object never sits at its declared position.
  6. Runtime: `loop: true` with `from` restarts each cycle at `from`. `yoyo: true` returns to `from`.
- [ ] **Step 2: Run the tests** and see them red. Read each failure message: it must be about the missing behaviour, not a fixture error (§3d).
- [ ] **Step 3: Add `from` to the contract and the IR.**
  - Contract: `from` in `animateProperties`, kinds `["number", "point", "color"]`, no default, not required. Description: `Optional start value. Held from the moment the animation is scheduled, through its 'delay'.`
  - `IRAnimation.from`, built by `buildAnimationFromNode`.
- [ ] **Step 4: Move the validation into `animateValueErrors`.**
  - Move the existing `to` kind and scale checks into it, and call it for `to` and for `from`.
  - The messages for `to` must not change by a byte. The existing tests prove it.
  - For `from`, the messages say `'from'` where `to`'s say `'to'`.
- [ ] **Step 5: Use `from` in the runtime.** In `spawnAnim`, `startVal` becomes `from`, converted exactly as `to` is (point broadcast, `colorToInt`, degrees to radians) when it is non-null.
  - Confirm by test 3 that the delayed runner writes its start value during the delay. If it does not, make it write it, and only when `from` is non-null, so existing scenes do not change.
- [ ] **Step 6: Run all the checks.**
  - The snapshot diff adds only `"from": null` lines. Read it before `-u`.
  - The hash table is unchanged.
  - Do the revert checks for the helper's `from` call, the runtime start value and the delay write.
- [ ] **Step 7: Commit.** Subject: `feat(language): add from to animate`

### Task 6: `easing: spring` and `bounce`

**Files:**
- Modify: `src/compiler/languageContract.ts` (`EASING_VALUES`, animate `bounce`), `src/compiler/sceneIR.ts` (`IREasing`, `IRAnimation.bounce`), `src/compiler/typeChecker/builder.ts`, `src/compiler/typeChecker/validator.ts`, `src/compiler/renderer/easing.ts`, `src/compiler/renderer/sceneRuntime.ts` (the four `evaluateEasing` call sites), `src/compiler/__snapshots__/determinism.test.ts.snap`
- Test: `src/compiler/renderer/easing.test.ts`, `src/compiler/typeChecker/springDiagnostics.test.ts` (new), `src/compiler/export/lottieFitted.test.ts`

**Interfaces:**
- Consumes: `detExp`, `sinDeg`, `cosDeg` and `RAD_TO_DEG` from Task 2.
- Produces:
  - `evaluateEasing(t: number, easing: string, release?: ReleaseEnd, bounce?: number): number`, with `bounce` defaulting to `0.25`
  - `export function springOmega(bounce: number): number`
  - `export const SPRING_EPSILON = 1e-4`
  - `IRAnimation.bounce: number`

- [ ] **Step 1: Write the easing tests.**
  1. For `bounce` in `{0, 0.25, 0.5, 0.9}`:
     - `evaluateEasing(1, "spring", null, b) === 1`.
     - `|1 − y(1 − 1e-12)| ≤ SPRING_EPSILON`.
     - `y(0) === 0`.
     - At `bounce: 0`, no sample over 10 000 points exceeds `1`, since critical damping never overshoots.
     - At `bounce: 0.5`, the maximum exceeds `1`.
  2. `springOmega(b)` satisfies its defining equation within `1e-12`, for each `b` above.
  3. Runtime: a spring with `loop: true, yoyo: true` over 5 cycles. The value at each cycle end equals cycle 1's exactly.
- [ ] **Step 2: Write the diagnostic tests.**
  - `bounce: 0.3` with `easing: easeOut` gives `[TYPE_BOUNCE_WITHOUT_SPRING]`, and the message contains `'easeOut'`.
  - `bounce: 0.3` with no easing gives the same, naming `'easeInOut'`.
  - `handoff: true` with `easing: spring` gives `[TYPE_HANDOFF_SPRING]`.
  - `bounce: 0.95` gives the contract's range diagnostic.
  - `bounce: 0` and `bounce: 0.9` with `easing: spring` compile.
- [ ] **Step 3: Run the tests** and see them red; read the messages.
- [ ] **Step 4: Implement the curve.** Use spec §3.2's curve verbatim.
  - All exponentials go through `detExp`.
  - Oscillation uses `sinDeg`/`cosDeg` of `ω_d·t·RAD_TO_DEG`, so the curve is portable.
  - `springOmega` is a fixed-iteration solve: 60 bisection steps on `[1, 200]`, no early exit, memoised per `bounce` in a `Map`.
  - The handoff release-end swaps do not apply to spring; the validator rejects that combination.
- [ ] **Step 5: Wire it through.**
  - Contract: `EASING_VALUES` gains `"spring"`. `bounce` goes in `animateProperties` with `{ default: 0.25, constraint: { kind: "range", min: 0, max: 0.9 } }`. Description: `How far a spring easing overshoots before it settles: 0 settles without overshoot, 0.9 swings longest. Only with 'easing: spring'.`
  - IR fields and the builder.
  - `sceneRuntime.ts` passes `ra.anim.bounce` at the four `evaluateEasing` sites.
  - Validator messages:
    - `[TYPE_BOUNCE_WITHOUT_SPRING] 'bounce' only shapes 'easing: spring', but this animation's easing is '${easing}'. Remove 'bounce' or set 'easing: spring'.`
    - `[TYPE_HANDOFF_SPRING] 'easing: spring' settles at rest, so it has no momentum to hand over with 'handoff: true'. Use 'easing: easeOut', which still moves at its end.`
- [ ] **Step 6: Add the Lottie test.** In `lottieFitted.test.ts`, the test `"fits a spring track within tolerance"` uses a scale spring with `bounce: 0.5` over 1 s. It must pass the file's existing tolerance assertion. Log the keyframe count for Task 8.
- [ ] **Step 7: Run all the checks.**
  - The snapshot diff adds only `"bounce": 0.25` lines.
  - The hash table is unchanged.
  - Do the revert checks: the spring arm of `evaluateEasing`, each new diagnostic, and the `bounce` pass-through at one call site at a time (engineering-lessons §2c corollary).
- [ ] **Step 8: Commit.** Subject: `feat(language): add spring easing with bounce`

### Task 7: Reference, editor, site and status docs

**Files:**
- Modify:
  - `docs/LANGUAGE.md`: the Animation section (`from`, `easing` values, `bounce`), the diagnostics it lists, and "Limits the compiler enforces" if `bounce` belongs there.
  - `site/content/learn/animate.md` and/or `site/content/learn/timing.md`: one live sample each for `from` and `spring`, each with a "0.8.0 or later" note in the site's existing version-note form.
  - `site/gallery/easing-race.marey` and `.md`: add a spring lane and use `from`. Or add a new gallery entry if the race cannot take it cleanly, and say which in the report.
  - `docs/specs/2026-09-09-marey-engineering-roadmap-design.md`: a dated amendment in §13 recording Phase 10 (10A–10D) and pointing to this spec.
  - `docs/architecture/README.md` and `docs/architecture/roadmap-and-process.md`: a 10A status line, written in the merged form (the controller fixes the hash after merge).
- Check that Monaco completion lists `spring`, `from` and `bounce`. It derives from `LANGUAGE_CONTRACT`. If anything is hand-listed, report it rather than adding a second list.

- [ ] **Step 1: Write the docs.** Every new fence compiles under `languageDocs.test.ts`.
- [ ] **Step 2: Run the site build and check.** Run `npm run build`, then `node tools/visual-check/site-check.mjs` per `tools/visual-check/README.md`, against a fresh 5199 server. It should pass. Kill the server.
- [ ] **Step 3: Run all four checks.**
- [ ] **Step 4: Commit.** Subject: `docs(10a): document from, spring and the new diagnostics`

### Task 8: Exit evidence

**Files:**
- Create: `eval/RESULTS-PHASE-10A.md`, with one section per spec §6 item, each with its command and its output.

- [ ] **Step 1: Export a from-plus-spring scene to every output.** Use the gallery scene from Task 7: `marey export` to PNG, APNG, WebM, MP4 and Lottie.
  - Run `npm run check:export`, `npm run check:pack`, `tools/visual-check/player-check.mjs` (player hash equals export hash) and `tools/visual-check/lottie-fit-check.mjs` on it.
- [ ] **Step 2: Gather the rest of the evidence.**
  - Cross-engine table from `.visual-check/10a/cross-engine.txt`.
  - ulp table from Task 2.
  - Moved hashes from Task 3.
  - Revert outputs from Tasks 4–6.
  - The four checks.
  - A "What this does not show" section: Matter trigonometry, text scenes, and anything a task filed.
- [ ] **Step 3: Commit.** Subject: `docs(10a): record the exit evidence`
