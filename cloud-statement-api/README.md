# Ledgerly — Neon Auth + Render Free test deployment

The **isolated Free test service** uses Render Free, Neon Free PostgreSQL and Neon Auth (Managed Better Auth). The existing **paid Render service is unchanged**, has auto-deploy disabled, and must not be redeployed using this migration without a separate review.

This project implements a customer-scoped statement-*request* API. It cannot issue bank statements from manually entered records and cannot download issuer-certified PDFs until an authorized issuer integration is implemented.

## Free test environment

- API: `https://ledgerly-free-test-api.onrender.com`
- Source: `cloud-statement-api/` on `main`
- Hosted auth: Neon Auth on the project's default branch; email/password with email OTP verification.
- Database: Neon PostgreSQL `ledgerly_test` in AWS Northern Virginia; only test data.
- API service plan: Render Free; sleeps after inactivity, so cold-start latency applies.

A **separate** root-level `render.yaml` still describes the earlier paid Render Blueprint. Do not apply it to Free testing, since that would create or update paid resources.

## Auth implementation (Firebase removed)

The frontend (not deployed yet) signs in through Neon Auth's supported client SDK. For a Vite/React frontend use `@neon/auth`, `createAuthClient`, and `BetterAuthReactAdapter()`; configure `VITE_NEON_AUTH_URL` using the branch's `NEON_AUTH_BASE_URL`. After sign-in, request a short-lived bearer JWT with `authClient.token()`. Send `data.token` as `Authorization: Bearer <token>`.

The backend validates EdDSA JWT signatures against the branch JWKS, checks the trusted issuer, expiration and age, and extracts the signed `sub` identity. It does not trust role or issuer claims supplied in the token. A sign-out does not automatically invalidate an already issued JWT; the JWT expires shortly (Neon currently issues 15-minute tokens). No separate Firebase Admin key or Google Cloud project is required.

Render Free service environment:
- `DATABASE_URL`: restricted Neon Postgres runtime role with SSL required
- `ALLOWED_WEB_ORIGIN`: exact browser origin (development example: `http://localhost:5173`)
- `NEON_AUTH_BASE_URL`: Neon Auth base URL including `/ledgerly_test/auth`
- `NEON_AUTH_JWKS_URL`: corresponding HTTPS `/.well-known/jwks.json` URL

Never store a database password, auth server signing key or customer records in GitHub or frontend code.

## Customer and manager access

- Customer access is restricted by `customer_identity_links.auth_user_id`, populated only by a trusted operator after verifying the correct customer.
- `verified_accounts` comes from an issuer-controlled source. A browser cannot set verification status, account ownership, balances or issuance status.
- Manager access checks the administrator-owned table `manager_authorizations`: caller ID must have an active grant, and the selected account's issuer organization must match that grant. No manager role may be inferred from untrusted JWT fields.
- The API runtime can `SELECT` `manager_authorizations`, but may not create, edit or delete grants.
- Never grant the API role permission to alter verified accounts, customer mappings or issuer-approval state.
- Official document download continues to return `409 ISSUER_NOT_CONNECTED`.

The migration `db/migrations/001_neon_auth.sql` renames the old empty test database's `firebase_uid` field to `auth_user_id` and adds trusted manager grants. **Do not run this automatically against a production database**. Migrate old Firebase identities only via a separately approved identity-mapping plan.

## Verify

```sh
cd cloud-statement-api
npm install
npm test
```

```sh
curl -i https://ledgerly-free-test-api.onrender.com/health
curl -i https://ledgerly-free-test-api.onrender.com/v1/me/accounts
```

Expected health 200, unauthenticated account endpoint 401. Customer data should stay empty until explicit testing with vetted test records; a signed-in customer with no trusted mapping sees `data:[]`.

This free setup is for evaluation and not approved financial-data production hosting. Before real records or an issuer integration, review security controls, abuse prevention, domain and origin allowlists, data residency, compliance, rate limiting, service uptime, backup and recovery, and network restrictions. Neon Managed Better Auth production needs a configured custom SMTP provider.
