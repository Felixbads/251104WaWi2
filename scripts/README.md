# Vendon Duplikat-Bereinigung

In diesem Verzeichnis befindet sich ein Skript zur Bereinigung von Duplikaten im Zusammenhang mit der Vendon-Synchronisierung.

## Problem

Bei der regulären Vendon-Synchronisierung wurden Produkte dupliziert (>6000 Einträge statt ~120), was zu Problemen in den Lagerbeständen führt.

## Lösung

1. Die `syncProducts`-Funktion in `server/services/vendonSync.ts` wurde verbessert, um zukünftige Duplikate zu verhindern
2. Das Bereinigungsskript in diesem Verzeichnis entfernt bestehende Duplikate und konsolidiert Lagerbestände

## Verwendung des Bereinigungsskripts

```bash
npx tsx scripts/vendon_cleanup.ts
```

Dieses Skript führt folgende Bereinigungsschritte durch:

1. **Produktduplikate identifizieren**: Findet duplizierte Produkte basierend auf normalisierten Namen
2. **Produktduplikate bereinigen**: Konsolidiert Duplikate zu einem einzigen Produkt pro normalisiertem Namen
   - Erhält das primäre Produkt (bevorzugt mit vendonId)
   - Aktualisiert Referenzen in machine_stocks auf das primäre Produkt
   - Löscht die Duplikate
3. **Lagerbestände bereinigen**: Bereinigt Duplikate in Lagerbeständen
   - Identifiziert ungültige Einträge mit nicht mehr existierenden Produktreferenzen
   - Konsolidiert duplizierte Lagerbestände (gleiche Maschine, gleiches Produkt)
   - Summiert Mengen für ein konsistentes Ergebnis

## Hinweise

- Nach der Bereinigung sollten Produktduplikate verschwunden sein
- Die verbesserte `syncProducts`-Funktion verhindert, dass neue Duplikate entstehen
- Die Bereinigung kann mehrfach ausgeführt werden, falls nötig
- Bei Problemen die Protokolle für weitere Details prüfen

## Verbesserte syncProducts-Funktion

Die Funktion wurde so verbessert, dass sie:

1. Produktnamen normalisiert (Kleinbuchstaben, ohne Leerzeichen am Anfang/Ende)
2. Vor dem Erstellen neuer Produkte prüft, ob ein Produkt mit dem gleichen normalisierten Namen bereits existiert
3. Bestehendes Produkt aktualisiert, statt ein Duplikat zu erstellen
4. Duplikate in Lagerbeständen vermeidet