-- HBECode initial schema.
-- Everything lives in schema `hbe`, which is NOT exposed to Supabase's Data API (PostgREST).
-- The application connects as role `hbe_app`: not the owner, no BYPASSRLS, and every policy is
-- scoped `TO hbe_app`. Request context comes from transaction-local GUCs set by the API:
--   app.role       super_admin | client_admin | teacher | associate | student | guest | system
--   app.tenant_id  active tenant (empty for super admin / guest)
--   app.user_id    authenticated user (empty for system context)
-- `system` is used only by trusted server code paths (login lookup, dispatcher, sweeper).

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hbe_app') THEN
    CREATE ROLE hbe_app NOLOGIN NOBYPASSRLS;
  END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL; -- created concurrently (roles are cluster-wide)
END $$;

CREATE SCHEMA IF NOT EXISTS hbe;
REVOKE ALL ON SCHEMA hbe FROM PUBLIC;
GRANT USAGE ON SCHEMA hbe TO hbe_app;

-- ---------------------------------------------------------------- context helpers
CREATE FUNCTION hbe.app_role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.role', true), '') $$;
CREATE FUNCTION hbe.app_tenant() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE FUNCTION hbe.app_user() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
-- Super admin and trusted system code see across tenants.
CREATE FUNCTION hbe.app_is_platform() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT hbe.app_role() IN ('super_admin', 'system') $$;
-- Row belongs to the active tenant, or to the global bank (tenant_id IS NULL).
CREATE FUNCTION hbe.in_scope(t uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT t IS NULL OR t = hbe.app_tenant() $$;

CREATE FUNCTION hbe.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------- tenants & users
CREATE TABLE hbe.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hbe.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind               text NOT NULL DEFAULT 'user' CHECK (kind IN ('user', 'guest')),
  email              citext UNIQUE,
  name               text NOT NULL,
  password_hash      text,
  is_platform_admin  boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  failed_logins      integer NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  mfa_secret_enc     text,
  mfa_enabled        boolean NOT NULL DEFAULT false,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'guest' OR email IS NOT NULL)
);

CREATE TABLE hbe.memberships (
  user_id     uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('client_admin', 'teacher', 'associate', 'student')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX memberships_tenant_role ON hbe.memberships (tenant_id, role);

CREATE TABLE hbe.refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  tenant_id   uuid REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  rotated_at  timestamptz,
  revoked_at  timestamptz,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON hbe.refresh_tokens (family_id);

CREATE TABLE hbe.invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  purpose     text NOT NULL CHECK (purpose IN ('invite', 'password_reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hbe.batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  year        integer,
  created_by  uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE hbe.batch_members (
  batch_id    uuid NOT NULL REFERENCES hbe.batches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, user_id)
);

-- ---------------------------------------------------------------- question bank
CREATE TABLE hbe.questions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid REFERENCES hbe.tenants(id) ON DELETE CASCADE, -- NULL = global bank
  type                  text NOT NULL DEFAULT 'coding' CHECK (type IN ('coding', 'web', 'db')),
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'validating', 'invalid', 'published', 'archived')),
  is_practice           boolean NOT NULL DEFAULT false,
  slug                  text NOT NULL,
  latest_version_id     uuid,
  published_version_id  uuid,
  content_hash          text,
  created_by            uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX questions_slug ON hbe.questions (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
CREATE INDEX questions_tenant_status ON hbe.questions (tenant_id, status, created_at DESC);
CREATE INDEX questions_content_hash ON hbe.questions (content_hash);

CREATE TABLE hbe.question_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  tenant_id           uuid, -- copied from the question by trigger; never trusted from the client
  version_no          integer NOT NULL,
  title               text NOT NULL,
  statement           text NOT NULL,
  constraints         text NOT NULL DEFAULT '',
  input_format        text NOT NULL DEFAULT '',
  output_format       text NOT NULL DEFAULT '',
  difficulty          text NOT NULL CHECK (difficulty IN ('easy', 'moderate', 'hard')),
  tags                text[] NOT NULL DEFAULT '{}',
  time_complexity     text NOT NULL DEFAULT '',
  space_complexity    text NOT NULL DEFAULT '',
  base_time_limit_ms  integer NOT NULL,
  memory_limit_mb     integer NOT NULL,
  compare             jsonb NOT NULL,
  validation          jsonb,
  published_at        timestamptz,
  created_by          uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version_no)
);
CREATE INDEX question_versions_title_trgm ON hbe.question_versions USING gin (title gin_trgm_ops);
CREATE INDEX question_versions_tags ON hbe.question_versions USING gin (tags);

