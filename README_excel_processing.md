# Excel-Datenimport Prozess

Diese Dokumentation beschreibt den Prozess zur Verarbeitung und Import von großen Excel-Dateien mit Vendon-Transaktionsdaten.

## Problemstellung

Die große Excel-Datei (`Report 2022-04-01 2025-04-05 a18b605bf619a514f7ad636191ecf601.xlsx`) enthält historische Transaktionsdaten, die in die Datenbank importiert werden müssen. Da die Datei sehr groß ist (17.97 MB mit über 19.000 Zeilen), muss sie in kleinere Teile aufgeteilt werden, um Timeouts und Speicherprobleme zu vermeiden.

## Lösungsansatz

Wir haben einen mehrstufigen Prozess entwickelt:

1. **Aufteilen der Excel-Datei**: Die große Excel-Datei wird in kleinere Chunks aufgeteilt.
2. **Konvertierung zu JSON**: Jeder Chunk wird ins Vendon-Transaktionsformat konvertiert und als JSON gespeichert.
3. **Sequentieller Import**: Die JSON-Dateien werden nacheinander in die Datenbank importiert.

## Skripte

### 1. Aufteilen von Excel-Dateien

**`split_excel_file.cjs`**
- Teilt eine kleinere Excel-Datei in mehrere Excel-Chunks auf
- Optimiert für kleinere Dateien
- Verwendet für Testzwecke

**`split_large_excel.cjs`**
- Speziell für die große Excel-Datei optimiert
- Verwendet speichereffiziente Methoden
- Hat Zeitlimits und Verarbeitungsbegrenzungen

### 2. Konvertierung zu JSON

**`convert_excel_to_json.cjs`**
- Konvertiert Excel-Chunks in JSON-Dateien
- Wandelt die Excel-Daten ins Vendon-Transaktionsformat um
- Speichert die Ergebnisse im korrekten API-Format

**`convert_small_excel_to_json.cjs`**
- Vereinfachte Version für kleine Excel-Dateien
- Für Testzwecke

### 3. Import in die Datenbank

**`import_json_files.cjs`**
- Importiert JSON-Dateien sequentiell in die Datenbank
- Verarbeitet eine JSON-Datei nach der anderen
- Wartet zwischen Anfragen, um Überlastung zu vermeiden
- Führt Protokoll über den Importfortschritt

### 4. Kombinierte Verarbeitung

**`split_and_import_excel.cjs`**
- Kombiniert Aufteilen und Import in einem Skript
- Für kleinere Excel-Dateien geeignet

**`import_large_excel_by_chunks.cjs`**
- Speziell für die große Excel-Datei optimiert
- Kombiniert alle Schritte in einem optimierten Prozess
- Hat Sicherheitsfunktionen zur Vermeidung von Timeouts

## Empfohlene Vorgehensweise für große Dateien

1. **Schritt 1**: Konvertiere die große Excel-Datei zu JSON-Chunks
   ```bash
   node convert_excel_to_json.cjs
   ```

2. **Schritt 2**: Importiere die JSON-Dateien sequentiell
   ```bash
   node import_json_files.cjs
   ```

## Optimierung der Parameter

Bei Timeouts oder anderen Problemen können folgende Parameter angepasst werden:

- **chunkSize**: Anzahl der Datensätze pro Chunk (kleinere Werte, z.B. 25-50, für stabileren Import)
- **maxChunks**: Begrenzung der zu verarbeitenden Chunks pro Lauf (ermöglicht stufenweisen Import)
- **maxProcessingTime**: Zeitlimit für die Verarbeitung (verhindert Timeouts)
- **delayBetweenRequests**: Wartezeit zwischen API-Anfragen (verhindert Überlastung)

## Demo-Skript

**`process_excel_demo.cjs`**
- Demonstriert den gesamten Prozess
- Zeigt die erwarteten Ausgaben aller Schritte
- Dient als Leitfaden für manuelle Ausführung

## Logdateien

- **`import_results.log`**: Protokolliert den Fortschritt des JSON-Imports
- **`excel_import.log`**: Bei manchen Skripten: Protokolliert die Excel-Verarbeitung
