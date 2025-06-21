# Inter-App Kommunikation Guide

## Übersicht

Diese Anwendung unterstützt sichere Kommunikation zwischen zwei Replit-Anwendungen:
- **Warenwirtschaftssystem** (diese Anwendung)
- **Service-Plattform** (zweite Anwendung)

## Sicherheitsfeatures

### Authentifizierung
- **HMAC-SHA256 Signaturen**: Jede Anfrage wird kryptographisch signiert
- **API-Schlüssel Validierung**: Zusätzliche Sicherheitsebene
- **Timestamp-basierter Replay-Schutz**: Verhindert Wiederholungsangriffe (5-Minuten-Fenster)
- **Request-Body Integrität**: Manipulationsschutz für übertragene Daten

### Rate Limiting
- 200 Anfragen pro Minute pro Anwendung
- Automatische Blockierung bei Überschreitung
- Sliding Window Algorithmus

## API-Endpunkte

### Warenwirtschaftssystem (Export)

#### `/api/inter-app/health`
Gesundheitscheck der API
```bash
GET /api/inter-app/health
```

#### `/api/inter-app/suppliers`
Alle aktiven Lieferanten mit Vollständigkeitsstatus
```bash
GET /api/inter-app/suppliers
```

#### `/api/inter-app/suppliers/:id`
Spezifischer Lieferant mit allen Produkten
```bash
GET /api/inter-app/suppliers/123
```

#### `/api/inter-app/products`
Alle Produkte mit Pagination und Filterung
```bash
GET /api/inter-app/products?supplier_id=123&limit=50&offset=0
```

#### `/api/inter-app/products/:id`
Spezifisches Produkt mit Lieferanteninformationen
```bash
GET /api/inter-app/products/456
```

#### `/api/inter-app/warehouses`
Alle Lager mit Inventar-Statistiken
```bash
GET /api/inter-app/warehouses
```

#### `/api/inter-app/data-completeness`
Vollständigkeitsanalyse der Daten
```bash
GET /api/inter-app/data-completeness
```

## Verwendung

### 1. Umgebungsvariablen einrichten

In beiden Anwendungen die gleichen Geheimnisse hinterlegen:

```bash
INTER_APP_SECRET=ihr-starker-geheimer-schluessel-hier
API_SECRET_KEY=ihr-api-schluessel-hier
```

### 2. Inter-App Client verwenden

```typescript
import { createInterAppClient } from '../utils/inter-app-client';

// Client erstellen
const client = createInterAppClient(
  'https://ihre-service-plattform.replit.app',
  'mein-app-name'
);

// Lieferanten abrufen
try {
  const suppliers = await client.getSuppliers();
  console.log(`${suppliers.length} Lieferanten erhalten`);
} catch (error) {
  console.error('Fehler:', error.message);
}

// Produkte mit Filterung abrufen
const { data: products, pagination } = await client.getProducts({
  supplierId: 123,
  limit: 50
});

// Verbindung testen
const testResult = await client.testConnection();
console.log('Verbindung funktioniert:', testResult.success);
```

### 3. Frontend Integration

Besuchen Sie `/inter-app-verbindungen` für eine grafische Benutzeroberfläche zur:
- Konfiguration der Verbindung
- Testen der API-Endpunkte
- Analyse der Datenvollständigkeit
- Überwachung der Sicherheitsfeatures

## Datenstruktur

### Lieferant
```typescript
{
  id: number,
  name: string,
  contactPerson: string,
  phone: string,
  email: string,
  website: string,
  address: string,
  city: string,
  postalCode: string,
  country: string,
  status: string,
  notes: string,
  productCount: number,
  completeness: {
    hasDescription: boolean,
    hasWebsite: boolean,
    hasCompleteAddress: boolean,
    hasContact: boolean
  }
}
```

### Produkt
```typescript
{
  id: number,
  name: string,
  description: string,
  price: number,
  status: string,
  ean: string,
  supplierId: number,
  supplierName: string,
  supplierEmail: string,
  supplierWebsite: string,
  completeness: {
    hasDescription: boolean,
    hasPrice: boolean,
    hasEan: boolean,
    hasSupplier: boolean
  }
}
```

## Fehlerbehandlung

### Häufige Fehler

#### `MISSING_AUTH_HEADER`
- **Ursache**: Authorization Header fehlt
- **Lösung**: Sicherstellen, dass der Client korrekt konfiguriert ist

#### `INVALID_SIGNATURE`
- **Ursache**: Falsche Signatur oder unterschiedliche Geheimnisse
- **Lösung**: INTER_APP_SECRET in beiden Anwendungen prüfen

#### `TIMESTAMP_EXPIRED`
- **Ursache**: Request älter als 5 Minuten
- **Lösung**: Systemzeit der Anwendungen synchronisieren

#### `RATE_LIMIT_EXCEEDED`
- **Ursache**: Zu viele Anfragen
- **Lösung**: Warten bis zum Reset oder Anfragerate reduzieren

## Überwachung

### Logging
Alle Inter-App Anfragen werden automatisch protokolliert:
```
[INTER-APP-AUTH] Erfolgreiche Authentifizierung von service-platform für GET /api/inter-app/suppliers
[INTER-APP-CLIENT] GET /api/inter-app/suppliers - 200
```

### Metrics
- Request-Anzahl pro Minute
- Erfolgreiche vs. fehlgeschlagene Authentifizierungen
- Durchschnittliche Response-Zeiten
- Fehlertypen und -häufigkeiten

## Deployment

### Produktionsumgebung
1. Starke, eindeutige Geheimnisse generieren
2. HTTPS für alle Verbindungen verwenden
3. Rate Limits je nach Bedarf anpassen
4. Monitoring und Alerting einrichten

### Entwicklung
1. Test-Geheimnisse verwenden
2. Verbindung über lokale URLs testen
3. Debug-Logging aktivieren

## Erweiterung

### Neue Endpunkte hinzufügen
1. Route in `/server/routes/inter-app-api.ts` erstellen
2. Authentifizierung-Middleware verwenden
3. Input-Validierung implementieren
4. Client-Methode in `/server/utils/inter-app-client.ts` hinzufügen

### Zusätzliche Sicherheitsfeatures
- IP-Whitelisting
- Client-Zertifikate
- Erweiterte Rate Limiting Strategien
- Request-Size Limits

## Support

Bei Problemen:
1. Logs der beiden Anwendungen prüfen
2. Health Check ausführen
3. Geheimnisse und URLs validieren
4. Netzwerkverbindung testen

## Best Practices

1. **Geheimnisse**: Regelmäßig rotieren, nie in Code committen
2. **Rate Limiting**: Konservativ starten, bei Bedarf erhöhen
3. **Monitoring**: Kontinuierliche Überwachung der API-Performance
4. **Testing**: Automatisierte Tests für kritische Endpunkte
5. **Documentation**: API-Änderungen dokumentieren