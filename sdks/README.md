# MARG ERP 9+ Envelope Print Manager & Gemini AI Brain SDKs

Official, production-ready client integration libraries for MARG ERP 9+ Envelope Print Manager and Google Gemini AI Brain Core.

## Features
- **Multi-Key Resilient Pool**: Pre-configured primary key with automatic failover to previous keys and free Google Translator.
- **Active Gemini Models**: `models/gemini-flash-lite-latest`, `models/gemini-flash-latest`, `models/gemini-2.5-flash-lite`.
- **Intelligent Address Formatter**: Automatically splits Indian addresses into lines 1, 2, 3 without PIN codes.
- **Smart Bill & Invoice Parser**: Extracts party, parcels, cases, weights, and routes from unstructured text.
- **Bilingual Gujarati & English Engine**: Free background translation with 100% database persistence.

---

## 1. Python SDK
Location: `sdks/python/marg_client.py`
```bash
python3 sdks/python/marg_client.py
```
```python
from sdks.python.marg_client import MargClient

client = MargClient()
status = client.get_brain_status()
parties = client.get_parties(limit=10)
cleaned = client.clean_address("Shop 14, APMC Market, Ahmedabad 382330")
```

---

## 2. JavaScript / Node.js SDK
Location: `sdks/nodejs/marg_client.js`
```bash
node sdks/nodejs/marg_client.js
```
```javascript
const { MargClient } = require('./sdks/nodejs/marg_client');

const client = new MargClient();
const status = await client.getBrainStatus();
const parties = await client.getParties(10);
```

---

## 3. Go SDK
Location: `sdks/go/marg_client.go`
```go
package main

import "fmt"

func main() {
    client := NewMargClient("", "")
    aiText, _ := client.CallGeminiDirect("Translate to Gujarati: Shreeji Medical")
    fmt.Println(aiText)
}
```

---

## 4. Java SDK
Location: `sdks/java/MargClient.java`
```bash
java sdks/java/MargClient.java
```
```java
MargClient client = new MargClient(null, null);
String res = client.callGeminiDirect("Reply with OK");
```

---

## 5. REST / cURL
Location: `sdks/rest/api_collection.sh`
```bash
./sdks/rest/api_collection.sh
```
Interactive OpenAPI documentation available at:
`https://marg-envelope-manager-production.up.railway.app/docs`
