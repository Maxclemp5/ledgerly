package demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/**
 * Protected integration endpoint for a trusted web-app backend.
 * The browser must never call this endpoint or receive either API token.
 */
final class ProviderStatementEndpoint {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final int MAX_REQUEST_BYTES = 4096;

  private ProviderStatementEndpoint() {}

  static void handle(HttpExchange exchange) throws IOException {
    exchange.getResponseHeaders().set("Cache-Control", "no-store");
    exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");

    if (!"POST".equals(exchange.getRequestMethod())) {
      fail(exchange, 405, "POST required");
      return;
    }
    String secret = System.getenv("STATEMENT_SERVICE_TOKEN");
    if (secret == null || secret.length() < 32) {
      fail(exchange, 503, "Statement service not configured");
      return;
    }
    String authorization = exchange.getRequestHeaders().getFirst("Authorization");
    String token = authorization != null && authorization.startsWith("Bearer ")
        ? authorization.substring(7) : "";
    if (!MessageDigest.isEqual(
        secret.getBytes(StandardCharsets.UTF_8),
        token.getBytes(StandardCharsets.UTF_8))) {
      exchange.getResponseHeaders().set("WWW-Authenticate", "Bearer");
      fail(exchange, 401, "Unauthorized");
      return;
    }
    String type = exchange.getRequestHeaders().getFirst("Content-Type");
    if (type == null || !type.toLowerCase(java.util.Locale.ROOT)
        .startsWith("application/json")) {
      fail(exchange, 415, "Expected application/json");
      return;
    }
    byte[] bytes = exchange.getRequestBody().readNBytes(MAX_REQUEST_BYTES + 1);
    if (bytes.length > MAX_REQUEST_BYTES) {
      fail(exchange, 413, "Request too large");
      return;
    }

    try {
      JsonNode body = JSON.readTree(bytes);
      if (body == null || !body.isObject()) {
        throw new IllegalArgumentException("JSON object required");
      }
      String customerId = required(body, "customerId");
      String accountId = required(body, "accountId");
      LocalDate from = date(required(body, "from"));
      LocalDate to = date(required(body, "to"));
      StatementServer.Statement statement = ProviderStatementClient.configured()
          .fetchAndAdapt(customerId, accountId, from, to);
      byte[] pdf = StatementServer.render(statement);
      exchange.getResponseHeaders().set("Content-Type", "application/pdf");
      exchange.getResponseHeaders().set("Content-Disposition",
          "attachment; filename=statement-sample.pdf");
      exchange.sendResponseHeaders(200, pdf.length);
      try (OutputStream out = exchange.getResponseBody()) {
        out.write(pdf);
      }
    } catch (IllegalArgumentException ex) {
      fail(exchange, 422, "Statement is incomplete or invalid");
    } catch (IllegalStateException ex) {
      fail(exchange, 503, "Provider integration is not configured");
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      fail(exchange, 502, "Provider request interrupted");
    } catch (IOException ex) {
      fail(exchange, 502, "Provider API unavailable or invalid response");
    } catch (Exception ex) {
      System.err.println("Provider statement generation error: "
          + ex.getClass().getSimpleName());
      fail(exchange, 500, "Statement generation failed");
    }
  }

  private static String required(JsonNode data, String key) {
    JsonNode value = data.get(key);
    if (value == null || !value.isTextual()
        || value.asText().isBlank() || value.asText().length() > 64) {
      throw new IllegalArgumentException("Missing " + key);
    }
    return value.asText().trim();
  }

  private static LocalDate date(String input) {
    try {
      return LocalDate.parse(input);
    } catch (DateTimeParseException ex) {
      throw new IllegalArgumentException("Invalid period");
    }
  }

  private static void fail(HttpExchange exchange, int status, String message)
      throws IOException {
    byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream out = exchange.getResponseBody()) {
      out.write(bytes);
    }
  }
}
