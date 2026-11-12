# Phase 9B results: the GitHub Action

Measured on 2026-11-12 on branch `phase-9b-action`, head `3f528ab`, from the
pull-request run on https://github.com/mkepg/marey/pull/2. The run data came
from `gh api` and `gh run download`; the local export ran on the development
machine (Windows 11) at the same commit; the embed check drove headless
Chromium (playwright-core 1.62.1). Nothing here is a claim beyond what those
commands printed.

Design: `docs/specs/2026-11-12-marey-phase-9b-github-action-design.md`
(evidence items in section 4.3, criteria in section 6).

## 1. The run

Workflow "Action" (`.github/workflows/action.yml`), run
https://github.com/mkepg/marey/actions/runs/43244229157, event `pull_request`,
conclusion `success`.

| Job | ID | Conclusion | Time |
|---|---|---|---|
| the starter checks and exports | 131272460118 | success | 38 s |
| a broken scene fails with an annotation and exports nothing | 131272460386 | success | 46 s |

The second job succeeds because its asserted failure happened: its action step
failed (`continue-on-error`), and the job's final step asserted that no export
directory existed afterwards.

Workflow "CI" on the same PR head: run 43244229571, `success`.

An earlier push of `1e6a3ff` produced run 43243633070, which GitHub rejected as
an invalid workflow file (0 s, no jobs). A plain YAML scalar in the sed step
contained `: `, which YAML reads as a mapping key. `3f528ab` moved that step's
text into a block scalar. That is why the starter job's first real run is
43244229157.

## 2. The annotation

Command: `gh api repos/mkepg/marey/check-runs/131272460386/annotations`.

| Field | Value |
|---|---|
| path | `examples/starter/hello.marey` |
| start_line, end_line | 6, 6 |
| start_column, end_column | 15, 15 |
| level | failure |
| title | `marey check` |
| message | `In the scene: Undefined variable 'missing'. Bare names cannot be used as values unless they are declared with 'let'. Variables defined inside 'generate' blocks are strictly block-scoped and cannot be accessed outside of them.` |

The workflow's comment says the injected error sits at line 6, column 15. The
annotation matches.

