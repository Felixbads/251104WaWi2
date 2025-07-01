# WaWi-Proviantomat API Integration Guide
*Für externe Replit-Anwendungen*

## 🔗 Verbindung zur WaWi API

### Base URL
```
https://[ihre-wawi-replit-domain]/api/inter-app/
```

---

## ✅ Health Check (OHNE Authentifizierung)

### Endpunkt: `GET /api/inter-app/health`

**Zweck:** Überprüft die API-Verfügbarkeit und Datenbankverbindung

**Beispiel:**
```bash
curl https://ihre-wawi-app.replit.app/api/inter-app/health
```

**Antwort:**
```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-07-01T11:46:47.457Z",
  "version": "1.0.0",
  "message": "Wawi-Proviantomat API verfügbar"
}
```

---

## 🔐 Authentifizierte Endpunkte

**Alle anderen Endpunkte benötigen HMAC-SHA256 Authentifizierung.**

### Erforderliche Environment Variables
```bash
INTER_APP_SECRET=ihr-starker-geheimer-schluessel-hier
API_SECRET_KEY=ihr-api-schluessel-hier
```
*Beide Apps müssen identische Werte verwenden*

### HMAC Signatur Format
```
Payload: METHOD:PATH:BODY:TIMESTAMP:SOURCE
```

**Beispiel für GET Request:**
```
Payload: "GET:/api/inter-app/suppliers::1751370000:service-platform"
```

**Beispiel für POST Request mit Body:**
```
Payload: "POST:/api/inter-app/products:{"limit":50}:1751370000:service-platform"
```

### Erforderliche Headers
```
Authorization: Bearer [HMAC_SIGNATURE]
X-Timestamp: [UNIX_TIMESTAMP]
X-App-Source: service-platform
X-API-Key: [API_SECRET_KEY]
Content-Type: application/json
```

---

## 📊 Verfügbare Datenendpunkte

### 1. Lieferanten
**GET** `/api/inter-app/suppliers`
- Alle aktiven Lieferanten mit vollständigen Informationen
- Inkl. Adresse, Kontaktdaten, Zahlungs- und Lieferbedingungen

### 2. Lieferant Details
**GET** `/api/inter-app/suppliers/{id}`
- Spezifischer Lieferant mit allen zugehörigen Produkten
- Vollständige Produktkataloge pro Lieferant

### 3. Produkte (mit Pagination)
**GET** `/api/inter-app/products?limit=50&offset=0&supplier_id=123`
- Alle Produkte mit optionaler Filterung
- Parameter: `limit`, `offset`, `supplier_id`

### 4. Produkt Details
**GET** `/api/inter-app/products/{id}`
- Spezifisches Produkt mit Lieferanteninformationen
- Inkl. Fotos, Nährwerte, Allergene, Inhaltsstoffe

### 5. Lager/Warehouses
**GET** `/api/inter-app/warehouses`
- Alle Lager mit Inventar-Statistiken
- Bestandsinformationen und Zuordnungen

### 6. Datenvollständigkeit
**GET** `/api/inter-app/data-completeness`
- Analyse der Datenvollständigkeit
- Qualitätsindikatoren für UI-Rendering

---

## 💡 Implementierung in Node.js

### Basis Setup
```javascript
import crypto from 'crypto';

class WawiApiClient {
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

  async healthCheck() {
    // Kein Auth needed
    const response = await fetch(`${this.baseURL}/api/inter-app/health`);
    return await response.json();
  }

  async getSuppliers() {
    const { headers } = this.createSignature('GET', '/api/inter-app/suppliers');
    const response = await fetch(`${this.baseURL}/api/inter-app/suppliers`, {
      method: 'GET',
      headers
    });
    return await response.json();
  }

  async getProducts(options = {}) {
    const { limit = 50, offset = 0, supplier_id } = options;
    const params = new URLSearchParams({ limit, offset });
    if (supplier_id) params.append('supplier_id', supplier_id);
    
    const path = `/api/inter-app/products?${params}`;
    const { headers } = this.createSignature('GET', path);
    
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'GET',
      headers
    });
    return await response.json();
  }
}
```

### Verwendung
```javascript
const client = new WawiApiClient('https://ihre-wawi-app.replit.app');

// Test Verbindung
const health = await client.healthCheck();
console.log('API Status:', health.status);

// Lieferanten abrufen
const suppliers = await client.getSuppliers();
console.log(`${suppliers.length} Lieferanten gefunden`);

// Produkte abrufen
const { data: products, pagination } = await client.getProducts({
  limit: 100,
  supplier_id: 123
});
```

---

## 🚨 Fehlerbehandlung

### Häufige Fehlercodes
- **401**: `MISSING_AUTH_HEADER` - Authorization Header fehlt
- **401**: `INVALID_SIGNATURE` - HMAC Signatur ungültig
- **401**: `TIMESTAMP_EXPIRED` - Request älter als 5 Minuten
- **429**: `RATE_LIMIT_EXCEEDED` - Zu viele Requests (200/Min)
- **500**: `MISSING_AUTH_CONFIG` - Server-Konfigurationsfehler

### Debug-Tipps
1. **Health Check zuerst**: Immer mit `/health` testen
2. **Secrets prüfen**: `INTER_APP_SECRET` und `API_SECRET_KEY` in beiden Apps identisch
3. **Timestamp**: Unix-Timestamp in Sekunden (nicht Millisekunden)
4. **Body Format**: Leerer Body als `""`, nicht `null`
5. **Path Format**: Exakt mit Query-Parametern wie im Request

---

## 📈 Rate Limits
- **200 Requests pro Minute** pro App
- Sliding Window Algorithmus
- Header `X-RateLimit-*` in Antworten

---

## 🔄 Datenstruktur Beispiele

### Lieferant
```json
{
  "id": 123,
  "name": "Beispiel Lieferant GmbH",
  "contactPerson": "Max Mustermann",
  "phone": "+49 123 456789",
  "email": "kontakt@beispiel.de",
  "address": "Musterstraße 1",
  "city": "Dresden",
  "postalCode": "01234",
  "paymentTerms": "30 Tage netto",
  "deliveryTerms": "frei Haus ab 100€",
  "minimumOrderValue": 100.00,
  "photos": ["url1", "url2"],
  "dataCompleteness": {
    "hasContactInfo": true,
    "hasAddress": true,
    "hasPhotos": true
  }
}
```

### Produkt
```json
{
  "id": 456,
  "name": "Beispiel Produkt",
  "shortDescription": "Kurze Beschreibung",
  "detailDescription": "Detaillierte Beschreibung",
  "ingredients": "Zutat 1, Zutat 2",
  "allergens": "Gluten, Nüsse",
  "photos": ["thumb_url", "medium_url", "large_url"],
  "supplier": {
    "id": 123,
    "name": "Lieferant Name"
  },
  "nutritionalInfo": {...},
  "dataCompleteness": {
    "hasDescription": true,
    "hasIngredients": true,
    "hasPhotos": true
  }
}
```

---

## 📞 Support

Bei Problemen:
1. Health Check testen: `/api/inter-app/health`
2. Debug Logs aktivieren (siehe HMAC Implementierung)
3. Secrets validieren
4. Netzwerk-Konnektivität prüfen

**Status:** ✅ API funktionsfähig seit 01.07.2025