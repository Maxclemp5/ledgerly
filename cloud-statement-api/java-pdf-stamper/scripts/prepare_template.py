#!/usr/bin/env python3
"""Prepare a clean issuer-supplied statement background.

Redact all variable customer, account, balance, date and transaction text in the
supplied background PDF, including underlying searchable text, before OpenPDF
stamps verified values onto it. Never rely on drawing a white box over PII.
"""
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[1]
template = root / "src/main/resources/template/nsave-statement-template.pdf"
if not template.exists():
    raise SystemExit("Approved issuer template not found: " + str(template))
doc = fitz.open(template)
if len(doc) != 1 or tuple(round(v) for v in doc[0].rect[2:]) != (612, 792):
    raise SystemExit("Expected one-page US Letter issuer template")

page = doc[0]
# PDF coordinates measured against the issuer-supplied source statement.
# Never redact static legal disclosures, bank/field labels, branding or seal.
regions = [
    (14, 115, 325, 138),  # reporting period
    (157, 149, 362, 170), # customer name
    (157, 169, 369, 216), # customer multiline address
    (157, 227, 357, 249), # bank name
    (157, 248, 580, 269), # bank address
    (157, 268, 359, 287), # account number
    (157, 287, 360, 308), # routing number
    (508, 267, 605, 350), # four dynamic balance values
    (14, 384, 270, 409),  # empty transaction message
]
for coords in regions:
    page.add_redact_annot(fitz.Rect(coords), fill=(1, 1, 1))
page.apply_redactions(images=0, graphics=0, text=0)
output = template.with_suffix(".clean.pdf")
doc.save(output, garbage=4, deflate=True)
doc.close()
output.replace(template)

check = fitz.open(template)
page = check[0]
content = page.get_text()
for disallowed in ["Suman Arif", "317034465037", "152 galya", "18/11/2026", "No rows to display."]:
    if disallowed in content:
        raise SystemExit("Template sanitation failed for a variable field")
required = ["Account Statement USD", "Bank Address", "Opening Balance", "Total Payments", "Date", "Description"]
for required_text in required:
    if required_text not in content:
        raise SystemExit("Template lost issuer label: " + required_text)
print("Issuer background sanitized; static template components preserved.")
