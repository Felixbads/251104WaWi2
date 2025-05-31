# Vendon Events API - Vollständige Import-Pipeline

## Übersicht

Diese Pipeline ermöglicht den automatisierten Import aller Events von der Vendon API in eine PostgreSQL-Datenbank. Das System bietet eine robuste, skalierbare Lösung mit umfassender Fehlerbehandlung und Monitoring.

## Architektur

### 1. Datenbankschema

Die Events werden in der `events` Tabelle gespeichert mit vollständiger Feldabbildung:

**Basis-Identifikatoren:**
- `vendonId`: Eindeutige Event-ID aus der Vendon API
- `id`: Lokale Primärschlüssel-ID

**Event-Informationen:**
- `eventType`, `eventName`, `baseCode`, `originalCode`
- `description`, `name`
- `category`, `severity`, `priority`

**Maschinen-Bezug:**
- `machineId`: Referenz zur lokalen machines-Tabelle
- `machineName`, `vendonMachineId`

**Zeitstempel:**
- `eventDatetime`: Zeitpunkt des Events
- `receivedAt`: Wann wurde das Event empfangen
- `resolvedAt`: Wann wurde das Event gelöst
- `datetime`: Haupt-Zeitstempel

**Status und Zustand:**
- `state`: Event-Status (resolved, info, active, unknown)
- `active`: Ist das Event aktiv (Y/N)
- `ignored`: Ist das Event ignoriert
- `duration`: Dauer des Events in Sekunden

**Standort und Client:**
- `locationId`, `locationName`, `locationType`
- `clientId`, `clientName`
- `warehouseId`, `warehouseName`

**Technische Details:**
- `telemetryUnitId`, `sensorData`
- `eventTags`, `machineTags`: JSON-Arrays
- `rawApiData`: Vollständige API-Antwort als JSON

### 2. API-Struktur

**Vendon Events API Endpunkt:**
```
GET /rest/v1.8.0/event/
```

**Unterstützte Parameter:**
- `from_timestamp`, `to_timestamp`: Zeitraum-Filter
- `timeframe_filter_type`: received_at oder resolved_at
- `machine_id`, `warehouse_id`, `location_id`: ID-Filter
- `state`: Event-Status Filter
- `ignored`: Ignorierte Events (exclude/include/only)
- `min_duration`, `max_duration`: Dauer-Filter
- `machine_tags`, `event_tags`: Tag-Filter
- `offset`, `limit`: Paginierung (max 100 pro Request)
- `sort`: Sortierung

## Verwendung

### 1. Kommandozeilen-Import

**Basis-Import:**
```bash
node import_vendon_events.js
```

**Mit Optionen:**
```bash
# Letzte 30 Tage importieren
node import_vendon_events.js --from-days=30

# Nur Events einer bestimmten Maschine
node import_vendon_events.js --machine-id=123

# Nur gelöste Events
node import_vendon_events.js --state=resolved

# Mit benutzerdefinierten Batch-Größen
node import_vendon_events.js --batch-size=50 --max-events=5000

# Bestehende Events aktualisieren
node import_vendon_events.js --force-update
```

**Alle verfügbaren Optionen:**
```
Zeitraum-Optionen:
  --from-days=N          Events der letzten N Tage importieren (Standard: 7)
  --to-days=N            Bis vor N Tagen importieren (Standard: 0 = heute)
  --from-timestamp=TS    Start-Zeitstempel (Unix-Timestamp)
  --to-timestamp=TS      End-Zeitstempel (Unix-Timestamp)
  --timeframe-filter-type=TYPE  Filter-Typ: received_at oder resolved_at

Filter-Optionen:
  --machine-id=ID        Nur Events für bestimmte Maschine
  --warehouse-id=ID      Nur Events für bestimmtes Lager
  --location-id=ID       Nur Events für bestimmten Standort
  --client-id=ID         Nur Events für bestimmten Client
  --location-type=TYPE   Nur Events für bestimmten Standort-Typ
  --state=STATUS         Event-Status: resolved,active,info,unknown
  --ignored=MODE         Ignorierte Events: exclude,include,only
  --min-duration=SEC     Minimale Event-Dauer in Sekunden
  --max-duration=SEC     Maximale Event-Dauer in Sekunden
  --machine-tags=TAGS    Maschinen-Tags (kommagetrennt)
  --event-tags=TAGS      Event-Tags (kommagetrennt)

Import-Optionen:
  --batch-size=N         Events pro API-Request (Standard: 100, Max: 100)
  --max-events=N         Maximale Anzahl Events zu importieren (Standard: 10000)
  --force-update         Bestehende Events aktualisieren
```

