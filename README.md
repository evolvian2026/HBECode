# HBECode

A multi-tenant online coding assessment platform. Students write code in a browser IDE, run it in a
secure sandbox against hidden tests, and get feedback in about a second. Institutions manage their
own teachers, students and batches; teachers manage the question bank.

**Status: Phase 2 of 8 (core) — done.** See [Phase 2 report](docs/phase-2-report.md) for what was built and measured.

| Docs | |
|---|---|
| [Architecture](docs/architecture.md) | design, data model, sandbox, free-tier limits, AWS plan, decision log |
| [Threat model](docs/threat-model.md) | STRIDE table, sandbox escape corpus, security checklist |
| [Deployment](docs/deployment.md) | pilot on Render + Supabase + Oracle Cloud, step by step |
| [OpenAPI](docs/openapi.json) | generated from the same Zod schemas the API validates with |

## Run it locally (about 10 minutes)

Requirements: **Docker** with Compose v2 (Linux host, or Docker Desktop). That's all.

```bash
git clone https://github.com/evolvian2026/HBECode.git && cd HBECode
docker compose up --build -d          # first build ≈ 6–10 min (the executor image holds 8 toolchains)
docker compose run --rm seed          # admin + demo users; queues the seed question for validation
```

Open http://localhost:3000 and sign in:

| Role | Email | Password |
|---|---|---|
| Student | `student@demo.edu` | `demo-password-123` |
| Teacher | `teacher@demo.edu` | `demo-password-123` |
| Associate (TA) | `ta@demo.edu` | `demo-password-123` |
| Institution admin (MFA enrolment forced) | `admin@demo.edu` | `demo-password-123` |
| Super admin (MFA enrolment forced) | `admin@hbecode.local` | `admin-password-dev-1` |

These are development defaults. Change them in `.env` (see `.env.example`) and never reuse them anywhere real.
The seed question "Sum of an Array" appears in Practice once the executor has validated all 8
reference solutions, which takes about 20 s after `seed`.

## Develop without Docker (except the executor)

Needs Node 22, pnpm 10, PostgreSQL 16 and Redis 7.

```bash
pnpm install
pnpm --filter @hbe/shared build && pnpm --filter @hbe/db build
createuser/createdb …   # role hbe_owner LOGIN CREATEROLE CREATEDB; database hbe_dev owned by it
DATABASE_ADMIN_URL=postgres://hbe_owner:…@127.0.0.1/hbe_dev HBE_APP_DB_PASSWORD=… pnpm db:migrate
DATABASE_URL=postgres://hbe_app:…@127.0.0.1/hbe_dev EXECUTOR_TOKENS=<32+ chars> pnpm dev:api
pnpm dev:web
docker compose up -d executor   # or run the executor container by hand (docs/deployment.md §4)
```

## Repository layout

```
apps/api        NestJS + Fastify API (auth, RBAC, tenancy, questions, submissions, executor dispatch)
apps/web        Next.js static app (Monaco IDE, question editor, admin pages)
apps/executor   sandbox agent: nsjail + hbe-run + seccomp, one image with 8 pinned toolchains
packages/db     SQL migrations (tables + RLS), Drizzle schema, seed questions
packages/shared roles/permissions, runtimes, Zod schemas, executor job contract
```

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `pnpm lint` | ESLint (incl. a ban on `sql.raw`) | — |
| `pnpm --filter @hbe/shared test` | output comparison modes, roles, publish rules | — |
| `pnpm --filter @hbe/db test` | RLS forced on every table, tenant isolation, hidden data, append-only audit | Postgres |
| `pnpm --filter @hbe/api test` | auth (CSRF, lockout, refresh reuse, MFA), RBAC matrix, full question → submission flow | Postgres, Redis |
| `pnpm --filter @hbe/executor test:sandbox` | 8 languages + escape attempts (fork bomb, network, seccomp, …) | Docker + `hbe-executor:dev` image |
| `pnpm --filter @hbe/api test:e2e` | API + real sandbox, latency measurement | Docker + image |
| `pnpm --filter @hbe/web test:e2e` | browser flows (student solve, compile error, MFA, admin) | running stack |
