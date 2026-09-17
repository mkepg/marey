# Phase 5A Baked Lottie Implementation Plan

**Goal:** Emit a bounded Lottie subset — static circle/rectangle/polygon/group
geometry with baked position, rotation, scale and alpha keyframes, at a fixed
duration and frame rate, carrying baked physics with no Matter.js or Marey
dependency at playback — such that roadmap §7.1's three exit criteria are
provable rather than asserted. And, first, put `compiler.worker.ts` under test.

**Architecture:** Two pure modules either side of the Phase 4 snapshot boundary.
`lottieGeometry.ts` walks `IRSceneNode` once and returns either
`LOTTIE_*` diagnostics or a flat `LayerSpec[]` of inert data — kind, dimensions,
colour, anchor, parent link. `lottieEncode.ts` takes `(LayerSpec[],
FrameSnapshot[], SamplerPlan)` and imports nothing from `sceneIR`, so "encoders
see only snapshots" is an import-level fact rather than a claim. Transforms map
onto Lottie's parent mechanism unchanged; opacity and visibility flatten down the
tree, because composing a scalar is exact while composing an affine would force a
shear through `sk`/`sa`.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest 4, PixiJS 8.16,
Matter.js 0.20.0 (pinned, no caret), Vite 8 beta, Playwright 1.62,
`lottie-web` (new devDependency, Task 5).

**Spec:** `docs/specs/2026-09-11-marey-phase-5a-baked-lottie-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

1. **Baseline.** The suite is **24 files / 762 tests** at `6d8db3d`,
   `npx tsc -b --noEmit` exit 0, `npm run build` exit 0, `npm run build:cli`
   exit 0. **Re-derive on a clean tree before quoting**; a stray probe file
   silently inflates it (AGENT-LESSONS §6). This figure was re-derived for this
   plan on 2026-09-11 at `6d8db3d`.
2. **Judge file changes with `git diff --stat -- <path>`, never `git status`.**
   `core.autocrlf=true` with no `.gitattributes` makes `git status` report
   modification on content identical after normalisation.
3. **Commit as you go, from the first step of every task.** Phase 4 was hit by
   three rate-limit kills; the two that could have lost real work did not,
   because increments were already committed. Do not save one commit for the
   end. This instruction is carried from the start of every task in this phase
   rather than added after the first kill (Phase 4 execution notes, "Process
   notes for Phase 5A").
4. **`lottieGeometry.ts` and `lottieEncode.ts` must not import `pixi.js` at
   all**, not even as types, and **`lottieEncode.ts` must not import
   `sceneIR`** in any form. These are the phase's two structural claims. A
   violation is a defect even if every test passes.
5. **The three renderer invariants** (`docs/architecture/renderer.md`):
   nothing that mutates scene state may take a time argument; state mutation in
   the tick phase, painting in the paint phase; nothing fed into the physics
   world may derive from the wall clock. This phase adds no tick-phase code, but
   Task 5's seam constructs a runtime and must not start a ticker
   (`autoStart: false`, as `devExportSeam.ts` does).
6. **`TICK_HZ = 120`** and `secondsToTicks` live in `src/compiler/sceneIR.ts`.
   Never write a second seconds-to-ticks conversion. This phase needs neither —
   frame indices come from `SamplerPlan`, already validated.
7. **Delete-and-run, individually.** For every behaviour a task requires, delete
   the line implementing it and run the suite. Anything still green is untested.
   Where a change touches N call sites, revert each **separately**
   (AGENT-LESSONS §2c).
8. **The scope tie-break, stated once so no task has to guess** (AGENT-LESSONS
   §3b): *a gap the delete-and-run check finds in a behaviour the task
   **requires** is in scope and must be closed; a gap it finds in an **adjacent**
   behaviour is filed in the report, not fixed.*
9. **A RED must be read, not just observed.** A failure caused by a wrong
   fixture looks exactly like the failure the process is waiting for. Read the
   message and confirm it names the missing behaviour, not a missing method
   (AGENT-LESSONS §3d).
10. **Report what you did not do.** "I could not write that test, and here is
    why" is a valid result; a silently skipped check is not (AGENT-LESSONS §2f).
    This includes *not inventing a diagnostic for a case that cannot occur* —
    if a guard is unreachable, establish that and say so rather than adding a
    dead code path with a test that passes for the wrong reason.
11. **No outbound HTTP from bash; `curl` returns 000.** `npm` **does** have
    network — verified on 2026-09-11 (`npm view lottie-web version` → `5.13.0`).
    `git push`/`pull` work. Use `WebFetch`/`WebSearch` for documentation.
12. **`visual-check` needs `npx vite --port 5199 --strictPort`.** Without
    `--strictPort` a stale server absorbs every capture and reports a confident
    false pass; that has happened twice. Kill it afterwards and confirm the port
    has no `LISTENING` socket — a killed agent will not clean up after itself.

### A note on this plan's use of code blocks

Phase 4's plan carried **ten defects**, every one of them in a verbatim test
block written against a fixture the plan had not opened, and every one caught
only because implementers were told to check rather than paste
(AGENT-LESSONS §3d). Phase 3C's plan carried seven for the same reason.

So, two classes of code block below, labelled:

- **MEASURED.** Run against real source at `6d8db3d` while writing this plan, with
  the output read. Task 0's six log-line assertions are all of this kind — they
  came from a throwaway probe that drove the real worker and printed what it
  posted. So is every `.marey` fixture in Tasks 1 and 2: each was compiled
  through `compileSource` and its IR inspected. Both probes were deleted and the
  suite re-confirmed at 24 files / 762 tests with no stray file. You may rely on
  these values; if one is wrong, that is a finding worth reporting loudly,
  because it means the file changed under this plan.

  **That scan was not free of findings — it caught two defects in this plan
  before any of it reached an implementer,** which is the whole argument for
  doing it (AGENT-LESSONS §3c). Task 1's `line` fixture did not compile, missing
  two required properties, and would have produced a false RED. Task 2's walk
  would have been written against `ir.registry`, whose key order is *source*
  order rather than the layer-sorted order `ir.children` carries. Both are fixed
  above and both are recorded where they were found rather than only here.
- **UNVERIFIED.** Written from the Lottie specification or from reasoning, not
  from a run. Every Lottie document shape below is this kind. **Treat it as a
  claim to verify, not text to paste.** If a symbol does not exist with that
  spelling, adapt to reality and report the discrepancy — preserve the
  assertion, not the spelling.

Design §11 lists six Lottie facts neither the source nor the published
specification settled. Task 4 exists to answer them by measurement. Until it
has, **no task may treat them as known**.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `src/compiler/compiler.worker.test.ts` | Drives the real worker under a fake `self`. Pins branch order and log prefixes. |
| `src/compiler/export/lottieGeometry.ts` | `planLottie`, the `LOTTIE_*` diagnostics, `LayerSpec`. Pure; imports `sceneIR`, nothing else. |
| `src/compiler/export/lottieGeometry.test.ts` | Tests for the above. |
| `src/compiler/export/lottieEncode.ts` | `encodeLottie`. Pure; imports **neither** `sceneIR` **nor** `pixi.js`. |
| `src/compiler/export/lottieEncode.test.ts` | Tests for the above. |
| `src/compiler/export/lottieRoundTrip.test.ts` | Compile → plan → build → sample → encode, headless, on a real `.marey` scene. |
| `src/lib/devLottieSeam.ts` | Dev-only `window.__mareyExportLottie`, modelled on `devExportSeam.ts`. |
| `tools/visual-check/lottie-check.mjs` | Playwright harness: emit, play in lottie-web, capture, compare against Marey PNG. |
| `eval/RESULTS-PHASE-5A.md` | Exit-criteria evidence, one section per criterion, with reproducing commands. |

**Modified**

| File | Change |
|---|---|
| `src/compiler/compiler.worker.ts` | Task 0 Step 8 only: map a thrown phase onto one of the six contract prefixes. |
| `src/main.tsx` | Install the dev Lottie seam beside the PNG one, inside the same `import.meta.env.DEV` branch. |
| `package.json` | `lottie-web` devDependency. |
| `tools/visual-check/SKILL.md` | The new harness and what it proves. |
| `docs/architecture/renderer.md` | The encoder boundary and the opacity-flattening asymmetry. |
| `docs/architecture/roadmap-and-process.md` | Phase 5A bullet. |
| `docs/architecture/README.md` | "Current phase" line, updated in the **same edit** as the bullet above. |
| `docs/plans/2026-09-11-phase-5a-baked-lottie.md` | Execution notes (Task 6). |

---

## Task 0: Put `compiler.worker.ts` under test

**This task lands before anything else touches the compiler surface.** Phase 4's
independent reviewer named it as Phase 5A's first task. The file has no automated
test at all, was rewritten wholesale in Phase 4, and its correctness currently
rests on an unreachability argument plus one manual browser observation.

**Tier:** Integration.

**Files:**
- Create: `src/compiler/compiler.worker.test.ts`
- Modify: `src/compiler/compiler.worker.ts` (Step 8 only, and not before)

**Interfaces:**
- Consumes: `compileSource` (`src/compiler/compileSource.ts`) indirectly, through
  the worker. Nothing from other tasks.
- Produces: nothing other tasks consume. This task is independent by design.

### What the worker actually does

Six exits, selected by `thrown`, `out.tokenCount === 0`, `firstPhase === "PARSE"`
and `firstPhase === "TYPE"` (`compiler.worker.ts:40-104`). `thrown` is true when
there is at least one error whose first error's phase is neither `PARSE` nor
`TYPE`.

**Two things depend on this file and neither is guarded:**

- its **branch order** — each exit emits a different *prefix* of the log
  sequence, so reordering two branches changes what the Terminal pane shows
  without changing any type;
- its **six log-line prefixes** — `[lexer]`, `[parser]`, `[type]`, `[pixi]`,
  `[render]`, `[system]` — which `visual-check/check.mjs:89` scrapes with
  `/^\[(lexer|parser|type|pixi|render|system)\]/`. What that regex matches is the
  six **prefixes**, not the message text after them, so a message rewrite
  survives it and a *prefix* change does not.

  Only three of the six are emitted by this file; `[pixi]` and `[render]` come
  from `src/compiler/index.ts` (the main thread) and `[system]` from its
  `worker.onerror`. This task pins the three the worker owns.

### A finding this plan already made, which Step 8 closes

A throwaway probe driving the real worker at `6d8db3d` showed that `postThrown`
(`compiler.worker.ts:45-55`) builds its prefix as
`` `[${err.phase.toLowerCase()}]` ``. For the two reachable thrown phases that
produces **`[lex]`** and **`[runtime]`** — and **neither is one of the six
prefixes `check.mjs` scrapes.** `[lex]` is not `[lexer]`.

Consequence, established rather than assumed: `Terminal.tsx:46-49` renders
`entry.text` verbatim and styles by `entry.kind`, so the IDE is unaffected. But
`check.mjs`'s filter drops those lines entirely, so a `visual-check` run against
a scene that fails to lex, or one that trips the 51-error abort, captures **no
error line at all** — the compile fails and the scraped output says nothing about
why.

This is in scope under Global Constraint 8: the task requires pinning the six
log-line prefixes, and this is a gap *in that behaviour*, not an adjacent one.
Steps 1–7 pin what the file does **today**; Step 8 fixes it, in its own commit,
so the diff shows exactly what changed.

- [ ] **Step 1: Write the harness and the success-path test**

The worker is a `self.addEventListener("message", …)` module with no exports, and
the suite runs under Vitest's `node` environment where `self` does not exist. So
install a fake `self` first, then dynamically import the module.

**Deliberately no production refactor.** Extracting a pure `handleMessage(data)`
would make this easier, and would also mean the test no longer guards the
artifact the browser actually runs. The point is to test the shipped file.

**MEASURED** — this harness was run against the real worker at `6d8db3d` and the
values below are what it printed.

```ts
import { describe, it, expect, beforeAll } from "vitest";

