# Migration 003: Product Duplicate Cleanup & Prevention

## 🎯 Ziel
Bereinige alle Produkt-Duplikate in der Datenbank und verhindere zukünftige Duplikate durch UNIQUE Constraints.

## 📊 Impact
- **Datenqualität**: 100% Elimination von Produkt-Duplikaten
- **Betroffene Tabellen**: 1 Haupt-Tabelle (products), 9 FK-Tabellen
- **Geschätzte Duplikate**: 50-200 (wird durch Analyse bestimmt)
- **Risiko**: MITTEL (Datenbereinigung mit FK-Updates)
- **Downtime**: KEINE (aber Off-Peak empfohlen)
- **Reversibilität**: ⚠️  NUR mit Backup (löscht Daten!)

## 🔍 Problem-Analyse

### Symptome
Das Projekt enthält 19+ Cleanup-Scripts für Produkt-Duplikate:
```bash
product_cleanup_migration.sql
clean_all_duplicates.js
fix_vendon_duplicate_products_batched.cjs
cleanup_duplicates.sql
... und 15+ weitere
```

**Bedeutung**: Duplikate sind ein **wiederkehrendes Problem**!

### Root Causes
1. **Keine UNIQUE-Constraint** auf product_name oder vendon_id
2. **Keine Validierung** bei Produkterstellung
3. **Mehrere Datenquellen**:
   - Vendon API (automatischer Import)
   - Manuelle Eingabe
   - Excel-Imports
4. **Inkonsistente Namensgebung**:
   - "Coca Cola 0.5L" vs "Coca Cola 0,5l"
   - Leerzeichen-Variationen
   - Groß-/Kleinschreibung

### Betroffene Foreign Keys (9 Tabellen)
Alle folgenden Tabellen referenzieren `products.id`:
1. `order_items.product_id`
2. `inventory_count_items.product_id`
3. `inventory_items.product_id`
4. `inventory_movements.product_id`
5. `purchase_conditions.product_id`
6. `inventory_batches.product_id`
7. `refill_batch_movements.product_id`
8. `product_batches.product_id`
9. `product_movements.product_id`

## 📁 Dateien dieser Migration

| Datei | Zweck | Wann ausführen | Risiko |
|-------|-------|----------------|--------|
| `003_analyze_product_duplicates.sql` | Analyse | **ZUERST** auf Production | NONE (READ-ONLY) |
| `003_cleanup_product_duplicates.sql` | Haupt-Migration | Nach Analyse-Review | MEDIUM (löscht Daten) |
| `003_validate_cleanup.sql` | Validierung | Nach Cleanup | NONE (READ-ONLY) |
| `003_cleanup_product_duplicates_rollback.sql` | Rollback | Nur bei Problemen | MEDIUM (benötigt Backup) |
| `003_product_duplicates_plan.md` | Detaillierter Plan | Zur Vorbereitung | - |
| `MIGRATION_003_EXECUTIVE_SUMMARY.md` | Executive Summary | Für Stakeholder | - |
| `README_003_PRODUCT_DUPLICATES.md` | Diese Datei | Dokumentation | - |

## 🚀 Schritt-für-Schritt Ausführung

### Voraussetzungen Checklist
- [ ] PostgreSQL 12+ Datenbankzugriff
- [ ] CREATE INDEX, ALTER TABLE, DELETE Rechte
- [ ] Off-Peak Zeitfenster identifiziert (empfohlen: 2-4 Uhr)
- [ ] Backup-Strategie vorbereitet
- [ ] Staging-Umgebung verfügbar zum Testen

---

### PHASE 1: Analyse (READ-ONLY) ✅

**Dauer**: 5-10 Minuten
**Risiko**: KEINE (Nur Lesen, keine Änderungen)
**Ziel**: Verstehen, wie viele Duplikate existieren und welche Strategie geeignet ist

#### Schritt 1.1: Verbinde zur Production DB (READ-ONLY Mode)
```bash
# Empfohlen: Nutze Read-Replica wenn verfügbar
psql $DATABASE_URL

# Oder: Setze explizit READ-ONLY
psql $DATABASE_URL -c "BEGIN READ ONLY;"
```

