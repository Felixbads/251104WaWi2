# Plan: Produkt-Duplikate bereinigen (Maßnahme #3)

## 🎯 Übersicht
- **Ziel:** Bereinige Produkt-Duplikate und verhindere zukünftige Duplikate
- **Methode:** Konsolidierte Migration basierend auf 19 vorhandenen Scripts
- **Risiko:** MITTEL (Datenbereinigung, FK-Updates)
- **Impact:** HOCH (Datenqualität, Performance, Wartbarkeit)

## 🔍 Problem-Analyse

### Aktueller Status
**19+ Cleanup-Scripts gefunden:**
- `product_cleanup_migration.sql` (121 Zeilen) - Umfassend
- `clean_all_duplicates.js` (256 Zeilen) - Mit Normalisierung
- `fix_vendon_duplicate_products_batched.cjs` (323 Zeilen) - Batch-Verarbeitung
- `cleanup_duplicates.sql` (33 Zeilen) - Einfach
- 15+ weitere Scripts

**Bedeutung:** ⚠️ Duplikate sind ein **wiederkehrendes Problem**!

### Root Causes
1. **Keine UNIQUE-Constraint** auf product_name oder vendon_id
2. **Keine Validierung** bei Produkterstellung
3. **Mehrere Datenquellen** (Vendon API, manuelle Eingabe, Excel-Imports)
4. **Inkonsistente Namensgebung** (Leerzeichen, Groß-/Kleinschreibung)

### Betroffene Tabellen (9 FK-Referenzen)
1. `order_items` → product_id
2. `inventory_count_items` → product_id
3. `inventory_items` → product_id
4. `inventory_movements` → product_id
5. `purchase_conditions` → product_id
6. `inventory_batches` → product_id
7. `refill_batch_movements` → product_id
8. `product_batches` → product_id
9. `product_movements` → product_id

## 📊 Duplikat-Kriterien

### Was ist ein Duplikat?

**Kriterium 1:** Exakter Name (case-insensitive)
```sql
LOWER(TRIM(product_name))
```

**Kriterium 2:** Vendon-ID (wenn vorhanden)
```sql
vendon_id IS NOT NULL AND vendon_id != ''
```

**Kriterium 3:** Normalisierter Name (erweitert)
- Entferne mehrfache Leerzeichen
- Entferne Sonderzeichen
- Standardisiere Volumenangaben (0.5l → 05l)
- Standardisiere Abkürzungen

### Auswahl-Strategie: Welches Product behalten?

**Priorität (höchste zuerst):**
1. **Niedrigste ID** (ältestes Product)
2. **Mit mehr FK-Referenzen** (mehr verwendet)
3. **Aktuelleres updated_at** (neuere Daten)

## 🛠️ Lösungsstrategien

### Strategy 1: Simple Deduplication (EMPFOHLEN) ✅
**Wenn:** < 100 Duplikate
**Methode:**
1. Finde Duplikate (LOWER(product_name))
2. Erstelle Mapping (old_id → keep_id)
3. Update alle 9 FK-Tabellen
4. Lösche alte Produkte
5. Add UNIQUE constraint

**Vorteil:** Schnell, sicher, gut getestet
**Risiko:** MITTEL

### Strategy 2: Batch Processing (für große Mengen)
**Wenn:** > 100 Duplikate
**Methode:** Wie Strategy 1, aber in Batches von 50
**Vorteil:** Bessere Progress-Logs, kann pausiert werden
**Risiko:** MITTEL

### Strategy 3: With Product Merging (komplex)
**Wenn:** Duplikate haben unterschiedliche Daten
**Methode:** Merge supplier_id, prices, etc.
**Vorteil:** Keine Daten verloren
**Risiko:** HOCH - nur wenn nötig!

## 📋 Ausführungsplan