type Posted = Record<string, any>;

let fire: (data: unknown) => Posted[];

beforeAll(async () => {
  let handler: ((e: { data: unknown }) => void) | null = null;
  const posted: Posted[] = [];

  // The worker registers its listener at module-evaluation time, so `self`
  // must exist before the import, and the import must therefore be dynamic.
  (globalThis as Record<string, unknown>).self = {
    addEventListener: (type: string, fn: (e: { data: unknown }) => void) => {
      if (type === "message") handler = fn;
    },
    postMessage: (msg: Posted) => { posted.push(msg); },
  };

  await import("./compiler.worker");
  if (!handler) throw new Error("worker registered no message listener");

  fire = (data: unknown) => {
    posted.length = 0;
    handler!({ data });
    return posted;
  };
});

const texts = (msgs: Posted[]): string[] => msgs[0].logs.map((l: any) => l.text);
const kinds = (msgs: Posted[]): string[] => msgs[0].logs.map((l: any) => l.kind);

describe("compiler.worker · success", () => {
  it("emits the full six-line log sequence in order and posts the IR as a string", () => {
    const out = fire({
      id: 1,
      action: "compile",
      source: `scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`,
    });

    expect(out).toHaveLength(1);
    expect(out[0].success).toBe(true);
    expect(out[0].errors).toEqual([]);

    // Asserted as an ordered whole, not line-by-line: the thing under test is
    // the branch ORDER, and a per-line `toContain` would pass against any
    // permutation of the same six lines.
    expect(texts(out)).toEqual([
      "[lexer]   tokenizing...",
      "[lexer]   25 tokens",
      "[parser]  building AST...",
      "[parser]  AST root: scene, 1 top-level object(s)",
      "[type]    checking + building Scene IR...",
      "[type]    no errors — Scene IR ready (1 node(s))",
    ]);
    expect(kinds(out)).toEqual(["info", "ok", "info", "ok", "info", "ok"]);

    // The worker stringifies the IR to dodge a structured-clone cost on large
    // payloads (`compiler.worker.ts:102-104`), and `index.ts:62` parses it
    // back. A regression to posting the object directly would still "work" in
    // the app, so the string-ness is pinned here explicitly.
    expect(typeof out[0].ir).toBe("string");
    expect(JSON.parse(out[0].ir).registry["scene.c"].props.radius).toBe(3);
  });
});
```

Note the padding: `[lexer]` + **3** spaces, `[parser]` + **2**, `[type]` + **4**.
It is column alignment and it is part of the string.

The `25` is `out.tokenCount - 1` (`compiler.worker.ts:64`); `compileSource.test.ts:27`
independently pins `tokenCount` at 26 for this exact source.
The `—` in the last line is an em dash.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/compiler/compiler.worker.test.ts`
Expected: **PASS.**

**This is a characterisation test, not a RED step, and the distinction matters.**
It pins behaviour that already exists, so it passes on first run. Phase 3C's plan
recorded exactly this confusion as one of its own defects (a regression pin read
as a failed RED). Do not go looking for a failure here. The evidence that these
tests are load-bearing is Step 7's mutation run, not a RED.

If it *fails*, read the message before changing anything: either the harness is
wrong, or the worker has changed since this plan measured it. Both are findings.

- [ ] **Step 3: Commit**

```bash
git add src/compiler/compiler.worker.test.ts
git commit -m "test(5a): pin compiler.worker's success path"
```

- [ ] **Step 4: The two error-classification branches**

**MEASURED.**

```ts
describe("compiler.worker · returned errors", () => {
  it("stops after 'building AST...' for a PARSE error and lists every one", () => {
    const out = fire({ id: 2, action: "compile", source: `circle c { }` });

    expect(out[0].success).toBe(false);
    expect(out[0].ir).toBeNull();
    expect(texts(out)).toEqual([
      "[lexer]   tokenizing...",
      "[lexer]   4 tokens",
      "[parser]  building AST...",
      "[parser]  A Marey program must begin with the 'scene' keyword, but found keyword 'circle'. 'circle' is an object keyword — objects must be placed inside a scene block.",
    ]);
    // The load-bearing half: no `[parser] AST root` line and no `[type]` line.
    // Reordering the PARSE branch after the type-check block would emit both.
    expect(out[0].errors[0].phase).toBe("PARSE");
  });

  it("emits the AST-root line and the type header before a TYPE error", () => {
    const out = fire({
      id: 3,
      action: "compile",
      source: `scene { size: (800, 600) circle c { position: (1, 2), radius: -3 } }`,
    });

    expect(out[0].success).toBe(false);
    expect(texts(out)).toEqual([
      "[lexer]   tokenizing...",
      "[lexer]   26 tokens",
      "[parser]  building AST...",
      "[parser]  AST root: scene, 1 top-level object(s)",
      "[type]    checking + building Scene IR...",
      "[type]    'circle' object 'c': 'radius' must be greater than 0, but got -3.",
    ]);
    expect(out[0].errors[0].phase).toBe("TYPE");
  });
});
```

`26` here, not `25`: the `-3` adds a `MINUS` token, so `tokenCount` is 27.
The error wording is `greater than 0` with a **digit** — `compileSource.test.ts:51`
records that the spelled-out form was a plan defect in Phase 4. Do not "correct" it.

- [ ] **Step 5: The two thrown branches, which are the ones nothing guards**

These are the branches the whole task exists for. `thrown` splits on
`out.tokenCount === 0`: lexing itself failed, versus lexing succeeded and a later
stage threw.

**MEASURED.** Both fixtures are the ones `compileSource.test.ts` already uses, so
their reachability is independently established there.

```ts
describe("compiler.worker · thrown errors", () => {
  it("emits only the tokenizing line when lexing itself throws", () => {
    // `lex()` throws a raw { phase: "LEX", ... } before `parse()` is called,
    // so nothing internal catches it and tokenCount is 0.
    const out = fire({ id: 4, action: "compile", source: "!" });

    expect(out[0].success).toBe(false);
    expect(texts(out)).toHaveLength(2);
    expect(texts(out)[0]).toBe("[lexer]   tokenizing...");
    // No "N tokens" line and no "building AST..." line: the count would be a
    // lie and the parser never ran. This is the `tokenCount === 0` branch.
    expect(texts(out)[1]).toContain("Unexpected character '!'");
    expect(texts(out)[1]).toContain("— line 1, column 1");
    expect(out[0].errors[0].phase).toBe("LEX");
  });

  it("keeps the token count and the AST header when a later stage throws", () => {
    // The parser's 51-duplicate abort throws a plain Error that escapes every
    // ParseException guard. Phase 4 fixed `compileSource` to hoist `tokens`
    // above its try precisely so this line survives; that fix is what this
    // assertion protects.
    const clauses = Array.from({ length: 52 }, () => "x: 1").join(" ");
    const out = fire({ id: 5, action: "compile", source: `scene { ${clauses} }` });

    expect(out[0].success).toBe(false);
    expect(texts(out)).toHaveLength(4);
    expect(texts(out)[1]).toBe("[lexer]   159 tokens");
    expect(texts(out)[2]).toBe("[parser]  building AST...");
    expect(texts(out)[3]).toContain("Maximum error limit reached");
    expect(out[0].errors[0].phase).toBe("RUNTIME");
  });
});
```

`159` is `tokenCount - 1` where `compileSource.test.ts:113` pins `tokenCount` at
`160`. The two tests assert **different log lengths** — 2 versus 4 — which is
what makes the `tokenCount === 0` split load-bearing.

The error-line *prefix* is deliberately not asserted here. Step 8 changes it, and
asserting it twice would mean writing the assertion and immediately rewriting it.

- [ ] **Step 6: The lint action, which short-circuits before any logging**

**MEASURED.**

```ts
describe("compiler.worker · lint", () => {
  it("answers a lint request with errors and symbols and no logs at all", () => {
    const out = fire({ id: 6, action: "lint", source: `scene { size: (1, 1) }` });

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: 6, action: "lint", errors: [], symbols: [] });
    // No `logs` key whatsoever: the lint branch returns before the log array
    // is even declared (`compiler.worker.ts:7-11`).
    expect("logs" in out[0]).toBe(false);
  });

  it("defaults a message with no action to compile", () => {
    // `action = "compile"` is a destructuring default (`compiler.worker.ts:5`).
    // `index.ts` always sends one, so this is the only guard on that default.
    const out = fire({ id: 7, source: `scene { size: (1, 1) }` });
    expect(out[0].action).toBe("compile");
    expect(out[0].success).toBe(true);
  });
});
```

- [ ] **Step 7: Prove the tests are load-bearing — mutate, individually**

