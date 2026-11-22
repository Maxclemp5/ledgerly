# Manager access — development and future handoff

The dashboard does **not** automatically grant Manager access to a user who selects the Manager sign-in tab. Only active administrator-owned `manager_authorizations` rows can grant it.

The existing Neon Free test database currently has **no manager grants** and **no verified customer accounts**.

## Granting access (database owner only)

1. Sign in to Neon with the owner's administrative account.
2. Open the `ledgerly-free-test` project and its `ledgerly_test` SQL Editor.
3. Find the legitimate manager's **exact** Neon Auth user ID under the Neon Auth Users list. Confirm their email and identity with your issuer administrator.
4. Confirm the **exact issuer organization ID** through the trusted issuer system.
5. In a privileged Neon SQL Editor session, replace the placeholders in this example with administrator-verified values:

```sql
INSERT INTO public.manager_authorizations(auth_user_id,issuer_org_id,active)
VALUES ('NEON_AUTH_USER_ID_HERE','ISSUER_ORGANIZATION_ID_HERE',true)
ON CONFLICT (auth_user_id,issuer_org_id)
DO UPDATE SET active=true;
```

This is an administrative permission change. Neither the browser nor the runtime database role is allowed to write that table. **Never** accept a manager's submitted issuer ID as proof of authority. Audit grants against an internal approval record.

## Revoking access

Run from the **administrative** database session (not the runtime API role):

```sql
UPDATE public.manager_authorizations
SET active=false
WHERE auth_user_id='NEON_AUTH_USER_ID_HERE'
  AND issuer_org_id='ISSUER_ORGANIZATION_ID_HERE';
```

Every protected API request checks current manager grants and issuer ownership in the database. Revoked users cannot obtain a new manager API response merely by reusing a still-valid JWT.

## Available manager routes

- `GET /v1/me/access` — whether the signed-in user holds manager grants and their authorized issuer IDs.
- `GET /v1/manager/summary` — issuer-scoped counts.
- `GET /v1/manager/customers?query=abc` — search by 3+ customer ID prefix (no broad unscoped listing).
- `GET /v1/manager/customers/:customerId/accounts` — only accounts whose issuer matches a manager grant.
- `GET /v1/manager/statement-requests` — request queue for authorized issuer IDs.
- `POST /v1/manager/customers/:customerId/statement-requests` — creates a request only for issuer-verified accounts.

There is intentionally no public user-management endpoint for granting roles or verifying account balances. Customer mappings and verified accounts must be supplied by an authorized issuer system, not inserted by the dashboard.

## Before going live

Require a formal administrator approval and audit trail, protected branch, private repository, full access review, signup-abuse controls, tested backups/recovery, production SMTP, rate limiting, strong phishing-resistant authentication/MFA (or a provider that supports it), and separate security/penetration testing. The current free deployment is for test accounts only, **not** production customer banking data.

When the owner instructs OpenAI/ChatGPT to stop accessing the system, disconnect GitHub, Render and Neon integrations in ChatGPT settings, revoke their grants/tokens at providers, and rotate keys where needed. This is an owner-controlled handoff; the app's own hosting and database need not depend on ChatGPT integrations.
