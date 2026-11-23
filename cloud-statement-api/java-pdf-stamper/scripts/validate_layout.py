#!/usr/bin/env python3
"""Automated geometric regression check for the native statement layout.

Checks text positions against the issuer-approved design reference. Visual
differences are reviewable in the CI preview; pixel-identical output is not
assumed across PDF engines and anti-aliasing settings.
"""
import fitz
from pathlib import Path

root=Path(__file__).resolve().parents[1]
reference=root/"src/main/resources/template/nsave-statement-template.pdf"
generated=root/"target/native-layout-preview.pdf"
if not generated.exists(): raise SystemExit("OpenPDF preview not generated")
source=fitz.open(reference)
actual=fitz.open(generated)
if source.page_count!=1 or actual.page_count!=1: raise SystemExit("Incorrect page count")
if source[0].rect!=actual[0].rect: raise SystemExit("Page geometry changed")

def positions(page):
    result={}
    for block in page.get_text("dict")["blocks"]:
        if block["type"]!=0: continue
        for line in block["lines"]:
            value=" ".join(span["text"] for span in line["spans"]).strip()
            if value:result[value]=(line["bbox"][0],line["bbox"][1])
    return result

src=positions(source[0]);out=positions(actual[0])
required=["Account Statement USD","Name","Address","Bank","Bank Address",
          "Account Number","Routing Number","Opening Balance","Closing Balance",
          "Total Payments","Total Deposits","Date","Description","Amount",
          "Balance","No rows to display."]
for label in required:
    if label not in src or label not in out:
        raise SystemExit(f"Missing fixed design element: {label}")
    a,b=src[label],out[label]
    dx=abs(a[0]-b[0]);dy=abs(a[1]-b[1])
    print(f"{label:22s}: dx={dx:.2f} pt, dy={dy:.2f} pt")
    if dx>1.25 or dy>1.25:
        raise SystemExit(f"Geometric layout mismatch: {label}")

# The historic reference's customer values must not remain in any generated PDF.
text=actual[0].get_text()
for historic in ("Suman Arif","152 galya Namir 3","317034465037","18/11/2026 - 21/11/2026"):
    if historic in text:raise SystemExit("Historic customer data leaked into native PDF")
metadata=actual.metadata
if "Quartz" in metadata.get("producer","") or "LedgerDesk" not in metadata.get("creator",""):
    raise SystemExit("New PDF provenance metadata is incorrect")
print("Native OpenPDF geometry/provenance regression checks passed")
