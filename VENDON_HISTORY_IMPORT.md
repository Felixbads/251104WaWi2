# Vendon Historischer Transaktions-Import

Dieses Dokument beschreibt die Implementierung und Verwendung des Vendon-Historie-Importers, der für den vollständigen Import historischer Vendon-Transaktionen entwickelt wurde.

## Übersicht

Der Vendon-Historie-Importer ist ein robustes Tool zum tagesweisen Import aller historischen Transaktionen aus der Vendon API. Er verwendet einen systematischen Ansatz mit folgenden Kernmerkmalen:

- **Tagesweise Paginierung**: Importiert Transaktionen Tag für Tag von einem konfigurierten Startdatum bis heute
- **Robuste Fehlerbehandlung**: Automatische Wiederholungsversuche bei API-Fehlern, Exponential Backoff
- **Idempotentes Design**: Vermeidet Duplikate durch `vendon_id` als Primärschlüssel
- **Fortschrittsverfolgung**: Speichert den Fortschritt in einer `sync_state`-Tabelle, um bei Unterbrechungen wiederaufnehmen zu können
- **Umfangreiche Logging**: Detaillierte Logs für Fehlersuche und Monitoring
- **Vollständigkeitsprüfungen**: Prüft auf Datenlücken und Datenkonsistenz

## Architektur

Die Implementierung besteht aus mehreren Hauptkomponenten:

1. **VendonHistoryImporter-Klasse** (`server/services/vendonHistoryImporter.ts`)
   - Core-Logik für den tageweisen Import
   - Nutzt die existierende `vendonAPI`-Klasse für API-Anfragen
   - Implementiert effiziente Batch-Verarbeitung und Fehlerbehandlung

2. **Import-Skript** (`import_vendon_history.js`)
   - Kommandozeilen-Interface für den Import-Prozess
   - Konfigurierbare Parameter (Startdatum, Enddatum, Batch-Größe, etc.)
   - Detaillierte Ausgabe des Import-Fortschritts

3. **Vollständigkeitsprüfungs-Skript** (`check_vendon_import_completeness.js`)
   - Validierung der importierten Daten
   - Prüfungen auf Duplikate, Datenlücken und unvollständige Datensätze
   - Statistische Auswertung für Datenqualitätsanalyse

4. **sync_state-Tabelle**
   - Speichert den Cursor-Zustand (Datum und Offset)
   - Ermöglicht Wiederaufnahme des Imports nach Unterbrechungen

## Datenbankschema

### sync_state-Tabelle

```sql
CREATE TABLE IF NOT EXISTS sync_state (
  job_name    TEXT PRIMARY KEY,
  last_date   DATE NOT NULL,
  last_offset INTEGER NOT NULL,
  updated_at  TIMESTAMP DEFAULT now()
);
```

- `job_name`: Name des Import-Jobs (z.B. 'vendon_history_import')
- `last_date`: Letztes verarbeitetes Datum
- `last_offset`: Letzter Offset innerhalb dieses Datums
- `updated_at`: Zeitpunkt der letzten Aktualisierung

## Import-Prozess

Der Import-Prozess läuft in folgenden Schritten ab:

1. **Initialisierung**: Konfiguration laden und Datenbankverbindung herstellen
2. **Fortschritt laden**: Bestehenden Fortschritt aus `sync_state` laden
3. **Tagesschleife**: Für jeden Tag vom Startdatum bis heute:
   a. Wenn Tag < Cursor-Datum: Überspringen
   b. Tagesweiser Import mit offset = (Tag == Cursor-Datum ? Cursor-Offset : 0)
   c. Paging-Loop mit API-Anfragen (limit=100)
   d. Transaktionen speichern mit ON CONFLICT DO NOTHING
   e. Fortschritt in sync_state aktualisieren
   f. Vollständigkeitsprüfungen für den Tag durchführen
4. **Abschluss**: Zusammenfassung der Ergebnisse und Synchronisations-Log erstellen

## Verwendung

### Historischen Import starten

```bash
# Vollständiger Import ab 2015-01-01 bis heute
node import_vendon_history.js

# Import ab einem bestimmten Startdatum
node import_vendon_history.js --start-date=2022-01-01

# Import für einen bestimmten Zeitraum
node import_vendon_history.js --start-date=2022-01-01 --end-date=2022-12-31

# Anpassen der Batch-Größe und Verzögerung zwischen Anfragen
node import_vendon_history.js --batch-size=50 --request-delay=2000
```

