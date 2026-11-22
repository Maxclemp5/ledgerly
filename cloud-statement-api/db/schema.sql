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

-- Grants to apply separately as a privileged database administrator:
-- GRANT SELECT ON customer_identity_links, verified_accounts, manager_authorizations TO ledgerly_api_runtime;
-- GRANT SELECT, INSERT ON statement_requests TO ledgerly_api_runtime;
-- The issuer worker has separate, narrowly-scoped UPDATE/SELECT roles.
-- Never grant ledgerly_api_runtime UPDATE on verified_accounts or ISSUED status.
