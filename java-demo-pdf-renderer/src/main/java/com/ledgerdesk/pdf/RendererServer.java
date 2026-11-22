import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfStamper;

import java.io.FileOutputStream;
import java.io.InputStream;

public class BankStatementPdfGenerator {

public void generate(String outputPath) throws Exception {

// Load PDF from src/main/resources/templates/
InputStream template =
getClass()
.getClassLoader()
.getResourceAsStream(
"templates/Nsave-template.pdf"
);

if (template == null) {
throw new IllegalStateException(
"Nsave-template.pdf not found"
);
}

PdfReader reader = new PdfReader(template);

try (FileOutputStream output =
new FileOutputStream(outputPath)) {

PdfStamper stamper =
new PdfStamper(reader, output);

// Page 1 of the ORIGINAL template
// remains as the background.
var canvas =
stamper.getOverContent(1);

// Yahan dynamic fields draw karenge

stamper.close();
} finally {
reader.close();
}
}
}
