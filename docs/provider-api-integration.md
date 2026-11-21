# Customer API → Java/OpenPDF statement adapter

This module consumes exactly the **fictional response formats** supplied for:

1. `GET /api/customers/{customerId}`
2. `GET /api/accounts/{accountId}/statements?from=YYYY-MM-DD&to=YYYY-MM-DD`

The provider API is configured by environment variables; no live endpoint has been supplied or connected.

## Architecture

```text
Customer web app
    │ GET /api/accounts/{accountId}/statements/download?from=...&to=...
    ▼
Authenticated fintech backend
    ├── Check logged-in user's entitlement to customer + account
    └── POST (internal) {customerId, accountId, from, to}
          │ Authorization: Bearer <STATEMENT_SERVICE_TOKEN>
          ▼
Railway / Java Statement Service
    ├── GET  {CUSTOMER_API_BASE_URL}/api/customers/{customerId}
    ├── GET  {CUSTOMER_API_BASE_URL}/api/accounts/{accountId}/statements?from=...&to=...
    ├── Validate ownership, currencies, period and complete ledger totals
    └── OpenPDF renderer → application/pdf
          ▼
Fintech backend → authorized customer's PDF download
```

## New internal API (on feature branch only)

`POST /internal/statements/from-provider`

Headers:

```http
Authorization: Bearer <STATEMENT_SERVICE_TOKEN>
Content-Type: application/json
```

Request:

```json
{
  "customerId": "cus_0001",
  "accountId": "acc_0001",
  "from": "2026-10-01",
  "to": "2026-10-31"
}
```

The response is `application/pdf` only when the upstream API returns a **complete, reconciled** statement. Failed authorization returns 401, missing config 503, invalid or incomplete financial data 422, provider errors 502.

Do **not** call this endpoint directly from browser JavaScript. Browser requests pass only an account selector/date range to the authenticated fintech backend, and the backend obtains the customer ID from server-side identity/ownership records.

### Required server-side configuration

- `CUSTOMER_API_BASE_URL` — actual sandbox/production API base URL. HTTPS required except localhost and Railway private network DNS.
- `CUSTOMER_API_TOKEN` — read-only provider API credential. Secret; never sent to the browser.
- `STATEMENT_SERVICE_TOKEN` — separate high-entropy server-to-server bearer secret (minimum 32 characters). Secret; never sent to the browser.

These values should live in Railway secrets/environment variables or a central secret manager, not GitHub files or chat messages. Prefer workload identity/mTLS and Railway private networking for production.

## Field mapping

| Customer/statement API | Internal renderer | Notes |
|---|---|---|
| `customer.full_name` | `holder` | Exact customer name from provider response |
| `accounts[].account_number` | `reference` | Masked: `****` plus last four characters |
| `accounts[].id` | Account ownership check | Must match URL's account ID |
| `accounts[].customer_id` | Ownership check | Must match verified customer ID |
| `statement.customer_id` | Ownership check | Must match verified customer ID |
| `statement.currency` | Currency | Must match account currency |
| `period.from/to` | Statement range | Must match requested range |
| `opening_balance` | Opening balance | Parsed as `BigDecimal` |
| `closing_balance` | Expected closing | Must equal recalculated closing |
| `transactions[].date` | Transaction date | Chronological posting order required |
| `transactions[].description` | Description | Printed as text in PDF |
| `transactions[].amount` | Credit/debit amount | Positive=credit, negative=debit |
| `transactions[].balance` | Running balance | Verified against each transaction |
| `total_deposits` | Sum of credits | Must reconcile exactly |
| `total_payments` | Sum of debits | Must reconcile exactly |

The supplied statement JSON includes numeric values (e.g. `1330.91`); the Java adapter parses JSON numbers into decimal `BigDecimal` values without binary floating-point arithmetic.

### Incomplete October sample

The first four transactions of October 2026 reconcile to a running balance of **USD 600.53**, but the period-level response advertises **USD 3,117.42** closing and different full-month totals. This is because the supplied response explicitly contains only the **first four** transactions. The adapter **rejects** this response rather than creating a misleading full-month statement. Provide a complete unpaginated statement response, or implement cursor-aware pagination and consistency snapshots upstream.

### Empty November sample

For `acc_0005`, November 18–21 2026: opening=0, closing=0, totals=0, transactions=[].
The adapter renders an empty transaction table successfully, provided the accompanying customer response identifies `cus_0005` as the account owner. The sample `cus_0005` customer record in test fixtures was constructed for testing; it was not supplied by the user.

### Double-entry ledger entries

The `ledger_entries.json` example has two opposing postings for the same `txn_id`: one to `acc_0001`, one to `acc_settlement_usd`. Never total both as customer activity.

This adapter deliberately consumes the **account statements** API, not raw double-entry ledger rows. If a raw-ledger adapter is added later, filter by the requested account, include only `posted` entries, establish posting order, and avoid counting settlement legs as customer transactions.

## Tests

```sh
mvn -B -ntp clean verify
```

Tests include an actual mock HTTP provider, customer/account authorization consistency, empty-period rendering, signed-amount reconciliation, per-row running balances, detection of partial October data, pagination markers, malformed statement IDs and chronological ordering.

**Current status:** feature branch and tests only; not deployed to live Railway. No live customer provider URL or credentials have been configured. Existing PDF samples remain conspicuously labeled DEMO. Production requires an issuer-approved template, authenticated ledger snapshots, audit trail, immutable PDF ID, retention and security review.
