
-- A manager granted access with a provisional password must change it after
-- the grant timestamp before any manager API becomes usable.
ALTER TABLE public.manager_authorizations
  ADD COLUMN IF NOT EXISTS require_password_change boolean NOT NULL DEFAULT true;

-- The app role must never read Neon Auth password hashes. A SECURITY DEFINER
-- boolean-only check compares the credential-account update timestamp.
CREATE OR REPLACE FUNCTION public.manager_password_changed_since(p_uid text,p_since timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM neon_auth.account a
    WHERE a."userId"::text=p_uid
      AND a."providerId"='credential'
      AND a.password IS NOT NULL
      AND a."updatedAt" > p_since
  )
$$;
REVOKE ALL ON FUNCTION public.manager_password_changed_since(text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_password_changed_since(text,timestamptz) TO ledgerly_api_runtime;
