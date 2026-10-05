# Phase 8 report: deployment, load testing, hardening

Branch `claude/compassionate-carson-jcy713`. Everything below was run in this phase on a 4-core x86_64 dev box with 16 GB of RAM. Numbers are as measured, including what failed along the way.

## What was built

| Area | Delivered |
|---|---|
| **Docker hardening** | API and web images on **distroless** (no shell, no package manager, uid 65532, app files owned by root): API 413 → 291 MB, web 362 → 240 MB. **Every base image pinned by digest** (`scripts/refresh-image-digests.sh` re-pins them). **Read-only root filesystems** for API, web, migrate/seed and the executor (job directories on tmpfs); `cap_drop: ALL`, `no-new-privileges`, memory and PID limits; the executor healthcheck is now a heartbeat (unhealthy if the agent has not reached the API for 3 minutes). Wider `.dockerignore`. |
| **Load test** | `loadtest/exam.js` (k6): a class sitting a proctored coding test — sign-in, attempt start, WebSocket, heartbeats, proctoring events, draft saves, Run, and the end-of-test Submit burst — plus a teacher on the live monitor. `loadtest/docker-compose.pilot.yml` reproduces the pilot's resources on one box (API capped at Render free's 0.1 CPU / 512 MB, Postgres on its own core, executor + DB runners on 2 cores like the Oracle A1 VM). `loadtest/run.sh` runs a series and keeps every result; `summarize.mjs` makes the tables below. |
| **Performance fixes** (found by the load test) | API startup 3.5 min → ~45 s on 0.1 CPU; CPU per graded submission and per request cut; overload answered with a retryable 503 instead of 500. Details in [Failures](#failures-found-along-the-way-and-what-changed). |
| **Terraform** | `infra/terraform/oci-executor` (the pilot executor on Oracle Always Free: VCN with no inbound ports, A1 VM, cloud-init running the install script) and `infra/terraform/aws` (the §16 target: network, Aurora Serverless v2 + ElastiCache + S3, ECS Fargate API behind ALB + WAF, executor Auto Scaling group, CloudFront + WAF for the web app, CloudWatch alarms). Both pass `terraform validate`; neither has been applied to a real account. |
| **Deployment tooling** | `deploy/oci/install-executor.sh`: idempotent install/update of the executor + DB runners on a fresh Ubuntu VM (used by Terraform and the manual runbook; builds the image or pulls a prebuilt one). `.github/workflows/images.yml`: multi-arch (amd64 + arm64, each built natively) API/web/executor images on GHCR. |
| **Security review** | The Phase 1 checklist re-checked with evidence ([threat model §6](./threat-model.md#6-security-checklist-gate-for-each-phase)): 15 of 17 items met, 2 partially (Argon2 timing on 0.1 CPU; private networking on the free pilot hosts). Fixes listed below. New threat table §5e (H1–H10). |
| **Backups** | `.github/workflows/backup.yml`: nightly `pg_dump`, **restored into a fresh Postgres in the same job** (fails if it cannot be restored), encrypted with age before upload (the repository is public). Dormant until the one-time setup in the runbooks. |
| **CI** | New jobs: Terraform (fmt + validate), API/web image build + Trivy (fails on fixable HIGH/CRITICAL), sandbox escape suite on **ARM64**, dependency audit; Dependabot for npm, Actions and Terraform. |
| **Docs** | [Runbooks](./runbooks.md) (before a session, deploy, roll back, rotate secrets, backups and restore, incidents), deployment guide updated (install script, DB CA certificate), architecture §15.10, threat model §5e + checklist, README quick start with prebuilt images, load-test README. |

## Load test results

**Setup.** The whole pilot on one box with the pilot's resource limits (see `loadtest/docker-compose.pilot.yml`). Each step is a 6-minute proctored test: sign-ins spread over 60 s; per student a heartbeat every 15 s, proctoring events every 5 s (30 % of the time), a draft save every 8–12 s, a Run every ~75 s, and a final graded Submit in the last minute (all students within ~45 s); answers rotate between Python, C++ and Java; one teacher refreshes the live monitor every 10 s. Not included: network latency (add ~60–120 ms per request from India to Singapore), ARM64, noisy neighbours on free hosts.

### The pilot as deployed (API on 0.1 CPU = Render free), final code, verdicts over SSE like the browser

| Students | heartbeat p50 / p95 | draft save p95 | Run → verdict p50 / p95 | **Submit → verdict** p50 / p95 (end-of-test burst) | sign-in p95 | HTTP errors | verdicts correct |
|---|---|---|---|---|---|---|---|
| 10 | 13 ms / 586 ms | 511 ms | 0.6 s / 1.5 s | **3.1 s / 3.8 s** | 1.2 s | 0 % | 100 % |
| 20 | 14 ms / 1.1 s | 1.3 s | 0.6 s / 1.7 s | **12.1 s / 15.9 s** | 1.2 s | 0 % | 100 % |
| 40 | 182 ms / 2.9 s | 2.7 s | 0.9 s / 3.7 s | **50.0 s / 72.7 s** | 2.2 s | 0 % | 100 % |

Source: `loadtest/results/c-optimized-sse-api0.1/` (p50 values from `k6-N.txt`).

Peak CPU: API at its 0.1-CPU cap in every step; Postgres ≤ 26 % of a core; executor ≤ 188 % of 2 cores. Memory: API ≤ 231 MiB of 512 MiB.

**Reading it:** 10 students is comfortable. **20 students works** (no errors, every verdict right) but the final grade of the end-of-test burst takes 12–16 s to appear and occasional requests take 1–2.5 s. 40 students still completes without errors, but the burst takes about a minute. During the burst the 0.1-CPU API is the bottleneck, not the executor.

### What the cheapest paid API buys (0.5 CPU = Render Starter), same scenario

| Students | heartbeat p50 / p95 | draft save p95 | Run → verdict p50 / p95 | **Submit → verdict** p50 / p95 (end-of-test burst) | sign-in p95 | HTTP errors | verdicts correct |
|---|---|---|---|---|---|---|---|
| 20 | 14 ms / 42 ms | 46 ms | 0.4 s / 1.1 s | **1.1 s / 2.8 s** | 203 ms | 0 % | 100 % |
| 40 | 12 ms / 38 ms | 54 ms | 0.4 s / 1.1 s | **1.7 s / 4.4 s** | 190 ms | 0 % | 100 % |
| 80 | 15 ms / 81 ms | 96 ms | 0.5 s / 1.7 s | **25.7 s / 39.3 s** | 189 ms | 0 % | 100 % |

Source: `loadtest/results/d-optimized-sse-api0.5/`. Peak CPU: API ≤ 43 % (of its 50 %), Postgres ≤ 41 %, executor 182–184 % of 2 cores in every step. API startup: 19 s from `up`.

**Reading it:** with 0.5 CPU the API stops being the limit. Up to 40 students everything stays under ~100 ms at p95 and the final grade arrives within 5 s. At 80 students the **executor** becomes the limit (80 submissions in 45 s on 2 slots): the final grade takes 26–39 s, while everything interactive stays fast. Sign-in meets the < 250 ms checklist target. The next step after that is a second executor VM (Oracle allows only 2 OCPU free per tenancy; that one is paid) — runbooks, *Upgrading for a bigger session*.

### Before and after the fixes (0.1 CPU, verdicts polled every 0.5 s)

The first measurements polled for verdicts (twice a second per waiting student), which costs the API far more than the SSE stream the browser uses. To isolate the effect of the code changes, the same polling scenario was re-run after the fixes:

| 20 students, polling | heartbeat p50 / p95 | draft save p95 | Run → verdict p50 / p95 | Submit → verdict p50 / p95 | HTTP errors |
|---|---|---|---|---|---|
| before (`a-before-api0.1`) | 967 ms / 5.4 s | 5.3 s | 3.7 s / 9.3 s | 56.3 s / 66.0 s | 0.12 % |
| after (`b-optimized-poll-api0.1`) | **81 ms / 1.9 s** | **1.8 s** | **1.1 s / 4.4 s** | **14.5 s / 24.5 s** | **0 %** |

Before the fixes, 40 students collapsed: heartbeat p95 12.9 s, 6.3 % HTTP errors, and only 40.7 % of verdicts arrived within the 3-minute wait (the API was too starved to hand jobs to the idle executor).

All raw results (k6 summaries, per-request failures, `docker stats` samples) are in `loadtest/results/`.

## Exit criteria

- **Published load-test report, including failures** ✅ — this document and `loadtest/results/`.
- **README setup < 10 min** ✅ with prebuilt images, on a connection of ~50 Mbit/s or better (download computed, the rest measured); ❌ when building from source (15–25 min, not re-measured this phase). Measured on the dev box, fresh `docker compose up` with the images present:

  | Step | Time |
  |---|---|
  | `git clone` (depth 1) | 1.3 s |
  | Third-party images (Postgres, Redis, MySQL, MongoDB; 655 MB compressed) | 19 s (measured download, ~35 MB/s here) |
  | Our images (executor 1,287 MB + API 58 MB + web 55 MB compressed) | ~40 s at the same speed (**computed**; the GHCR images are published by CI with this push) |
  | `docker compose up -d` until API and web answer | 15 s |
  | `docker compose run --rm seed` | 37 s |
  | First practice question usable (*Sum of an Array* validated) | 53 s after `up` |
  | All 170 seed questions validated (in the background) | 9 min 7 s after `up` |

  Total until a student can solve a problem: about **2 minutes** here; about 4 minutes at 100 Mbit/s and 6–7 minutes at 50 Mbit/s, where the download dominates.

## Failures found along the way, and what changed

1. **The API took 3.5 minutes to start on 0.1 CPU.** Found by the first smoke run: the container answered `/readyz` 207 s after starting. A CPU profile showed 9 of 12.5 seconds (on a full core) spent generating the 170-question seed bank: the upload-template code imported `@hbe/db/seed`, which builds every question and its stress tests at import time. Upload templates now import `@hbe/db/seed/examples` (the 7 hand-written questions), and a test fails if any server module imports the full bank. Startup on a full core: 12.5 s → 1.6 s; memory after boot 245–326 MiB → ~150 MiB; on 0.1 CPU ~45 s from `docker compose up` including container start. On Render free this matters on every wake-up from sleep.
2. **The API was the bottleneck at 0.1 CPU** (~10 ms of CPU per request, measured; at 0.1 CPU that is ~10 requests per second at most). Profiles under load showed:
   - **ES256 JWT verification: 19 % of busy main-thread time.** jose was given a Node `KeyObject` and verified every request. The public key is now a `CryptoKey` imported once, and verified tokens are cached until expiry (bounded map keyed by the exact token string). Session revocation is still checked in Redis on every request; the logout test now uses the token before logging out to prove a cached token is still refused.
   - **Every Run and every result loaded all test cases of the question** (inputs and expected outputs, hundreds of KB for stress tests), only to read visibility and weight. Runs now load the samples only (none with custom input) and results load three columns.
   - Rate-limit hits: a MULTI of three commands per heartbeat/draft/event → one Lua script call. Drizzle no longer gets the schema (it built relational helpers for 40 tables on every transaction; the relational API is unused).
   - Measured effect: see *Before and after* above. A larger V8 young generation (`--max-semi-space-size=16`) was tried and made no measurable difference, so it was not kept.
3. **Overload answered with HTTP 500.** At 80 students (before the fixes) the API returned hundreds of 500s: `timeout exceeded when trying to connect`, i.e. all 5 pooled database connections busy. That is now `503 Service busy` with `Retry-After: 2`, and the web client retries idempotent GET/PUT requests once (never POSTs, so a submission or proctoring event cannot be sent twice). The API exposes `Retry-After` to the browser via CORS.
4. **Load-test harness bugs (fixed before any number above was kept):** k6 sent bodyless POSTs with a JSON content type (400 — publishing the test failed silently, so students got "Test not found"); `run.sh` started k6 before the API was ready; the seed image used for one run predated `SEED_LOAD_STUDENTS`; and a Run loop that slept up to 112 s before noticing the test was ending delayed the final Submits, spreading the "burst" over two extra minutes. **The first full series was discarded because of that last bug** and re-run. Verdict waiting was first done by polling twice a second; the SSE mode added later is what the browser does and is the default now.
5. **Security review findings, fixed:**
   - JSON bodies up to **32 MB on every route**, parsed before authentication (an anonymous client could make a 512 MB instance parse large payloads after fetching a CSRF token, or without one on executor routes). Now 2 MB by default; 32 MB only for question authoring and executor results; executor routes check the bearer token before the body is read. Tests: 413 on sign-in and drafts, 401 before parsing on executor routes.
   - **Postgres TLS accepted any certificate** (`rejectUnauthorized: false`). `DATABASE_CA_CERT` (Supabase's CA) now enables certificate and host-name verification; without it the API warns at startup.
   - **Seven routes relied on the default "any signed-in user"** without a declaration. They now carry `@Authenticated()`, and a test walks every registered route and fails on a missing declaration.
   - DOMPurify (via monaco-editor) GHSA-p98j-92pf-mc4p (low): pinned to ≥ 3.4.16; `pnpm audit --prod` is clean and now runs in CI.
   - Discarding an upload was not audited; it is now (`upload.discard`).
6. **Hardening surprises:** in the distroless image `/app` was writable by the app user, because the base image already runs as uid 65532 and `WORKDIR` created the directory as that user (fixed: build steps as root, then `USER 65532`; verified `EACCES`). BuildKit refused to copy a dangling symlink (`node` → `/nodejs/bin/node`) as a single file (copy the directory instead). In the install script, an apostrophe inside `"${VAR:?…}"` opened a quote in bash; `bash -n` caught it and CI now parses the scripts.
7. **The first restore of a backup failed:** `ALTER SCHEMA hbe OWNER TO hbe_owner` — `pg_dump --no-owner` is ignored for custom-format archives, so ownership has to be dropped at `pg_restore` time. Found by running the workflow's commands locally before relying on them. The workflow and runbook now restore with `--no-owner`, tolerate grants to Supabase-only roles, and check what matters instead: row counts, every table still forcing RLS, `hbe_app` privileges.
8. **A full disk stopped one run** (MySQL runner never became ready): repeated executor builds had accumulated ~23 GB of build cache. Pruning entries unused for 20 hours freed 4.2 GB. Not a product issue, but the executor install script now caps Docker logs and prunes old images on every update.

## Test results (final runs)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/db` | 228 (225 + **3 new**) | RLS and tenant isolation (unchanged), seed bank structure, **database TLS settings** |
| `apps/api` | 123 (116 + **7 new**) | Body limits (413 before auth; 401 before parsing on executor routes; large question bodies still accepted), **every route declares its access**, the server never imports the seed bank, the 503 mapping, logout revokes a cached token, plus all earlier suites |
| `apps/api` e2e with the real executor | 13 | Grading in 8 languages, web and DB graders, graded attempts — with the hardened, read-only executor |
| Executor sandbox suite | 83 | Escape corpus, 8 languages, web grader, DB runners — **with a read-only root filesystem** (same flags as production) |
| `apps/web` Playwright on a fresh stack | 19 | Every browser flow from Phases 2–6 against the distroless, read-only API and web images |
| Other suites | 24 + 17 + 10 | shared, question-format, executor unit tests |
| Backup dump → restore (local run of the workflow's commands) | 1 | 43 MB dump of the load-test database restored with matching counts (86 users, 3,032 submissions, 170 questions, 7 migrations), 35/35 tables forcing RLS, `hbe_app` privileges back; 22 s |
| `terraform validate` | 2 configs | `oci-executor` and `aws/envs/prod` (providers from releases.hashicorp.com; the registry is blocked here) |

Lint and typecheck are clean; `pnpm audit --prod` reports no known vulnerabilities.

## Known gaps and honest caveats

1. **Nothing was deployed to the real hosts.** Render, Supabase, Oracle Cloud and AWS need your accounts (see *Sign-ins needed*). The load test reproduces the pilot's resource limits on one box; it cannot reproduce India → Singapore latency, Render's own scheduler, Supabase's shared CPU or the ARM64 executor. After the pilot is deployed, run `loadtest/exam.js` against it once (`API_URL=https://api.<domain> WEB_ORIGIN=https://app.<domain>`), with a small class first.
2. **On the free API, the end-of-test burst is slow above ~15 students**: 12–16 s for the final grade at 20 students, about a minute at 40. Answers are saved the moment they are submitted, and the deadline sweeper grades drafts, so nothing is lost — students wait for the result. The 0.5-CPU numbers above show what the $7/month plan changes (check Render's current pricing).
3. **Sign-in costs 0.5–1.6 s on 0.1 CPU** (Argon2id at the OWASP minimum, 19 MiB / t = 2). The checklist target (< 250 ms) is met only on a paid instance. Lowering the parameters further would weaken password storage; not done.
4. The executor image's Trivy scan stays report-only: 8 toolchains bring many unfixed findings in compilers and runtimes, and the running code is sandboxed by nsjail regardless. API and web images fail CI on fixable HIGH/CRITICAL.
5. **Terraform is validated, not applied.** Expect small fixes on a first apply (quotas, engine versions per region). AWS costs were not priced against a real bill.
6. **Backups are dormant** until you create the age key, the repository variable and the secret (runbooks). The dump/restore commands were exercised locally against the dev database (see test results), not against Supabase.
7. The ARM64 sandbox suite and the multi-arch image publish run in CI for the first time with this push; their results are reported separately below once CI finishes.

## Sign-ins needed

To deploy the pilot (all from [deployment.md](./deployment.md); none needed for this phase's work itself):

1. **Supabase** (free project, Singapore) — database.
2. **Render** (sign in with GitHub) — web, API, Key Value.
3. **Oracle Cloud** (Always Free; card for identity verification) — the executor VM. For Terraform: `oci setup config` on your laptop.
4. **GitHub**, after the first image publish: make the three `hbecode-*` packages public (your profile/org → Packages → each package → Package settings → Change visibility), or `docker login ghcr.io` wherever they are pulled.
5. **GitHub**, for backups: repository variable `BACKUP_AGE_RECIPIENT` and secret `BACKUP_DATABASE_URL` (runbooks).
6. AWS only when you move off the free tiers.
