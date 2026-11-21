package demo;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Maps the provider's customer and account statement API responses onto the
 * existing OpenPDF statement model. This has no HTTP or secret dependencies.
 *
 * The upstream statement must be the COMPLETE, posted, ordered set of account
 * transactions for the requested period. Partial or paginated responses fail
 * the reconciliation checks; they are never issued as complete statements.
 */
final class ProviderStatementAdapter {
  private static final Set<String> CURRENCIES = Set.of("USD", "GBP", "EUR");
  private static final ObjectMapper MAPPER = new ObjectMapper()
      .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
      .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
  private static final int MAX_TRANSACTIONS = 150;

  private ProviderStatementAdapter() {}

  static JsonNode json(byte[] data) throws IOException {
    JsonNode value = MAPPER.readTree(data);
    if (value == null || !value.isObject()) {
      throw new IllegalArgumentException("Expected an API response object");
    }
    return value;
  }

  static StatementServer.Statement adapt(
      JsonNode customer, JsonNode statement, String requestedCustomerId,
      String requestedAccountId, LocalDate from, LocalDate to) {
    if (from.isAfter(to) || to.isAfter(from.plusYears(1))) {
      throw new IllegalArgumentException("Invalid requested period");
    }
    if (!requestedCustomerId.equals(text(customer, "id", 64))) {
      throw new IllegalArgumentException("Customer mismatch");
    }
    if (!requestedAccountId.equals(text(statement, "account_id", 64))
        || !requestedCustomerId.equals(text(statement, "customer_id", 64))) {
      throw new IllegalArgumentException("Statement ownership mismatch");
    }

    JsonNode accounts = customer.path("accounts");
    if (!accounts.isArray()) {
      throw new IllegalArgumentException("Customer accounts missing");
    }
    JsonNode matchingAccount = null;
    for (JsonNode account : accounts) {
      if (requestedAccountId.equals(account.path("id").asText())) {
        if (matchingAccount != null) {
          throw new IllegalArgumentException("Duplicate customer account");
        }
        matchingAccount = account;
      }
    }
    if (matchingAccount == null
        || !requestedCustomerId.equals(text(matchingAccount, "customer_id", 64))) {
      throw new IllegalArgumentException("Customer does not own account");
    }
    String currency = text(statement, "currency", 3);
    if (!CURRENCIES.contains(currency)
        || !currency.equals(text(matchingAccount, "currency", 3))) {
      throw new IllegalArgumentException("Currency mismatch");
    }

    JsonNode period = statement.path("period");
    LocalDate actualFrom = date(text(period, "from", 10));
    LocalDate actualTo = date(text(period, "to", 10));
    if (!actualFrom.equals(from) || !actualTo.equals(to)) {
      throw new IllegalArgumentException("Statement period mismatch");
    }
    BigDecimal opening = monetary(statement, "opening_balance");
    BigDecimal declaredClosing = monetary(statement, "closing_balance");
    BigDecimal declaredDeposits = monetary(statement, "total_deposits");
    BigDecimal declaredPayments = monetary(statement, "total_payments");
    if (declaredDeposits.signum() < 0 || declaredPayments.signum() < 0) {
      throw new IllegalArgumentException("Invalid totals");
    }
    JsonNode transactions = statement.path("transactions");
    if (!transactions.isArray() || transactions.size() > MAX_TRANSACTIONS) {
      throw new IllegalArgumentException("Transactions missing or too many");
    }
    // If an API signals pagination, it is not safe to render a partial period.
    if (statement.path("has_more").asBoolean(false)
        || statement.path("has_next_page").asBoolean(false)
        || (statement.hasNonNull("next_cursor")
            && !statement.path("next_cursor").asText().isEmpty())) {
      throw new IllegalArgumentException("Incomplete paginated statement");
    }

    BigDecimal running = opening;
    BigDecimal credits = BigDecimal.ZERO.setScale(2);
    BigDecimal debits = BigDecimal.ZERO.setScale(2);
    LocalDate previousDate = null;
    List<StatementServer.Entry> rows = new ArrayList<>();
    for (JsonNode transaction : transactions) {
      if (!transaction.isObject()) {
        throw new IllegalArgumentException("Invalid transaction");
      }
      LocalDate postedDate = date(text(transaction, "date", 10));
      if (postedDate.isBefore(from) || postedDate.isAfter(to)) {
        throw new IllegalArgumentException("Transaction outside period");
      }
      // Provider must return actual posting order; on the same date the order
      // in the response defines the running-balance sequence.
      if (previousDate != null && postedDate.isBefore(previousDate)) {
        throw new IllegalArgumentException("Transactions not in posting order");
      }
      previousDate = postedDate;
      String description = text(transaction, "description", 95);
      BigDecimal signedAmount = monetary(transaction, "amount");
      if (signedAmount.signum() == 0) {
        throw new IllegalArgumentException("Zero-value transaction");
      }
      running = running.add(signedAmount);
      BigDecimal reportedBalance = monetary(transaction, "balance");
      if (running.compareTo(reportedBalance) != 0) {
        throw new IllegalArgumentException("Transaction running balance mismatch");
      }
      boolean credit = signedAmount.signum() > 0;
      if (credit) credits = credits.add(signedAmount);
      else debits = debits.add(signedAmount.negate());
      rows.add(new StatementServer.Entry(postedDate, description,
          credit, signedAmount.abs()));
    }
    if (running.compareTo(declaredClosing) != 0
        || credits.compareTo(declaredDeposits) != 0
        || debits.compareTo(declaredPayments) != 0) {
      throw new IllegalArgumentException(
          "Statement totals mismatch or incomplete transaction list");
    }

    String holder = text(customer, "full_name", 80);
    String accountNumber = text(matchingAccount, "account_number", 64);
    // Do not print a full customer account number in this prototype.
    String last4 = accountNumber.length() <= 4
        ? accountNumber
        : accountNumber.substring(accountNumber.length() - 4);
    String maskedReference = "****" + last4;
    return new StatementServer.Statement(holder, maskedReference, currency,
        from, to, opening, rows);
  }

  private static String text(JsonNode object, String field, int maximum) {
    JsonNode node = object.get(field);
    if (node == null || !node.isTextual()) {
      throw new IllegalArgumentException("Missing " + field);
    }
    String value = node.asText().trim();
    if (value.isEmpty() || value.length() > maximum) {
      throw new IllegalArgumentException("Invalid " + field);
    }
    return value;
  }

  private static LocalDate date(String raw) {
    try {
      return LocalDate.parse(raw);
    } catch (DateTimeParseException ex) {
      throw new IllegalArgumentException("Invalid date");
    }
  }

  private static BigDecimal monetary(JsonNode object, String field) {
    JsonNode node = object.get(field);
    if (node == null || !(node.isNumber() || node.isTextual())) {
      throw new IllegalArgumentException("Missing monetary field: " + field);
    }
    try {
      BigDecimal value = node.isNumber()
          ? node.decimalValue()
          : new BigDecimal(node.asText());
      value = value.setScale(2, RoundingMode.UNNECESSARY);
      if (value.precision() > 13) {
        throw new IllegalArgumentException("Amount out of bounds");
      }
      return value;
    } catch (NumberFormatException | ArithmeticException ex) {
      throw new IllegalArgumentException("Invalid monetary field: " + field);
    }
  }
}
