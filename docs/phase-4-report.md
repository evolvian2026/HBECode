# Phase 4 report — tests, proctoring and realtime monitoring

Branch `claude/compassionate-carson-jcy713`. Everything below was run in this phase on a 4-core x86_64 dev box (cgroup v1). Numbers are as measured, including what failed along the way.

## What was built

| Area | Delivered |
|---|---|
| **Tests (assessments)** | Teachers create a test from published bank questions (coding, web and DB can be mixed), with points per question, a window (opens/closes), a duration per student and proctoring settings. They assign it to batches and/or individual students and publish it. **Publishing pins each question's published version**, so later edits never change a scheduled test. Drafts can be edited or deleted; published tests can be closed early (open attempts are submitted). |
| **Attempts and time** | The server sets `deadline = min(start + duration, window end)`. Only proctors can extend it. After the deadline the API refuses drafts and submissions (2 s grace for latency) **and so does Postgres RLS**. A sweeper (one API replica at a time) auto-submits idle attempts; any request after the deadline also closes the attempt immediately. On finish or auto-submit, **the latest draft of each question is graded** if it is newer than the last submit and is not the untouched starter. Score = best submit score × points, recomputed every time an attempt submission is graded. |
| **One device per attempt** | Starting a test gives the browser a device token (kept in `localStorage`, sent as `x-attempt-token`; the server keeps only its hash). Every attempt request, and the WebSocket subscription, must carry the active token. **A second device waits ("Waiting for your proctor") until a proctor approves it** (your decision). Approval moves the attempt to the new device and locks the old one out ("This test moved to another device"); a denial is final for that device. The question cannot be reached through Practice either, so the block cannot be bypassed. |
| **Proctoring agent (browser)** | Tab switch / minimise, window blur, fullscreen exit (the test is covered until fullscreen returns), copy / cut / paste / drag-drop (blocked if the test says so, always logged), right-click, large text inserted into the editor without a paste, mouse leaving the page, extended display (`screen.isExtended`), a low-confidence devtools heuristic, and webcam denial. Events are batched every 5 s (immediately for counted ones); a heartbeat every 15 s. |
| **Server-side rules** | Severity and "counts as a violation" are decided by the server. A blur caused by a tab switch counts once; the same type within 3 s counts once. Per-test policy: warning, final warning, auto-submit (defaults 3 / 5 / 7). **Missing heartbeats (45 s) are flagged**, and so is an agent that claims to have sent more events than the server received. Implausible client timestamps are not trusted. |
| **Webcam (optional, off by default)** | With the student's consent on the start screen, one ≤ 150 KB JPEG is uploaded **only right after a counted event** — the server checks that such an event happened in the last minute. Snapshots are staff-only, viewing one is audited, and the sweeper deletes them after 30 days (per institution: `snapshotRetentionDays`). No face detection. |
| **Live monitor (WebSocket)** | Per test: every assigned student with status, online dot (heartbeat), time left, progress, score, violation count, last flag, and **device approval requests with Approve / Deny**. Actions: warn (message shown to the student), +10 min, terminate (with reason), timeline (events, devices, snapshots, submissions). Updates arrive over a WebSocket (`/api/v1/ws`, Redis pub/sub across replicas) with a 10 s poll as a fallback. |
| **Student UI** | "My tests" (start / resume / score), a start screen with the rules and consent, then the same IDEs as Practice (coding, web with live preview, DB) inside the test shell: question tabs, server-synced timer, violation counter, warning banner, proctor messages, Finish. |
| **Security** | 8 new tables, RLS forced on all of them. Students see a test only when it is published and assigned to them, and an exam-only question only while their own attempt is open. Students can never update an attempt. Proctoring events are append-only. Every staff action and every snapshot view is audited. WebSocket: Origin allowlist + session cookie, re-checked every 30 s. |
| **Docs** | Architecture decision log §15.6, threat model §5b (P1–P6) and updated S3/T2/T3/I6, deployment notes, OpenAPI regenerated (28 new operations; Redocly: valid). |

