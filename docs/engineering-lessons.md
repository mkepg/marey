# Agent working lessons

Cross-phase record of mistakes made while building Declare, and what to do
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
- An implementer was told: *"Reserving is verified zero-cost: no `.declare` file
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

## 4. Name workflow deviations up front

**Phase 3B, controller error.** Executing under subagent-driven development,
three deviations went unannounced until the user asked directly:

- `TodoWrite` was unavailable in the session, so the mandated per-task todo list
  was silently replaced with prose tracking.
- Repair work was done by the controller rather than dispatched — deleting a
  subagent's leftover probe file, editing project guidance — which is exactly the
  context pollution the skill's "don't fix manually" rule exists to prevent.
- Progress summaries were posted between tasks, which the skill explicitly says
  waste the user's time.

None of these was hidden deliberately; each was a small local decision that was
never surfaced. That is how process drift happens.

**Do instead:** when a required tool or step is unavailable, say so in the same
message where you substitute for it.

---

## 5. Hand-synced lists come back

`AGENTS.md`'s "One property contract, not four hand-synced lists" exists because
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

## 8. Budget an external review that shares none of your reasoning

Phase 3A passed eleven task-scoped reviews and one whole-branch review, was
declared complete, and *then* an outside reviewer found four Important defects —
two of which made published exit criteria false, including a program that
compiled with zero errors and parked its physics momentum forever.

Reviewers who share the prior reasoning miss what someone with no stake in it
catches. This is not a criticism of the earlier reviews; it is a structural
property of review.
