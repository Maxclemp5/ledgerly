package work.nsave.ledgerdesk;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lowagie.text.pdf.PdfReader;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class StatementPdfRendererTest {
    private final ObjectMapper mapper=new ObjectMapper();
    @Test void stampsTheIssuerTemplateAndKeepsLetterPageSize() throws Exception {
        StatementPdfRenderer renderer=new StatementPdfRenderer();
        var s=mapper.readTree("""
          {"requestReference":"req-test","accountReference":"acct-test","customerName":"Test Customer",
           "address":"10 Main Street, Fresno CA 93720","bankName":"Cross River Bank",
           "bankAddress":"885 TEANECK ROAD, TEANECK, NJ, 07666","accountNumber":"000012345678",
           "routingNumber":"021214891","currency":"USD","from":"2026-11-11","to":"2026-11-11",
           "opening":0,"deposits":0,"payments":0,"closing":0,"transactions":[]}
          """);
        byte[] pdf=renderer.render(s);
        assertTrue(pdf.length>20_000);
        Files.createDirectories(Path.of("target"));
        Files.write(Path.of("target/native-layout-preview.pdf"),pdf);
        PdfReader reader=new PdfReader(new ByteArrayInputStream(pdf));
        try {
            assertEquals(1,reader.getNumberOfPages());
            assertEquals(612f,reader.getPageSize(1).getWidth(),.1f);
            assertEquals(792f,reader.getPageSize(1).getHeight(),.1f);
            assertTrue(reader.getInfo().getOrDefault("Creator", "").isBlank(), "Creator must be unset");
            assertEquals("None", reader.getInfo().get("Author"), "Author metadata must default to literal None");
            assertFalse(reader.getInfo().getOrDefault("Producer", "").contains("Quartz PDFContext"));
            String created=reader.getInfo().get("CreationDate");
            String modified=reader.getInfo().get("ModDate");
            assertNotNull(created, "New statement must record creation time");
            assertNotNull(modified, "New statement must record modification time");
            assertEquals(created, modified, "Both dates must represent the same issuance instant");
        } finally { reader.close(); }
    }
    @Test void rejectsMissingRoutingNumber() throws Exception {
        StatementPdfRenderer renderer=new StatementPdfRenderer();
        var s=mapper.readTree("""
          {"requestReference":"req-test","accountReference":"acct-test","customerName":"Test Customer",
           "address":"10 Main Street","bankName":"Cross River Bank","bankAddress":"Bank Address",
           "accountNumber":"000012345678","currency":"USD","from":"2026-11-11","to":"2026-11-11",
           "opening":0,"deposits":0,"payments":0,"closing":0,"transactions":[]}
          """);
        assertThrows(IllegalArgumentException.class,()->renderer.render(s));
    }
    @Test void rejectsUnreconciledBalances() throws Exception {
        StatementPdfRenderer renderer=new StatementPdfRenderer();
        var s=mapper.readTree("""
          {"requestReference":"req-test","accountReference":"acct-test","customerName":"Test Customer",
           "address":"10 Main Street","bankName":"Cross River Bank","bankAddress":"Bank Address",
           "accountNumber":"000012345678","routingNumber":"021214891","currency":"USD","from":"2026-11-11","to":"2026-11-11",
           "opening":0,"deposits":100,"payments":0,"closing":0,"transactions":[]}
          """);
        assertThrows(IllegalArgumentException.class,()->renderer.render(s));
    }
}