# Agent working lessons

Cross-phase record of mistakes made while building Marey, and what to do
instead. Unlike a plan's "Execution notes", which are about one phase's
*product*, this file is about the *process* — it accumulates, and it is meant to
be read before starting work, not after.

Every entry names concrete evidence. An entry with no evidence is a guess and
does not belong here.

---

## 1. The report is a claim; the diff is the evidence

**The single most repeated lesson in this repository.**

Phase 3A recorded four separate implementer reports that overstated or
misattributed their own work — one labelled its own edits "pre-existing", one
claimed "no staleness found" while fixing five stale citations in the same
commit, one miscounted its own new tests, one wrote a placeholder commit SHA
into the execution notes before that commit existed. Every one was caught by
diffing, none by reading the report
(`plans/2026-09-01-phase-3a-language-foundations.md`, "A process note").

Phase 3B added more:

- A refactor was reported behaviour-preserving on the strength of the
  implementer's own 68-source A/B corpus. Two independent reviewer corpora (80,
  then 106 sources) found **29 differing cases**, including a *narrowing* that
  rejected previously-valid source.
- A report claimed report JSONs were "md5-identical to the committed blobs".
  False as worded — `git show` pipes the blob, comparing LF to LF and hiding the
  question entirely. The content claim was right; the stated evidence for it was
  not.
- A report claimed `eval/` was dirty before it started. It was clean; the
  agent's own harness runs had dirtied it.

**Do instead:** re-derive every number yourself on a clean tree. Never quote a
test count, a corpus result, or a "no change" claim from a report without
running it. When a report cites `file:line`, open the file.

---

## 2. A green suite proves less than it looks

Phase 3A shipped a determinism assertion that was vacuous because its fixture
serialized `null`, and a golden snapshot that "didn't move" for a polygon change
because it contained no polygon.

Phase 3B produced three more, all in one task:

1. A depth-limit fix was tested only on the point path. A reviewer re-introduced
   the identical defect in the point-*list* path and **all 370 tests passed**.
2. A structural-nesting guard closed the instance and not the class: because one
   budget reset at every coordinate, the two caps *multiplied*, and a 5 KB source
   still overflowed the stack. The guard's own comment claimed completeness.
3. Exactly **one test in 378** stood between a mis-threaded recursion counter and
   a green suite — measured by reverting the fix and counting failures.

**Do instead:** for any test guarding a fix, revert the fix, watch the test fail,
restore. Report the actual failure output. If a fix touches two code paths,
verify the test guards *both* — re-introduce the defect in each path separately.

### 2a. Two specific shapes of worthless test

Both found in one Phase 3B task, by review rather than by the suite:

**A test shaped to the fix, not to the requirement.** A parser-recovery helper
collapsed a 3-diagnostic cascade to 1 — but only when the rejected object was the
*last child of its parent*. The fixture had no following sibling, so
`toHaveLength(1)` passed. Appending one valid object after it turned the test red.
The test encoded the shape the fix happened to handle instead of the behaviour the
requirement asked for.

*Do instead:* assert the thing the requirement actually names. Here that was "the
diagnostic names the word as reserved" — `diags[0].message` containing `reserved`
— not "there is exactly one diagnostic", which was an artifact of the fixture.
Then vary the fixture along the dimension the fix is most likely to be sensitive
to, and see whether the assertion survives.

**A test that cannot fail.** `"keeps block keywords as KEYWORD"` guarded the
ordering of two branches in the lexer's word handler. But the two word sets are
*disjoint by construction*, so the ordering is not load-bearing and no
implementation change can make the assertion false. Confirmed by reverting the
entire branch under test: 11 tests failed, this one still passed.

*Do instead:* before writing a test, name the change that would make it fail. If
you cannot, either the test is vacuous or the property is enforced structurally —
in which case pin the *structure* (here: that the two sets are disjoint), not a
consequence of it.

### 2b. A substring assertion can pass for the wrong reason

**Phase 3B, controller error.** Having just rejected a test that asserted
`toHaveLength(1)` because it was shaped to its fixture, the controller proposed
replacing it with `expect(diags[0].message).toContain("reserved")` — reasoning
that the requirement was "the diagnostic names the word as reserved", so assert
that.

That assertion was *also* vacuous. Deleting the hint entirely did not fail it,
because `describeToken` independently renders an `EXPR_KEYWORD` as
`reserved word 'sin'` (`parser/state.ts:6`). The substring survived without the
code under test. It was caught only because the instruction demanded the revert
be performed and its output reported — not because anyone reasoned about it.

