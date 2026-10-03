# Deployment — pilot (10–20 users)

Target from [architecture §15.3](./architecture.md#153-approved-pilot-deployment-1020-users-replaces-152-for-now):
**Render** (web + API + Key Value), **Supabase** (Postgres), **Oracle Cloud Always Free** (code execution).
Everything is in **Singapore**. DNS stays on your AWS account.

## 0. Accounts you need to create (sign-ups)

| # | Service | What for | Card needed? |
|---|---|---|---|
| 1 | **Supabase** — supabase.com | Postgres database (free project) | No |
| 2 | **Render** — render.com (sign in with GitHub) | Web app, API, Key Value (Redis) | No for free services |
| 3 | **Oracle Cloud** — cloud.oracle.com (Always Free) | VM that runs student code | Yes, for identity verification (not charged on Always Free shapes) |
| — | AWS (you already have it) | DNS records for `app.` and `api.` subdomains | — |
| — | GitHub (you already have it) | Repository + Actions (CI, migrations) | — |

Optional later: an email provider (Resend/SES) to send invite emails automatically. Until then, admins copy invite links from the Users page.

## 1. Generate secrets (once, on your laptop)

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out jwt.pem   # JWT_PRIVATE_KEY (paste the whole PEM)
openssl rand -base64 32                                                       # MFA_ENCRYPTION_KEY
openssl rand -hex 32                                                          # EXECUTOR_TOKEN (API: EXECUTOR_TOKENS)
openssl rand -base64 24                                                       # HBE_APP_DB_PASSWORD
```
Keep them in a password manager. Never commit them. `.env*` files are git-ignored.

## 2. Supabase

1. Create a project: **Region = Southeast Asia (Singapore)**, with a strong database password.
2. **Turn off the Data API.** Go to Project Settings → Data API and disable it. If you keep it, make sure the exposed schemas do **not** include `hbe`. Our tables live in schema `hbe`, which grants nothing to `anon`/`authenticated`. A test checks this, but turning the API off removes the attack surface entirely.
3. Copy two connection strings from Project Settings → Database:
   - **Direct / session** connection as `postgres`. This is `DATABASE_ADMIN_URL`, used for migrations only, and must include `?sslmode=require`.
   - **Transaction pooler** (port 6543). This is the template for the app's `DATABASE_URL`. Replace the user with `hbe_app.<project-ref>` and the password with `HBE_APP_DB_PASSWORD`, and add `?sslmode=require`.
4. Run the migrations. Either:
   - add repository secrets `DATABASE_ADMIN_URL` and `HBE_APP_DB_PASSWORD`, then run **Actions → Migrate database**; or
   - run it locally: `DATABASE_ADMIN_URL=... HBE_APP_DB_PASSWORD=... pnpm db:migrate`.

   This creates schema `hbe`, role `hbe_app` (no `BYPASSRLS`), all tables and the RLS policies, and sets the `hbe_app` password.

> The free tier pauses after 7 days with no traffic. Resume it from the dashboard before a test session if it was idle.

## 3. Render

1. Render → **New → Blueprint** → choose this repository → it reads `render.yaml` and proposes `hbe-api`, `hbe-web` and `hbe-kv`.
2. Fill in the secrets it asks for:
   - `hbe-api`: `DATABASE_URL` (step 2.3), `JWT_PRIVATE_KEY`, `MFA_ENCRYPTION_KEY`, `EXECUTOR_TOKENS`, `WEB_ORIGINS=https://app.<domain>`, `WEB_URL=https://app.<domain>`
   - `hbe-web`: `NEXT_PUBLIC_API_URL=https://api.<domain>`
3. **Custom domains (required).** Add `api.<domain>` to `hbe-api` and `app.<domain>` to `hbe-web`. In **AWS Route 53**, create the CNAME records Render shows you, then wait for the TLS certificates.
   Both must sit under the same registrable domain: session cookies are `SameSite=Strict`, and `*.onrender.com` counts as cross-site.
4. Create the super admin once from your laptop, pointing at Supabase. This also queues the seed question for validation. It publishes only after the executor (step 4) has validated it:
   ```bash
   pnpm --filter @hbe/api build
   DATABASE_URL='<hbe_app pooler URL>' REDIS_URL='<Render Key Value external URL, or skip and re-run later>' \
   SEED_ADMIN_EMAIL=you@yourdomain.com SEED_ADMIN_PASSWORD='<12+ chars>' \
   node apps/api/dist/cli/seed.js
   ```
   (Simpler: open a Render **Shell** on `hbe-api` and run `SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… node apps/api/dist/cli/seed.js`. It already has `DATABASE_URL` and `REDIS_URL`.)
5. Sign in at `https://app.<domain>` and enrol MFA. It is required for super admins and institution admins.

> **Tests and proctoring (Phase 4)** need nothing extra on Render: the live monitor and student pushes use a WebSocket on the same API service (`wss://api.<domain>/api/v1/ws`, which Render supports), and the app's CSP already allows it. Optional API settings: `LOGIN_RATE_LIMIT_PER_IP` (default 300 sign-ins per 5 minutes per IP; a lab behind one NAT shares an IP, so do not set it low) and `SWEEPER_INTERVAL_MS` (default 10 s; auto-submit at the deadline and missing-heartbeat flags run on this tick). `UPLOAD_MAX_BYTES` (default 10 MB) caps bulk question uploads. Uploads are read in a worker thread (384 MB heap limit). Measured on a dev box, reading a 10 MB Excel file took 2.7 s and the process peaked at about 310 MB RSS; Render's free instance has 512 MB in total, so `render.yaml` sets `UPLOAD_MAX_BYTES=5242880` (5 MB: about 25 questions with big stress tests, or hundreds of ordinary ones); split larger files, or raise it on a paid plan. Webcam snapshots are kept for 30 days by default; to change it for an institution, set `snapshotRetentionDays` in `hbe.tenants.settings` (there is no UI for it yet).

> **Reports (Phase 6)** need nothing extra. Optional API settings: `REPORT_TIMEZONE` (default `Asia/Kolkata`; report "days" start at local midnight) and `REPORT_FLAG_MIN_ATTEMPTS` / `REPORT_FLAG_EASY` / `REPORT_FLAG_HARD` (defaults 30 / 0.9 / 0.1). Rollups rebuild themselves once a day; after restoring a backup or editing data by hand, a super admin can press **Rebuild report rollups** on the Platform page (`POST /api/v1/reports/rebuild`; about 7 s for 330,000 submissions on a dev box). To re-measure dashboard latency on seeded data (local Postgres + Redis, like the API tests; it creates and drops its own database): `pnpm --filter @hbe/api build && pnpm --filter @hbe/api test:perf` (see `apps/api/test/perf/reports-latency.test.ts`).

> **Free plan limits:** the API sleeps after 15 minutes idle and takes about a minute to wake. **Open the site a few minutes before each session.** The free Key Value store is not persistent, but that's fine: Postgres is the source of truth and the sweeper re-queues any submission that was in flight.

## 4. Oracle Cloud executor VM {#executor}

1. Create a compute instance:
   - Shape **VM.Standard.A1.Flex**, 2 OCPU / 12 GB (the whole Always Free allowance).
   - Image **Ubuntu 24.04**.
   - Region **Singapore**.
   - Add your SSH key.
   - Boot volume: click **Specify a custom boot volume size** and set **100 GB** (the default is ~47 GB). Leave the performance at the default **Balanced**.
     - **Why:** the executor image is ~5.5 GB, the three database runner images ~3 GB, and Docker's build cache several GB more. Updating the executor briefly needs the old and new images side by side (~11 GB). With the default size the disk can fill up mid-update, and grading stops until someone cleans up by hand. The extra space also keeps the build cache (code-only updates rebuild in minutes, not ~15 min) and lets you keep the previous image for a quick rollback.
     - **Cost: none** within Always Free, which includes 200 GB of block storage in total (boot volumes count toward it). Charges apply only on a Pay-As-You-Go account that goes beyond the free limits: more than 200 GB of volumes in total, more than 5 volume backups, or a performance level above *Balanced*. A plain Free Tier account blocks you instead of charging. Check the current limits on Oracle's Free Tier page when you create the VM.
     - After the VM is up, confirm Ubuntu sees the full size: `df -h /` should show about 95 GB. If it shows less, run `sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1` (Ubuntu images on Oracle normally do this automatically on first boot).
   - Networking: the default VCN is fine. **Allow no inbound ports except 22**: the executor only makes outbound HTTPS calls to the API.
   If you get "Out of capacity", retry later or pick another availability domain.
2. On the VM:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io git
   sudo systemctl enable --now docker
   git clone https://github.com/evolvian2026/HBECode.git && cd HBECode
   sudo docker build -f apps/executor/Dockerfile -t hbe-executor .      # ~15 min on A1, native ARM64

   # Database runners for DB questions (PostgreSQL, MySQL, MongoDB). They live on an internal
   # Docker network: no published ports, no internet, reachable only from the executor.
   # Data is on tmpfs, so nothing survives a restart (none is needed).
   RPG=$(openssl rand -hex 16); RMY=$(openssl rand -hex 16); RMO=$(openssl rand -hex 16)
   sudo docker network create --internal hbe-runners
   sudo docker run -d --name runner-pg --network hbe-runners --restart unless-stopped --memory 512m \
     --security-opt no-new-privileges --tmpfs /var/lib/postgresql/data \
     -e POSTGRES_USER=runner_admin -e POSTGRES_PASSWORD=$RPG postgres:16-alpine
   sudo docker run -d --name runner-mysql --network hbe-runners --restart unless-stopped --memory 768m \
     --security-opt no-new-privileges --tmpfs /var/lib/mysql \
     -e MYSQL_ROOT_PASSWORD=$RMY mysql:8.4 \
     --local-infile=0 --secure-file-priv=NULL --skip-name-resolve --performance-schema=0 --innodb-buffer-pool-size=64M --max-connections=100
   sudo docker run -d --name runner-mongo --network hbe-runners --restart unless-stopped --memory 512m \
     --security-opt no-new-privileges --tmpfs /data/db \
     -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=$RMO mongo:8.0 --noscripting --wiredTigerCacheSizeGB 0.25

   sudo docker run -d --name hbe-executor --restart unless-stopped \
     --cap-drop ALL --cap-add SYS_ADMIN --cap-add SETUID --cap-add SETGID --cap-add CHOWN \
     --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add KILL \
     --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined \
     --cgroupns private \
     -e EXECUTOR_API_URL=https://api.<domain> -e EXECUTOR_TOKEN='<EXECUTOR_TOKEN>' \
     -e EXECUTOR_ID=oci-sg-1 -e EXECUTOR_SLOTS=2 \
     -e PG_RUNNER_URL=postgres://runner_admin:$RPG@runner-pg:5432/postgres \
     -e MYSQL_RUNNER_URL=mysql://root:$RMY@runner-mysql:3306 \
     -e "MONGO_RUNNER_URL=mongodb://root:$RMO@runner-mongo:27017/?authSource=admin" \
     hbe-executor
   sudo docker network connect hbe-runners hbe-executor   # executor: internet (API) + runners
   sudo docker logs -f hbe-executor     # expect "executor starting" listing 8 runtimes, web:html, web:react and db:*
   ```
   The runner passwords exist only in these containers' environment; the API never sees them. If the executor restarts before the runners are ready, it simply retries (`restart unless-stopped`).
3. **Why these flags:** nsjail needs `CAP_SYS_ADMIN` and a writable cgroup tree to build each sandbox. `--cgroupns private` keeps the executor inside its own cgroup subtree. **Never mount the host's `/sys/fs/cgroup`:** the agent refuses to start if it can see processes outside its container. With these privileges the container itself is a weak boundary. **The VM must run nothing else.** The security boundary is nsjail around every submission: user/PID/mount/network namespaces, uid 65534, seccomp, cgroups and a read-only root filesystem. It is exercised by `pnpm --filter @hbe/executor test:sandbox`. The VM holds no platform database or Redis credentials, only the executor token and the passwords of its own throwaway runner databases. Student SQL runs as a per-run database user that can see only that run's database (MongoDB: a per-run user with the `read` role); web submissions run in headless Chromium inside the same nsjail sandbox, with no network.

> ⚠️ Not yet verified: the sandbox suite passed on an x86_64 / cgroup v1 host. Oracle A1 is ARM64 with cgroup v2. CI (GitHub's Ubuntu 24.04 runners, cgroup v2) covers the cgroup v2 path; ARM64 has not run yet. **After step 2, run the sandbox suite on the VM once**:
> `docker run --rm --entrypoint /opt/node/bin/node hbe-executor /opt/hbe/agent/dist/cli-versions.js` (all 8 runtimes plus `web:html`, `web:react`, `db:pandas` listed; the `db:*` runners show as "not set" in this one-off container), then `pnpm install && pnpm --filter @hbe/executor test:sandbox`.
> ARM64 has also not been checked for the Phase 3 pieces: Playwright's headless Chromium build, and the `mysql:8.4` and `mongo:8.0` images (both publish arm64 builds; MongoDB 8 needs ARMv8.2-A, which Ampere A1 has).

## 5. Smoke test

1. Sign in as the super admin and create an institution (Institutions page).
2. Users → invite an institution admin, a teacher and a student, and open the invite links.
3. As the student: Practice → *Sum of an Array* → Run → Submit → *Accepted*.
4. Practice → *React Shopping Cart*: the preview renders on the right. Practice → *Top Earner per Department* → PostgreSQL: the expected table is shown under *Expected output*.
5. Tests (Phase 4): as the teacher, Tests → New test → add *Sum of an Array*, assign the student, Publish. As the student (preferably on a laptop), My tests → Start; the timer and fullscreen work. Open the same test in a second browser as the same student: it must say *Waiting for your proctor*. As the teacher, Tests → Monitor shows the device request; Approve it, and the first browser must say the test moved to another device.
6. Bulk import (Phase 5): as the teacher, Question bank → Import → download the Excel template → upload it unchanged. The preview must show 3 ready questions; Import with *Validate … and publish* ticked; within about a minute all 3 show as published.
7. Reports (Phase 6): as the teacher, Reports shows the activity charts; open the test from step 5 → the report lists the student with a score; Export CSV downloads a file; Run similarity check finishes within seconds. As the student, My progress lists the test.
8. Check that the preview frame may be framed by the app: `curl -sI https://app.<domain>/preview/frame.html | grep -i -E 'x-frame-options|content-security-policy'` must show `SAMEORIGIN` and `frame-ancestors 'self'`. If Render applied the `/*` rules instead (`DENY`), the preview stays blank; see the `/preview/*` rules in `render.yaml`.

## Upgrading later

- **More users:** Render Starter plan for the API, Supabase Pro, and more executor VMs (each one just runs the same `docker run` with its own `EXECUTOR_ID`).
- **AWS:** see [architecture §16](./architecture.md#16-aws-target-architecture-and-migration).
