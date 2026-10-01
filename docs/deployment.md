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

> **Free plan limits:** the API sleeps after 15 minutes idle and takes about a minute to wake. **Open the site a few minutes before each session.** The free Key Value store is not persistent, but that's fine: Postgres is the source of truth and the sweeper re-queues any submission that was in flight.

## 4. Oracle Cloud executor VM {#executor}

1. Create a compute instance:
   - Shape **VM.Standard.A1.Flex**, 2 OCPU / 12 GB (the whole Always Free allowance).
   - Image **Ubuntu 24.04**.
   - Region **Singapore**.
   - Add your SSH key.
   - Networking: the default VCN is fine. **Allow no inbound ports except 22**: the executor only makes outbound HTTPS calls to the API.
   If you get "Out of capacity", retry later or pick another availability domain.
2. On the VM:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io git
   sudo systemctl enable --now docker
   git clone https://github.com/evolvian2026/HBECode.git && cd HBECode
   sudo docker build -f apps/executor/Dockerfile -t hbe-executor .      # ~10 min on A1, native ARM64
   sudo docker run -d --name hbe-executor --restart unless-stopped \
     --cap-drop ALL --cap-add SYS_ADMIN --cap-add SETUID --cap-add SETGID --cap-add CHOWN \
     --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add KILL \
     --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined \
     --cgroupns private \
     -e EXECUTOR_API_URL=https://api.<domain> -e EXECUTOR_TOKEN='<EXECUTOR_TOKEN>' \
     -e EXECUTOR_ID=oci-sg-1 -e EXECUTOR_SLOTS=2 \
     hbe-executor
   sudo docker logs -f hbe-executor     # expect "executor starting" with all 8 runtimes
   ```
3. **Why these flags:** nsjail needs `CAP_SYS_ADMIN` and a writable cgroup tree to build each sandbox. `--cgroupns private` keeps the executor inside its own cgroup subtree. **Never mount the host's `/sys/fs/cgroup`:** the agent refuses to start if it can see processes outside its container. With these privileges the container itself is a weak boundary. **The VM must run nothing else.** The security boundary is nsjail around every submission: user/PID/mount/network namespaces, uid 65534, seccomp, cgroups and a read-only root filesystem. It is exercised by `pnpm --filter @hbe/executor test:sandbox`. The VM holds no database or Redis credentials, only the executor token.

> ⚠️ Not yet verified: the sandbox suite passed on an x86_64 / cgroup v1 host. Oracle A1 is ARM64 with cgroup v2. CI (GitHub's Ubuntu 24.04 runners, cgroup v2) covers the cgroup v2 path; ARM64 has not run yet. **After step 2, run the sandbox suite on the VM once**:
> `docker run --rm --entrypoint /opt/node/bin/node hbe-executor /opt/hbe/agent/cli-versions.mjs` (all 8 runtimes listed), then `pnpm install && pnpm --filter @hbe/executor test:sandbox`.

## 5. Smoke test

1. Sign in as the super admin and create an institution (Institutions page).
2. Users → invite an institution admin, a teacher and a student, and open the invite links.
3. As the student: Practice → *Sum of an Array* → Run → Submit → *Accepted*.

## Upgrading later

- **More users:** Render Starter plan for the API, Supabase Pro, and more executor VMs (each one just runs the same `docker run` with its own `EXECUTOR_ID`).
- **AWS:** see [architecture §16](./architecture.md#16-aws-target-architecture-and-migration).
