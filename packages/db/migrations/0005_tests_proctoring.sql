-- Phase 4: tests (assessments), attempts, proctoring.
--
-- Rules enforced here (independently of the API):
--   * every table is tenant-scoped, RLS forced; child rows inherit tenant_id from their parent;
--   * students see only published tests assigned to them (directly or through a batch), and the
--     questions of a test only while they have an attempt in progress for it;
--   * students can never update an attempt (score, deadline, status, session) — only trusted
--     system code and tenant proctors can;
--   * a student's attempt submission/draft is refused by RLS once the server deadline has passed;
--   * proctoring events are append-only for the app role; snapshots are staff-only.

-- ---------------------------------------------------------------- tests
CREATE TABLE hbe.tests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES hbe.tenants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  duration_min  integer NOT NULL CHECK (duration_min BETWEEN 1 AND 1440),
  settings      jsonb NOT NULL DEFAULT '{}',
  created_by    uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  published_at  timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX tests_tenant_status ON hbe.tests (tenant_id, status, starts_at DESC);
CREATE TRIGGER tests_touch BEFORE UPDATE ON hbe.tests FOR EACH ROW EXECUTE FUNCTION hbe.touch_updated_at();

-- version_id is pinned when the test is published (questions are immutable once published).
CREATE TABLE hbe.test_questions (
  test_id      uuid NOT NULL REFERENCES hbe.tests(id) ON DELETE CASCADE,
  tenant_id    uuid,
  question_id  uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE RESTRICT,
  version_id   uuid REFERENCES hbe.question_versions(id) ON DELETE RESTRICT,
  ordinal      integer NOT NULL,
  points       numeric(6, 2) NOT NULL DEFAULT 100 CHECK (points > 0),
  PRIMARY KEY (test_id, question_id)
);
CREATE INDEX test_questions_version ON hbe.test_questions (version_id);
CREATE INDEX test_questions_question ON hbe.test_questions (question_id);

CREATE TABLE hbe.test_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id    uuid NOT NULL REFERENCES hbe.tests(id) ON DELETE CASCADE,
  tenant_id  uuid,
  batch_id   uuid REFERENCES hbe.batches(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES hbe.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(batch_id, user_id) = 1),
  UNIQUE (test_id, batch_id),
  UNIQUE (test_id, user_id)
);
CREATE INDEX test_assignments_user ON hbe.test_assignments (user_id);
CREATE INDEX test_assignments_batch ON hbe.test_assignments (batch_id);

-- ---------------------------------------------------------------- attempts
CREATE TABLE hbe.attempts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid,
  test_id              uuid NOT NULL REFERENCES hbe.tests(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES hbe.users(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'in_progress'
                         CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'terminated')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  deadline_at          timestamptz NOT NULL,
  extra_minutes        integer NOT NULL DEFAULT 0,
  submitted_at         timestamptz,
  submit_reason        text CHECK (submit_reason IN ('student', 'deadline', 'violations', 'proctor', 'test_closed')),
  score                numeric(8, 2),
  max_score            numeric(8, 2),
  breakdown            jsonb NOT NULL DEFAULT '{}',
  violation_count      integer NOT NULL DEFAULT 0,
  warning_level        integer NOT NULL DEFAULT 0,
  -- sha256 of the device token of the one session allowed to act on this attempt
  active_session_hash  text,
  last_heartbeat_at    timestamptz,
  heartbeat_gap_open   boolean NOT NULL DEFAULT false,
  ip                   inet,
  user_agent           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, user_id)
);
CREATE INDEX attempts_open ON hbe.attempts (status, deadline_at) WHERE status = 'in_progress';
CREATE INDEX attempts_user ON hbe.attempts (user_id);
CREATE TRIGGER attempts_touch BEFORE UPDATE ON hbe.attempts FOR EACH ROW EXECUTE FUNCTION hbe.touch_updated_at();

