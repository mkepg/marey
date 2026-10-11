# The finish line: roadmap section 12, checked

Checked on 2026-10-11 on branch `phase-8` at `14cf66d` plus the version bump and
documentation edits of the commit that carries this file. Each of the six items
in `docs/specs/2026-09-09-marey-engineering-roadmap-design.md` section 12 has a
command or a file below, run on that tree, with its output. Where an item rests
on an earlier phase's evidence file the file is cited and its command was run
again; numbers that differ from the cited file are said so.

Phase 8's own evidence is `eval/RESULTS-PHASE-8.md`. Section 12 says the project
may be declared finished when Phases 3C through 8 are done. Phase 3C to 7 are
merged on `main`; Phase 8 is on `phase-8` and not merged at the time of this
file, so this file records that the finish line holds on the Phase 8 tree and
does not record a merge.

## 1. A finite `.marey` scene, including one with physics, compiles deterministically

```
npx vitest run src/compiler/determinism.test.ts
node bin/marey.mjs check --export-ready src/examples/physics-pile.marey src/examples/ledges.marey eval/scenes-3b/*.marey
```

`determinism.test.ts`: 6 tests pass (the file that holds the determinism
snapshot; `docs/determinism.md` states what it claims). `check --export-ready`:
`ok` for `physics-pile` and `ledges` (both with physics), and for the four
canonical scenes. Every tracked scene compiles: `node bin/marey.mjs check
$(git ls-files '*.marey')` is `ok` on all 86 files, exit 0.

Determinism of the simulation through to frames is the same hash on two runs of
every format, which item 4 shows.

## 2. It exports to PNG frames, to a Lottie artifact and to video, through one sampler

```
npm run check:export
```

`matrix: all passed (140.6 s)`: 21 of 21 `ok` cases, four canonical scenes in png,
apng, webm, mp4 and lottie, plus the refused-font case. Phase 8's example
exported in the same five formats (`eval/RESULTS-PHASE-8.md`, E4).

One sampler: `sampleFrames` in `src/compiler/renderer/frameSampler.ts` is the only
place frames are sampled, and the export modules that use it are
`src/compiler/export/rasterExport.ts` (png, apng, video) and
`src/compiler/export/lottieEncode.ts` (lottie). `grep -rln "sampleFrames" src
--include=*.ts --exclude=*.test.ts` lists those two beside `frameSampler.ts`,
`exportContract.ts`, `videoPipeline.ts`, `playback.ts` (the preview's
seek) and the dev seam `devVideoSeam.ts`.

## 3. The Lottie artifact plays in a third-party player with no Marey code present

Rests on `eval/RESULTS-PHASE-5A.md` (criterion 1). Its command, with
`--compare-png`, was run again (Vite on 5199, stopped afterwards):

```
node tools/visual-check/lottie-check.mjs --scene eval/scenes-3b/compound-logo.marey --fps 30 --frames 0,48,75,180,239 --compare-png --out .visual-check/phase8/final/lottie-logo
```

Exit 0; 0 page errors, 0 console errors, 0 lottie-web `error` events. The Lottie
export and the PNG export both report `fps 30, frameCount 240`, hash `efc1a9f7`.
That hash is not the `26cca4e9` in `RESULTS-PHASE-5A.md`: Phase 7 added the
`color` field to every snapshot, which moves every simulation hash (see
"Frame hashes" in `eval/RESULTS-PHASE-7.md`). Lottie against PNG: 559 to 569
mismatching pixels of 480,000 (0.12%) per frame, maxDelta 71 to 83, edge pixels
only. The same check passes on Phase 8's `ledges` example
(`eval/RESULTS-PHASE-8.md`, E4).

**No Marey or Matter code in the document.** The Phase 5A grep was run again:
`grep -io "marey\|matter" .visual-check/phase8/final/lottie-logo/doc.json` prints
one match, `Marey scene`, the composition name (`"nm"`) that
`src/compiler/export/lottiePipeline.ts` writes. Phase 5A reported no output; the
name was added in Phase 5C (`8ea988e`). It is a label, not code or a runtime
reference, and the document contains no `matter` or script. The player used is
lottie-web with no Marey code loaded.

## 4. Repeated exports are identical, verified rather than asserted

