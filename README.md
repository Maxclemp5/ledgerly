# Ledgerly

Ledgerly is being migrated to a Google Cloud production architecture.

## Active backend workspace

The current backend work lives in [`cloud-statement-api/`](./cloud-statement-api/).

It contains:
- Firebase Authentication token verification
- Customer-scoped account and statement-request APIs
- Organization-scoped manager request authorization
- PostgreSQL schema and repository layer
- An issuer-ledger connector contract with exact balance reconciliation tests
- A Cloud Run container and deployment guidance

## Production status

This repository does **not** currently connect to a real bank/core-banking provider and does **not** issue official bank statements. The API accepts authorized statement requests and keeps PDF download disabled until the institution's real ledger, approval, signing, and secure delivery integrations are configured.

## Legacy renderer

The previous Java/OpenPDF demo renderer, sample templates, and Railway build/deployment files have been removed from the current source tree. They are not part of the Google Cloud deployment path.

See [`cloud-statement-api/README.md`](./cloud-statement-api/README.md) for the integration and deployment checklist.

## Security

- Do not commit customer PII, account data, issuer templates, API tokens, or private keys.
- Keep production credentials in Google Secret Manager.
- Use separate least-privilege identities for the API, ledger connector, and issuer signing worker.
- Review repository visibility and Git history before placing any sensitive material in source control.
