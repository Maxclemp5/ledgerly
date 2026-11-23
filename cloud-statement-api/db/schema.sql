-- Apply with a privileged migration role. Runtime DB role must NOT own tables.
-- Account mappings must be populated only by an issuer-controlled source-of-truth
-- integration after authentication and account ownership have been established.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customer_identity_links (
  auth_user_id text NOT NULL,
  customer_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(auth_user_id,customer_id)
);
CREATE INDEX IF NOT EXISTS customer_identity_link_customer_idx
  ON customer_identity_links(customer_id) WHERE active;

CREATE TABLE IF NOT EXISTS verified_accounts (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  issuer_org_id text NOT NULL,
  display_name text NOT NULL,
  masked_number text NOT NULL CHECK (masked_number ~ '^\*{4}[0-9]{0,4}$'),
  currency char(3) NOT NULL,
  verification_status text NOT NULL
    CHECK (verification_status IN ('pending','verified','revoked')),
  source_system text NOT NULL,
  source_verified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  CHECK (verification_status <> 'verified' OR source_verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS verified_accounts_customer_idx
  ON verified_accounts(customer_id,issuer_org_id) WHERE active;

CREATE TABLE IF NOT EXISTS statement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  account_id text NOT NULL REFERENCES verified_accounts(id),
  issuer_org_id text NOT NULL,
  requested_by_uid text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_ISSUER'
    CHECK (status IN ('PENDING_ISSUER','REJECTED','ISSUED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS statement_requests_customer_idx
  ON statement_requests(customer_id,created_at DESC);

-- Manager authorization is granted only by a trusted database administrator.
-- The API role can SELECT grants but must never INSERT, UPDATE or DELETE them.
CREATE TABLE IF NOT EXISTS manager_authorizations (
  auth_user_id text NOT NULL,
  issuer_org_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(auth_user_id, issuer_org_id)
);
CREATE INDEX IF NOT EXISTS manager_authorizations_by_org_idx
  ON manager_authorizations(issuer_org_id) WHERE active;


-- Internal customer intake: never represented as issuer-verified bank records.
CREATE TABLE IF NOT EXISTS managed_customers (
  customer_id text PRIMARY KEY DEFAULT ('cust_' || replace(gen_random_uuid()::text,'-','')),
  issuer_org_id text NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  email text,
  status text NOT NULL DEFAULT 'unverified' CHECK(status='unverified'),
  created_by_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS managed_customers_issuer_idx ON managed_customers(issuer_org_id,created_at DESC) WHERE active;
CREATE TABLE IF NOT EXISTS manager_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid text NOT NULL,
  issuer_org_id text NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('customer.created','customer.updated','customer.archived')),
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_audit_issuer_idx ON manager_audit_events(issuer_org_id,created_at DESC);


-- A manager granted access with a provisional password must change it after
-- the grant timestamp before any manager API becomes usable.
ALTER TABLE public.manager_authorizations
  ADD COLUMN IF NOT EXISTS require_password_change boolean NOT NULL DEFAULT true;

-- The app role must never read Neon Auth password hashes. A SECURITY DEFINER
-- boolean-only check compares the credential-account update timestamp.
CREATE OR REPLACE FUNCTION public.manager_password_changed_since(p_uid text,p_since timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $
  SELECT EXISTS (
    SELECT 1 FROM neon_auth.account a
    WHERE a."userId"::text=p_uid
      AND a."providerId"='credential'
      AND a.password IS NOT NULL
      AND a."updatedAt" > p_since
  )
$;
REVOKE ALL ON FUNCTION public.manager_password_changed_since(text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_password_changed_since(text,timestamptz) TO ledgerly_api_runtime;

-- Grants to apply separately as a privileged database administrator:
-- GRANT SELECT ON customer_identity_links, verified_accounts, manager_authorizations TO ledgerly_api_runtime;
-- GRANT SELECT, INSERT ON statement_requests TO ledgerly_api_runtime;
-- The issuer worker has separate, narrowly-scoped UPDATE/SELECT roles.
-- Never grant ledgerly_api_runtime UPDATE on verified_accounts or ISSUED status.

CREATE TABLE IF NOT EXISTS public.statement_delivery_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid text NOT NULL,
  organization_reference text NOT NULL,
  customer_reference text NOT NULL,
  account_reference text NOT NULL,
  request_reference text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  action text NOT NULL CHECK (action IN ('statement.generated','statement.downloaded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS statement_delivery_audit_org_created_idx
  ON public.statement_delivery_audit(organization_reference,created_at DESC);
CREATE INDEX IF NOT EXISTS statement_delivery_audit_account_period_idx
  ON public.statement_delivery_audit(account_reference,period_start,period_end);
