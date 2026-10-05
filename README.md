# HBECode

A multi-tenant online coding assessment platform. Students write code in a browser IDE, run it in a
secure sandbox against hidden tests, and get feedback in about a second. Institutions manage their
own teachers, students and batches; teachers manage the question bank.

**Status: Phase 8 of 8 (deployment, load testing, hardening) — done, awaiting review.** See the [Phase 8 report](docs/phase-8-report.md) (and [Phase 7](docs/phase-7-report.md), [Phase 6](docs/phase-6-report.md), [Phase 5](docs/phase-5-report.md), [Phase 4](docs/phase-4-report.md), [Phase 3](docs/phase-3-report.md), [Phase 2](docs/phase-2-report.md)) for what was built and measured.

**Seed bank**: 170 practice questions in 17 topic stacks (4 easy / 4 moderate / 2 hard each): 80 coding questions that work in all 8 languages, 30 web (HTML & CSS, DOM, React) and 60 data (SQL in PostgreSQL and MySQL, MongoDB, Pandas). CI validates every one in the real sandbox.

**Reports**: an institution dashboard (activity, recent tests, questions that look too easy or too hard), test reports (score distribution, per-question and per-student results, CSV/Excel export, print to PDF), question, batch and student reports, *My progress* for students, a platform health page for the super admin, and an on-demand **code similarity check** per test with a side-by-side compare.

Bulk **import and export** of questions in Excel, Word or JSON, with downloadable templates, a per-row preview of every problem, a problem report, and optional sandbox validation + publishing on import. See the [question format guide](docs/question-format.md).

Timed, proctored **tests**: teachers schedule tests from the question bank and assign them to batches or students; deadlines are enforced by the server; a second device is blocked until a proctor approves it; proctors watch a live monitor (WebSocket) and can approve devices, warn, extend time or end an attempt. Browser proctoring deters cheating but cannot guarantee a clean test.

