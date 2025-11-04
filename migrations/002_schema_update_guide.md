# Schema Update Guide: Adding Missing FK Indexes to shared/schema.ts

## Overview
Nach der SQL-Migration müssen die Index-Definitionen auch in `shared/schema.ts` hinzugefügt werden, damit Drizzle ORM die Indizes kennt und bei zukünftigen Migrations berücksichtigt.

## Drizzle Index-Syntax
```typescript
(table) => ({
  indexName: index("index_name").on(table.columnName),
})
```

## Erforderliche Änderungen pro Tabelle

### 1. transactionGaps (Zeile ~462-470)
**Aktuell:** Keine Index-Definition
**Neu hinzufügen:**
```typescript
export const transactionGaps = pgTable("transaction_gaps", {
  // ... existing columns ...
}, (table) => ({
  machineIdIdx: index("idx_transaction_gaps_machine_id").on(table.machineId),
}));
```

### 2. recoveryJobs (Zeile ~502-560)
**Neu hinzufügen:**
```typescript
export const recoveryJobs = pgTable("recovery_jobs", {
  // ... existing columns ...
}, (table) => ({
  machineIdIdx: index("idx_recovery_jobs_machine_id").on(table.machineId),
}));
```

### 3. syncHealthLogs (Zeile ~562-607)
**Neu hinzufügen:**
```typescript
export const syncHealthLogs = pgTable("sync_health_logs", {
  // ... existing columns ...
}, (table) => ({
  machineIdIdx: index("idx_sync_health_logs_machine_id").on(table.machineId),
}));
```

### 4. products (Zeile ~872-964)
**Aktuell:** Keine Indizes
**Neu hinzufügen:**
```typescript
export const products = pgTable("products", {
  // ... existing columns ...
}, (table) => ({
  createdByIdx: index("idx_products_created_by").on(table.createdBy),
}));
```

### 5. ecoImpacts (Zeile ~966-1015)
**Neu hinzufügen:**
```typescript
export const ecoImpacts = pgTable("eco_impacts", {
  // ... existing columns ...
}, (table) => ({
  productIdIdx: index("idx_eco_impacts_product_id").on(table.productId),
}));
```

### 6. userEcoChoices (Zeile ~1017-1048)
**Neu hinzufügen:**
```typescript
export const userEcoChoices = pgTable("user_eco_choices", {
  // ... existing columns ...
}, (table) => ({
  productIdIdx: index("idx_user_eco_choices_product_id").on(table.productId),
}));
```

### 7. events (Zeile ~1312-1397)
**Aktuell:** Hat bereits unique constraints
**Neu hinzufügen zu bestehendem index-Block:**
```typescript
export const events = pgTable("events", {
  // ... existing columns ...
}, (table) => ({
  vendonIdx: unique().on(table.vendonId),
  machineEventIdx: unique().on(table.vendonMachineId, table.eventDatetime),
  // NEU:
  machineIdIdx: index("idx_events_machine_id").on(table.machineId),
}));
```

### 8. machineStocks (Zeile ~1439-1479)
**Aktuell:** Hat unique constraint
**Neu hinzufügen:**
```typescript
export const machineStocks = pgTable("machine_stocks", {
  // ... existing columns ...
}, (table) => ({
  stockUniqueIdx: unique().on(table.machineId, table.productVendonId, table.selectionNumber),
  // NEU:
  machineIdIdx: index("idx_machine_stocks_machine_id").on(table.machineId),
}));
```

### 9. machineDailyStats (Zeile ~1481-1550)
**Aktuell:** Hat unique constraint
**Neu hinzufügen:**
```typescript
export const machineDailyStats = pgTable("machine_daily_stats", {
  // ... existing columns ...
}, (table) => ({
  machineStatusUniqueIdx: unique().on(table.machineId, table.date),
  // NEU:
  machineIdIdx: index("idx_machine_daily_stats_machine_id").on(table.machineId),
}));
```

### 10. refillRecommendations (Zeile ~1862-1899)
**Neu hinzufügen:**
```typescript
export const refillRecommendations = pgTable("refill_recommendations", {
  // ... existing columns ...
}, (table) => ({
  machineIdIdx: index("idx_refill_recommendations_machine_id").on(table.machineId),
}));
```

### 11. productBatches (Zeile ~3184-3252)
**Aktuell:** Hat bereits 5 Indizes
**Neu hinzufügen zu bestehendem index-Block:**
```typescript
export const productBatches = pgTable("product_batches", {
  // ... existing columns ...
}, (table) => ({
  // ... existing indexes ...
  productBatchesFifoIdx: index(...),
  // NEU:
  createdByIdx: index("idx_product_batches_created_by").on(table.createdBy),
}));
```

### 12. inventoryCounts (Zeile ~3457-3479)
**Neu hinzufügen:**
```typescript
export const inventoryCounts = pgTable("inventory_counts", {
  // ... existing columns ...
}, (table) => ({
  warehouseIdIdx: index("idx_inventory_counts_warehouse_id").on(table.warehouseId),
}));
```

### 13. inventoryCountBatches (Zeile ~3508-3530)
**Neu hinzufügen:**
```typescript
export const inventoryCountBatches = pgTable("inventory_count_batches", {
  // ... existing columns ...
}, (table) => ({
  countItemIdIdx: index("idx_inventory_count_batches_count_item_id").on(table.countItemId),
}));
```

