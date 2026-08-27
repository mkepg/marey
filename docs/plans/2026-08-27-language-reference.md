# Language Reference Implementation Plan

**Goal:** Ship `docs/LANGUAGE.md`, a formal user-facing reference for the Declare language covering behaviour only, with every example compiled by the test suite so it cannot silently drift.

**Architecture:** One hand-written markdown document plus one test file. The test extracts every ` ```declare ` fenced block from the document, runs it through `lex → parse → typeCheck`, and asserts zero errors. Separate assertions lock the four behavioural facts the document states that a reader cannot otherwise verify. No per-property type tables — Phase 3 generates those from the unified source.

**Tech Stack:** TypeScript, Vitest, Node. No new dependencies.

**Spec:** `docs/specs/2026-08-27-language-reference-design.md`

---

## Before you start

Read the spec. Then read these three, which are the ground truth this document describes:

- `src/compiler/typeChecker/validator.ts` — `REQUIRED_PROPS`, `PROP_TYPES`, and every validation rule
- `src/compiler/renderer/timeline.ts` — `advanceAnimTime`, the source of the yoyo facts
- `src/store/defaultScene.ts` — the worked example every user sees; match its idiom

**Two rules for this work:**

1. **Never state a behaviour you have not read in the source.** The physics spec is not a reliable oracle here — it does not state the yoyo half-cycle rule anywhere, and does not mention the yoyo completion defect at all. Both were found by reading `timeline.ts`.
2. **Document what you find; do not fix it.** If you discover another defect, add it to "Defects found" at the end of this plan and keep going. Widening a docs slot into a renderer change is how a small slot stops being small.

### Deviation from the spec, already decided

The spec §5 names the test file `docs/language.test.ts`. **Use `src/compiler/languageDocs.test.ts` instead.** `vitest.config.ts` includes only `src/**/*.test.ts`, so a test under `docs/` would never run under `npm test` — it would pass by not existing, which is the exact failure mode this test is meant to prevent. Keeping it in `src/` needs no config change and follows the existing convention that all tests live in `src/`.

### Verified facts you may rely on

These were measured against source while writing this plan. They are the content of Task 3.

| Fact | Evidence |
|---|---|
| `duration` is the **half-cycle** under `yoyo`; a there-and-back cycle is `2 × duration` | `timeline.ts:26-29` reverses direction at `durationTicks`. Measured tick sequence for `durationTicks: 10`: `1..10, 9..0, 1..10, 9..0` |
| `yoyo: true` without `loop: true` **never completes** | `timeline.ts:37-43`. Parks at `elapsedTicks: 0, direction: -1, completed: false` forever |
| An animation starts from the value the object currently holds; there is no `from` | `adapter.ts:180-202`, `spawnAnim` reads the start value off the container at spawn time |
| `collideBounds` defaults to `true` | `builder.ts:65`, `physicsSync.ts:57` |

### Language surface, confirmed

Use these exact lists. Do not invent members.

- **Keywords:** `scene`, `circle`, `rectangle`, `polygon`, `line`, `text`, `group`, `def`, `generate`, `template`, `use`, `animate`, `physics`, `sequence`, `parallel`
- **Named colours (cannot be used as identifiers):** `red`, `green`, `blue`, `white`, `black`, `yellow`, `cyan`, `magenta`, `orange`
- **Easings:** `linear`, `easeIn`, `easeOut`, `easeInOut`
- **Animatable properties:** `position`, `rotation`, `scale`, `alpha`
- **`sceneFit` values:** `contain`, `cover`, `fill`, `none`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `docs/LANGUAGE.md` | Create | The reference. Behaviour only. Sole source of its own examples. |
| `src/compiler/languageDocs.test.ts` | Create | Extracts and compiles every example; asserts the four behavioural facts. |
| `eval/BRIEFS.md` | Modify | Add `docs/LANGUAGE.md` to the authors' readable set; correct the sentence that says no reference exists. |
| `docs/plans/2026-08-27-language-reference.md` | Modify | This file — "Defects found" and "Execution notes" at the end. |
| `docs/specs/2026-08-26-physics-shared-world-design.md` | Modify | Phase 3 gains the yoyo defect and the `def`→`let` doc-update task. |

---

## Task 1: The example extractor and its test

**Files:**
- Create: `src/compiler/languageDocs.test.ts`
- Create: `docs/LANGUAGE.md` (stub only — real content starts in Task 4)

- [ ] **Step 1: Write the failing test**

Create `src/compiler/languageDocs.test.ts`:

```ts
/**
 * Every example in docs/LANGUAGE.md must compile.
 *
 * The document is the only copy of its examples — there is no parallel fixture
 * directory to fall out of sync with it. This is the mechanism that stops the
 * reference becoming a fifth hand-synced list (spec 2026-08-27, L2/§5): when
 * Phase 3 renames `def` to `let`, every example here stops compiling and the
 * build goes red, rather than the document quietly going stale.
 *
 * Fences tagged ```declare are compiled. Fences tagged ```text are prose
 * fragments and are skipped deliberately.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";

const DOC_PATH = "docs/LANGUAGE.md";

interface Example {
  /** 1-indexed line in LANGUAGE.md where the fence opens. */
  line: number;
  source: string;
}

export function extractExamples(markdown: string): Example[] {
  const lines = markdown.split(/\r?\n/);
  const examples: Example[] = [];
  let open: { line: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open === null) {
      if (line.trim() === "```declare") open = { line: i + 1, body: [] };
    } else if (line.trim() === "```") {
      examples.push({ line: open.line, source: open.body.join("\n") });
      open = null;
    } else {
      open.body.push(line);
    }
  }

  if (open !== null) {
    throw new Error(`Unclosed \`\`\`declare fence opened at line ${open.line}`);
  }
  return examples;
}