Global Constraint 7. Apply each mutation **alone**, run the suite, record the
count and *which* tests failed, then restore and confirm
`git diff --stat -- src/compiler/compiler.worker.ts` is empty before the next.

| # | Mutation | Why it is worth checking |
|---|---|---|
| 1 | Swap the `if (thrown)` block (`:67-70`) with the `if (firstPhase === "PARSE")` block (`:72-79`) | Pure reordering. No type changes. This is the defect class the whole task exists for |
| 2 | Delete the `if (thrown && out.tokenCount === 0)` early return (`:59-62`) | Collapses the two thrown branches into one; the LEX case would gain two lines it must not have |
| 3 | Change `out.tokenCount - 1` to `out.tokenCount` (`:64`) | An off-by-one in a user-visible count that nothing else reads |
| 4 | Delete the `action === "lint"` early return (`:7-11`) | Lint requests would fall through into the compile path |
| 5 | Post the IR object instead of `JSON.stringify(out.ir)` (`:103`) | `index.ts:62` tolerates both, so the app still works; only Step 1's `typeof` assertion sees it |

**Expected:** every mutation reddens at least one test. **If any leaves the suite
green, that is a gap in a behaviour this task requires** — Global Constraint 8
puts it in scope, so close it with a fixture that makes the behaviour
load-bearing, and say so in the report.

- [ ] **Step 8: Close the prefix gap — separately, and only now**

Every line this file emits must carry one of the six prefixes `check.mjs`
scrapes. Today the thrown path emits `[lex]` and `[runtime]`, which it does not.

Map the phase onto the contract rather than printing it raw. **UNVERIFIED** — the
shape below is reasoning, not a run; confirm the reachable phase set yourself
before trusting the mapping, and widen the default rather than adding a case for
a phase you cannot reach (Global Constraint 10).

```ts
// `check.mjs:89` filters the Terminal's output on exactly six prefixes:
// /^\[(lexer|parser|type|pixi|render|system)\]/. A raw `err.phase` is not one
// of them for either reachable thrown phase — LEX renders as `[lex]`, and the
// parser's 51-error abort renders as `[runtime]` — so both lines were dropped
// from every scraped visual-check capture. The IDE was unaffected
// (`Terminal.tsx` renders text verbatim and styles by `kind`), which is why
// this survived a manual browser observation.
const PHASE_PREFIX: Record<string, string> = {
  LEX: "[lexer]  ",
  PARSE: "[parser] ",
  TYPE: "[type]   ",
};

const prefixFor = (phase: string): string => PHASE_PREFIX[phase] ?? "[system] ";
```

Then use `prefixFor(err.phase)` in `postThrown`, and update the two Step 5
assertions to pin the new prefix:

```ts
expect(texts(out)[1]).toMatch(/^\[lexer\] /);   // was "[lex]  "
expect(texts(out)[3]).toMatch(/^\[system\] /);  // was "[runtime]  "
```

Add one test that pins the *contract itself*, so this cannot regress by any
route:

```ts
it("emits nothing outside the six prefixes check.mjs scrapes", () => {
  // The exact regex from tools/visual-check/check.mjs:89. A line that
  // does not match is dropped from every captured visual-check report, so a
  // compile can fail there with no reason shown.
  const SCRAPED = /^\[(lexer|parser|type|pixi|render|system)\]/;
  const sources = [
    `scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`,
    `circle c { }`,
    `scene { size: (800, 600) circle c { position: (1, 2), radius: -3 } }`,
    "!",
    `scene { ${Array.from({ length: 52 }, () => "x: 1").join(" ")} }`,
  ];
  for (const source of sources) {
    for (const text of texts(fire({ id: 99, action: "compile", source }))) {
      expect(text).toMatch(SCRAPED);
    }
  }
});
```

That test is the one to check for AGENT-LESSONS §2a vacuity: confirm it goes
**red against the pre-Step-8 worker** (it will — two of the five sources emit a
non-matching line) before accepting it.

- [ ] **Step 9: Full suite, typecheck, and commit**

```bash
npx vitest run && npx tsc -b --noEmit
```
Expected: exit 0, **24 files** (this task adds one file → **25 files**), test
count above 762 by however many cases you wrote. Quote the number you see.

```bash
git add src/compiler/compiler.worker.test.ts src/compiler/compiler.worker.ts
git commit -m "fix(5a): every worker log line carries a scraped prefix"
```

---

## Task 1: `LOTTIE_*` diagnostics and the refusal walk

**Tier:** Mechanical. One new file, complete specification, no dependencies.

**Files:**
- Create: `src/compiler/export/lottieGeometry.ts`
- Create: `src/compiler/export/lottieGeometry.test.ts`

**Interfaces:**
- Consumes: `IRSceneNode`, `IRObjectNode`, `IRObjectId` from `../sceneIR`.
- Produces, for Tasks 2 and 3:
  - `type LottieDiagnosticCode = "LOTTIE_UNSUPPORTED_TEXT" | "LOTTIE_UNSUPPORTED_LINE"`
  - `interface LottieDiagnostic { readonly code: LottieDiagnosticCode; readonly message: string }`
  - `type LottiePlanResult = { ok: true; layers: ReadonlyArray<LayerSpec> } | { ok: false; diagnostics: ReadonlyArray<LottieDiagnostic> }`
  - `function planLottie(ir: IRSceneNode): LottiePlanResult`

  `LayerSpec` is defined in Task 2. This task returns `layers: []` on the success
  path and fills it in Task 2, so the signature is stable across both.

Model the module on `exportContract.ts`: `EXPORT_*` there, `LOTTIE_*` here; same
"return every applicable diagnostic, not just the first" rule; same
`[CODE] message` format, which the whole codebase uses and
`validator.test.ts`'s `errorsFor` helper relies on.

- [ ] **Step 1: Write the failing tests**

**UNVERIFIED** — `irFor` is copied from `exportContract.test.ts:8-13`, which is
real; the diagnostic wording is this plan's invention and you are writing it, so
it cannot be wrong yet. But **check that `text` and `line` compile at all** in
the fixtures below before assuming the test fails for the right reason: if a
fixture does not compile, `irFor` throws and you get a RED that proves nothing
(Global Constraint 9).

```ts
import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planLottie } from "./lottieGeometry";
import type { IRSceneNode } from "../sceneIR";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

function codes(r: ReturnType<typeof planLottie>): string[] {
  return r.ok ? [] : r.diagnostics.map(d => d.code);
}

describe("planLottie · refusals", () => {
  it("refuses a text node by name", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } }`);
    const r = planLottie(ir);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("LOTTIE_UNSUPPORTED_TEXT");
    // Names the offending object, not just the kind: a scene with twenty
    // objects and one text node must say which one.
    if (!r.ok) expect(r.diagnostics[0].message).toContain("scene.t");
  });

  it("refuses a line node by name", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 line l { position: (0,0), points: [(0,0), (10,10)], thickness: 2 } }`);
    expect(codes(planLottie(ir))).toContain("LOTTIE_UNSUPPORTED_LINE");
  });

  it("finds an unsupported node nested inside a group", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 group g { position: (0,0) text t { position: (0,0), content: "hi" } } }`);
    // The walk must recurse. A top-level-only scan is the obvious wrong
    // implementation and passes both tests above.
    expect(codes(planLottie(ir))).toContain("LOTTIE_UNSUPPORTED_TEXT");
  });

  it("reports every unsupported node, not only the first", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1 text t { position: (0,0), content: "hi" } line l { position: (0,0), points: [(0,0), (10,10)], thickness: 2 } }`);
    const out = codes(planLottie(ir));
    expect(out).toContain("LOTTIE_UNSUPPORTED_TEXT");
    expect(out).toContain("LOTTIE_UNSUPPORTED_LINE");
  });

  it("accepts the four supported kinds", () => {
    const ir = irFor(`scene { size: (100, 100) duration: 1
      circle c { position: (10,10), radius: 5 }
      rectangle r { position: (20,20), size: (4, 6) }
      polygon p { position: (30,30), points: [(0,0), (10,0), (5,10)] }
      group g { position: (40,40) circle inner { position: (0,0), radius: 2 } }
    }`);
    expect(planLottie(ir).ok).toBe(true);
  });
});
```

**MEASURED — every fixture above was compiled while writing this plan**, through
a throwaway probe calling `compileSource` on each and printing the result. The
probe was deleted and the suite re-confirmed at 24 files / 762 tests.

That scan found **one real defect in this plan**, now corrected above, and it is
the exact Phase 4 pattern: `line l { points: [...] }` does not compile —
`line` requires `position` **and** `thickness` as well
(`'line' object 'l' is missing the required property 'position'` /
`'thickness'`). Pasted as originally written it would have thrown inside `irFor`
and produced a **false RED**: a failure that looks like the one the process is
waiting for, but proves only that the fixture is wrong (AGENT-LESSONS §3d).

Note the source-vs-IR gap the scan confirmed: a rectangle's **source** property
is `size: (w, h)`, which the IR builder splits into `width`/`height`
(`typeChecker/builder.ts:158-163`). The IR type names are not the source names.

- [ ] **Step 2: Run and read the RED**

Run: `npx vitest run src/compiler/export/lottieGeometry.test.ts`
Expected: FAIL — `planLottie` is not exported from a module that does not exist.
**Read the message.** "Cannot find module" is the RED you want. "fixture did not
compile" is a fixture defect, not progress.

- [ ] **Step 3: Implement**

Walk `ir.children` depth-first, recursing into `group` children. Collect one
diagnostic per unsupported node. Return `{ok: false, diagnostics}` if any, else
`{ok: true, layers: []}`.

Two rules carried from `exportContract.ts`:
- messages begin `[CODE] `;
- every applicable diagnostic is returned, not only the first.

Write the messages to name the object id and say what to do — the `EXPORT_*`
messages all do, and `LANGUAGE.md`'s tone follows.

**There is no third diagnostic for colour, and this is settled rather than
assumed.** `IRColor` is a bare `string`, so a non-hex value would be a real
problem for Task 2's conversion. It cannot occur. **MEASURED** at `6d8db3d` by
compiling one scene per colour form and reading `props.color` off the IR:

| Source | Reaches the IR as |
|---|---|
| `color: #ff8000` | `"#ff8000"` |
| `color: #f80` | `"#ff8800"` — three-digit hex is **expanded** upstream |
| `color: orange` | `"#ffa500"` — a `NAMED_COLOR` is **resolved** upstream |
| omitted | `"#ffffff"` (contract default) |

