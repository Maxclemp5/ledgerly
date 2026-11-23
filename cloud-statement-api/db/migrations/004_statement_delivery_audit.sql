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

-- The runtime role can only append statement audit events; it cannot alter or erase them.
GRANT INSERT ON TABLE public.statement_delivery_audit TO ledgerly_api_runtime;