## Test results (final runs)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/db` | 43 (27 + **16 new**) | Tenant inheritance; staff see their own tenant's tests only; students see published, assigned tests only (batch or direct), never drafts; only teachers write tests; **a student sees an exam-only question, its samples and stubs only during their open attempt, never hidden tests or secrets, and not after**; students cannot start attempts on unassigned/draft/foreign tests or set a score; **students cannot update their attempt** (deadline, score, status, session, violations); **RLS refuses drafts and submissions after the deadline**; associates can extend, other tenants cannot see or touch; students cannot read or write sessions, events or snapshots; events are append-only |
| `apps/api` | 85 (52 + **33 new**) | RBAC (only teachers create; students/associates/admins 403); **every test endpoint as another tenant → 404**; assignments only to own-tenant students; publishing pins versions; second device pending → can do nothing (incl. via Practice) → proctor approval (other tenant 404, student 403) → old device `session_replaced`; denied stays denied; best-of scoring; drafts; finish grades the final draft; **timer tampering**: forged deadline fields stripped, implausible client clocks dropped, students cannot extend, writes refused after the deadline, lazy and sweeper auto-submit, deadline capped by the window, not-yet-open test refused; violation policy (warning → final warning → auto-submit, pair and repeat de-duplication); `events_missing`; heartbeat gap flag and recovery; warn/extend/terminate/close with audit; webcam rules and retention; **WebSocket**: foreign Origin and missing Origin 403, no cookie 401, wrong attempt token refused, students cannot subscribe to the monitor, other tenant gets nothing, pushes for deadline/violations/changes arrive |
| `packages/shared`, `web-runtime`, `apps/executor` unit | 24, 3, 10 | unchanged, all pass |
| `apps/api` e2e with the real executor | 2 new + 11 from Phases 2/3 (all 8 languages, web and DB graders — rerun, all pass) | An attempt submission is graded by the sandbox (WA → score 0); a correct **draft** left unsubmitted is **auto-submitted by the deadline sweeper and graded** (score 40/40); 20 students at once (below) |
| `apps/web` Playwright against `docker compose up` + `seed` on a **fresh volume** (the README path; all 7 seeds published 22 s after `seed`; whole suite 1.1 min) | 15 (12 + **3 new**) | **Student takes a test in one browser and gets Accepted from the real executor; a second browser for the same student is blocked; the proctor sees the request live on the monitor and approves it; the second browser continues and the first shows "moved to another device"; Finish → Score 100/100, also on the monitor.** **Start → copy (warning) → paste (final warning, editor unchanged) → leave fullscreen → "Submitted automatically"**; the monitor shows 3 violations and the timeline. Teacher creates, assigns and publishes a test through the UI. No CSP violations or page errors. |

The mutation check: with the device-token comparison disabled in the API, 7 of the 33 new API tests fail (the device, draft, finish and WebSocket ones), so those tests do exercise the block.

### Measured (20 simulated students, one API process, one 2-slot executor, in-process requests)

| Operation (all 20 at the same moment) | p50 | p95 | max |
|---|---|---|---|
| Start attempt | 104 ms | 111 ms | 112 ms |
| Heartbeat (100 calls) | 57 ms | 79 ms | 84 ms |
| Proctoring event batch (100 calls) | 78 ms | 91 ms | 98 ms |
| Draft autosave (100 calls) | 79 ms | 98 ms | 101 ms |
| **All 20 submit at once → verdict** (Python, 12 tests incl. 2 × 200k stress) | 3.7 s | 5.7 s | 6.0 s |
| Live monitor for 20 students (average of 10) | 13 ms | | |

These are local numbers without network: the India → Singapore hop (~50–70 ms), Render's 0.1-CPU free instance and the ARM executor are not included. The burst row is executor-bound (2 slots): 20 submissions in ~6 s means ~0.3 s of executor time each.

