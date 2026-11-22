# Ledger Desk Java Demo PDF Renderer

Protected Java 17 and OpenPDF 2.0.5 microservice for rendering unofficial customer account activity summaries.

**DEMO ONLY. Not a bank-issued statement, verification, financial credential or proof of funds.**

## Where to edit

- PDF layout template: `src/main/resources/templates/demo-statement-template.pdf` (real PDF in Git).
- Dynamic text and coordinates: `src/main/java/com/ledgerdesk/pdf/RendererServer.java` in the `render()` method.
- Maven dependency: `pom.xml`.
- Font packaging and deployment: `Dockerfile`.

## Data path

Authorized demo admin panel -> saved PostgreSQL customer -> demo export -> private POST /render ->
PdfReader -> PdfStamper -> getOverContent(1) -> downloadable DEMO PDF.

All identifiers must be masked; USD demo opening balances are administrator-provided and never verified.
The PDF contains a visible DEMO / UNVERIFIED warning and zero transactions.

## Fonts

Debian's `fonts-inter` package is installed during Docker build.
All 18 Inter OpenType styles (upright and italic) are added to Maven resources before packaging.
Font files are **not committed** to the public repository. The output embeds only used fonts.

## Railway

On the existing `java-demo-pdf-renderer` service, connect the GitHub repo
`Maxclemp5/ledgerly` with root directory `/java-demo-pdf-renderer`.
The Dockerfile builds the renderer and performs a synthetic PDF self-test.
Keep `RENDERER_TOKEN` and `PORT=8080` configured in Railway Variables.
The admin panel calls `http://java-demo-pdf.railway.internal:8080/render` with a server-only token.
Check service health at GET `/health`.

Never commit customer records, PDFs containing personal data, unmasked identifiers or secrets.
Official bank document issuance, signing, auditing and source-of-truth balances are not provided.
