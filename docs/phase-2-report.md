# Phase 2 report — core platform

Date: 2026-10-01. Branch: `claude/compassionate-carson-jcy713`.
Scope (from the plan): auth, RBAC, multi-tenancy, question bank CRUD, execution engine for
coding languages, IDE. Everything below was **run**; numbers are measured, not estimated.

## What was built

| Area | Delivered |
|---|---|
| **Database** | Schema `hbe` (not exposed to Supabase's Data API) with an app role `hbe_app` that has no `BYPASSRLS`. **RLS is forced on all 16 tables.** Tenant ids are inherited from parent rows by trigger. Published question versions are frozen by trigger. The audit log is append-only (no UPDATE/DELETE grant). Checksummed migrations. |
| **Auth** | Argon2id passwords. ES256 access JWT (10 min) plus rotating refresh tokens with reuse detection (reusing a token kills the whole session). httpOnly `SameSite=Strict` cookies, double-submit CSRF and an Origin allowlist. Lockout after 10 failures, Redis rate limits, TOTP MFA (**forced for super admins and institution admins**, single-use codes). Invite and reset links, guest sessions, institution switching. |
| **RBAC + tenancy** | Deny-by-default guard driven by one permission table. The tenant comes only from the signed token. Three layers: guard → service → RLS. Foreign ids return 404. Only Super Admin and Teacher can write questions. Associates can see hidden tests but never drivers or solutions. |
| **Question bank** | Versioned coding questions in the full brief format: 2 samples, 10–15 hidden tests, a stress-test rule, 8 language templates (stub, hidden driver, solution), limits, compare modes. Structural checklist plus a **sandbox validator** that runs every reference solution on every test and requires ≥ 30% time headroom, with auto-publish on success. Search, filters, cursor pagination. |
| **Executor** | nsjail per run (user/PID/mount/net/IPC/UTS namespaces, uid 65534, read-only root, tmpfs `/tmp`, cgroup memory/pids/CPU, rlimits, seccomp policy). `hbe-run` runs as PID 1 and measures CPU and memory. Compile once, then run tests in parallel. Comparison happens outside the jail. Hidden tests return a verdict only. Compiler and runtime messages are sanitised so driver code never reaches the student. One image with **pinned GCC 13.3, OpenJDK 21, CPython 3.12, Node 22, Go 1.24, Rust 1.90, .NET 8**. The agent pulls jobs over HTTPS and holds no database or Redis credentials. |
| **API** | NestJS 12 + Fastify 5, about 40 endpoints, OpenAPI 3.1 generated from the Zod schemas (validated with Redocly). Submission status over SSE with a polling fallback. Postgres-as-truth queue with leases and a sweeper, which survives the non-persistent free Redis. |
| **Web** | Next.js static export. Self-hosted Monaco. CSP with hashes for inline scripts. IDE with 8 languages and version labels, themes, font size, reset, Run (samples or custom input), Submit, per-test results and autosave. Question editor with a live validation report. Users, batches and institutions admin. Forced MFA enrolment with a QR code. |
| **Ops** | Dockerfiles (API, web, executor), `docker-compose.yml`, Render blueprint, GitHub Actions (lint/typecheck/unit, integration, sandbox + e2e, gitleaks, manual migration job), deployment guide. |

## Test results (all passing at the time of writing)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/shared` | 7 | compare modes (exact / trailing / unordered / float), role matrix, publish rules |
| `packages/db` (real Postgres, non-superuser owner like Supabase) | 27 | RLS forced on every table; with no context nothing is visible; tenant A can't read or write tenant B; students and guests never see hidden tests, drivers or solutions; verdicts can't be self-set; audit is append-only |
| `apps/api` (real Postgres + Redis) | 42 | CSRF/Origin; generic login errors; lockout; refresh rotation and reuse detection; logout revocation; tampered JWT rejected; MFA enrolment and replay protection; RBAC per role; invite flow; cross-tenant 404s; validation → publish; hidden data absent from student responses (checked by string scan); weighted scoring; SSE; rate limits; executor token boundary |
| `apps/executor` unit | 10 | source layout, diagnostic sanitising for gcc/javac/rustc/Python |
| `apps/executor` sandbox (Docker) | 44 | all 8 reference solutions AC with ≥ 85% headroom; stubs give WA; syntax errors don't leak driver code; **19 escape attempts contained** (see below); no jailed process survives any test |
| `apps/api` e2e with the real sandbox | 5 | validation of all 8 languages incl. 200,000-element stress tests; AC in every language; WA/CE/TLE; latency |
| `apps/web` Playwright | 7 | student solve flow, compile error, guest, teacher, forced MFA, super admin MFA + institution; **no CSP violations or page errors**. Passed both against a hand-run stack and against `docker compose up --build` + `docker compose run --rm seed` (the README path) |

**Escape attempts contained:**
- Resource exhaustion: fork bomb (capped at fewer than 20 processes), memory blow-up (MLE), infinite output (OLE), busy loop (TLE), sleeping (TLE at the wall limit), 8 spinning threads (TLE), filling `/tmp`, compile bomb (`#include "/dev/urandom"`).
- Network: TCP to a public IP, to loopback and to cloud metadata, plus DNS: all blocked.
- Identity and visibility: uid 65534 with zero capabilities; no host processes or environment (canary not visible); `/etc/shadow`, the agent's code and the work dirs are invisible.
- Filesystem: `/box`, `/usr`, `/` and `/proc/sys` are read-only.
- Syscalls: `unshare`, `ptrace`, `bpf`, `keyctl` and `mount` kill the process; io_uring returns ENOSYS.
- Isolation between runs and from secrets: background daemons die with the run; child processes from Java and Node stay inside the jail; runs can't affect each other; the expected output never exists inside the jail.

## Measured latency (single user, no load)

POST → final verdict through the real API and sandbox, with a fresh compile every time. 5 runs per language on a 4-core x86_64 dev box:

| ms | C | C++ | Java | Python | JS | Go | Rust | C# |
|---|---|---|---|---|---|---|---|---|
| Run p95 (2 samples) | 185 | 478 | 738 | 192 | 181 | 402 | 366 | 841 |
| Submit p95 (12 tests incl. 2 × 200k stress) | 329 | 626 | 1089 | 366 | 448 | 609 | 459 | 1076 |

All are well inside the 2–3 s target. **Not yet measured:** the Oracle A1 VM (ARM, 2 cores), the network hop India → Singapore (~50–70 ms), Render's 0.1-CPU free API, and any load. The load test (k6) is Phase 8.

## Known gaps and honest caveats

1. **Executor platform coverage.** The sandbox suite passed on x86_64 with **cgroup v1** only. The **cgroup v2** path runs for the first time in CI (GitHub's Ubuntu 24.04 runners), and **ARM64 (Oracle A1) has not run at all**. Run the suite once on the VM before the pilot (docs/deployment.md §4).
2. The seccomp policy is a **denylist** on top of the namespaces. Per-runtime allowlists are planned for Phase 8.
3. The executor container needs `CAP_SYS_ADMIN` (for nsjail). The VM must be dedicated to it.
4. No email provider yet: admins copy invite and reset links from the Users page.
5. Not built yet: a breached-password list check; Redis write-behind for drafts (drafts go straight to Postgres, which is fine at pilot scale); monthly table partitioning.
6. One API test run showed a suite-level failure in `rbac.test.ts` once. It didn't reproduce in 7 further runs, and I haven't found the cause.
7. Only **one** seed question so far ("Sum of an Array", validated in all 8 languages). The 170+ question seed set is Phase 7.
8. Copy/paste and other proctoring controls are Phase 4. Web/DB question types are Phase 3. Bulk upload is Phase 5. Reports are Phase 6.
9. The web CSP allows `style-src 'unsafe-inline'` (Monaco and Next inject styles). Scripts are hash-pinned.
