
# Enhanced API-Dokumentation für externe Anwendungen

## Übersicht

Diese erweiterte API-Dokumentation beschreibt die vollständigen Datenübertragungsendpunkte für Produkt- und Lieferanteninformationen der Wawi-Proviantomat-Anwendung mit allen verfügbaren Feldern und den neuesten Datenpunkten.

## Base URL
```
https://[ihre-wawi-replit-domain]/api
```

---

## 🔓 Öffentliche API-Endpunkte (ohne Authentifizierung)

### 1. Health Check
**GET** `/inter-app/health`

Überprüft die API-Verfügbarkeit und Systemstatus.

```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "version": "3.0.0",
  "features": {
    "photoUpload": true,
    "hmacAuth": true,
    "rateLimit": true,
    "dataCompleteness": true
  }
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
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/logo_large_1751290000000.webp",
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/warehouse_medium_1751290000000.webp",
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/team_large_1751290000000.webp"
      ],
      "paymentTerms": "14 Tage netto, 2% Skonto bei Zahlung innerhalb 7 Tagen",
      "deliveryTerms": "Frei Haus ab 100€ Bestellwert, sonst 15€ Versandkosten",
      "minimumOrderValue": 100.00,
      "deliveryDays": "[\"montag\", \"mittwoch\", \"freitag\"]",
      "productCount": 125,
      "averageOrderValue": 285.50,
      "lastOrderDate": "2025-01-14T10:30:00.000Z",
      "totalRevenue": 45650.75,
      "rating": 4.8,
      "certifications": ["Bio", "Fairtrade", "Regional"],
      "businessHours": {
        "monday": "08:00-17:00",
        "tuesday": "08:00-17:00",
        "wednesday": "08:00-17:00",
        "thursday": "08:00-17:00",
        "friday": "08:00-16:00",
        "saturday": "closed",
        "sunday": "closed"
      },
      "bankDetails": {
        "accountHolder": "Getränke Schmidt GmbH",
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "bank": "Commerzbank Dresden"
      },
      "taxNumber": "DE123456789",
      "vatId": "DE123456789",
      "completeness": {
        "hasDescription": true,
        "hasWebsite": true,
        "hasCompleteAddress": true,
        "hasContact": true,
        "hasPhotos": true,
        "hasPaymentTerms": true,
        "hasBusinessHours": true,
        "hasBankDetails": true,
        "score": 95
      },
      "metrics": {
        "reliabilityScore": 4.8,
        "deliveryTimeAverage": 2.3,
        "qualityRating": 4.9,
        "priceCompetitiveness": 4.2
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

Liefert einen spezifischen Lieferanten mit allen zugehörigen Produkten und erweiterten Statistiken.

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
    "photos": [
      "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/logo_large_1751290000000.webp",
      "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/warehouse_medium_1751290000000.webp"
    ],
    "paymentTerms": "14 Tage netto, 2% Skonto bei Zahlung innerhalb 7 Tagen",
    "deliveryTerms": "Frei Haus ab 100€ Bestellwert",
    "minimumOrderValue": 100.00,
    "deliveryDays": "[\"montag\", \"mittwoch\", \"freitag\"]",
    "businessHours": {
      "monday": "08:00-17:00",
      "tuesday": "08:00-17:00",
      "wednesday": "08:00-17:00",
      "thursday": "08:00-17:00",
      "friday": "08:00-16:00",
      "saturday": "closed",
      "sunday": "closed"
    },
    "bankDetails": {
      "accountHolder": "Getränke Schmidt GmbH",
      "iban": "DE89370400440532013000",
      "bic": "COBADEFFXXX",
      "bank": "Commerzbank Dresden"
    },
    "certifications": ["Bio", "Fairtrade", "Regional"],
    "taxNumber": "DE123456789",
    "vatId": "DE123456789",
    "analytics": {
      "totalOrders": 156,
      "totalRevenue": 45650.75,
      "averageOrderValue": 285.50,
      "lastOrderDate": "2025-01-14T10:30:00.000Z",
      "topProducts": [
        {
          "id": 1,
          "name": "Oppacher Classic PET 0,5l",
          "totalSold": 2450,
          "revenue": 6125.00
        }
      ],
      "monthlyStats": [
        {
          "month": "2025-01",
          "orders": 12,
          "revenue": 3420.50,
          "averageOrderValue": 285.04
        }
      ]
    },
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
        "photos": [
          "https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/1/photo_large_1751290000000.webp"
        ],
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
        "dimensions": {
          "length": 240,
          "width": 160,
          "height": 285,
          "weight": 6500
        },
        "sustainability": {
          "recyclable": true,
          "organicCertified": false,
          "localProduction": true,
          "carbonFootprint": "low"
        },
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "productCount": 125,
    "warehouseLocations": [
      {
        "warehouseId": 1,
        "name": "Hauptlager Dresden",
        "productCount": 85,
        "lastDelivery": "2025-01-14T10:30:00.000Z"
      }
    ]
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
- `category` (optional): Filtert nach Kategorie
- `status` (optional): Filtert nach Status (active, inactive, discontinued)
- `has_photos` (optional): Filtert Produkte mit Fotos (true/false)
- `min_price` (optional): Mindestpreis
- `max_price` (optional): Höchstpreis
- `limit` (optional): Anzahl Ergebnisse (Standard: 100, Max: 500)
- `offset` (optional): Offset für Pagination (Standard: 0)
- `sort` (optional): Sortierung (name, price, category, created_at)
- `order` (optional): Reihenfolge (asc, desc)

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
      "originalPrice": 2.80,
      "discountPercentage": 10.7,
      "category": "Getränke",
      "subcategory": "Mineralwasser",
      "description": "Oppacher Classic ist ein natürliches Mineralwasser aus der Oberlausitz mit ausgewogenem Mineralstoffgehalt. Besonders geeignet für den täglichen Genuss und als Durstlöscher. Das Wasser stammt aus einer geschützten Quelle in der sächsischen Oberlausitz.",
      "shortDescription": "Natürliches Mineralwasser aus der Oberlausitz",
      "ingredients": "Natürliches Mineralwasser",
      "allergens": "Keine Allergene. Glutenfrei.",
      "nutritionalInfo": "{\"energy\": \"0kJ/0kcal\", \"fat\": \"0g\", \"carbohydrates\": \"0g\", \"sugar\": \"0g\", \"protein\": \"0g\", \"salt\": \"0.006g\", \"minerals\": {\"calcium\": \"91mg/l\", \"magnesium\": \"13mg/l\", \"sodium\": \"6mg/l\", \"chloride\": \"8mg/l\", \"sulfate\": \"140mg/l\"}}",
      "photos": [
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/1/photo_large_1751290000000.webp",
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/1/label_medium_1751290000000.webp",
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/1/nutritional_medium_1751290000000.webp"
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
      "maxOrderQuantity": 1000,
      "vat": 19.0,
      "depositPrice": 0.25,
      "depositVat": 19.0,
      "productType": "PRODUCT",
      "dimensions": {
        "length": 240,
        "width": 160,
        "height": 285,
        "weight": 6500,
        "volume": 500
      },
      "sustainability": {
        "recyclable": true,
        "organicCertified": false,
        "localProduction": true,
        "carbonFootprint": "low",
        "sustainabilityScore": 8.5,
        "ecoLabel": "Blauer Engel"
      },
      "certifications": ["DIN EN ISO 9001", "HACCP"],
      "originCountry": "Deutschland",
      "brandOwner": "Oppacher Mineralquellen GmbH",
      "manufacturer": {
        "name": "Oppacher Mineralquellen GmbH",
        "address": "Quellenstraße 1, 02692 Obergurig",
        "country": "Deutschland"
      },
      "storageConditions": {
        "temperature": "10-25°C",
        "humidity": "max. 75%",
        "lightProtection": false,
        "specialInstructions": "Kühl und trocken lagern"
      },
      "salesData": {
        "totalSold": 2450,
        "totalRevenue": 6125.00,
        "averageMonthlySales": 204,
        "lastSaleDate": "2025-01-15T09:30:00.000Z",
        "popularityRank": 3,
        "seasonalTrend": "stable"
      },
      "inventoryData": {
        "totalStock": 1248,
        "availableStock": 1156,
        "reservedStock": 92,
        "lowStockThreshold": 100,
        "isLowStock": false,
        "reorderPoint": 50,
        "economicOrderQuantity": 240
      },
      "pricing": {
        "costPrice": 1.85,
        "marginPercentage": 35.1,
        "competitorPriceAverage": 2.75,
        "recommendedRetailPrice": 2.99,
        "priceHistory": [
          {
            "date": "2025-01-01",
            "price": 2.80
          },
          {
            "date": "2025-01-10",
            "price": 2.50
          }
        ]
      },
      "quality": {
        "rating": 4.8,
        "reviewCount": 156,
        "qualityScore": 9.2,
        "returnRate": 0.2,
        "complaintRate": 0.1
      },
      "supplier": {
        "id": 1,
        "name": "Getränke Schmidt GmbH",
        "email": "info@getraenke-schmidt.de",
        "website": "https://www.getraenke-schmidt.de",
        "address": "Industriestraße 123",
        "city": "Dresden",
        "postalCode": "01067",
        "shortDescription": "Traditioneller Getränkegroßhandel seit 1950",
        "photos": [
          "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/logo_medium_1751290000000.webp"
        ],
        "reliabilityScore": 4.8,
        "deliveryTimeAverage": 2.3
      },
      "completeness": {
        "hasDescription": true,
        "hasPrice": true,
        "hasBarcode": true,
        "hasSupplier": true,
        "hasIngredients": true,
        "hasAllergens": true,
        "hasNutritionalInfo": true,
        "hasPhotos": true,
        "hasDimensions": true,
        "hasSustainabilityInfo": true,
        "hasInventoryData": true,
        "score": 98
      },
      "tags": ["mineralwasser", "regional", "glutenfrei", "kalorienarm"],
      "relatedProducts": [2, 3, 4],
      "crossSellProducts": [15, 23, 45],
      "seasonality": {
        "highSeason": ["juni", "juli", "august"],
        "lowSeason": ["dezember", "januar", "februar"],
        "seasonalityFactor": 1.2
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 542,
    "limit": 100,
    "offset": 0,
    "hasMore": true,
    "currentPage": 1,
    "totalPages": 6
  },
  "filters": {
    "appliedFilters": {
      "category": "Getränke",
      "status": "active"
    },
    "availableFilters": {
      "categories": ["Getränke", "Snacks", "Süßwaren"],
      "suppliers": ["Getränke Schmidt GmbH", "Bio-Hof Müller"],
      "priceRanges": [
        {"min": 0, "max": 1},
        {"min": 1, "max": 3},
        {"min": 3, "max": 5}
      ]
    }
  },
  "aggregations": {
    "averagePrice": 2.85,
    "totalProducts": 542,
    "categoryCounts": {
      "Getränke": 245,
      "Snacks": 156,
      "Süßwaren": 141
    },
    "supplierCounts": {
      "Getränke Schmidt GmbH": 125,
      "Bio-Hof Müller": 89
    }
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 2. Einzelnes Produkt abrufen
**GET** `/inter-app/products/:id`

Liefert ein spezifisches Produkt mit vollständigen Informationen inklusive Lieferantendetails und erweiterten Analytik-Daten.

```json
{
  "success": true,
  "data": {
    "id": 1,
    "vendonId": "12345",
    "productName": "Oppacher Classic PET 0,5l",
    "price": 2.50,
    "originalPrice": 2.80,
    "discountPercentage": 10.7,
    "category": "Getränke",
    "subcategory": "Mineralwasser",
    "description": "Oppacher Classic ist ein natürliches Mineralwasser aus der Oberlausitz...",
    "shortDescription": "Natürliches Mineralwasser aus der Oberlausitz",
    "ingredients": "Natürliches Mineralwasser",
    "allergens": "Keine Allergene. Glutenfrei.",
    "nutritionalInfo": "{\"energy\": \"0kJ/0kcal\", \"minerals\": {...}}",
    "photos": [
      "https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/1/photo_large_1751290000000.webp",
      "https://res.cloudinary.com/dzl0viskw/image/upload/v1/products/1/label_medium_1751290000000.webp"
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
    "maxOrderQuantity": 1000,
    "vat": 19.0,
    "depositPrice": 0.25,
    "depositVat": 19.0,
    "productType": "PRODUCT",
    "dimensions": {
      "length": 240,
      "width": 160,
      "height": 285,
      "weight": 6500,
      "volume": 500
    },
    "sustainability": {
      "recyclable": true,
      "organicCertified": false,
      "localProduction": true,
      "carbonFootprint": "low",
      "sustainabilityScore": 8.5,
      "ecoLabel": "Blauer Engel"
    },
    "certifications": ["DIN EN ISO 9001", "HACCP"],
    "originCountry": "Deutschland",
    "brandOwner": "Oppacher Mineralquellen GmbH",
    "manufacturer": {
      "name": "Oppacher Mineralquellen GmbH",
      "address": "Quellenstraße 1, 02692 Obergurig",
      "country": "Deutschland",
      "website": "https://www.oppacher.de",
      "certifications": ["Bio", "ISO 14001"]
    },
    "storageConditions": {
      "temperature": "10-25°C",
      "humidity": "max. 75%",
      "lightProtection": false,
      "specialInstructions": "Kühl und trocken lagern"
    },
    "analytics": {
      "salesData": {
        "totalSold": 2450,
        "totalRevenue": 6125.00,
        "averageMonthlySales": 204,
        "lastSaleDate": "2025-01-15T09:30:00.000Z",
        "popularityRank": 3,
        "seasonalTrend": "stable",
        "growthRate": 12.5,
        "monthlyTrend": [
          {
            "month": "2024-12",
            "sold": 198,
            "revenue": 495.00
          },
          {
            "month": "2025-01",
            "sold": 223,
            "revenue": 557.50
          }
        ]
      },
      "inventoryData": {
        "totalStock": 1248,
        "availableStock": 1156,
        "reservedStock": 92,
        "lowStockThreshold": 100,
        "isLowStock": false,
        "reorderPoint": 50,
        "economicOrderQuantity": 240,
        "turnoverRate": 8.5,
        "averageLeadTime": 7
      },
      "pricing": {
        "costPrice": 1.85,
        "marginPercentage": 35.1,
        "competitorPriceAverage": 2.75,
        "recommendedRetailPrice": 2.99,
        "priceElasticity": -0.8,
        "priceHistory": [
          {
            "date": "2025-01-01",
            "price": 2.80,
            "reason": "Standardpreis"
          },
          {
            "date": "2025-01-10",
            "price": 2.50,
            "reason": "Sonderaktion"
          }
        ]
      },
      "quality": {
        "rating": 4.8,
        "reviewCount": 156,
        "qualityScore": 9.2,
        "returnRate": 0.2,
        "complaintRate": 0.1,
        "satisfactionScore": 94.5
      }
    },
    "supplier": {
      "id": 1,
      "name": "Getränke Schmidt GmbH",
      "email": "info@getraenke-schmidt.de",
      "website": "https://www.getraenke-schmidt.de",
      "address": "Industriestraße 123",
      "city": "Dresden",
      "postalCode": "01067",
      "shortDescription": "Traditioneller Getränkegroßhandel seit 1950",
      "photos": [
        "https://res.cloudinary.com/dzl0viskw/image/upload/v1/suppliers/1/logo_medium_1751290000000.webp"
      ],
      "reliabilityScore": 4.8,
      "deliveryTimeAverage": 2.3,
      "paymentTerms": "14 Tage netto, 2% Skonto bei Zahlung innerhalb 7 Tagen",
      "minimumOrderValue": 100.00
    },
    "warehouseData": [
      {
        "warehouseId": 1,
        "warehouseName": "Hauptlager Dresden",
        "stock": 856,
        "reserved": 24,
        "available": 832,
        "lastRestocked": "2025-01-12T10:30:00.000Z",
        "location": "A-15-C"
      }
    ],
    "salesChannels": [
      {
        "channel": "Verkaufsautomaten",
        "isActive": true,
        "sales30Days": 156,
        "revenue30Days": 390.00
      },
      {
        "channel": "Online-Shop",
        "isActive": false,
        "sales30Days": 0,
        "revenue30Days": 0.00
      }
    ],
    "forecast": {
      "nextMonth": {
        "predictedSales": 235,
        "confidence": 0.87,
        "factors": ["seasonal", "promotional", "weather"]
      },
      "quarter": {
        "predictedSales": 720,
        "confidence": 0.78
      }
    },
    "completeness": {
      "hasDescription": true,
      "hasPrice": true,
      "hasBarcode": true,
      "hasSupplier": true,
      "hasIngredients": true,
      "hasAllergens": true,
      "hasNutritionalInfo": true,
      "hasPhotos": true,
      "hasDimensions": true,
      "hasSustainabilityInfo": true,
      "hasInventoryData": true,
      "hasAnalytics": true,
      "score": 98
    },
    "tags": ["mineralwasser", "regional", "glutenfrei", "kalorienarm"],
    "relatedProducts": [
      {
        "id": 2,
        "name": "Oppacher Naturell PET 0,5l",
        "relationship": "variant"
      },
      {
        "id": 3,
        "name": "Oppacher Classic PET 1,0l",
        "relationship": "size_variant"
      }
    ],
    "crossSellProducts": [
      {
        "id": 15,
        "name": "Bionade Holunder",
        "reason": "frequently_bought_together"
      }
    ],
    "seasonality": {
      "highSeason": ["juni", "juli", "august"],
      "lowSeason": ["dezember", "januar", "februar"],
      "seasonalityFactor": 1.2,
      "weatherDependency": 0.6
    },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## 📊 Erweiterte Analytik-Endpunkte

### 1. Produktleistung
**GET** `/inter-app/products/:id/analytics`

Detaillierte Leistungsanalyse für ein spezifisches Produkt.

### 2. Lieferantenleistung
**GET** `/inter-app/suppliers/:id/analytics`

Umfassende Leistungsanalyse für einen spezifischen Lieferanten.

### 3. Lagerbestand-Übersicht
**GET** `/inter-app/inventory/overview`

Gesamtübersicht über alle Lagerbestände mit Warnstufen.

### 4. Verkaufstrends
**GET** `/inter-app/analytics/trends`

Analysiert Verkaufstrends über verschiedene Zeiträume.

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
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }

    return response.json();
  }

  // Basis-API-Methoden
  async healthCheck() {
    return this.makeRequest('GET', '/api/inter-app/health');
  }

  async getSuppliers(options = {}) {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
    
    const path = `/api/inter-app/suppliers${params.toString() ? '?' + params.toString() : ''}`;
    const result = await this.makeRequest('GET', path);
    return result.data || [];
  }

  async getSupplier(id) {
    const result = await this.makeRequest('GET', `/api/inter-app/suppliers/${id}`);
    return result.data || null;
  }

  async getProducts(options = {}) {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
    
    const path = `/api/inter-app/products${params.toString() ? '?' + params.toString() : ''}`;
    const result = await this.makeRequest('GET', path);
    return {
      products: result.data || [],
      pagination: result.pagination || {},
      filters: result.filters || {},
      aggregations: result.aggregations || {}
    };
  }

  async getProduct(id) {
    const result = await this.makeRequest('GET', `/api/inter-app/products/${id}`);
    return result.data || null;
  }

  // Erweiterte Analytik-Methoden
  async getProductAnalytics(id, timeframe = '30d') {
    const result = await this.makeRequest('GET', `/api/inter-app/products/${id}/analytics?timeframe=${timeframe}`);
    return result.data || null;
  }

  async getSupplierAnalytics(id, timeframe = '30d') {
    const result = await this.makeRequest('GET', `/api/inter-app/suppliers/${id}/analytics?timeframe=${timeframe}`);
    return result.data || null;
  }

  async getInventoryOverview() {
    const result = await this.makeRequest('GET', '/api/inter-app/inventory/overview');
    return result.data || null;
  }

  async getTrends(timeframe = '90d') {
    const result = await this.makeRequest('GET', `/api/inter-app/analytics/trends?timeframe=${timeframe}`);
    return result.data || null;
  }

  // Suchfunktionen
  async searchProducts(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      ...options
    });
    
    const result = await this.makeRequest('GET', `/api/inter-app/products/search?${params.toString()}`);
    return {
      products: result.data || [],
      pagination: result.pagination || {},
      suggestions: result.suggestions || []
    };
  }

  async searchSuppliers(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      ...options
    });
    
    const result = await this.makeRequest('GET', `/api/inter-app/suppliers/search?${params.toString()}`);
    return {
      suppliers: result.data || [],
      pagination: result.pagination || {}
    };
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

