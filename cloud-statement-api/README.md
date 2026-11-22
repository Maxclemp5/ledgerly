# Ledger Desk — Render deployment

This repository contains a Node.js 22 statement-request API. Render is the deployment target for the current hosting setup.

**Important:** this API creates issuer-review requests. It does not issue bank statements from manually entered records. The download endpoint remains disabled until a real authorized issuer ledger, approval workflow, signing authority and secure document delivery are integrated.

## Render Blueprint

A root-level \`render.yaml\` defines one paid Docker web service:

- Service: \`ledgerdesk-statement-api\`
- Runtime: Docker, Node.js 22
- Root directory: \`cloud-statement-api\`
- Health check: \`/health\`
- Initial auto-deploy: off, so secrets can be installed before the first deploy
- Provisional region: Virginia. Confirm this with the institution's data-residency and contractual requirements before creating resources. Render locks a service's region after creation.
- Compute: \`0.5c-512mb\` paid plan. Adjust to expected traffic and security review.

The Blueprint intentionally does **not** create a database automatically. This avoids provisioning a billable database or migrating/overwriting any existing customer data without an explicit decision.

## Before you create the Blueprint

1. Make the GitHub repository private before connecting production systems or storing organization-specific source/configuration. Never commit customer records, Firebase keys, bank credentials, private keys, exports or statement PDFs.
2. Confirm that Render is approved by your institution for the relevant financial data, jurisdiction, retention, access controls, incident response and contractual/DPA requirements. A hosting provider's certifications do not automatically establish your organization's compliance.
3. Create a Render PostgreSQL database in the **same approved region** as the web service. Use a paid plan appropriate for production, enable backups and review recovery/retention settings.
4. Do not point this API at a Railway production database as a cross-platform shortcut. Plan a separately backed-up, encrypted, validated migration if existing data must move.

## Create the PostgreSQL database

In the Render Dashboard:

1. Choose **New → PostgreSQL**.
2. Create a database in the same region as the API (the Blueprint currently selects Virginia).
3. Choose a paid database plan and storage size after checking expected data volume, connection limits, backups and recovery objectives.
4. Copy the **Internal Database URL** from the database's Connect page. Use the internal URL only for services in the same Render workspace and region. Do not use the public/external URL for the deployed API.
5. Use a separate least-privilege application database role rather than the database owner/default administrative credentials.

Apply \`db/schema.sql\` using a trusted database-admin session. The schema creates the tables and indexes; it does not populate customer or account mappings. Populate those mappings only from an authorized issuer-controlled source of truth.

The runtime role requires:
- \`CONNECT\` on the database
- \`USAGE\` on schema \`public\`
- \`SELECT\` on \`customer_identity_links\` and \`verified_accounts\`
- \`SELECT, INSERT\` on \`statement_requests\`

Do not grant the runtime role permission to alter verified accounts, customer mappings, issuer verification or issuance status. Keep the admin connection URL out of the API service.

After creating the application role, configure \`DATABASE_URL\` with that role's credentials and the database's **internal hostname**. URL-encode special characters in the password. Render's internal Postgres connection does not require the external TLS query parameter; use the internal URL and keep both services in the same region.

## Create the Render service

1. Push/merge this configuration to the repository's \`main\` branch.
2. Open the Render Dashboard and choose **New → Blueprint**.
3. Connect the private GitHub repository \`Maxclemp5/ledgerly\` and select \`main\`.
4. Review the Blueprint resources, selected region and paid compute plan before confirming.
5. During initial Blueprint setup, provide these values when prompted:
   - \`GOOGLE_CLOUD_PROJECT\`: Firebase project ID
   - \`ALLOWED_WEB_ORIGIN\`: exact browser origin, e.g. \`http://localhost:5173\` for a local Vite frontend during development, or your deployed HTTPS frontend origin later
   - \`DATABASE_URL\`: application-role PostgreSQL **internal** connection URL
6. Do not deploy yet. Add the Firebase Admin credential secret file first.

## Add Firebase Admin credentials as a Render Secret File

1. In Firebase Console, select the same Firebase project used by your frontend.
2. Create/use a dedicated service account with only the permissions needed for Firebase Admin ID-token verification and revocation checks. Do not use a project Owner key.
3. Generate its JSON key only if your organization's security policy permits long-lived service-account keys. Prefer a supported short-lived workload identity approach where available.
4. In the Render service, open **Environment → Secret Files → Add Secret File**.
5. Filename: \`firebase-service-account.json\`
6. Paste the service-account JSON into the secret-file editor and save it.
7. The service reads it from \`/etc/secrets/firebase-service-account.json\` through \`FIREBASE_SERVICE_ACCOUNT_FILE\`.

Never paste the JSON key into GitHub, \`render.yaml\`, chat, a Docker image, or application logs. Rotate/revoke it according to your organization's key-management policy. The Docker ignore file excludes common credential filenames.

## Deploy and verify

1. After the database URL and Firebase secret file are present, trigger **Manual Deploy → Deploy latest commit**.
2. Confirm the Render build succeeds and the service becomes Live.
3. Open \`https://YOUR-SERVICE.onrender.com/health\`; expect HTTP 200 and \`{"ok":true,"service":"ledgerdesk-statement-api"}\`.
4. Request \`/v1/me/accounts\` without an Authorization header; expect HTTP 401 \`AUTH_REQUIRED\`.
5. Test using a real Firebase test account and non-production test data first. Confirm cross-customer requests return 404 and manager requests without trusted server-issued claims return 403.
6. Once the frontend is deployed, change \`ALLOWED_WEB_ORIGIN\` to its exact HTTPS origin. Do not use a wildcard.
7. After validation, enable automatic deploys from the protected \`main\` branch and require CI checks to pass before deployment.

## Runtime configuration

The API supports both Render's \`DATABASE_URL\` and the existing split \`PGHOST\`, \`PGUSER\`, \`PGPASSWORD\`, \`PGDATABASE\` settings used by the earlier Cloud SQL configuration.

Required:
- \`GOOGLE_CLOUD_PROJECT\`
- \`ALLOWED_WEB_ORIGIN\`
- \`DATABASE_URL\` (Render) **or** all of \`PGHOST\`, \`PGUSER\`, \`PGDATABASE\`, \`PGPASSWORD\`

Render secret file:
- \`FIREBASE_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json\`

Render supplies \`PORT\`; the server binds to \`0.0.0.0\`.

## API and security boundaries

- Customer identity is derived from a verified Firebase ID token, not a customer ID sent by the browser.
- Customer account and request queries are scoped to the authenticated UID through trusted identity mappings.
- Manager request creation requires trusted server-issued \`statement_manager=true\` and matching \`issuer_org_id\` claims.
- Account mappings and issuer verification are not writable through the public API.
- The API cannot issue an official PDF. \`GET /v1/me/statements/:id/download\` remains gated until an authorized issuer system is integrated.
- No real issuer connector, production account mapping, signing worker or statement storage is configured by this repository alone.

For sensitive financial data, complete your institution's security, privacy, regulatory, retention, access-control, backup/restore and vendor-risk reviews before using real customer records. Render hosting alone does not certify the complete application or its operating processes.

## Tests

From \`cloud-statement-api\` with Node.js 22:

\`\`\`sh
npm install
npm test
\`\`\`

The tests validate API ownership/manager boundaries and both Render \`DATABASE_URL\` and existing split PostgreSQL configuration. They use fake identities/data and do not prove a live bank integration.
