# HBECode — Threat Model & Security Checklist (Phase 1)

> Status: **DRAFT.** Method: STRIDE per trust boundary. Companion to [`architecture.md`](./architecture.md).

## 1. Assets

| Asset | Why it matters |
|---|---|
| Hidden test cases, drivers, reference solutions | If they leak, every assessment is compromised |
| Scores, attempts, submissions | Academic integrity, legal disputes |
| Student PII (name, email, IP, fingerprint, webcam frames) | DPDP Act 2023 (India), trust |
| Tenant boundaries | A client seeing another client's data ends the business |
| Credentials, sessions, MFA secrets | Account takeover |
| Executor hosts | Footholds for crypto-mining, spam, lateral movement |
| Audit log | Non-repudiation |

## 2. Adversaries

1. **Student** trying to cheat: read hidden tests, fake verdicts, see another student's code, get past proctoring, extend time.
2. **Hostile code author** (any user who can run code, including Guests): sandbox escape, resource exhaustion, outbound network abuse.
3. **Tenant insider** (teacher/client admin) trying to read another tenant's data or raise their own privileges.
4. **External attacker:** credential stuffing, XSS/CSRF, injection, DoS.
5. **Compromised dependency or CI** (supply chain).

## 3. Trust boundaries

```
[Browser] ─TLS─▶ [Cloudflare edge] ─Tunnel─▶ [API/WS] ─▶ [Postgres · Redis · Object store]
                                                 │
                                                 └─queue─▶ [Executor host] ─▶ [nsjail: untrusted code]
                                                                     └─▶ [DB runner: untrusted SQL]
[Preview iframe: untrusted HTML/JS] (opaque origin via sandbox, own network-free CSP; separate domain deferred to AWS, see architecture §15.5)
```

## 4. STRIDE by boundary

| # | Threat | Boundary | Mitigation | Verified by |
|---|---|---|---|---|
| S1 | Credential stuffing / brute force | Browser→API | Argon2id (m=64 MiB, t=3). Per-IP and per-account rate limits. Progressive lockout (10 failures/15 min → 15 min lock + email). Mandatory TOTP for Super Admin / Client Admin. Breached-password check (k-anonymity, offline list). | Integration tests, k6 abuse scenario |
| S2 | Stolen refresh token | Browser→API | httpOnly, `Secure`, `SameSite=Strict`, path `/api/v1/auth`. Rotation on every use. Reusing a rotated token revokes the whole family. | Unit tests |
| S3 | Session sharing / concurrent test login | Browser→API | `active_session_id` per attempt. WS + API reject other sessions. The event is logged. | E2E |
| T1 | Fake verdicts / scores | Executor→API | Results arrive only from executors over an authenticated Redis ACL user. Scoring is server-side. The client never sends a score. Comparison runs **outside** the jail. | Unit + escape suite |
| T2 | Changing the timer / deadline | Browser→API | `deadline_at` is server-side. The server auto-submit job ignores client timers. | E2E |
| T3 | Disabling client proctoring | Browser | Cannot be fully prevented. Missing heartbeats and missing expected events are flagged server-side. The docs say proctoring deters but does not guarantee. | — |
| R1 | Denying actions | All | Append-only `audit_logs` in the same transaction as each mutation. `app_api` has no UPDATE/DELETE on that table. | DB grant test |
| I1 | **Cross-tenant read** | API→DB | Guard + service checks + **RLS**. Tenant comes only from the authenticated membership. 404 for foreign IDs. Rollup tables (not MVs) so RLS applies. | Automated **tenant-leak test suite**: every list/get endpoint is called as tenant B on tenant A's IDs |
| I2 | Hidden tests/solutions in responses | API→Browser | Separate DTOs with field allowlists. 🔒 columns are readable only by the worker role and authors. Hidden blobs are in a private bucket with executor-only access. Contract tests assert that student-facing schemas contain no hidden fields. Error messages never include driver lines or expected outputs. | Snapshot tests of every student-facing response. Bundle grep in CI for test fixtures. |
| I3 | Reading hidden data from inside the sandbox | Executor | Expected outputs never enter the jail. Only the current test's input is present. There is no network. Verdict-only feedback limits the bit leak. Submit rate limits. | Escape suite |
| I4 | SQL questions reading platform data | DB runner | Physically separate DB servers. Per-run DB/schema. Least-privilege users. Dangerous functions revoked. | Isolation tests per dialect |
| I5 | XSS through question statements or web previews | Browser | Markdown rendered with an allowlist sanitiser (rehype-sanitize). Strict CSP (`script-src 'self'`, no inline). Previews in an opaque-origin `sandbox="allow-scripts"` iframe with a CSP meta tag. User-content domain is separate. | XSS payload corpus in E2E |
| I6 | PII over-collection | All | Coarse fingerprint hash only. Webcam frames only when flagged. Per-tenant retention jobs. Encryption at rest (volume encryption + R2/S3 SSE). | Retention job tests |
| D1 | Fork bombs / infinite output / memory blowup | Executor | cgroup v2 `pids.max`, `memory.max` (swap 0), CPU + wall timeouts, output pipe caps, `RLIMIT_FSIZE`, tmpfs size caps | Escape suite |
| D2 | Queue flooding | API→Queue | Per-user/IP submit rate limits (Redis token bucket). Per-class queues. Max source size (64 KiB). Guest priority is lowest. | k6 abuse scenario |
| D3 | Expensive SQL | DB runner | `statement_timeout`/`max_execution_time`, `temp_file_limit`, row/byte result caps, a connection per run | Isolation tests |
| D4 | Volumetric DDoS | Edge | Cloudflare proxy + WAF rate rules. Origin reachable only through Tunnel. | — |
| E1 | **Sandbox escape** | Executor | nsjail: user/PID/mount/net/IPC namespaces, uid 65534, `no_new_privs`, seccomp allowlist, read-only root, no setuid. Agent uses `O_NOFOLLOW` and never writes into student-controlled paths (the Judge0 CVE-2024-28185 class). Executor on its own VM with no DB credentials. gVisor on AWS. Hosts recycled. | **Escape-attempt corpus** in CI (see §5) |
| E2 | Privilege escalation through the API | API | Deny-by-default permission guard. Role changes only by higher roles. Audit logged. MFA re-auth for role grants. | Permission matrix tests (each role × each endpoint) |
| E3 | Injection (SQL/NoSQL/command) | API | Drizzle with parameters only. Lint rule bans `sql.raw` outside migrations. Zod validation on every input. No shell interpolation (executor uses `execFile` with argv arrays). | Lint + Semgrep |
| E4 | CSRF | Browser→API | Cookies are `SameSite=Strict`. Double-submit CSRF token header on mutations. `Origin` allowlist check. CORS allowlist (no wildcard, credentials only for app origin). | Integration tests |
| E5 | Supply chain | CI | Lockfile + `pnpm audit`. Renovate. Pinned image digests. Trivy scans. gitleaks. GitHub OIDC for deploys (no long-lived keys). Least-privilege Actions permissions. | CI |