#### Schritt 1.2: Führe Analyse-Script aus
```bash
psql $DATABASE_URL -f migrations/003_analyze_product_duplicates.sql > analysis_output_$(date +%Y%m%d_%H%M%S).txt
```

#### Schritt 1.3: Review Analyse-Output
Das Script gibt aus:
- **Phase 1**: Gesamt-Statistiken (Total products, Unique names, Duplikate)
- **Phase 2**: Top 20 Duplikat-Gruppen (welche Produkte betroffen)
- **Phase 3**: Vendon-ID Duplikate (falls vorhanden)
- **Phase 4**: FK-Impact (wie viele Referenzen betroffen)
- **Phase 5**: Daten-Qualität (Preiskonflikte, Lieferanten-Konflikte)
- **Phase 6**: Normalisierungs-Möglichkeiten (Fuzzy Duplicates)
- **Phase 7**: **STRATEGIE-EMPFEHLUNG** ⭐
- **Phase 8**: Preview (erste 5 Duplikat-Gruppen, was passieren würde)

**Wichtig**: Notiere die empfohlene Strategie aus Phase 7!

#### Schritt 1.4: Entscheide ob Fortfahren
```
WENN Phase 7 empfiehlt:
  - Strategy 1 (< 100 Duplikate): ✅ Nutze 003_cleanup_product_duplicates.sql wie vorgesehen
  - Strategy 2 (100-500 Duplikate): ✅ Nutze 003_cleanup_product_duplicates.sql (unterstützt beides)
  - Strategy 3 (> 500 Duplikate): ⚠️  Erwäge Batch-Processing oder kontaktiere DBA
```

---

### PHASE 2: Backup & Vorbereitung 💾

**Dauer**: 10-20 Minuten (abhängig von DB-Größe)
**Risiko**: KEINE (nur Backup-Erstellung)
**Ziel**: Sicherstellen, dass Rollback möglich ist

#### Schritt 2.1: Full Database Backup
```bash
# Empfohlen: Full Backup der gesamten Datenbank
pg_dump $DATABASE_URL > backup_before_003_$(date +%Y%m%d_%H%M%S).sql

# Prüfe Backup-Größe
ls -lh backup_before_003_*.sql
```

#### Schritt 2.2: Table-Specific Backup (Optional, zusätzlich)
```bash
# Backup nur der betroffenen Tabellen (schneller restore)
pg_dump -t products \
        -t order_items \
        -t inventory_items \
        -t inventory_movements \
        -t inventory_count_items \
        -t purchase_conditions \
        -t inventory_batches \
        -t refill_batch_movements \
        -t product_batches \
        -t product_movements \
        $DATABASE_URL > backup_products_and_fks_$(date +%Y%m%d).sql
```

#### Schritt 2.3: Teste Backup (CRITICAL!)
```bash
# Erstelle Test-Datenbank
createdb test_restore_003

# Restore Backup
pg_restore -d test_restore_003 backup_before_003_*.sql

# Prüfe Row Count
psql test_restore_003 -c "SELECT COUNT(*) FROM products;"

# Cleanup Test-DB
dropdb test_restore_003
```

**⚠️  Gehe NICHT weiter wenn Backup-Test fehlschlägt!**

---

### PHASE 3: Staging-Test 🧪

**Dauer**: 30-60 Minuten
**Risiko**: KEINE (nur Staging betroffen)
**Ziel**: Validiere Migration auf Staging vor Production

#### Schritt 3.1: Restore Production Backup auf Staging
```bash
# Erstelle Staging-DB (wenn noch nicht vorhanden)
createdb staging_db

# Restore Production Backup
pg_restore -d $STAGING_DATABASE_URL backup_before_003_*.sql
```

#### Schritt 3.2: Führe Migration auf Staging aus
```bash
# Cleanup Migration
psql $STAGING_DATABASE_URL -f migrations/003_cleanup_product_duplicates.sql

# Notiere:
# - Wie viele Duplikate gelöscht wurden
# - Ob Fehler auftraten
# - Laufzeit der Migration
```

#### Schritt 3.3: Validiere Staging-Ergebnis
```bash
psql $STAGING_DATABASE_URL -f migrations/003_validate_cleanup.sql

# Erwartung: "✅ ALL VALIDATIONS PASSED!"
```

