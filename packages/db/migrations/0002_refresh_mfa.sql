-- Remember whether a session family was established with MFA, so refreshes keep the same assurance.
ALTER TABLE hbe.refresh_tokens ADD COLUMN mfa boolean NOT NULL DEFAULT false;
