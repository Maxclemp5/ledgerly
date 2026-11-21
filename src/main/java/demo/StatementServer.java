package demo;

import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.ColumnText;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;

public final class StatementServer {
  private static final java.awt.Color INK = new java.awt.Color(20, 43, 48);
  private static final java.awt.Color TEAL = new java.awt.Color(6, 85, 77);
  private static final java.awt.Color LIGHT = new java.awt.Color(239, 247, 244);
  private static final java.awt.Color MUTED = new java.awt.Color(104, 119, 117);
  private static final Font TITLE = new Font(Font.HELVETICA, 21, Font.BOLD, INK);
  private static final Font BOLD = new Font(Font.HELVETICA, 9, Font.BOLD, INK);
  private static final Font BODY = new Font(Font.HELVETICA, 9, Font.NORMAL, INK);
  private static final Font SMALL = new Font(Font.HELVETICA, 8, Font.NORMAL, MUTED);
  private static final Font WHITE = new Font(Font.HELVETICA, 8, Font.BOLD, java.awt.Color.WHITE);
  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);

  record Entry(LocalDate date, String description, boolean credit, BigDecimal amount) {}
  record Statement(String holder, String reference, String currency, LocalDate start, LocalDate end,
                   BigDecimal opening, List<Entry> transactions) {}

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
    server.createContext("/health", exchange -> {
      if (!"GET".equals(exchange.getRequestMethod())) { respond(exchange, 405, "text/plain", "Method not allowed".getBytes(StandardCharsets.UTF_8)); return; }
      respond(exchange, 200, "text/plain; charset=utf-8", "ok".getBytes(StandardCharsets.UTF_8));
    });
    server.createContext("/api/statement.pdf", StatementServer::statementEndpoint);
    server.createContext("/", StatementServer::home);
    server.setExecutor(Executors.newFixedThreadPool(4));
    // Exercise the real OpenPDF renderer and read its actual PDF metadata at startup.
    Statement smoke = new Statement("Fictional Test User", "DEMO-SMOKE", "GBP",
      LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31),
      new BigDecimal("100.00"),
      List.of(new Entry(LocalDate.of(2026, 8, 5), "Demo credit", true, new BigDecimal("12.50"))));
    byte[] samplePdf = render(smoke);
    com.lowagie.text.pdf.PdfReader reader = new com.lowagie.text.pdf.PdfReader(samplePdf);
    try {
      String producer = reader.getInfo().get("Producer");
      if (producer == null || !producer.contains("OpenPDF")) {
        throw new IllegalStateException("Unexpected PDF producer: " + producer);
      }
      System.out.println("OpenPDF self-test passed: pages=" + reader.getNumberOfPages()
        + ", bytes=" + samplePdf.length + ", Producer=" + producer);
    } finally {
      reader.close();
    }
    server.start();
    System.out.println("Ledgerly OpenPDF 1.3.35 demo listening on port " + port);
  }

  private static void home(HttpExchange exchange) throws IOException {
    if (!"GET".equals(exchange.getRequestMethod()) || !"/".equals(exchange.getRequestURI().getPath())) {
      respond(exchange, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8));
      return;
    }
    try (InputStream in = StatementServer.class.getResourceAsStream("/public/index.html")) {
      if (in == null) {
        respond(exchange, 500, "text/plain", "Frontend unavailable".getBytes(StandardCharsets.UTF_8));
        return;
      }
      exchange.getResponseHeaders().set("Cache-Control", "no-store");
      exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
      respond(exchange, 200, "text/html; charset=utf-8", in.readAllBytes());
    }
  }

  private static void statementEndpoint(HttpExchange exchange) throws IOException {
    if (!"POST".equals(exchange.getRequestMethod())) {
      respond(exchange, 405, "text/plain", "POST required".getBytes(StandardCharsets.UTF_8));
      return;
    }
    try {
      String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
      if (contentType == null || !contentType.startsWith("application/x-www-form-urlencoded"))
        throw new IllegalArgumentException("Expected URL-encoded form data");
      byte[] input = exchange.getRequestBody().readNBytes(65537);
      if (input.length > 65536) throw new IllegalArgumentException("Request too large");
      Statement statement = parse(new String(input, StandardCharsets.UTF_8));
      byte[] pdf = render(statement);
      exchange.getResponseHeaders().set("Cache-Control", "private, no-store");
      exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=ledgerly-demo-statement.pdf");
      exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
      respond(exchange, 200, "application/pdf", pdf);
    } catch (IllegalArgumentException ex) {
      respond(exchange, 400, "text/plain; charset=utf-8", ex.getMessage().getBytes(StandardCharsets.UTF_8));
    } catch (Exception ex) {
      ex.printStackTrace();
      respond(exchange, 500, "text/plain; charset=utf-8", "PDF generation failed".getBytes(StandardCharsets.UTF_8));
    }
  }

  private static void respond(HttpExchange exchange, int status, String contentType, byte[] data) throws IOException {
    exchange.getResponseHeaders().set("Content-Type", contentType);
    exchange.sendResponseHeaders(status, data.length);
    try (OutputStream out = exchange.getResponseBody()) { out.write(data); }
  }

  private static Map<String, List<String>> decode(String body) {
    Map<String, List<String>> result = new LinkedHashMap<>();
    for (String part : body.split("&")) {
      String[] kv = part.split("=", 2);
      String key = URLDecoder.decode(kv[0], StandardCharsets.UTF_8);
      String value = URLDecoder.decode(kv.length > 1 ? kv[1] : "", StandardCharsets.UTF_8);
      result.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
    }
    return result;
  }

  private static String required(Map<String, List<String>> map, String name, int max) {
    List<String> values = map.get(name);
    String value = values == null || values.isEmpty() ? "" : values.get(0).trim();
    if (value.isEmpty() || value.length() > max) throw new IllegalArgumentException("Invalid " + name);
    return value;
  }

  private static BigDecimal amount(String raw, String label, boolean canBeNegative) {
    try {
      BigDecimal number = new BigDecimal(raw).setScale(2, RoundingMode.UNNECESSARY);
      if (number.precision() > 13 || (!canBeNegative && number.signum() <= 0))
        throw new IllegalArgumentException("Invalid " + label);
      return number;
    } catch (NumberFormatException | ArithmeticException ex) {
      throw new IllegalArgumentException("Invalid " + label);
    }
  }

  private static Statement parse(String body) {
    Map<String, List<String>> values = decode(body);
    String holder = required(values, "holder", 80);
    String reference = required(values, "reference", 45);
    String currency = required(values, "currency", 3);
    if (!Set.of("GBP", "USD", "EUR").contains(currency)) throw new IllegalArgumentException("Unsupported currency");
    LocalDate start;
    LocalDate end;
    try {
      start = LocalDate.parse(required(values, "start", 10));
      end = LocalDate.parse(required(values, "end", 10));
    } catch (RuntimeException ex) { throw new IllegalArgumentException("Invalid date range"); }
    if (end.isBefore(start) || end.isAfter(start.plusYears(1))) throw new IllegalArgumentException("Date range must be no more than one year");
    BigDecimal opening = amount(required(values, "opening", 20), "opening balance", true);
    List<String> dates = values.getOrDefault("date[]", List.of());
    List<String> descriptions = values.getOrDefault("description[]", List.of());
    List<String> directions = values.getOrDefault("direction[]", List.of());
    List<String> amounts = values.getOrDefault("amount[]", List.of());
    int size = dates.size();
    if (size > 150 || descriptions.size() != size || directions.size() != size || amounts.size() != size)
      throw new IllegalArgumentException("Invalid transaction count");
    List<Entry> entries = new ArrayList<>();
    for (int i = 0; i < size; i++) {
      LocalDate date;
      try { date = LocalDate.parse(dates.get(i)); }
      catch (RuntimeException ex) { throw new IllegalArgumentException("Invalid transaction date"); }
      if (date.isBefore(start) || date.isAfter(end)) throw new IllegalArgumentException("Transaction outside statement period");
      String description = descriptions.get(i).trim();
      if (description.isEmpty() || description.length() > 95) throw new IllegalArgumentException("Invalid transaction description");
      String direction = directions.get(i);
      if (!direction.equals("credit") && !direction.equals("debit"))
        throw new IllegalArgumentException("Invalid transaction type");
      entries.add(new Entry(date, description, direction.equals("credit"), amount(amounts.get(i), "transaction amount", false)));
    }
    entries.sort(Comparator.comparing(Entry::date));
    return new Statement(holder, reference, currency, start, end, opening, entries);
  }

  private static PdfPCell cell(String value, Font font, java.awt.Color background, int alignment) {
    PdfPCell c = new PdfPCell(new Phrase(value, font));
    c.setBorder(Rectangle.NO_BORDER);
    c.setPadding(9);
    c.setBackgroundColor(background);
    c.setHorizontalAlignment(alignment);
    c.setVerticalAlignment(Element.ALIGN_MIDDLE);
    return c;
  }

  private static String decimal(BigDecimal number) {
    return String.format(Locale.US, "%,.2f", number);
  }

  private static byte[] render(Statement statement) throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    Document doc = new Document(PageSize.A4, 43, 43, 48, 61);
    PdfWriter writer = PdfWriter.getInstance(doc, bytes);
    writer.setPdfVersion(PdfWriter.VERSION_1_5);
    writer.setPageEvent(new PdfPageEventHelper() {
      @Override public void onEndPage(PdfWriter w, Document d) {
        PdfContentByte cb = w.getDirectContent();
        cb.setColorStroke(LIGHT);
        cb.moveTo(43, 45);
        cb.lineTo(552, 45);
        cb.stroke();
        ColumnText.showTextAligned(cb, Element.ALIGN_LEFT,
          new Phrase("LEDGERLY DEMO - NOT AN OFFICIAL ACCOUNT STATEMENT", SMALL), 43, 30, 0);
        ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT,
          new Phrase("Page " + w.getPageNumber(), SMALL), 552, 30, 0);
      }
    });
    doc.addTitle("DEMO - Ledgerly Account Statement");
    doc.addSubject("Fictional financial data; engineering PDF compatibility test");
    doc.addCreator("Ledgerly Java Statement Studio");
    doc.addAuthor("Ledgerly Demo");
    doc.open();
    PdfPTable top = new PdfPTable(new float[]{2, 2});
    top.setWidthPercentage(100);
    top.addCell(cell("LEDGERLY   /   STATEMENT STUDIO", new Font(Font.HELVETICA, 12, Font.BOLD, TEAL), java.awt.Color.WHITE, Element.ALIGN_LEFT));
    top.addCell(cell("SAMPLE DOCUMENT - DEMO ONLY", new Font(Font.HELVETICA, 8, Font.BOLD, TEAL), java.awt.Color.WHITE, Element.ALIGN_RIGHT));
    doc.add(top);

    Paragraph title = new Paragraph("Account statement", TITLE);
    title.setSpacingBefore(18);
    title.setSpacingAfter(7);
    doc.add(title);
    Paragraph interval = new Paragraph(statement.start.format(DATE) + "  -  " + statement.end.format(DATE), SMALL);
    interval.setSpacingAfter(19);
    doc.add(interval);

    PdfPTable identity = new PdfPTable(new float[]{1, 1});
    identity.setWidthPercentage(100);
    identity.addCell(cell("ACCOUNT HOLDER\n" + statement.holder, BODY, LIGHT, Element.ALIGN_LEFT));
    identity.addCell(cell("ACCOUNT REFERENCE\n" + statement.reference, BODY, LIGHT, Element.ALIGN_LEFT));
    doc.add(identity);

    BigDecimal incoming = BigDecimal.ZERO;
    BigDecimal outgoing = BigDecimal.ZERO;
    for (Entry entry : statement.transactions) {
      if (entry.credit) incoming = incoming.add(entry.amount);
      else outgoing = outgoing.add(entry.amount);
    }
    BigDecimal closing = statement.opening.add(incoming).subtract(outgoing);
    Paragraph summaryHeader = new Paragraph("Account summary", BOLD);
    summaryHeader.setSpacingBefore(24);
    summaryHeader.setSpacingAfter(12);
    doc.add(summaryHeader);
    PdfPTable summary = new PdfPTable(2);
    summary.setWidthPercentage(100);
    String curr = statement.currency + " ";
    summary.addCell(cell("Opening balance\n" + curr + decimal(statement.opening), BOLD, LIGHT, Element.ALIGN_LEFT));
    summary.addCell(cell("Total incoming\n" + curr + decimal(incoming), BOLD, LIGHT, Element.ALIGN_LEFT));
    summary.addCell(cell("Total outgoing\n" + curr + decimal(outgoing), BOLD, LIGHT, Element.ALIGN_LEFT));
    summary.addCell(cell("CLOSING BALANCE\n" + curr + decimal(closing), new Font(Font.HELVETICA, 10, Font.BOLD, TEAL), LIGHT, Element.ALIGN_LEFT));
    doc.add(summary);

    Paragraph activityTitle = new Paragraph("Transaction activity", BOLD);
    activityTitle.setSpacingBefore(25);
    activityTitle.setSpacingAfter(10);
    doc.add(activityTitle);
    PdfPTable table = new PdfPTable(new float[]{1.1f, 2.7f, 1.2f, 1.2f, 1.3f});
    table.setWidthPercentage(100);
    table.setHeaderRows(1);
    for (String heading : new String[]{"DATE", "DETAILS", "CREDIT", "DEBIT", "BALANCE"}) {
      table.addCell(cell(heading, WHITE, TEAL, Element.ALIGN_LEFT));
    }
    BigDecimal rolling = statement.opening;
    if (statement.transactions.isEmpty()) {
      PdfPCell none = cell("No transactions in the selected period", BODY, LIGHT, Element.ALIGN_CENTER);
      none.setColspan(5);
      table.addCell(none);
    }
    for (int i = 0; i < statement.transactions.size(); i++) {
      Entry e = statement.transactions.get(i);
      rolling = e.credit ? rolling.add(e.amount) : rolling.subtract(e.amount);
      java.awt.Color background = i % 2 == 0 ? java.awt.Color.WHITE : LIGHT;
      table.addCell(cell(e.date.format(DATE), BODY, background, Element.ALIGN_LEFT));
      table.addCell(cell(e.description, BODY, background, Element.ALIGN_LEFT));
      table.addCell(cell(e.credit ? decimal(e.amount) : "-", BODY, background, Element.ALIGN_RIGHT));
      table.addCell(cell(e.credit ? "-" : decimal(e.amount), BODY, background, Element.ALIGN_RIGHT));
      table.addCell(cell(decimal(rolling), BOLD, background, Element.ALIGN_RIGHT));
    }
    doc.add(table);
    Paragraph note = new Paragraph("This file is a software test using editable fictional data. It does not verify account ownership or balances.", SMALL);
    note.setSpacingBefore(19);
    doc.add(note);
    doc.close();
    return bytes.toByteArray();
  }
}