#### Schritt 3.4: Test Application auf Staging
```
Manual Tests:
1. Produkt-Auswahl im UI (sollte keine Duplikate zeigen)
2. Neues Produkt anlegen mit existierendem Namen (sollte UNIQUE constraint error geben)
3. Inventory Count durchführen
4. Order erstellen
5. Reports generieren (sollten korrekte Zahlen zeigen)
```

**⚠️  Gehe NICHT zu Production wenn Staging-Test fehlschlägt!**

---

### PHASE 4: Production Ausführung 🚀

**Dauer**: 20-40 Minuten
**Risiko**: MEDIUM (löscht Daten, aber Backup vorhanden)
**Ziel**: Bereinige Duplikate auf Production

#### Schritt 4.1: Pre-Flight Checks
```bash
# 1. Prüfe DB-Last
psql $DATABASE_URL -c "
  SELECT COUNT(*), state
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state;
"

# Erwartung: Geringe Last, wenige active queries

# 2. Prüfe Speicherplatz
psql $DATABASE_URL -c "
  SELECT pg_size_pretty(pg_database_size(current_database())) as db_size,
         pg_size_pretty(pg_total_relation_size('products')) as products_size;
"

# 3. Prüfe Backup nochmal
ls -lh backup_before_003_*.sql
```

#### Schritt 4.2: Führe Cleanup Migration aus
```bash
# Starte Migration
psql $DATABASE_URL -f migrations/003_cleanup_product_duplicates.sql 2>&1 | tee migration_003_output_$(date +%Y%m%d_%H%M%S).log

# WICHTIG: Beobachte Output für:
# - "✅" Success-Meldungen
# - "❌" oder "⚠️" Warnings/Errors
# - Anzahl gelöschter Produkte
# - Anzahl aktualisierter FK-Referenzen
```

**Das Script gibt detaillierte Fortschritts-Meldungen aus**:
```
================================================
MIGRATION 003: Product Duplicate Cleanup
================================================
Started at: 2025-11-04 02:30:15

PRE-FLIGHT CHECKS
Total products: 1247
Duplicate groups found: 83
Proceeding with cleanup...

PHASE 1: Creating Deduplication Mapping
Mapping created:
  - Total products in mapping: 249
  - Products to KEEP: 83
  - Products to DELETE: 166

PHASE 2: Updating Foreign Key References
✅ order_items: 342 rows updated
✅ inventory_count_items: 127 rows updated
✅ inventory_items: 89 rows updated
✅ inventory_movements: 234 rows updated
✅ purchase_conditions: 12 rows updated
✅ inventory_batches: 45 rows updated
✅ refill_batch_movements: 67 rows updated
✅ product_batches: 98 rows updated
✅ product_movements: 156 rows updated

PHASE 3: Verifying FK Updates
✅ All FK references successfully updated!

PHASE 4: Deleting Duplicate Products
Products before deletion: 1247
✅ Deleted 166 duplicate products
Products after deletion: 1081

PHASE 5: Adding UNIQUE Constraint (Prevention)
✅ Created UNIQUE index on normalized product_name
✅ Created UNIQUE index on vendon_id (where not null)
⚠️  Future product insertions must have unique names!

PHASE 6: Post-Migration Validation
Total products: 1081
Unique product names: 1081
Remaining duplicate groups: 0
✅ SUCCESS: No duplicate products remain!

MIGRATION 003: COMPLETED
Completed at: 2025-11-04 02:47:32
```

#### Schritt 4.3: Sofort-Validierung
```bash
# Führe Validierungs-Script aus
psql $DATABASE_URL -f migrations/003_validate_cleanup.sql

# Erwartung: "✅ ALL VALIDATIONS PASSED!"
```

#### Schritt 4.4: Manual Smoke Tests
```sql
-- Test 1: Keine Duplikate mehr
SELECT
  LOWER(TRIM(product_name)) as name,
  COUNT(*) as count
FROM products
GROUP BY LOWER(TRIM(product_name))
HAVING COUNT(*) > 1;
-- Erwartung: 0 rows

-- Test 2: UNIQUE Constraint aktiv
INSERT INTO products (product_name, supplier_id)
SELECT product_name, supplier_id
FROM products
LIMIT 1;
-- Erwartung: ERROR: duplicate key value violates unique constraint

-- Test 3: Produkt-Auswahl funktioniert
SELECT id, product_name
FROM products
WHERE product_name ILIKE '%coca%'
ORDER BY product_name
LIMIT 10;
-- Erwartung: Keine Duplikate in Ergebnis
```

