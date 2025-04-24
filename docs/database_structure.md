# Datenbank-Struktur und Beziehungen

Dieses Dokument beschreibt die Struktur der PostgreSQL-Datenbank, die Kernkomponenten, Tabellen, Beziehungen und wichtige Constraints. Es dient als Referenz für Entwickler, Admins und als Grundlage für das Datenmanagement.

## Kerntabellen und ihre Rollen

### Produkt- und Inventarmanagement

| Tabelle | Beschreibung | Schlüsselfelder |
|---------|--------------|-----------------|
| `products` | Produkte aus dem Vendon-System | `id`, `vendon_id`, `product_name` |
| `warehouses` | Lager für Produkte | `id`, `name`, `location_id` |
| `inventory_items` | Produkte in einem Lager | `id`, `warehouse_id`, `product_id`, `current_stock` |
| `inventory_movements` | Bewegungen von Lagerbestand | `id`, `inventory_item_id`, `quantity`, `movement_type` |
| `inventory_batches` | Gruppen von Lagerbewegungen | `id`, `description`, `created_by` |
| `product_movements` | Produktbewegungen | `id`, `product_id`, `quantity`, `movement_type` |
| `suppliers` | Lieferanten für Produkte | `id`, `name`, `contact_person` |
| `purchase_conditions` | Einkaufsbedingungen pro Produkt | `id`, `product_id`, `supplier_id`, `price` |

### Automaten und Transaktionen

| Tabelle | Beschreibung | Schlüsselfelder |
|---------|--------------|-----------------|
| `machines` | Automaten aus dem Vendon-System | `id`, `vendon_id`, `machine_name`, `location_id` |
| `transactions` | Verkaufstransaktionen | `id`, `vendon_id`, `machine_id`, `product_id`, `datetime` |
| `refills` | Automaten-Nachfüllungen | `id`, `vendon_id`, `machine_id`, `datetime` |
| `refill_details` | Details zu Nachfüllungen | `id`, `refill_id`, `product_id`, `quantity` |
| `machine_stocks` | Aktueller Bestand in Automaten | `id`, `machine_id`, `product_id`, `current_stock` |
| `events` | Ereignisse aus dem Vendon-System | `id`, `vendon_id`, `machine_id`, `event_type` |

### Zuordnungen und Standorte

| Tabelle | Beschreibung | Schlüsselfelder |
|---------|--------------|-----------------|
| `locations` | Standorte für Automaten und Lager | `id`, `name`, `address` |
| `machine_warehouse_assignments` | Zuordnung von Automaten zu Lagern | `id`, `machine_id`, `warehouse_id`, `is_primary` |

### System- und Metadaten

| Tabelle | Beschreibung | Schlüsselfelder |
|---------|--------------|-----------------|
| `users` | Systembenutzer | `id`, `username`, `password`, `role` |
| `sync_locks` | Sperren für Synchronisierungsprozesse | `id`, `sync_type`, `locked_at`, `locked_until` |
| `sync_logs` | Protokolle der Synchronisierungsvorgänge | `id`, `sync_type`, `start_date`, `end_date`, `sync_status` |
| `data_coverage` | Abdeckung der vorhandenen Daten | `id`, `data_type`, `start_date`, `end_date` |

## Wichtige Beziehungen

### Produkt-Beziehungen
- `products` → `inventory_items`: Ein Produkt kann in mehreren Lagern vorhanden sein
- `products` → `machine_stocks`: Ein Produkt kann in mehreren Automaten vorhanden sein
- `products` → `transactions`: Ein Produkt kann in mehreren Transaktionen vorkommen
- `products` → `refill_details`: Ein Produkt kann in mehreren Nachfüllungen verwendet werden
- `products` → `suppliers`: Ein Produkt kann einem oder mehreren Lieferanten zugeordnet sein

### Automaten-Beziehungen
- `machines` → `transactions`: Ein Automat erzeugt viele Transaktionen
- `machines` → `refills`: Ein Automat erhält viele Nachfüllungen
- `machines` → `machine_stocks`: Ein Automat hat viele Produktbestände
- `machines` → `machine_warehouse_assignments`: Ein Automat kann mehreren Lagern zugeordnet sein
- `machines` → `events`: Ein Automat erzeugt viele Ereignisse

