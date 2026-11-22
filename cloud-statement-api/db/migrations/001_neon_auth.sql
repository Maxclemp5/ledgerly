-- Apply ONLY to the isolated empty Neon Free test database, as a database owner.
-- Existing Cloud SQL / Render paid service databases are not changed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_identity_links'
      AND column_name='firebase_uid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_identity_links'
      AND column_name='auth_user_id'
  ) THEN
    ALTER TABLE public.customer_identity_links RENAME COLUMN firebase_uid TO auth_user_id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.manager_authorizations (
  auth_user_id text NOT NULL,
  issuer_org_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(auth_user_id,issuer_org_id)
);
CREATE INDEX IF NOT EXISTS manager_authorizations_by_org_idx
  ON public.manager_authorizations(issuer_org_id) WHERE active;

GRANT USAGE ON SCHEMA public TO ledgerly_api_runtime;
GRANT SELECT ON public.manager_authorizations TO ledgerly_api_runtime;
-- IMPORTANT: No INSERT/UPDATE/DELETE grant for manager_authorizations.
