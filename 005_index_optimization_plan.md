# Measure #5 (REVISED): Index Usage Monitoring & Optimization Plan

## ⚠️ IMPORTANT: This is a REVISED version of Measure #5

**Original Plan**: Identify and remove redundant indexes
**Revised Plan**: Monitor index usage, remove only proven unused indexes
**Reason**: Only 2-4 redundant indexes found; data-driven approach is safer

---

## 🎯 Objective

Monitor index usage over time and remove only indexes that are proven to be unused, reducing storage and write overhead while maintaining query performance.

---

## 📊 Current State Analysis

### Index Count
- **Explicit Indexes**: ~70 (defined in schema.ts)
- **Implicit Indexes**: ~106 (primary keys + unique constraints)
- **Total Estimated**: ~176 indexes

### Redundancy Analysis Results
- **Potentially Redundant**: 2-4 indexes (3-6%)
- **Estimated Storage**: 4-10 MB (minimal)
- **Performance Impact**: 0.1-0.5% faster writes (negligible)

### Conclusion
❌ **Removing blindly is not worth the risk**
✅ **Monitoring approach provides data-driven decisions**

---

## 🎯 Strategy: Monitor, Analyze, Optimize

### Phase 1: Monitoring Setup (Identify Usage)

Enable PostgreSQL statistics collection to track index usage over time.

### Phase 2: Analysis (Identify Unused)

After 4+ weeks, analyze which indexes have never been used.

### Phase 3: Careful Removal (Optimize)

Remove only indexes with zero usage AND after validating no queries need them.

---

## 🚀 Implementation Plan

### Phase 1: Monitoring Setup (1-2 hours)

#### Step 1.1: Enable pg_stat_statements Extension

```sql
-- migrations/005a_enable_monitoring.sql

-- Enable query statistics extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify extension is active
SELECT * FROM pg_available_extensions WHERE name = 'pg_stat_statements';

-- Configure (if not already in postgresql.conf)
-- Add to postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.track = all
-- pg_stat_statements.max = 10000
```

**Note**: Enabling `pg_stat_statements` may require PostgreSQL restart.

#### Step 1.2: Create Monitoring Views

```sql
-- migrations/005b_create_monitoring_views.sql

-- View 1: Index Usage Statistics
CREATE OR REPLACE VIEW v_index_usage AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,  -- Number of index scans (times index was used)
  idx_tup_read,  -- Tuples read from index
  idx_tup_fetch,  -- Tuples fetched (actual rows returned)
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  pg_relation_size(indexrelid) as index_size_bytes,
  -- Calculate usage efficiency
  CASE
    WHEN idx_scan = 0 THEN 0
    ELSE ROUND((idx_tup_fetch::numeric / idx_tup_read) * 100, 2)
  END as fetch_efficiency_percent
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

COMMENT ON VIEW v_index_usage IS 'Index usage statistics with size and efficiency metrics';

-- View 2: Unused Indexes (RED FLAG)
CREATE OR REPLACE VIEW v_unused_indexes AS
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as wasted_space,
  pg_relation_size(indexrelid) as wasted_bytes,
  indexdef
FROM pg_stat_user_indexes
JOIN pg_indexes USING (schemaname, tablename, indexname)
WHERE schemaname = 'public'
  AND idx_scan = 0  -- Never used!
  AND indexname NOT LIKE '%_pkey'  -- Exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;

COMMENT ON VIEW v_unused_indexes IS 'Indexes that have never been used (removal candidates)';

-- View 3: Low-Usage Indexes (WARNING)
CREATE OR REPLACE VIEW v_low_usage_indexes AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  indexdef
FROM pg_stat_user_indexes
JOIN pg_indexes USING (schemaname, tablename, indexname)
WHERE schemaname = 'public'
  AND idx_scan < 100  -- Used less than 100 times
  AND idx_scan > 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

COMMENT ON VIEW v_low_usage_indexes IS 'Indexes with low usage (monitor for potential removal)';

-- View 4: Duplicate/Overlapping Indexes
CREATE OR REPLACE VIEW v_duplicate_indexes AS
SELECT
  pg_size_pretty(SUM(pg_relation_size(idx))::bigint) as total_size,
  (array_agg(idx))[1] as idx1,
  (array_agg(idx))[2] as idx2,
  (array_agg(idx))[3] as idx3,
  (array_agg(idx))[4] as idx4
FROM (
  SELECT
    indexrelid::regclass as idx,
    (indrelid::text || '-' || indclass::text || '-' || indkey::text || '-' ||
     COALESCE(indexprs::text, '') || '-' || COALESCE(indpred::text, '')) as key
  FROM pg_index
) sub
GROUP BY key
HAVING COUNT(*) > 1;

COMMENT ON VIEW v_duplicate_indexes IS 'Indexes with identical definitions (true duplicates)';
```

