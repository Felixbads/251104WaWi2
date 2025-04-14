# Anleitung zur vollständigen Lagerbestandsbereinigung

Dieses Dokument erläutert das umfassende Bereinigungsskript für Produkte und Lagerbestände.

## Problemstellung

In der aktuellen Datenbank wurden zwei Hauptprobleme identifiziert:

1. **Produktduplikate:** Durch die Vendon-Synchronisierung wurden viele doppelte Produkteinträge erstellt (~6.100 statt ~120).
2. **Lagerbestandsduplikate:** Für ein und dasselbe Produkt existieren in einem Lager mehrere Lagerbestandseinträge.

Diese Situation führt zu:
- Unübersichtlichkeit in der Benutzerschnittstelle
- Falschen Bestandsberechnungen
- Schwierigen Berichterstellungen
- Performance-Problemen

## Lösungsansatz

Das Skript `full_inventory_cleanup.ts` führt eine umfassende Bereinigung in mehreren Schritten durch:

### 1. Identifizierung von Produktduplikaten

- Lädt alle Produkte aus der Datenbank
- Normalisiert die Produktnamen (Kleinbuchstaben, Leerzeichen entfernen)
- Gruppiert Produkte nach normalisiertem Namen
- Identifiziert Gruppen mit mehr als einem Eintrag als Duplikate

### 2. Konsolidierung von Produkten und Referenzen

Für jede Duplikat-Gruppe:

- **Wählt ein Primärprodukt aus:** Bevorzugt werden Produkte mit einer Vendon-ID
- **Aktualisiert Lagerbestandseinträge (inventory_items):**
  - Prüft für jedes Lager, ob Einträge für die Duplikate existieren
  - Konsolidiert die Mengen aller doppelten Einträge auf das Primärprodukt
  - Entfernt die doppelten Lagerbestandseinträge
- **Aktualisiert Inventurzählungseinträge (inventory_count_items):**
  - Findet Einträge, die auf Duplikate verweisen
  - Aktualisiert diese, um auf das Primärprodukt zu verweisen
- **Aktualisiert Automatenbestände (machine_stocks):**
  - Findet Einträge, die auf Duplikate verweisen
  - Aktualisiert diese, um auf das Primärprodukt zu verweisen
- **Entfernt die Produktduplikate:**
  - Nachdem alle Referenzen aktualisiert wurden, werden die doppelten Produkteinträge gelöscht

### 3. Konsolidierung von doppelten Lagerbestandseinträgen

- Identifiziert Lagerbestandseinträge für dasselbe Produkt im selben Lager
- Konsolidiert die Mengen aller Einträge auf einen primären Eintrag
- Entfernt die doppelten Lagerbestandseinträge

## Ausführung

Das Skript wird mit folgendem Befehl ausgeführt:

```bash
npx tsx scripts/full_inventory_cleanup.ts
```

## Ergebnisse

Nach der Ausführung werden folgende Informationen bereitgestellt:

- Ursprüngliche und bereinigte Anzahl von Produkten
- Ursprüngliche und bereinigte Anzahl von Lagerbestandseinträgen
- Anzahl der entfernten Produktduplikate
- Anzahl der aktualisierten Lagerbestandseinträge
- Anzahl der entfernten doppelten Lagerbestandseinträge
- Prozentuale Reduktion
- Gesamtdauer der Bereinigung

## Empfehlungen für die Zukunft

1. **Regelmäßige Überprüfung:**
   - Führen Sie gelegentlich eine Zählung der Produkte durch, um sicherzustellen, dass keine neuen Duplikate entstehen
   - Bei ungewöhnlich hoher Anzahl von Produkten kann das Bereinigungsskript erneut ausgeführt werden

2. **Überwachung der Vendon-Synchronisierung:**
   - Die verbesserte `syncProducts`-Funktion sollte neue Duplikate verhindern
   - Überwachen Sie trotzdem die Logs der Synchronisierung auf Warnungen oder Fehler

3. **Datenbankwartung:**
   - Führen Sie regelmäßige Datenbankwartungen durch, um die Performance zu erhalten
   - Nach umfangreichen Bereinigungen kann eine Datenbankoptimierung sinnvoll sein