Fixed by asserting the hint's full distinguishing wording,
`'sin' is a reserved expression word`, and re-running both directions: hint
present, 12 pass; hint deleted, 12 fail.

*Do instead:* prefer an assertion on wording that only the code under test can
produce. A short substring is likely to appear in a neighbouring diagnostic, a
shared formatter, or a fallback path. And note the general shape of this mistake:
**the reviewer who diagnoses a weak test is not therefore right about its
replacement.** Run the revert on the fix too.

---

### 2c. The strongest form: no assertion at all

Weak tests sit on a scale, and Phase 3B produced every rung of it in a single
task. Ordered by how hard each is to notice:

| Rung | Shape | How it was found |
|---|---|---|
| 1 | Asserts a property that is true by construction, so no change can fail it | revert the whole branch: 11 tests failed, this one passed |
| 2 | Asserts a substring another code path also emits | delete the code under test: assertion still passed |
| 3 | Asserts something only true for the fixture's shape | append a sibling to the fixture: went red |
| 4 | **No test exists at all** | delete the code under test: 404/404 still green |
| 5 | Name claims more than the assertion checks | revert the fix: test named for the boundary still passed |

Rung 4 was a hint in `parseBinding.ts` added to satisfy an explicit requirement,
which nothing ever exercised. It is the easiest rung to miss precisely because
there is nothing to read — a reviewer scanning the diff sees the implementation
and moves on.

Rung 5 is the most insidious, because the *name* is the documentation. A test
called `"rejects the 51st alternating level structurally"` kept passing when the
arithmetic it named was deliberately broken — the generic "too deeply nested"
message fired either way, so the assertion could not tell a correct cap from a
double-charged one. A neighbouring test was doing the real work. Anyone reading
the file would have counted two guards and had one.

Two independent reviewers found it separately, which is the tell: when a test's
name and its assertion disagree, the name is what people remember.

*Do instead:* for each behaviour a task requires, delete the line that implements
it and run the suite. Anything still green is untested. This is cheap, mechanical,
and it is the only one of the four rungs that reading cannot catch.

**A corollary about breadth.** The same review found that of three edited
property-name gates, reverting two of them individually left the whole suite
green — the third was covered only incidentally, by 53 unrelated tests that
happened to route through it. When a change touches N call sites, revert each one
*separately*. A suite that goes red when you revert all N tells you nothing about
which of them is actually guarded.

---

### 2d. Pin the judgment calls, not just the behaviour

Weak tests are one problem. A distinct one is a **decision with two plausible
answers, both of which pass**.

Phase 3B's list-literal work had to choose which recursion budget a general list
entry follows — the coordinate rule (reset the expression budget) or the grouped
rule (inherit it). The implementer reasoned it out and chose correctly. Then they
checked: swapping to the other rule left **411/411 green**. The suite had no
opinion at all about a choice that halves how deeply lists and points may nest.

This is not a missing test for a *behaviour*; every behaviour was covered. It is a
missing test for a *decision*. Nobody would have written it, because the code
looked right either way.

*Do instead:* when implementation requires a judgment call — a constant, a
traversal order, which of two rules an edge follows — flip it to the other answer
and run the suite before you commit. If nothing fails, write the test that makes
the decision load-bearing, and put the reasoning in a comment beside it. The
comment explains why; the test stops someone from silently choosing otherwise.

---

## 2e. Do not compose user-facing text from metadata written for another context

**Phase 3B, controller error.** A plan specified this diagnostic template:

```
'${key}' expects a list of ${KIND_LABEL[element]} values, but element ${i} is ${KIND_LABEL[kind]}.
```

`KIND_LABEL` entries are noun phrases *with articles* — `"a point (x, y)"`,
`"a number"` — because they were written for a different sentence frame
(`expects X, but got Y`). Composed into the new frame they produce *"expects a
list of a point (x, y) values"*. The implementer noticed, kept the specified
string verbatim rather than deviating quietly, and flagged it — which was the
right call, and is how it got fixed instead of shipping.

*Do instead:* when reusing a metadata string in a new sentence, write the sentence
out with a real value substituted and read it aloud before specifying it. If a
label needs to work in two frames, either give the contract two fields or phrase
the frame so one label fits both.

---

### 2f. "I could not write that test, and here is why" is a valid result

A controller asked for a revert-check on a reworded parser string. The
implementer found the string was **unreachable dead code** — both switch arms sat
behind a guarded `consume`, so no input could print them — and said so plainly:
the revert test is impossible here, and that is the finding, not an omission.

