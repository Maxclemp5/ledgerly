# Internal JSON statement module — integration contract

**Status:** prototype on `feature/internal-json-statement-module`. No connection to nsave, a bank or a production ledger has been configured.

## Intended architecture

1. The signed-in customer chooses an account and a date range in the web app.
2. The web app's backend checks customer identity and account-level authorization.
3. The backend queries its **authoritative ledger** for all posted transactions and obtains a reconciled opening and closing balance, with a consistent cutoff.
4. The backend builds the JSON object in [example-statement.json](example-statement.json).
5. The backend calls the Java rendering module over private networking. **Never expose the internal API token to a browser.**
6. The Java module validates fields, verifies that `opening + credits - debits = closing`, and generates a PDF using OpenPDF.
7. The backend streams the PDF back to the authorized customer and archives the approved statement version (production requirement).

## API

- `POST /internal/statements/render`
- `Authorization: Bearer <STATEMENT_SERVICE_TOKEN>`
- `Content-Type: application/json`
- Response: `200 application/pdf`
- Failures: `400` invalid/reconciliation error, `401` unauthorized, `413` oversized, `415` invalid content type, `503` token not configured.

The server requires the `STATEMENT_SERVICE_TOKEN` environment variable to be at least 32 characters before the internal route accepts requests. Manage it as a secret in the hosting platform. An unset token disables this endpoint.

The existing HTML demo and `POST /api/statement.pdf` remain unchanged in this branch. They still use **fictional, editable data**. Production deployments should disable or isolate those public demo endpoints.

## Backend example (Node.js)

```js
// Only inside a trusted server route, after verifying customer ownership.
// ledgerStatement is fetched from the bank/ledger system, NOT from request.body.
const response = await fetch(process.env.STATEMENT_RENDERER_URL, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer ' + process.env.STATEMENT_SERVICE_TOKEN
  },
  body: JSON.stringify(ledgerStatement)
});

if (!response.ok) throw new Error('Statement generation failed');
const pdfBytes = Buffer.from(await response.arrayBuffer());
// Stream pdfBytes as application/pdf to the authenticated customer.
```

Example local test (fictional data):

```sh
export STATEMENT_SERVICE_TOKEN='replace-this-with-a-random-secret-at-least-32-chars'
mvn -B package
java -jar target/ledgerly-openpdf-1.0.0.jar

curl --fail --silent --show-error \
  -H 'Authorization: Bearer replace-this-with-a-random-secret-at-least-32-chars' \
  -H 'Content-Type: application/json' \
  --data-binary @docs/example-statement.json \
  http://localhost:8080/internal/statements/render \
  --output statement-sample.pdf
```

## Constraints and production next steps

- The module does **not** access customer databases or partner APIs by itself.
- All monetary amounts are decimal **strings**, never floating-point numbers.
- Only `GBP`, `USD`, and `EUR` are accepted; maximum 150 transactions per request (pagination/batch rendering should be added for longer statements).
- Transactions are sorted by booking date. Production ledger rules must define posting order and cutoff timestamps.
- Use mTLS or workload identity and private networking instead of relying solely on a long-lived bearer token.
- Enforce per-tenant authorization in the ledger-fetching service; the renderer cannot independently verify the user's right to view an account.
- The rendered output deliberately includes a prominent **DEMO** disclosure until the issuer and legal statement requirements are approved.
- Before live financial usage: implement ledger reconciliation, authorization tests, audit events, tamper-evident archival, immutable document IDs, signed or verifiable statements, monitoring and incident processes, and vulnerability/OSS-license review.
- For production, review supported OpenPDF versions; `1.3.35` is presently pinned to reproduce the compatibility experiment, not as a recommendation for a new financial deployment.
- Do not use nsave's branding, partner bank name or official document claims without appropriate authorization and issuer approval.