## Failures found along the way, and what changed

- **The submission SSE stream could miss a fast result** (pre-existing since Phase 2): it read the state, then subscribed. A job that finished in between (a MongoDB run takes ~20 ms) was never pushed, and the IDE showed "Running…" until the 120 s stream timeout. Found by the Phase 3 Playwright spec failing intermittently on this box. Fixed: the stream re-reads after subscribing.
- **The per-IP login limit (30 per 5 minutes) would lock out a classroom** behind one college NAT. Found when the full browser suite (more logins from one IP) started failing with "Try again in 58 s". Raised to 300 and made configurable (`LOGIN_RATE_LIMIT_PER_IP`); per-account limits and lockout are unchanged.
- **An unapproved second device could have bypassed the block through Practice** (`/practice/questions/:id` and `/submissions` without an attempt, since RLS now lets a student with an open attempt read the question). Found while designing the RLS change, before any test. Learners now get 404 for exam-only questions outside the attempt endpoints; covered by tests.
- New pages read `location.search` in a state initializer, which is stale during Next.js client-side navigation (the URL changes after the first render): "This test is not available to you". Fixed in the three new pages (read after mount).
- The WebSocket message schema used a discriminated union with two members sharing `op: "sub"` (invalid in Zod 4): every subscription was refused. Fixed (plain union); caught by the API WebSocket test.
- The sweeper lock was held for 5 s after a sweep, so back-to-back sweeps were skipped. It is now released when the sweep ends.
- Test fixes, not product bugs: the Phase 3 React spec clicked "Add" on a preview that was still rebuilding (the iframe is replaced 350 ms after the last edit; the second click was lost). It now waits until the preview is stable. The new spec's login helper raced the post-login redirect.
- The Phase 3 `admin.spec.ts` only passes on a **fresh** volume (the super admin enrols MFA once). A second run on the same volume fails, as before. The final run below is on a fresh volume.

## Known gaps and honest caveats

1. **Browser proctoring deters, it does not guarantee.** A second physical device, a VM, screen sharing or a modified browser that suppresses events consistently cannot be detected from a web page. This is stated on the test editor, the start screen and the monitor. Treat flags as evidence for review.
2. **No face detection** for webcam frames (one still frame after a flagged event; the proctor looks at it). MediaPipe would need a self-hosted WASM model; deferred.
3. **Plagiarism detection is not built** in this phase (listed under Phase 4 in the original plan, but not in the agreed Phase 4 scope). I suggest doing it with reports in Phase 6.
4. The auto-submit sweeper runs every 10 s. Writes are refused at the deadline regardless, so this gives no extra time; it only delays the "auto-submitted" status by up to 10 s for a student who closed the page.
5. **The timer keeps running while a second device waits for approval**, and the original device keeps working until a proctor approves. If no proctor is watching, a student whose laptop died must wait. Make sure someone has the monitor open during a test.
6. Inside a test, the per-question result still shows verdicts and the per-submission score (as in Practice). "Show results" controls only the final score. A "no feedback during the test" option is not built.
7. The live monitor re-reads the whole roster on each change (fine for the pilot: 13 ms for 20 students). At thousands of students per test it should receive row deltas.
8. Render free: the API sleeps after 15 minutes idle, which also drops WebSockets. Open the site before a test (as before). Not yet tested on Render, Supabase or the Oracle VM.
9. Webcam retention per institution has no UI yet (`hbe.tenants.settings.snapshotRetentionDays`).
10. Heartbeat/event latencies above are in-process (no network, no TLS) on a dev box; Phase 8's k6 load test will measure the deployed stack.

## Sign-ins needed from you

None for this phase. The pilot accounts (Supabase, Render, Oracle) are still needed as listed in `docs/deployment.md` when you are ready to deploy; nothing new was added.
