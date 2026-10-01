# Phase 3 report — web and DB question engines

Branch `claude/compassionate-carson-jcy713`. Everything below was run in this phase. Numbers are as measured, including what failed along the way.

## What was built

| Area | Delivered |
|---|---|
| **Question formats** (`packages/shared`) | Three question types behind one discriminated `QuestionInput`. **Web**: HTML/CSS/JS or React; starter and reference files; 2 sample + 8–15 hidden **checks** in a declarative DSL (`exists`, `text`, `attribute`, computed `style`, ARIA `role`, five `a11y` rules, and `interaction` steps → assertion, with an optional viewport for responsive checks). **DB**: PostgreSQL, MySQL, MongoDB and Pandas (any subset), query or DML mode, 2 sample + 8–15 hidden datasets (shared SQL setup with per-dialect overrides, Mongo EJSON, Pandas CSV tables), and comparison rules (row order, column-name matching, float tolerance, ignore Mongo `_id`). |
| **Preview** (`packages/web-runtime`, `apps/web`) | One builder turns the student's files into a single self-contained document. CSS and JS are inlined. React files are transformed with Sucrase and linked by a tiny module loader, with React 18 inlined. **The same code builds the browser preview and the graded page.** The preview runs in a sandboxed frame with an opaque origin and a CSP that allows no network at all. |
| **Web grader** (`apps/executor`) | Headless Chromium **inside the nsjail sandbox** (no network interface, uid 65534, cgroup limits), driven over a pipe. Each check gets a fresh browser context. Styles are read through the DevTools protocol and accessibility through the AX tree, so page scripts cannot fake them. Hidden checks return pass/fail only. |
| **DB runners** | PostgreSQL 16: a fresh database per run from a per-dataset template, as a no-privilege role, inside a read-only transaction (query mode); killed at the deadline. MySQL 8.4: a per-run schema and per-run user with grants on that schema only; `local_infile` off, `secure_file_priv` NULL; `KILL` at the deadline. MongoDB 8.0: JSON queries only, with an operator denylist and `--noscripting`, a per-run user with `read` on its own database. Pandas 2.1: a fixed harness in the normal Python jail. Results are row-capped and compared outside the jail. |
| **Validation** | Web: the reference must pass every check and **the starter must fail at least one hidden check**. DB: the reference output **becomes** the expected result, so authors never type expected tables. All dialects must agree, and at least half of the hidden datasets must differ from the sample answers (anti-hard-coding). References for every type must stay within 70% of the time limit. |
| **API** | Store, version, validate and dispatch all three types. Per-type submission checks (framework/dialect allowed, file-set schema, size caps). Results carry the check title, explanation, and actual vs expected tables, **for visible tests only**. Migration `0004` adds the spec columns and freezes the test cases of published versions. |
| **Web UI** | Solve pages per type. **Web**: file tabs, Monaco with one model per file, add/delete files, live preview with desktop/tablet/mobile widths, check results. **DB**: database picker, schema panel, expected-output tables for the samples, and "your result" vs "expected" tables. **Authoring**: web checks as validated JSON with templates; starter/reference file editors with preview; DB datasets with per-dialect setups and CSV tables; starters and reference solutions per database. The practice list and question bank show the type. |
| **Seeds** | *Responsive Profile Card* (HTML/CSS, 12 hidden checks incl. a 375 px layout), *To-do List with Vanilla JavaScript* (11 interaction checks), *React Shopping Cart* (10), *Top Earner per Department* (PostgreSQL + MySQL, 10 hidden datasets up to 500 rows, ties and NULLs), *Paid Order Totals by Customer* (MongoDB, 9), *Monthly Revenue by Region* (Pandas, 8, up to 1,000 rows). Hidden datasets are generated with a fixed seed, so they are reproducible. |
| **Ops** | Runner containers in `docker-compose.yml` (internal network, no published ports, tmpfs data, memory caps). Oracle VM steps in `docs/deployment.md`. CI builds `web-runtime` and runs the new suites. Compose host ports are configurable. |