// Verwendungsbeispiele:
const client = new WawiApiClient('https://ihre-wawi-anwendung.replit.app');

// Erweiterte Produktsuche mit Filtern
async function erweiterteSuche() {
  try {
    const { products, pagination, filters, aggregations } = await client.getProducts({
      category: 'Getränke',
      has_photos: true,
      min_price: 1.0,
      max_price: 5.0,
      sort: 'popularity',
      order: 'desc',
      limit: 50
    });

    console.log(`${products.length} Produkte gefunden`);
    console.log('Verfügbare Filter:', filters.availableFilters);
    console.log('Durchschnittspreis:', aggregations.averagePrice);

    // Einzelne Produktdetails mit vollständigen Analytik-Daten
    if (products.length > 0) {
      const detailedProduct = await client.getProduct(products[0].id);
      console.log('Vollständige Produktdetails:', detailedProduct);
      
      // Produktanalytik abrufen
      const analytics = await client.getProductAnalytics(products[0].id, '90d');
      console.log('90-Tage Analytik:', analytics);
    }

  } catch (error) {
    console.error('Fehler:', error.message);
  }
}
```

---

## 🔍 Erweiterte Datenqualität

Jeder Datensatz enthält `completeness`-Informationen mit einem Bewertungssystem:

**Lieferanten:**
- `hasDescription`: Kurzbeschreibung oder Anmerkungen ≥ 30 Zeichen
- `hasWebsite`: Website-URL vorhanden
- `hasCompleteAddress`: Vollständige Adresse (Straße, Stadt, PLZ)
- `hasContact`: Kontaktdaten vorhanden (E-Mail oder Telefon)
- `hasPhotos`: Mindestens ein Foto hochgeladen
- `hasPaymentTerms`: Zahlungsbedingungen definiert
- `hasBusinessHours`: Geschäftszeiten angegeben
- `hasBankDetails`: Bankverbindung hinterlegt
- `score`: Gesamtbewertung 0-100

**Produkte:**
- `hasDescription`: Kurz- oder Detailbeschreibung ≥ 10 Zeichen
- `hasPrice`: Gültiger Preis > 0
- `hasBarcode`: Barcode/EAN-Code vorhanden
- `hasSupplier`: Lieferant zugeordnet
- `hasIngredients`: Inhaltsstoffe angegeben
- `hasAllergens`: Allergene-Informationen vorhanden
- `hasNutritionalInfo`: Nährwertangaben als JSON verfügbar
- `hasPhotos`: Mindestens ein Produktfoto hochgeladen
- `hasDimensions`: Abmessungen und Gewicht angegeben
- `hasSustainabilityInfo`: Nachhaltigkeitsinformationen vorhanden
- `hasInventoryData`: Lagerbestandsdaten verfügbar
- `hasAnalytics`: Verkaufs- und Leistungsdaten vorhanden
- `score`: Gesamtbewertung 0-100

---

## 📊 Verfügbare Datenfelder

### Lieferantenfelder:
- **Grunddaten**: `id`, `name`, `status`, `rating`
- **Kontakt**: `contactPerson`, `phone`, `email`, `website`
- **Adresse**: `address`, `city`, `postalCode`, `country`
- **Beschreibung**: `shortDescription`, `notes`
- **Medien**: `photos` (Array von URLs)
- **Geschäftsbedingungen**: `paymentTerms`, `deliveryTerms`, `minimumOrderValue`, `deliveryDays`
- **Geschäftszeiten**: `businessHours` (JSON-Objekt)
- **Bankdaten**: `bankDetails` (JSON-Objekt)
- **Zertifikate**: `certifications` (Array)
- **Steuer**: `taxNumber`, `vatId`
- **Analytik**: `totalRevenue`, `averageOrderValue`, `lastOrderDate`, `metrics`
- **Metadaten**: `createdAt`, `updatedAt`

### Produktfelder:
- **Grunddaten**: `id`, `vendonId`, `productName`, `price`, `originalPrice`, `discountPercentage`, `category`, `subcategory`, `status`
- **Beschreibungen**: `description`, `shortDescription`
- **Inhalt**: `ingredients`, `allergens`, `nutritionalInfo` (JSON)
- **Medien**: `photos` (Array von URLs)
- **Identifikation**: `sku`, `barcode`
- **Lieferant**: `supplierId`, `supplierName`, `supplierSku`
- **Verpackung**: `packageSize`, `shelfLifeDays`, `minOrderQuantity`, `maxOrderQuantity`
- **Steuer**: `vat`, `depositPrice`, `depositVat`
- **Typ**: `productType`
- **Abmessungen**: `dimensions` (JSON-Objekt)
- **Nachhaltigkeit**: `sustainability` (JSON-Objekt)
- **Zertifikate**: `certifications` (Array)
- **Herkunft**: `originCountry`, `brandOwner`, `manufacturer`
- **Lagerung**: `storageConditions` (JSON-Objekt)
- **Verkaufsdaten**: `salesData` (JSON-Objekt)
- **Bestand**: `inventoryData` (JSON-Objekt)
- **Preise**: `pricing` (JSON-Objekt)
- **Qualität**: `quality` (JSON-Objekt)
- **Tags**: `tags` (Array)
- **Beziehungen**: `relatedProducts`, `crossSellProducts`
- **Saisonalität**: `seasonality` (JSON-Objekt)
- **Metadaten**: `createdAt`, `updatedAt`

---

## 🚀 Schnellstart-Beispiel

```javascript
const client = new WawiApiClient(process.env.WAWI_BASE_URL);

