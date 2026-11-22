# LedgerDesk Manager Portal — Neon Auth / Render Free (development)

This **isolated test deployment** hosts one manager-only React/Vite UI and Node.js API in a single Render Free container, backed by a restricted Neon Free PostgreSQL role. The **existing paid Render service is unchanged**, and its Blueprint must not be applied to Free testing.

## Login and role access

- `/manager`, `/login`, and `/` display the **Manager Portal** only.
- Public registration is disabled in Neon Auth, and no signup interface is served.
- Existing manager identities are provisioned by a Neon administrator. If necessary, the manager verifies their email using OTP and sets their own private password with OTP.
- Manager first-login password rotation is mandatory where `require_password_change` is set in `manager_authorizations`.
- `GET /v1/me/access` returns signed-in role authorization, active issuer organizations and any pending password-change requirement.
- All `/v1/manager/*` operations use server-side active `manager_authorizations` grants and issuer filtering. JWT role fields, browser selections and form submissions cannot grant manager access.

## What is not in this module

- `/customer`, `/signup`, `/register` respond with 404. The Customer Dashboard and public customer Login/Signup UI have been removed.
- Customer `/v1/me/*` endpoints, except `/v1/me/access`, are disabled by default in `createHandler`. The dormant legacy handlers are preserved only for migration to the future **separate Ledger customer API**; they are not mounted in this Manager service.
- No customer identity, verified financial account, transaction history, or issued statement is fetched from the external **Ledger API** yet. The owner will supply that integration separately.
- The Admin Customers screen can create, edit and archive **unverified internal test profiles** under authorized issuer scopes. These are separate from verified banking records and must not be represented as authoritative customer data.
- Statement issuance and verified bank ledger functions cannot run without separately authorized issuer integrations.

## Deployment configuration

Required secret/environment settings on the **Render Free test service only**:

- `DATABASE_URL` — least-privileged Neon database connection string with SSL.
- `NEON_AUTH_BASE_URL` — project's Neon Auth HTTPS endpoint.
- `NEON_AUTH_JWKS_URL` — project JWKS URL for signed JWT verification.
- `ALLOWED_WEB_ORIGIN` — exact manager portal origin, `https://ledgerly-free-test-api.onrender.com`.
- `NODE_ENV=production`

Neither Neon signing credentials nor manager passwords are committed to GitHub.

## Test

```sh
cd cloud-statement-api
npm install
npm test
cd dashboard
npm install
npm run build
```

Expected test deployment:
- `GET /health` returns 200.
- `GET /manager` displays only the manager portal.
- `GET /customer`, `GET /signup`, `GET /register` return 404.
- `GET /v1/manager/summary` with no bearer token returns 401; an authenticated user without an active manager grant receives 403.
- `GET /v1/me/accounts` is unavailable in the manager service.
- No public registration is possible through the shared Neon Auth project.

Neon Free/Render Free are for development evaluation; verify backup, availability, rate limits, logging, production SMTP, MFA support and compliance before considering production. The owner controls the future API integration, private-repository change, deployment approval, and eventual revocation of ChatGPT/OpenAI connector access.