## 5. Sandbox escape-attempt corpus (Phase 2/3 deliverable)

Each item must end in a contained verdict (`RE`/`TLE`/`MLE`/`OLE`), with no host effect and no other run affected.

- Fork bomb (C `fork()` loop, Python `os.fork`, bash-style via `system()`).
- Allocating 10 GB; mmap tricks; stack overflow.
- Writing 1 GB to stdout; writing a huge file to `/box` and to `/tmp`.
- `socket()` TCP/UDP to an external IP, DNS lookup, AF_NETLINK, raw sockets.
- `ptrace`, `mount`, `unshare`, `setns`, `bpf`, `keyctl`, `perf_event_open`, `userfaultfd`, `io_uring_setup`.
- Reading `/proc/1/environ`, `/proc/self/mountinfo`, `/etc/shadow`, the docker socket, cloud metadata `169.254.169.254`.
- Symlink/hardlink races against agent-read paths (`/box/out → /etc/passwd`).
- Sleeping past the wall clock while using no CPU; busy loops; spawning threads to inflate CPU.
- Leaving background processes (daemonise, `setsid`) — they must die with the cgroup.
- Language-specific: Java `Runtime.exec`, JNI loading; Node `child_process`, `process.binding`; Python `ctypes`; .NET `Process.Start`; Rust/Go raw syscalls.
- SQL: `COPY ... PROGRAM`, `pg_read_file`, `LOAD DATA LOCAL INFILE`, `xp_cmdshell`, cross-database queries, `$where`/`$function` in Mongo.

## 5a. Phase 3: web and DB questions (as built and tested)