#### Step 1.3: Create Monitoring Script

```bash
#!/bin/bash
# scripts/monitor_indexes.sh

# Weekly index usage report

DB_URL="${DATABASE_URL}"
REPORT_DIR="./reports/index_usage"
REPORT_FILE="$REPORT_DIR/index_report_$(date +%Y%m%d).md"

mkdir -p "$REPORT_DIR"

cat > "$REPORT_FILE" <<'EOF'
# Index Usage Report
Generated: $(date +"%Y-%m-%d %H:%M:%S")

## Unused Indexes (Removal Candidates)
EOF

psql "$DB_URL" -c "SELECT * FROM v_unused_indexes;" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" <<'EOF'

## Low Usage Indexes (Monitor)
EOF

psql "$DB_URL" -c "SELECT * FROM v_low_usage_indexes LIMIT 20;" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" <<'EOF'

## Top 10 Most Used Indexes
EOF

psql "$DB_URL" -c "
SELECT schemaname, tablename, indexname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 10;
" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" <<'EOF'

## Storage Summary
EOF

psql "$DB_URL" -c "
SELECT
  COUNT(*) as total_indexes,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size,
  pg_size_pretty(AVG(pg_relation_size(indexrelid))::bigint) as avg_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public';
" >> "$REPORT_FILE"

echo "Report saved to: $REPORT_FILE"
```

```bash
# Make script executable
chmod +x scripts/monitor_indexes.sh

# Add to cron (weekly on Sunday at 2 AM)
# crontab -e
# 0 2 * * 0 /path/to/scripts/monitor_indexes.sh
```

### Phase 2: Monitoring Period (4+ weeks)

**Duration**: Minimum 4 weeks, ideally 8-12 weeks
**Reason**: Capture seasonal patterns, monthly reports, quarterly operations

**Weekly Tasks**:
1. Run monitoring script: `./scripts/monitor_indexes.sh`
2. Review report for any concerning patterns
3. Document any known query changes

**What to Track**:
- Indexes with `idx_scan = 0` (unused)
- Indexes with `idx_scan < 100` (low usage)
- Large indexes with low usage (high cost, low benefit)
- Query performance metrics (via application monitoring)

### Phase 3: Analysis (2-4 hours)

After monitoring period, analyze results:

#### Step 3.1: Identify Truly Unused Indexes

```sql
-- Query: Indexes unused for entire monitoring period
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,  -- Should be 0
  pg_size_pretty(pg_relation_size(indexrelid)) as wasted_space,
  indexdef
FROM pg_stat_user_indexes
JOIN pg_indexes USING (schemaname, tablename, indexname)
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'  -- Keep primary keys
  AND indexname NOT LIKE '%_unique%'  -- Keep unique constraints (data integrity)
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Expected Results** (based on analysis):
- 0-5 truly unused indexes
- 2-10 MB total wasted space
- Mostly indexes on rarely-accessed tables

#### Step 3.2: Cross-Check with Application Code

For each unused index, search codebase for queries using that column:

```bash
# Example: Check if any queries use inventory_items.reorder_point
grep -r "reorder_point" server/ client/ --include="*.ts" --include="*.tsx"

# Check schema for index definition
grep "inventoryItemsReorderIdx" shared/schema.ts
```

**Decision Matrix**:

| idx_scan | Size | Code References | Decision |
|----------|------|-----------------|----------|
| 0 | Large (> 5MB) | None | ✅ REMOVE |
| 0 | Medium (1-5MB) | None | ✅ REMOVE |
| 0 | Small (< 1MB) | None | ⚠️ REMOVE (low priority) |
| 0 | Any | Found in code | ⚠️ INVESTIGATE (might be future feature) |
| < 100 | Large | Few | ⚠️ MONITOR (might be batch query) |
| > 100 | Any | Many | ✅ KEEP |

#### Step 3.3: Validate Removal Candidates

For each index to remove:

1. **Check if it's the only index on that column**
   ```sql
   -- Example: Check indexes on inventory_items.reorder_point
   SELECT
     indexname,
     indexdef
   FROM pg_indexes
   WHERE tablename = 'inventory_items'
     AND indexdef LIKE '%reorder_point%';
   ```

2. **Check if column is used in WHERE/ORDER BY/JOIN**
   ```sql
   -- Use pg_stat_statements to find queries using column
   SELECT
     query,
     calls,
     total_exec_time
   FROM pg_stat_statements
   WHERE query LIKE '%inventory_items%'
     AND query LIKE '%reorder_point%'
   ORDER BY calls DESC
   LIMIT 10;
   ```

3. **Estimate removal impact**
   - Storage savings: `SELECT pg_size_pretty(pg_relation_size('index_name'));`
   - Write performance gain: ~0.1% per index (minimal)
   - Read performance risk: Query might slow down if it needed this index

### Phase 4: Careful Removal (2-3 hours)

#### Step 4.1: Create Removal Migration

```sql
-- migrations/005c_remove_unused_indexes.sql