---

### PHASE 5: Post-Migration Monitoring 📊

**Dauer**: 4-24 Stunden
**Risiko**: KEINE (nur Beobachtung)
**Ziel**: Sicherstellen dass keine Probleme auftreten

#### Schritt 5.1: Sofort-Monitoring (erste 4 Stunden)
```bash
# 1. Application Error Logs prüfen
tail -f /var/log/application.log | grep -i "product\|duplicate\|unique"

# 2. Datenbank Error Logs prüfen
tail -f /var/log/postgresql/postgresql.log | grep -i "error\|constraint"

# 3. Prüfe auf UNIQUE constraint violations
psql $DATABASE_URL -c "
  SELECT query, calls, total_exec_time
  FROM pg_stat_statements
  WHERE query LIKE '%products%'
    AND query LIKE '%ERROR%'
  ORDER BY calls DESC
  LIMIT 10;
"
```

#### Schritt 5.2: Business-Metriken prüfen (nächste 24h)
```sql
-- Prüfe ob Order-Erstellung weiterhin funktioniert
SELECT
  DATE(created_at) as date,
  COUNT(*) as order_count
FROM orders
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
-- Erwartung: Kein Einbruch nach Migration

-- Prüfe ob Inventory-Zählungen funktionieren
SELECT
  DATE(created_at) as date,
  COUNT(*) as count_sessions
FROM inventory_counts
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
-- Erwartung: Normal operations
```

#### Schritt 5.3: User Feedback sammeln
```
Frage Team/Users:
1. Gibt es Probleme bei Produkt-Auswahl?
2. Können neue Produkte angelegt werden?
3. Funktionieren Inventory-Operationen?
4. Gibt es Fehlermeldungen beim Speichern?
```

---

## ⚠️ Troubleshooting

### Problem 1: Migration schlägt fehl mit FK Constraint Error
**Symptom**:
```
ERROR: update or delete on table "products" violates foreign key constraint
```

**Lösung**:
```bash
# 1. STOP Migration sofort (Ctrl+C)
# 2. Rollback ausführen
psql $DATABASE_URL -f migrations/003_cleanup_product_duplicates_rollback.sql

# 3. Restore von Backup
pg_restore -d $DATABASE_URL backup_before_003_*.sql

# 4. Untersuche Problem:
#    - Welche FK-Tabelle verursacht Error?
#    - Gibt es ON DELETE CASCADE Rules?
#    - Sind FK-Namen korrekt?

# 5. Kontaktiere DBA für Analyse
```

---

### Problem 2: "Remaining duplicate groups: X" nach Migration
**Symptom**: Validierung zeigt noch Duplikate

**Lösung**:
```sql
-- 1. Finde welche Duplikate übrig sind
SELECT
  LOWER(TRIM(product_name)) as name,
  COUNT(*) as count,
  ARRAY_AGG(id) as ids
FROM products
GROUP BY LOWER(TRIM(product_name))
HAVING COUNT(*) > 1;

-- 2. Manuell untersuchen:
--    - Haben diese Produkte spezielle Zeichen?
--    - Sind es Edge Cases (NULL names, etc.)?

-- 3. Optional: Manuell bereinigen
DELETE FROM products
WHERE id IN (12345, 67890)  -- IDs von Duplikaten
  AND id != (SELECT MIN(id) FROM products WHERE ...);

-- 4. Re-run Validierung
```

---

### Problem 3: Application wirft "UNIQUE constraint violation"
**Symptom**:
```
ERROR: duplicate key value violates unique constraint "unique_product_name_normalized"
```

**Ursache**: Application versucht Produkt mit existierendem Namen anzulegen

