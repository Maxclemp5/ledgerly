# LedgerDesk OpenPDF Stamper

Isolated Java 21 + Maven service for stamping verified nSave statement data onto the issuer-provided PDF background.

## Required issuer template asset

Place the exact approved nSave statement PDF at:

`src/main/resources/template/nsave-statement-template.pdf`

Do not recreate the logo, seal, footer, or labels. The stamper uses this PDF as the original page background and masks only variable value regions.

## Runtime configuration

- `PORT` — HTTP port (Render supplies this).
- `PDF_STAMPER_TOKEN` — required shared bearer secret, minimum 32 characters.

## API

- `GET /health` — returns service health and engine name.
- `POST /render` — requires `Authorization: Bearer <PDF_STAMPER_TOKEN>`; accepts the normalized statement JSON from the Node manager API and returns `application/pdf`.

The Node API is responsible for manager authorization, nSave retrieval, account ownership, period validation, ledger reconciliation, and audit logging. This service only renders the already-validated statement.

## Rendering

Uses OpenPDF 2.2.5's legacy-compatible `com.lowagie.text.pdf.PdfReader`, `PdfStamper`, and `PdfContentByte` APIs. Dynamic values are stamped with absolute coordinates and an embedded Inter font. The issuer background supplies all fixed branding and static labels.

## Build

```sh
mvn -B clean test package
```

The Docker build fetches the Inter variable font from the Google Fonts repository and embeds it in the application JAR.
