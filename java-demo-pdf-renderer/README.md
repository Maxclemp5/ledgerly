# Ledger Desk: Java demo PDF renderer

Java 17 + OpenPDF 2.0.5 protected service for the admin panel.
All customer exports are **DEMO / UNOFFICIAL** documents, not bank-issued statements or proof of funds.

## Backend file names (aligned with organization changes)

| Path | Purpose |
| --- | --- |
| `src/main/java/com/ledgerdesk/pdf/RendererServer.java` | Protected HTTP server: `GET /health`, `POST /render` and self-test |
| `src/main/java/com/ledgerdesk/pdf/BankStatementPdfGenerator.java` | Organization-provided template helper; correctly named for the public class |
| `src/main/java/com/ledgerdesk/pdf/PdfTemplatePaths.java` | Central resource path constants |
| `src/main/resources/templates/Nsave.pdf` | Organization-uploaded reference PDF, unchanged |
| `src/main/resources/templates/ledgerdesk-demo-template.pdf` | Neutral, visibly unofficial layout used by the live `/render` workflow |
| `pom.xml` | Maven dependencies; main class `com.ledgerdesk.pdf.RendererServer` |
| `Dockerfile` | Java build, bundled licensed Inter fonts |
| `../../.github/workflows/java-demo-pdf-renderer.yml` | GitHub Actions build + PDF self-test |

The organization PDF resource is now loaded using the exact **Nsave.pdf** filename.
Its helper class is in its own **BankStatementPdfGenerator.java** file, while the existing
`RendererServer` retains the HTTP backend expected by Railway, Maven and the admin panel.
The helper's illustrative output is conspicuously marked DEMO on every page.
To avoid unintentionally treating an organization reference as an issuer-certified record,
the normal download endpoint continues to use the neutral demo template.

## Local build

Run Docker from this directory:

```sh
docker build -t ledgerdesk-renderer .
docker run --rm -p 8080:8080 -e PORT=8080 -e RENDERER_TOKEN=secret ledgerdesk-renderer
curl http://localhost:8080/health
```

The Dockerfile installs Inter's static upright and italic variants and runs a synthetic
PDF-generation self-test. Real customer data or API keys must not be committed.
A separate GitHub connection in Railway is needed before source deployments can be enabled.

## Service contract

- `GET /health`: readiness response
- `POST /render`: Java-properties payload, `X-Renderer-Token` required; masked identifiers only;
  USD, zero posted transactions, admin-entered demo balance
- Private host: `http://java-demo-pdf.railway.internal:8080`

The source includes safeguards for test-only output. For genuine bank document issuance
you would need issuer-controlled verified data, signing, access controls and audit trails.
