-- Phase 6: reports and plagiarism.
--
-- Dashboards read rollup tables, never raw submissions. Rollups are updated incrementally when a
-- submission is graded and can be rebuilt from the raw tables at any time (they hold no data of
-- their own). Test reports read `attempts`, which already carries the per-question breakdown and
-- score maintained by the attempt scorer (Phase 4).

-- Per question, per day, per language: practice and test activity of one institution.
CREATE TABLE hbe.rpt_question_daily (
  tenant_id    uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  day          date NOT NULL,
  runtime      text NOT NULL,
  runs         integer NOT NULL DEFAULT 0,
  submits      integer NOT NULL DEFAULT 0,
  accepted     integer NOT NULL DEFAULT 0,
  score_sum    numeric(12, 2) NOT NULL DEFAULT 0,
  -- verdict -> count, for submits
  verdicts     jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, question_id, day, runtime)
);
CREATE INDEX rpt_question_daily_day ON hbe.rpt_question_daily (tenant_id, day);

-- Per student and question: best submit score (practice and tests together).
CREATE TABLE hbe.rpt_student_question (
  tenant_id        uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  question_id      uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  runs             integer NOT NULL DEFAULT 0,
  submits          integer NOT NULL DEFAULT 0,
  best_score       numeric(6, 2) NOT NULL DEFAULT 0,
  solved           boolean NOT NULL DEFAULT false,
  first_solved_at  timestamptz,
  last_at          timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, user_id, question_id)
);
CREATE INDEX rpt_student_question_q ON hbe.rpt_student_question (tenant_id, question_id);

-- Per institution and day.
CREATE TABLE hbe.rpt_tenant_daily (
  tenant_id  uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  day        date NOT NULL,
  runs       integer NOT NULL DEFAULT 0,
  submits    integer NOT NULL DEFAULT 0,
  accepted   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
-- Distinct active users per day (count rows; a set, so updates are idempotent).
CREATE TABLE hbe.rpt_tenant_daily_users (
  tenant_id  uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  day        date NOT NULL,
  user_id    uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, day, user_id)
);

-- Whole platform per day (includes guests); super admins only.
CREATE TABLE hbe.rpt_platform_daily (
  day              date PRIMARY KEY,
  runs             integer NOT NULL DEFAULT 0,
  submits          integer NOT NULL DEFAULT 0,
  accepted         integer NOT NULL DEFAULT 0,
  internal_errors  integer NOT NULL DEFAULT 0,
  guest_runs       integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- plagiarism
CREATE TABLE hbe.plagiarism_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  test_id      uuid NOT NULL REFERENCES hbe.tests(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  params       jsonb NOT NULL DEFAULT '{}',
  counts       jsonb NOT NULL DEFAULT '{}',
  error        text,
  created_by   uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  lease_until  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX plagiarism_runs_test ON hbe.plagiarism_runs (test_id, created_at DESC);

CREATE TABLE hbe.plagiarism_pairs (
  run_id       uuid NOT NULL REFERENCES hbe.plagiarism_runs(id) ON DELETE CASCADE,
  tenant_id    uuid,
  question_id  uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  sub_a        uuid NOT NULL REFERENCES hbe.submissions(id) ON DELETE CASCADE,
  sub_b        uuid NOT NULL REFERENCES hbe.submissions(id) ON DELETE CASCADE,
  user_a       uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  user_b       uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  similarity   numeric(5, 4) NOT NULL,
  matched      integer NOT NULL,
  -- matched line ranges in each source: { "a": [[from, to], ...], "b": [[from, to], ...] }
  regions      jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, question_id, sub_a, sub_b)
);
CREATE INDEX plagiarism_pairs_run ON hbe.plagiarism_pairs (run_id, similarity DESC);

CREATE TRIGGER plagiarism_runs_tenant BEFORE INSERT OR UPDATE OF test_id, tenant_id ON hbe.plagiarism_runs
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_test();
CREATE FUNCTION hbe.inherit_tenant_from_plagiarism_run() RETURNS trigger LANGUAGE plpgsql
SET search_path = hbe, pg_temp AS $$
BEGIN
  SELECT r.tenant_id INTO NEW.tenant_id FROM hbe.plagiarism_runs r WHERE r.id = NEW.run_id;
  RETURN NEW;
END $$;
CREATE TRIGGER plagiarism_pairs_tenant BEFORE INSERT OR UPDATE OF run_id, tenant_id ON hbe.plagiarism_pairs
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_plagiarism_run();

-- Report queries over attempts by institution and time.
CREATE INDEX attempts_tenant_started ON hbe.attempts (tenant_id, started_at DESC);
CREATE INDEX attempts_test_status ON hbe.attempts (test_id, status);

-- ---------------------------------------------------------------- grants and RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON hbe.rpt_question_daily, hbe.rpt_student_question, hbe.rpt_tenant_daily,
  hbe.rpt_tenant_daily_users, hbe.rpt_platform_daily, hbe.plagiarism_runs, hbe.plagiarism_pairs TO hbe_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rpt_question_daily','rpt_student_question','rpt_tenant_daily','rpt_tenant_daily_users',
    'rpt_platform_daily','plagiarism_runs','plagiarism_pairs']
  LOOP
    EXECUTE format('ALTER TABLE hbe.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE hbe.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Rollups: tenant staff read their institution; only trusted system code writes.
CREATE POLICY rpt_question_daily_read ON hbe.rpt_question_daily FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY rpt_question_daily_write ON hbe.rpt_question_daily FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

-- A student also reads their own rows (their own progress report).
CREATE POLICY rpt_student_question_read ON hbe.rpt_student_question FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND (hbe.app_is_tenant_staff() OR user_id = hbe.app_user())));
CREATE POLICY rpt_student_question_write ON hbe.rpt_student_question FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

CREATE POLICY rpt_tenant_daily_read ON hbe.rpt_tenant_daily FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY rpt_tenant_daily_write ON hbe.rpt_tenant_daily FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');
CREATE POLICY rpt_tenant_daily_users_read ON hbe.rpt_tenant_daily_users FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY rpt_tenant_daily_users_write ON hbe.rpt_tenant_daily_users FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

CREATE POLICY rpt_platform_daily_read ON hbe.rpt_platform_daily FOR SELECT TO hbe_app USING (hbe.app_is_platform());
CREATE POLICY rpt_platform_daily_write ON hbe.rpt_platform_daily FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

-- Plagiarism: tenant staff read; teachers start runs; results are written by system code only.
CREATE POLICY plagiarism_runs_read ON hbe.plagiarism_runs FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY plagiarism_runs_insert ON hbe.plagiarism_runs FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() = 'system' OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher' AND status = 'queued'));
CREATE POLICY plagiarism_runs_update ON hbe.plagiarism_runs FOR UPDATE TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');
CREATE POLICY plagiarism_runs_delete ON hbe.plagiarism_runs FOR DELETE TO hbe_app USING (hbe.app_is_platform());
CREATE POLICY plagiarism_pairs_read ON hbe.plagiarism_pairs FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY plagiarism_pairs_write ON hbe.plagiarism_pairs FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');
