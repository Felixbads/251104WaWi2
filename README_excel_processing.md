# Vendon Transaktionsdaten-Import aus Excel

Dieses Dokument beschreibt den Prozess zum Import großer Vendon-Transaktionsdaten aus Excel-Dateien in die Datenbank. Der Import ist speziell für die Replit-Umgebung optimiert und besteht aus mehreren Schritten, um die Verarbeitung von großen Datenmengen zuverlässig zu ermöglichen.

## Hintergrund

Die Vendon-API liefert Transaktionsdaten nur für begrenzte Zeiträume. Für historische Daten stellt Vendon Excel-Exporte zur Verfügung, die importiert werden müssen. Diese Excel-Dateien können sehr groß sein (>18 MB) und stellen eine Herausforderung für die Verarbeitung in der Replit-Umgebung dar.

## Optimierter Importprozess

Der Import erfolgt in zwei Hauptphasen:

1. **Aufteilung der Excel-Datei in JSON-Chunks**
2. **Import der JSON-Chunks in die Datenbank**

Diese Aufteilung ermöglicht einen zuverlässigen Import auch bei großen Datenmengen und Umgebungsbeschränkungen.

## Voraussetzungen

- Excel-Datei im Verzeichnis `attached_assets`
- Postgres-Datenbank mit dem korrekten Schema (Tabelle `transactions`)
- Node.js mit den erforderlichen Paketen (xlsx, pg)

## Skripte

### Aufteilung der Excel-Datei

1. **split_excel_to_json.cjs**  
   Liest die Excel-Datei in Chunks und speichert die Daten als JSON-Dateien.

2. **run_split_excel_to_json.cjs**  
   Wrapper-Skript, das den Aufteilungsprozess steuert und mehrere Durchläufe automatisiert.

### Import der JSON-Chunks

1. **import_json_chunks.cjs**  
   Verarbeitet die JSON-Chunks und importiert die Daten in die Datenbank.

2. **run_import_json_chunks.cjs**  
   Wrapper-Skript, das den Import-Prozess steuert und mehrere Durchläufe automatisiert.

## Anleitung

### Schritt 1: Excel-Datei in JSON-Chunks aufteilen

```bash
node run_split_excel_to_json.cjs
```

Dieser Befehl startet den Prozess zur Aufteilung der Excel-Datei in JSON-Chunks. Die Aufteilung erfolgt inkrementell und kann mehrere Durchläufe erfordern. Der Prozess speichert seinen Status in `excel_split_status.json` und kann jederzeit unterbrochen und später fortgesetzt werden.

### Schritt 2: JSON-Chunks in die Datenbank importieren

```bash
node run_import_json_chunks.cjs
```

Dieser Befehl startet den Prozess zum Import der JSON-Chunks in die Datenbank. Der Import erfolgt inkrementell und kann mehrere Durchläufe erfordern. Der Prozess speichert seinen Status in `json_import_status.json` und kann jederzeit unterbrochen und später fortgesetzt werden.

## Statusüberprüfung

Die Status-Dateien (`excel_split_status.json` und `json_import_status.json`) enthalten Informationen über den Fortschritt des jeweiligen Prozesses. Die Wrapper-Skripte zeigen den aktuellen Status beim Start an.

## Wichtige Hinweise

- **Duplizierte Daten**: Der Import-Prozess erkennt bereits importierte Transaktionen und überspringt sie. Dies verhindert Duplikate in der Datenbank.
- **Transaktionssicherheit**: Jeder Chunk wird als Datenbank-Transaktion verarbeitet, die im Fehlerfall vollständig zurückgerollt wird. Dies gewährleistet die Datenintegrität.
- **Ressourcenoptimierung**: Die Verarbeitung erfolgt in kleinen Chunks mit Pausen zwischen den Durchläufen, um die Ressourcenbeschränkungen der Replit-Umgebung zu berücksichtigen.
- **Zuverlässigkeit**: Der Prozess ist robust gegenüber Unterbrechungen und kann jederzeit fortgesetzt werden.

## Maschinen-Mapping

Das Skript enthält ein Mapping von Telemetrieeinheiten zu internen Maschinen-IDs:

```javascript
const machineMapping = {
  '869951034402721': 52, // Bahnhof Bad Schandau, Nationalparkbahnhof
  '866174040097655': 51, // Pfaffendorf
  '866174040098984': 53  // Rathen
};
```

Dieses Mapping kann bei Bedarf erweitert werden, um weitere Automaten zu unterstützen.

## Fehlerbehebung

- **Prozess hängt**: Die Wrapper-Skripte haben eine maximale Anzahl von Durchläufen. Wenn diese erreicht wird, wird der Prozess beendet. Erhöhen Sie ggf. den Wert von `maxRuns` in den Wrapper-Skripten.
- **Datenbank-Fehler**: Überprüfen Sie die Verbindungseinstellungen und das Datenbankschema. Der Prozess speichert Fehler in den Status-Dateien.
- **Speicherprobleme**: Reduzieren Sie die Werte für `chunkSize` und `maxChunksPerRun` in den Skripten, um den Speicherverbrauch zu verringern.

## Beispiel für einen vollständigen Import

```bash
# 1. Excel-Datei in JSON-Chunks aufteilen
node run_split_excel_to_json.cjs

# 2. JSON-Chunks in die Datenbank importieren
node run_import_json_chunks.cjs
```

Diese zwei Schritte ermöglichen einen zuverlässigen Import auch sehr großer Excel-Dateien.