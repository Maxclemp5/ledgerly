package demo;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class StatementJsonModuleTest {
  private static final String VALID = """
      {
        "statementId": "STMT-DEMO-001",
        "customer": {"name": "Alex Morgan", "accountReference": "DEMO-001"},
        "currency": "GBP",
        "period": {"from": "2026-08-01", "to": "2026-08-31"},
        "openingBalance": "1250.00",
        "closingBalance": "1950.00",
        "transactions": [
          {"id": "TX1", "date": "2026-08-05",
           "description": "Incoming", "type": "credit", "amount": "750.00"},
          {"id": "TX2", "date": "2026-08-10",
           "description": "Purchase", "type": "debit", "amount": "50.00"}
        ]
      }
      """;

  private StatementServer.Statement parse(String payload) throws IOException {
    return StatementJsonModule.parse(payload.getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void acceptsBalancedStatement() throws Exception {
    StatementServer.Statement statement = parse(VALID);
    assertEquals("Alex Morgan", statement.holder());
    assertEquals("DEMO-001", statement.reference());
    assertEquals(new BigDecimal("1250.00"), statement.opening());
    assertEquals(2, statement.transactions().size());
    BigDecimal closing = statement.opening();
    for (StatementServer.Entry entry : statement.transactions()) {
      closing = entry.credit() ? closing.add(entry.amount()) :
          closing.subtract(entry.amount());
    }
    assertEquals(new BigDecimal("1950.00"), closing);
    assertTrue(StatementServer.render(statement).length > 1000);
  }

  @Test
  void rejectsClosingBalanceMismatch() {
    String invalid = VALID.replace("\"1950.00\"", "\"1951.00\"");
    IllegalArgumentException ex = assertThrows(
        IllegalArgumentException.class, () -> parse(invalid));
    assertTrue(ex.getMessage().contains("Closing balance mismatch"));
  }

  @Test
  void rejectsDuplicateLedgerTransactionIds() {
    String invalid = VALID.replace("\"TX2\"", "\"TX1\"");
    assertThrows(IllegalArgumentException.class, () -> parse(invalid));
  }

  @Test
  void rejectsTransactionOutsideStatementPeriod() {
    String invalid = VALID.replace("2026-08-10", "2026-09-01");
    assertThrows(IllegalArgumentException.class, () -> parse(invalid));
  }

  @Test
  void rejectsFloatingPointAmountsInJson() {
    String invalid = VALID.replace("\"amount\": \"750.00\"", "\"amount\": 750.00");
    assertThrows(IllegalArgumentException.class, () -> parse(invalid));
  }

  @Test
  void rejectsMalformedJson() {
    assertThrows(IOException.class, () -> parse("{bad-json"));
  }
}
