
# Inter-App API Test-Anleitung

## Für die andere Replit-Anwendung (Service-Plattform)

### 1. Basis-Tests (ohne Authentifizierung)

Zuerst testen Sie, ob die API grundsätzlich erreichbar ist:

```bash
# Debug-Route testen
curl https://ihre-wawi-anwendung.replit.app/api/inter-app/debug

# Konfiguration prüfen
curl https://ihre-wawi-anwendung.replit.app/api/inter-app/config-check
```

Erwartete Antwort:
```json
{
  "success": true,
  "message": "Inter-App API ist erreichbar",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 2. Secrets konfigurieren

Beide Anwendungen müssen dieselben Secrets haben:

```bash
INTER_APP_SECRET=ihr-starker-geheimer-schluessel-hier
API_SECRET_KEY=ihr-api-schluessel-hier
```

### 3. HMAC-Authentifizierung implementieren

Hier ist ein vollständiges Node.js-Beispiel für die Service-Plattform:

```javascript
const crypto = require('crypto');
const fetch = require('node-fetch');

class InterAppClient {
  constructor(baseURL, appSource = 'service-platform') {
    this.baseURL = baseURL;
    this.appSource = appSource;
    this.interAppSecret = process.env.INTER_APP_SECRET;
    this.apiSecretKey = process.env.API_SECRET_KEY;
  }

  createSignature(method, path, body = null) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    
    const payload = `${method}:${path}:${bodyStr}:${timestamp}:${this.appSource}`;
    const signature = crypto
      .createHmac('sha256', this.interAppSecret)
      .update(payload)
      .digest('hex');

    return {
      signature,
      timestamp,
      headers: {
        'Authorization': `Bearer ${signature}`,
        'X-Timestamp': timestamp,
        'X-App-Source': this.appSource,
        'X-API-Key': this.apiSecretKey,
        'Content-Type': 'application/json'
      }
    };
  }

  async makeRequest(method, path, body = null) {
    const { headers } = this.createSignature(method, path, body);
    
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Erwartete JSON, erhielt: ${contentType}. Antwort: ${text.substring(0, 200)}...`);
    }

    return response.json();
  }

  async healthCheck() {
    return this.makeRequest('GET', '/api/inter-app/health');
  }

  async getSuppliers() {
    return this.makeRequest('GET', '/api/inter-app/suppliers');
  }

  async getProducts(options = {}) {
    const params = new URLSearchParams();
    if (options.supplierId) params.append('supplier_id', options.supplierId.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    
    const path = `/api/inter-app/products${params.toString() ? '?' + params.toString() : ''}`;
    return this.makeRequest('GET', path);
  }
}

// Verwendung:
const client = new InterAppClient('https://ihre-wawi-anwendung.replit.app');

// Test
async function testAPI() {
  try {
    console.log('Testing health check...');
    const health = await client.healthCheck();
    console.log('Health check result:', health);

    console.log('Testing suppliers...');
    const suppliers = await client.getSuppliers();
    console.log('Suppliers result:', suppliers);

    console.log('Testing products...');
    const products = await client.getProducts({ limit: 5 });
    console.log('Products result:', products);

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testAPI();
```

### 4. Schrittweise Fehlersuche

Wenn Sie Fehler erhalten:

1. **HTML statt JSON**: API-Endpunkte sind nicht richtig geroutet
2. **401 Unauthorized**: HMAC-Signatur ist falsch
3. **404 Not Found**: Routes sind nicht registriert
4. **500 Server Error**: Datenbankverbindung oder Server-Fehler

### 5. Test-Sequenz

```javascript
// 1. Basis-Erreichbarkeit
const response1 = await fetch('https://ihre-wawi-anwendung.replit.app/api/inter-app/debug');
console.log('Debug:', await response1.json());

// 2. Konfiguration prüfen
const response2 = await fetch('https://ihre-wawi-anwendung.replit.app/api/inter-app/config-check');
console.log('Config:', await response2.json());

// 3. Authentifizierte Anfrage
const client = new InterAppClient('https://ihre-wawi-anwendung.replit.app');
const health = await client.healthCheck();
console.log('Health:', health);
```

Die Wawi-Proviantomat Anwendung ist jetzt bereit für Inter-App Kommunikation!