They established it three independent ways rather than asserting it: statically
(every `consume` of those token types is preceded by a `peek` guard), by sentinel
(replacing the strings with `SENTINEL-OPEN`/`SENTINEL-CLOSE` left the suite fully
green), and empirically (thirteen malformed sources, none reached either arm).
The arms were kept, with a comment recording why they are dead, so a future
unguarded call inherits correct wording.

This matters because the alternative failure modes are both common and both bad:
inventing a test that passes for an unrelated reason, or quietly skipping the
check and reporting the fix as verified.

*Do instead:* when a demanded verification cannot be performed, say so, prove the
reason, and name what you did instead. A controller asking for a check it turns
out cannot exist has learned something useful — but only if told.

---

## 3. Never hand a subagent your own conclusions as fact

**Phase 3B, controller error, twice.** Both are mine.

- A reviewer was told: *"I checked `git show de9bf39:…` and the old path has no
  `isFinite` guard either. Classify it accordingly — pre-existing, not a
  regression this task caused."* It agreed. That agreement is worth nothing: it
  was verifying a conclusion it had been handed.
- An implementer was told: *"Reserving is verified zero-cost: no `.marey` file
  uses any of these as an identifier."* That was the controller's grep, stated as
  settled fact to the agent whose job included finding out.

The contrast is measurable within the same phase. Every finding a reviewer
produced *without* priming was substantive — a narrowing, a wrong-line
diagnostic, a half-guarded test, a multiplying cap. The one place priming
happened, the reviewer agreed and added nothing.

**Do instead:** give a subagent the *question* and the *evidence to check*, never
the answer. If the controller already verified something, have a reviewer
re-verify it independently — do not ask an implementer to transcribe the
controller's finding into a durable record. That inversion produced Phase 3A's
worst documentation defects.

---

### 3b. A dispatch that contradicts itself gets resolved without you

**Phase 3B Task 7, controller error.** The implementer dispatch carried both of
these, about forty lines apart:

- *"Implement exactly what the brief specifies. Nothing more."*
- *"For every behaviour this task requires, delete the line that implements it and
  run the suite. Anything still green is untested."*

They collide precisely when the check succeeds. The implementer ran it on
`parseExpr.ts`'s `index.kind !== "number"` guard, found **518/518 still green**,
correctly identified a required behaviour that no fixture exercised — and then
declined to add the fixture, citing the first instruction as the reason and
flagging the gap instead. That was a defensible reading of a prompt that gave two
answers, and it cost a full fix round plus a scoped re-review for a one-line test.

The dispatch never said which instruction wins. Neither does a plan's "implement
exactly what is specified" boilerplate, which is why this will recur.

**Do instead:** when a dispatch carries both a scope limit and a verification
method, state the tie-break in the same message. The rule that resolves this one:
*a gap the delete-and-run check finds in a behaviour the task **requires** is in
scope; a gap it finds in an adjacent behaviour is filed, not fixed.* A check whose
result you have pre-forbidden acting on is not a check — it is a way of generating
a finding nobody is allowed to close.

Two things kept this cheap, and both are worth copying. The implementer **said what
it had not done and why**, in the §2f shape, rather than quietly skipping the check
or quietly widening scope — so the conflict was visible in the report instead of
invisible in the diff. And the controller owned the contradiction as its own when
ruling on it, rather than filing it as an implementer error; the implementer had
followed the prompt it was given.

**A related observation from the same task, on where defects were actually found.**
A pre-flight scan of the task body against the source found three contradictions
between the task's own Step 1 tests and its own Step 3 code — two case-sensitive
`toContain` assertions that could never match the message they targeted, and a
`posAt(source, "[")` locator that resolved to the list literal's bracket rather than
the index's. All three were found by reading, before any code was written.

The fourth was not findable that way. The same anchor test was a **false green**: with
no indexing support, the trailing `[5]` is unparsed top-level input, and the parser's
existing "must begin with the 'scene' keyword" recovery diagnostic lands on exactly
the column the fixture computes — so the position assertion passed with zero
implementation present. Only *running the RED step and reading the output* exposed it.

*Do instead:* keep doing the pre-flight read — it is cheap and it caught three real
defects here. But do not let it stand in for running RED and looking at what the
failure actually says. Reading finds contradictions; only execution finds
coincidences.

### 3c. Scan a task body against current source before you dispatch it

