-- backend/migrations/010_auth_identity_uniqueness.sql
--
-- Auth users are JSON documents keyed by user id. Enforce the two external
-- identity keys at the database boundary so concurrent backend instances
-- cannot persist duplicate email or Apple subject ownership.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM persistence_auth_users
    WHERE NULLIF(BTRIM(value->>'email'), '') IS NOT NULL
    GROUP BY LOWER(BTRIM(value->>'email'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce auth email uniqueness: persistence_auth_users contains duplicate normalized emails';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM persistence_auth_users
    WHERE NULLIF(BTRIM(value->>'appleSubject'), '') IS NOT NULL
    GROUP BY BTRIM(value->>'appleSubject')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce Apple subject uniqueness: persistence_auth_users contains duplicate Apple subjects';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS persistence_auth_users_email_unique_idx
  ON persistence_auth_users (LOWER(BTRIM(value->>'email')))
  WHERE NULLIF(BTRIM(value->>'email'), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS persistence_auth_users_apple_subject_unique_idx
  ON persistence_auth_users (BTRIM(value->>'appleSubject'))
  WHERE NULLIF(BTRIM(value->>'appleSubject'), '') IS NOT NULL;

COMMIT;