`NAMED_COLORS` (`languageContract.ts:79-84`) is a nine-entry table mapping each
name to a hex literal, and anything outside it never lexes as a colour at all —
`color: tomato` is a **PARSE** error, `Undefined variable 'tomato'`, long before
the IR exists.

So `IRColor` is always a normalised six-digit `#rrggbb`. **Add no colour
diagnostic**: it would be a branch no input can reach, tested by an assertion
that passes for the wrong reason (AGENT-LESSONS §2f). Task 2's converter handles
`#rrggbb` only, and should **throw** rather than degrade if it ever sees
anything else, since that would mean an upstream invariant broke.

- [ ] **Step 4: Run, then mutate**

Run the file; expect PASS. Then, individually:

| # | Mutation | Expected |
|---|---|---|
| 1 | Make the walk non-recursive (top-level children only) | The nested-group test reddens; the other three stay green — which is exactly why that test exists |
| 2 | Return after the first diagnostic instead of collecting all | The "every unsupported node" test reddens |
| 3 | Drop the object id from the message | The `toContain("scene.t")` assertion reddens |

Restore each and confirm `git diff --stat` empty before the next.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/export/lottieGeometry.ts src/compiler/export/lottieGeometry.test.ts
git commit -m "feat(5a): planLottie refuses text and line by name"
```

---

## Task 2: `LayerSpec` — the geometry walk

**Tier:** Integration.

**Files:**
- Modify: `src/compiler/export/lottieGeometry.ts`
- Modify: `src/compiler/export/lottieGeometry.test.ts`

**Interfaces:**
- Consumes: Task 1's `planLottie` shell.
- Produces, for Task 3:

```ts
export type LottieShapeSpec =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | { readonly kind: "polygon"; readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }> }
  | { readonly kind: "group" };

export interface LayerSpec {
  readonly id: IRObjectId;                 // scope-qualified, e.g. "scene.mark.stem"
  readonly name: string;                   // last segment, for Lottie `nm`
  readonly shape: LottieShapeSpec;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly color: readonly [number, number, number] | null;  // 0-1 RGB; null for a group
  readonly parentId: IRObjectId | null;
  readonly background: never;              // NOT here - see below
}
```

Drop the `background` line; it is listed only to say explicitly that the scene
background is **not** a `LayerSpec`. It has no IR object id, no parent and no
animation, so Task 3 takes it as a separate argument rather than smuggling a
synthetic layer into this array. A synthetic id would collide with the
`FrameSnapshot` lookup Task 3 does by id.

### The mapping, and why each term is there

Design §4.2, derived from `builder.ts`. **Every row below is MEASURED** against
`src/compiler/renderer/builder.ts:202-340` at `6d8db3d` — but re-read that
switch yourself before implementing, because it is the single source this whole
task depends on.

`localPivot = bbox.min + origin × bbox.size` (`builder.ts:86-89`), and
`ObjectSnapshot.x`/`y` **is** that pivot's parent-local position, because PixiJS
places a container by its pivot. So `anchor` is `localPivot` and Task 3 passes
the snapshot's `x`/`y` to Lottie `p` untouched.

| IR | `bbox.min` | `bbox.size` | `anchor` |
|---|---|---|---|
| `circle` radius `r` | `(0, 0)` | `(2r, 2r)` | `(2r·oₓ, 2r·o_y)` |
| `rectangle` `w`×`h` | `(0, 0)` | `(w, h)` | `(w·oₓ, h·o_y)` |
| `polygon` | `(minX, minY)` | `(w, h)` | `(minX + w·oₓ, minY + h·o_y)` |
| `group` | — | — | `(0, 0)` — D16 fixes a group's pivot at its local origin, and `IRGroupProps` carries no `origin` at all |

- [ ] **Step 1: Write the failing tests — including the ones that would catch a wrong anchor**

```ts
describe("planLottie · layer specs", () => {
  const layersOf = (source: string) => {
    const r = planLottie(irFor(source));
    if (!r.ok) throw new Error(`unexpected refusal: ${r.diagnostics.map(d => d.code).join(",")}`);
    return r.layers;
  };

  it("puts a default-origin circle's anchor at its centre", () => {
    const [c] = layersOf(`scene { size: (100,100) duration: 1 circle c { position: (10,10), radius: 5 } }`);
    expect(c.shape).toEqual({ kind: "circle", radius: 5 });
    // bbox is (0,0)-(10,10) and origin defaults to (0.5, 0.5), so the pivot
    // sits at (5, 5) — NOT at (0, 0). A circle is drawn at .circle(r, r, r),
    // so its own centre is (r, r) in local space too.
    expect(c.anchor).toEqual({ x: 5, y: 5 });
  });

  it("moves a bottom-origin rectangle's anchor to its baseline", () => {
    // origin (0.5, 1) is the "grow from a baseline" idiom Phase 3C added.
    // anchor = (w*0.5, h*1) = (2, 6). If the implementation ignores origin and
    // always centres, this is (2, 3) and the test reddens.
    const [r] = layersOf(`scene { size: (100,100) duration: 1 rectangle r { position: (20,20), size: (4,6), origin: (0.5, 1) } }`);
    expect(r.anchor).toEqual({ x: 2, y: 6 });
  });

  it("offsets a polygon's anchor by its bbox minimum", () => {
    // Points (0,-30), (26,15), (-26,15): minX -26, minY -30, w 52, h 45.
    // Default origin: anchor = (-26 + 26, -30 + 22.5) = (0, -7.5).
    // The -7.5 is the same bbox-centre/centroid gap D15 exists to correct and
    // that Phase 3C's filed MatterWorld fixture measured at 7.5px.
    const [p] = layersOf(`scene { size: (100,100) duration: 1 polygon p { position: (0,0), points: [(0,-30), (26,15), (-26,15)] } }`);
    expect(p.anchor).toEqual({ x: 0, y: -7.5 });
  });

  it("fixes a group's anchor at its own origin regardless of where its children sit", () => {
    // D16. A group whose only child sits at (40, 40) still anchors at (0, 0).
    const layers = layersOf(`scene { size: (100,100) duration: 1 group g { position: (5,5) circle inner { position: (40,40), radius: 2 } } }`);
    const g = layers.find(l => l.id === "scene.g")!;
    expect(g.shape).toEqual({ kind: "group" });
    expect(g.anchor).toEqual({ x: 0, y: 0 });
    expect(g.color).toBeNull();
  });

  it("links a child to its parent and leaves a top-level object unparented", () => {
    const layers = layersOf(`scene { size: (100,100) duration: 1 group g { position: (5,5) circle inner { position: (1,1), radius: 2 } } }`);
    expect(layers.find(l => l.id === "scene.g")!.parentId).toBeNull();
    expect(layers.find(l => l.id === "scene.g.inner")!.parentId).toBe("scene.g");
  });

  it("emits layers in IR order, which is already layer-sorted", () => {
    // typeChecker/builder.ts:265-269 sorts children by `layer` ascending with a
    // stable index tiebreak, and nothing in the renderer reads `layer` again.
    // So IR order IS paint order and this walk must not re-sort.
    const layers = layersOf(`scene { size: (100,100) duration: 1
      circle top { position: (0,0), radius: 1, layer: 5 }
      circle bottom { position: (0,0), radius: 1, layer: 1 }
    }`);
    expect(layers.map(l => l.id)).toEqual(["scene.bottom", "scene.top"]);
  });

  it("converts a hex colour to three 0-1 floats", () => {
    const [c] = layersOf(`scene { size: (100,100) duration: 1 circle c { position: (0,0), radius: 1, color: #ff8000 } }`);
    expect(c.color![0]).toBe(1);
    expect(c.color![1]).toBeCloseTo(128 / 255, 10);
    expect(c.color![2]).toBe(0);
  });
});
```

**MEASURED.** Every fixture above was compiled while writing this plan and all
of them compile. The two whose exact arithmetic this task asserts were dumped
from the IR and confirm the expected numbers:

- polygon → `points` unchanged, `origin: {x: 0.5, y: 0.5}`, so
  `anchor = (−26 + 0.5×52, −30 + 0.5×45) = (0, −7.5)`;
- rectangle → `width: 4`, `height: 6`, `origin: {x: 0.5, y: 1}`, so
  `anchor = (4×0.5, 6×1) = (2, 6)`.

**One trap the same scan exposed, and it decides how you write the walk.** For
the layer-order fixture, `Object.keys(ir.registry)` is
`["scene.top", "scene.bottom"]` — *source* order — while `ir.children` is
`["scene.bottom", "scene.top"]` — *layer-sorted* order. **The registry is not
sorted.** Walk `ir.children` recursively; an implementation that iterates
`ir.registry` to find its nodes gets paint order exactly backwards here and
passes every other test in this task.

- [ ] **Step 2: Run and read the RED.** Expect failures naming a missing
  `layers` content, not a missing module.

- [ ] **Step 3: Implement the walk.** One recursion producing both diagnostics
  (Task 1) and specs. Do not write a second traversal.

- [ ] **Step 4: Mutate, individually**

| # | Mutation | Expected |
|---|---|---|
| 1 | Anchor hardcoded to the bbox **centre** (ignore `origin`) | The bottom-origin rectangle test reddens; the default-origin circle test does **not**. That asymmetry is the point — a suite containing only default-origin fixtures would have no opinion |
| 2 | Circle anchor computed from `radius` instead of `2·radius` | The circle test reddens |
| 3 | Polygon anchor omits the `bbox.min` term | The polygon test reddens (`0, -7.5` → `0, 22.5`) |
| 4 | A group's anchor derived from its children's bounds | The D16 test reddens |
| 5 | The walk re-sorts children by `layer` | The IR-order test reddens |
| 6 | Colour divided by 256 instead of 255 | The colour test reddens |

**Mutation 1 is the §2d judgment-call check for this task.** If it leaves the
suite green, the origin handling is unpinned and a fixture is owed.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/export/lottieGeometry.ts src/compiler/export/lottieGeometry.test.ts
git commit -m "feat(5a): IR walk produces inert Lottie layer specs"
```

---

## Task 3: `lottieEncode.ts` — the document