-- Every device that opened the attempt. A second device waits in `pending` until a proctor
-- approves it (owner decision Q3: block, not take over).
CREATE TABLE hbe.attempt_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id   uuid NOT NULL REFERENCES hbe.attempts(id) ON DELETE CASCADE,
  tenant_id    uuid,
  token_hash   text NOT NULL UNIQUE,
  status       text NOT NULL CHECK (status IN ('active', 'pending', 'denied', 'replaced')),
  fingerprint  text,
  ip           inet,
  user_agent   text,
  decided_by   uuid REFERENCES hbe.users(id) ON DELETE SET NULL,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempt_sessions_attempt ON hbe.attempt_sessions (attempt_id, created_at);

CREATE TABLE hbe.attempt_drafts (
  attempt_id   uuid NOT NULL REFERENCES hbe.attempts(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES hbe.questions(id) ON DELETE CASCADE,
  runtime      text NOT NULL,
  tenant_id    uuid,
  code         text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id, runtime)
);

-- ---------------------------------------------------------------- proctoring
CREATE TABLE hbe.proctor_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid,
  attempt_id  uuid NOT NULL REFERENCES hbe.attempts(id) ON DELETE CASCADE,
  type        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high')),
  counted     boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server', 'proctor')),
  client_ts   timestamptz,
  server_ts   timestamptz NOT NULL DEFAULT now(),
  data        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX proctor_events_attempt ON hbe.proctor_events (attempt_id, server_ts);

-- Webcam frames, captured only right after a flagged event and only with the student's consent.
-- Small JPEGs (size-capped by the API), deleted by the retention sweep.
CREATE TABLE hbe.proctor_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  attempt_id    uuid NOT NULL REFERENCES hbe.attempts(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  content_type  text NOT NULL CHECK (content_type = 'image/jpeg'),
  image         bytea NOT NULL,
  size_bytes    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proctor_snapshots_attempt ON hbe.proctor_snapshots (attempt_id, created_at);
CREATE INDEX proctor_snapshots_created ON hbe.proctor_snapshots (created_at);

-- Submissions made inside a test count toward the attempt.
ALTER TABLE hbe.submissions ADD COLUMN attempt_id uuid REFERENCES hbe.attempts(id) ON DELETE CASCADE;
CREATE INDEX submissions_attempt ON hbe.submissions (attempt_id, question_id) WHERE attempt_id IS NOT NULL;

-- ---------------------------------------------------------------- tenant inheritance
CREATE FUNCTION hbe.inherit_tenant_from_test() RETURNS trigger LANGUAGE plpgsql
SET search_path = hbe, pg_temp AS $$
BEGIN
  SELECT t.tenant_id INTO NEW.tenant_id FROM hbe.tests t WHERE t.id = NEW.test_id;
  RETURN NEW;
END $$;
CREATE FUNCTION hbe.inherit_tenant_from_attempt() RETURNS trigger LANGUAGE plpgsql
SET search_path = hbe, pg_temp AS $$
BEGIN
  SELECT a.tenant_id INTO NEW.tenant_id FROM hbe.attempts a WHERE a.id = NEW.attempt_id;
  RETURN NEW;
END $$;
CREATE TRIGGER test_questions_tenant BEFORE INSERT OR UPDATE OF test_id, tenant_id ON hbe.test_questions
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_test();
CREATE TRIGGER test_assignments_tenant BEFORE INSERT OR UPDATE OF test_id, tenant_id ON hbe.test_assignments
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_test();
CREATE TRIGGER attempts_tenant BEFORE INSERT OR UPDATE OF test_id, tenant_id ON hbe.attempts
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_test();
CREATE TRIGGER attempt_sessions_tenant BEFORE INSERT OR UPDATE OF attempt_id, tenant_id ON hbe.attempt_sessions
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_attempt();
CREATE TRIGGER attempt_drafts_tenant BEFORE INSERT OR UPDATE OF attempt_id, tenant_id ON hbe.attempt_drafts
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_attempt();
CREATE TRIGGER proctor_events_tenant BEFORE INSERT ON hbe.proctor_events
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_attempt();
CREATE TRIGGER proctor_snapshots_tenant BEFORE INSERT OR UPDATE OF attempt_id, tenant_id ON hbe.proctor_snapshots
  FOR EACH ROW EXECUTE FUNCTION hbe.inherit_tenant_from_attempt();

-- ---------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON hbe.tests, hbe.test_questions, hbe.test_assignments, hbe.attempts,
  hbe.attempt_sessions, hbe.attempt_drafts, hbe.proctor_snapshots TO hbe_app;
GRANT SELECT, INSERT, DELETE ON hbe.proctor_events TO hbe_app; -- append-only (DELETE: retention, system only)

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tests','test_questions','test_assignments','attempts','attempt_sessions','attempt_drafts',
    'proctor_events','proctor_snapshots']
  LOOP
    EXECUTE format('ALTER TABLE hbe.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE hbe.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE FUNCTION hbe.app_is_tenant_staff() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT hbe.app_role() IN ('client_admin', 'teacher', 'associate') $$;
GRANT EXECUTE ON FUNCTION hbe.app_is_tenant_staff() TO hbe_app;

-- tests: tenant staff; students only published/closed tests assigned to them.
CREATE POLICY tests_read ON hbe.tests FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (tenant_id = hbe.app_tenant() AND (
               hbe.app_is_tenant_staff()
               OR (hbe.app_role() = 'student' AND status IN ('published', 'closed') AND EXISTS (
                     SELECT 1 FROM hbe.test_assignments ta
                     WHERE ta.test_id = tests.id
                       AND (ta.user_id = hbe.app_user()
                            OR EXISTS (SELECT 1 FROM hbe.batch_members bm WHERE bm.batch_id = ta.batch_id AND bm.user_id = hbe.app_user())))))));