### Lager-Beziehungen
- `warehouses` → `inventory_items`: Ein Lager enthält viele Lagerbestandspositionen
- `warehouses` → `machine_warehouse_assignments`: Ein Lager kann vielen Automaten zugeordnet sein

### Standort-Beziehungen
- `locations` → `warehouses`: Ein Standort kann mehrere Lager haben
- `locations` → `machines`: Ein Standort kann mehrere Automaten haben

## Synchronisierungsmechanismen

### `sync_locks`-Tabelle
Diese Tabelle implementiert einen Sperrmechanismus, um konkurrierende Synchronisierungsvorgänge zu verhindern:
- `sync_type`: Art der Synchronisierung (z.B. 'products', 'transactions')
- `locked_at`: Zeitpunkt, zu dem die Sperre erworben wurde
- `locked_until`: Zeitpunkt, bis zu dem die Sperre gültig ist

### `sync_logs`-Tabelle
Diese Tabelle protokolliert jeden Synchronisierungsvorgang:
- `sync_type`: Art der Synchronisierung
- `start_date`: Startzeitpunkt
- `end_date`: Endzeitpunkt
- `items_found`: Anzahl der gefundenen Elemente
- `items_saved`: Anzahl der gespeicherten Elemente
- `sync_status`: Status ('success', 'error', 'partial')
- `error_message`: Fehlermeldung, falls vorhanden

## Fehlerquellen und Lösungen

### Datenintegrität und Constraints
Die aktuelle Datenbank hat nur wenige explizite Fremdschlüsselbeziehungen, die im Schema definiert sind:
- `users.approved_by` → `users.id`
- `warehouses.location_id` → `locations.id`

Dies ist ein bekanntes Problem und ein Hauptgrund für Datenbankprobleme. Die fehlenden Fremdschlüsselbeziehungen sollten schrittweise implementiert werden, wie im Skript `server/scripts/database-integrity.js` beschrieben.

### Schema-Änderungen
Bei der Durchführung von Schema-Änderungen sollten die folgenden Richtlinien beachtet werden:
1. Immer zuerst ein Datenbank-Backup erstellen
2. Schema-Änderungen von Datenmigrationen trennen
3. Keine destruktiven Änderungen ohne manuelle Überprüfung durchführen
4. Nach der Änderung die Datenintegrität überprüfen

Für weitere Details siehe [Deployment-Leitfaden](deployment_guide.md).

## Optimierung und Leistung

### Indizes
Die Datenbank benötigt Indizes für Fremdschlüssel und häufig abgefragte Felder:
- `transactions`: Indizes für `vendon_id`, `machine_id`, `datetime`
- `products`: Indizes für `vendon_id`, `product_name`
- `machines`: Indizes für `vendon_id`, `location_id`
- `inventory_items`: Indizes für `warehouse_id`, `product_id`

### Empfehlungen für Abfragen
- Transaktionsabfragen sollten zeitlich begrenzt sein (z.B. nur die letzten 30 Tage)
- Bei großen Tabellen (wie transactions) immer LIMIT-Klauseln verwenden
- Komplexe JOIN-Operationen vermeiden, stattdessen mehrere einfache Abfragen

## Backup-Strategien

Unsere Backup-Strategie ist in `server/scripts/database-backup.js` implementiert:
1. Tägliche vollständige Backups (Schema und Daten)
2. Stündliche inkrementelle Backups (nur Änderungen)
3. Wöchentliche Schema-Backups
4. Automatische Bereinigung alter Backups basierend auf Aufbewahrungsrichtlinien

## Datenbank-Monitoring

Das Monitoring ist in `server/scheduler.js` implementiert:
1. Wöchentliche Integritätsprüfungen (fehlende Constraints, Integritätsverletzungen)
2. Monatliches Reindexing
3. Überwachung von Backup-Erfolg und -Fehler

## Nächste Schritte für die Datenbankoptimierung

1. Implementierung aller fehlenden Fremdschlüsselbeziehungen
2. Hinzufügen benötigter Indizes für Leistungsoptimierung
3. Implementierung eines Datenbankstatistik-Dashboards für Administratoren
4. Automatisierte Warnung über ungewöhnliche Datenbankaktivitäten
5. Etablierung eines regelmäßigen Prüfzyklus für die Datenbankkonsistenz