Question types: **coding** (C, C++, Java, Python, JavaScript, Go, Rust, C#), **web** (HTML/CSS/JavaScript and React, with a live preview, graded in headless Chromium) and **database** (PostgreSQL, MySQL, MongoDB, Pandas).

| Docs | |
|---|---|
| [Architecture](docs/architecture.md) | design, data model, sandbox, free-tier limits, AWS plan, decision log |
| [Threat model](docs/threat-model.md) | STRIDE table, sandbox escape corpus, security checklist |
| [Deployment](docs/deployment.md) | pilot on Render + Supabase + Oracle Cloud, step by step |
| [Runbooks](docs/runbooks.md) | before a session, deploy/rollback, secret rotation, backups and restore, incidents |
| [Load test](loadtest/README.md) | k6 exam scenario on a pilot-sized stack; results in the Phase 8 report |
| [Terraform](infra/terraform/) | Oracle executor VM for the pilot; the AWS target architecture |
| [Question format](docs/question-format.md) | Excel / Word / JSON import and export, every column |
| [OpenAPI](docs/openapi.json) | generated from the same Zod schemas the API validates with |

## Run it locally (under 10 minutes with prebuilt images)

Requirements: **Docker** with Compose v2 (Linux host, or Docker Desktop with ~8 GB of memory for Docker). That's all.

```bash
git clone https://github.com/evolvian2026/HBECode.git && cd HBECode
export HBE_IMAGE_PREFIX=ghcr.io/evolvian2026/hbecode- HBE_TAG=main   # prebuilt images (amd64 + arm64)
docker compose pull                   # ~2 GB compressed, mostly the executor's 8 toolchains
docker compose up -d
docker compose run --rm seed          # admin + demo users; queues the 170 seed questions for validation
```

**Or build everything yourself** (no registry needed): skip the `export` and `pull`, and run `docker compose up --build -d`. The first build takes about 15–25 minutes, mostly the executor image.

Open http://localhost:3000 and sign in:

| Role | Email | Password |
|---|---|---|
| Student | `student@demo.edu` | `demo-password-123` |
| Student 2 | `student2@demo.edu` | `demo-password-123` |
| Teacher | `teacher@demo.edu` | `demo-password-123` |
| Associate (TA) | `ta@demo.edu` | `demo-password-123` |
| Institution admin (MFA enrolment forced) | `admin@demo.edu` | `demo-password-123` |
| Super admin (MFA enrolment forced) | `admin@hbecode.local` | `admin-password-dev-1` |

These are development defaults. Change them in `.env` (see `.env.example`) and never reuse them anywhere real.
The seed questions appear in Practice as the local executor validates them: *Sum of an Array* about a minute after `up`, all 170 after about 9 minutes (2 executor slots; measured). Everything works while the rest validates.

**Measured** on a 4-core dev box (Phase 8): clone 1 s; `up` until API and web answer 15 s; `seed` 37 s; first question usable 53 s after `up`. The ~2 GB download is the variable part: about 1 minute on a fast link, ~3 minutes at 100 Mbit/s, ~6–7 minutes at 50 Mbit/s.

If ports 5432 or 6379 are already in use on your machine, set `PG_HOST_PORT` / `REDIS_HOST_PORT` (for
example `PG_HOST_PORT=15432 docker compose up -d`). The DB-question runner containers publish no ports.

## Develop without Docker (except the executor)

Needs Node 22, pnpm 10, PostgreSQL 16 and Redis 7.

```bash
pnpm install
pnpm --filter @hbe/shared build && pnpm --filter @hbe/web-runtime build && pnpm --filter @hbe/db build && pnpm --filter @hbe/question-format build
createuser/createdb …   # role hbe_owner LOGIN CREATEROLE CREATEDB; database hbe_dev owned by it
DATABASE_ADMIN_URL=postgres://hbe_owner:…@127.0.0.1/hbe_dev HBE_APP_DB_PASSWORD=… pnpm db:migrate
DATABASE_URL=postgres://hbe_app:…@127.0.0.1/hbe_dev EXECUTOR_TOKENS=<32+ chars> pnpm dev:api
pnpm dev:web
docker compose up -d executor   # or run the executor container by hand (docs/deployment.md §4)
```

## Repository layout

```
apps/api        NestJS + Fastify API (auth, RBAC, tenancy, questions, submissions, executor dispatch,
                tests/attempts/proctoring, WebSocket gateway)
apps/web        Next.js static app (Monaco IDE, question editor, admin pages)
apps/executor   sandbox agent: nsjail + hbe-run + seccomp, 8 pinned toolchains, jailed headless Chromium,
                PostgreSQL/MySQL/MongoDB runner clients, pandas harness
packages/db     SQL migrations (tables + RLS), Drizzle schema, seed questions
packages/shared roles/permissions, runtimes, Zod schemas (coding/web/DB questions), result comparison,
                executor job contract
packages/question-format  Excel / Word / JSON question import and export (templates, error report)
packages/web-runtime  builds one self-contained document from web files (preview and grader share it)
```

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `pnpm lint` | ESLint (incl. a ban on `sql.raw`) | — |
| `pnpm --filter @hbe/shared test` | output/result comparison, Mongo query guard, roles, publish rules | — |
| `pnpm --filter @hbe/question-format test` | lossless Excel/Word/JSON round trips, error locations, zip bomb / DTD rejection, templates | — |
| `pnpm --filter @hbe/web-runtime test` | HTML inlining, React multi-file build, compile errors | — |
| `pnpm --filter @hbe/db test` | RLS forced on every table, tenant isolation, hidden data, append-only audit, test/attempt/proctoring visibility and deadline rules | Postgres |
| `pnpm --filter @hbe/api test` | auth (CSRF, lockout, refresh reuse, MFA), RBAC matrix, full question → submission flow, tests/attempts (tenant leaks, second device, timer tampering, violation policy, webcam, WebSocket) | Postgres, Redis |
| `pnpm --filter @hbe/executor test:sandbox` | 8 languages + escape attempts (fork bomb, network, seccomp, …), web grader (network isolation, anti-tampering), DB runners (isolation, timeouts, Mongo guard, pandas) | Docker + `hbe-executor:dev` image (starts its own runner containers) |
| `pnpm --filter @hbe/api test:e2e` | API + real sandbox for coding, web and DB questions: seed validation, grading, leak checks, latency | Docker + image |
| `pnpm --filter @hbe/web test:e2e` | browser flows (coding/web/DB solving, preview sandbox, authoring, MFA, admin, taking a test, second device approval, violations → auto-submit) | running stack (`docker compose up` + `seed`) on a fresh volume |
