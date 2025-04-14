# Vendon Produktbereinigung

Dieses Dokument beschreibt das Vendon-Bereinigungsskript, das entwickelt wurde, um Produktduplikate zu identifizieren und zu bereinigen.

## Problemstellung

Während der Synchronisierung mit dem Vendon-System wurden duplizierte Produkteinträge in der Datenbank erzeugt. Das führte zu:

- Übermäßig vielen Produkten (über 6.500 statt der erwarteten ca. 120)
- Schwierigkeiten bei der Verwaltung und Berichterstattung
- Unübersichtlichkeit in der Benutzeroberfläche

## Lösungsansatz

Die Lösung besteht aus zwei Teilen:

1. **Verbesserung der syncProducts-Funktion** in `server/services/vendonSync.ts`, um neue Duplikate zu verhindern
2. **Bereinigungsskript** (`scripts/vendon_cleanup.ts`), um bestehende Duplikate zu konsolidieren

## Bereinigungsskript

Das Skript `vendon_cleanup.ts` führt folgende Aktionen durch:

1. **Identifizierung von Duplikaten** basierend auf normalisierten Produktnamen
2. **Konsolidierung der Referenzen** in abhängigen Tabellen:
   - `machine_stocks` (Lagerbestände)
   - `inventory_count_items` (Inventur-Elemente)
   - `inventory_items` (Lagerbestandselemente)
3. **Entfernung von Duplikaten** unter Beibehaltung eines Hauptprodukts pro Gruppe
4. **Bereinigung von Lagerbestandsduplikaten** für bessere Datenintegrität

## Ausführung

Führen Sie das Skript mit dem folgenden Befehl aus:

```
npx tsx scripts/vendon_cleanup.ts
```

## Ergebnisse

Das Skript gibt eine detaillierte Zusammenfassung aus, die die Anzahl der:
- Ursprünglichen Produkte
- Bereinigten Duplikate
- Verbleibenden Produkte
- Aktualisierten Referenzen
- Konsolidierten Lagerbestände

## Verbesserungen des syncProducts-Prozesses

In der Datei `server/services/vendonSync.ts` wurden folgende Verbesserungen vorgenommen:

1. **Normalisierte Produktnamenprüfung** zum Erkennen von Duplikaten
2. **Intelligente Produktabgleichslogik**, die:
   - Produkte nach Vendon-ID erkennt
   - Produkte mit gleichem Namen aber verschiedenen IDs konsolidiert
   - Duplizierte Produkteinträge verhindert

## Hinweise für die Zukunft

- Das Skript kann bei Bedarf wiederholt ausgeführt werden
- Die verbesserte `syncProducts`-Funktion sollte neue Duplikate verhindern
- Bei Änderungen an der Datenbankstruktur muss das Skript angepasst werden

## Technische Details

Das Skript berücksichtigt Foreign-Key-Constraints und aktualisiert alle notwendigen Referenzen, bevor es Duplikate entfernt. Dies stellt die Datenbankintegrität sicher.