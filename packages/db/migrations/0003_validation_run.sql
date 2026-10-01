-- Ties a validation submission to one validation run, so results that arrive after the question
-- was edited (same version row, new content) are ignored instead of being credited to it.
ALTER TABLE hbe.submissions ADD COLUMN validation_run uuid;
CREATE INDEX submissions_validation_run ON hbe.submissions (validation_run) WHERE validation_run IS NOT NULL;
