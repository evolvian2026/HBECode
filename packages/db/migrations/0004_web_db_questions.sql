-- Phase 3: web (HTML/CSS/JS/React) and database (PostgreSQL/MySQL/MongoDB/Pandas) questions.
-- Type-specific data lives in jsonb validated by the API's zod schemas. Hidden checks/datasets
-- stay in test_cases (RLS: staff only); reference files/queries stay in language_secrets.
ALTER TABLE hbe.question_versions ADD COLUMN spec jsonb NOT NULL DEFAULT '{}';
ALTER TABLE hbe.test_cases ADD COLUMN spec jsonb NOT NULL DEFAULT '{}';

-- Student-safe explanation and (for visible DB datasets) the actual result table.
ALTER TABLE hbe.submission_results ADD COLUMN detail text;
ALTER TABLE hbe.submission_results ADD COLUMN result jsonb;

-- Web validation runs both the reference (must pass every check) and the starter files (must
-- fail at least one hidden check).
ALTER TABLE hbe.submissions ADD COLUMN validation_role text CHECK (validation_role IN ('reference', 'starter'));

-- The published-version freeze also covers the type-specific spec.
CREATE OR REPLACE FUNCTION hbe.forbid_published_version_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND (
       NEW.title, NEW.statement, NEW.constraints, NEW.input_format, NEW.output_format, NEW.difficulty,
       NEW.base_time_limit_ms, NEW.memory_limit_mb, NEW.compare, NEW.spec)
     IS DISTINCT FROM (
       OLD.title, OLD.statement, OLD.constraints, OLD.input_format, OLD.output_format, OLD.difficulty,
       OLD.base_time_limit_ms, OLD.memory_limit_mb, OLD.compare, OLD.spec) THEN
    RAISE EXCEPTION 'published question versions are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Test cases of a published version are frozen too (expected results are written by validation
-- before publishing, never after).
CREATE FUNCTION hbe.forbid_published_test_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM hbe.question_versions v WHERE v.id = OLD.version_id AND v.published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'tests of a published question version are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER test_cases_frozen BEFORE UPDATE OR DELETE ON hbe.test_cases
  FOR EACH ROW EXECUTE FUNCTION hbe.forbid_published_test_edit();
