package demo;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Internal server-to-server PDF generation adapter.
 *
 * This is an integration prototype. The parent web app must authenticate the
 * customer, authorize access to the requested account, and obtain balances and
 * transactions from its ledger. Never call this endpoint from browser code.
 *
 * Generated PDFs retain the Ledgerly DEMO labels until an authorized
 * financial-statement issuance workflow has been implemented and reviewed.
 */
final class StatementJsonModule {
  private static final int MAX_BODY_BYTES = 131072;
  private static final int MAX_TRANSACTIONS = 150;
  private static final ObjectMapper JSON = new ObjectMapper()
      .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

  private StatementJsonModule() {}

  static void handle(HttpExchange exchange) throws IOException {
    exchange.getResponseHeaders().set("Cache-Control", "no-store");
    exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");

    if (!"POST".equals(exchange.getRequestMethod())) {
      error(exchange, 405, "POST required");
      return;
    }

    String expectedToken = System.getenv("STATEMENT_SERVICE_TOKEN");
    if (expectedToken == null || expectedToken.length() < 32) {
      error(exchange, 503, "Statement API has not been configured");
      return;
    }
    String authorization = exchange.getRequestHeaders().getFirst("Authorization");
    String providedToken = authorization != null && authorization.startsWith("Bearer ")
        ? authorization.substring("Bearer ".length())
        : "";
    if (!MessageDigest.isEqual(
        expectedToken.getBytes(StandardCharsets.UTF_8),
        providedToken.getBytes(StandardCharsets.UTF_8))) {
      exchange.getResponseHeaders().set("WWW-Authenticate", "Bearer");
      error(exchange, 401, "Unauthorized");
      return;
    }

    String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
    if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT)
        .startsWith("application/json")) {
      error(exchange, 415, "Expected application/json");
      return;
    }

    byte[] body = exchange.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
    if (body.length > MAX_BODY_BYTES) {
      error(exchange, 413, "Request too large");
      return;
    }

    try {
      StatementServer.Statement statement = parse(body);
      byte[] pdf = StatementServer.render(statement);
      exchange.getResponseHeaders().set("Content-Type", "application/pdf");
      exchange.getResponseHeaders().set(
          "Content-Disposition", "attachment; filename=statement-sample.pdf");
      exchange.sendResponseHeaders(200, pdf.length);
      try (OutputStream output = exchange.getResponseBody()) {
        output.write(pdf);
      }
    } catch (IllegalArgumentException | JsonProcessingException ex) {
      // Do not log raw request bodies or personally identifiable information.
      error(exchange, 400, "Invalid statement data: " + ex.getMessage());
    } catch (Exception ex) {
      System.err.println("Internal statement rendering error: " +
          ex.getClass().getSimpleName());
      error(exchange, 500, "Unable to generate statement");
    }
  }

  static StatementServer.Statement parse(byte[] body) throws IOException {
    JsonNode root = JSON.readTree(body);
    if (root == null || !root.isObject()) {
      throw new IllegalArgumentException("Object expected");
    }
    requiredText(root, "statementId", 64);
    JsonNode customer = requiredObject(root, "customer");
    String holder = requiredText(customer, "name", 80);
    String accountReference = requiredText(customer, "accountReference", 45);
    String currency = requiredText(root, "currency", 3);
    if (!Set.of("GBP", "USD", "EUR").contains(currency)) {
      throw new IllegalArgumentException("Unsupported currency");
    }

    JsonNode period = requiredObject(root, "period");
    LocalDate start = date(requiredText(period, "from", 10));
    LocalDate end = date(requiredText(period, "to", 10));
    if (end.isBefore(start) || end.isAfter(start.plusYears(1))) {
      throw new IllegalArgumentException("Invalid statement period");
    }
    BigDecimal opening = decimal(requiredText(root, "openingBalance", 20),
        false, "openingBalance");
    BigDecimal expectedClosing = decimal(requiredText(root, "closingBalance", 20),
        false, "closingBalance");
    JsonNode transactions = root.get("transactions");
    if (transactions == null || !transactions.isArray()
        || transactions.size() > MAX_TRANSACTIONS) {
      throw new IllegalArgumentException("Invalid transactions");
    }

    List<StatementServer.Entry> entries = new ArrayList<>();
    Set<String> seenIds = new HashSet<>();
    BigDecimal closing = opening;
    for (JsonNode tx : transactions) {
      if (!tx.isObject()) {
        throw new IllegalArgumentException("Invalid transaction");
      }
      String id = requiredText(tx, "id", 64);
      if (!seenIds.add(id)) {
        throw new IllegalArgumentException("Duplicate transaction id");
      }
      LocalDate txDate = date(requiredText(tx, "date", 10));
      if (txDate.isBefore(start) || txDate.isAfter(end)) {
        throw new IllegalArgumentException("Transaction outside period");
      }
      String description = requiredText(tx, "description", 95);
      String type = requiredText(tx, "type", 6);
      if (!type.equals("credit") && !type.equals("debit")) {
        throw new IllegalArgumentException("Invalid transaction type");
      }
      BigDecimal amount = decimal(requiredText(tx, "amount", 20),
          true, "amount");
      boolean isCredit = type.equals("credit");
      closing = isCredit ? closing.add(amount) : closing.subtract(amount);
      entries.add(new StatementServer.Entry(txDate, description, isCredit, amount));
    }
    if (closing.compareTo(expectedClosing) != 0) {
      throw new IllegalArgumentException("Closing balance mismatch");
    }
    // Stable order for transactions with identical booking dates.
    entries.sort(Comparator.comparing(StatementServer.Entry::date));
    return new StatementServer.Statement(
        holder, accountReference, currency, start, end, opening, entries);
  }

  private static String requiredText(JsonNode object, String key, int maxLength) {
    JsonNode node = object.get(key);
    if (node == null || !node.isTextual()) {
      throw new IllegalArgumentException("Missing " + key);
    }
    String value = node.asText().trim();
    if (value.isEmpty() || value.length() > maxLength) {
      throw new IllegalArgumentException("Invalid " + key);
    }
    return value;
  }

  private static JsonNode requiredObject(JsonNode object, String key) {
    JsonNode node = object.get(key);
    if (node == null || !node.isObject()) {
      throw new IllegalArgumentException("Missing " + key);
    }
    return node;
  }

  private static LocalDate date(String date) {
    try {
      return LocalDate.parse(date);
    } catch (DateTimeParseException ex) {
      throw new IllegalArgumentException("Invalid date");
    }
  }

  private static BigDecimal decimal(String text, boolean positive,
      String field) {
    try {
      BigDecimal amount = new BigDecimal(text)
          .setScale(2, RoundingMode.UNNECESSARY);
      if (amount.precision() > 13 || (positive && amount.signum() <= 0)) {
        throw new IllegalArgumentException("Invalid " + field);
      }
      return amount;
    } catch (ArithmeticException | NumberFormatException ex) {
      throw new IllegalArgumentException("Invalid " + field);
    }
  }

  private static void error(HttpExchange exchange, int status,
      String message) throws IOException {
    byte[] body = message.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
    exchange.sendResponseHeaders(status, body.length);
    try (OutputStream output = exchange.getResponseBody()) {
      output.write(body);
    }
  }
}