CREATE POLICY tests_write ON hbe.tests FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'));

CREATE POLICY test_questions_read ON hbe.test_questions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (tenant_id = hbe.app_tenant() AND (
               hbe.app_is_tenant_staff()
               OR (hbe.app_role() = 'student' AND EXISTS (SELECT 1 FROM hbe.tests t WHERE t.id = test_questions.test_id)))));
CREATE POLICY test_questions_write ON hbe.test_questions FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'));

CREATE POLICY test_assignments_read ON hbe.test_assignments FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (tenant_id = hbe.app_tenant() AND (
               hbe.app_is_tenant_staff()
               OR (hbe.app_role() = 'student' AND (user_id = hbe.app_user()
                     OR EXISTS (SELECT 1 FROM hbe.batch_members bm WHERE bm.batch_id = test_assignments.batch_id AND bm.user_id = hbe.app_user()))))));
CREATE POLICY test_assignments_write ON hbe.test_assignments FOR ALL TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'))
  WITH CHECK (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_role() = 'teacher'));

-- attempts: own (student) or tenant staff. Students may only create their own in-progress
-- attempt for a test they can see; they can never update one.
CREATE POLICY attempts_read ON hbe.attempts FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR user_id = hbe.app_user() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY attempts_insert ON hbe.attempts FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() = 'system'
              OR (hbe.app_role() = 'student' AND user_id = hbe.app_user() AND tenant_id = hbe.app_tenant()
                  AND status = 'in_progress' AND score IS NULL AND violation_count = 0
                  AND EXISTS (SELECT 1 FROM hbe.tests t WHERE t.id = attempts.test_id AND t.status = 'published')));
CREATE POLICY attempts_update ON hbe.attempts FOR UPDATE TO hbe_app
  USING (hbe.app_role() = 'system' OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()))
  WITH CHECK (hbe.app_role() = 'system' OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY attempts_delete ON hbe.attempts FOR DELETE TO hbe_app USING (hbe.app_is_platform());

CREATE POLICY attempt_sessions_read ON hbe.attempt_sessions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY attempt_sessions_insert ON hbe.attempt_sessions FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() = 'system');
CREATE POLICY attempt_sessions_update ON hbe.attempt_sessions FOR UPDATE TO hbe_app
  USING (hbe.app_role() = 'system' OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()))
  WITH CHECK (hbe.app_role() = 'system' OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY attempt_sessions_delete ON hbe.attempt_sessions FOR DELETE TO hbe_app USING (hbe.app_is_platform());

-- drafts: the student's own in-progress attempt, before its deadline.
CREATE POLICY attempt_drafts_read ON hbe.attempt_drafts FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR EXISTS (SELECT 1 FROM hbe.attempts a WHERE a.id = attempt_drafts.attempt_id AND a.user_id = hbe.app_user())
         OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY attempt_drafts_write ON hbe.attempt_drafts FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system'
         OR EXISTS (SELECT 1 FROM hbe.attempts a WHERE a.id = attempt_drafts.attempt_id AND a.user_id = hbe.app_user()
                    AND a.status = 'in_progress' AND a.deadline_at > now()))
  WITH CHECK (hbe.app_role() = 'system'
         OR EXISTS (SELECT 1 FROM hbe.attempts a WHERE a.id = attempt_drafts.attempt_id AND a.user_id = hbe.app_user()
                    AND a.status = 'in_progress' AND a.deadline_at > now()));