-- ⚠️  IMPORTANT: Only run after 4+ weeks monitoring
-- ⚠️  IMPORTANT: Only include indexes with idx_scan = 0
-- ⚠️  IMPORTANT: Save index definitions for easy rollback

-- Example removals (ADJUST BASED ON YOUR ANALYSIS):

-- Index 1: orders.supplier_id (IF composite index sufficient)
-- DROP INDEX IF EXISTS orders_supplier_id_idx;
-- Rollback: CREATE INDEX orders_supplier_id_idx ON orders(supplier_id);

-- Index 2: orders.warehouse_id (IF composite index sufficient)
-- DROP INDEX IF EXISTS orders_warehouse_id_idx;
-- Rollback: CREATE INDEX orders_warehouse_id_idx ON orders(location_id);

-- TEMPLATE for each removal:
-- DROP INDEX IF EXISTS <index_name>;
-- COMMENT: Reason for removal: <idx_scan = 0 for 8 weeks, no code references>
-- ROLLBACK: CREATE INDEX <index_name> ON <table>(<columns>);
```

**CRITICAL**: Save index definitions for rollback!

```sql
-- Save index definitions before removal
CREATE TABLE IF NOT EXISTS removed_indexes_backup (
  id SERIAL PRIMARY KEY,
  removed_at TIMESTAMP DEFAULT NOW(),
  indexname TEXT NOT NULL,
  tablename TEXT NOT NULL,
  indexdef TEXT NOT NULL,
  reason TEXT
);

-- Before dropping, save definition
INSERT INTO removed_indexes_backup (indexname, tablename, indexdef, reason)
SELECT
  indexname,
  tablename,
  indexdef,
  'Unused for 8 weeks, idx_scan = 0'
FROM pg_indexes
WHERE indexname IN (
  'orders_supplier_id_idx',
  'orders_warehouse_id_idx'
  -- ... list all indexes to remove
);

-- Then drop indexes
DROP INDEX IF EXISTS orders_supplier_id_idx;
DROP INDEX IF EXISTS orders_warehouse_id_idx;
```

#### Step 4.2: Test on Staging

```bash
# Apply removal migration on staging
psql $STAGING_DB -f migrations/005c_remove_unused_indexes.sql

# Run application test suite
npm run test

# Run performance benchmarks
npm run benchmark

# Monitor query performance for 24-48 hours
# Check for slow query alerts
```

**Red Flags** (rollback if seen):
- ❌ Query timeout errors
- ❌ Significant increase in query execution time (> 20%)
- ❌ Application errors related to database queries

#### Step 4.3: Deploy to Production

```bash
# Create backup
pg_dump $DATABASE_URL > backup_before_005_$(date +%Y%m%d).sql

# Apply migration during off-peak
psql $DATABASE_URL -f migrations/005c_remove_unused_indexes.sql

# Monitor query performance for 1 week
# Check pg_stat_statements for slow queries
```

#### Step 4.4: Post-Removal Monitoring

```sql
-- Check for slow queries after index removal
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%<table_name>%'
  AND mean_exec_time > 100  -- Queries slower than 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Compare with pre-removal baseline
-- If queries significantly slower, consider rollback
```

### Phase 5: Rollback (If Needed)

```sql
-- migrations/005c_remove_unused_indexes_rollback.sql

-- Restore removed indexes from backup table
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT indexdef
    FROM removed_indexes_backup
    WHERE removed_at > NOW() - INTERVAL '7 days'
  LOOP
    EXECUTE r.indexdef;
    RAISE NOTICE 'Restored: %', r.indexdef;
  END LOOP;
END$$;