ALTER TABLE hbe.questions
  ADD CONSTRAINT questions_latest_fk FOREIGN KEY (latest_version_id) REFERENCES hbe.question_versions(id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT questions_published_fk FOREIGN KEY (published_version_id) REFERENCES hbe.question_versions(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE hbe.test_cases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   uuid NOT NULL REFERENCES hbe.question_versions(id) ON DELETE CASCADE,
  tenant_id    uuid,
  visibility   text NOT NULL CHECK (visibility IN ('sample', 'hidden')),
  ordinal      integer NOT NULL,
  input        text NOT NULL,
  expected     text NOT NULL,
  explanation  text NOT NULL DEFAULT '',
  weight       integer NOT NULL DEFAULT 1,
  is_stress    boolean NOT NULL DEFAULT false,
  UNIQUE (version_id, visibility, ordinal)
);

CREATE TABLE hbe.language_stubs (
  version_id  uuid NOT NULL REFERENCES hbe.question_versions(id) ON DELETE CASCADE,
  tenant_id   uuid,
  runtime     text NOT NULL,
  stub        text NOT NULL,
  PRIMARY KEY (version_id, runtime)
);

-- Drivers and reference solutions: authors and trusted system code only.
CREATE TABLE hbe.language_secrets (
  version_id  uuid NOT NULL REFERENCES hbe.question_versions(id) ON DELETE CASCADE,
  tenant_id   uuid,
  runtime     text NOT NULL,
  driver      text NOT NULL,
  solution    text NOT NULL,
  PRIMARY KEY (version_id, runtime)
);

-- Child tables inherit tenant_id from their parent, so a client can never smuggle one in.
-- Invoker rights on purpose: the lookup runs under the caller's RLS, so a parent the caller
-- cannot see yields NULL and the WITH CHECK clause then rejects the row.
CREATE FUNCTION hbe.inherit_tenant_from_question() RETURNS trigger LANGUAGE plpgsql
SET search_path = hbe, pg_temp AS $$
BEGIN
  SELECT q.tenant_id INTO NEW.tenant_id FROM hbe.questions q WHERE q.id = NEW.question_id;
  RETURN NEW;
END $$;
CREATE FUNCTION hbe.inherit_tenant_from_version() RETURNS trigger LANGUAGE plpgsql
SET search_path = hbe, pg_temp AS $$
BEGIN
  SELECT v.tenant_id INTO NEW.tenant_id FROM hbe.question_versions v WHERE v.id = NEW.version_id;
  RETURN NEW;
END $$;

CREATE TRIGGER question_versions_tenant BEFORE INSERT OR UPDATE OF question_id, tenant_id ON hbe.question_versions
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_question();
CREATE TRIGGER test_cases_tenant BEFORE INSERT OR UPDATE OF version_id, tenant_id ON hbe.test_cases
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_version();
CREATE TRIGGER language_stubs_tenant BEFORE INSERT OR UPDATE OF version_id, tenant_id ON hbe.language_stubs
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_version();
CREATE TRIGGER language_secrets_tenant BEFORE INSERT OR UPDATE OF version_id, tenant_id ON hbe.language_secrets
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_version();
CREATE TRIGGER questions_touch BEFORE UPDATE ON hbe.questions FOR EACH ROW EXECUTE FUNCTION hbe.touch_updated_at();
CREATE TRIGGER question_versions_touch BEFORE UPDATE ON hbe.question_versions FOR EACH ROW EXECUTE FUNCTION hbe.touch_updated_at();
CREATE TRIGGER users_touch BEFORE UPDATE ON hbe.users FOR EACH ROW EXECUTE FUNCTION hbe.touch_updated_at();
CREATE TRIGGER tenants_touch BEFORE UPDATE ON hbe.tenants FOR EACH ROW EXECUTE FUNCTION hbe.touch_updated_at();

-- A published version is frozen: tests pin it, so changing it would rewrite history.
CREATE FUNCTION hbe.forbid_published_version_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND (
       NEW.title, NEW.statement, NEW.constraints, NEW.input_format, NEW.output_format, NEW.difficulty,
       NEW.base_time_limit_ms, NEW.memory_limit_mb, NEW.compare)
     IS DISTINCT FROM (
       OLD.title, OLD.statement, OLD.constraints, OLD.input_format, OLD.output_format, OLD.difficulty,
       OLD.base_time_limit_ms, OLD.memory_limit_mb, OLD.compare) THEN
    RAISE EXCEPTION 'published question versions are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_versions_frozen BEFORE UPDATE ON hbe.question_versions
  FOR EACH ROW EXECUTE FUNCTION hbe.forbid_published_version_edit();

-- ---------------------------------------------------------------- submissions
CREATE TABLE hbe.submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  version_id      uuid NOT NULL REFERENCES hbe.question_versions(id) ON DELETE CASCADE,
  runtime         text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('run', 'submit', 'validate')),
  priority        text NOT NULL DEFAULT 'practice' CHECK (priority IN ('run', 'submit', 'practice', 'validate')),
  code            text NOT NULL,
  custom_input    text,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  verdict         text,
  passed          integer NOT NULL DEFAULT 0,
  total           integer NOT NULL DEFAULT 0,
  score           numeric(6, 2),
  compile_output  text,
  max_cpu_ms      integer,
  max_mem_kb      integer,
  dispatch_count  integer NOT NULL DEFAULT 0,
  lease_until     timestamptz,
  executor_id     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
