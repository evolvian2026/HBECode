-- Phase 5: bulk question upload (Excel / Word / JSON).
-- An upload is parsed into rows (one per question) for a preview; nothing is created until the
-- author confirms. Payloads hold hidden tests and reference solutions, so both tables are
-- visible only to teachers of the tenant (and super admins for global-bank uploads).

CREATE TABLE hbe.upload_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES hbe.tenants(id) ON DELETE CASCADE, -- NULL = global bank (super admin)
  created_by    uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  filename      text NOT NULL,
  format        text NOT NULL CHECK (format IN ('xlsx', 'docx', 'json')),
  size_bytes    integer NOT NULL,
  file          bytea,               -- dropped once parsed
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'parsing', 'parsed', 'failed', 'importing', 'done', 'discarded')),
  options       jsonb NOT NULL DEFAULT '{}',
  counts        jsonb NOT NULL DEFAULT '{}',
  issues        jsonb NOT NULL DEFAULT '[]', -- problems not tied to one question
  error         text,
  -- who runs the import: { id, role, tenantId } of the uploader / confirming author
  actor         jsonb NOT NULL,
  lease_until   timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  parsed_at     timestamptz,
  confirmed_at  timestamptz,
  finished_at   timestamptz
);
CREATE INDEX upload_jobs_tenant_created ON hbe.upload_jobs (tenant_id, created_at DESC);
CREATE INDEX upload_jobs_pending ON hbe.upload_jobs (status, lease_until) WHERE status IN ('queued', 'parsing', 'importing');

CREATE TABLE hbe.upload_rows (
  job_id       uuid NOT NULL REFERENCES hbe.upload_jobs(id) ON DELETE CASCADE,
  tenant_id    uuid,
  row_no       integer NOT NULL,
  key          text NOT NULL,
  title        text NOT NULL DEFAULT '',
  type         text NOT NULL DEFAULT '',
  loc          text NOT NULL DEFAULT '',
  action       text NOT NULL DEFAULT 'create' CHECK (action IN ('create', 'update')),
  target_id    uuid,                 -- question updated by this row
  status       text NOT NULL CHECK (status IN ('invalid', 'duplicate', 'ready', 'imported', 'failed')),
  errors       jsonb NOT NULL DEFAULT '[]',
  warnings     jsonb NOT NULL DEFAULT '[]',
  payload      jsonb,                -- canonical question; cleared after import
  question_id  uuid REFERENCES hbe.questions(id) ON DELETE SET NULL,
  message      text,
  PRIMARY KEY (job_id, row_no)
);

CREATE FUNCTION hbe.inherit_tenant_from_upload() RETURNS trigger LANGUAGE plpgsql
SET search_path = hbe, pg_temp AS $$
BEGIN
  SELECT j.tenant_id INTO NEW.tenant_id FROM hbe.upload_jobs j WHERE j.id = NEW.job_id;
  RETURN NEW;
END $$;
CREATE TRIGGER upload_rows_tenant BEFORE INSERT OR UPDATE OF job_id, tenant_id ON hbe.upload_rows
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_upload();

GRANT SELECT, INSERT, UPDATE, DELETE ON hbe.upload_jobs, hbe.upload_rows TO hbe_app;
ALTER TABLE hbe.upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hbe.upload_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE hbe.upload_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE hbe.upload_rows FORCE ROW LEVEL SECURITY;

-- Authors only: teachers of the tenant; global uploads (tenant_id NULL) are platform-only.
CREATE POLICY upload_jobs_all ON hbe.upload_jobs FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'));
CREATE POLICY upload_rows_all ON hbe.upload_rows FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'));