| # | Threat | Mitigation | Verified by |
|---|---|---|---|
| W1 | Student HTML/JS in the **live preview** reads the app's cookies, storage, DOM or CSRF token, or calls the API as the student | Preview page `/preview/frame.html` runs in `sandbox="allow-scripts allow-forms allow-modals"` without `allow-same-origin` (opaque origin `null`). It has its own CSP: `default-src 'none'; connect-src 'none'; form-action 'none'`, inline only. No top-navigation permission. The app's pages still send `X-Frame-Options: DENY`. | Playwright `web-db.spec.ts`: from inside the preview, `parent.document`, `document.cookie` and `localStorage` throw `SecurityError`, `fetch` to the API and to the app origin are refused, `top.location` does not navigate, `origin` is `null` |
| W2 | Student code in the **grader** reaches the network (exfiltration, SSRF, metadata endpoint) | Chromium runs inside nsjail with no network interface, `--host-resolver-rules=MAP * ~NOTFOUND` and a dead proxy. Only the fake student origin is routed, from the trusted side. | `web.test.ts`: fetch, XHR, image, beacon, WebSocket, WebRTC and navigation all produce **0 hits** on a listener that the executor itself **can** reach (positive control) |
| W3 | Student page scripts **fake check results** | Checks run from Playwright's side. Styles come from CDP `CSS.getComputedStyleForNode`, a11y from the CDP AX tree, locators in the utility world. Hidden checks return no detail to students. | `web.test.ts`: patched `getComputedStyle`, `CSSStyleDeclaration.getPropertyValue`, `Node.textContent`, `Element.getAttribute` and `document.querySelectorAll` all still give WA |
| W4 | State leaks between students (cookies, storage, processes) | Fresh browser context for every check, a fresh profile directory and a fresh jail for every job. No processes outlive the job. | `web.test.ts`: localStorage/cookie set in one job is absent in the next; no uid 65534 processes after a job; infinite loop → TLE and the next job is fine |
| W5 | Reference files or hidden checks reach students | Reference files live only in `language_secrets` (authors). Hidden checks live in `test_cases` (staff RLS). Student view sends sample titles only; results for hidden checks carry verdict only. | API `web-db.test.ts` + e2e `web-db-executor.test.ts`: every reference-only line and hidden check title is absent from the student response; hidden results have exactly `{hidden, ordinal, verdict}` |
| Q1 | Student SQL reads **other runs**, platform data or server files | Runner servers hold no platform data and sit on an internal network (no published ports, no internet). PostgreSQL: a fresh database per run from a template, role `hbe_sbx` (NOSUPERUSER, no CONNECT on `postgres`/`template1`). MySQL: a per-run schema and per-run user with grants on that schema only, `--local-infile=0 --secure-file-priv=NULL`. Query mode is a READ ONLY transaction with a single statement. | `db.test.ts`: `COPY … TO PROGRAM`, `pg_read_file`, `pg_authid`, `lo_import`, `CREATE EXTENSION`, `SET ROLE`, `CREATE TABLE`, `dblink` all denied; `pg_database` shows only the current run; MySQL `LOAD_FILE` is NULL, `mysql.user` is denied, only its own schema is visible; writes in query mode are refused |
| Q2 | MongoDB code execution or cross-database reads | JSON queries only, parsed by `parseMongoQuery` with an operator denylist (`$where`, `$function`, `$accumulator`, `$out`, `$merge`, `$currentOp`, …). Server runs with `--noscripting`. A per-run user has the `read` role on its own database. | `db.test.ts`: `$where`, `$out`, `$function` rejected; `$lookup` into `system.users` sees nothing |
| Q3 | Expensive queries | PostgreSQL `statement_timeout`, `work_mem`, `temp_file_limit`, and `pg_terminate_backend` at the deadline. MySQL `max_execution_time` plus `KILL`, and the deadline itself decides TLE (`SLEEP()` interrupted by MySQL returns 1 without an error). Results stream with a row cap. | `db.test.ts`: `pg_sleep(20)` / `SLEEP(20)` → TLE in < 10 s; a 5,000,000-row / 6-way cross join → WA or TLE, not memory exhaustion |
| Q4 | Pandas code escapes | Runs in the normal Python nsjail (same limits and seccomp as coding questions). The data comes in as CSV files; the result goes out as JSON on stdout, parsed outside the jail. | `db.test.ts`: from `solve()`, a TCP connection is blocked and `/etc/shadow` is absent; an infinite loop → TLE; syntax error → compile error; plus the Phase 2 escape suite (the same jail) |

## 6. Security checklist (gate for each phase)

- [ ] All endpoints have an explicit permission decorator (CI check: an unannotated route fails the build)
- [ ] RLS enabled **and forced** on every tenant table (CI query against `pg_class.relrowsecurity/relforcerowsecurity`)
- [ ] Tenant-leak suite green
- [ ] Student-facing response snapshots contain no hidden fields
- [ ] Sandbox escape corpus green on x86_64 and ARM64
- [ ] Rate limits on login, refresh, submissions, uploads, events, guest creation
- [ ] CSP, HSTS (preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` (app), COOP/CORP
- [ ] Cookies: `httpOnly`, `Secure`, `SameSite=Strict`. CSRF token on mutations.
- [ ] Argon2id parameters benchmarked (< 250 ms on API host)
- [ ] MFA enforced for Super Admin and Client Admin
- [ ] Secrets only in env/secret manager. gitleaks clean. No secrets in images (`docker history` check).
- [ ] Postgres/Redis bound to private interfaces only. Redis ACL users per service. TLS between hosts where crossing a network.
- [ ] Backups encrypted, restore tested
- [ ] Images: non-root, read-only root FS, `cap_drop: ALL`, healthcheck, pinned digest, Trivy has no HIGH/CRITICAL without a waiver
- [ ] Audit log covers every create/update/delete, every permission change and every login
- [ ] Data retention jobs implemented and tested per tenant setting
- [ ] Proctoring disclaimer shown to admins, and consent screen shown to students