### Phase 1: Analyse (READ-ONLY) ✅
```bash
# Führe Analyse aus
psql $DATABASE_URL -f migrations/003_analyze_product_duplicates.sql

# Erwarte:
# - Anzahl Duplikate
# - Top 20 Duplikate
# - FK-Referenz-Counts
# - Empfohlene Strategie
```

### Phase 2: Backup & Vorbereitung
```bash
# Full Backup
pg_dump $DATABASE_URL > backup_before_003_$(date +%Y%m%d).sql

# Oder table-spezifisch
pg_dump -t products -t order_items -t inventory_items \
  $DATABASE_URL > backup_products_fk_$(date +%Y%m%d).sql
```

### Phase 3: Migration ausführen
```bash
# Staging Test
psql $STAGING_DB -f migrations/003_cleanup_product_duplicates.sql

# Wenn OK: Production (Off-Peak!)
psql $PRODUCTION_DB -f migrations/003_cleanup_product_duplicates.sql
```

### Phase 4: Prävention (CRITICAL!)
```sql
-- Add UNIQUE constraint
ALTER TABLE products
  ADD CONSTRAINT unique_product_name_supplier
  UNIQUE (product_name, supplier_id);

-- Oder nur auf vendon_id
ALTER TABLE products
  ADD CONSTRAINT unique_vendon_id
  UNIQUE (vendon_id)
  WHERE vendon_id IS NOT NULL;
```

## ⚠️ Risiko-Assessment

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| FK-Constraint verletzt | Niedrig | Hoch | Validierung vor Delete |
| Falsche Product ausgewählt | Niedrig | Mittel | Niedrigste ID + mehr Refs |
| Daten verloren | Niedrig | Hoch | Full Backup, Audit-Log |
| Performance-Impact | Mittel | Mittel | Off-Peak, Batch-Processing |
| Neue Duplikate | Hoch | Mittel | **UNIQUE Constraint!** |

**Gesamt-Risiko:** MITTEL ⚠️
**CRITICAL:** Ohne UNIQUE Constraint werden neue Duplikate entstehen!

## 🎯 Success Criteria

Nach Migration:
- [ ] Keine Duplikate in products (GROUP BY product_name HAVING COUNT > 1)
- [ ] UNIQUE constraint existiert
- [ ] Alle FK-Referenzen valide
- [ ] Row count stimmt (Duplikate - erwartete Count)
- [ ] Validation-Query zeigt 0 Duplikate
- [ ] Application funktioniert normal

## 📊 Erwartete Verbesserung

### Datenqualität
```
Vorher:
- Produkt-Duplikate: ~50-200 (geschätzt)
- Inkonsistente Daten
- Verwirrende Product-Auswahl

Nachher:
- Produkt-Duplikate: 0
- Saubere Daten
- UNIQUE Constraint verhindert neue Duplikate
```

### Performance
```
Product-Suche: 10-20% schneller (weniger Rows)
Inventory-Reports: Korrekter (keine doppelten Einträge)
```

### Wartbarkeit
```
Keine 20+ Cleanup-Scripts mehr nötig
Prävention durch Constraint
Saubere Datenbank
```

## 🔄 Rollback-Plan

### Sofort-Rollback (< 1 Stunde)
```bash
pg_restore backup_before_003_YYYYMMDD.sql
```

### Spät-Rollback (komplex!)
```sql
-- ACHTUNG: Nur wenn Backup verfügbar!
-- Neue Daten seit Migration gehen verloren

BEGIN;

-- 1. Drop UNIQUE constraint
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS unique_product_name_supplier;

-- 2. Restore von Backup (external)

COMMIT;
```

## 📅 Zeitschätzung

- Analyse: 30 Minuten
- Backup: 15 Minuten
- Staging-Test: 1 Stunde
- Production: 30-60 Minuten (abhängig von Duplikat-Anzahl)
- Validation: 30 Minuten

**TOTAL: 3-4 Stunden**

---

**Status:** READY FOR ANALYSIS
**Nächster Schritt:** Erstelle und führe 003_analyze_product_duplicates.sql aus