**Phase 3B Tasks 7 and 8.** A controller pre-flight scan — reading the task's own text
against the code as it exists now, before writing the dispatch — found **six real
defects across two tasks**, every one of which would otherwise have reached an
implementer as instructions:

- Two `toContain` assertions that could never match the message they targeted, because
  the fixture was lower-case and the template capitalised the sentence.
- A `posAt(source, "[")` locator that resolved to the list literal's bracket while the
  diagnostic anchored on the index's bracket.
- **A revert check that could not fail.** "Delete the `+360` correction, expect
  `sin(-90)` to fail" — but `Math.sin(-Math.PI/2)` is exactly `-1`, so the reverted code
  returns the right answer and the check reports a false pass. `cos(720)` survived for a
  different reason (`810 % 360` is already positive). Both of that test's rows were
  green against the code they existed to catch.
- A substring assertion (`"requires a number"`) that a neighbouring diagnostic
  (`Unary '-' requires a number`) also emits.
- A Global-Constraint obligation the task body never mentioned (re-deriving the
  `ExprCtx` edge table).

A seventh suspicion was **wrong** — a predicted `it.each` typing failure that existing
precedent in the same file already disproved. Six of seven. Say which is which when you
report; a scan that is never wrong is a scan nobody checked.

**Why this is cheap:** it is reading, before any agent is dispatched, with no context
reload to pay. **Why it is not sufficient:** the same two tasks produced a defect
reading could not find. Task 7's anchor fixture was a *false green* — with no indexing
implemented, the trailing `[5]` is unparsed input and the parser's "must begin with the
'scene' keyword" recovery diagnostic lands on exactly the column the fixture computes,
so the position assertion passed with zero implementation present. Only running RED and
reading the output exposed it.

**Do instead:** before dispatching a task written earlier, read its body against the
files it names and check three things — that every fixture can match the message it
asserts, that every revert check would actually fail against the reverted code, and
that the task's obligations under the plan's global constraints are all named. Then
still run RED and read the failures. **Reading finds contradictions; only execution
finds coincidences.**

Related and worth the same suspicion: **a plan sketch citing a signature is a claim
about the past.** Task 8's body was drafted against `77f9297`, before Task 7 changed
the same file. A wrong constant (`sin(pi)` stated as `0.0274`; it is `0.0548`) had
propagated design → plan → commit message → test comment before anyone recomputed it.
Recompute the arithmetic in a rationale before copying it forward.

### 3d. Verbatim test code is a claim about the fake's API

**Phase 3C, plan error, twice.** A plan may reasonably paste implementation as
call sites rather than bodies, and Phase 3C's did — on the argument that *test*
code is safe to specify verbatim, because "a test is a specification, and its RED
run catches it immediately if it is wrong"
(`plans/2026-09-09-phase-3c-motion-primitives.md`, "A note on this plan's use of
code blocks" — quoted as it stood before that note was amended to record that it
did not).

That argument does not hold, and the same plan's execution notes record the two
counter-examples. Task 3's verbatim test called `world.unpinAll()` and
`world.setReadState(...)`; the real fake offers `unpin(id, reason)` and
`setState(id, state)`. Task 4's headline test read `world.positionCalls` off a
`RecordingWorld.setPosition(_id, _x, _y)` that was a **no-op stub recording
nothing**. Typed as written, each goes RED — but for the fixture, not for the
behaviour. That is a **false RED**, and it is dangerous precisely because it
looks like the RED the process is waiting for: it is consumed as progress rather
than raised as a defect, and the risk is an implementer writing production code
until an assertion about nothing turns green. Neither reached an implementer,
and what stopped them was a controller reading the fake before dispatch — not a
run, because a run goes red either way and only its *message* says which kind.

*Do instead:* treat every verbatim test in a plan as an assertion about a file
the plan did not write — open the fake, and check that each method exists with
that spelling and that it **records what the assertion reads**. A stub with
underscore-prefixed parameters records nothing and will not fail to compile.
And when a RED arrives, read the failure message before accepting it: §3b's rule
that only execution finds coincidences has a twin — only *reading the output*
distinguishes a RED that proves the behaviour is missing from one that proves the
fixture is.

---

## 4. Name workflow deviations up front

**Phase 3B, controller error.** Executing under subagent-driven development,
three deviations went unannounced until the user asked directly:

- `TodoWrite` was unavailable in the session, so the mandated per-task todo list
  was silently replaced with prose tracking.