### 2. Programmatische Verwendung

```javascript
import { VendonEventsSync } from './server/services/vendonEventsSync';

const sync = new VendonEventsSync(apiKey);

const result = await sync.syncEvents({
  fromTimestamp: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60), // 7 Tage zurück
  toTimestamp: Math.floor(Date.now() / 1000),
  state: ['active', 'resolved'],
  batchSize: 100,
  maxEvents: 10000,
  forceUpdate: false
});

console.log('Import-Ergebnis:', result);
```

### 3. API-Endpunkte

**Events abrufen:**
```
GET /api/events?page=1&limit=50&search=fehler&state=active
```

**Event-Statistiken:**
```
GET /api/events/stats/overview
```

**Events importieren:**
```
POST /api/events/import
Content-Type: application/json

{
  "fromTimestamp": 1640995200,
  "toTimestamp": 1641081600,
  "state": ["active", "resolved"],
  "batchSize": 100,
  "forceUpdate": false
}
```

**Sync-Logs abrufen:**
```
GET /api/events/sync/logs?page=1&limit=20
```

## Konfiguration

### Umgebungsvariablen

**Erforderlich:**
```bash
VENDON_API_KEY=ihr_vendon_api_schlüssel
DATABASE_URL=postgresql://user:password@host:port/database
```

**Optional:**
```bash
VENDON_API_BASE=https://cloud.vendon.net/rest/v1.8.0
```

### API-Schlüssel einrichten

1. Melden Sie sich bei Ihrem Vendon-Account an
2. Navigieren Sie zu den API-Einstellungen
3. Erstellen Sie einen neuen API-Schlüssel mit Event-Berechtigung
4. Setzen Sie die Umgebungsvariable:
   ```bash
   export VENDON_API_KEY="ihr_api_schlüssel_hier"
   ```

## Funktionen

### 1. Robuste Synchronisation
- **Paginierung**: Automatische Aufteilung großer Datenmengen
- **Fehlerbehandlung**: Retry-Mechanismus mit exponential backoff
- **Duplikaterkennung**: Vermeidung von Doppelimporten
- **Fortschrittsverfolgung**: Detaillierte Logs und Metriken

### 2. Vollständige Feldabbildung
- **Alle API-Felder**: Komplette Abbildung der Vendon Events API
- **Normalisierte Struktur**: Optimiert für relationale Datenbank
- **JSON-Speicherung**: Rohdaten für Debugging und Erweiterungen
- **Referenz-Integrität**: Verknüpfung mit Maschinen und Standorten

### 3. Flexibles Filtering
- **Zeitraum-Filter**: Von/bis Zeitstempel
- **Status-Filter**: Nach Event-Status
- **Maschinen-Filter**: Spezifische Maschinen oder Standorte
- **Dauer-Filter**: Nach Event-Dauer
- **Tag-Filter**: Nach Maschinen- oder Event-Tags

### 4. Monitoring und Logging
- **Sync-Logs**: Vollständige Protokollierung aller Imports
- **Statistiken**: Event-Übersichten und Trends
- **Fehler-Tracking**: Detaillierte Fehlermeldungen
- **Performance-Metriken**: Import-Geschwindigkeit und -Effizienz

## Datenqualität

### Duplikaterkennung
- Eindeutige Indizes auf `vendonId`
- Optionale Aktualisierung bestehender Events
- Konfliktauflösung basierend auf Zeitstempel

### Datenvalidierung
- Zeitstempel-Konvertierung und -Validierung
- JSON-Struktur-Validierung für Tags und Zusatzdaten
- Referenz-Prüfung für Maschinen und Standorte

