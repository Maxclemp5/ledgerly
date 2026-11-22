package com.ledgerdesk.pdf;

import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfStamper;
import java.awt.Color;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * Organization-provided PDF resource loader, retained under its actual Java class name.
 * This helper is NOT the admin panel's /render endpoint. For an illustrative copy,
 * it visibly stamps every page DEMO / UNOFFICIAL; it does not insert customer records.
 */
public final class BankStatementPdfGenerator {
    public void generate(String outputPath) throws Exception {
        try (InputStream template = getClass().getResourceAsStream(
                PdfTemplatePaths.ORGANIZATION_REFERENCE)) {
            if (template == null) {
                throw new IllegalStateException("Nsave.pdf was not found in templates/");
            }
            PdfReader reader = new PdfReader(template);
            try (FileOutputStream output = new FileOutputStream(outputPath)) {
                PdfStamper stamper = new PdfStamper(reader, output);
                try {
                    BaseFont font = BaseFont.createFont(
                        BaseFont.HELVETICA_BOLD, BaseFont.WINANSI, BaseFont.NOT_EMBEDDED);
                    for (int pageNumber = 1; pageNumber <= reader.getNumberOfPages(); pageNumber++) {
                        PdfContentByte canvas = stamper.getOverContent(pageNumber);
                        canvas.saveState();
                        canvas.setColorFill(new Color(170, 20, 48));
                        canvas.beginText();
                        canvas.setFontAndSize(font, 14);
                        canvas.setTextMatrix(48, 36);
                        canvas.showText("DEMO / UNOFFICIAL - NOT BANK ISSUED");
                        canvas.endText();
                        canvas.restoreState();
                    }
                } finally {
                    stamper.close();
                }
            } finally {
                reader.close();
            }
        }
    }
}