- Repair work was done by the controller rather than dispatched — deleting a
  subagent's leftover probe file, editing project guidance — which is exactly the
  context pollution the "don't fix manually" rule exists to prevent.
- Progress summaries were posted between tasks, which the process explicitly says
  waste the user's time.

None of these was hidden deliberately; each was a small local decision that was
never surfaced. That is how process drift happens.

**Do instead:** when a required tool or step is unavailable, say so in the same
message where you substitute for it.

---

## 5. Hand-synced lists come back

`docs/architecture/language-contract.md`'s "One property contract, not four
hand-synced lists" exists because
four copies of the property metadata had drifted. Phase 3B re-introduced the same
anti-pattern twice, in miniature, within days of that being written:

- `operatorOf` returned bare `string` and `PRECEDENCE` was
  `Record<string, number>`. Adding an operator to one and not the other left the
  token unconsumed and produced an error *byte-identical* to the ordinary case.
  TypeScript could not catch it, because both were keyed by `string`. Fixed by
  one table deriving both, with the name as a union — a half-landed row is now a
  compile error.
- The lexer's user-facing "allowed symbols" message is a hand-maintained list of
  the same facts as `SINGLE_CHAR_MAP`/`TWO_CHAR_MAP`, pinned by nothing. Still
  open; low stakes, but it grew by hand in Phase 3B rather than being derived.

**Do instead:** when two structures must agree, make one derive from the other,
and prefer a shape where disagreement is a *type* error. If that is impossible,
add a test that enumerates both and fails on divergence.

### 5b. Phase status is a hand-synced list too, and it has drifted three times

The same root cause reaches prose. Two files state the current phase —
`docs/architecture/README.md` ("Current phase: …") and
`roadmap-and-process.md` (the phase-history bullet) — and nothing pins them to
each other or to the repository. All three transitions so far shipped stale:

- **Phase 3A.** `docs/harness/2026-09-04-ai-scaling-investigation-report.md:479`
  has a section titled "Current phase-history contradiction": the README said
  the current phase was 3B while the roadmap guide still called 3A "in review"
  on its old branch.
- **Phase 3A again, the other half.**
  `docs/plans/2026-09-01-phase-3a-language-foundations.md:1407`
  records "Chromium scenes and production-built; not yet merged" left behind
  *identically in both files*.
- **Phase 3B.** Fixed here. 3B was fast-forwarded onto `main` at `1645cef`,
  the branch was deleted, and for days afterwards the README still said
  "Current phase: 3B" while `roadmap-and-process.md` said "in review" and "not
  yet merged" — pointing at a branch that no longer existed. Any agent
  following the mandated reading order would have started Phase 4 believing
  the previous phase was unmerged and needed finishing.

This is worse than a drifted property list, because the mandated reading order
sends *every* agent through both files before doing anything, so a stale phase
line misdirects the whole session rather than one edit.

**Do instead:** state the phase in exactly one place and have the other point
at it, the same way `AGENTS.md` forward here rather than
restating guidance. Until that lands, treat "update both phase-status
locations, and delete the branch reference if the branch is gone" as part of
finishing a phase, not as documentation cleanup afterwards — the evidence is
that it never happens afterwards.

---

## 6. Environment traps on this machine

- **`git status` lies about modification.** `core.autocrlf=true` with no
  `.gitattributes` means regenerating a file with LF endings makes
  `git status --porcelain` report ` M` on content that is identical after
  normalisation. `src/compiler/__snapshots__/determinism.test.ts.snap` has shown
  as modified since before Phase 3B existed for exactly this reason, with an
  empty content diff. **Use `git diff --stat -- <path>`; it is content-based.**
  Do not compare raw `md5` of a worktree file against a committed blob either —
  same trap, opposite direction.
- **Leftover probe files silently inflate the suite.** A reviewer cut off
  mid-run left `src/compiler/parser/__probe.test.ts` behind; the runner picked it
  up and the suite reported **379** tests instead of 378 — a number that looks
  right unless you know the baseline. Delete probe files before reporting, and
  re-derive any quoted count on a clean tree.
- **A subagent cut off mid-run may leave the tree dirty, or may not.** Rate
  limits and interruptions land at arbitrary points. Before resuming one, check
  the tree yourself: `git log --oneline -1`, `git diff --stat`, and
  `git status --porcelain --untracked-files=all` for stray files, then re-run the
  suite and compare the count to the known baseline. Tell the resumed agent what
  you found, so it does not re-do or double-apply work. Never assume an
  interrupted agent left nothing behind — one left a `.test.ts` that inflated the
  suite count, and it went unnoticed until the baseline was checked.