// Vollständige Datenanalyse
async function vollstaendigeAnalyse() {
  try {
    // Systemstatus prüfen
    const health = await client.healthCheck();
    console.log('System:', health.status, '- Features:', health.features);

    // Alle Lieferanten mit erweiterten Daten
    const suppliers = await client.getSuppliers();
    console.log(`${suppliers.length} Lieferanten gefunden`);

    suppliers.forEach(supplier => {
      console.log(`\n${supplier.name}:`);
      console.log(`  Beschreibung: ${supplier.shortDescription}`);
      console.log(`  Vollständigkeit: ${supplier.completeness.score}%`);
      console.log(`  Zuverlässigkeit: ${supplier.metrics?.reliabilityScore || 'N/A'}`);
      console.log(`  Umsatz: €${supplier.totalRevenue || 0}`);
      console.log(`  Produkte: ${supplier.productCount}`);
      console.log(`  Fotos: ${supplier.photos?.length || 0}`);
      if (supplier.certifications?.length > 0) {
        console.log(`  Zertifikate: ${supplier.certifications.join(', ')}`);
      }
    });

    // Top-Produkte mit vollständigen Daten
    const { products, aggregations } = await client.getProducts({ 
      sort: 'popularity', 
      order: 'desc', 
      limit: 10 
    });
    
    console.log(`\nTop ${products.length} Produkte:`);
    console.log(`Durchschnittspreis: €${aggregations.averagePrice}`);

    for (const product of products) {
      console.log(`\n${product.productName}:`);
      console.log(`  Preis: €${product.price}`);
      console.log(`  Kategorie: ${product.category}`);
      console.log(`  Vollständigkeit: ${product.completeness.score}%`);
      console.log(`  Verkäufe (30T): ${product.salesData?.averageMonthlySales || 'N/A'}`);
      console.log(`  Lagerbestand: ${product.inventoryData?.availableStock || 'N/A'}`);
      console.log(`  Nachhaltigkeit: ${product.sustainability?.sustainabilityScore || 'N/A'}/10`);
      
      // Detaillierte Analytik für Top-Produkt
      if (products.indexOf(product) === 0) {
        const analytics = await client.getProductAnalytics(product.id, '90d');
        if (analytics) {
          console.log(`  90-Tage Trend: ${analytics.salesData?.growthRate || 'N/A'}%`);
          console.log(`  Beliebtheit: Rang ${analytics.salesData?.popularityRank || 'N/A'}`);
        }
      }
    }

    // Lagerbestand-Übersicht
    const inventory = await client.getInventoryOverview();
    if (inventory) {
      console.log(`\nLagerbestand-Übersicht:`);
      console.log(`  Niedrige Bestände: ${inventory.lowStockCount || 0}`);
      console.log(`  Kritische Bestände: ${inventory.criticalStockCount || 0}`);
      console.log(`  Gesamtwert: €${inventory.totalValue || 0}`);
    }

  } catch (error) {
    console.error('Fehler bei der Analyse:', error.message);
  }
}

