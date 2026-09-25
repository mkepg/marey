# Shared agent guidance

This directory is the single source of project guidance for every coding agent
working in this repository.

## Required reading order

1. Read this document in full before doing any work.
2. Read `docs/engineering-lessons.md` in full before doing any work.
3. Before changing a subsystem, read every applicable topic document from the
   directory map below.
4. Before starting a roadmap phase, read the prior phase's execution notes and
   the authoritative specs identified in `roadmap-and-process.md`.
5. For browser-visible behavior, read
   `tools/visual-check/README.md` before running a visual check. The
   procedure and scripts there are tool-neutral.

Do not rely on an agent-specific forwarding file as the source of project
truth. Update the documents in this directory.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build — typecheck is part of the build
npm test             # vitest run (single pass)
npm run test:watch   # vitest watch

npx tsc -b --noEmit                          # typecheck alone
npx vitest run src/compiler/renderer/clock.test.ts       # one file
npx vitest run -t "advances two ticks"                   # one test by name
```

The test suite is headless by design and **cannot see a canvas**. For anything
that needs one — does a scene actually render, does the ticker stop, does a
scene replay identically across a page reload — follow the browser procedure in
`tools/visual-check/README.md`.

```bash
npx playwright install chromium            # once, if you have not already
npx vite --port 5199 --strictPort          # leave this running
node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/pile.marey \
  --at 300,1500,4000 --settle 9000 --out .visual-check/pile