## Test results (final runs, all passing)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/shared` | 24 | result comparison (order, column rules, float tolerance, numeric strings, NULLs), Mongo guard, web/DB publish rules, question union rejects mixed payloads |
| `packages/web-runtime` | 3 | HTML inlining, multi-file React build, JSX errors name the file |
| `packages/db` | 27 | unchanged from Phase 2 (RLS, tenant isolation, hidden data) plus migration 0004 |
| `apps/api` | 52 | 42 from Phase 2 + **10 web/DB**: type spoofing rejected; the reference must pass and the starter must fail; dialect disagreement and hard-codable datasets invalidate; a slow reference fails the 70% rule; students get starter files, sample titles and sample expected tables only; hidden results are verdict-only |
| `apps/executor` unit | 10 | unchanged |
| `apps/executor` sandbox — languages + escape | 44 | Phase 2 suite, rerun on the Phase 3 image |
| `apps/executor` sandbox — web | 9 | all check kinds incl. responsive and interactions; explanations only on visible checks; **page scripts patching `getComputedStyle`, `textContent`, `getAttribute`, `querySelectorAll` still fail**; **no network**: fetch, XHR, image, beacon, WebSocket, WebRTC and navigation give 0 hits on a listener the executor itself can reach (1 hit, positive control); a step on a missing element fails in ~1.5 s with a reason (not a 5 s timeout); infinite loop → TLE; nothing persists between jobs |
| `apps/executor` sandbox — DB | 30 | per dialect: AC/WA with safe reasons, DML state compare, single statement and read-only, sleep → TLE in < 10 s, huge results capped; PostgreSQL: `COPY TO PROGRAM`, `pg_read_file`, `pg_authid`, `lo_import`, `CREATE EXTENSION`, `SET ROLE`, `CREATE TABLE`, `dblink` all denied, and a run sees only its own database; MySQL: `LOAD_FILE` NULL, `mysql.user` denied, only its own schema visible; Mongo: `$where`/`$out`/`$function` rejected, `system.users` unreachable; Pandas: network blocked, `/etc/shadow` absent, loops → TLE |
| `apps/api` e2e, real executor + real runners | 6 + 5 | all 6 seeds validate and publish; references score 100 in every dialect; starters fail with explanations on sample checks only; wrong SQL shows both tables; Mongo `$where` rejected; Pandas type error → RE; **no reference-only line or hidden check title appears in any student response**; latency (below). The 5 Phase 2 coding e2e tests were rerun on the Phase 3 image: all 8 languages validate (incl. 200k stress tests) and grade as before |
| `apps/web` Playwright, against `docker compose up` + `seed` on a fresh volume (the README path) | 12 | the 7 Phase 2 flows still pass, plus 5 new ones: **React app built in the browser with a live, interactive preview**, then Run/Submit → Accepted 100%, and the draft survives a reload; **preview isolation probed from inside the frame** (origin `null`; `parent.document`, cookies and `localStorage` throw `SecurityError`; fetch to the API and to the app is refused; `top` navigation blocked); SQL in PostgreSQL and MySQL with actual vs expected tables, and `DELETE` refused; Pandas Accepted; Mongo `$where` rejected; teacher opens the web/DB editors. **No CSP violations or page errors in the app.** All 7 seeds published 60 s after `seed`. |

