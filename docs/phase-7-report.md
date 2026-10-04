# Phase 7 report: seed question bank

Branch `claude/compassionate-carson-jcy713`. Everything below was run in this phase on a 4-core x86_64 dev box. Numbers are as measured, including what failed along the way.

## What was built

| Area | Delivered |
|---|---|
| **170 seed questions** in **17 topic stacks** of 10, each **4 easy / 4 moderate / 2 hard** | **Coding (80)**, each in all 8 languages (C, C++, Java, Python, JavaScript, Go, Rust, C#): arrays & hashing, strings, math & number theory, sorting & searching, linked lists / stacks / queues, trees & graphs, dynamic programming, greedy & intervals. **Web (30):** HTML & CSS layout, JavaScript DOM, React. **Data (60):** SQL basics, SQL joins & subqueries, SQL window functions & CTEs (all 30 in **PostgreSQL and MySQL**), MongoDB queries (`find`), MongoDB aggregation, Pandas. The 7 earlier seed questions are part of the bank. |
| **Question generator** (`packages/db/src/seed/bank/`) | A coding question is one TypeScript spec: signature, statement, constraints, a TS reference `solve`, and sample / hidden / stress test generators. A code generator writes the student stub, the hidden driver (input parsing, output printing) and the reference solution for every language. Supported parameter types: `int`, `long`, `double`, `string`, arrays of those, `int[][]`, linked lists and binary trees (LeetCode-style level order). Expected outputs come from the TS reference, and the validator proves that every language's reference agrees with it. Reserved words of all 8 languages are rejected as parameter names. |
| **Every question has** | Two samples with explanations, 10–15 hidden tests (8–15 checks or datasets for web and data), a stress test for moderate and hard coding questions, tags, and starter code. SQL datasets are generated so that at least half the hidden results differ from the samples, so hard-coding the sample answer fails. |
| **Validation in CI** | New job **`seed-bank`**: builds the executor image, runs a structural test (counts, difficulty mix, unique titles, schema and publish rules, 8 templates per coding question, every output ≤ 512 KB, stress tests present, both SQL dialects), then **validates all 170 in the real sandbox** with the same validator teachers' questions use (`pnpm --filter @hbe/api test:bank`). A table of results goes to the job summary. Locally, `BANK_STACKS=sql-joins,pandas` limits the run. |
| **Seeding** | `seed.js` inserts the 170 questions and queues them for validation; each publishes once the executor validates it. Re-running the seed updates questions that are not yet published. |
| **Executor fixes found by the bank** | JIT off for the PostgreSQL sandbox role; least-recently-used eviction of PostgreSQL template databases; SQL / MongoDB runtimes measure the student's statement only (failures 1–3 below). |
| **Docs** | Architecture §15.9 (decision log), deployment notes, README, this report. |

## Exit criterion: 100 % of seed questions pass the validator ✅

Full bank run (`BANK_SLOTS=4 pnpm --filter @hbe/api test:bank`, real executor image, real PostgreSQL 16 / MySQL 8.4 / MongoDB 8.0 runners): **170 / 170 published in 6.6 minutes** (7.7 minutes including starting the containers). The final run used the final executor image, after every fix below.

**In CI** (GitHub's `ubuntu-24.04` runner, job *Seed bank*, run #20 on commit `a2cb6d2`): **170 / 170 pass**; the validation step took about 7.5 minutes. The rest of CI is green on the same commit: lint, typecheck, unit, RLS and API tests, and the sandbox-escape and real-executor suites.

Fresh `docker compose up` + `seed` (the local stack, 2 executor slots): **170 / 170 published 8.2 and 8.5 minutes after seeding** (two fresh runs). The PostgreSQL runner peaked at 375 MiB of its 512 MB limit.

Slowest reference solution per stack, as a share of its time limit (the validator requires ≤ 70 %):

| Stack | Worst | Runtime | Question |
|---|---|---|---|
| Arrays & hashing | 24 % (356 / 1500 ms) | Go | Top K Frequent Values |
| Strings | 7 % (130 / 2000 ms) | Java | Shortest Palindrome by Prepending |
| Math | 10 % (201 / 2000 ms) | Java | GCD of an Array |
| Sorting & searching | 18 % (545 / 3000 ms) | Python | Kth Largest Element |
| Linked lists, stacks & queues | 12 % (242 / 2000 ms) | Java | Largest Rectangle in a Histogram |
| Trees & graphs | 28 % (700 / 2500 ms) | JavaScript | Course Schedule |
| Dynamic programming | 11 % (213 / 2000 ms) | Java | Maximum Subarray Sum |
| Greedy & intervals | 14 % (285 / 2000 ms) | Java | Non-overlapping Intervals |
| HTML & CSS | 7 % (361 / 5000 ms) | Chromium | Accessible Sign-up Form |
| JavaScript DOM | 19 % (959 / 5000 ms) | Chromium | Click Counter |
| React | 9 % (425 / 5000 ms) | Chromium | Counter With a Step Size |
| SQL basics | 2 % (39 / 2000 ms) | MySQL | Delete Duplicate Accounts |
| SQL joins | 1 % (21 / 2000 ms) | PostgreSQL | Best-Selling Product per Category |
| SQL window functions & CTEs | 5 % (148 / 3000 ms) | PostgreSQL | Org Chart Depth and Team Size |
| MongoDB queries | 0.4 % (7 / 2000 ms) | MongoDB | Movies Released in 2015 |
| MongoDB aggregation | 1 % (23 / 2000 ms) | MongoDB | Running Total and Best Day per Store |
| Pandas | 1 % (20 / 3000 ms) | Pandas | Sessions per User |

SQL and MongoDB times are the wall-clock time of the student's statement only (see failure 3). Pandas times are CPU time per dataset, excluding importing pandas, which happens once per run. Times vary between runs by roughly ±20 %.

## Test results (final runs)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/db` | 225 (53 + **172 new**) | The structural bank checks listed above, for each of the 170 questions, plus the unchanged RLS tests |
| `apps/api` | 116 | Unchanged; all pass |
| `apps/api` `test:bank` | 1 (170 questions) | The exit criterion above |
| `apps/api` e2e with the real executor | 13 (rerun on the final image) | Grading in all 8 languages, the web and DB graders (PostgreSQL, MySQL, MongoDB, Pandas) and graded test attempts, after the executor changes |
| Other suites | 24 + 17 + 10 | shared, question-format and executor unit tests: unchanged, all pass |
| `apps/web` Playwright on a **fresh** `docker compose up` + `seed` | 19 | **19 / 19 pass** with the 170-question seed: practice, staff, tests and proctoring, import/export, reports, web and DB flows. Eight specs first failed because they expected every seed question on the first page of the practice list (see failure 8). This run used the executor image from before the runtime-measurement change (failure 3), which changes only reported times. |

Lint and typecheck are clean.

## Failures found along the way, and what changed

1. **PostgreSQL JIT turned a 1 ms query into a time-limit failure.** The recursive-CTE question (*Org Chart Depth and Team Size*) failed validation with a time-limit error on a 5-row sample. Run by hand, the same query took **3.3 s**. With `SET jit = off` it took **1.3 ms**. The planner's cost estimate for small unanalysed tables crosses the JIT threshold, and compiling the plan takes seconds. Students would have seen a time-limit failure on a correct answer. Fix: `ALTER ROLE hbe_sbx SET jit = off` in the executor.
2. **The PostgreSQL runner ran out of memory on a fresh stack.** The first full `docker compose` run published 144 questions, then **26 SQL questions were marked invalid** with `getaddrinfo ENOTFOUND runner-pg`. The runner had been OOM-killed: the executor kept one template database per dataset forever, each costs about 7.5 MB, and the runner's data directory is on tmpfs, which counts against its 512 MB limit. 60 SQL questions have 600 datasets. The bank run in the test harness had not shown this because its runner had no memory limit. This would have hit the pilot's Oracle runner too, after enough distinct SQL datasets. Fixes:
   - Each executor keeps at most `PG_TEMPLATE_CACHE` (default 16) template databases and drops the least recently used. A template is never dropped while it is being copied. If another executor drops a template between lookup and copy, the run rebuilds it once.
   - The compose runners now restart automatically, as the pilot's already did.

   After the fix, a fresh stack published 170 / 170 with the runner peaking at 375 MiB. To stress the eviction path, the 30 SQL questions were re-validated with `PG_TEMPLATE_CACHE=2`, so nearly every dataset evicted a template, with 4 jobs in parallel: **30 / 30 published**.
3. **Reported SQL and MongoDB times included building the dataset.** In the eviction stress run, *Products Bought Together* failed the validator's 70 % rule at 1,417 ms. That time included rebuilding its evicted template; the query itself is fast. Verdicts were never affected, because the time limit is enforced on the student's statement alone (`statement_timeout`, `max_execution_time`, `maxTimeMS`), but the reported runtime and the validator's check were. All three runners (PostgreSQL, MySQL, MongoDB) now time only the student's statement. The rerun passed 30 / 30, and SQL / MongoDB references now report 7–148 ms.
4. **The bank harness leaked about 3 GB of disk per run.** It removed its runner containers without their anonymous data volumes, which filled this box's disk once (the next run's MySQL never became ready). The harness and the other executor e2e tests now remove containers with `-v`. After a full run, no volumes are left.
5. **The SQL stacks' own data:** *Students From Pune* failed the anti-hard-coding check: only 3 of 8 hidden datasets contained anyone from Pune, so most expected results were empty, like a sample's. Generated datasets now always include Pune. *Products Bought Together* had a garbled sample explanation, and its first sample had no qualifying pair, so it was rewritten to have one.
6. **Portability traps avoided by design** rather than found by failing: integer vs decimal division (a "percent of department total" question was replaced by "gap to the department maximum", because MySQL rounds decimal division to 4 extra digits, which changes the second decimal now and then); `change` and `rank` are reserved words in MySQL; MySQL's `ROW_NUMBER()` is unsigned, so `day - ROW_NUMBER()` needs a cast there; `find` cannot sort by a field computed in its projection.
7. Earlier Phase 7 rounds (already pushed):
   - Outputs over 512 KB: stress cases and constraints were shrunk.
   - A duplicate test input in integer square root.
   - `base` is a C# keyword, so parameters were renamed and the reserved-name guard was added.
   - A race in the harness between validation finishing and publishing.
   - Rust and Java closure captures.
   - Several sample explanations that did not match the computed output.
   - An O(n²) TypeScript reference "heap".
   - *Gas Station* claimed a unique answer that was not unique; it now asks for the smallest index.
   - A web hover check that required no CSS transition, now stated in the question.
   - A Kelvin rounding question where `toFixed` and `Math.round` disagree at .x5, now 2 decimals.
9. **CI had been red since Phase 6 for two reasons unrelated to the bank**, both fixed: the API typecheck ran before the API was built, while a Phase 6 test imports its `dist` (it passed locally only because `dist` existed); and the executor job failed at setup because `aquasecurity/trivy-action@0.28.0` no longer resolves (the project's tags are `v`-prefixed now). It is now pinned to the `v0.36.0` commit SHA. With that, the sandbox-escape suite runs in CI again.
8. **Playwright specs assumed every seed question is on the first page of the practice list** (25 per page, now 170 questions): 8 of 19 failed on a fresh stack. The specs now type the title into the search box first; the app already had search and *Load more*. One spec's `login()` also returned before the post-login redirect had finished, so its next `goto` was interrupted. It now waits for the redirect.

## Known gaps and honest caveats

1. The questions were written and checked by me, against generated tests and the validator. They have not been reviewed by a teacher. Statements may need wording or difficulty adjustments after real students use them; difficulty labels are my judgement.
2. Web questions are graded by DOM and computed-style checks, so a visually equivalent solution that uses different elements or class names than the statement asks for can fail. Each statement says what is checked.
3. SQL questions avoid behaviour that differs between PostgreSQL and MySQL. A student answer that depends on such behaviour (for example NULL ordering) can still pass in one dialect and fail in the other. That is correct grading, but it may surprise students.
4. Template eviction is per executor. With several executors sharing one runner, each keeps its own 16, so the runner's memory has to allow for 16 per executor.
5. The bank's timings come from the dev box. Phase 8 measures them on the free-tier ARM executor.

## Sign-ins needed

None for this phase.