function compileErrors(source: string): string[] {
  const { ast, errors } = parse(lex(source));
  const out = errors.map((e) => `L${e.line ?? "?"}: ${e.message}`);
  if (ast) {
    const { errors: typeErrors } = typeCheck(ast);
    out.push(...typeErrors.map((e) => `L${e.line ?? "?"}: ${e.message}`));
  }
  return out;
}

describe("docs/LANGUAGE.md examples", () => {
  const markdown = readFileSync(DOC_PATH, "utf8");
  const examples = extractExamples(markdown);

  it("contains at least one example", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples.map((e) => [e.line, e.source] as const))(
    "the example at LANGUAGE.md line %i compiles",
    (_line, source) => {
      expect(compileErrors(source)).toEqual([]);
    }
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: FAIL. The suite errors while collecting, because `docs/LANGUAGE.md` does not exist — `ENOENT: no such file or directory, open 'docs/LANGUAGE.md'`.

- [ ] **Step 3: Create the stub document**

Create `docs/LANGUAGE.md`:

````markdown
# The Declare Language

A reference for Declare, a declarative scene format that compiles to a PixiJS
scene graph. This document describes **behaviour**: what each construct does,
in what units, and what happens at its edges.

It is not a tutorial. Tutorials, guides and examples are Phase 5b, on the
documentation site.

Every example below is compiled by the test suite, so nothing here can silently
stop being true.

```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  circle dot {
    position: (400, 300)
    radius: 40
    color: cyan
  }
}
```
````

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: PASS, 2 tests — "contains at least one example" and "the example at LANGUAGE.md line 15 compiles".

- [ ] **Step 5: Verify the extractor actually fails on a broken example**

This guards against a green build that proves nothing. Temporarily change the stub's `radius: 40` to `radius: -40` and re-run.

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: FAIL with `'radius' must be greater than 0, but got -40`.

Then change it back to `radius: 40` and re-run to confirm PASS. Do not commit the broken version.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/languageDocs.test.ts docs/LANGUAGE.md
git commit -m "test(docs): compile every example in the language reference

The document is the only copy of its examples, so a rename that breaks them
breaks the build rather than leaving the reference quietly stale."
```

---

## Task 2: Confirm the test runs under the real suite

**Files:**
- Verify only: `vitest.config.ts`

- [ ] **Step 1: Run the whole suite**

Run: `npm test`

Expected: PASS. The count rises from 97 to 99 (the two tests from Task 1).

- [ ] **Step 2: Confirm the new file was actually collected**

Run: `npx vitest run --reporter=verbose 2>&1 | grep languageDocs`

Expected: two lines mentioning `src/compiler/languageDocs.test.ts`. If this prints nothing, the file is not being collected and every later task's verification is worthless — stop and fix the include pattern in `vitest.config.ts` before continuing.

- [ ] **Step 3: Commit**

No code change. Skip the commit if the working tree is clean.

---

## Task 3: Lock the four behavioural facts

These are the claims the document makes that a reader cannot check for themselves. Each gets a test named after the heading it appears under, so a failure points at the sentence it falsifies.

**Files:**
- Modify: `src/compiler/languageDocs.test.ts`

- [ ] **Step 1: Add the import**

ESM imports must sit at the top of the file. Add this line to the existing
import block in `src/compiler/languageDocs.test.ts`, below the `typeCheck`
import:

```ts
import { advanceAnimTime, type AnimTime } from "./renderer/timeline";
```

Note the `type` keyword on `AnimTime`. `verbatimModuleSyntax` is on, so a
value-import of a type fails the build.

- [ ] **Step 2: Write the failing tests**

Append to the end of `src/compiler/languageDocs.test.ts`:

```ts
/**
 * Facts asserted by docs/LANGUAGE.md that a reader cannot verify from the
 * document alone. Each test is named after the heading whose claim it locks.
 */

function mkAnimTime(over: Partial<AnimTime> = {}): AnimTime {
  return {
    elapsedTicks: 0,
    durationTicks: 10,
    direction: 1,
    completed: false,
    loop: false,
    yoyo: false,
    ...over,
  };
}

/** Elapsed-tick values produced by `n` successive ticks. */
function elapsedSequence(t: AnimTime, n: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < n; i++) {
    advanceAnimTime(t);
    seq.push(t.elapsedTicks);
  }
  return seq;
}

/** Tick index (1-based) at which the animation reports completion, or -1. */
function completesAtTick(t: AnimTime, limit: number): number {
  for (let i = 0; i < limit; i++) {
    if (advanceAnimTime(t)) return i + 1;
  }
  return -1;
}

describe("LANGUAGE.md · Animation · loop and yoyo", () => {
  it("duration is the half-cycle: a there-and-back yoyo takes 2x duration", () => {
    const t = mkAnimTime({ yoyo: true, loop: true });
    // Out over 10 ticks, back over 10, then repeats. One full cycle is 20.
    expect(elapsedSequence(t, 20)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ]);
    expect(elapsedSequence(t, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("a plain animation completes at exactly durationTicks", () => {
    expect(completesAtTick(mkAnimTime(), 500)).toBe(10);
  });

  it("yoyo without loop never completes — see the warning in that section", () => {
    const t = mkAnimTime({ yoyo: true, loop: false });
    expect(completesAtTick(t, 500)).toBe(-1);
    expect(t).toMatchObject({ elapsedTicks: 0, direction: -1, completed: false });
  });

  it("yoyo without loop rests at its start value rather than drifting", () => {
    const t = mkAnimTime({ yoyo: true, loop: false });
    const seq = elapsedSequence(t, 25);
    expect(seq.slice(20)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("LANGUAGE.md · Physics · collideBounds", () => {
  it("defaults to true when the property is omitted", () => {
    const source = `
      scene {
        size: (800, 600)
        circle a {
          position: (400, 100)
          radius: 20
          color: cyan
          physics { gravity: (0, 900), duration: 2 }
        }
      }
    `;
    const { ast, errors } = parse(lex(source));
    expect(errors).toEqual([]);
    const { errors: typeErrors, ir } = typeCheck(ast!);
    expect(typeErrors).toEqual([]);
    // Note the `.props` hop: IRObjectNode is { id, props, children } and the
    // physics block hangs off `props`, not off the node (sceneIR.ts:96-115).
    expect(ir!.registry["a"].props.physics?.collideBounds).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify the tests pass for the right reason**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: all five PASS immediately. They lock existing behaviour rather than
driving new code, which is the correct shape for a documentation test — which is
why Step 4 exists.

If `collideBounds` fails, read `src/compiler/sceneIR.ts` for the real field names
and fix the **test** to match. Do not change `builder.ts`.

- [ ] **Step 4: Confirm each test can fail**

For the yoyo half-cycle test, temporarily change the expected `9` at position 11 to `11` and confirm FAIL. Restore it.

This matters: a test that locks existing behaviour is worthless if it cannot fail.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expected: PASS, count now 104.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/languageDocs.test.ts
git commit -m "test(docs): lock the four behavioural facts the reference states

yoyo's duration is a half-cycle, a non-looping yoyo never completes,
collideBounds defaults to true. Each test is named after the heading whose
claim it locks."
```

---

## Task 4: Scene model and shapes

From here on, each task appends one section to `docs/LANGUAGE.md`. Write prose in your own words; the bullets below are the **claims that must appear**, not sentences to paste.

**Files:**
- Modify: `docs/LANGUAGE.md`

- [ ] **Step 1: Write the "Scene model" section**

Claims that must appear:

- A file contains any number of `def` and `template` declarations, then exactly one `scene` block.
- `scene` requires `size: (width, height)`. `background` takes a colour. `sceneFit` takes `contain`, `cover`, `fill` or `none`.
- Coordinates are in pixels, x rightward and y **downward**, origin at the top-left of the scene.
- **Every object's pivot is its geometric centre.** There is no `anchor` property. `position` places the centre, not a corner. Rotation and scale act about that centre.
- A child's `position` is relative to its parent `group`.
- `z` orders drawing. Higher draws in front. It defaults to 0 and may be negative.
- `rotation` is in **degrees** in source. (Verify in `adapter.ts:154`, which multiplies by `Math.PI / 180`.)
- `alpha` runs 0.0 to 1.0 inclusive; outside that range is a compile error.
- Colours are `#rrggbb` hex or one of nine keywords: `red`, `green`, `blue`, `white`, `black`, `yellow`, `cyan`, `magenta`, `orange`.
- `//` begins a line comment.

- [ ] **Step 2: Write the "Shapes" section**

State for each shape what it requires. This is deliberately a prose list of *required* properties only — the full per-property type table is Phase 3's to generate, so do not write one.

- `circle` — `position`, `radius` (> 0)
- `rectangle` — `position`, `size: (w, h)`, both > 0
- `polygon` — `points`, at least 3, as `[(x, y), ...]` relative to `position`
- `line` — `position`, `points` (at least 2), `thickness` (> 0)
- `text` — `position`, `content` (a quoted string, at most 500 characters), with `fontSize` optional. A scene may hold at most 500 `text` objects.
- `group` — no required properties. **Only `group` may contain other visual objects**; nesting a shape inside a `circle` is a compile error.

- [ ] **Step 3: Add the shapes example**

This exact block compiles — it was verified while writing this plan:

````markdown
```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  circle c      { position: (100, 100), radius: 30, color: cyan }
  rectangle r   { position: (250, 100), size: (60, 40), color: magenta }
  polygon p     { position: (400, 100), points: [(0, -30), (26, 15), (-26, 15)], color: orange }
  line l        { position: (550, 100), points: [(-40, 0), (40, 0)], thickness: 2, color: white }
  text t        { position: (700, 100), content: "hello", fontSize: 14, color: white }
  group g {
    position: (400, 300)
    circle inner { position: (0, 0), radius: 12, color: red }
  }
}
```
````

- [ ] **Step 4: Verify**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: PASS, with one more "compiles" test than before.

- [ ] **Step 5: Commit**

```bash
git add docs/LANGUAGE.md
git commit -m "docs(language): scene model and shapes"
```

---

## Task 5: Animation

**Files:**
- Modify: `docs/LANGUAGE.md`

- [ ] **Step 1: Write the "Animation" section**

Claims that must appear:

- `animate` takes required `property`, `to` and `duration`; optional `easing`, `loop`, `yoyo`, `handOff`.
- `duration` is in **seconds** and must be strictly greater than 0.
- Only four properties animate: `position`, `rotation`, `scale`, `alpha`. Anything else is a compile error naming the four.
- `to` must match the property: a point for `position`; a number or a point for `scale`; a number for `rotation` and `alpha`.
- The four easings are `linear`, `easeIn`, `easeOut`, `easeInOut`. Omitting `easing` gives `linear`.
- **An animation starts from the value the object currently holds.** There is no `from` property. So setting a property and animating the same property is not a conflict — the declared value is the starting point. (This was flagged independently by two authors in the machine-authorability eval.)
- An object may hold several `animate` blocks; they run concurrently from scene start.

- [ ] **Step 2: Add the animation example**

Verified to compile:

````markdown
```declare
scene {
  size: (800, 600)

  rectangle card {
    position: (-60, 300)
    size: (120, 80)
    color: red
    animate {
      property: position
      to: (400, 300)
      duration: 1.0
      easing: easeOut
    }
  }
}
```
````

- [ ] **Step 3: Write the "loop and yoyo" subsection**

This is the section the eval called "the biggest uncertainty." It must be unambiguous.

Claims that must appear:

- `loop: true` restarts from the beginning on completion, forever.
- `yoyo: true` reverses direction at the end instead of restarting.
- **`duration` is the half-cycle.** With `yoyo`, one there-and-back cycle takes `2 × duration`. A dot that should breathe once every two seconds needs `duration: 1.0`.
- Include this illustration. Tag the fence `text`, not `declare`, so the extractor skips it:

````markdown
```text
duration: 1.0 at 120 ticks/second, with yoyo and loop

tick     0 ......... 120 ......... 240 ......... 360
progress 0 --------→ 1  ---------→ 0  ---------→ 1
         |  out      |   back      |   out
         └── duration ┘
         └──────── one full cycle ─────────┘
```
````

- **Pair `yoyo` with `loop`.** A `yoyo: true` without `loop: true` travels out, returns to its start, and then never finishes. The object rests at its starting value, which usually looks right, but the animation is still considered running: the renderer never goes idle, and **if the same object also has a `physics` block, its body stays frozen in place and never falls**. Every yoyo in the default scene is paired with `loop` for this reason.
- Inside a `sequence` or `parallel`, both `loop: true` and `yoyo: true` are **compile errors** — a step that never finishes would stall the timeline. The validator rejects them with `TYPE_SEQ_LOOP` and `TYPE_SEQ_YOYO`.

- [ ] **Step 4: Add the loop/yoyo example**

Verified to compile:

````markdown
```declare
scene {
  size: (800, 600)

  circle pulse {
    position: (400, 300)
    radius: 40
    color: cyan
    animate {
      property: scale
      to: (1.4, 1.4)
      duration: 1.0
      easing: easeInOut
      loop: true
      yoyo: true
    }
  }
}
```
````

- [ ] **Step 5: Verify**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: PASS. The ```text fence must NOT appear as a compiled example — the count rises by exactly 2, not 3.

- [ ] **Step 6: Commit**

```bash
git add docs/LANGUAGE.md
git commit -m "docs(language): animation, including the yoyo half-cycle rule

States that duration is the half-cycle and warns that a yoyo without loop
never completes, which leaves a physics body frozen."
```

---

## Task 6: Sequencing

**Files:**
- Modify: `docs/LANGUAGE.md`

- [ ] **Step 1: Write the "Sequencing" section**

Claims that must appear:

- `sequence` runs its steps strictly in order; each starts when the previous finishes.
- A `sequence` goes **inside a renderable object**, never at the scene root and never inside another `sequence`.
- An object may hold **at most one** `sequence` (`TYPE_ONE_STORY`).
- `parallel` goes **directly inside a `sequence`**. Its children run at once and the step advances only when all have finished. `parallel` may hold only `animate` and `physics`, and may not nest.
- A `sequence` or `parallel` must contain at least one child.
- A `physics` block inside a `sequence` requires a **numeric** `duration`; `duration: indefinitely` there is a compile error (`TYPE_SEQ_PHYSICS_INDEFINITELY`), because the timeline could never advance past it.
- An object with `physics { duration: indefinitely }` may not also have a `sequence` (`TYPE_INDEFINITELY_WITH_SEQ`).

- [ ] **Step 2: Add the sequence example**

Verified to compile:

````markdown
```declare
scene {
  size: (800, 600)

  rectangle stepper {
    position: (130, 200)
    size: (34, 34)
    color: magenta
    sequence {
      animate {
        property: rotation
        to: 180
        duration: 0.9
        easing: easeInOut
      }
      parallel {
        animate { property: position, to: (350, 200), duration: 1.2, easing: easeInOut }
        animate { property: scale,    to: (1.6, 1.6), duration: 1.2, easing: easeOut }
      }
      physics {
        gravity: (0, 700)
        bounce: 0.45
        collideBounds: true
        duration: 4
      }
    }
  }
}
```
````

- [ ] **Step 3: Write the "handOff" subsection**

Claims that must appear:

- `handOff: true` carries an animation's exit velocity into the physics simulation, so an object that slides then falls keeps its momentum and arcs, instead of stopping dead and dropping straight down.
- The exit velocity is derived from the animation's average speed scaled by the **slope of its easing curve at the end** (`adapter.ts:92-100`). So `easeOut`, which is decelerating, hands off at half the average speed, and `easeIn` hands off at twice.
- Four rules, each a compile error if broken:
  - only on `property: position` (`TYPE_HANDOFF_PROP`)
  - not with `loop: true` (`TYPE_HANDOFF_LOOP`)
  - requires a sibling `physics` block on the same object (`TYPE_HANDOFF_PHYSICS`)
  - that `physics` block may not also set `velocity`, which the handoff would overwrite (`TYPE_HANDOFF_AMBIGUITY`)

- [ ] **Step 4: Add the handOff example**

Verified to compile:

````markdown
```declare
scene {
  size: (800, 600)

  circle launcher {
    position: (130, 400)
    radius: 11
    color: yellow
    animate {
      property: position
      to: (350, 220)
      duration: 1.1
      easing: easeOut
      handOff: true
    }
    physics {
      gravity: (0, 900)
      airDrag: 0.006
      bounce: 0.55
      collideBounds: true
      duration: indefinitely
    }
  }
}
```
````

- [ ] **Step 5: Verify**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/LANGUAGE.md
git commit -m "docs(language): sequencing, parallel, and handOff"
```

---

## Task 7: Physics

This is the section the eval says is missing entirely. Object-to-object collision is the headline of two phases of work and is documented nowhere a user can reach.

**Files:**
- Modify: `docs/LANGUAGE.md`

- [ ] **Step 1: Write the "Physics" opening**

Claims that must appear, stated up front:

- **Objects with a `physics` block share one world and collide with each other.** They stack, tumble and settle.
- **An object gets a collision body if, and only if, it declares a `physics` block** — either directly or in any step of its `sequence`. Objects with only `animate` blocks are not colliders; things pass through them.
- A body is created when the scene starts, not when its physics step begins. So an object animating into place during a `sequence` **already shoves things it hits on the way in**.

- [ ] **Step 2: Write the physics property behaviour**

- `gravity: (x, y)` in **pixels per second squared**, per object. Positive y is downward. There is no scene-level gravity yet.
- `velocity: (x, y)` in **pixels per second**, applied once when the simulation starts.
- `bounce` runs 0.0 to 1.0. 0 is a dead landing, 1 loses no energy.
- **`airDrag` runs 0.0 to 1.0 and is inverted relative to what you may expect: `0.0` is a vacuum and `1.0` is maximum resistance.** Useful values are small — the default scene uses `0.006`. Note that some Monaco snippets still suggest `0.99`, which is now near-total drag; that is a known bug, not a recommendation.
- `collideBounds` decides whether the object collides with the four **scene edges**. It defaults to `true`. It has nothing to do with other objects' bounding boxes — object-to-object collision is always on and is not configurable.
- An object with `collideBounds: false` that leaves the scene is removed.
- Collision shape by kind: `circle` and `rectangle` use their geometry; `polygon` uses its **convex hull**, so a concave outline collides as if filled in; `text` uses its bounding box; `line` uses its bounding box inflated to its thickness; a `group` currently collides as a single box around its contents.

- [ ] **Step 3: Write the "When duration expires" subsection**

The eval recorded this as guessed rather than known.

- `duration` is in seconds, or the keyword `indefinitely`.
- **When a numeric `duration` expires, the object freezes exactly where it is and stays collidable.** It does not reset, drift, or vanish. Freezing happens wherever it is at that moment, including in mid-air.
- Frozen objects become scenery: later objects land on them and bounce off them. That is the intended use.
- **Frozen and asleep look identical and behave oppositely.** An object at rest under `duration: 3` is *frozen* — immovable, unaffected by anything that hits it. An object at rest under `duration: indefinitely` is merely *asleep* — dormant to save work, but it wakes and moves when struck. Nothing in the rendered frame distinguishes them.

- [ ] **Step 4: Write the "Animation and physics together" subsection**

- While an `animate` block drives `position`, physics does not move the object — but it remains solid, so it can knock other things over.
- While an `animate` block drives `rotation`, physics does not spin the object, though it still moves under gravity and collisions.
- `animate scale` resizes the collision shape along with the visual.
- When an animation finishes, the object returns to full physics control.

- [ ] **Step 5: Add both physics examples**

Both verified to compile. The first demonstrates the headline claim.

````markdown
```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  generate i from 0 to 3 {
    rectangle box {
      position: (400, 100 + i * 60)
      size: (60, 60)
      color: cyan
      physics {
        gravity: (0, 900)
        bounce: 0.2
        collideBounds: true
        duration: indefinitely
      }
    }
  }
}
```
````

````markdown
```declare
scene {
  size: (800, 600)

  circle faller {
    position: (400, 100)
    radius: 20
    color: orange
    physics {
      gravity: (0, 900)
      collideBounds: true
      duration: 2
    }
  }
}
```
````

- [ ] **Step 6: Verify**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/LANGUAGE.md
git commit -m "docs(language): the physics model

Documents object-to-object collision for the first time, plus freeze-on-expiry,
frozen vs asleep, airDrag's inverted range, and collideBounds as scene edges."
```

---

## Task 8: Metaprogramming and its limits

**Files:**
- Modify: `docs/LANGUAGE.md`

- [ ] **Step 1: Write the "Reuse" section**

- `def name = value` binds a name to a single value: a number, a point, a colour, or a keyword. Bindings are immutable, lexically scoped, and may be shadowed by an inner `def`.
- `def` may appear at the top of a file or inside a block.
- **A named colour cannot be used as an identifier.** `def cyan = #00ffff` is a parse error, because the nine colour keywords lex as their own token type. Pick another name.
- Arithmetic works in value positions: `+`, `-`, `*`, `/`, and parentheses for grouping.
- `generate i from A to B { ... }` repeats its body with `i` bound to each integer from A to B **inclusive**. Generated object names get `_i` appended, so a `rectangle tick` inside the loop yields `tick_0`, `tick_1` and so on. `generate` blocks may nest.
- `template Name(params) { ... }` plus `use Name(args) instanceName { ... }` is a parametric macro. Arguments may be any value, **including keywords** — passing an easing as `use Racer(easeInOut) row { }` works. The block after the instance name supplies properties for the instance, such as `position`. Recursive templates are rejected.

- [ ] **Step 2: Add the metaprogramming example**

Verified to compile:

````markdown
```declare
def ink    = #e2e8f0
def gap    = 120
def beat   = 1.5

template Badge(tone) {
  circle disc {
    position: (0, 0)
    radius: 18
    color: tone
  }
  rectangle pip {
    position: (0, -18)
    size: (10, 10)
    color: ink
  }
}

scene {
  size: (800, 600)
  background: #0a0e1a

  generate i from 0 to 4 {
    use Badge(cyan) badge { position: (100 + i * gap, 200) }
  }

  circle mover {
    position: (100, 400)
    radius: 14
    color: magenta
    animate {
      property: position
      to: (700, 400)
      duration: beat
      easing: easeInOut
    }
  }
}
```
````

- [ ] **Step 3: Write the "Current limits" subsection**

Head it plainly and date it: **"Current limits (as of v0.3.x)"**. State that these are known gaps, not design positions, and that the section will shrink.

- **No arrays or indexing.** There is no way to write a list of values and loop over it, so a chart driven by data must be written one object per value.
- **No trigonometry.** `sin` and `cos` do not exist, so a radial or circular layout cannot be produced by `generate` — its coordinates must be computed by hand.
- **No modulo and no conditionals.** "Every fifth item is taller" cannot be expressed directly. The workaround is two overlapping `generate` loops, one drawing the common case and one drawing over it at the wider interval.
- `generate` handles "N of the same thing, spaced by arithmetic on the loop variable." It does not handle data.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/compiler/languageDocs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/LANGUAGE.md
git commit -m "docs(language): reuse, and the macro layer's current limits

The missing arrays, trig, modulo and conditionals blocked three of four
data-driven briefs in the authorability eval. Stated plainly and dated."
```

---

## Task 9: Compile errors and the closing section

**Files:**
- Modify: `docs/LANGUAGE.md`

- [ ] **Step 1: Write the "Limits the compiler enforces" section**

A short list, so an author knows where the walls are:

- `duration`, `radius`, `thickness`, `fontSize` must all be greater than 0; `size` components too.
- `alpha`, `airDrag` and `bounce` must be between 0.0 and 1.0 inclusive.
- `polygon` needs at least 3 points, `line` at least 2, and no shape may exceed 10,000 points.
- `text` content is capped at 500 characters and a scene at 500 `text` objects.
- Compilation stops reporting after 50 errors.

- [ ] **Step 2: Write the "Not covered here" closing section**

- The exhaustive per-property type table is deliberately absent. It is generated from the compiler's own tables in Phase 3, so that it cannot drift from them. Until then, the editor's completions and hovers are the authority on which properties a given object accepts.
- Colour animation is not supported: `animate` accepts only `position`, `rotation`, `scale` and `alpha`.
- Point at the spec directory for design rationale.

- [ ] **Step 3: Verify the whole document**

Run: `npm test`

Expected: PASS, with roughly 9 example-compile tests plus the 5 behavioural tests.

- [ ] **Step 4: Read the document start to finish**

Check for: a claim you did not verify in source; a heading that promises a per-property table; any use of `let`, `handoff`, `layer` or `fit`, which are Phase 3 names and do not exist yet.

Run this to catch the last one:

```bash
grep -nE '\b(let|handoff|layer|fit)\b' docs/LANGUAGE.md
```

Expected: matches only inside prose where the word is ordinary English (for example "fit"), never as Declare syntax. `sceneFit` is correct and will match — that is fine.

- [ ] **Step 5: Commit**

```bash
git add docs/LANGUAGE.md
git commit -m "docs(language): enforced limits and what the reference omits"
```

---

## Task 10: Amend the eval protocol

`eval/BRIEFS.md` currently lists exactly three readable files and states "There is no README and no language reference — that absence is part of what is being measured." That sentence becomes false on merge, and an unamended protocol makes any re-run incomparable.

**Files:**
- Modify: `eval/BRIEFS.md`

- [ ] **Step 1: Read the current protocol section**

Run: `grep -n "user-facing surface" -A 20 eval/BRIEFS.md`

- [ ] **Step 2: Add the reference to the readable set**

In the bulleted list of files authors may read, add:

```markdown
- `docs/LANGUAGE.md` — the formal language reference
```

- [ ] **Step 3: Replace the falsified sentence**

Replace:

```markdown
There is no README and no language reference — that absence is part of what is
being measured.
```

with:

```markdown
There is still no README. `docs/LANGUAGE.md` was added on 2026-08-27, after the
baseline run — the 2026-08-27 results in `RESULTS.md` were measured **without**
it, and its second finding is what motivated writing it. Any re-run therefore
measures a different surface than the baseline, which is the point: compile rate
was already at 100% and cannot improve, so the comparison to make is whether the
authors' recorded uncertainty shrinks.
```

- [ ] **Step 4: Verify the protocol still reads coherently**

Read the whole "Protocol" section. The claim that authors may not read the compiler, the spec, the plans or `AGENTS.md` must survive unchanged — only the reference is added.

- [ ] **Step 5: Commit**

```bash
git add eval/BRIEFS.md
git commit -m "test(eval): add the language reference to the authors' readable set

The baseline's 'there is no language reference' is false as of today. Records
that the baseline predates the doc so the two runs are not confused."
```

---

## Task 11: File the yoyo defect against Phase 3

Per the spec's L7, the defect is documented and filed, not fixed here.

**Files:**
- Modify: `docs/specs/2026-08-26-physics-shared-world-design.md`

- [ ] **Step 1: Add the defect to Phase 3's work list**

In §8 "Phase 3 — Foundations and renames", add to the bulleted list:

```markdown
- **Fix the non-completing yoyo.** `advanceAnimTime` reverses at `durationTicks`
  when `yoyo` is set, but on returning to 0 it only restarts if `loop` is also
  set (`timeline.ts:37-43`). A `yoyo: true` without `loop: true` therefore never
  reports completion: the runner is never spliced, so `isIdle()` never becomes
  true and the ticker runs forever, and a `POS_ANIM` pin is never released, so a
  body on the same object stays static permanently. The validator already
  rejects this shape inside a `sequence` (`TYPE_SEQ_YOYO`) for exactly this
  reason; the top-level case is unguarded. Found while writing
  `docs/LANGUAGE.md`, which documents the current behaviour and warns against it.
```

- [ ] **Step 2: Add the documentation-update task to Phase 3**

Also in §8:

```markdown
- **Update `docs/LANGUAGE.md` for the renames.** Its examples are compiled by
  `src/compiler/languageDocs.test.ts`, so `def` → `let` and `handOff` →
  `handoff` will break the build until the reference is updated. That is the
  intended mechanism, not an obstacle.
```

- [ ] **Step 3: Verify**

Run: `npm test`

Expected: PASS. This task changes only markdown.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/2026-08-26-physics-shared-world-design.md
git commit -m "docs(spec): file the non-completing yoyo against Phase 3

Found while writing the language reference. A yoyo without loop never reports
completion, so the ticker never idles and a physics body stays pinned."
```

---

## Task 12: Full verification

**Files:**
- Modify: `docs/plans/2026-08-27-language-reference.md` (this file)

- [ ] **Step 1: Run the full suite**

Run: `npm test`

Expected: PASS, no failures.

- [ ] **Step 2: Run the build**

Run: `npm run build`

Expected: exit 0. Typecheck is part of the build, and the strict settings
(`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`) will reject an
unused import or a value-import of a type in `languageDocs.test.ts`.

- [ ] **Step 3: Re-run the authorability eval**

Run: `npx vitest run --config eval/vitest.config.ts --disableConsoleIntercept`

Expected: `20/20 compiled clean (100%)`. This is a regression check only — the
reference cannot change the compile rate of scenes written before it existed.
It confirms nothing was broken, not that the doc helped.

- [ ] **Step 4: Confirm the anti-drift mechanism actually bites**

The single most important check in this plan. Temporarily rename `def` to `let`
throughout `docs/LANGUAGE.md`:

```bash
sed -i 's/^def /let /' docs/LANGUAGE.md
npx vitest run src/compiler/languageDocs.test.ts
```

Expected: FAIL. If it passes, the metaprogramming example is not tagged
```declare and the mechanism does not work — fix that before continuing.

Restore:

```bash
git checkout docs/LANGUAGE.md
npx vitest run src/compiler/languageDocs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Record execution notes**

Append an "Execution notes" section to this plan, following the convention of
`2026-08-26-phase-1-shared-world.md`. Record: defects found in this plan,
anything discovered about the language while writing, and anything deliberately
left open. If the "Defects found" section below is still empty, say so
explicitly rather than deleting it.

- [ ] **Step 6: Commit**

```bash
git add docs/plans/2026-08-27-language-reference.md
git commit -m "docs: record language reference execution notes"
```

---

## Done when

- `npm test` passes, including every example in `docs/LANGUAGE.md`.
- `npm run build` exits 0.
- `docs/LANGUAGE.md` states, in a place a reader will find: that objects with
  `physics` collide with one another; that a numeric `duration` freezes the
  object in place, still collidable; that `yoyo`'s `duration` is a half-cycle;
  that `airDrag` is inverted; and that the macro layer has no arrays, trig,
  modulo or conditionals.
- Task 12 Step 4 confirms a rename breaks the build.
- `eval/BRIEFS.md` no longer claims no language reference exists.
- No per-property type table was written by hand.
- `grep -c 'anchor' docs/LANGUAGE.md` returns 1 — the single sentence saying
  there is no `anchor` property.

---

## Defects found

*(Populate during execution. If nothing beyond the known yoyo defect turns up,
say so — an empty section is a finding.)*

- **The non-completing yoyo.** Known before execution; see Task 11. Documented
  as current behaviour, filed against Phase 3, not fixed here.

- **Defect in this plan: Task 1's `node:fs` import broke `npm run build`.**
  Found during execution. `tsconfig.app.json` includes `src` and pins
  `"types": ["vite/client"]`, so `import { readFileSync } from "node:fs"` has no
  declaration and `tsc -b` fails — while `npm test` passes, because Vitest
  transpiles without typechecking. The plan's Task 12 Step 2 would therefore
  have failed at the very end.

  Relocating the test to `tsconfig.node.json` is **not** a viable fix: that
  project sets `"lib": ["ES2023"]` with no DOM, and `sceneIR.ts` references
  `HTMLDivElement`, so the compiler imports would not typecheck there.

  Fixed in `164a954` by importing the document as a build-time dependency:
  `import markdownDoc from "../../docs/LANGUAGE.md?raw"`. `vite/client` declares
  `*?raw` (`node_modules/vite/client.d.ts:243`), so this needs no config change
  and no new ambient types. It is also strictly more robust than the original:
  `readFileSync` resolved against the process working directory, so the test
  only worked when run from the repo root, whereas `?raw` resolves relative to
  the test file.

  **Task 1's code block above still shows the `readFileSync` version.** The
  committed file is the `?raw` version. Do not "restore" it.

## Execution notes

### Defects in this plan

1. **Task 1's `node:fs` import broke `npm run build`.** `tsconfig.app.json`
   pins `"types": ["vite/client"]`, so `readFileSync` has no declaration under
   it and `tsc -b` fails while `npm test` still passes (Vitest transpiles
   without typechecking). Fixed by importing the document via `?raw`
   (`vite/client.d.ts` declares that suffix, so no config change is needed).
   Relocating the test to `tsconfig.node.json` was not viable: that project has
   `"lib": ["ES2023"]` with no DOM, and `sceneIR.ts` references
   `HTMLDivElement`, so the compiler's own modules would not typecheck there.
   This is recorded above too, from when it was found; restated here so it
   isn't missed as the entry point to this section.

2. **The plan said the default easing is `linear`.** It is **`easeInOut`** —
   `typeChecker/builder.ts:42` reads
   `easing: resolveEasing(an.props, "easing", "easeInOut")`. `docs/LANGUAGE.md`
   states the correct default.

3. **The plan's `collideBounds` test used registry key `"a"`.** Registry keys
   are scope-qualified; the object above is `circle a` inside the top-level
   `scene`, so its key is `"scene.a"`. The committed test
   (`src/compiler/languageDocs.test.ts:284`) already reads
   `ir!.registry["scene.a"].props.physics?.collideBounds`, so this was caught
   before it could produce a false pass (a lookup miss on `"a"` would return
   `undefined`, and `undefined !== true`, so the test would have failed loudly
   rather than silently — but the plan's text would have sent a fresh
   implementer down the wrong path first).

4. **The plan said the `generate` cap is 10,000 iterations.** It is
   **10,001**. `parser/parseGenerate.ts:46` rejects only when
   `end - start > 10000`; since both bounds are inclusive, `end - start ===
   10000` is 10,001 values and is accepted.

5. **The plan implied the 15,000 ceiling counts generated objects.** It counts
   **all** parsed objects, plus one increment per `use` expansion and one per
   `generate` iteration. `state.globalNodeCount` is checked in three places —
   `parser/parseObject.ts:155` (every object), `parser/parseUse.ts:13` (every
   `use`), and `parser/parseGenerate.ts:82` (every loop iteration) — so the
   limit is a shared global counter, not a per-construct one.

6. **The plan described handOff's multiplier as "the slope of the easing
   curve at the end."** It is a **fixed per-easing constant**:
   `getEasingDerivativeAtEnd` (`renderer/adapter.ts:69-77`) returns `2.0` for
   `easeIn`, `0.5` for `easeOut` and `easeInOut`, and `1.0` for `linear` —
   values chosen by feel, not measured off the curve. The true derivative of
   `easeOut` and `easeInOut` at `t=1` is 0 (both curves are momentarily flat
   at the end), which would hand off no momentum at all if used literally.
   `getEasingDerivativeAtEnd` is a misleading name for what it does; renaming
   it is a source change and stayed out of scope. `docs/LANGUAGE.md:294-302`
   documents the actual constants and says outright that `0.5` is a
   deliberate choice, not a measurement.

### Defects found by review

7. **The example extractor silently skipped a mistagged fence.** A typo like
   ` ```Declare ` (wrong case) or an unrecognised tag would have fallen
   through both the ` ```declare ` and ` ```text ` branches and produced zero
   coverage while the suite still reported green — defeating the harness's
   entire purpose, since the whole point of Task 1 is that a broken example
   cannot hide. `extractExamples` (`src/compiler/languageDocs.test.ts`) now
   throws on any fence tag it doesn't recognise, naming the bad tag and its
   line, and also throws on a four-or-more-backtick fence, since the extractor
   is a line scanner rather than a nested-fence parser. A caught
   lexer/parser/typeChecker throw is now surfaced as a readable `THREW: ...`
   entry instead of escaping as an uncaught exception.

8. **The claim "every object's pivot is its geometric centre"** — lifted from
   `AGENTS.md`'s own wording — is false for `group` and imprecise for
   `polygon`/`line`. A `group`'s pivot is the local origin it is positioned
   at, never derived from its children; children placed asymmetrically around
   that origin rotate about the origin, not about the visual centre of the
   group's content. For `polygon` and `line` the pivot is the bounding-box
   midpoint, not the centroid — for the document's own triangle example
   (`points: [(0, -30), (26, 15), (-26, 15)]`) that is `(0, -7.5)`, 7.5px away
   from the centroid at `(0, 0)`. `docs/LANGUAGE.md:44-53` now states this
   precisely, including the worked triangle offset. `AGENTS.md`'s own sentence
   (line 119) still carries the original imprecision — left uncorrected, see
   below.

9. **A paragraph said a pinned body is "held immobile" and then described it
   sliding into place**, which is self-contradictory: `pushAnimToWorld` writes
   the body's position every tick from the animation, so a position-pinned
   body visibly moves along the animated path — pinning removes its response
   to *forces*, not its motion. `docs/LANGUAGE.md`'s current "Animation and
   physics together" section (around line 424) instead says physics "does not
   move the object — but the object remains solid, so it can still knock
   other things over as it moves along the animated path," which states both
   halves without contradicting itself.

### Left open deliberately

- The non-completing yoyo is documented, not fixed. Filed against Phase 3 in
  `docs/specs/2026-08-26-physics-shared-world-design.md` §8.
- `AGENTS.md`'s pivot sentence carries the same imprecision as finding 8 and
  was not corrected — `AGENTS.md` is internal documentation, not part of this
  plan's deliverable, and touching it here would have been scope creep beyond
  filing the observation.
- `getEasingDerivativeAtEnd` is a misleadingly named function; renaming it is
  a source change and out of scope for a documentation plan.
- The eval was re-run only as a regression check (Task 12 Step 3: still
  `20/20 compiled clean`). Whether the reference actually shrinks authors'
  recorded uncertainty is unmeasured — `BRIEFS.md` itself says the comparison
  worth making is whether that uncertainty shrinks, not the compile rate,
  and that needs a fresh author run against the amended protocol, which this
  plan does not do.

### The anti-drift check, run for real

This is the plan's central claim, so it was exercised rather than assumed.
Renaming every top-level `def` to `let` in `docs/LANGUAGE.md`
(`sed -i 's/^def /let /' docs/LANGUAGE.md`, which touches the three bindings
in the metaprogramming example: `ink`, `gap`, `beat`) and re-running
`src/compiler/languageDocs.test.ts` produced one failing test:

```
FAIL  src/compiler/languageDocs.test.ts > docs/LANGUAGE.md examples > the example at LANGUAGE.md line 566 compiles
AssertionError: expected [ Array(1) ] to deeply equal []
+ [
+   "LANGUAGE.md:567: A Declare program must begin with the 'scene' keyword, but found identifier 'let'. Did you forget to open with 'scene {'?",
+ ]
```

21 of 22 tests still passed; only the one example touched by the rename
failed, and it failed for the expected reason — the parser rejecting `let` as
a program opener, not an unrelated crash. `git checkout docs/LANGUAGE.md`
restored a clean 22/22.

A second, sharper check confirmed the mechanism catches a smaller, more
plausible typo, not just a wholesale keyword swap: changing `handOff: true`
to `handoff: true` throughout the document (three occurrences — two in
prose, one in the handOff example's code fence) also produced exactly one
failure, this time a type error rather than a parse error:

```
FAIL  src/compiler/languageDocs.test.ts > docs/LANGUAGE.md examples > the example at LANGUAGE.md line 315 compiles
AssertionError: expected [ Array(1) ] to deeply equal []
+ [
+   "LANGUAGE.md:328: The 'animate' block has an unknown property 'handoff'. Valid properties for 'animate' are: 'property', 'to', 'duration', 'easing', 'loop', 'yoyo', 'handOff'.",
+ ]
```

Both reverted cleanly. The mechanism works exactly as designed: a rename that
the future `def`→`let`/`handOff`→`handoff` Phase 3 work will make breaks the
build immediately and specifically, rather than leaving the reference quietly
wrong.