```
npm run check:export
node bin/marey.mjs export src/examples/ledges.marey --format apng --fps 30 --out <path>   # twice
```

The matrix exports each canonical scene twice per format, each in its own
browser, and gates on equal `hash` and, for png, apng, webm and lottie, equal
SHA-256 of the output. MP4 bytes are reported and not gated (R47, WebCodecs'
H.264); in this run `timeline-ticks mp4` printed `sha256 differs:
780d3c19406ef693 vs 2e2beedf3e31f209` and its frame hash matched, as
`eval/RESULTS-PHASE-6.md` says it would. The 21 of 21 count above is the verdict.

The same twice-over was run on the Phase 8 example in all five formats: output
SHA-256 identical in png, apng, webm and lottie, MP4 differing and hash `0ec0752e`
identical in all five (`eval/RESULTS-PHASE-8.md`, E4). The mutation of the
exporters is in `eval/RESULTS-GATE-B.md`.

## 5. The language expresses staggered reveal, baseline-anchored growth and phase offset without workarounds

Rests on Phase 3C's exit criteria 1 to 3 (`docs/plans/2026-09-09-phase-3c-motion-primitives.md`,
"Exit criteria, each with the evidence that settles it"), whose fixtures are
tracked. Re-run:

```
node bin/marey.mjs check tools/visual-check/scenes/bars-reveal.marey tools/visual-check/scenes/wave-row.marey
grep -c 'sequence {|parallel {|delay:|origin:' tools/visual-check/scenes/bars-reveal.marey   # and by pattern, one at a time
npx vitest run src/compiler/renderer/playback.test.ts
```

Both scenes `ok`. `bars-reveal.marey` (staggered reveal, bars growing from a
baseline): `sequence {` 0, `parallel {` 0, `delay:` 1, `origin:` 2. `wave-row.marey`
(one shared `duration`, phase set by `delay`): `sequence {` 0, `parallel {` 0,
`delay:` 1. These counts are the same quantities Phase 3C measured (sequence and
parallel 1 to 0 on `bars-reveal`). `playback.test.ts`, which compares both to the
sampler: 36 of 36 pass. The README's own media, `docs/media/bars-reveal.png`, is exported from the
tracked `docs/media/bars-reveal.marey` (the command is beside it in the README).

## 6. The project is installable, licensed, and explains itself to a reader

```
npm run build:package && npm run check:pack
```

`check:pack: all passed`: the package packs (57 files), installs from the
tarball into an empty project, `npx marey --version` prints `0.5.0`, `marey
check` and `marey export --format lottie` run on the installed copy, a
consumer imports `marey-lang` and typechecks under `esnext/bundler` and
`nodenext/nodenext` with 0 errors, and the library bundle contains no pixi.
`package.json` names the package `marey-lang`, version `0.5.0`, licence `MIT`;
`LICENSE` is the MIT text, and the playground build generates
`third-party-licenses.txt` (README, "License"). The README states what Marey is
and what is hard about it; the ten-minute read of that README closed Phase 6's
criterion 2 by the owner's ruling of 2026-10-07 (`eval/RESULTS-PHASE-6.md`, "Exit
criterion 2": one read by a language model, no human read). That ruling is
unchanged and not re-run here.

Version 0.4.0 was published on npm on 2026-10-10. The version checked above is
0.5.0; it was published on 2026-10-11 without its library and export page (see
`eval/RESULTS-PHASE-8.md`, E6) and is superseded by 0.5.1, which carries the
same tree and passes `check:pack`.

## What this does not show

- Whether a person can state what Marey is within ten minutes (item 6): the
  evidence is a language-model read and the owner's ruling, as Phase 6 records.
- 0.5.1 is not yet published; that is the owner's step.

## After this file

The independent whole-branch review that spec E5 requires ran after this file
was written. It returned three issues, each fixed before the merge: a
`lockRotation` body kept a spin a sibling block in the same `parallel` had
already started (`13b0fa1`); the `bounds` value completion of spec section 6 was
missing (`e36e006`); and `docs/architecture/renderer.md` was stale (`212fe3c`).
Phase 8 was merged into `main` on 2026-10-11 (`2caf55c`), which declares the
finish line.