### 14. machineWarehouseAssignments (Zeile ~3532-3661)
**Aktuell:** Hat unique constraint
**Neu hinzufügen:**
```typescript
export const machineWarehouseAssignments = pgTable("machine_warehouse_assignments", {
  // ... existing columns ...
}, (table) => ({
  machineWarehouseUniqueIdx: unique().on(table.machineId, table.warehouseId),
  // NEU:
  machineIdIdx: index("idx_machine_warehouse_assignments_machine_id").on(table.machineId),
}));
```

### 15. productDisposalItems (Zeile ~3677-3707)
**Neu hinzufügen:**
```typescript
export const productDisposalItems = pgTable("product_disposal_items", {
  // ... existing columns ...
}, (table) => ({
  disposalIdIdx: index("idx_product_disposal_items_disposal_id").on(table.disposalId),
}));
```

### 16. inventoryTransferItems (Zeile ~3722-3854)
**Neu hinzufügen:**
```typescript
export const inventoryTransferItems = pgTable("inventory_transfer_items", {
  // ... existing columns ...
}, (table) => ({
  transferIdIdx: index("idx_inventory_transfer_items_transfer_id").on(table.transferId),
}));
```

### 17. recurringOrderItems (Zeile ~4061-4103)
**Neu hinzufügen:**
```typescript
export const recurringOrderItems = pgTable("recurring_order_items", {
  // ... existing columns ...
}, (table) => ({
  productIdIdx: index("idx_recurring_order_items_product_id").on(table.productId),
}));
```

### 18. recurringOrderExecutions (Zeile ~4105-4167)
**Neu hinzufügen:**
```typescript
export const recurringOrderExecutions = pgTable("recurring_order_executions", {
  // ... existing columns ...
}, (table) => ({
  recurringOrderIdIdx: index("idx_recurring_order_executions_recurring_order_id").on(table.recurringOrderId),
}));
```

### 19. emailSettings (Zeile ~4405-4454)
**Neu hinzufügen:**
```typescript
export const emailSettings = pgTable("email_settings", {
  // ... existing columns ...
}, (table) => ({
  templateIdIdx: index("idx_email_settings_template_id").on(table.templateId),
}));
```

### 20. emailLog (Zeile ~4529-4607)
**Neu hinzufügen:**
```typescript
export const emailLog = pgTable("email_log", {
  // ... existing columns ...
}, (table) => ({
  templateIdIdx: index("idx_email_log_template_id").on(table.templateId),
}));
```

### 21. refillTemplates (Zeile ~4609-4623)
**Neu hinzufügen:**
```typescript
export const refillTemplates = pgTable("refill_templates", {
  // ... existing columns ...
}, (table) => ({
  machineIdIdx: index("idx_refill_templates_machine_id").on(table.machineId),
}));
```

### 22. notificationRecipients (Zeile ~4829-4867)
**Aktuell:** Hat bereits 2 Indizes
**Neu hinzufügen zu bestehendem index-Block:**
```typescript
export const notificationRecipients = pgTable("notification_recipients", {
  // ... existing columns ...
}, (table) => ({
  // ... existing indexes ...
  emailIdx: index().on(table.email),
  activeIdx: index().on(table.active),
  // NEU:
  userIdIdx: index("idx_notification_recipients_user_id").on(table.userId),
}));
```

### 23-26. Navigation Audit Tables (Zeile ~5165-5375)
**navigationIssues, touchTargetMetrics, scrollabilityTests, navigationFixes:**
```typescript
export const navigationIssues = pgTable("navigation_issues", {
  // ... existing columns ...
}, (table) => ({
  sessionIdIdx: index("idx_navigation_issues_session_id").on(table.sessionId),
}));

export const touchTargetMetrics = pgTable("touch_target_metrics", {
  // ... existing columns ...
}, (table) => ({
  sessionIdIdx: index("idx_touch_target_metrics_session_id").on(table.sessionId),
}));

export const scrollabilityTests = pgTable("scrollability_tests", {
  // ... existing columns ...
}, (table) => ({
  sessionIdIdx: index("idx_scrollability_tests_session_id").on(table.sessionId),
}));

export const navigationFixes = pgTable("navigation_fixes", {
  // ... existing columns ...
}, (table) => ({
  issueIdIdx: index("idx_navigation_fixes_issue_id").on(table.issueId),
}));
```

## Drizzle Kit Sync

Nach dem Aktualisieren von `shared/schema.ts`:

```bash
# 1. Generiere neue Migration
npm run db:push

# 2. Oder prüfe Diff
npx drizzle-kit generate

# 3. Bei Konflikten: SQL-Migration wurde bereits manuell ausgeführt
#    Drizzle sollte die Indizes erkennen und nichts ändern wollen
```

## Validation

Nach Schema-Update prüfen:
```bash
# TypeScript Compile Check
npm run check

# Schema-Konsistenz-Check
npx drizzle-kit check
```

## Wichtig

⚠️ **Reihenfolge beachten:**
1. **ERST** SQL-Migration ausführen (002_add_missing_fk_indexes.sql)
2. **DANN** Schema aktualisieren (shared/schema.ts)
3. **DANACH** Validierung (002_validate_indexes.sql)

Dies verhindert, dass Drizzle Kit versucht, die Indizes erneut zu erstellen.

## Automatisierung

Für zukünftige Migrations sollte ein Check implementiert werden:
- Jede FK-Spalte sollte automatisch einen Index erhalten
- Warnung ausgeben, wenn FK ohne Index definiert wird
- Pre-commit Hook für Schema-Validierung