-- Or manual rollback:
-- CREATE INDEX orders_supplier_id_idx ON orders(supplier_id);
-- CREATE INDEX orders_warehouse_id_idx ON orders(location_id);
```

---

## 📊 Expected Results

### Storage Savings
- **Conservative**: 4-10 MB (2-4 indexes)
- **Optimistic**: 10-20 MB (5-10 indexes)
- **Realistic**: 5-15 MB (3-6 indexes)

**Context**: Typical database size 500MB-5GB → 0.1-3% savings

### Performance Impact
- **Write Operations**: 0.1-0.5% faster (fewer indexes to update)
- **Read Operations**: No impact (if analysis correct) or slight regression (if incorrect)
- **Overall**: Negligible impact

### Risks
- ⚠️ **Query Regression**: Removed index might be needed by unforeseen query
- ⚠️ **Seasonal Queries**: Index unused in monitoring period, but needed quarterly
- ⚠️ **Future Features**: Index prepared for planned feature, not yet used

---

## 🎯 Success Criteria

Measure #5 is successful when:

1. ✅ Monitoring enabled (pg_stat_statements active)
2. ✅ Monitoring period completed (4+ weeks)
3. ✅ Analysis shows 0-10 truly unused indexes
4. ✅ Removal candidates validated (no code references)
5. ✅ Staging tests pass after removal
6. ✅ Production performance stable after removal
7. ✅ Storage savings achieved (minor but measurable)
8. ✅ No query regressions detected

---

## ⏱️ Estimated Effort

| Phase | Duration | Effort |
|-------|----------|--------|
| Monitoring Setup | 1-2 hours | 🟢 Low |
| Monitoring Period | 4-12 weeks | 🟢 Low (automated) |
| Analysis | 2-4 hours | 🟡 Medium |
| Removal & Testing | 2-3 hours | 🟡 Medium |
| Post-Removal Monitoring | 1 week | 🟢 Low (monitoring) |
| **TOTAL** | **4-12 weeks** | 🟢 **Low-Medium** |

**Note**: Mostly waiting time (monitoring period), actual work is ~5-9 hours

---

## 🎯 Final Recommendation

**Status**: ⏸️ **DEPRIORITIZE** (or proceed with monitoring approach)

**Reasoning**:

### Why Deprioritize?
1. ⚠️ **Minimal Impact**: 4-10 MB savings (0.1-3% of DB size)
2. ⚠️ **Low ROI**: 9 hours work for minimal gain
3. ⚠️ **Risk > Reward**: Query regression risk not worth small savings
4. ⚠️ **Higher Priorities**: Measures #1-3 have much higher impact
5. ⚠️ **Well-Optimized**: Only 3-6% indexes potentially redundant

### Why Proceed (If You Choose To)?
1. ✅ **Best Practices**: Index usage monitoring is good practice
2. ✅ **Learning**: Understand query patterns better
3. ✅ **Future Optimization**: Identify unused indexes for future
4. ✅ **Low Risk**: Monitoring approach is safe (data-driven)
5. ✅ **Continuous Improvement**: Part of ongoing DB optimization

---

## 📋 Alternative: Quick Win Approach

If you want quick results without full monitoring:

### Step 1: Check for Obvious Duplicates (30 min)

```sql
-- Find duplicate indexes (identical definitions)
SELECT * FROM v_duplicate_indexes;
```

**If found**: Drop one copy (keep one)

### Step 2: Check Current Statistics (30 min)

```sql
-- Check existing usage stats (if pg_stat_user_indexes already tracking)
SELECT * FROM v_unused_indexes;
```

**If found**: Investigate those specific indexes

### Step 3: Manual Analysis of Redundant Pairs (1 hour)

Review these specific candidates identified in analysis:
- `orders.supplierIdIdx` vs `orders.supplierStatusIdx`
- `orders.warehouseIdIdx` vs `orders.warehouseStatusIdx`

**Decision**: Keep both (different query patterns) OR drop single-column index

**Estimated Savings**: 2 indexes = 4-10 MB

---

## 🚀 Quick Start (If Proceeding)

```bash
# 1. Enable monitoring
psql $DATABASE_URL -f migrations/005a_enable_monitoring.sql
psql $DATABASE_URL -f migrations/005b_create_monitoring_views.sql

# 2. Set up weekly monitoring script
./scripts/monitor_indexes.sh

# 3. Wait 4-12 weeks (monitoring period)

# 4. Analyze results
psql $DATABASE_URL -c "SELECT * FROM v_unused_indexes;"

# 5. Create removal migration (based on analysis)
# Edit migrations/005c_remove_unused_indexes.sql

# 6. Test on staging, then deploy to production
```

---

**Prepared by**: Database Architecture Review (Claude Code Agent)
**Date**: 2025-11-04
**Status**: READY FOR REVIEW (Deprioritize recommended)