**Failures found along the way, and what they were:**
- The MySQL timeout gave WA, not TLE: `max_execution_time` interrupts `SLEEP()` by making it return 1, with no error. The runner now decides TLE from the deadline itself.
- An executor that started before its DB runners never offered DB jobs, and a failed first PostgreSQL connection was cached forever. Both are fixed: runners are re-probed every 10 s, and a failed init is retried.
- The validator's 70% time-headroom rule had been applied to coding questions only (web/DB results carry no CPU time). It now uses wall time for them. Measured on the seeds: references use at most 349 ms of 5,000 ms (web) and 171 ms of 2,000 ms (DB).
- Web starters took ~5.1 s **per failing interaction check**: a step on a missing element waited out the whole check budget and then showed "infinite loop?". On a half-finished to-do page, that is about a minute holding one of two executor slots. Steps now wait at most 1.5 s and report `could not click "#add" (not found, hidden or disabled)`. Measured: the slowest failing starter check went from 5,136 ms to 1,726 ms, and all 6 seeds still validate.
- The re-probe fix was checked on the compose stack: with MySQL stopped, the executor started without `db:mysql`; 30 s after MySQL came back, it logged `runtime now available … MySQL 8.4.11` and took MySQL jobs again, without a restart.
- An `<iframe srcdoc>` preview would inherit the app's hash-only CSP and block every student script. The preview moved to its own frame page (architecture §15.5).
- UI regression caught by the Phase 2 Playwright spec: read-only viewers could not switch editor tabs (the tabs had moved inside a disabled `<fieldset>`). Fixed.
- Test bugs fixed, not product bugs: `LIKE 'run_%'` also matched `runner_admin`; two leak-check heuristics; keyboard input into Monaco mangled multi-line JSX/Python (the new specs set the editor model, as a paste would); the Playwright guard counted CSP refusals that the sandbox test provokes on purpose.

## Measured latency (single user, no load, 4-core x86_64 dev box)

POST → final verdict through the real API, executor and runners. 5 runs per row (p50 / p95, ms):

| | Run (2 sample checks/datasets) p50 / p95 | Submit (all tests), one run |
|---|---|---|
| Web, HTML (profile card) | 510 / 556 | 2,226 (14 checks) |
| Web, React (cart) | 574 / 582 | 3,301 (12 checks) |
| PostgreSQL | 242 / 246 | 1,018 (12 datasets) |
| MySQL | 192 / 240 | 860 (12) |
| MongoDB | 161 / 166 | 581 (11) |
| Pandas | 503 / 518 | 582 (10) |

Coding questions on the same image (Phase 2 test, rerun): run p95 234 ms (C) to 879 ms (C#), submit p95 377 ms (C) to 1,178 ms (Java), within ~10% of the Phase 2 figures.

Web submits take 2–3 s because every check gets a fresh browser context and page load, for isolation. That is the price of check independence. It can be tuned later (share one context for checks that do not interact). Not measured yet: the ARM VM, the India → Singapore hop, and any load (Phase 8).

## Known gaps and honest caveats

1. **ARM64 is still unverified**, now including Chromium headless shell, `mysql:8.4` and `mongo:8.0` on Oracle A1. Run the sandbox suite on the VM before the pilot (deployment §4).
2. **Render header precedence is unverified.** The preview frame needs `/preview/*` to send `SAMEORIGIN` instead of the site-wide `DENY`. The rules are in `render.yaml`, and the post-deploy `curl -I` check is in deployment §5. The local server is verified.
3. Chromium's own sandbox is off inside nsjail (nsjail is the boundary, as for all code). On AWS, gVisor adds a second layer.
4. Web checks have no Jest/RTL unit-test option, and a11y is five fixed rules, not axe-core.
5. DML questions are PostgreSQL/MySQL only, with one state query per question. T-SQL is postponed (your decision).
6. The preview runs student code in the student's own browser, as intended. It cannot reach the app or the network, but it can freeze its own tab with an infinite loop. Reloading the page fixes that.
7. **This last grader fix (1.5 s step wait) was verified on a patched image**: the dev box ran out of disk for a clean rebuild, so the compiled `dist/` was copied into the previous image (only `grader.js` differs from the last clean build). The web sandbox suite (9/9) and the web/DB e2e (6/6) passed on it. The first clean build from the Dockerfile with this change will be CI's.
8. Bulk upload of web/DB questions is Phase 5. The authoring UI is functional, but it edits checks as JSON.
