# Phase 6 report: reports and exports

Branch `claude/compassionate-carson-jcy713`. Everything below was run in this phase on a 4-core x86_64 dev box. Numbers are as measured, including what failed along the way.

## What was built

| Area | Delivered |
|---|---|
| **Institution dashboard** (`/reports`, admins, teachers and associates) | People and content counts, active students (7 / 30 days), 30-day charts of submissions and active students, recent tests with their averages, and **questions to review**: flagged *too easy* (> 90% solved) or *too hard* (< 10%) once 30 or more students have tried them. |
| **Test report** (`/reports/test`) | Started / finished / auto-submitted / terminated counts, score mean, median, range and std. dev., a score-distribution chart (10 bands), time taken, proctoring violations, a per-question table (attempted, average score, full-marks rate, average submissions, flags), and a sortable per-student table (rank, score, minutes, violations, highest similarity, score per question). **Export CSV / Excel** (audited) and **Print / PDF** through the browser's print view. Linked from the tests list and the live monitor. |
| **Code similarity check** | A teacher starts a check per test. Students' best graded answers are compared per question by **winnowing** (MOSS-style fingerprints over normalised tokens; renamed variables, comments and spacing do not hide a copy; starter code is ignored; containment catches a copy pasted into a longer file). The check runs in a worker thread and takes seconds. Pairs at ≥ 75% are listed, and **Compare** shows both programs side by side with the matching lines highlighted. The UI says it is a reason to look, not proof. Coding and web questions only. |
| **Question, student and batch reports** | Question: attempts, solve rate, acceptance, by language, verdicts, 30-day chart, tests that use it. Student: tests with scores and violations, practice solved by difficulty, topics, recent questions. Batch: a students × tests grid with averages, plus CSV / Excel export. |
| **My progress** (students) | The student's own tests, practice and topics. A test score is shown only when the test releases results and the attempt is finished; violation counts are never shown to students. |
| **Platform page** (super admin) | Institutions with 30-day activity, daily totals (runs, submits, internal errors, guest runs), queue depth and the oldest waiting job, stuck jobs, live executors and their runtimes, and a **Rebuild report rollups** button. |
| **Rollups** | Seven small tables, updated on every graded submission and **rebuilt from raw data once a day** (and on demand). A test checks that the incremental values equal a full rebuild. Days are counted in `REPORT_TIMEZONE` (default Asia/Kolkata). |
| **Charts** | One reusable SVG bar chart: one brand colour, bars at most 24 px wide with a rounded top and a 2 px gap, light axes with whole-number ticks, a tooltip on every bar, a **Show data** table under every chart, and dark-mode colours. |
| **Docs** | Architecture §15.8 (decision log), threat model §5d (R1–R7), deployment notes (settings, rebuild, smoke-test step 7, how to re-run the latency test), README, OpenAPI (13 new operations; Redocly: valid). |

## Exit criterion: dashboards < 200 ms p95 on seeded data ✅

`pnpm --filter @hbe/api test:perf` seeds one institution with **2,203 students, 66 questions, 22,000 test attempts and 330,000 submissions** (seed 12.9 s + 1.3 s; rollup rebuild 6.7 s). It then calls every report endpoint 50 times in-process (Fastify inject, real Postgres and RLS, warm cache) and fails if any p95 is 200 ms or more.

| Endpoint | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|
| Institution overview | 50.1 | **69.7** | 91 |
| Test report (1,000 students, 481 KB JSON) | 48.5 | **62.3** | 67 |
| Question report | 15.1 | **24.1** | 25 |
| Student report (staff) | 19.0 | **27.2** | 32 |
| Student report (self) | 19.7 | **28.3** | 36 |
| Batch report | 16.2 | **24.1** | 32 |
| Platform dashboard | 7.9 | **12.2** | 16 |

**First measurement failed:** the overview took **226.3 ms p95** (p50 194.8) and the platform page 140.5 ms. Both counted distinct active students and per-question solvers by scanning the rollups at request time. I added three more rollups (`rpt_user_activity`, `rpt_question_totals`, `rpt_tenant_daily.active_users`), maintained incrementally and by the rebuild, and extended the incremental = rebuild test to cover them. That gave the numbers above. These numbers come from a dev box with the database on the same machine. On the pilot (Render free → Supabase Singapore) each request adds a network round trip per query, so expect them to be higher. Phase 8 load-tests the deployed stack.

## Test results (final runs)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/db` | 53 (46 + **7 new**) | Rollups and similarity results inherit the tenant; staff of the institution read them and other institutions read nothing; a student reads only their own progress rows and nothing institution-wide; platform totals are super-admin only; only system code writes rollups and results; teachers (not associates or students) queue checks, and only for their own institution |
| `apps/api` | 114 (99 + **15 new**) | Practice and test activity counted incrementally **equals a full rebuild** (all 7 rollups). Test report: scores, ranks, distribution and per-question results. Staff-only, and other institutions get 404. CSV and Excel exports: **a student named `=HYPERLINK(…)` is neutralised** in CSV, and every export is audited. **Similarity: the disguised copy is flagged (≥ 90%) and the independent solution is not**. Associates and students cannot start a check (403), another institution gets 404, the compare view returns both programs with line ranges, and each student's highest similarity appears in the test report. Question, student, batch and institution reports. A student sees only their own report, and scores of tests that hide results stay hidden. Too-easy / too-hard flags at 30+ students. The platform view is super-admin only. Tokenizer and winnowing unit tests (renaming, comments, spacing, starter code, containment, web files). |
| `apps/api` latency (`test:perf`) | 1 (new) | The exit criterion above |
| Other suites | 24 + 17 + 3 + 10 | shared, question-format, web-runtime and executor unit tests: unchanged, all pass |
| `apps/web` Playwright on a **fresh** `docker compose up` + `seed` | 19 (18 + **1 new**) | Two students answer a test with the same program, one disguised, and the real executor grades both. The teacher opens Reports: the chart tooltip works. In the test report, both students show 100 / 100. **CSV export downloads with a BOM and both students; Excel export downloads.** **Run similarity check → 1 pair → Compare shows the highlighted lines.** The similarity column is filled. The student sees the test with its score under *My progress*, and staff reports are refused for them. All Phase 2–5 flows still pass, with no CSP violations or page errors. |
| `apps/api` e2e with the real executor | 13 (rerun) | Grading in all 8 languages, web and DB graders, attempts graded by the sandbox: all pass with the new grading hook |