The same check run carried other annotations that are not from the scene: the
runner's notices (see "Observed issues"), and `Process completed with exit code
1.` from the failing composite step.

## 3. The artifact and the cross-OS comparison

The `starter` job's log, on `ubuntu-latest`:

```
wrote hello.png   60 frames @ 30 fps  640x360  416883 B  sha256 b1a3078c5587bf5a1fdf1c160764cc95c9fac6992769f1fcef46a4cdb02cd775  frames 4f102241
wrote hello.json  60 frames @ 30 fps  640x360  10141 B   sha256 ee8781e51ed74e35009778d3d8a5b0f91824034b6e648b50fd070bbfad8b064f  frames 4f102241
```

The artifact `starter-export`, downloaded with `gh run download`, holds
`examples/starter/hello.png` (416883 B) and `examples/starter/hello.json`
(10141 B); the source path is mirrored. The sha256 of the downloaded files
equals the log lines: `hello.png` `b1a3078c...cd775`, `hello.json`
`ee8781e5...8b064f`.

The local export on the development machine (Windows 11, same commit
`3f528ab`), `marey export examples/starter/hello.marey --format apng|lottie`,
printed:

```
wrote hello.png   60 frames @ 30 fps  640x360  416883 B  sha256 b1a3078c5587bf5a1fdf1c160764cc95c9fac6992769f1fcef46a4cdb02cd775  frames 4f102241
wrote hello.json  60 frames @ 30 fps  640x360  10141 B   sha256 ee8781e51ed74e35009778d3d8a5b0f91824034b6e648b50fd070bbfad8b064f  frames 4f102241
```

Result: the `frames` hash (`4f102241`) is equal, and the bytes and sha256 are
equal for both formats, across Linux CI and Windows. This is measured for this
scene (`examples/starter/hello.marey`) and these two formats only.

APNG chunk walk of the downloaded `hello.png`: `acTL` `num_frames` 60,
`num_plays` 0 (loops forever), and 60 `fcTL` chunks. The scene runs 2 s at
30 fps, which is 60 frames.

## 4. Embed with no runtime

Page (zero `<script>` elements):

```html
<!doctype html><meta charset="utf-8"><title>embed</title><img id="s" src="artifact/examples/starter/hello.png" alt="hello">
```

Opened in headless Chromium: the image reported `complete`, with
`naturalWidth` x `naturalHeight` of 640x360. Four element screenshots taken at
0, 400, 800 and 1200 ms had four distinct hashes (`56cd678e97e1`,
`0d7f7f973753`, `e600ce11fea1`, `6f91d8437680`), so the image animates with no
script on the page.

## Exit criteria

| Spec section 6 criterion | Evidence |
|---|---|
| 1. Reporter unit tests, text output unchanged | Passed at `801b111` |
| 2. `action/run.test.ts` | Passed, 14 tests |
| 3. Four repository checks, `check:pack` 127 files | At `3f528ab`, CI run 43244229571 (`success`) passed the main suite, the build, every first-party scene's check, and `check:pack` (version 0.7.0, 127 files). CI does not run the eval suite. |
| 4. Both jobs `success` | Section 1: run 43244229157 (both jobs success). Section 5: run 43253771354 at `be690d4` (all four jobs success) |
| 5. Annotation at the injected line and column | Section 2: `examples/starter/hello.marey`, line 6, column 15 |
| 6. `frames` hash match and frame count | Section 3: `4f102241` on both OSes; `num_frames` 60 = 2 s x 30 fps; bytes also equal |
| 7. Results file, README section, status lines | This file; the README section from `1e6a3ff`; status lines in `docs/architecture/README.md` and `docs/architecture/roadmap-and-process.md` |

## Observed issues

- On the first run, the runner annotated the check run with a Node 20
  deprecation warning for `actions/checkout@v4` and `actions/setup-node@v4`, and
  with an `ubuntu-latest` label migration notice. Neither failed a job. Section
  5 records the run after every `actions/*` reference moved to `@v7`.
- The first push was rejected as an invalid workflow file (section 1). It was a
  YAML defect, fixed in `3f528ab`.

## 5. Re-verification after the review fixes

The review fixes changed several things:
- the Gate C workflow: a `pack` job, starter and broken-scene jobs with no
  setup-node of their own, a new `old-node` job, and a chunk-walking APNG
  assertion;
- the action: it now checks at `--fps 30`, writes an annotation for a check
  that fails without one, drives its conditions from the parsed formats, and
  separates an unpublished version from other `npm view` failures;
- every `actions/*` reference, which moved from `@v4` to `@v7`.

Gate C was measured again on the same PR at `be690d4`.

- Run https://github.com/mkepg/marey/actions/runs/43253771354, workflow
  "Action", conclusion `success`. All four jobs succeeded:
  - `pack` (131306387281);
  - `starter` (131306670203);
  - `broken-scene` (131306670159);
  - `old-node` (131306670215).
- CI run 43253771632, on the same head: `success`.
- **The annotation.** `broken-scene`'s annotation is again on
  `examples/starter/hello.marey`, at line 6, column 15, with the title
  `marey check`. The job now also asserts the outputs: `checked` 1 and `errors`
  1, plus one recorded annotation at that position.
- **The artifact.** `starter-export` downloaded with the same hashes as section
  3:
  - `hello.png` sha256 `b1a3078c…cd775`;
  - `hello.json` sha256 `ee8781e5…8b064f`.

  The CI log's `wrote` lines carry `frames 4f102241` for both files.
- **The action's own Node setup.** In `old-node`, the runner starts on Node 20,
  and the action's own `actions/setup-node@v7` step ran and succeeded,
  installing 22.23.4 from the tool cache. In `starter`, that step was
  `skipped`, because `ubuntu-latest` already provides Node 22.23.4.

  So the default runner never needs the step, and `old-node` is the job that
  exercises it.
- **Annotations.** No job carries a Node 20 deprecation warning any more. Each
  job's only remaining notice is the `ubuntu-latest` label migration notice.
