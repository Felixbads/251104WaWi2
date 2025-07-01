# Enhanced API-Dokumentation für externe Anwendungen

## Übersicht

Diese erweiterte API-Dokumentation beschreibt die vollständigen Datenübertragungsendpunkte für Produkt- und Lieferanteninformationen der Wawi-Proviantomat-Anwendung mit allen verfügbaren Feldern.

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

---

## 🏢 Lieferanten-API

### 1. Alle Lieferanten abrufen
**GET** `/inter-app/suppliers`

**Vollständige Lieferanteninformationen:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Getränke Schmidt GmbH",
      "contactPerson": "Max Mustermann",
      "phone": "+49 123 456789",
      "email": "info@getraenke-schmidt.de",
      "website": "https://www.getraenke-schmidt.de",
      "address": "Industriestraße 123",
      "city": "Dresden",
      "postalCode": "01067",
      "country": "Deutschland",
      "status": "active",
      "notes": "Traditioneller Getränkegroßhandel mit Fokus auf regionale Produkte. Zuverlässige Lieferung und gute Preise. Spezialisiert auf Erfrischungsgetränke und Mineralwasser aus Sachsen.",
      "shortDescription": "Traditioneller Getränkegroßhandel seit 1950",
      "photos": [
        "suppliers/schmidt_logo.jpg",
        "suppliers/schmidt_warehouse.jpg",
        "suppliers/schmidt_team.jpg"
      ],
      "paymentTerms": "14 Tage netto, 2% Skonto bei Zahlung innerhalb 7 Tagen",
      "deliveryTerms": "Frei Haus ab 100€ Bestellwert, sonst 15€ Versandkosten",
      "minimumOrderValue": 100.00,
      "deliveryDays": "[\"montag\", \"mittwoch\", \"freitag\"]",
      "productCount": 125,
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
  "total": 15,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 2. Einzelnen Lieferanten abrufen
**GET** `/inter-app/suppliers/:id`