vollstaendigeAnalyse();
```

---

## ⚠️ Fehlerbehandlung

### Häufige Fehler:
- **400 Bad Request**: Ungültige Parameter oder Anfrage
- **401 Unauthorized**: Falsche HMAC-Signatur oder Secrets
- **403 Forbidden**: Keine Berechtigung für diese Ressource
- **404 Not Found**: Ressource existiert nicht
- **422 Unprocessable Entity**: Daten können nicht verarbeitet werden
- **429 Rate Limited**: Zu viele Anfragen (Limit: 200/min)
- **500 Server Error**: Datenbankfehler oder interner Serverfehler
- **503 Service Unavailable**: Wartungsmodus oder Systemüberlastung

### Erweiterte Fehlerbehandlung:
```javascript
async function robustApiCall(apiMethod, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiMethod();
    } catch (error) {
      console.warn(`Versuch ${i + 1} fehlgeschlagen:`, error.message);
      
      if (i === retries - 1) throw error;
      
      // Exponential backoff mit jitter
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Verwendung mit erweiterten Fehlerinformationen
try {
  const result = await robustApiCall(() => client.getProducts());
  console.log('Erfolg:', result);
} catch (error) {
  console.error('Endgültiger Fehler:', {
    message: error.message,
    status: error.status,
    timestamp: new Date().toISOString()
  });
}
```

---

## 📈 Rate Limiting & Performance

### Rate Limits:
- **Basis-Endpunkte**: 200 Anfragen pro Minute pro Anwendung
- **Analytik-Endpunkte**: 50 Anfragen pro Minute
- **Such-Endpunkte**: 100 Anfragen pro Minute
- **Sliding Window**: 60 Sekunden
- **Headers**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Limit`

### Performance-Optimierung:
- **Pagination**: Verwenden Sie `limit` und `offset` für große Datenmengen
- **Caching**: API-Antworten werden 5 Minuten gecacht
- **Kompression**: Alle Antworten werden mit gzip komprimiert
- **CDN**: Fotos werden über Cloudinary CDN ausgeliefert

---

## 🔧 Testing & Debugging

### Basis-Test (ohne Auth):
```bash
curl https://ihre-wawi-anwendung.replit.app/api/inter-app/health
```

### Test mit Authentifizierung:
```javascript
const client = new WawiApiClient('https://ihre-wawi-anwendung.replit.app');

async function testApi() {
  const test = await client.testConnection();
  console.log('API-Test:', test.success ? 'Erfolgreich' : 'Fehlgeschlagen');
  
  if (test.success) {
    console.log('System-Status:', test.status);
  } else {
    console.error('Fehler:', test.error);
  }
}
```

### Debug-Modus:
```javascript
// Debug-Modus aktivieren
const client = new WawiApiClient('https://ihre-wawi-anwendung.replit.app');
client.debug = true; // Aktiviert detailliertes Logging
```

---

## 📞 Support & Wartung

### Bei Problemen:
1. **Health Check** ausführen: `/api/inter-app/health`
2. **Secrets validieren**: INTER_APP_SECRET und API_SECRET_KEY prüfen
3. **Rate Limits prüfen**: Headers auf Überschreitung prüfen
4. **Logs analysieren**: Beide Anwendungen auf Fehlermeldungen prüfen
5. **Netzwerk testen**: Verbindung zwischen Anwendungen prüfen

### Monitoring:
- **System-Metriken**: CPU, Memory, Database Performance
- **API-Metriken**: Response Times, Error Rates, Throughput
- **Business-Metriken**: Data Completeness, Usage Patterns

---

## 🔄 Changelog & Versioning

### Version 3.0.0 (Aktuell)
- ✅ Erweiterte Analytik-Daten für Produkte und Lieferanten
- ✅ Nachhaltigkeit und Qualitäts-Metriken
- ✅ Vollständige Inventar- und Verkaufsdaten
- ✅ Erweiterte Suchfunktionen mit Filtern
- ✅ Verbesserte Fehlerbehandlung und Rate Limiting
- ✅ Umfassende Datenqualitäts-Bewertung

### Version 2.0.0
- ✅ HMAC-Authentifizierung implementiert
- ✅ Basis-Produkt und Lieferantendaten
- ✅ Foto-Upload und Cloudinary-Integration

### Version 1.0.0
- ✅ Grundlegende API-Struktur
- ✅ Health Check Endpunkt

---

**Status:** Produktionsbereit ✅  
**Version:** 3.0.0 (Enhanced mit vollständigen Datenpunkten)  
**Letzte Aktualisierung:** Juli 2025  
**Nächstes Update:** Geplant für August 2025 (Real-time Webhooks)
