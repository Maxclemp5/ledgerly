# Ledger Desk — Google Cloud statement-request API

Production-migration scaffold: Node.js 22 on Cloud Run with Cloud SQL PostgreSQL and Firebase/Identity Platform authentication.

**No PDF is issued from unverified records.** The issuer integration and signing worker must be provisioned by an authorized bank or institution before any document is designated bank-issued.

## Files

- `src/main.mjs`: Cloud Run HTTP server with Firebase ID-token verification (revocation enabled).
- `src/handler.mjs`: customer-scoped and organization-scoped manager routes.
- `src/repository.mjs`: parameterized PostgreSQL queries and ownership checks.
- `src/issuerLedger.mjs`: issuer connector contract, posted-entry and balance reconciliation.
- `db/schema.sql`: dedicated verified accounts, identity mappings and statement request schema.
- `test/*.test.mjs`: account isolation, manager permissions and ledger consistency tests.
- `Dockerfile`: Cloud Run container.

## Customer endpoints

Every non-health route requires a valid Firebase ID token in an Authorization: Bearer header.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/v1/me/accounts` | List only accounts linked to current authenticated UID |
| GET | `/v1/me/statement-requests` | List own requests |
| POST | `/v1/me/statement-requests` | Create issuer review request after account ownership check; returns 202 |
| GET | `/v1/me/statement-requests/:uuid` | Look up one of the caller's requests |
| GET | `/v1/me/statements/:uuid/download` | Disabled (409) until issuer-signed PDF delivery is integrated |

Example POST body: `{ "accountId": "acc_001", "from": "2026-10-01", "to": "2026-10-31" }`.

Manager endpoint: POST `/v1/manager/customers/:customerId/statement-requests`.
Managers need server-issued custom claims `statement_manager=true` AND `issuer_org_id`.
The referenced verified account must belong to that same issuer organization.
Neither customers nor managers can set account ownership, approval status, ledger balances or issuer status through this API.

## Official ledger integration steps

1. Contract with a real issuer/core-banking provider. Obtain its sandbox and production API access, allowed account scopes, OAuth2 client-credentials or mTLS specification, statement issuance authorization, schema, retry rules and webhooks.
2. Keep issuer credentials in Google Secret Manager, not a browser, JavaScript bundle or GitHub. Run the connector under a dedicated Google Cloud service account using private network access where available.
3. Import issuer-verified account mapping and customer ownership into `verified_accounts` and `customer_identity_links`. Validate that the issuer org and authenticated customer actually own each account. No user-controlled mapping API exists.
4. Implement `connector.account`, `connector.postedEntries`, and `connector.boundaryBalances` against your issuer's real API. Fetch immutable posted transactions (not pending), opening/closing ledger balance checkpoints and currency, and stable transaction identifiers.
5. Call `reconcileIssuerLedger` to validate closing = opening + credits - debits in integer minor units. Reject duplicate entries, dates outside the period, missing source checkpoints or mismatched institution/account.
6. In a separate issuer-authorized job (Cloud Tasks or Pub/Sub worker), create a source snapshot checksum, signed audit event and customer-scoped issuance record. Official issuing must require authorized issuer signing credentials and workflow approval.
7. For issuer-authorized PDFs, use a properly certified document signing workflow (e.g. PAdES/PKCS#7 PDF signature with an issuer-controlled certificate and key). Cloud KMS asymmetricSign is a cryptographic primitive, not by itself a complete PDF signature.
8. Store final approved PDFs in a private Cloud Storage bucket with restricted access, retention and audit logs. Re-check customer ownership and request status before issuing a short-lived download.

**Aggregation APIs:** Plaid or other data aggregators can supply permissioned transactions but that alone does not authorize an organization to issue an institution-branded statement. Prefer a bank's official statement API or an issuer-approved issuance service.

## GCP deployment method

1. Enable Cloud Run, Artifact Registry, Cloud SQL, Secret Manager and Identity Platform / Firebase services in your GCP project.
2. Deploy PostgreSQL Cloud SQL, execute `db/schema.sql` with a migration account and grant the runtime DB identity read-only access to trusted mappings/accounts, plus SELECT and INSERT to statement requests.
3. Configure Firebase sign-in. Backend uses Firebase Admin `verifyIdToken(token, true)`; custom manager roles must only be granted by trusted administrators.
4. Build container from this folder: `gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/ledgerdesk/statement-api:VERSION .`
5. Deploy Cloud Run, attach the Cloud SQL instance via `--add-cloudsql-instances`, set PGHOST as `/cloudsql/PROJECT:REGION:INSTANCE`, PGDATABASE, PGUSER, GOOGLE_CLOUD_PROJECT, ALLOWED_WEB_ORIGIN and PORT; inject PGPASSWORD from Secret Manager with `--set-secrets`.
6. Put API Gateway / Cloud Armor rate limiting and monitoring in front of the service. For direct browser clients, Cloud Run must allow requests to reach your application; the application verifies each Firebase JWT. Do not leave alternate unauthenticated data routes.
7. Assign separate IAM service accounts to the public API, ledger connector, issuance worker and KMS signer. Restrict issuer credentials and database permissions to the minimal components.
8. Run `npm test` and a full authorized sandbox issuance test. Rotate old Railway credentials and retire Railway only after Google Cloud cutover and rollback readiness.

## Configuration

Required environment variables: `GOOGLE_CLOUD_PROJECT`, `ALLOWED_WEB_ORIGIN`, `PGHOST`, `PGPORT` (optional), `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PORT` (optional).

Run tests locally with `node --test test/*.test.mjs` (Node 22). Runtime requires package installation `npm install`.

**Current status:** This is a request API with customer ownership enforcement and a ledger adapter contract, not an integration with any named bank. No official PDF or customer download is enabled. No Google Cloud resources have been provisioned.
