# Ledgerly — Development dashboards

Ledgerly is a customer-scoped statement-request system currently staged on **Render Free + Neon Free + Neon Auth**. It is not a live bank integration or a bank-statement issuing service. No production release is authorized. The existing paid Render service is separate and unchanged.

## Web dashboard

One free Render container serves the React/Vite dashboard and Node API together at the same origin.

- Customer login, email verification and customer dashboard: `/customer`
- Manager login and issuer-scoped dashboard: `/manager`
- Auth uses Neon Managed Better Auth. No Firebase keys are required.
- Customer requests only use issuer-verified accounts linked by a trusted database administrator.
- Managers receive access only from administrator-managed `manager_authorizations` rows, never browser claims. Each request and search is additionally checked for issuer organization.
- No manager grants or verified accounts exist in the empty test database. New registrations cannot grant manager privileges.
- Manager role administration is limited to the Neon SQL console by the database owner, not the public API. See `cloud-statement-api/docs/manager-access.md`.

## URLs

- Test-only dashboard: https://ledgerly-free-test-api.onrender.com
- Public health check: https://ledgerly-free-test-api.onrender.com/health
- Render paid service remains on its existing paid compute plan; not modified or automatically deployed.

## Before a real live launch (owner-controlled handoff)

1. Switch repository visibility to **private**, review git history and protect the main branch.
2. Review independent security testing, authentication, authorization, rate limiting, audit trails, backups, email and data-retention policies.
3. Complete issuer/core-ledger authorization, verified account ownership mapping, and compliant document delivery integration.
4. Configure managed email delivery and production origins, review provider contracts and data residency.
5. Rotate environment secrets and revoke the **ChatGPT/OpenAI GitHub, Render and Neon connections** at the owner's chosen time. The application can continue running independently with normal provider credentials. Removing ChatGPT access does **not** mean deleting databases or removing Render's own GitHub deployment permission.
6. Obtain explicit owner approval before changing from testing to live. No production migration or issuance is enabled by this repository.

See [API development README](cloud-statement-api/README.md).