Lint and typecheck are clean. Dark mode, the charts and the compare view were checked by eye in screenshots.

## Failures found along the way, and what changed

- **The exit criterion failed on the first measurement** (226 ms p95). See above.
- **The similarity check missed a disguised copy** in its first unit test. `values` was in a keyword list shared by code and SQL, so a variable named `values` stayed a keyword in one program and became an identifier in the other. Code and SQL now have separate keyword sets, and common identifier-like words were removed.
- **The test report returned 500** (`getTime is not a function`): raw SQL through Drizzle returns timestamps as strings. Fixed with a converter, and covered by the report tests.
- **Parallel DB test files failed with "tuple concurrently updated"** when two files changed the app role's settings at the same moment. Role setup now retries.
- Perf seed script: a data-modifying CTE's rows were invisible to the following UPDATE, and an `integer` overflowed while generating ids. Both were fixed in the test script.
- **The first fresh-volume browser run had 6 failures, none in Phase 6 code:**
  1. The local Mongo runner thrashed at its 512 MB memory limit. Each `mongosh` health check uses about 150 MB inside the same limit as `mongod` and its in-memory data, so it never became healthy, and the machine sat at load 12 on 4 cores.
  2. On that overloaded machine the Go reference solution of *Sum of an Array* hit the compile timeout, so the seed question was marked invalid and every spec that uses it failed.
  3. My Docker build command also skipped the API image (it is built by the `migrate` service).

  Fixes: `docker-compose.yml` now gives the Mongo runner 768 MB (it became healthy in 9 s), the API image was rebuilt properly, and everything was rerun on a fresh volume. The Oracle VM runs this container without a health check, so 512 MB stays there.
- **The new browser spec could not create a second student**: institution admins must enrol MFA before they can manage users. The seed now creates a second demo student, `student2@demo.edu` (same password as the others), which is also handy for trying the similarity check.
- The charts first drew ticks at 0.5 and 1.5 for counts. Ticks are now whole numbers, and score bands are labelled in %.

## Known gaps and honest caveats

1. **Staff reports cover the whole institution.** There is no staff ↔ batch/test assignment yet, so every teacher and associate of an institution sees all of its reports, as with the Phase 4 monitor. Tell me if institutions need "my batches only".
2. **Similarity is evidence, not proof.** Short or very standard solutions (for example a one-line `sum(a)`) are too small to fingerprint and are skipped (fewer than 10 fingerprints). Students who all type the textbook answer can look alike. SQL answers are not checked. By default only answers within one test are compared; the institution-wide option adds the institution's other tests. Answers are never compared against the internet or other institutions.
3. **PDF is the browser's print view**, not a server-generated file.
4. Exports are built in the request. That is fine for the pilot's class sizes (a 1,000-student test report is 481 KB of JSON). Institution-wide multi-year exports would need a background job.
5. Rollups can be off by one in a rare race (two first-solves of the same question at the same instant). The daily rebuild corrects it.
6. The platform page is not covered by a browser test: the super admin needs a TOTP code whose secret the earlier admin spec created. The API test covers the endpoint and its access rules.
7. Latency was measured in-process on a dev box, not over the network on the free-tier stack (Phase 8).

## Follow-up after review

Both changes agreed in review were made before Phase 7, plus one bug fix:

1. **Exports are for institution admins and teachers only.** Associates still see every report on screen, but the export buttons are hidden and the API returns 403 (tested for test and batch exports).
2. **Similarity across tests.** Next to *Run similarity check* a teacher can choose *Also other tests with the same questions*. This test's answers are then also compared with every graded answer to the same questions in the institution's other tests. Pairs show which test each answer came from ("in Section A test"), and the compare view names both tests. Answers from other tests are compared only with this test's answers, never with each other, and a student is never paired with their own earlier answer. Tested: a winnowing unit test, an API test (section B copies a section-A answer → 4 expected pairs, and no self-pairs or A–A pairs), and the browser spec.

3. **Executor cold start (bug found while re-testing).** After the dev box rebooted, the seed question's Go and C# reference solutions hit the 20 s compile limit again, this time with no Mongo trouble (even C needed 6.9 s; the 5 GB toolchain image was cold on disk and eight compilers started at once). A freshly booted executor VM would show students false *Compilation timed out* errors the same way. Two changes:
   - The executor now **compiles and runs a tiny program in each language, one at a time, before it claims any job** (about 5 s in total; logged as `warm-up ok`).
   - A compile that runs out of wall time while using less than half of it in CPU (starved by the machine, not by the code) is **retried once** before it is reported as a compile error.

   After the fix, a fresh start validated all 7 seed questions on the first try, and 19/19 browser tests passed. Caveat: dropping the page cache inside this sandbox did not make the toolchains cold again, so the exact cold-boot case was not reproduced a second time, and the retry path is not covered by an automated test.

## Sign-ins needed

None for this phase.