node tools/visual-check/smoke.mjs # if captures come back blank
```

Use `--strictPort`: without it Vite walks forward to the next free port when
5199 is taken, while `check.mjs` still defaults to 5199. A stale server from an
earlier run then absorbs every capture and the check reports a confident pass
without exercising your code at all. That has happened twice. The check itself
found a determinism bug the whole headless suite missed, and that README records
two traps worth knowing before writing any browser check of your own.

TypeScript is strict with `noUnusedLocals`, `noUnusedParameters`, and
`verbatimModuleSyntax` (type-only imports need the `type` keyword).

## What this is

Marey is a declarative scene DSL that compiles to a PixiJS scene graph, with
a browser IDE (Monaco editor, live preview, terminal) around it. You write a
`scene { ... }` block of shapes with `animate`, `physics`, and `sequence`
blocks; it renders and plays.

The project is being taken in a **motion-graphics** direction — a small,
readable, diffable text format for 2D motion — rather than a game/simulation
direction. That decision shapes what gets built and what gets cut. See
`docs/specs/` before proposing physics or animation features.

**Marey has never been released publicly. There are no external users and no
third-party `.marey` files anywhere.** Every `.marey` file that exists is
first-party and lives in this repository — the default scene, the language
reference's examples, the `eval/` corpora, and the visual-check fixtures.
So *backward compatibility is not a design constraint*: a breaking syntax
change costs a migration of first-party files and nothing else, and "this
would break shipped scenes" is not an argument against a language change.
Weigh proposals on which language is better to live with once distribution
starts (roadmap Phase 5B), not on what is cheapest to migrate to. This is
also why Phase 3A landed `let`/`handoff`/`fit`/`layer` with no compatibility
aliases rather than a deprecation window — see roadmap decision R1.

## Architecture and directory map

`lex → parse → typeCheck → buildIR → render`. Entry point is
`src/compiler/index.ts`, but compilation actually runs in
`src/compiler/compiler.worker.ts` (a Web Worker) so the editor stays
responsive. The worker returns the Scene IR as a JSON string; the main thread
parses it and hands it to the renderer.

`src/compiler/sceneIR.ts` is the contract between compiler and renderer.
Everything is `readonly` and frozen. Durations here are in **seconds**. It
also owns `TICK_HZ` and `secondsToTicks` — its first behavioural (function)
export, not just types — so the type checker and the renderer share exactly
one seconds-to-ticks conversion instead of the type checker reaching
backwards into `renderer/clock.ts`, which now just re-exports both.

- **`src/compiler/lexer/`, `parser/`, `typeChecker/`, and
  `determinism.test.ts`** — read `parser-and-metaprogramming.md`.
- **`src/compiler/renderer/`, `sceneIR.ts`, and renderer-related validation** —
  read `renderer.md`.
- **`src/compiler/languageContract.ts` and its compiler/editor consumers** —
  read `language-contract.md`.
- **`src/lib/share.ts`** — read `share-links.md`.
- **`docs/` and `docs/LANGUAGE.md`** — read
  `roadmap-and-process.md`.

When a change crosses boundaries, read all matching documents. These files are
the only home for this guidance — there is no agent-specific copy. A
path-scoped `scoped rule files` split was tried in `b59d70a` and reverted in
`4c70781`: it gave one client lazy loading that others have no equivalent for, so the
two agents ended up reading different guidance. One set everyone reads beats a
smaller one only some agents get.

## Process

`docs/engineering-lessons.md` is the cross-phase record of *process*
mistakes and the patterns behind them. **Read it before starting work.** It
accumulates, every entry cites concrete evidence, and it exists because the
same few mistakes keep recurring: reports that overstate their own work,
green suites that guard less than they appear to, hand-synced lists growing
back, and `git status` misreporting modification on this machine because
`core.autocrlf` is on with no `.gitattributes`. Add to it when you make a
mistake worth someone else avoiding.

The authoritative roadmap is
`docs/specs/2026-09-09-marey-engineering-roadmap-design.md`.
It replaced the adoption-oriented roadmap on 2026-09-09: Marey now optimises
for a **complete, provable engineering artifact with a declarable finish
line**, and acquisition work moved past that line. Read its §1 before
proposing anything the old roadmap justified by adoption.

Current phase: **5C — Lottie completion and video quality, next** (added by
the project owner on 2026-09-24). It covers:
- Lottie `line` and `text`;
- a Lottie export button;
- fixes for the video quality the 5B smoke test reported.
Start from `docs/research/2026-09-24-export-quality-findings-and-options.md`,
and from the Phase 5B plan's execution notes.
**5B — video is done and merged** (WebM and MP4 via WebCodecs and mediabunny;
evidence in `eval/RESULTS-PHASE-5B.md`). Its last four changes came after the
independent review: the default scene, the licences file, the export-teardown
fix, and docs. `roadmap-and-process.md`'s 5B bullet says so.
**5A — baked Lottie is done and merged.** It
emits a bounded Lottie subset (static circle/rectangle/polygon/group geometry;
baked position, rotation, scale and alpha; fixed duration and frame rate;
`text` refused outright per R17) that plays with no Marey or Matter.js code at
playback.
**Read `docs/plans/2026-09-11-phase-5a-baked-lottie.md`'s execution
notes before Phase 5B**: they record four defects execution found in the plan
itself beyond the three its self-review names, the two review findings that
matter most (a fixture and a mutation that each **could not have produced the
other answer** — the §2a trap in two new disguises), and the phase's process
record of seven interruptions, which is the strongest evidence yet for
committing as you go. The encoder boundary and the opacity asymmetry are
documented in `renderer.md`; design §11's two dated corrections record what was
measured in a real player and what an earlier draft overclaimed.
**4 — composition and export foundation is done
and merged**, fast-forwarded onto `main` with no merge commit; its last commit
is `2e72ef7`. The independent whole-branch review AGENT-LESSONS §8 requires
found three Important defects and twenty Minor findings — consistent with
every phase that has had one so far — a single fix wave addressed all of them,
and the scoped re-review of that wave passed with no finding left open.
Its execution notes record two of the plan's own claims
that execution measured false, the ten fixture defects implementers found by
verifying its code blocks rather than pasting them, and the deferred findings
Phase 5A inherited — the first of which was that `compiler.worker.ts` had
no automated test and was rewritten wholesale in that phase. **Phase 5A closed
that one**; one Phase 4 finding remains open, recorded under "Inherited, still
open" in 5A's notes.
**3C — motion primitives is done and merged** (`delay` on
`animate`, `origin` on shapes, and a zero-`scale` rule scoped to the objects
that take part in physics), and its independent whole-branch review is
complete. **Read
`docs/plans/2026-09-09-phase-3c-motion-primitives.md`'s execution
notes before starting Phase 5B** — export bakes whatever the language can
express, and 3C's notes record which of its guarantees are pinned by tests and
which rest on an unreachability argument. Phase 3B is **done and merged**. Full
phase history and prior decisions (D1–D18, R1) are in
`roadmap-and-process.md`, whose Phase 5A bullet must be updated in the same
edit as this line.

Work on a branch, not `main`.