CREATE INDEX submissions_user_question ON hbe.submissions (user_id, question_id, created_at DESC);
CREATE INDEX submissions_tenant_created ON hbe.submissions (tenant_id, created_at DESC);
CREATE INDEX submissions_pending ON hbe.submissions (status, lease_until) WHERE status IN ('queued', 'running');

CREATE TABLE hbe.submission_results (
  submission_id  uuid NOT NULL REFERENCES hbe.submissions(id) ON DELETE CASCADE,
  tenant_id      uuid,
  ordinal        integer NOT NULL,
  test_case_id   uuid,
  hidden         boolean NOT NULL,
  verdict        text NOT NULL,
  cpu_ms         integer NOT NULL,
  wall_ms        integer NOT NULL,
  mem_kb         integer NOT NULL,
  stdout         text, -- visible tests only
  stderr         text, -- visible tests only
  PRIMARY KEY (submission_id, ordinal)
);

CREATE TABLE hbe.drafts (
  user_id      uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  runtime      text NOT NULL,
  tenant_id    uuid,
  code         text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id, runtime)
);

-- ---------------------------------------------------------------- audit (append-only)
CREATE TABLE hbe.audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid,
  actor_id     uuid,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  data         jsonb NOT NULL DEFAULT '{}',
  ip           inet,
  user_agent   text,
  request_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_created ON hbe.audit_logs (tenant_id, created_at DESC);

-- ---------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hbe TO hbe_app;
REVOKE UPDATE, DELETE ON hbe.audit_logs FROM hbe_app;
GRANT EXECUTE ON FUNCTION hbe.app_role(), hbe.app_tenant(), hbe.app_user(), hbe.app_is_platform(), hbe.in_scope(uuid) TO hbe_app;

-- ---------------------------------------------------------------- row level security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','users','memberships','refresh_tokens','invites','batches','batch_members',
    'questions','question_versions','test_cases','language_stubs','language_secrets',
    'submissions','submission_results','drafts','audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE hbe.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE hbe.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- tenants: platform sees all; members see their own tenant.
CREATE POLICY tenants_read ON hbe.tenants FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR id = hbe.app_tenant()
         OR EXISTS (SELECT 1 FROM hbe.memberships m WHERE m.tenant_id = tenants.id AND m.user_id = hbe.app_user()));
CREATE POLICY tenants_write ON hbe.tenants FOR ALL TO hbe_app
  USING (hbe.app_is_platform()) WITH CHECK (hbe.app_is_platform());

-- users: self, platform, or tenant staff for users who are members of the active tenant.
CREATE POLICY users_read ON hbe.users FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR id = hbe.app_user()
         OR (hbe.app_role() IN ('client_admin', 'teacher', 'associate')
             AND EXISTS (SELECT 1 FROM hbe.memberships m WHERE m.user_id = users.id AND m.tenant_id = hbe.app_tenant())));
CREATE POLICY users_insert ON hbe.users FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_is_platform() OR (hbe.app_role() = 'client_admin' AND NOT is_platform_admin));
CREATE POLICY users_update ON hbe.users FOR UPDATE TO hbe_app
  USING (hbe.app_is_platform() OR id = hbe.app_user()
         OR (hbe.app_role() = 'client_admin'
             AND EXISTS (SELECT 1 FROM hbe.memberships m WHERE m.user_id = users.id AND m.tenant_id = hbe.app_tenant())))
  WITH CHECK (hbe.app_is_platform() OR NOT is_platform_admin);
