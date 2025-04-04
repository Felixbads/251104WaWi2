# Excel Import System für Vendon-Transaktionen

Dieses Dokumentation beschreibt die Implementierung des Excel-Import-Systems für Vendon-Transaktionsdaten und wie es zu verwenden ist.

## Überblick

Das System bietet eine flexible Lösung zum Import historischer Transaktionsdaten aus Excel-Dateien, die direkt von Vendon exportiert wurden. Es kann sowohl kleine als auch sehr große Excel-Dateien verarbeiten und bietet eine robuste Fehlerbehandlung und Statusverfolgung.

## Hintergrund

Vendon's API hat Einschränkungen beim Abrufen historischer Daten. Das System ermöglicht es, exportierte Excel-Dateien mit Transaktionsdaten in das System zu importieren. Die größte Herausforderung besteht darin, sehr große Excel-Dateien (z.B. 18 MB) im begrenzten Replit-Umgebung zu verarbeiten.

## Verfügbare Skripte

### 1. direct_excel_import.cjs

Ein einfaches Skript zum Import kleiner Excel-Dateien in einem einzigen Durchlauf.

Funktionen:
- Lädt die gesamte Excel-Datei in den Speicher
- Konvertiert alle Daten auf einmal
- Importiert direkt in die Datenbank
- Prüft auf Duplikate und überspringt diese

Verwendung:
```
node direct_excel_import.cjs
```

### 2. incremental_excel_import.cjs

Ein fortschrittliches Skript zum inkrementellen Import großer Excel-Dateien über mehrere Durchläufe.

Funktionen:
- Speicheroptimierte Verarbeitung
- Inkrementeller Import in konfigurierbaren Chunks
- Fortschrittsspeicherung zwischen Durchläufen
- Robuste Fehlerbehandlung
- Zeitlimitierung pro Durchlauf

Verwendung:
```
node incremental_excel_import.cjs
```

### 3. run_excel_import.cjs

Ein Wrapper-Skript, das das entsprechende Importskript basierend auf der Dateiauswahl ausführt und automatisch mehrere Durchläufe für große Dateien startet.

Verwendung:
```
# Für kleine Excel-Dateien (1.xlsx)
node run_excel_import.cjs 1

# Für große Excel-Dateien (Report...)
node run_excel_import.cjs 2
```

## Architektur

Das System verwendet einen dreistufigen Prozess:

1. **Einlesen der Excel-Datei**: Die Datei wird Zeile für Zeile oder in Chunks eingelesen, um Speicherprobleme zu vermeiden.
2. **Konvertierung**: Die Daten werden in das Vendon-Transaktionsformat konvertiert.
3. **Import**: Die konvertierten Daten werden direkt in die Datenbank importiert unter Verwendung einer Transaktion für Datenintegrität.

## Konfiguration

Jedes Skript enthält einen Konfigurationsbereich, in dem wichtige Parameter angepasst werden können:

- **inputExcelFile**: Pfad zur Excel-Datei
- **chunkSize**: Anzahl der Zeilen pro Chunk
- **maxChunksPerRun**: Maximale Anzahl von Chunks pro Durchlauf
- **maxProcessingTime**: Maximale Verarbeitungszeit pro Durchlauf
- **machineMapping**: Mapping von Telemetrieeinheiten-IDs zu Maschinen-IDs

## Statusverfolgung

Für große Excel-Dateien speichert das System den Fortschritt in einer JSON-Datei (excel_import_status.json), die folgende Informationen enthält:

- Aktuelle Startzeile für den nächsten Durchlauf
- Anzahl der verarbeiteten Zeilen
- Import-Zähler (importiert, übersprungen)
- Status (abgeschlossen, fehlgeschlagen)
- Gesamtstatistiken

## Fehlerbehandlung

Das System bietet mehrere Mechanismen zur Fehlerbehandlung:

- **Datenbankfehler**: Transaktionen werden zurückgerollt, wenn ein Fehler auftritt
- **Zeitüberschreitung**: Bei Zeitüberschreitung wird der aktuelle Fortschritt gespeichert und ein Exit-Code 10 zurückgegeben, damit das Wrapper-Skript den Prozess automatisch fortsetzen kann
- **Duplizierungsprüfung**: Duplikate werden anhand der Vendon-ID oder einer Kombination aus Zeit, Maschinen-ID, Produktname und Preis erkannt und übersprungen

## Empfohlene Nutzung

1. **Für kleine Dateien** (weniger als 5 MB):
   ```
   node run_excel_import.cjs 1
   ```

2. **Für große Dateien** (mehr als 5 MB):
   ```
   node run_excel_import.cjs 2
   ```

3. **Manuelle Fortsetzung** (falls der automatische Prozess unterbrochen wurde):
   ```
   node incremental_excel_import.cjs
   ```

## Logging

Alle Skripte generieren ausführliche Logs, die in Dateien gespeichert werden:
- excel_import.log: Für kleine Dateien
- excel_import_full.log: Für große Dateien

## Bekannte Einschränkungen

- Die Replit-Umgebung hat begrenzte Verarbeitungszeit. Sehr große Dateien benötigen mehrere Durchläufe.
- Sehr große Excel-Dateien können beim ersten Öffnen zu Timeouts führen.
- Für Dateien über 20 MB wird empfohlen, die Datei lokal in kleinere Teile zu splitten, bevor sie importiert wird.