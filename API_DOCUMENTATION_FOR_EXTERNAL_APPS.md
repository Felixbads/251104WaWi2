
# API-Dokumentation für externe Anwendungen

## Übersicht

Diese Dokumentation beschreibt, wie andere Replit-Anwendungen auf die Produktdaten und Lieferanteninformationen der Wawi-Proviantomat-Anwendung zugreifen können.

## Base URL
```
https://[ihre-wawi-replit-domain]/api
```

---

## 🔓 Öffentliche API-Endpunkte (ohne Authentifizierung)

### 1. Health Check
**GET** `/inter-app/health`

Überprüft die API-Verfügbarkeit.

```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 2. Alle Lieferanten abrufen
**GET** `/inter-app/suppliers`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Lieferantenname",
      "contactPerson": "Max Mustermann",
      "phone": "+49 123 456789",
      "email": "info@lieferant.de",
      "website": "https://www.lieferant.de",
      "address": "Straße 123",
      "city": "Berlin",
      "postalCode": "12345",
      "country": "Deutschland",
      "status": "active",
      "notes": "Anmerkungen und weitere Beschreibung des Lieferanten",
      "shortDescription": "Kurze Lieferantenbeschreibung für Übersichten",
      "photos": ["foto1.jpg", "foto2.jpg"],
      "paymentTerms": "14 Tage netto",
      "deliveryTerms": "Frei Haus ab 100€",
      "minimumOrderValue": 100.00,
      "deliveryDays": "[\"montag\", \"mittwoch\", \"freitag\"]",
      "productCount": 25,
      "completeness": {
        "hasDescription": true,
        "hasWebsite": true,
        "hasCompleteAddress": true,
        "hasContact": true,
        "hasPhotos": true
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "total": 15
}
```

### 3. Alle Produkte abrufen
**GET** `/inter-app/products`

