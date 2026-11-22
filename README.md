# LedgerDesk — organization-level Manager module (development)

LedgerDesk currently runs as a **Manager-only, organization-scoped test portal** on Render Free + Neon Free + Neon Auth. It is not approved for production or live banking data.

## What is enabled

- Manager sign-in: `https://ledgerly-free-test-api.onrender.com/manager`
- Administrator-provisioned Neon Auth identities; **public sign-up is disabled**.
- Manager email verification, password setup/reset using OTP, and first-login password rotation.
- Previous Admin navigation: Dashboard, Customers, Transactions, Statements, Reports, Approvals, Audit Logs, Settings.
- Server-authorized organization/issuer-scoped manager permissions.
- Manager Customers section for **unverified internal test profiles only**; these profiles do not represent issuer-verified accounts.
- Statement request and management capabilities are restricted to approved test issuer accounts and authorization.

## Customer module is separate

- The customer **login, signup, and dashboard are removed** from this portal.
- `/customer`, `/signup` and `/register` are unavailable.
- Customer-facing `/v1/me/*` API endpoints (apart from manager account access `/v1/me/access`) are disabled in this service.
- The **Ledger customer data API** is a future separate integration. We will connect it after the owner provides its authenticated API contract, rather than invent a data source.
- Manager customer intake currently writes only test profiles to the isolated `managed_customers` table. It does not create bank customer identities, account ownership, balances, transactions, or PDF statements.

## Infrastructure and handoff

- Free test service: https://ledgerly-free-test-api.onrender.com
- Existing **paid Render web service** stays unchanged; auto-deploy on that service remains off.
- Root `render.yaml` still describes the older paid Blueprint; **do not apply it** when updating the Free manager portal.
- GitHub source and Neon database stay on test data only.

Before any production deployment: complete independent security testing, audit the Git history, configure production email, MFA-capable authentication, abuse prevention and backups; validate the future Ledger API contract and issuer authorizations. The owner will make the repository private and revoke ChatGPT/OpenAI GitHub, Render and Neon access as part of a later owner-controlled handoff. Do **not** promote this test environment to live without explicit owner approval.

See [API and Manager configuration](cloud-statement-api/README.md) and [manager-access.md](cloud-statement-api/docs/manager-access.md).