### Fehlerbehandlung
- API-Timeout-Management
- Netzwerk-Fehler-Retry
- Datenbank-Transaktions-Sicherheit
- Graceful degradation bei partiellen Fehlern

## Performance

### Optimierungen
- **Batch-Processing**: Gruppierte API-Requests
- **Database-Indizes**: Optimierte Abfragen
- **Memory-Management**: Streaming für große Datenmengen
- **Rate-Limiting**: API-schonende Request-Verteilung

### Skalierung
- **Horizontale Skalierung**: Parallel-Import möglich
- **Archivierung**: Alte Events automatisch archivieren
- **Partitionierung**: Datenbank-Partitioning nach Datum
- **Caching**: Redis-Cache für häufige Abfragen

## Maintenance

### Regelmäßige Aufgaben
```bash
# Täglicher Import der letzten 24 Stunden
0 2 * * * cd /pfad/zum/projekt && node import_vendon_events.js --from-days=1

# Wöchentliche vollständige Synchronisation
0 3 * * 0 cd /pfad/zum/projekt && node import_vendon_events.js --from-days=7 --force-update

# Monatliche Archivierung alter Events
0 4 1 * * cd /pfad/zum/projekt && node archive_old_events.js --older-than=90
```

### Backup und Recovery
- Regelmäßige Datenbank-Backups
- Export-/Import-Funktionen für Events
- Disaster-Recovery-Procedures
- Data-Retention-Policies

## Troubleshooting

### Häufige Probleme

**API-Schlüssel-Fehler:**
```
❌ Fehler: VENDON_API_KEY Umgebungsvariable ist nicht gesetzt
```
→ Setzen Sie die Umgebungsvariable mit einem gültigen API-Schlüssel

**Netzwerk-Timeout:**
```
❌ API Request fehlgeschlagen: Status 408
```
→ Reduzieren Sie die Batch-Größe oder erhöhen Sie das Timeout

**Datenbank-Verbindungsfehler:**
```
❌ Datenbankverbindung fehlgeschlagen
```
→ Prüfen Sie die DATABASE_URL und Netzwerkverbindung

**Rate-Limiting:**
```
❌ API Request fehlgeschlagen: Status 429
```
→ Vergrößern Sie die Pause zwischen Requests

### Debug-Modus
```bash
DEBUG=vendon-events node import_vendon_events.js --batch-size=10
```

### Log-Analyse
```sql
-- Aktuelle Sync-Status prüfen
SELECT * FROM sync_logs 
WHERE sync_type = 'vendon_events' 
ORDER BY start_date DESC 
LIMIT 10;

-- Event-Statistiken abrufen
SELECT state, COUNT(*) as count 
FROM events 
GROUP BY state;

-- Fehlerhafte Events finden
SELECT * FROM events 
WHERE processing_status = 'error' 
ORDER BY created_at DESC;
```

## Erweiterungen

### Geplante Features
- **Real-time Synchronisation**: WebSocket-basierte Updates
- **Event-Notifications**: E-Mail/SMS bei kritischen Events
- **Custom-Dashboards**: Grafische Event-Übersichten
- **Machine-Learning**: Predictive Analytics für Events
- **Multi-Tenant**: Support für mehrere Vendon-Accounts

### API-Erweiterungen
- **Bulk-Operations**: Massenbearbeitung von Events
- **Event-Workflows**: Automatisierte Aktionen basierend auf Events
- **Integration-APIs**: Verbindung zu externen Systemen
- **Custom-Fields**: Benutzerdefinierte Event-Attribute

## Support

Bei Problemen oder Fragen:
1. Prüfen Sie die Logs in der Datenbank
2. Aktivieren Sie den Debug-Modus
3. Kontaktieren Sie den System-Administrator
4. Dokumentieren Sie Fehler für zukünftige Verbesserungen

---

**Version:** 1.0.0  
**Letzte Aktualisierung:** 31. Mai 2025  
**Kompatibilität:** Vendon API v1.8.0, PostgreSQL 12+, Node.js 18+