CREATE POLICY proctor_events_read ON hbe.proctor_events FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY proctor_events_insert ON hbe.proctor_events FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() = 'system' OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff() AND source = 'proctor'));
CREATE POLICY proctor_events_delete ON hbe.proctor_events FOR DELETE TO hbe_app USING (hbe.app_role() = 'system');

CREATE POLICY proctor_snapshots_read ON hbe.proctor_snapshots FOR SELECT TO hbe_app
  USING (hbe.app_is_platform() OR (tenant_id = hbe.app_tenant() AND hbe.app_is_tenant_staff()));
CREATE POLICY proctor_snapshots_write ON hbe.proctor_snapshots FOR ALL TO hbe_app
  USING (hbe.app_role() = 'system') WITH CHECK (hbe.app_role() = 'system');

-- ---------------------------------------------------------------- question visibility in tests
-- A student may read a (non-practice) question, its pinned version, sample tests and stubs only
-- while they have an in-progress attempt of a test that contains it. Hidden tests and secrets
-- stay staff-only: the test_cases/language_secrets policies are unchanged.
CREATE FUNCTION hbe.in_my_open_attempt(q uuid, v uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT hbe.app_role() = 'student' AND EXISTS (
    SELECT 1 FROM hbe.test_questions tq JOIN hbe.attempts a ON a.test_id = tq.test_id
    WHERE a.user_id = hbe.app_user() AND a.status = 'in_progress'
      AND (q IS NULL OR tq.question_id = q) AND (v IS NULL OR tq.version_id = v))
$$;
GRANT EXECUTE ON FUNCTION hbe.in_my_open_attempt(uuid, uuid) TO hbe_app;

DROP POLICY questions_read ON hbe.questions;
CREATE POLICY questions_read ON hbe.questions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (hbe.in_scope(tenant_id) AND (
               hbe.app_role() IN ('teacher', 'associate')
               OR (status = 'published' AND is_practice AND published_version_id IS NOT NULL
                   AND hbe.app_role() IN ('student', 'guest', 'client_admin')
                   AND (tenant_id IS NULL OR hbe.app_role() <> 'guest'))
               OR hbe.in_my_open_attempt(id, NULL))));

DROP POLICY question_versions_read ON hbe.question_versions;
CREATE POLICY question_versions_read ON hbe.question_versions FOR SELECT TO hbe_app
  USING (hbe.app_is_platform()
         OR (hbe.in_scope(tenant_id) AND (
               hbe.app_role() IN ('teacher', 'associate')
               OR EXISTS (SELECT 1 FROM hbe.questions q WHERE q.published_version_id = question_versions.id)
               OR hbe.in_my_open_attempt(NULL, id))));

-- A submission that names an attempt must be the user's own open attempt, before the deadline.
DROP POLICY submissions_insert ON hbe.submissions;
CREATE POLICY submissions_insert ON hbe.submissions FOR INSERT TO hbe_app
  WITH CHECK (hbe.app_role() = 'system'
              OR (user_id = hbe.app_user() AND tenant_id IS NOT DISTINCT FROM hbe.app_tenant() AND kind <> 'validate'
                  AND (attempt_id IS NULL OR EXISTS (
                        SELECT 1 FROM hbe.attempts a WHERE a.id = submissions.attempt_id AND a.user_id = hbe.app_user()
                          AND a.status = 'in_progress' AND a.deadline_at > now()))));