**Lösung**:
```typescript
// Application Code Update erforderlich:

// VORHER (erlaubte Duplikate):
await db.insert(products).values({
  product_name: "Coca Cola 0.5L",
  supplier_id: 123
});

// NACHHER (handle UNIQUE constraint):
try {
  await db.insert(products).values({
    product_name: "Coca Cola 0.5L",
    supplier_id: 123
  });
} catch (error) {
  if (error.code === '23505') {  // UNIQUE violation
    // Zeige User-Friendly Error:
    throw new Error(`Produkt "${productName}" existiert bereits. Bitte nutzen Sie das existierende Produkt.`);
  }
  throw error;
}

// BESSER: Pre-Check vor Insert
const existingProduct = await db
  .select()
  .from(products)
  .where(
    sql`LOWER(TRIM(${products.product_name})) = LOWER(TRIM(${productName}))`
  )
  .limit(1);

if (existingProduct.length > 0) {
  throw new Error(`Produkt "${productName}" existiert bereits mit ID ${existingProduct[0].id}`);
}
```

---

### Problem 4: Zu viele Duplikate (> 500)
**Symptom**: Analyse zeigt > 500 Duplikate, Migration dauert zu lange

**Lösung**: Batch Processing
```sql
-- Strategie 2: Batch Processing (in 003_cleanup script dokumentiert)
-- Modifiziere Cleanup-Script um in Batches von 50 zu arbeiten:

DO $$
DECLARE
  batch_size INTEGER := 50;
  total_batches INTEGER;
  current_batch INTEGER := 0;
BEGIN
  -- Berechne Anzahl Batches
  SELECT CEIL(COUNT(*)::numeric / batch_size) INTO total_batches
  FROM (
    SELECT LOWER(TRIM(product_name)) as name
    FROM products
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) sub;

  RAISE NOTICE 'Processing % batches of % duplicates each', total_batches, batch_size;

  -- Iteriere durch Batches
  WHILE current_batch < total_batches LOOP
    current_batch := current_batch + 1;
    RAISE NOTICE 'Processing batch %/%', current_batch, total_batches;

    -- Cleanup-Logic für diesen Batch
    -- (INSERT mapping, UPDATE FKs, DELETE duplicates)

    -- Commit nach jedem Batch (optional)
    COMMIT;
  END LOOP;

  RAISE NOTICE 'Completed all % batches', total_batches;
END$$;
```

---

## 🔄 Rollback-Szenarien

### Szenario 1: Migration läuft noch, Problem erkannt
**Action**: Ctrl+C zum Abbrechen (PostgreSQL rollt automatisch back bis zum letzten COMMIT)

### Szenario 2: Migration completed, aber Fehler in Validierung
**Action**:
```bash
# 1. Rollback Script ausführen (entfernt UNIQUE constraints)
psql $DATABASE_URL -f migrations/003_cleanup_product_duplicates_rollback.sql

# 2. Restore von Backup
pg_restore -d $DATABASE_URL backup_before_003_*.sql

# 3. Validiere Restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM products;"
```

### Szenario 3: Migration succeeded, aber Application bricht
**Action**:
```bash
# Option A: Nur Constraints entfernen (Duplikate bleiben gelöscht)
psql $DATABASE_URL -f migrations/003_cleanup_product_duplicates_rollback.sql

# Option B: Full Restore (alle Änderungen rückgängig)
pg_restore -d $DATABASE_URL backup_before_003_*.sql

# Entscheide basierend auf:
# - Ist Problem UNIQUE constraint oder gelöschte Duplikate?
# - Sind neue Daten seit Migration entstanden?
```

---

## 📈 Erwartete Verbesserungen

### Datenqualität
```
Vorher:
- Produkt-Duplikate: ~50-200
- Inkonsistente Produkt-Daten
- Verwirrende Produkt-Auswahl
- 19+ Cleanup-Scripts notwendig

Nachher:
- Produkt-Duplikate: 0
- Saubere, eindeutige Produkt-Daten
- Klare Produkt-Auswahl
- UNIQUE Constraint verhindert neue Duplikate
- 19+ Cleanup-Scripts können gelöscht werden
```

### Performance
```
Produkt-Suche: 10-20% schneller (weniger Rows)
Dropdown-Auswahl: 15-20% schneller (kleinere Liste)
Inventory-Reports: Korrekt (keine doppelten Einträge)
Aggregation-Queries: Präziser (keine inflierten Zahlen)
```

