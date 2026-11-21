package demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

final class ProviderStatementAdapterTest {
  private static final LocalDate OCT_START = LocalDate.parse("2026-10-01");
  private static final LocalDate OCT_END = LocalDate.parse("2026-10-31");
  private static final LocalDate NOV_START = LocalDate.parse("2026-11-18");
  private static final LocalDate NOV_END = LocalDate.parse("2026-11-21");

  private static JsonNode fixture(String name) throws Exception {
    try (InputStream in = ProviderStatementAdapterTest.class
        .getResourceAsStream("/provider/" + name)) {
      if (in == null) throw new IllegalStateException("Fixture missing: " + name);
      return ProviderStatementAdapter.json(in.readAllBytes());
    }
  }

  private static JsonNode completedFourRowTestFixture() throws Exception {
    // ONLY for the adapter unit test. These changed totals are NOT the user's
    // complete October statement: the user supplied merely its first four rows.
    ObjectNode sample = (ObjectNode) fixture("partial-october-acc_0001.json");
    sample.put("closing_balance", new BigDecimal("600.53"));
    sample.put("total_payments", new BigDecimal("907.38"));
    sample.put("total_deposits", new BigDecimal("1507.91"));
    return sample;
  }

  @Test
  void refusesPartialOctoberStatementInsteadOfIssuingWrongPdf() throws Exception {
    JsonNode customer = fixture("customer-cus_0001.json");
    JsonNode partial = fixture("partial-october-acc_0001.json");
    IllegalArgumentException exception = assertThrows(IllegalArgumentException.class,
        () -> ProviderStatementAdapter.adapt(customer, partial, "cus_0001",
            "acc_0001", OCT_START, OCT_END));
    assertTrue(exception.getMessage().contains("incomplete"));
  }

  @Test
  void reconcilesSignedAmountsAndIntermediateBalances() throws Exception {
    StatementServer.Statement result = ProviderStatementAdapter.adapt(
        fixture("customer-cus_0001.json"), completedFourRowTestFixture(),
        "cus_0001", "acc_0001", OCT_START, OCT_END);
    assertEquals("Amina Rauf", result.holder());
    assertEquals("****0001", result.reference());
    assertEquals("USD", result.currency());
    assertEquals(4, result.transactions().size());
    assertEquals(new BigDecimal("1330.91"), result.transactions().get(0).amount());
    assertTrue(result.transactions().get(0).credit());
    assertFalse(result.transactions().get(1).credit());
    assertEquals(new BigDecimal("563.12"), result.transactions().get(1).amount());
    assertTrue(StatementServer.render(result).length > 1000);
  }

  @Test
  void acceptsEmptyPeriodWithoutInventingActivity() throws Exception {
    StatementServer.Statement result = ProviderStatementAdapter.adapt(
        fixture("customer-cus_0005.json"),
        fixture("empty-november-acc_0005.json"),
        "cus_0005", "acc_0005", NOV_START, NOV_END);
    assertTrue(result.transactions().isEmpty());
    assertEquals("USD", result.currency());
    assertEquals(0, BigDecimal.ZERO.compareTo(result.opening()));
    assertTrue(StatementServer.render(result).length > 1000);
  }

  @Test
  void rejectsWrongCustomerOrAccountOwnership() throws Exception {
    JsonNode customer = fixture("customer-cus_0001.json");
    JsonNode statement = completedFourRowTestFixture();
    assertThrows(IllegalArgumentException.class, () ->
        ProviderStatementAdapter.adapt(customer, statement,
            "cus_0005", "acc_0001", OCT_START, OCT_END));
    assertThrows(IllegalArgumentException.class, () ->
        ProviderStatementAdapter.adapt(customer, statement,
            "cus_0001", "acc_9999", OCT_START, OCT_END));
  }

  @Test
  void rejectsWrongRunningBalance() throws Exception {
    JsonNode statement = completedFourRowTestFixture();
    ((ObjectNode) statement.path("transactions").get(1)).put("balance",
        new BigDecimal("777.79"));
    assertThrows(IllegalArgumentException.class, () ->
        ProviderStatementAdapter.adapt(
            fixture("customer-cus_0001.json"), statement,
            "cus_0001", "acc_0001", OCT_START, OCT_END));
  }

  @Test
  void rejectsTruncatedPagination() throws Exception {
    ObjectNode statement = (ObjectNode) completedFourRowTestFixture();
    statement.put("has_more", true);
    assertThrows(IllegalArgumentException.class, () ->
        ProviderStatementAdapter.adapt(
            fixture("customer-cus_0001.json"), statement,
            "cus_0001", "acc_0001", OCT_START, OCT_END));
  }

  @Test
  void rejectsOutOfOrderStatements() throws Exception {
    JsonNode statement = completedFourRowTestFixture();
    ((ObjectNode) statement.path("transactions").get(1)).put("date",
        "2026-10-01");
    assertThrows(IllegalArgumentException.class, () ->
        ProviderStatementAdapter.adapt(
            fixture("customer-cus_0001.json"), statement,
            "cus_0001", "acc_0001", OCT_START, OCT_END));
  }

  @Test
  void clientFetchesTwoReadOnlyApisWithBearerAuthentication() throws Exception {
    HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicInteger requestCount = new AtomicInteger();
    upstream.createContext("/", exchange -> {
      try {
        if (!"GET".equals(exchange.getRequestMethod())
            || !"Bearer sandbox-test-token".equals(
                exchange.getRequestHeaders().getFirst("Authorization"))) {
          exchange.sendResponseHeaders(401, -1);
          return;
        }
        String path = exchange.getRequestURI().getPath();
        String body;
        if ("/api/customers/cus_0005".equals(path)) {
          body = fixture("customer-cus_0005.json").toString();
        } else if ("/api/accounts/acc_0005/statements".equals(path)
            && "from=2026-11-18&to=2026-11-21".equals(
                exchange.getRequestURI().getQuery())) {
          body = fixture("empty-november-acc_0005.json").toString();
        } else {
          exchange.sendResponseHeaders(404, -1);
          return;
        }
        requestCount.incrementAndGet();
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
      } catch (Exception e) {
        exchange.sendResponseHeaders(500, -1);
      } finally {
        exchange.close();
      }
    });
    upstream.start();
    try {
      ProviderStatementClient client = new ProviderStatementClient(
          "http://127.0.0.1:" + upstream.getAddress().getPort(),
          "sandbox-test-token", HttpClient.newHttpClient());
      StatementServer.Statement statement = client.fetchAndAdapt(
          "cus_0005", "acc_0005", NOV_START, NOV_END);
      assertEquals(2, requestCount.get());
      assertEquals("Empty Period Demo Customer", statement.holder());
      assertTrue(statement.transactions().isEmpty());
    } finally {
      upstream.stop(0);
    }
  }

  @Test
  void rejectsUntrustedIdsBeforeOutboundRequests() {
    ProviderStatementClient client = new ProviderStatementClient(
        "https://api.example.test", "test-token", HttpClient.newHttpClient());
    assertThrows(IllegalArgumentException.class, () -> client.fetchAndAdapt(
        "../admin", "acc_0001", NOV_START, NOV_END));
  }
}
