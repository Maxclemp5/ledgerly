# LedgerDesk native OpenPDF statement renderer

Java 21, Maven and OpenPDF 2.2.5 create **brand-new US Letter PDF documents** using `Document`, `PdfWriter` and `PdfContentByte`. Each dynamic field is drawn only once from the verified nSave ledger statement. No existing customer statement page, prior PDF metadata, original content stream, `PdfReader`, or `PdfStamper` enters the final document.

## Reference and static branding

`src/main/resources/template/nsave-statement-template.pdf` is used **at build time only** as the approved visual design reference. `scripts/extract_design_assets.py` obtains the static logo and seal artwork, and creates native embedded regular/semibold Inter fonts. The Java app receives isolated PNG artwork and fonts only; the reference statement is **not** bundled as a page or used as a PDF background.

**Security:** The historical reference contains customer information, so it must not remain in a public source repository for production. Move the approved static assets to an access-controlled source and purge historic exposure according to company policy before launch.

## HTTP integration

- `GET /health` — availability
- `POST /render` — strict bearer token and normalized verified statement JSON; response is new `application/pdf`.
- `PDF_STAMPER_TOKEN` — legacy service environment variable; minimum 32 characters. Keep identical to the Node manager API.
- Node sets `PDF_STAMPER_URL` to this service URL.

The Node manager API retains issuer authentication, manager authorization, profile `account_reference` binding, optional `account_id` match, period and ledger reconciliation, and append-only audit.

## Verification

Run the Maven tests and geometry regression script from the `java-pdf-stamper` directory after executing the asset extractor. GitHub Action `OpenPDF Java Stamper CI` performs this automatically on Java source changes. It also uploads a **test-data-only preview PDF** for review.

The current design-reference regression checks US Letter page dimensions and text positions to within **1.25 PDF points** for selected fixed labels. Pixel-perfect equality across renderers and full transaction pagination have **not** been approved for production. Complete human visual QA, long-transaction overflow tests, authorized issuer branding/signatures, metadata policy, accessibility review, and jurisdictional compliance before real issuance.
