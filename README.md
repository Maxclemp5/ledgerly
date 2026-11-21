# Ledgerly OpenPDF Statement Studio

Java 17 + OpenPDF 1.3.35 sample statement generator, hosted on Railway.

**DEMO ONLY**: This application uses user-entered fictional data. Documents are prominently labeled as samples and are not bank-issued records or valid financial verification.

## Endpoints
- `GET /` interactive HTML statement editor
- `GET /health` health check
- `POST /api/statement.pdf` (application/x-www-form-urlencoded) downloadable PDF

## Local run
Install Java 17 and Maven.
```sh
mvn -B package
java -jar target/ledgerly-openpdf-1.0.0.jar
```
Then browse to http://localhost:8080.

## Railway
The root Dockerfile builds Maven artifacts and runs the JAR. Railway detects `PORT` at runtime. Health check: `/health`.

## Verification
Open a generated statement's PDF Properties > Producer, or run `pdfinfo yourfile.pdf`.
Expect OpenPDF library producer metadata once built against OpenPDF 1.3.35.
The precise producer string is verified only by inspecting the deployed output.

## Before processing real financial data
Use authenticated backend ledger records, authorization checks, audit trails, verified opening and closing balances, document retention controls, and privacy/security review. Never trust browser-provided balances as authoritative.