Liefert einen spezifischen Lieferanten mit allen zugehörigen Produkten.

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Getränke Schmidt GmbH",
    "contactPerson": "Max Mustermann",
    "phone": "+49 123 456789",
    "email": "info@getraenke-schmidt.de",
    "website": "https://www.getraenke-schmidt.de",
    "address": "Industriestraße 123",
    "city": "Dresden",
    "postalCode": "01067",
    "country": "Deutschland",
    "status": "active",
    "notes": "Traditioneller Getränkegroßhandel mit Fokus auf regionale Produkte...",
    "shortDescription": "Traditioneller Getränkegroßhandel seit 1950",
    "photos": ["suppliers/schmidt_logo.jpg", "suppliers/schmidt_warehouse.jpg"],
    "paymentTerms": "14 Tage netto, 2% Skonto bei Zahlung innerhalb 7 Tagen",
    "deliveryTerms": "Frei Haus ab 100€ Bestellwert",
    "minimumOrderValue": 100.00,
    "deliveryDays": "[\"montag\", \"mittwoch\", \"freitag\"]",
    "products": [
      {
        "id": 1,
        "vendonId": "12345",
        "productName": "Oppacher Classic PET 0,5l",
        "shortDescription": "Natürliches Mineralwasser aus der Oberlausitz",
        "description": "Oppacher Classic ist ein natürliches Mineralwasser aus der Oberlausitz mit ausgewogenem Mineralstoffgehalt...",
        "ingredients": "Natürliches Mineralwasser",
        "allergens": "Keine Allergene",
        "nutritionalInfo": "{\"minerals\": {\"calcium\": \"91mg/l\", \"magnesium\": \"13mg/l\", \"sodium\": \"6mg/l\"}}",
        "photos": ["products/oppacher_classic.jpg"],
        "price": 2.50,
        "category": "Getränke",
        "status": "active",
        "sku": "OPP-CLA-050",
        "barcode": "4006167001234",
        "packageSize": "12x0,5l",
        "shelfLifeDays": 720,
        "minOrderQuantity": 12,
        "vat": 19.0,
        "depositPrice": 0.25,
        "depositVat": 19.0,
        "productType": "PRODUCT",
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "productCount": 125
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## 📦 Produkte-API

### 1. Alle Produkte abrufen
**GET** `/inter-app/products`

**Query Parameter:**
- `supplier_id` (optional): Filtert nach Lieferanten-ID
- `limit` (optional): Anzahl Ergebnisse (Standard: 100, Max: 500)
- `offset` (optional): Offset für Pagination (Standard: 0)

**Vollständige Produktinformationen:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "vendonId": "12345",
      "productName": "Oppacher Classic PET 0,5l",
      "price": 2.50,
      "category": "Getränke",
      "description": "Oppacher Classic ist ein natürliches Mineralwasser aus der Oberlausitz mit ausgewogenem Mineralstoffgehalt. Besonders geeignet für den täglichen Genuss und als Durstlöscher. Das Wasser stammt aus einer geschützten Quelle in der sächsischen Oberlausitz.",
      "shortDescription": "Natürliches Mineralwasser aus der Oberlausitz",
      "ingredients": "Natürliches Mineralwasser",
      "allergens": "Keine Allergene. Glutenfrei.",
      "nutritionalInfo": "{\"energy\": \"0kJ/0kcal\", \"fat\": \"0g\", \"carbohydrates\": \"0g\", \"sugar\": \"0g\", \"protein\": \"0g\", \"salt\": \"0.006g\", \"minerals\": {\"calcium\": \"91mg/l\", \"magnesium\": \"13mg/l\", \"sodium\": \"6mg/l\", \"chloride\": \"8mg/l\", \"sulfate\": \"140mg/l\"}}",
      "photos": [
        "products/oppacher_classic_front.jpg",
        "products/oppacher_classic_label.jpg",
        "products/oppacher_classic_nutritional.jpg"
      ],
      "status": "active",
      "sku": "OPP-CLA-050",
      "barcode": "4006167001234",
      "supplierId": 1,
      "supplierName": "Getränke Schmidt GmbH",
      "supplierSku": "GS-OPP-050",
      "packageSize": "12x0,5l PET-Flaschen",
      "shelfLifeDays": 720,
      "minOrderQuantity": 12,
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
        "photos": ["suppliers/schmidt_logo.jpg"]
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
    "total": 542,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 2. Einzelnes Produkt abrufen
**GET** `/inter-app/products/:id`

Liefert ein spezifisches Produkt mit vollständigen Informationen inklusive Lieferantendetails.

```json
{
  "success": true,
  "data": {
    "id": 1,
    "vendonId": "12345",
    "productName": "Oppacher Classic PET 0,5l",
    "price": 2.50,
    "category": "Getränke",
    "description": "Oppacher Classic ist ein natürliches Mineralwasser aus der Oberlausitz...",
    "shortDescription": "Natürliches Mineralwasser aus der Oberlausitz",
    "ingredients": "Natürliches Mineralwasser",
    "allergens": "Keine Allergene. Glutenfrei.",
    "nutritionalInfo": "{\"energy\": \"0kJ/0kcal\", \"minerals\": {...}}",
    "photos": ["products/oppacher_classic_front.jpg", "products/oppacher_classic_label.jpg"],
    "status": "active",
    "sku": "OPP-CLA-050",
    "barcode": "4006167001234",
    "supplierId": 1,
    "supplierName": "Getränke Schmidt GmbH",
    "supplierSku": "GS-OPP-050",
    "packageSize": "12x0,5l PET-Flaschen",
    "shelfLifeDays": 720,
    "minOrderQuantity": 12,
    "vat": 19.0,
    "depositPrice": 0.25,
    "depositVat": 19.0,
    "productType": "PRODUCT",
    "supplier": {
      "id": 1,
      "name": "Getränke Schmidt GmbH",
      "email": "info@getraenke-schmidt.de",
      "website": "https://www.getraenke-schmidt.de",
      "address": "Industriestraße 123",
      "city": "Dresden",
      "postalCode": "01067",
      "shortDescription": "Traditioneller Getränkegroßhandel seit 1950",
      "photos": ["suppliers/schmidt_logo.jpg"]
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
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## 🔒 Sichere Inter-App-Kommunikation (HMAC-Authentifizierung)

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
}
```

---

## 🔍 Erweiterte Datenqualität

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

## 📊 Verfügbare Datenfelder

### Lieferantenfelder:
- **Grunddaten**: `id`, `name`, `status`
- **Kontakt**: `contactPerson`, `phone`, `email`, `website`
- **Adresse**: `address`, `city`, `postalCode`, `country`
- **Beschreibung**: `shortDescription`, `notes`
- **Medien**: `photos` (Array von URLs)
- **Geschäftsbedingungen**: `paymentTerms`, `deliveryTerms`, `minimumOrderValue`, `deliveryDays`
- **Metadaten**: `createdAt`, `updatedAt`

### Produktfelder:
- **Grunddaten**: `id`, `vendonId`, `productName`, `price`, `category`, `status`
- **Beschreibungen**: `description`, `shortDescription`
- **Inhalt**: `ingredients`, `allergens`, `nutritionalInfo` (JSON)
- **Medien**: `photos` (Array von URLs)
- **Identifikation**: `sku`, `barcode`
- **Lieferant**: `supplierId`, `supplierName`, `supplierSku`
- **Verpackung**: `packageSize`, `shelfLifeDays`, `minOrderQuantity`
- **Steuer**: `vat`, `depositPrice`, `depositVat`
- **Typ**: `productType`
- **Metadaten**: `createdAt`, `updatedAt`

---

## 🚀 Schnellstart-Beispiel

```javascript
const client = new WawiApiClient(process.env.WAWI_BASE_URL);

// Alle Lieferanten mit vollständigen Daten
const suppliers = await client.getSuppliers();
console.log(`${suppliers.length} Lieferanten gefunden`);

suppliers.forEach(supplier => {
  console.log(`${supplier.name}:`);
  console.log(`  Beschreibung: ${supplier.shortDescription}`);
  console.log(`  Adresse: ${supplier.address}, ${supplier.city}`);
  console.log(`  Produkte: ${supplier.productCount}`);
  console.log(`  Fotos: ${supplier.photos?.length || 0}`);
});

// Alle Produkte eines Lieferanten
const { products } = await client.getProducts({ supplierId: 1 });
products.forEach(product => {
  console.log(`${product.productName}:`);
  console.log(`  Beschreibung: ${product.shortDescription}`);
  console.log(`  Inhaltsstoffe: ${product.ingredients}`);
  console.log(`  Allergene: ${product.allergens}`);
  console.log(`  Fotos: ${product.photos?.length || 0}`);
});
```

---

## ⚠️ Fehlerbehandlung

### Häufige Fehler:
- **400 Bad Request**: Ungültige Parameter
- **401 Unauthorized**: Falsche HMAC-Signatur oder Secrets
- **404 Not Found**: Ressource existiert nicht
- **429 Rate Limited**: Zu viele Anfragen (Limit: 200/min)
- **500 Server Error**: Datenbankfehler

---

## 📈 Rate Limiting
- **Limit:** 200 Anfragen pro Minute pro Anwendung
- **Sliding Window:** 60 Sekunden
- **Headers:** `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

**Status:** Produktionsbereit ✅  
**Version:** 3.0.0 (Enhanced)  
**Letzte Aktualisierung:** Juli 2025