CREATE POLICY users_delete ON hbe.users FOR DELETE TO hbe_app USING (hbe.app_is_platform());

-- memberships
CREATE POLICY memberships_read ON hbe.memberships FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR user_id = hbe.app_user()
         OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher', 'associate')));
CREATE POLICY memberships_write ON hbe.memberships FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'client_admin'))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'client_admin' AND role <> 'client_admin'));

-- auth secrets: trusted system code only
CREATE POLICY refresh_tokens_system ON hbe.refresh_tokens FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');
CREATE POLICY invites_system ON hbe.invites FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

-- batches
CREATE POLICY batches_read ON hbe.batches FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher', 'associate')));
CREATE POLICY batches_write ON hbe.batches FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher')))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher')));
CREATE POLICY batch_members_read ON hbe.batch_members FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR user_id = hbe.app_user()
         OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher', 'associate')));
CREATE POLICY batch_members_write ON hbe.batch_members FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher')))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher')));

-- questions: staff see their tenant + global bank; learners see published practice questions only.
CREATE POLICY questions_read ON hbe.questions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (hbe.in_scope(tenant_id) AND (
               hbe.app_role() IN ('teacher', 'associate')
               OR (status = 'published' AND is_practice AND published_version_id IS NOT NULL
                   AND hbe.app_role() IN ('student', 'guest', 'client_admin')
                   AND (tenant_id IS NULL OR hbe.app_role() <> 'guest')))));
CREATE POLICY questions_write ON hbe.questions FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()))
  WITH CHECK (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()));

CREATE POLICY question_versions_read ON hbe.question_versions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (hbe.in_scope(tenant_id) AND (
               hbe.app_role() IN ('teacher', 'associate')
               OR EXISTS (SELECT 1 FROM hbe.questions q WHERE q.published_version_id = question_versions.id))));
CREATE POLICY question_versions_write ON hbe.question_versions FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()))
  WITH CHECK (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()));

-- hidden tests: staff only; samples follow version visibility.
CREATE POLICY test_cases_read ON hbe.test_cases FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (hbe.in_scope(tenant_id) AND (
               hbe.app_role() IN ('teacher', 'associate')
               OR (visibility = 'sample' AND EXISTS (SELECT 1 FROM hbe.question_versions v WHERE v.id = test_cases.version_id)))));
CREATE POLICY test_cases_write ON hbe.test_cases FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()))
  WITH CHECK (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()));

CREATE POLICY language_stubs_read ON hbe.language_stubs FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR EXISTS (SELECT 1 FROM hbe.question_versions v WHERE v.id = language_stubs.version_id));
CREATE POLICY language_stubs_write ON hbe.language_stubs FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()))
  WITH CHECK (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()));

-- drivers + solutions: authors of the owning tenant (global ones: super admin only).
CREATE POLICY language_secrets_all ON hbe.language_secrets FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()))
  WITH CHECK (hbe.app_is_platform() OR (hbe.app_role() = 'teacher' AND tenant_id = hbe.app_tenant()));

-- submissions: own rows; tenant staff read their tenant; only system code updates results.
CREATE POLICY submissions_read ON hbe.submissions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR user_id = hbe.app_user()
         OR (tenant_id = hbe.app_tenant() AND hbe.app_role() IN ('client_admin', 'teacher', 'associate')));
CREATE POLICY submissions_insert ON hbe.submissions FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() = 'system'
              OR (user_id = hbe.app_user() AND tenant_id IS NOT DISTINCT FROM hbe.app_tenant() AND kind <> 'validate'));
CREATE POLICY submissions_update ON hbe.submissions FOR UPDATE TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');
CREATE POLICY submissions_delete ON hbe.submissions FOR DELETE TO hbe_app USING (hbe.app_role() = 'system');

CREATE POLICY submission_results_read ON hbe.submission_results FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR EXISTS (SELECT 1 FROM hbe.submissions s WHERE s.id = submission_results.submission_id));
CREATE POLICY submission_results_write ON hbe.submission_results FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

CREATE POLICY drafts_own ON hbe.drafts FOR ALL TO hbe_app
  USING (user_id = hbe.app_user() OR hbe.app_role() = 'system')
  WITH CHECK ((user_id = hbe.app_user() AND tenant_id IS NOT DISTINCT FROM hbe.app_tenant()) OR hbe.app_role() = 'system');

CREATE POLICY audit_insert ON hbe.audit_logs FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() <> '');
CREATE POLICY audit_read ON hbe.audit_logs FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'client_admin'));
