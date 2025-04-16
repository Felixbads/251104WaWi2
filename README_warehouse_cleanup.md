# Lagerbestand-Bereinigung und Neusynchronisierung

Dieses Dokument beschreibt den Prozess zur Bereinigung und Neusynchronisierung von Lagerbeständen in Proviantomat.

## Hintergrund

Das System hatte Probleme mit Duplikaten in der Produktdatenbank und folglich auch in den Lagerbeständen. Nach einer umfassenden Bereinigung der products-Tabelle und der inventory_items-Tabelle gibt es jetzt Skripte zur vollständigen Bereinigung und intelligenten Neusynchronisierung der Lager.

## Verfügbare Skripte

### 1. Ein einzelnes Lager bereinigen und synchronisieren

Mit dem Skript `clean_and_resync_warehouse.js` können Sie ein einzelnes Lager bereinigen und neu synchronisieren:

```bash
node clean_and_resync_warehouse.js <lager_id>
```

Beispiel:
```bash
node clean_and_resync_warehouse.js 4
```

Dieses Skript führt folgende Schritte aus:
1. Löscht alle inventory_items-Einträge für das angegebene Lager
2. Ermittelt alle Automaten, die diesem Lager zugewiesen sind
3. Ermittelt alle Produkte, die in diesen Automaten verwendet werden (aus Slots und Transaktionen)
4. Fügt diese Produkte dem Lager hinzu

### 2. Alle Lager bereinigen und synchronisieren

Mit dem Skript `clean_and_resync_all_warehouses.js` können Sie alle aktiven Lager im System bereinigen und neu synchronisieren:

```bash
node clean_and_resync_all_warehouses.js
```

Dieses Skript:
1. Ruft eine Liste aller aktiven Lager ab
2. Führt für jedes Lager die Bereinigung und Neusynchronisierung durch
3. Gibt eine Zusammenfassung der Ergebnisse aus

## Prozess der intelligenten Synchronisierung

Die Synchronisierung sammelt Produkte aus folgenden Quellen:
1. Produkte, die in den Slots der Automaten konfiguriert sind
2. Produkte, die in Transaktionen der Automaten verwendet wurden

Nur Produkte, die tatsächlich mit dem Lager verbunden sind (über die zugewiesenen Automaten), werden in den Lagerbestand aufgenommen. Dies verhindert, dass alle Produkte in der Datenbank jedem Lager zugewiesen werden.

## Vorteile

- Nur tatsächlich benötigte Produkte werden in den Lagerbestand aufgenommen
- Keine Duplikate mehr im Lagerbestand
- Sauberer, auf Automaten basierender Sync-Prozess
- Einfache Möglichkeit, den Lagerbestand neu aufzubauen, wenn Probleme auftreten

## Langfristige Lösung

Die langfristige Lösung besteht aus zwei Teilen:
1. **Prävention**: Der Parameter `syncAllProducts` wurde auf `false` gesetzt, um zu verhindern, dass alle Produkte automatisch jedem Lager hinzugefügt werden
2. **Bereinigung**: Die hier beschriebenen Skripte können bei Bedarf ausgeführt werden, um einen sauberen Lagerbestand zu gewährleisten