**Tier: Architecture.** Every unit mismatch in design §3 lives in this file, and a
mistake in any one of them produces a file that parses, plays, and shows the
wrong thing. Budget a full two-stage review.

**Files:**
- Create: `src/compiler/export/lottieEncode.ts`
- Create: `src/compiler/export/lottieEncode.test.ts`

**Interfaces:**
- Consumes: `LayerSpec`, `LottieShapeSpec` (Task 2) — as **types only**;
  `FrameSnapshot`, `ObjectSnapshot` (`../renderer/frameSampler`) as types;
  `SamplerPlan` (`./exportContract`) as a type.
- Produces:
  `function encodeLottie(layers: ReadonlyArray<LayerSpec>, frames: ReadonlyArray<FrameSnapshot>, plan: SamplerPlan, scene: { width: number; height: number; background: readonly [number, number, number]; name: string }): LottieDoc`

**Global Constraint 4 applies hardest here: this file must import nothing from
`sceneIR` and nothing from `pixi.js`.** Verify with
`grep -n "sceneIR\|pixi" src/compiler/export/lottieEncode.ts` returning nothing,
and say so in your report.

### The conversions, each of which is a silent-failure candidate

**MEASURED** against the published specification on 2026-09-11 (design §3):

| Marey / snapshot | Lottie | Conversion |
|---|---|---|
| `rotation` radians | `r` degrees, clockwise | `× 180 / Math.PI` |
| `scaleX`/`scaleY` multiplier | `s` percent | `× 100` |
| `alpha` 0–1 | `o` 0–100 | `× 100` |
| hex colour | `c` 0–1 floats | done in Task 2 |
| — | bezier `i`/`o` | **relative to their vertex**, so all-zero for a straight-edged polygon |

### The opacity asymmetry — design §5

A layer's emitted opacity is the product, over itself **and every ancestor**, of
`visible ? alpha : 0`. Transforms are *not* composed; they go through Lottie's
`parent` mechanism unchanged.

This is deliberate and asymmetric. Read design §5 before implementing it, and do
not "simplify" it to match the transform handling — the two cases differ because
composing a scalar is exact while composing an affine forces a shear through
`sk`/`sa`.

- [ ] **Step 1: Write the failing tests, on hand-built inputs**

The whole point of the two-module split is that this file can be tested with no
compiler, no renderer and no PixiJS. Build `LayerSpec`s and `FrameSnapshot`s by
hand.

**UNVERIFIED, all of it.** `SamplerPlan` is branded and **cannot be
hand-constructed** — `exportContract.ts:42-50` makes that a compile error on
purpose. Get one from `planExport(irFor(...), { fps })`, exactly as
`frameSampler.test.ts` must. That is the one place this test needs the compiler.

```ts
import { describe, it, expect } from "vitest";
import { encodeLottie } from "./lottieEncode";
import { planExport } from "./exportContract";
import type { LayerSpec } from "./lottieGeometry";
import type { FrameSnapshot } from "../renderer/frameSampler";
// ... plus lex/parse/typeCheck for the one irFor call that yields a plan

const SCENE = { width: 100, height: 50, background: [0, 0, 0] as const, name: "t" };

const circle = (id: string, parentId: string | null = null): LayerSpec => ({
  id, name: id.split(".").pop()!,
  shape: { kind: "circle", radius: 5 },
  anchor: { x: 5, y: 5 },
  color: [1, 0, 0], parentId,
});

const snap = (id: string, over: Partial<ObjectSnapshot> = {}): ObjectSnapshot => ({
  id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1, visible: true, ...over,
});

const framesOf = (...objs: ObjectSnapshot[][]): FrameSnapshot[] =>
  objs.map((objects, index) => ({ index, tick: index * 4, objects }));

describe("encodeLottie · units", () => {
  it("writes rotation in degrees, scale in percent and opacity in 0-100", () => {
    const plan = planFor(2, 30);  // helper: a 2-frame plan at 30fps
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf(
        [snap("scene.c")],
        [snap("scene.c", { rotation: Math.PI / 2, scaleX: 2, scaleY: 0.5, alpha: 0.25 })],
      ),
      plan, SCENE,
    );
    const layer = doc.layers.find((l: any) => l.nm === "c")!;
    // Exact, not toBeCloseTo: this is the same computation the encoder does,
    // so if it is not exact that is a finding, not a tolerance to widen.
    expect(layer.ks.r.k[1].s[0]).toBe(90);
    expect(layer.ks.s.k[1].s).toEqual([200, 50]);
    expect(layer.ks.o.k[1].s[0]).toBe(25);
  });
});

describe("encodeLottie · the opacity asymmetry", () => {
  it("multiplies a group's alpha into its child but does not compose transforms", () => {
    const doc = encodeLottie(
      [circle("scene.g"), circle("scene.g.inner", "scene.g")],
      framesOf([
        snap("scene.g", { alpha: 0.5, x: 10 }),
        snap("scene.g.inner", { alpha: 0.5, x: 3 }),
      ]),
      planFor(1, 30), SCENE,
    );
    const inner = doc.layers.find((l: any) => l.nm === "inner")!;
    // 0.5 * 0.5 = 0.25 -> 25. Lottie parenting does NOT propagate opacity,
    // so without this flattening the child renders at 50% instead of 25%.
    expect(inner.ks.o.k).toBe(25);          // static: one frame, constant
    // The transform is NOT composed: 3, not 13.
    expect(inner.ks.p.k).toEqual([3, 0]);
  });

  it("bakes an invisible object as opacity 0", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c")], [snap("scene.c", { visible: false })]),
      planFor(2, 30), SCENE,
    );
    expect(doc.layers.find((l: any) => l.nm === "c")!.ks.o.k[1].s[0]).toBe(0);
  });
});

describe("encodeLottie · constant-track collapse", () => {
  it("emits a static property for a track that never varies", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 7 })], [snap("scene.c", { x: 7 })]),
      planFor(2, 30), SCENE,
    );
    const p = doc.layers.find((l: any) => l.nm === "c")!.ks.p;
    expect(p.a).toBe(0);
    expect(p.k).toEqual([7, 0]);
  });

  it("emits keyframes for a track that varies by even one frame", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 7 })], [snap("scene.c", { x: 8 })]),
      planFor(2, 30), SCENE,
    );
    const p = doc.layers.find((l: any) => l.nm === "c")!.ks.p;
    expect(p.a).toBe(1);
    expect(p.k.map((kf: any) => kf.t)).toEqual([0, 1]);
  });
});
```

`planFor(frames, fps)` is a helper you write: compile a scene whose duration
yields exactly `frames` frames at `fps` and return `planExport`'s plan. Derive
the duration from `TICK_HZ` rather than hardcoding, and assert
`plan.frameCount === frames` inside the helper so a wrong duration fails loudly
instead of silently producing a different plan.

- [ ] **Step 2: Run and read the RED.** Expect "Cannot find module".

- [ ] **Step 3: Implement.** Envelope per design §6.3: `fr = plan.fps`, `ip = 0`,
  `op = plan.frameCount`, `w`/`h` from `scene`. Background as a solid layer at the
  bottom of the stack. Layers **reversed** relative to IR order (design §6.1).

  **Two things this file must do loudly rather than silently**, following the
  precedent Phase 4 set when it made `pngSequence.ts`'s silent optional call
  throw:
  - a `LayerSpec` id with no matching `ObjectSnapshot` in a frame is an
    invariant violation, not a missing object — **throw**, naming the id and the
    frame index;
  - a `parentId` that names no layer in the array is likewise a **throw**.

  Neither is reachable through `planLottie` + `sampleFrames` today. Say so in the
  report, with the reasoning, rather than adding a test that cannot fail.

- [ ] **Step 4: Run, then mutate — individually**

| # | Mutation | Expected |
|---|---|---|
| 1 | Emit rotation in radians (drop `× 180/π`) | The units test reddens |
| 2 | Emit scale as a multiplier (drop `× 100`) | The units test reddens |
| 3 | Emit opacity 0–1 (drop `× 100`) | The units test reddens |
| 4 | Skip the ancestor product; use the layer's own alpha | The group-alpha test reddens |
| 5 | Treat `visible` as always true | The invisible-object test reddens |
| 6 | Disable the constant-track collapse (always emit keyframes) | The static-property test reddens |
| 7 | Enable it too eagerly (collapse on first-vs-last rather than all frames) | Write a three-frame fixture where frames 0 and 2 match and 1 differs. **If no existing test reddens, that is a gap — close it** |
| 8 | Do not reverse the layer array | **Expect green.** Nothing headless can see draw order. Record this as the §2d decision Task 4 must settle in the browser |
| 9 | Compose the parent transform into the child | The `p.k` assertion in the group test reddens |

