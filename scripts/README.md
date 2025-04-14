# Vendon Duplikat-Bereinigung

In diesem Verzeichnis befinden sich Skripte zur Bereinigung von Duplikaten im Zusammenhang mit der Vendon-Synchronisierung.

## Problem

Bei der regulären Vendon-Synchronisierung wurden Produkte dupliziert (>6000 Einträge statt ~120), was zu Problemen in den Lagerbeständen führt.

## Lösung

1. Die `syncProducts`-Funktion in `server/services/vendonSync.ts` wurde verbessert, um zukünftige Duplikate zu verhindern
2. Die Bereinigungsskripte in diesem Verzeichnis entfernen bestehende Duplikate

## Verwendung der Skripte

### Vollständige Bereinigung (empfohlen)

```bash
node scripts/cleanup_vendon_duplicates.js
```

Dieses Skript führt alle Bereinigungsschritte nacheinander aus:
1. Bereinigt Produktduplikate basierend auf normalisierten Namen
2. Bereinigt Lagerbestand-Duplikate (machine_stocks)

### Einzelne Bereinigungsschritte

Falls benötigt, können die einzelnen Schritte auch separat ausgeführt werden:

```bash
# Nur Produkte bereinigen
node scripts/cleanup_product_duplicates.js

# Nur Lagerbestände bereinigen
node scripts/cleanup_machine_stocks.js
```

## Hinweise

- Nach der Bereinigung sollten Produktduplikate verschwunden sein
- Die verbesserte `syncProducts`-Funktion verhindert, dass neue Duplikate entstehen
- Die Bereinigung kann mehrfach ausgeführt werden, falls nötig
- Bei Problemen die Protokolle für weitere Details prüfen