package work.nsave.ledgerdesk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.Executors;

public final class PdfStamperServer {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_BODY = 1_000_000;

    public static void main(String[] args) throws Exception {
        String token = System.getenv("PDF_STAMPER_TOKEN");
        if (token == null || token.length() < 32)
            throw new IllegalStateException("PDF_STAMPER_TOKEN must be configured with at least 32 characters");
        StatementPdfRenderer renderer = new StatementPdfRenderer();
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "10000"));
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 64);
        server.setExecutor(Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors())));
        server.createContext("/health", exchange -> {
            if (!"GET".equals(exchange.getRequestMethod())) {
                respond(exchange, 405, "text/plain", "Method not allowed".getBytes(StandardCharsets.UTF_8)); return;
            }
            respond(exchange, 200, "application/json",
                    "{\"status\":\"ok\",\"engine\":\"OpenPDF\"}".getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/render", exchange -> handleRender(exchange, token, renderer));
        server.start();
        System.out.println("OpenPDF statement stamper listening on port " + port);
    }

    private static void handleRender(HttpExchange exchange, String expectedToken, StatementPdfRenderer renderer) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "text/plain", "Method not allowed".getBytes(StandardCharsets.UTF_8)); return;
        }
        String auth = exchange.getRequestHeaders().getFirst("Authorization");
        String supplied = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : "";
        if (!MessageDigest.isEqual(expectedToken.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            respond(exchange, 401, "application/json", "{\"error\":\"Unauthorized\"}".getBytes(StandardCharsets.UTF_8)); return;
        }
        try {
            byte[] body = exchange.getRequestBody().readNBytes(MAX_BODY + 1);
            if (body.length > MAX_BODY) {
                respond(exchange, 413, "application/json", "{\"error\":\"Payload too large\"}".getBytes(StandardCharsets.UTF_8)); return;
            }
            JsonNode statement = JSON.readTree(body);
            byte[] pdf = renderer.render(statement);
            exchange.getResponseHeaders().set("Content-Type", "application/pdf");
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=nsave-account-statement.pdf");
            exchange.getResponseHeaders().set("Cache-Control", "no-store, private");
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.sendResponseHeaders(200, pdf.length);
            exchange.getResponseBody().write(pdf);
            exchange.close();
        } catch (IllegalArgumentException e) {
            respond(exchange, 422, "application/json", JSON.writeValueAsBytes(Map.of("error", e.getMessage())));
        } catch (Exception e) {
            System.err.println("OpenPDF render failed: " + e.getClass().getSimpleName());
            respond(exchange, 500, "application/json", "{\"error\":\"PDF rendering failed\"}".getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void respond(HttpExchange exchange, int status, String type, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("Cache-Control", "no-store, private");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}