
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

-- Apply to the Neon Free testing database with a privileged migration role.
-- Runtime access is restricted to internal onboarding, not verified bank accounts.
GRANT SELECT,INSERT ON managed_customers TO ledgerly_api_runtime;
GRANT UPDATE(display_name,email,active,updated_at) ON managed_customers TO ledgerly_api_runtime;
GRANT SELECT,INSERT ON manager_audit_events TO ledgerly_api_runtime;