Mutations 6, 7 and 8 are the design §8.2 judgment calls. **8 is expected to
leave the suite green**, and that is a finding to carry into Task 4, not a
failure of this task — a headless assertion structurally cannot see which of two
overlapping layers is on top.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/export/lottieEncode.ts src/compiler/export/lottieEncode.test.ts
git commit -m "feat(5a): encode layer specs and snapshots into a Lottie document"
```

- [ ] **Step 6: The headless round trip, on a real scene**

`buildNode` produces `Container`/`Graphics`, which run in plain Node — only
`Text` needs a canvas (`builder.test.ts`'s header comment, and Phase 4's plan
records the same). `compound-logo.marey` declares no text, so the **entire**
compile → plan → build → sample → encode path is headlessly testable for it.
That is coverage PNG structurally could not have, and it is the strongest
regression guard this phase can own.

Create `src/compiler/export/lottieRoundTrip.test.ts`, modelled on how
`frameSampler.test.ts` drives `CANONICAL_SCENES`. Read that file first and reuse
its scene-loading helper rather than writing a second one.

Assert, on `eval/scenes-3b/compound-logo.marey`:
- `planLottie` returns `ok`;
- the emitted document has `fr === plan.fps` and `op === plan.frameCount`;
- one layer per IR object, plus the background solid;
- **the round trip**: `JSON.parse(JSON.stringify(doc))` re-read, and for a
  sampled frame the layer's `p`/`r`/`s`/`o` equal the values computed from the
  corresponding `ObjectSnapshot` **with `===`**, not `toBeCloseTo`;
- the emitted JSON contains neither `"matter"` nor `"marey"` (case-insensitive) —
  exit criterion 1's "no Marey code" half, checkable rather than assertable.

Commit separately.

---

## Task 4: Settle design §11 in the browser

**Tier: Architecture.** Six open questions, three of which produce a file that
parses and plays while being wrong, and all three are invisible to Task 3's
headless assertions.

**Files:**
- Create: `src/lib/devLottieSeam.ts`
- Modify: `src/main.tsx`
- Modify: `package.json` (`lottie-web` devDependency)
- Create: `tools/visual-check/lottie-check.mjs` (first cut; Task 5 extends it)

**Interfaces:**
- Consumes: `planLottie` (Task 2), `encodeLottie` (Task 3), `planExport`,
  `sampleFrames`, `compileSource`, `buildNode`, `SceneRuntime`, `MatterWorld`.
- Produces: `window.__mareyExportLottie(source, opts) => Promise<{ doc: unknown; hash: string; fps: number; frameCount: number }>`

Model `devLottieSeam.ts` **closely** on `src/lib/devExportSeam.ts`, including its
`try`/`finally` shape. That file's `try` opens at `new Application()` and its
`finally` gates on `app.renderer` rather than `app`, both for reasons its own
comments record — a leaked WebGL context on any setup throw, and
`Application.destroy()` dereferencing `this.renderer` with no null check. Copy
the structure and the reasoning; do not re-derive it.

Unlike the PNG seam, this one needs no `extract` call and no renderer output —
but it still needs the `Application` because `SceneRuntime` and the built tree
expect a live Pixi context. Use `autoStart: false` (Global Constraint 5).

- [ ] **Step 1: Install the player**

```bash
npm install --save-dev lottie-web
```

Confirm it resolved and record the exact version in your report. Global
Constraint 11: npm has network here even though `curl` does not.

- [ ] **Step 2: Write the seam and the harness**

The harness loads the dev server, calls `window.__mareyExportLottie`, writes the
JSON to disk, then renders it with lottie-web in the same page and captures
frames with Playwright. Model the Playwright scaffolding on
`tools/visual-check/export-check.mjs` — read it first; it already solves
the dev-server, page-error and capture plumbing.

**Global Constraint 12: `npx vite --port 5199 --strictPort`, and kill it
afterwards with the port confirmed free.**

- [ ] **Step 3: Answer the six questions, one fixture each**

Design §11. For each, write the fixture, run it, **look at the rendered
output**, and record the answer with the evidence.

| # | Question | Fixture that settles it |
|---|---|---|
| 1 | Do array-earlier layers draw above or below later ones? | Two **overlapping** opaque rectangles of different colours. Which colour is on top answers it. A non-overlapping fixture answers nothing — this is the AGENT-LESSONS §2a trap for this task |
| 2 | Does Lottie parenting propagate opacity? | A group at `alpha: 0.5` with a child at `alpha: 0.5`. If the child renders at 25% the flattening is right; at ~12.5% it is double-applied and must be removed |
| 3 | Is the shape list field `shapes`? | Read the schema; then confirm the player draws anything at all |
| 4 | Is the version field `v` (string) or `ver` (integer)? | Emit each and see which lottie-web accepts. Prefer what real bodymovin files carry if they disagree with the document |
| 5 | Is `op` inclusive or exclusive? | A scene whose last frame differs visibly from its first. A duplicated or dropped final frame is the tell |
| 6 | What handle values give linear interpolation? | A two-keyframe linear translation sampled at a **half-frame** time. Omit `i`/`o`, then supply explicit handles, and compare |

**Questions 1, 2 and 5 are the dangerous ones.** Each produces a file that parses
without error and plays without warning, and each is invisible to every headless
assertion in Task 3.

- [ ] **Step 4: Fix whatever §11 falsified, and pin it**

Any answer that contradicts design §11's assumption is a change to Task 3's
output. Make the change, and **add the headless test that would have caught it**
where one is possible. For question 1 no headless test is possible — record that
as the §2f result rather than inventing one.

Amend the design document with a dated correction rather than a silent rewrite,
following the precedent Phase 4 set for its falsified cross-machine hash claim.

- [ ] **Step 5: Commit, and confirm the port is free**

```bash
npx vitest run && npx tsc -b --noEmit && npm run build
netstat -ano | grep ":5199" || echo "port 5199 free"
```

---

## Task 5: Evidence for the three exit criteria

**Tier:** Integration.

**Files:**
- Modify: `tools/visual-check/lottie-check.mjs`
- Create: `eval/RESULTS-PHASE-5A.md`
- Modify: `tools/visual-check/SKILL.md`

- [ ] **Step 1: Criterion 1 — a physics scene in a third-party player**

`compound-logo.marey` is the one canonical scene that genuinely animates, hands
off, and settles under simulation; the other three are static by declaration
(Phase 4's execution notes state this explicitly and it is why that scene was
added). Export it to Lottie, play it in lottie-web, capture frames across the
motion — including after the mark settles — and **read the images**.

Record in `eval/RESULTS-PHASE-5A.md` with the reproducing command.

- [ ] **Step 2: Criterion 2 — measure the pixel tolerance, then write it down**

Capture the same frame indices from lottie-web and from Marey's own PNG export
(`window.__mareyExportPng`, already built). Compare per-pixel.

Report **two numbers**: the maximum per-channel delta, and the share of pixels
exceeding it. **Measure first, then document.** Do not pick a threshold and
assert it — that inverts the evidence.

Expect antialiasing differences at shape edges; expect none in flat interiors. If
interiors differ, that is a real defect, not a tolerance question.

- [ ] **Step 3: Criterion 3 — every refusal is named**

For each `LOTTIE_*` diagnostic, confirm a test exists and that deleting the
branch reddens it. Record the counts.

- [ ] **Step 4: The second renderer — evaluate, then decide**

Design §10 promises an evaluation, not an outcome. Try `@lottiefiles/dotlottie-web`
or ThorVG in the same harness. **If it is genuinely cheap, add it. If it is not,
say so plainly and stop** — that is a valid result (AGENT-LESSONS §2f), and
padding the phase with a half-maintained second harness serves nothing.

- [ ] **Step 5: Commit**

---

## Task 6: Documentation and execution notes

**Tier:** Integration.

- [ ] **Step 1:** `docs/architecture/renderer.md` — the encoder boundary, the
  two-module split and the opacity asymmetry. This is the file every agent
  touching the renderer is ordered to read, and Phase 3C recorded a case where a
  stale line in it briefed two later tasks off a falsehood.
- [ ] **Step 2:** Execution notes appended to this plan, following Phase 4's
  structure: final evidence table with every number **re-derived first-hand on a
  clean tree**, defects found in source, defects found in *this plan*, deliberate
  gaps and deferrals each with what makes it harmless *today*, and mutation
  results each beside the suite size it was measured against.
- [ ] **Step 3:** Both phase-status locations — `docs/architecture/README.md`'s
  "Current phase" line and `roadmap-and-process.md`'s phase bullet — **in the
  same edit** (AGENT-LESSONS §5b: all three transitions before Phase 4 shipped
  stale).
- [ ] **Step 4:** Confirm port 5199 has no `LISTENING` socket and no probe file
  survives; re-quote the suite count from a clean tree.

---

## What is still owed after Task 6

Per AGENT-LESSONS §8, **Phase 5A is not done at Task 6.** Phase 3A passed eleven
task reviews and a whole-branch review and *then* an outside reviewer found four
Important defects. Phase 4's independent review found three Important defects and
twenty Minor ones that nine task reviews had all missed.

Owed:

1. An **independent whole-branch review** by someone with no stake in this
   reasoning. Give it the question and the evidence to check, never the answer
   (AGENT-LESSONS §3).
2. The merge, with **both** phase-status locations updated in the same edit.

---

## Self-review

**Spec coverage.** §1 (subset and refusals) → Tasks 1, 2. §2 (encoder boundary) →
Global Constraint 4, Tasks 2, 3. §3 (Lottie units) → Task 3 Step 4 mutations 1–3.
§4 (geometry and anchor mapping) → Task 2. §5 (opacity asymmetry) → Task 3
Steps 1, 4. §6.1 (layer order) → Task 3 mutation 8 and Task 4 question 1.
§6.2 (background) → Task 3 Step 3. §6.3 (envelope) → Task 3 Step 3, Task 3
Step 6. §7.1 (linear) → Task 4 question 6. §7.2 (constant-track collapse) →
Task 3 mutations 6, 7. §8.1 (worker test) → Task 0. §8.2 (delete-and-run) → every
task's mutation step. §8.3 (two tolerances) → Task 3 Step 6 and Task 5 Step 2.
§8.4 (look at the output) → Tasks 4, 5. §9 (exit criteria) → Task 5. §11 (open
questions) → Task 4. §12 (task shape) → this plan's task list.

**Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N".
Three places deliberately describe rather than show: Task 4's seam (a direct
structural copy of `devExportSeam.ts`, named), Task 4's harness (Playwright glue
whose shape depends on `export-check.mjs`, named), and Task 5's comparison
arithmetic (a threshold that must be *measured* before it can be written, which
is the point). Each names the file to model on. Flagged rather than hidden.

**Type consistency.** `LottieDiagnosticCode`/`LottieDiagnostic`/`LottiePlanResult`
are produced in Task 1 and consumed in Task 2. `LayerSpec`/`LottieShapeSpec` are
produced in Task 2 and consumed in Task 3 as types only. `SamplerPlan` is
consumed unchanged from `exportContract.ts` and is **branded**, so Task 3's tests
must obtain one from `planExport` — stated in Task 3 Step 1 rather than left to be
discovered. `FrameSnapshot`/`ObjectSnapshot` come from `frameSampler.ts`
unchanged and are **not widened** (design §2.3). `planLottie` returns
`layers: []` in Task 1 and real specs in Task 2, so its signature is stable
across both.

**One known risk, stated rather than smoothed over.** Task 3 mutation 8 is
predicted to leave the suite green, and the plan says so in advance. If it
reddens, the prediction was wrong and that is worth reporting — a plan that
only handled the outcome it expected would be the AGENT-LESSONS §3b failure.

**Defects found in this plan before dispatch (3).** Recorded here so the
execution notes can measure against a real starting count rather than pretending
the plan began clean.

1. **Task 1's `line` fixture did not compile** — missing the required
   `position` and `thickness`. A verbatim paste would have thrown inside `irFor`
   and produced a false RED. Found by compiling every fixture.
2. **Task 2's walk would have used the wrong source of order.**
   `Object.keys(ir.registry)` is source order; `ir.children` is layer-sorted.
   The layer-order test would have failed for a reason the task's prose did not
   name, or — worse — passed on a fixture that happened not to distinguish them.
3. **A colour diagnostic was specified that no input can reach.** The plan first
   told the implementer to "establish" whether `IRColor` is always hex and add
   `LOTTIE_UNSUPPORTED_COLOR` if not. Measurement settled it: three-digit hex is
   expanded and named colours are resolved, both upstream of the IR, and an
   unknown name is a PARSE error. The instruction became a finding instead of a
   dead branch (AGENT-LESSONS §2f).

The pattern matches Phase 4's exactly: the plan's **prose requirements** held
up; its **verbatim fixtures**, written against a codebase they had not been run
against, did not. Two of the three were invisible to reading and surfaced only
by execution.

---

## Execution notes

Written 2026-09-16 at the close of Task 6, from `git log`, the six task
reports, the five reviews and two re-reviews, and the SDD ledger
(`.sdd/2026-09-11-phase-5a-baked-lottie/progress.md`) — **not**
from any single task's self-report, per AGENT-LESSONS §1. Every number in
"Final evidence" was re-derived first-hand on a clean tree while writing this.
Mutation rows are drawn from the ledger, each beside the suite size it was
measured against.

**Written by the controller rather than a dispatched implementer**, and the
deviation is named rather than left to be inferred: the Task 6 implementer was
killed by a rate limit having committed nothing, and both the standard and
most-capable model tiers were session-limited at that moment. The work is
documentation whose source material is the ledger the controller authored, and
the independent whole-branch review AGENT-LESSONS §8 requires still follows and
covers it. No check was skipped; only the writing moved.

### Final evidence

| Check | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` | **28 files / 817 tests / exit 0** |
| Typecheck | `npx tsc -b --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0; only the pre-existing >500 kB chunk-size advisory |
| Production build carries no dev seam | `npm run build`, then grep `dist/` for `__mareyExportLottie`, `__mareyExportPng`, `devLottieSeam`, `devExportSeam`, `installLottieSeam` | **zero matches** — both DEV-only seams are dropped by Vite's dead-branch elimination, not merely left ungrepped |
| CLI build | `npm run build:cli` | exit 0, `dist/cli/marey.mjs` 92.15 kB |
| R1 corpus | `npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean** |
| R2 corpus | `EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean** |
| 3B demonstration corpus | `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts` | **4/4 compiled clean** |
| Visual-check fixtures | `EVAL_DIR=tools/visual-check/scenes npx vitest run --config eval/vitest.config.ts` | **22/22 compiled clean** — was 17 at Phase 4's close; this phase added the five `lottie-*.marey` fixtures. Its report JSON was written, inspected, then **deleted rather than committed**, per the Phase 3C and Phase 4 precedent |
| Tree | `git diff --stat`; `git ls-files --others --exclude-standard` | both empty |
| Port 5199 | `netstat -ano`, filtered for a LISTENING socket on a boundary-matched `:5199` | no LISTENING socket |

**The port check must match on a boundary.** A plain `grep ":5199"` also
matches `:51999` and will report a phantom listener from an unrelated ephemeral
socket. The controller's own first check during this phase did exactly that.

**Branch shape, as of `4c5ab4e`**, the commit immediately before this
execution-notes commit (a commit cannot contain its own diffstat, so this is a
snapshot rather than a live count): **28 commits** from merge base `6d8db3d`,
**22 files, +5,646 / −2**.

**Baseline check.** Global Constraint 1 records the suite at the branch base
`6d8db3d` as 24 files / 762 tests, re-derived for this plan on 2026-09-11.
Current `HEAD` is 28 files / 817 tests: **+4 test files, +55 tests** for the
phase. Six source files were added in total — `compiler.worker.test.ts`,
`lottieGeometry.ts` and its test, `lottieEncode.ts` and its test, and
`lottieRoundTrip.test.ts` — of which two are not test files.

### Defects found in this plan, beyond the three its self-review names

The self-review above records three defects found *before* dispatch. Execution
found four more in the plan itself. Recorded as plan defects rather than as
coverage gaps, because that is what they were.

1. **The pre-flight scan found four cross-task conflicts, all ruled on before
   Task 1 was dispatched.** (A) Task 1's `LottiePlanResult` referenced
   `LayerSpec`, which only Task 2 defined — the file could not have
   typechecked, and Global Constraint 3 requires committing from the first
   step. (B) Task 2's `LayerSpec` block contained `readonly background: never;`
   which the next paragraph ordered dropped. (D) `LottieDoc` appeared in
   Task 3's signature and was defined nowhere. (E) Task 0's `PHASE_PREFIX`
   padded to column 9 while the worker's existing seven lines pad to column 10.
2. **Task 0's Mutation 1 was a provable no-op.** The plan asked for the
   `thrown` block and the `firstPhase === "PARSE"` block to be swapped, and
   predicted a red. But `thrown` is *defined* as `errors.length > 0 &&
   firstPhase !== "PARSE" && firstPhase !== "TYPE"`, so the two guards are
   mutually exclusive by construction with nothing executing between them. No
   fixture can observe the swap. The implementer established this structurally
   **and** empirically, then ran a faithful variant (swapping PARSE with TYPE)
   that did redden two tests. A defect in the plan, not a gap in the suite.
3. **Task 3's Mutation 8 prediction was wrong.** The plan predicted the layer
   reversal mutation would leave the suite green, reasoning that nothing
   headless can see draw order. Measured: **2 of 811 red.** The reasoning about
   *rendering* was right; what it missed is that the committed tests pin the
   encoder's own array-order *decision* with direct equality assertions, which
   is observable without a renderer.
4. **Task 4's brief framed six §11 questions as six equal investigations.** Two
   (§11.3, §11.6) had already been settled from primary sources during Task 3,
   and one (§11.4) turned out to be unanswerable by the browser at all — both
   documents rendered byte-identically, because nothing in the supported shape
   subset reaches lottie-web's version-gated branches. That answer came from
   reading the bundled source instead. The plan's table implied a measurement
   the question could not support.

The pattern matches Phase 4's and Phase 3C's: the plan's **prose requirements**
held up; its **verbatim code, and its predictions about outcomes**, did not.

### Defects found in source

1. **Task 0 — `compiler.worker.ts:51` emitted prefixes nothing consumes.**
   `[${err.phase.toLowerCase()}]` produced `[lex]` and `[runtime]`, neither of
   which is among the six prefixes `check.mjs:89` scrapes. Fixed with a
   `PHASE_PREFIX` map padded to column 10, with `[system] ` as the widened
   default. This is the deferred Phase 4 finding the phase inherited —
   `compiler.worker.ts` had no automated test and had been rewritten wholesale
   — and putting it under test first was the plan's opening move for exactly
   this reason.
2. **Task 4 — a falsified claim left in a source docstring.** `lottieEncode.ts`
   asserted lottie-web throws a `TypeError` on missing easing handles.
   Measurement showed no exception is raised at all: the shape silently
   vanishes and the position property is left at lottie-web's own `-999999`
   sentinel. The implementer initially recorded this only in the design
   correction; the review found that inverted the precedent it cited, which
   corrects the source first and the spec last. Fixed in `be23725`.
3. **Task 4 — §11.6's evidence did not support its claim.** A single half-frame
   sample cannot distinguish linear interpolation from any ease symmetric about
   `(0.5, 0.5)`; the reviewer demonstrated a symmetric `(0.42,0)/(0.58,1)` ease
   reading identically at frame 0.5. Re-measured at quarter-frame resolution
   (`x = 10, 35, 60, 85, 110` at frames `0, 0.25, 0.5, 0.75, 1`). The
   conclusion survived; the evidence offered for it did not.
4. **Task 4 — the harness's only document-rejection diagnostic could not
   fire.** `data_failed` is unreachable with inline `animationData`; the
   reviewer demonstrated `--unset op` passing cleanly with zero errors. A guard
   that cannot fire is a Global Constraint 10 violation. Fixed in `e64453f`.
5. **Task 4 — seven locations still described §11 as open** and named Task 4 as
   what would settle it, after Task 4 had settled it. Four in
   `lottieEncode.ts`, three in `lottieEncode.test.ts`.
6. **Task 4 — a mutation that demonstrated nothing.** The version-field
   mutation (`v:` → `ver:`) is also caught by `tsc` (TS2741), since `v` is
   required by `LottieDoc`. The real gap is the *string value*, which is
   type-invisible: `LOTTIE_VERSION = "550502"` leaves `tsc` clean and reddens
   exactly the new test. The test was load-bearing; the stated rationale was
   wrong. **A red mutation table is not evidence that the mutation was the
   right one.**
7. **Task 5 — a false checkable claim in the phase's own evidence document.**
   `eval/RESULTS-PHASE-5A.md` claimed its snapshot hash `26cca4e9` matched
   `eval/RESULTS-GATE-B.md`'s; GATE-B records `b0b119ad`. The number was
   genuine and reproduces live — the *citation* was never checked against the
   document it cited. See "Inherited, still open" for the cause.
8. **Task 5 — a regression check narrower than its framing.** After a ~500-line
   `--renderer` refactor, one of Task 4's six §11 fixtures had been
   re-verified, and the document presented an argument-from-diff as a
   measurement. All six were then re-run; all six reproduced Task 4's recorded
   values exactly.

### Mutation results, each beside its suite size

| Task | Mutation | Suite at the time | Result |
|---|---|---|---|
| 0 | Five individual worker mutations | 770 | Four reddened as predicted; Mutation 1 was a provable no-op (see plan defects), and a faithful variant reddened 2 |
| 1 | Top-level-only geometry scan | 775 | Reddens **1 of 5** — load-bearing, but by exactly one test (the nested-group case) |
| 2 | Child-ordering mutation | 782 | The implementer's first attempt was a **false negative** — it sorted only a nested node's `.children`, not the outer `ir.children` loop, which the top-level fixture could not detect. Self-caught, corrected, re-run for the right red |
| 3 | Nine mutations, re-run from scratch | 811–816 | Eight as predicted; Mutation 8 predicted green, measured **2/811 red** |
| 4 | Version-field string value | 817 (30 in file) | `LOTTIE_VERSION = "550502"`: `tsc` clean, **1 of 30 red**, restored byte-exact |
| 5 | `LOTTIE_UNSUPPORTED_TEXT` branch deleted | 817 (12 in file) | **3 of 12 red** |
| 5 | `LOTTIE_UNSUPPORTED_LINE` branch deleted | 817 (12 in file) | **2 of 12 red** |
| final | `lottieTransformCompose.test.ts` — six mutations, three of them against the production encoder | 818 | All six red — see below |
| final | `lottieGeometry.ts` — group walk stops descending | 818 | **Red** at the layer-list assertion, `['scene.g']` vs the expected four |

**The final round's composed-transform test is where this phase's own
mutation discipline nearly failed one last time.** `lottieTransformCompose
.test.ts` pins that a Lottie player's composed CTM — `T(p)·R(r)·S(s)·T(-a)`
walked up `layer.parent` — equals Pixi's own world transform through a parent
chain with rotation and non-uniform scale. It was written against behaviour
that already passed, so it was green on its first run, which is exactly the
shape of a test that asserts nothing.

The implementer ran the three mutations the brief required, and all three
reddened. But all three were applied to **the test's own decode logic**, not
to `lottieEncode.ts`. The re-review caught that and ran the missing half:

| # | Side | Mutation | Failing layer | Component | lottie vs pixi |
|---|---|---|---|---|---|
| 1 | test | drop `.translate(-ax, -ay)` in `lottieLocal` | `scene.g.r` | `tx` | 132.14101615137756 vs 153.34726442009878 |
| 2 | test | compose without walking `layer.parent` | `scene.g.r` | `a` | 1.4095389311788626 vs 2.3131354903009957 |
| 3 | test | decode `r` without `× π/180` | `scene.g` | `a` | 0.3085028997751611 vs 1.7320508075688774 |
| 4 | **production** | `a: staticVector([0, 0])` — zero the emitted anchor | `scene.g.r` | `tx` | identical to row 1 |
| 5 | **production** | never emit the `parent` field | `scene.g.r` | `a` | identical to row 2 |
| 6 | **production** | `rotations.push(snap.rotation)` — emit radians | `scene.g` | `a` | 1.9999164879860007 vs 1.7320508075688774 |

Rows 4 and 5 land on the same numbers as rows 1 and 2 **by force, not by
luck**: `T(-0,-0)` is the identity, and the decode's `parent === undefined`
branch already computes `composed = local`. So for the anchor and parent-chain
categories, a test-side mutation and a production-side one are the same
experiment. Row 6 is the one that is genuinely new — corrupting the production
conversion emits radians into a field the decode still reads as degrees, a
different wrong number than row 3's, and it reddens. Row 6 was re-run by the
controller first-hand and reproduced to the digit.

The lesson generalises past this test: **mutating a test's own mirror of a
production formula proves the mirror is self-consistent, not that the test
guards the formula.** Whether the two are equivalent is a question to answer
per mutation, not to assume — here two of three were equivalent and one was
not, and only the one that was not carried new information.

The last row of the table above is the same discipline applied to the test's
coverage rather than its arithmetic: the loop iterates whatever `planLottie`
returns, so the file pins the returned layer ids exactly (`scene.g` and its
three children) rather than merely asserting the list is non-empty. A walk
that stopped descending into groups would otherwise have left the test green
while testing no parent chain at all.

Task 3's nine mutations were **re-run from scratch by a replacement
implementer** after a rate limit killed the first one mid-run. The ruling was
that unrecorded evidence is not evidence (AGENT-LESSONS §1): one datum had
survived only inside a test comment, and a sentence in a comment is not a
mutation table.

### Deliberate gaps and deferrals, each with what makes it harmless today

**Still open:**

1. **`compiler.worker.test.ts:117,134,164` — padding is not regression-pinned.**
   The Step-8 assertions use `toMatch(/^\[lexer\] /)`, which matches any
   trailing space count. Column-10 padding ships correctly, but a regression to
   column 9 would pass. *Harmless today:* the consequence is cosmetic
   misalignment in the Terminal pane; the six-prefix scraping contract
   `check.mjs` depends on stays protected, because that regex reads only the
   bracketed prefix.
2. **No test covers a three-level ancestry chain with `visible: false` at the
   MIDDLE ancestor.** Verified still open while writing these notes:
   `lottieEncode.test.ts` covers an object's own `visible` and a two-level
   ancestor case, not a three-level middle one. *Harmless today:*
   `composedOpacity` multiplies over the whole chain and is correct at any
   depth, by hand-trace and by construction. A refactor to "check only the
   immediate parent" would pass silently — that is the risk, and it is a
   coverage gap rather than a live bug.
3. **`hexToRgb01` now has three copies** (`lottieRoundTrip.test.ts`,
   `devLottieSeam.ts`, and the private original in `lottieGeometry.ts`). Filed
   under the scope tie-break as adjacent rather than required. *Harmless
   today:* each copy is three lines of `parseInt` over a fixed-width hex string
   with no branching. *Watch for:* a fourth copy makes this a real
   AGENT-LESSONS §5 hand-synced-list problem.
4. **The encoder writes a group's own alpha onto its null layer *and* the
   composed product onto each descendant.** *Harmless today, and now measured
   twice:* neither lottie-web 5.13.0 nor `@lottiefiles/dotlottie-web`
   propagates opacity through parenting, so a null layer's opacity never
   reaches the child — confirmed at 25.1% and 24.7% respectively, against the
   ~12.5% a double-application would produce. In a renderer that *did*
   propagate, every nested alpha would double-apply. Deliberately not "fixed",
   because this is also the property that makes the opacity fixture
   discriminating: changing it on speculation would have destroyed the evidence
   that settled §11.2.
5. **`package.json`'s `"bin"` key was reformatted onto three lines** by npm's
   own rewrite during `npm install`. *Harmless today:* semantically identical
   JSON.
6. **ThorVG was not tried** as a third renderer. *Harmless today:*
   `@lottiefiles/dotlottie-web` already gave a clean, decisive second-renderer
   result, and design §10 promised an evaluation, not a specific outcome.
   Padding the phase with a half-maintained third harness serves nothing.
7. **dotlottie-web was exercised against two of Task 4's six §11 fixtures**
   (opacity, layer order) plus a regression check, not all six.
8. **Criterion 1's "no Marey/Matter.js reference" check is a grep of the
   emitted `doc.json`**, not a formal schema audit.

**Closed during execution** — recorded because the ledger deferred them, and a
reader of the ledger alone would believe they are still open:

- **`LayerSpec.name` had no test reading it** (deferred at Task 2). Closed by
  Task 3: `lottieEncode.test.ts:388` asserts `["inner", "g", "background"]` for
  the scope-qualified id `scene.g.inner`, so returning the full id would fail.
- **`lottieEncode.ts`'s docstring undercounted the open-question surface**
  (deferred at Task 3). Closed by Task 4's fix round, which removed the
  separately-flagged §11.4 note; the count and the text now agree.

### The process record

This is the section the next phase's plan should read first.

**Seven interruptions.** Five agents were killed by API rate limits (Task 1's
reviewer, Task 3's implementer, Task 3's reviewer, Task 4's implementer,
Task 5's reviewer) and two more were lost to stream stalls (Task 4's reviewer,
Task 4's fix round). Phase 4 had three. **The variable that decided what each
one cost was Global Constraint 3.** Where the agent had committed as it went, a
kill cost minutes. Where it batched commits at the end — Task 4's first pass —
the kill cost that task's entire evidence trail, and its mutation run had to be
redone from scratch. The constraint is now measured twice over rather than
asserted.

**A stalled agent is not a failed agent until you check its output.** Task 4's
reviewer stalled *after* completing its analysis and *before* writing the file,
losing only the write. Resuming it recovered a full review that a fresh
dispatch would have paid for twice. Check for the output file before
re-dispatching.

**Two Global Constraint violations, both disclosed rather than discovered
late.** Task 4's implementer created all three of its commits in a 16-second
burst after the work was finished (Constraint 3) — on the very task whose
predecessor had been lost to a kill mid-work. And a killed agent left a Vite
server bound to port 5199 (Constraint 12), which the controller killed before
trusting any later capture: the **third** occurrence in this repo's history of
the exact condition that constraint exists to prevent, and a direct
confirmation of its own warning that "a killed agent will not clean up after
itself."

**Two forced model downgrades.** Task 3's review and Task 5's review both ran a
tier below what Model Selection calls for, because the capable tier was
session-limited at the moment of dispatch. Both are recorded in the ledger with
the cost named. The Task 5 downgrade cost less than feared: that reviewer
verified *harder* than the controller had, recomputing the pixel diffs from raw
PNGs and proving the edge-only claim by connected-component analysis rather
than by reading a diff image.

**What the reviews actually caught.** Across Tasks 0–5 the task reviews
returned one changes-requested verdict with six Important findings, one
pass-with-findings verdict with two Important, and **no Critical finding at any
point**. The two most valuable findings were of the same family — a fixture or
a mutation that **could not have produced the other answer**. That is the
AGENT-LESSONS §2a trap in two new disguises: once as an image, once as a
mutation the type checker already caught. Neither was visible to the
controller; both were found by a reviewer told specifically to ask whether each
fixture discriminates. **That question is worth putting in every review
dispatch of the next phase.**

### Inherited, still open

**`eval/RESULTS-GATE-B.md` records a snapshot hash that no longer
reproduces.** It carries `b0b119ad` for `compound-logo.marey`; the scene now
produces `26cca4e9`. The cause is a later Phase-4 commit, `f5deb12`, which
added a `visible` field to `ObjectSnapshot` — and `frameHash.ts` digests the
whole JSON, so any field addition necessarily changes every hash. Confirmed
first-hand during Task 5's re-review by reading both the commit and
`frameHash.ts`.

Phase 5A **documented this in `eval/RESULTS-PHASE-5A.md` rather than editing
Phase 4's record**, on the ruling that rewriting a prior phase's results
document is out of scope and would retcon it. It is left open deliberately.
Whoever next touches Gate B's evidence should decide whether GATE-B.md is
re-derived or annotated; it is currently wrong-but-documented in two places
rather than silently wrong in one.
