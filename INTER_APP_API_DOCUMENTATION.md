# Inter-App API Dokumentation

## Übersicht

Die Wawi-Proviantomat-App bietet drei JSON-API-Endpunkte für die Inter-App-Kommunikation. Diese Endpunkte ermöglichen es anderen Replit-Apps, auf Lieferanten- und Produktdaten zuzugreifen.

## API-Endpunkte

### Base URL
```
https://[your-replit-domain]/api/inter-app/
```

---

### 1. Health Check
**GET** `/api/inter-app/health`

Überprüft die Verfügbarkeit der API und Datenbankverbindung.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-06-21T12:54:55.819Z",
  "version": "1.0.0",
  "message": "Wawi-Proviantomat API verfügbar"
}
```

---

### 2. Lieferanten abrufen
**GET** `/api/inter-app/suppliers`

Liefert alle aktiven Lieferanten mit Vollständigkeitsstatus.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 26,
      "name": "Lieferant Name",
      "contactPerson": "Max Mustermann",
      "phone": "+49 123 456789",
      "email": "info@lieferant.de",
      "website": "https://www.lieferant.de",
      "address": "Musterstraße 123",
      "city": "Berlin",
      "postalCode": "10115",
      "country": "Deutschland",
      "status": "active",
      "notes": "Beschreibung des Lieferanten...",
      "paymentTerms": "30 Tage netto",
      "deliveryTerms": "frei Haus ab 100€",
      "minimumOrderValue": "100.00",
      "deliveryDays": 3,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-06-20T14:22:00.000Z",
      "productCount": 15,
      "completeness": {
        "hasDescription": true,
        "hasWebsite": true,
        "hasCompleteAddress": true,
        "hasContact": true
      }
    }
  ],
  "total": 34,
  "timestamp": "2025-06-21T12:55:10.000Z"
}
```

---

### 3. Produkte abrufen
**GET** `/api/inter-app/products`

Liefert alle aktiven Produkte mit Lieferanteninformationen.

**Query Parameter:**
- `supplier_id` (optional): Filtert nach spezifischem Lieferanten
- `limit` (optional): Anzahl der Ergebnisse (Standard: 100, Maximum: 500)
- `offset` (optional): Offset für Pagination (Standard: 0)

**Beispiel:**
```
GET /api/inter-app/products?supplier_id=26&limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 89,
      "name": "Coca Cola 0,33l",
      "description": "Erfrischungsgetränk mit Koffein",
      "price": "1.50",
      "status": "active",
      "ean": "4006381008847",
      "category": "Getränke",
      "supplierId": 26,
      "createdAt": "2024-02-10T08:15:00.000Z",
      "supplierName": "Getränke Schmidt GmbH",
      "supplierEmail": "bestellung@getraenke-schmidt.de",
      "supplierWebsite": "https://www.getraenke-schmidt.de",
      "completeness": {
        "hasDescription": true,
        "hasPrice": true,
        "hasEan": true,
        "hasSupplier": true
      }
    }
  ],
  "pagination": {
    "total": 132,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "timestamp": "2025-06-21T12:55:30.000Z"
}
```

## Verwendung in externen Apps

### JavaScript/Node.js Beispiel
```javascript
const API_BASE = 'https://your-wawi-app.replit.app/api/inter-app';

// Health Check
const healthCheck = async () => {
  const response = await fetch(`${API_BASE}/health`);
  const data = await response.json();
  return data.success;
};

// Alle Lieferanten abrufen
const getSuppliers = async () => {
  const response = await fetch(`${API_BASE}/suppliers`);
  const data = await response.json();
  return data.data;
};

// Produkte eines Lieferanten abrufen
const getProductsBySupplier = async (supplierId, limit = 100) => {
  const response = await fetch(
    `${API_BASE}/products?supplier_id=${supplierId}&limit=${limit}`
  );
  const data = await response.json();
  return data.data;
};

// Alle Produkte mit Pagination
const getAllProducts = async (offset = 0, limit = 100) => {
  const response = await fetch(
    `${API_BASE}/products?offset=${offset}&limit=${limit}`
  );
  const data = await response.json();
  return {
    products: data.data,
    pagination: data.pagination
  };
};
```

### cURL Beispiele
```bash
# Health Check
curl "https://your-wawi-app.replit.app/api/inter-app/health"

# Alle Lieferanten
curl "https://your-wawi-app.replit.app/api/inter-app/suppliers"

# Erste 10 Produkte
curl "https://your-wawi-app.replit.app/api/inter-app/products?limit=10"

# Produkte eines bestimmten Lieferanten
curl "https://your-wawi-app.replit.app/api/inter-app/products?supplier_id=26"
```

## Fehlerbehandlung

Alle Endpunkte verwenden Standard-HTTP-Status-Codes:

- **200 OK**: Erfolgreiche Anfrage
- **400 Bad Request**: Ungültige Parameter
- **404 Not Found**: Ressource nicht gefunden
- **500 Internal Server Error**: Server-Fehler

**Fehler-Response Beispiel:**
```json
{
  "success": false,
  "error": "Fehler beim Abrufen der Produkte",
  "code": "PRODUCTS_FETCH_ERROR",
  "timestamp": "2025-06-21T12:55:30.000Z"
}
```

## Rate Limiting

Aktuell ist kein Rate Limiting implementiert. Die API kann ohne Authentifizierung genutzt werden.

## Datenqualität

Jeder Datensatz enthält einen `completeness`-Status, der die Vollständigkeit der Daten anzeigt:

**Lieferanten-Vollständigkeit:**
- `hasDescription`: Beschreibung ≥ 30 Zeichen
- `hasWebsite`: Website-URL vorhanden
- `hasCompleteAddress`: Adresse, Stadt und PLZ vorhanden
- `hasContact`: E-Mail oder Telefon vorhanden

**Produkt-Vollständigkeit:**
- `hasDescription`: Beschreibung ≥ 10 Zeichen
- `hasPrice`: Preis > 0
- `hasEan`: EAN-Code vorhanden
- `hasSupplier`: Lieferant zugeordnet

## Support

Bei Problemen oder Fragen zur API wenden Sie sich an das Wawi-Team.

---

**Status:** Produktionsbereit ✅  
**Letzte Aktualisierung:** 21.06.2025  
**Version:** 1.0.0