### User Experience
```
Vorher: "Coca Cola 0.5L" erscheint 3x in Dropdown
Nachher: "Coca Cola 0.5L" erscheint 1x in Dropdown

Vorher: Inventory Count zeigt 3 separate Produkte
Nachher: Inventory Count zeigt 1 Produkt mit korrektem Stock
```

---

## 📚 Weitere Schritte nach Migration

### Immediate (Tag 0)
- [ ] ✅ Migration 003 completed
- [ ] ✅ Validation passed
- [ ] ✅ Application smoke tests erfolgreich
- [ ] 📧 Benachrichtige Team über erfolgreiche Migration

### Short-term (Woche 1)
- [ ] Update Application Code: Handle UNIQUE constraint errors gracefully
- [ ] Update User Documentation: Neue Duplikat-Prävention
- [ ] Train Users: "Produkt bereits vorhanden" Meldung erklären
- [ ] Monitor Support Tickets für Duplikat-bezogene Probleme

### Long-term (Monat 1)
- [ ] Update `shared/schema.ts` mit UNIQUE index Definitionen:
  ```typescript
  export const products = pgTable("products", {
    // ... columns ...
  }, (table) => ({
    uniqueProductName: uniqueIndex("unique_product_name_normalized")
      .on(sql`LOWER(TRIM(${table.product_name}))`),
    uniqueVendonId: uniqueIndex("unique_vendon_id_not_null")
      .on(table.vendonId)
      .where(sql`${table.vendonId} IS NOT NULL AND ${table.vendonId} != ''`),
  }));
  ```
- [ ] Delete 19+ alte Cleanup-Scripts aus Repository
- [ ] Update Data Import Scripts: Pre-Check für Duplikate
- [ ] Document Prozess: "Wie erstelle ich ein neues Produkt?"

### Optional (Best Practices)
- [ ] Implementiere Pre-Insert Validation in Application:
  ```typescript
  // services/products.ts
  async function createProduct(data: NewProduct) {
    // Check for duplicate name
    const normalized = data.product_name.toLowerCase().trim();
    const existing = await db.select()
      .from(products)
      .where(sql`LOWER(TRIM(${products.product_name})) = ${normalized}`)
      .limit(1);

    if (existing.length > 0) {
      throw new DuplicateProductError(
        `Product "${data.product_name}" already exists with ID ${existing[0].id}`
      );
    }

    return db.insert(products).values(data);
  }
  ```
- [ ] Add Product Merge UI: Falls Duplikate manuell gemeldet werden
- [ ] Implementiere Fuzzy-Match Warning: "Ähnliches Produkt existiert bereits"

---

## 🎓 Lessons Learned

### Why did duplicates happen?
1. **No Prevention**: Fehlende UNIQUE constraint erlaubte Duplikate
2. **Multiple Sources**: Verschiedene Datenquellen ohne Koordination
3. **No Normalization**: "Coca Cola" vs "coca cola" als unterschiedlich behandelt
4. **Reactive Cleanup**: 19+ Scripts zeigen reaktiven statt proaktiven Ansatz

### How to prevent in future?
1. **✅ UNIQUE Constraints**: Datenbank verhindert Duplikate (jetzt implementiert!)
2. **✅ Application Validation**: Pre-Check vor Insert (to be implemented)
3. **📝 Data Import Process**: Standardisierter Prozess für neue Produkte
4. **🔍 Monitoring**: Alert bei UNIQUE constraint violations (zeigt Duplikat-Versuche)

---

## 👥 Kontakt & Support

Bei Fragen oder Problemen:
- **Migration erstellt von**: Database Architecture Review (Claude Code Agent)
- **Basierend auf**: Analyse von 91 Tabellen, 150 Foreign Keys, 19+ Cleanup Scripts
- **Review Date**: 2025-11-04
- **Documentation**: Siehe `003_product_duplicates_plan.md` und `MIGRATION_003_EXECUTIVE_SUMMARY.md`

---

**Status**: ✅ READY FOR EXECUTION
**Nächster Schritt**: Führe Analyse aus (`003_analyze_product_duplicates.sql`)
