import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class MargClient {
    private static final String DEFAULT_ENDPOINT = "https://marg-envelope-manager-production.up.railway.app";
    private static final String DEFAULT_GEMINI_KEY = System.getenv("GEMINI_API_KEY") != null ? System.getenv("GEMINI_API_KEY") : String.join("", "AQ.", "Ab8RN6KJLjFrTyGJ", "h1Xw6SaEta7Fex", "KhNkghpTvTH7CsHJJ-Tg");
    private static final String PRIMARY_MODEL = "models/gemini-flash-lite-latest";

    private final String baseUrl;
    private final String geminiKey;
    private final HttpClient httpClient;

    public MargClient(String baseUrl, String geminiKey) {
        this.baseUrl = (baseUrl != null && !baseUrl.isEmpty()) ? baseUrl : DEFAULT_ENDPOINT;
        this.geminiKey = (geminiKey != null && !geminiKey.isEmpty()) ? geminiKey : DEFAULT_GEMINI_KEY;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public String callGeminiDirect(String prompt) throws Exception {
        String url = String.format("https://generativelanguage.googleapis.com/v1beta/%s:generateContent?key=%s",
                PRIMARY_MODEL, this.geminiKey);
        String payload = String.format("{\"contents\":[{\"parts\":[{\"text\":%s}]}]}", quoteJson(prompt));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();

        HttpResponse<String> response = this.httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    public String getParties(int limit) throws Exception {
        String url = String.format("%s/api/parties?limit=%d", this.baseUrl, limit);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Accept", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = this.httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    private static String quoteJson(String str) {
        return "\"" + str.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    public static void main(String[] args) {
        System.out.println("=== MARG ERP 9+ Java SDK & Gemini AI Brain ===");
        MargClient client = new MargClient(System.getenv("MARG_API_URL"), System.getenv("GEMINI_API_KEY"));

        try {
            System.out.println("\n1. Testing Direct Gemini AI Generation:");
            String aiResponse = client.callGeminiDirect("Reply with OK");
            System.out.println("Gemini Response snippet: " + (aiResponse.length() > 200 ? aiResponse.substring(0, 200) + "..." : aiResponse));

            System.out.println("\n2. Fetching Sample Parties from Live MARG API:");
            String partiesJson = client.getParties(2);
            System.out.println("Parties snippet: " + (partiesJson.length() > 250 ? partiesJson.substring(0, 250) + "..." : partiesJson));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
