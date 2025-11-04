# Plan: Fehlende FK-Indizes erstellen (Maßnahme #2)

## Übersicht
- **Ziel:** Performance-kritische FK-Indizes erstellen
- **Methode:** CREATE INDEX CONCURRENTLY (kein Locking)
- **Risiko:** NIEDRIG (nur Lesezugriff, keine Datenänderung)
- **Impact:** KRITISCH (massive JOIN-Performance-Verbesserung)

## Aktuelle Situation

### Bereits indexiert (Beispiele aus Schema-Analyse):
✅ transactions.machineId - HAT Index (machineTimestampIdx, Zeile 1199)
✅ refills.machineId - HAT Index (machineRefillDateIdx, Zeile 1247)
✅ orders.supplierId - HAT Index (supplierIdIdx, Zeile 2733)
✅ order_items.orderId - HAT Index (orderIdIdx, Zeile 2901)

### FEHLENDE Indizes (aus Agent-Analyse):

#### Phase 1: KRITISCH (Millionen Rows, häufige JOINs)
- [ ] transactionGaps.machineId (Zeile 464)
- [ ] recoveryJobs.machineId (Zeile 507)
- [ ] syncHealthLogs.machineId (Zeile 589)
- [ ] dataQualityMetrics.machineId (Zeile 635)
- [ ] products.createdBy (Zeile 919)
- [ ] ecoImpacts.productId (Zeile 968)
- [ ] userEcoChoices.productId (Zeile 1019)
- [ ] events.machineId (Zeile 1327)
- [ ] machineStocks.machineId (Zeile 1441)
- [ ] machineDailyStats.machineId (Zeile 1483)

#### Phase 2: HOCH (Inventory & Batches)
- [ ] refillRecommendations.machineId (Zeile 1864)
- [ ] productBatches.createdBy (Zeile 3218)
- [ ] inventoryCounts.warehouseId (Zeile 3459)
- [ ] inventoryCountBatches.countItemId (Zeile 3510)
- [ ] machineWarehouseAssignments.machineId (Zeile 3534)
- [ ] productDisposalItems.disposalId (Zeile 3679)
- [ ] inventoryTransferItems.transferId (Zeile 3724)

#### Phase 3: MITTEL (Templates & Notifications)
- [ ] recurringOrderItems.productId (Zeile 4063)
- [ ] recurringOrderExecutions.recurringOrderId (Zeile 4107)
- [ ] emailSettings.templateId (Zeile 4407)
- [ ] emailLog.templateId (Zeile 4531)
- [ ] refillTemplates.machineId (Zeile 4611)
- [ ] notificationRecipients.userId (Zeile 4831)

#### Phase 4: NIEDRIG (Audit & Navigation)
- [ ] navigationIssues.sessionId (Zeile 5196)
- [ ] touchTargetMetrics.sessionId (Zeile 5229)
- [ ] scrollabilityTests.sessionId (Zeile 5256)
- [ ] navigationFixes.issueId (Zeile 5283)

## Ausführungsplan

### Schritt 1: Vorbereitung
- Datenbankverbindung prüfen
- Aktuellen Index-Status dokumentieren
- SQL-Skript erstellen

### Schritt 2: Phase 1 ausführen (10 kritische Indizes)
- CONCURRENTLY erstellen (kein Locking)
- Nach jedem Index: Validierung
- Bei Fehler: Rollback-Plan

### Schritt 3: Phase 2 ausführen (7 wichtige Indizes)
- Wie Phase 1

### Schritt 4: Schema aktualisieren
- shared/schema.ts anpassen mit neuen Index-Definitionen
- Drizzle-Kit sync prüfen

### Schritt 5: Validierung
- pg_indexes abfragen
- Index-Größen prüfen
- EXPLAIN ANALYZE auf kritische Queries

### Schritt 6: Commit & Push
- Git commit mit detaillierter Message
- Push zu Branch

## Erwartete Performance-Verbesserung
- JOINs mit machines: **50-100x schneller**
- JOINs mit products: **50-100x schneller**
- Inventory-Queries: **20-50x schneller**
- Audit-Queries: **10-20x schneller**

## Rollback-Plan
Falls Probleme auftreten:
```sql
-- Indizes können jederzeit gelöscht werden
DROP INDEX CONCURRENTLY IF EXISTS idx_transaction_gaps_machine_id;
-- Wiederhole für alle erstellten Indizes
```

## Zeitschätzung
- Vorbereitung: 10 min
- Phase 1: 20 min (10 Indizes x 2 min)
- Phase 2: 15 min (7 Indizes x 2 min)
- Phase 3+4: 15 min
- Schema-Update: 30 min
- Validierung: 10 min
- **TOTAL: ~90 Minuten**
