# External Photo API Documentation

## Overview

Die External Photo API ermöglicht externen Anwendungen den Zugriff auf Foto-Daten aus dem Warenwirtschaftssystem unter Beibehaltung der Lieferanten- und Hersteller-Beziehungen.

## Endpoints

### 1. Get Entity Photos with Relationships

**Endpoint:** `GET /api/photos/external/{entityType}/{entityId}`

**Beschreibung:** Ruft Foto-Daten für ein bestimmtes Produkt oder einen Lieferanten ab, einschließlich der Beziehungsdaten.

**Parameter:**
- `entityType`: "product" oder "supplier"
- `entityId`: Numerische ID der Entität

**Beispiele:**

#### Produkt-Daten abrufen:
```bash
GET /api/photos/external/product/15
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entityType": "product",
    "entityId": 15,
    "entityName": "Dinkelchen (Dr. Quendt Dresden)",
    "photos": ["https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/15/photo1.webp"],
    "supplier": {
      "id": 26,
      "name": "APG Pirna-Cotta eG",
      "contactPerson": null,
      "phone": null,
      "email": "info@agrar-catta.de",
      "photos": []
    }
  }
}
```

#### Lieferanten-Daten abrufen:
```bash
GET /api/photos/external/supplier/26
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entityType": "supplier",
    "entityId": 26,
    "entityName": "APG Pirna-Cotta eG",
    "contactPerson": null,
    "phone": null,
    "email": "info@agrar-catta.de",
    "photos": [],
    "productCount": 1,
    "products": [
      {
        "id": 15,
        "name": "Dinkelchen (Dr. Quendt Dresden)",
        "photos": ["https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/15/photo1.webp"]
      }
    ]
  }
}
```

### 2. Search Photos by Entity Name

**Endpoint:** `GET /api/photos/external/search/{entityType}`

**Beschreibung:** Sucht nach Entitäten mit Fotos basierend auf dem Namen.

**Parameter:**
- `entityType`: "product" oder "supplier"
- `query`: Suchbegriff (URL-Parameter)
- `limit`: Maximale Anzahl Ergebnisse (optional, Standard: 20)

**Beispiele:**

#### Produkte suchen:
```bash
GET /api/photos/external/search/product?query=Dinkel&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "entityType": "product",
      "entityId": 15,
      "entityName": "Dinkelchen (Dr. Quendt Dresden)",
      "photos": ["https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/15/photo1.webp"],
      "supplier": {
        "id": 26,
        "name": "APG Pirna-Cotta eG"
      }
    }
  ]
}
```

#### Lieferanten suchen:
```bash
GET /api/photos/external/search/supplier?query=APG&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "entityType": "supplier",
      "entityId": 26,
      "entityName": "APG Pirna-Cotta eG",
      "photos": [],
      "productCount": 1
    }
  ]
}
```

## Photo Upload API

### Lieferanten-Foto Upload

**Endpoint:** `POST /api/photos/upload/supplier/{supplierId}`

**Beschreibung:** Lädt ein Foto für einen Lieferanten hoch mit automatischer Größenanpassung.

**Request Body:**
```json
{
  "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...", 
  "filename": "lieferant-logo.jpg",
  "entityType": "supplier"
}
```

**Response:**
```json
{
  "success": true,
  "urls": {
    "thumbnail": "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/26/logo_thumbnail_1751290000000.webp",
    "medium": "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/26/logo_medium_1751290000000.webp",
    "large": "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/26/logo_large_1751290000000.webp"
  },
  "message": "Lieferantenfoto erfolgreich hochgeladen"
}
```

### Produkt-Foto Upload

**Endpoint:** `POST /api/photos/upload/{productId}`

**Beschreibung:** Lädt ein Foto für ein Produkt hoch.

**Request Body:**
```json
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...",
  "filename": "produkt-foto.jpg"
}
```

## Bildgrößen und -formate

### Automatische Größenanpassung
- **Thumbnail**: 150x150px, WebP Format, 85% Qualität
- **Medium**: 400x400px, WebP Format, 85% Qualität  
- **Large**: 800x800px, WebP Format, 85% Qualität

### Speicherorganisation
- **Produkte**: `/products/{productId}/`
- **Lieferanten**: `/suppliers/{supplierId}/`

## Fehlerbehandlung

### Standard-Fehlercodes
- `400`: Ungültige Parameter
- `404`: Entität nicht gefunden
- `500`: Server-Fehler

### Fehler-Response Format:
```json
{
  "success": false,
  "error": "Error description",
  "details": "Detailed error information"
}
```

## Integration Guidelines

### Authentifizierung
Derzeit ist keine spezielle Authentifizierung für die External Photo API erforderlich. Diese sollte bei produktiver Nutzung implementiert werden.

### Rate Limiting
Aktuell kein Rate Limiting implementiert. Empfehlung: Maximales Request-Intervall von 100ms zwischen Anfragen.

### Caching
Foto-URLs sind langlebig und können client-seitig gecacht werden. Bei Änderungen werden neue URLs mit Timestamps generiert.

## Anwendungsfälle

1. **E-Commerce Integration**: Produktfotos in Online-Shops anzeigen
2. **Mobile Apps**: Produktkataloge mit Lieferanteninformationen
3. **Bestellsysteme**: Visuelle Produktauswahl mit Hersteller-Details
4. **Reporting**: Automatische Berichte mit Produktbildern
5. **B2B-Portale**: Lieferanten-Profile mit Produktkatalogen

## Support und Weiterentwicklung

Diese API wird kontinuierlich erweitert. Geplante Features:
- API-Key Authentifizierung
- Bulk-Download-Funktionen
- Metadaten-Erweiterungen
- Webhook-Benachrichtigungen bei Foto-Updates