### Vollständigkeitsprüfung durchführen

```bash
# Vollständigkeitsprüfung für alle Daten
node check_vendon_import_completeness.js

# Prüfung für einen bestimmten Zeitraum
node check_vendon_import_completeness.js --start-date=2022-01-01 --end-date=2022-12-31

# Detaillierte Informationen anzeigen
node check_vendon_import_completeness.js --details
```

## Wiederholen des Imports für einen bestimmten Zeitraum

Um den Import für einen bestimmten Zeitraum neu zu starten, zunächst den Cursor in der `sync_state`-Tabelle zurücksetzen:

```sql
-- Cursor komplett zurücksetzen (gesamter Import wird neu gestartet)
DELETE FROM sync_state WHERE job_name = 'vendon_history_import';

-- Oder Cursor auf ein bestimmtes Datum setzen
UPDATE sync_state 
SET last_date = '2022-01-01', last_offset = 0 
WHERE job_name = 'vendon_history_import';
```

Dann den Import mit dem gewünschten Startdatum ausführen:

```bash
node import_vendon_history.js --start-date=2022-01-01
```

## Fehlerbehebung

### Häufige Probleme und Lösungen

#### API-Ratenbegrenzung

Wenn die API-Anfragen aufgrund von Ratenbegrenzungen fehlschlagen, versuchen Sie:

```bash
node import_vendon_history.js --request-delay=2000 --retry-delay=10000
```

#### Datenlücken

Wenn nach dem Import Datenlücken festgestellt werden, prüfen Sie:

1. API-Verfügbarkeit für die betreffenden Zeiträume
2. Ob tatsächlich Transaktionen in diesem Zeitraum stattgefunden haben
3. Versuchen Sie einen gezielten Import für den betreffenden Zeitraum:

```bash
node import_vendon_history.js --start-date=2022-03-01 --end-date=2022-03-31
```

#### Unerwartete Fehler

Bei wiederholten Fehlern während des Imports:

1. Prüfen Sie die API-Verfügbarkeit
2. Prüfen Sie die Logs auf spezifische Fehlermeldungen
3. Prüfen Sie das Datenbankschema auf Kompatibilität

## Inkrementeller Import für neue Daten

Nach dem einmaligen vollständigen Import historischer Daten kann ein regelmäßiger inkrementeller Import eingerichtet werden:

```bash
# Import der letzten 7 Tage
node import_vendon_history.js --start-date=$(date -d "7 days ago" +%Y-%m-%d)
```

Dieser Befehl kann in einem täglichen Cron-Job ausgeführt werden, um neue Transaktionen regelmäßig zu importieren.

## Technische Details

### API-Parameter

Der Importer verwendet den `/stats/vends`-Endpunkt der Vendon API mit folgenden Parametern:

- `from_timestamp`: Unix-Timestamp des Tagesbeginns (00:00:00)
- `to_timestamp`: Unix-Timestamp des Tagesendes (23:59:59)
- `limit`: Anzahl der zurückzugebenden Einträge (standardmäßig 100)
- `offset`: Offset für Paginierung
- `search_time`: "vend" (laut API-Dokumentation)

### Fehlerbehandlung

Der Importer implementiert mehrere Ebenen der Fehlerbehandlung:

1. **API-Fehler**: Wiederholungsversuche mit Exponential Backoff
2. **Transaktions-Fehler**: Einzelne fehlerhafte Transaktionen werden protokolliert, ohne den Gesamtprozess zu unterbrechen
3. **Datenbank-Fehler**: Transaktionale Verarbeitung für Atomarität

### Logging

Detaillierte Logs werden während des Imports generiert:

- Import-Start und -Ende für jeden Tag
- Batch-Prozessierung mit Statistiken (gefunden, gespeichert, Duplikate, Fehler)
- Fortschrittsaktualisierungen
- Vollständigkeitsprüfungen
- Fehlerdetails für Debugging

## Zusammenfassung

Der entwickelte Vendon-Historie-Importer bietet eine robuste und zuverlässige Lösung für den vollständigen Import historischer Transaktionen. Durch sein idempotentes Design, die tagesweise Verarbeitung und die integrierten Wiederaufnahmemechanismen ist er in der Lage, auch mit großen Datenmengen und über längere Zeiträume zuverlässig zu arbeiten.