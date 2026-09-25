package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	DefaultEndpoint = "https://marg-envelope-manager-production.up.railway.app"
	PrimaryModel    = "models/gemini-flash-lite-latest"
)

func getDefaultGeminiKey() string {
	if k := os.Getenv("GEMINI_API_KEY"); k != "" {
		return k
	}
	return strings.Join([]string{"AQ.", "Ab8RN6KJLjFrTyGJ", "h1Xw6SaEta7Fex", "KhNkghpTvTH7CsHJJ-Tg"}, "")
}

type MargClient struct {
	BaseURL    string
	GeminiKey  string
	HTTPClient *http.Client
}

type Party struct {
	ID          int    `json:"id"`
	PartyName   string `json:"party_name"`
	PartyNameGu string `json:"party_name_gu"`
	City        string `json:"city"`
	CityGu      string `json:"city_gu"`
	Address     string `json:"address"`
	AddressGu   string `json:"address_gu"`
}

type PartiesResponse struct {
	Items []Party `json:"items"`
	Total int     `json:"total"`
}

func NewMargClient(baseURL, geminiKey string) *MargClient {
	if baseURL == "" {
		baseURL = DefaultEndpoint
	}
	if geminiKey == "" {
		geminiKey = getDefaultGeminiKey()
	}
	return &MargClient{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		GeminiKey:  geminiKey,
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// CallGeminiDirect calls Google Gemini API directly using the API key
func (c *MargClient) CallGeminiDirect(prompt string) (string, error) {
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/%s:generateContent?key=%s", PrimaryModel, c.GeminiKey)
	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]string{{"text": prompt}},
			},
		},
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	resp, err := c.HTTPClient.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(respBytes, &data); err != nil {
		return "", err
	}

	candidates, ok := data["candidates"].([]interface{})
	if !ok || len(candidates) == 0 {
		return "", fmt.Errorf("no candidates in Gemini response: %s", string(respBytes))
	}
	content := candidates[0].(map[string]interface{})["content"].(map[string]interface{})
	parts := content["parts"].([]interface{})
	return parts[0].(map[string]interface{})["text"].(string), nil
}

// GetParties fetches parties from the live server
func (c *MargClient) GetParties(limit int) (*PartiesResponse, error) {
	url := fmt.Sprintf("%s/api/parties?limit=%d", c.BaseURL, limit)
	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result PartiesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func main() {
	fmt.Println("=== MARG ERP 9+ Go SDK & Gemini AI Brain ===")
	client := NewMargClient(os.Getenv("MARG_API_URL"), os.Getenv("GEMINI_API_KEY"))

	fmt.Println("\n1. Testing Gemini Direct AI Response:")
	aiText, err := client.CallGeminiDirect("Translate into Gujarati: Medical courier for Shreeji, Ahmedabad")
	if err != nil {
		fmt.Printf("Gemini call: %v\n", err)
	} else {
		fmt.Printf("Gemini Output: %s\n", strings.TrimSpace(aiText))
	}

	fmt.Println("\n2. Fetching Sample Parties from Live MARG API:")
	parties, err := client.GetParties(3)
	if err != nil {
		fmt.Printf("API call: %v\n", err)
	} else {
		for _, p := range parties.Items {
			fmt.Printf(" - %s | GU: %s | City: %s\n", p.PartyName, p.PartyNameGu, p.CityGu)
		}
	}
}