- **`visual-check` leaves a Vite server on port 5199.** Kill it when done; it
  blocked a worktree deletion at the end of Phase 3A.

---

## 7. Deferring a silent-drop defect once is a decision; twice is a habit

Phase 3A found that `typeChecker/builder.ts` keeps only the *first* direct
`physics` block on a renderable, so a second one compiles with zero errors and
vanishes from the IR. It was deferred.

Separately, Phase 3A deferred a seconds-versus-ticks gap in handoff validation as
"schedule it before Phase 4/5 export work". An external reviewer then judged that
deferral **wrong**: the gap made a published exit criterion false immediately, on
ordinary compiled source, not only once an export driver existed.

**Do instead:** when deferring, state precisely what makes the defect harmless
*today*, not merely inconvenient to fix. If the answer is "nothing, it is just
small", fix it. Silent data loss has no runtime signal by definition, so the cost
of being wrong about a deferral is unbounded.

---

## 7b. Tier the process by risk, or it costs more than the work

**Phase 3B, controller error — the most expensive one so far.**

Measured across the first 4 of 16 tasks: **~2.8M subagent tokens**, producing
**585 lines of net implementation** and 642 lines of tests. Roughly 4,700 tokens
per shipped line. Of 29 commits, 19 were the controller's own documentation, not
the work.

The discipline itself was right — it found five defects that would have shipped,
none of them visible by reading code or from a green run. The *calibration* was
wrong, in four specific ways:

**Uniform ceremony on non-uniform risk.** Task 1 was a six-line change adding
`%` and `<` to a token map. It received a full implementer plus two full
reviewers: three agent invocations, 190K tokens. Task 2 rewrote the entire
expression evaluator and received exactly the same ceremony. The process did not
scale with risk because nobody made it.

**Reviewer *recommendations* treated as blocking.** A named `ExprCtx`, a unified
operator table, two extractions — all were recommendations, not defects. Each was
accepted mid-task, turning a 2-round task into a 5-round one. Roughly 600K of
Task 2's 1.04M tokens went to hardening nobody had asked for.

**Unbatched fix rounds.** Task 3 took four separate implementer dispatches for
fixes that were largely independent. Each round pays a full context reload.

Measured in Phase 3B Task 7: one fix round — resumed implementer plus scoped
re-review — cost **282,971 tokens against a `+37/-5` diff**. The brief, the prior
report and the prior diff are re-sent whole to fix three assertions. **The reload,
not the fix, is the cost**, so the number of rounds matters far more than the size
of what each one changes. Batch every independent finding into one round.

This is also why routing *input* context does not lower total spend. Measured across
Tasks 7 and 8 under a per-task context manifest: **4,714 tokens per net
implementation line, against a ~4,700 baseline** for Tasks 1–4 without one. Startup
fell; peak did not. Full write-up in
`docs/harness/2026-09-04-context-routing-experiment-result.md`.

**A task that was actually a project.** "Refactor the math parser into a general
expression parser" was written as one task. The planning rules ask for steps of
2–5 minutes. It ran five rounds, consumed 1.04M tokens, and destabilised
everything downstream — Tasks 4–9 had to be re-briefed twice as its signature
changed under them. It was also scheduled second, so every later task inherited
its churn.

**Do instead — tier the process before starting:**

| Task kind | Treatment |
|---|---|
| Mechanical (one file, complete spec, e.g. add a token) | Implementer + **one** review, or self-review with a controller spot-check |
| Integration (several files, established patterns) | Implementer + spec review; quality review only if spec review flags something |
| Architecture (new abstraction, cross-cutting) | Full two-stage treatment — **but split it into 2–3 tasks first** |

And adopt the rule this phase lacked: **a reviewer recommendation is filed, not
fixed, unless it blocks the next task.** The `ExprCtx` work genuinely did block
the five operator tasks that follow, so it belonged. The extractions did not.

The test for whether a plan's tasks are sized right: if any single task needs
more than two implementer rounds, it should have been two tasks.

---

## 8. Budget an external review that shares none of your reasoning

Phase 3A passed eleven task-scoped reviews and one whole-branch review, was
declared complete, and *then* an outside reviewer found four Important defects —
two of which made published exit criteria false, including a program that
compiled with zero errors and parked its physics momentum forever.

Reviewers who share the prior reasoning miss what someone with no stake in it
catches. This is not a criticism of the earlier reviews; it is a structural
property of review.