**Query Parameter:**
- `supplier_id` (optional): Filtert nach Lieferanten-ID
- `limit` (optional): Anzahl Ergebnisse (Standard: 100, Max: 500)
- `offset` (optional): Offset für Pagination (Standard: 0)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "vendonId": "12345",
      "productName": "Coca Cola 0,33l",
      "price": 1.50,
      "category": "Getränke",
      "description": "Erfrischungsgetränk mit Koffein in der praktischen 0,33l Dose. Perfekt geeignet für den schnellen Energieschub zwischendurch.",
      "shortDescription": "Cola-Erfrischungsgetränk mit Koffein",
      "ingredients": "Wasser, Zucker, Kohlensäure, natürliches Aroma, Koffein, Phosphorsäure, Karamellzuckerkulör",
      "allergens": "Keine Allergene. Kann Spuren von Nüssen enthalten.",
      "nutritionalInfo": "{\"energy\": \"180kJ/43kcal\", \"fat\": \"0g\", \"carbohydrates\": \"10.6g\", \"sugar\": \"10.6g\", \"protein\": \"0g\", \"salt\": \"0.02g\", \"caffeine\": \"34mg\"}",
      "photos": ["cola_front.jpg", "cola_back.jpg", "cola_ingredients.jpg"],
      "status": "active",
      "sku": "COLA-033",
      "barcode": "4006381008847",
      "supplierId": 1,
      "supplierName": "Getränke Schmidt GmbH",
      "supplierSku": "GS-COLA-033",
      "packageSize": "24x0,33l",
      "shelfLifeDays": 365,
      "minOrderQuantity": 24,
      "vat": 19.0,
      "depositPrice": 0.25,
      "depositVat": 19.0,
      "productType": "PRODUCT",
      "supplier": {
        "id": 1,
        "name": "Getränke Schmidt GmbH",
        "email": "info@getraenke-schmidt.de",
        "website": "https://www.getraenke-schmidt.de",
        "shortDescription": "Traditioneller Getränkegroßhandel seit 1950",
        "photos": ["logo_schmidt.jpg"]
      },
      "completeness": {
        "hasDescription": true,
        "hasPrice": true,
        "hasBarcode": true,
        "hasSupplier": true,
        "hasIngredients": true,
        "hasAllergens": true,
        "hasNutritionalInfo": true,
        "hasPhotos": true
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## 🔒 Sichere Inter-App-Kommunikation (HMAC-Authentifizierung)

Für produktive Anwendungen empfehlen wir die sichere Authentifizierung.

### Setup der Secrets

Beide Anwendungen benötigen dieselben Secrets:

```bash
INTER_APP_SECRET=ihr-starker-geheimer-schluessel-hier
API_SECRET_KEY=ihr-api-schluessel-hier
```

### Authentifizierter Client (JavaScript/Node.js)

```javascript
const crypto = require('crypto');

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

  async makeRequest(method, path, body = null) {
    const { headers } = this.createSignature(method, path, body);
    
    const response = await fetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }

  // API-Methoden
  async healthCheck() {
    return this.makeRequest('GET', '/api/inter-app/health');
  }

  async getSuppliers() {
    const result = await this.makeRequest('GET', '/api/inter-app/suppliers');
    return result.data || [];
  }

  async getSupplier(id) {
    const result = await this.makeRequest('GET', `/api/inter-app/suppliers/${id}`);
    return result.data || null;
  }

  async getProducts(options = {}) {
    const params = new URLSearchParams();
    if (options.supplierId) params.append('supplier_id', options.supplierId.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    
    const path = `/api/inter-app/products${params.toString() ? '?' + params.toString() : ''}`;
    const result = await this.makeRequest('GET', path);
    return {
      products: result.data || [],
      pagination: result.pagination || {}
    };
  }

  async getProduct(id) {
    const result = await this.makeRequest('GET', `/api/inter-app/products/${id}`);
    return result.data || null;
  }

  // Test-Verbindung
  async testConnection() {
    try {
      const health = await this.healthCheck();
      return { success: true, status: health };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Verwendung:
const client = new WawiApiClient('https://ihre-wawi-anwendung.replit.app');

// Beispiele
async function beispielVerwendung() {
  try {
    // Verbindung testen
    const test = await client.testConnection();
    console.log('Verbindung:', test.success ? 'OK' : 'Fehler');

    // Alle Lieferanten
    const suppliers = await client.getSuppliers();
    console.log(`${suppliers.length} Lieferanten gefunden`);

    // Produkte eines Lieferanten
    const { products, pagination } = await client.getProducts({
      supplierId: 1,
      limit: 50
    });
    console.log(`${products.length} Produkte gefunden`);

    // Einzelnes Produkt
    const product = await client.getProduct(1);
    console.log('Produkt:', product?.productName);

  } catch (error) {
    console.error('Fehler:', error.message);
  }
}
```

---

## 📊 Erweiterte Endpunkte

### Lieferanten-Produkte
**GET** `/api/suppliers/:id/products`

Alle Produkte eines spezifischen Lieferanten mit erweiterten Informationen.

### Produkt-Inventar
**GET** `/api/products/:id/warehouse-inventory`

Lagerbestände eines Produkts in allen Lagern.

### Lager-Informationen
**GET** `/api/inter-app/warehouses`

Alle Lager mit Inventar-Statistiken.

---

## 🔍 Datenqualität

Jeder Datensatz enthält `completeness`-Informationen:

**Lieferanten:**
- `hasDescription`: Kurzbeschreibung oder Anmerkungen ≥ 30 Zeichen
- `hasWebsite`: Website-URL vorhanden
- `hasCompleteAddress`: Vollständige Adresse (Straße, Stadt, PLZ)
- `hasContact`: Kontaktdaten vorhanden (E-Mail oder Telefon)
- `hasPhotos`: Mindestens ein Foto hochgeladen

**Produkte:**
- `hasDescription`: Kurz- oder Detailbeschreibung ≥ 10 Zeichen
- `hasPrice`: Gültiger Preis > 0
- `hasBarcode`: Barcode/EAN-Code vorhanden
- `hasSupplier`: Lieferant zugeordnet
- `hasIngredients`: Inhaltsstoffe angegeben
- `hasAllergens`: Allergene-Informationen vorhanden
- `hasNutritionalInfo`: Nährwertangaben als JSON verfügbar
- `hasPhotos`: Mindestens ein Produktfoto hochgeladen

---

## 🚀 Schnellstart für andere Replit-Apps

### 1. Secrets konfigurieren
Fügen Sie in der Replit-Secrets-Sektion hinzu:
```
INTER_APP_SECRET=ihr-geheimer-schluessel
API_SECRET_KEY=ihr-api-schluessel
WAWI_BASE_URL=https://ihre-wawi-anwendung.replit.app
```

### 2. Client installieren
Kopieren Sie die `WawiApiClient`-Klasse in Ihr Projekt.

### 3. Verwenden
```javascript
const client = new WawiApiClient(process.env.WAWI_BASE_URL);

// Alle Lieferanten mit Produkten
const suppliers = await client.getSuppliers();
for (const supplier of suppliers) {
  const { products } = await client.getProducts({ supplierId: supplier.id });
  console.log(`${supplier.name}: ${products.length} Produkte`);
}
```

---

## ⚠️ Fehlerbehandlung

### Häufige Fehler:
- **401 Unauthorized**: Falsche HMAC-Signatur oder Secrets
- **429 Rate Limited**: Zu viele Anfragen (Limit: 200/min)
- **404 Not Found**: Ressource existiert nicht
- **500 Server Error**: Datenbankfehler

### Retry-Logik:
```javascript
async function robustApiCall(apiMethod, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiMethod();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## 📈 Rate Limiting

- **Limit:** 200 Anfragen pro Minute pro Anwendung
- **Sliding Window:** 60 Sekunden
- **Headers:** `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 🔧 Testing

### Basis-Test (ohne Auth):
```bash
curl https://ihre-wawi-anwendung.replit.app/api/inter-app/health
```

### Mit Authentifizierung:
Verwenden Sie die `WawiApiClient`-Klasse für authentifizierte Anfragen.

---

## 📞 Support

Bei Problemen:
1. Health Check ausführen
2. Secrets validieren  
3. Logs der beiden Anwendungen prüfen
4. Netzwerkverbindung testen

---

**Status:** Produktionsbereit ✅  
**Version:** 2.0.0  
**Letzte Aktualisierung:** Januar 2025
