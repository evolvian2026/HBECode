# Runbooks — operating the pilot

For the pilot in [deployment.md](./deployment.md): Render (web + API + Key Value), Supabase (Postgres), one Oracle A1 executor. Capacity numbers come from the [Phase 8 load test](./phase-8-report.md).

## Before every test session (10 minutes before)

1. **Wake the API.** Render's free instance sleeps after 15 minutes idle. Open `https://api.<domain>/readyz` and wait for `{"status":"ok"}`. Expect about a minute: Render's own wake-up plus our boot (about 45 s on the free instance's 0.1 CPU, measured).
2. **Supabase not paused?** A free project pauses after 7 days without traffic. Dashboard → *Restore project* if needed; it takes a few minutes.
3. **Executor alive?** Platform page (super admin) lists live executors. If none: [executor down](#executor-down).
4. **Smoke test:** as any student, Practice → *Sum of an Array* → Run → *Accepted*.
5. **Size check.** On the pilot setup, keep a session to the size the load test passed (see the report). For more students, use the larger API plan first ([upgrading](#upgrading-for-a-bigger-session)).

## Deploying a new version

| Part | How | Notes |
|---|---|---|
| Database migrations | Actions → *Migrate database* (or `pnpm db:migrate` with `DATABASE_ADMIN_URL`) | **Before** the API when a release adds migrations. Migrations are forward-only and additive. |
| API + web | Push to `main`: Render auto-deploys both (`render.yaml`). | Render starts the new instance and switches once `/healthz` passes. |
| Executor | On the VM: `sudo HBE_REF=<tag> bash /opt/hbe-install/install-executor.sh` (or wherever you saved the script) | Jobs in flight are re-queued by the sweeper when the old container stops. Allow ~15 minutes for an image rebuild. Code-only changes reuse the build cache. |

Do not deploy during a test window.

## Rolling back

- **API / web:** Render dashboard → service → *Events* → pick the previous deploy → *Rollback*.
- **Executor:** re-run the install script with the previous `HBE_REF`.
- **Database:** migrations are not rolled back. A release that needs a schema change keeps the old code working with the new schema. If data was damaged: [restore a backup](#restore).

## Rotating secrets

| Secret | Steps | Effect |
|---|---|---|
| `EXECUTOR_TOKENS` | 1. Generate `openssl rand -hex 32`. 2. API: set `EXECUTOR_TOKENS=<old>,<new>` and redeploy. 3. VM: put the new token in `/etc/hbe/executor.env`, re-run the install script. 4. API: remove the old token. | No interruption. |
| `JWT_PRIVATE_KEY` | Generate a new key (deployment.md §1), set it on Render, redeploy. | Everyone is signed out and signs in again. Do it outside test windows. |
| `MFA_ENCRYPTION_KEY` | **Do not rotate casually.** TOTP secrets are encrypted with it; changing it makes every enrolled MFA device invalid. Admins then re-enrol MFA (super admin resets them). | Only after a suspected leak. |
| `hbe_app` DB password | Re-run *Migrate database* with a new `HBE_APP_DB_PASSWORD`, then update `DATABASE_URL` on Render. | A short window of failed requests between the two steps. |
| Runner DB passwords (executor VM) | `sudo rm /etc/hbe/runners.env` and re-run the install script. | Generated on the VM; nothing else to update. |

## Backups {#backups}

The free Supabase plan's own backups cannot be restored by you on demand, so we take our own: [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) runs nightly at 02:00 IST.

1. It dumps schema `hbe` and the migration journal with `pg_dump` (custom format).
2. It **restores the dump into a fresh PostgreSQL** in the same job and checks that users, questions and the migration journal came back, that every table still forces row-level security, and that `hbe_app` has its privileges. (Tested locally on the load-test database: 43 MB dump, 3,032 submissions, dump + restore in 22 s.) A backup that cannot be restored fails the run, and GitHub emails you.
3. It encrypts the dump with [age](https://age-encryption.org) and keeps it as a workflow artifact for 30 days. The repository is public: without the private key the artifact is useless.

**One-time setup (needs your sign-in to GitHub and Supabase):**
1. On your laptop: `age-keygen -o hbecode-backup.key`. Keep this file offline (password manager). The line `# public key: age1…` is the recipient.
2. GitHub → Settings → Secrets and variables → Actions:
   - *Variables* → `BACKUP_AGE_RECIPIENT` = the `age1…` public key;
   - *Secrets* → `BACKUP_DATABASE_URL` = Supabase → Connect → **Session pooler** URL for user `postgres` (port 5432, `?sslmode=require`). The direct host is IPv6-only and GitHub's runners are IPv4; the transaction pooler (6543) breaks `pg_dump`.
3. Actions → *Database backup* → *Run workflow* once; the summary shows the restored row counts.

### Restore {#restore}

```bash
gh run download <run-id> -n hbecode-<stamp>.tar.age        # or download from the run page
age -d -i hbecode-backup.key hbecode-<stamp>.tar.age | tar -x  # → hbe.dump, journal.dump
# Into an EMPTY database (a new Supabase project, or a local postgres:17):
psql "$TARGET_ADMIN_URL" -c "CREATE ROLE hbe_app NOLOGIN NOBYPASSRLS" -c "CREATE EXTENSION IF NOT EXISTS citext" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
pg_restore -d "$TARGET_ADMIN_URL" --no-owner hbe.dump        # errors about Supabase-only roles (anon, …) are harmless
pg_restore -d "$TARGET_ADMIN_URL" --no-owner journal.dump
psql "$TARGET_ADMIN_URL" -c "SELECT count(*) FILTER (WHERE NOT relforcerowsecurity) AS unforced FROM pg_class WHERE relnamespace = 'hbe'::regnamespace AND relkind = 'r'"   # must be 0
DATABASE_ADMIN_URL="$TARGET_ADMIN_URL" HBE_APP_DB_PASSWORD=<new> pnpm db:migrate   # no-op for schema; sets the hbe_app password
```
Then point `DATABASE_URL` on Render at the new database. As super admin, press *Rebuild report rollups*. Redis needs nothing: queued jobs are re-dispatched from Postgres.

**What is not in the backup:** Render Key Value (rebuildable by design) and the executor VM (rebuild it with the install script or Terraform).

## Incidents

### Executor down {#executor-down}
Runs and submissions stay *queued* (students see "Queued…"); nothing is lost.
1. OCI Console → instance running? If it was stopped (Oracle reclaims idle Always Free VMs after 7 days below 20 % CPU, network and memory), start it; containers restart by themselves (`--restart unless-stopped`).
2. On the VM: `sudo docker ps` — `hbe-executor` should be *healthy* (its healthcheck fails if it has not reached the API for 3 minutes). `sudo docker logs --tail 50 hbe-executor`.
3. `claim failed: HTTP 401` → the token does not match the API's `EXECUTOR_TOKENS`.
4. Runner trouble (`runtime unavailable: db:…`): `sudo docker ps -a | grep runner`; `docker inspect runner-pg --format '{{.State.OOMKilled}}'`.

### API errors or slowness
1. Render → `hbe-api` → *Logs* (JSON lines with `requestId`; every API error response carries the same `requestId`, visible in the browser's network tab).
2. Memory: the free instance has 512 MB. Uploads are capped at 5 MB, and JSON bodies at 2 MB for every route except question authoring.
3. 0.1 CPU is the real limit. Sign-in (Argon2id) costs ~0.5–1.6 s of wall time per login on it. A whole class signing in at once queues up. Stagger the start, or use a paid instance for big sessions.

### Database full (Supabase free: 500 MB)
`SELECT pg_size_pretty(pg_database_size(current_database()));` and the largest tables: `SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class WHERE relnamespace = 'hbe'::regnamespace ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;`. Submissions and proctoring events grow with use. Upgrade to Supabase Pro before 80 %.

### Suspected sandbox escape or leaked executor token
1. Stop the executor: `sudo docker stop hbe-executor` (jobs queue; nothing is lost).
2. Rotate `EXECUTOR_TOKENS` on Render, removing the old token.
3. Rebuild the VM from scratch: `terraform apply -replace=oci_core_instance.executor` or a new instance with the install script. Do not reuse the old disk. The VM never held database or Redis credentials, but treat its runner passwords as burnt (they are regenerated).
4. Review recent submissions on the Platform page and API logs for the affected window.

### Leaked secret in a commit
gitleaks runs in CI on every push. If a secret was pushed: rotate it first (table above), then remove it from history. Rotation matters more than history rewriting: the push is already public.

## Upgrading for a bigger session

The load test shows where the free setup stops ([report](./phase-8-report.md)). The cheapest steps, in order:
1. **Render API on a paid instance** (more CPU): sign-ins and API latency improve the most.
2. **More executor slots or VMs:** a second VM runs the same install script with its own `HBE_EXECUTOR_ID` (and its own token if you want to revoke it separately).
3. **Supabase Pro** when the database nears 500 MB or the 7-day pause becomes a problem.
4. AWS ([architecture §16](./architecture.md#16-aws-target-architecture-and-migration), [`infra/terraform/aws`](../infra/terraform/aws/README.md)).
