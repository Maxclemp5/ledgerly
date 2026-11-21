package demo;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.regex.Pattern;

/**
 * Read-only provider API client. Credentials and base URL are server-side
 * environment configuration, not supplied by end users or JSON request bodies.
 */
final class ProviderStatementClient {
  private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
  private static final int MAX_RESPONSE_BYTES = 1024 * 1024;

  private final URI baseUri;
  private final String apiToken;
  private final HttpClient client;

  ProviderStatementClient(String baseUrl, String apiToken, HttpClient client) {
    if (baseUrl == null || baseUrl.isBlank() || apiToken == null || apiToken.isBlank()) {
      throw new IllegalStateException("Customer API is not configured");
    }
    URI uri = URI.create(baseUrl);
    String scheme = uri.getScheme();
    String host = uri.getHost();
    boolean allowedLocal = "http".equalsIgnoreCase(scheme) &&
        host != null && (host.equals("localhost") || host.equals("127.0.0.1")
            || host.endsWith(".railway.internal"));
    boolean allowedHttps = "https".equalsIgnoreCase(scheme) && host != null;
    if ((!allowedLocal && !allowedHttps) || uri.getRawQuery() != null
        || uri.getRawFragment() != null || uri.getUserInfo() != null) {
      throw new IllegalStateException("Customer API URL must use HTTPS or a private/local host");
    }
    String normalized = baseUrl.replaceAll("/+$", "");
    this.baseUri = URI.create(normalized);
    this.apiToken = apiToken;
    this.client = client;
  }

  static ProviderStatementClient configured() {
    return new ProviderStatementClient(
        System.getenv("CUSTOMER_API_BASE_URL"),
        System.getenv("CUSTOMER_API_TOKEN"),
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()
    );
  }

  StatementServer.Statement fetchAndAdapt(
      String customerId, String accountId, LocalDate from, LocalDate to)
      throws IOException, InterruptedException {
    if (!safeId(customerId) || !safeId(accountId)) {
      throw new IllegalArgumentException("Invalid customer or account id");
    }
    if (from == null || to == null || to.isBefore(from)
        || to.isAfter(from.plusYears(1))) {
      throw new IllegalArgumentException("Invalid statement period");
    }

    JsonNode customer = request("/api/customers/" + customerId);
    JsonNode statement = request("/api/accounts/" + accountId
        + "/statements?from=" + from + "&to=" + to);
    return ProviderStatementAdapter.adapt(
        customer, statement, customerId, accountId, from, to);
  }

  private JsonNode request(String relativePath) throws IOException, InterruptedException {
    HttpRequest request = HttpRequest.newBuilder(URI.create(baseUri + relativePath))
        .timeout(Duration.ofSeconds(12))
        .header("Accept", "application/json")
        .header("Authorization", "Bearer " + apiToken)
        .GET().build();
    HttpResponse<InputStream> response = client.send(
        request, HttpResponse.BodyHandlers.ofInputStream());
    try (InputStream body = response.body()) {
      if (response.statusCode() != 200) {
        // Do not expose or log upstream body data containing customer details.
        throw new IOException("Provider API returned HTTP " + response.statusCode());
      }
      byte[] bytes = body.readNBytes(MAX_RESPONSE_BYTES + 1);
      if (bytes.length > MAX_RESPONSE_BYTES) {
        throw new IOException("Provider response is too large");
      }
      return ProviderStatementAdapter.json(bytes);
    }
  }

  private static boolean safeId(String value) {
    return value != null && SAFE_ID.matcher(value).matches();
  }
}
