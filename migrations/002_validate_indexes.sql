-- 002_validate_indexes.sql
-- Validation script for migration 002_add_missing_fk_indexes
-- Run this after migration to verify all indexes were created successfully

-- =====================================================
-- INDEX EXISTENCE CHECKS
-- =====================================================

-- Check if all 27 indexes exist
DO $$
DECLARE
  expected_indexes TEXT[] := ARRAY[
    'idx_transaction_gaps_machine_id',
    'idx_recovery_jobs_machine_id',
    'idx_sync_health_logs_machine_id',
    'idx_events_machine_id',
    'idx_machine_stocks_machine_id',
    'idx_machine_daily_stats_machine_id',
    'idx_products_created_by',
    'idx_eco_impacts_product_id',
    'idx_user_eco_choices_product_id',
    'idx_refill_recommendations_machine_id',
    'idx_product_batches_created_by',
    'idx_inventory_counts_warehouse_id',
    'idx_inventory_count_batches_count_item_id',
    'idx_machine_warehouse_assignments_machine_id',
    'idx_product_disposal_items_disposal_id',
    'idx_inventory_transfer_items_transfer_id',
    'idx_recurring_order_items_product_id',
    'idx_recurring_order_executions_recurring_order_id',
    'idx_email_settings_template_id',
    'idx_email_log_template_id',
    'idx_refill_templates_machine_id',
    'idx_notification_recipients_user_id',
    'idx_navigation_issues_session_id',
    'idx_touch_target_metrics_session_id',
    'idx_scrollability_tests_session_id',
    'idx_navigation_fixes_issue_id'
  ];
  idx_name TEXT;
  missing_count INTEGER := 0;
  found_count INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATING INDEX CREATION';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Note: data_quality_metrics.machine_id was skipped (composite index exists)';
  RAISE NOTICE 'Expected indexes: 26 (not 27)';

  FOREACH idx_name IN ARRAY expected_indexes
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = idx_name
      AND schemaname = 'public'
    ) THEN
      found_count := found_count + 1;
      RAISE NOTICE '✅ Index exists: %', idx_name;
    ELSE
      missing_count := missing_count + 1;
      RAISE WARNING '❌ Index missing: %', idx_name;
    END IF;
  END LOOP;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION SUMMARY';
  RAISE NOTICE 'Expected indexes: 26';
  RAISE NOTICE 'Found indexes: %', found_count;
  RAISE NOTICE 'Missing indexes: %', missing_count;
  RAISE NOTICE '================================================';

  IF missing_count = 0 THEN
    RAISE NOTICE '✅ SUCCESS: All indexes created successfully!';
  ELSE
    RAISE WARNING '⚠️  WARNING: % indexes are missing. Check migration log.', missing_count;
  END IF;
END$$;

-- =====================================================
-- INDEX SIZE AND HEALTH REPORT
-- =====================================================

SELECT
  '=== INDEX SIZE REPORT ===' as report_section;

SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE indexname LIKE 'idx_%_machine_id'
   OR indexname LIKE 'idx_%_product_id'
   OR indexname LIKE 'idx_%_created_by'
   OR indexname LIKE 'idx_%_warehouse_id'
   OR indexname LIKE 'idx_%_disposal_id'
   OR indexname LIKE 'idx_%_transfer_id'
   OR indexname LIKE 'idx_%_template_id'
   OR indexname LIKE 'idx_%_user_id'
   OR indexname LIKE 'idx_%_session_id'
   OR indexname LIKE 'idx_%_issue_id'
   OR indexname LIKE 'idx_%_count_item_id'
   OR indexname LIKE 'idx_%_recurring_order_id'
ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================
-- TABLE COVERAGE ANALYSIS
-- =====================================================

SELECT
  '=== TABLES WITH NEW INDEXES ===' as report_section;

SELECT DISTINCT
  tablename,
  COUNT(*) as new_indexes_count
FROM pg_indexes
WHERE indexname LIKE 'idx_%_id'
  AND schemaname = 'public'
  AND indexdef LIKE '%CONCURRENTLY%' -- Likely created by our migration
GROUP BY tablename
ORDER BY new_indexes_count DESC;

-- =====================================================
-- FOREIGN KEY COVERAGE CHECK
-- =====================================================

SELECT
  '=== FOREIGN KEY COVERAGE ===' as report_section;

-- Find FKs that still lack indexes (should be minimal after migration)
WITH fk_columns AS (
  SELECT
    tc.table_name,
    kcu.column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
),
indexed_columns AS (
  SELECT
    t.relname AS table_name,
    a.attname AS column_name
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  JOIN pg_class t ON t.oid = i.indrelid
  WHERE t.relkind = 'r'
    AND a.attnum > 0
)
SELECT
  fk.table_name,
  fk.column_name,
  CASE
    WHEN ic.column_name IS NOT NULL THEN '✅ Indexed'
    ELSE '❌ Not indexed'
  END as index_status
FROM fk_columns fk
LEFT JOIN indexed_columns ic
  ON fk.table_name = ic.table_name
  AND fk.column_name = ic.column_name
WHERE fk.column_name LIKE '%_id'
ORDER BY
  CASE WHEN ic.column_name IS NULL THEN 0 ELSE 1 END,
  fk.table_name;

-- =====================================================
-- PERFORMANCE BASELINE FOR FUTURE COMPARISON
-- =====================================================

SELECT
  '=== PERFORMANCE BASELINE (For Future Comparison) ===' as report_section;

-- Sample query performance check (adjust table names as needed)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT
  m.id,
  COUNT(t.id) as transaction_count
FROM machines m
LEFT JOIN transactions t ON t.machine_id = m.id
WHERE m.id IN (SELECT id FROM machines LIMIT 10)
GROUP BY m.id;

-- =====================================================
-- FINAL VALIDATION SUMMARY
-- =====================================================

DO $$
DECLARE
  total_indexes INTEGER;
  total_size BIGINT;
BEGIN
  SELECT COUNT(*), SUM(pg_relation_size(indexrelid))
  INTO total_indexes, total_size
  FROM pg_indexes pi
  JOIN pg_class pc ON pc.relname = pi.indexname
  WHERE pi.indexname LIKE 'idx_%_id'
    AND pi.schemaname = 'public';

  RAISE NOTICE '================================================';
  RAISE NOTICE 'FINAL VALIDATION REPORT';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total FK indexes in database: %', total_indexes;
  RAISE NOTICE 'Total FK index size: % MB', total_size / 1024 / 1024;
  RAISE NOTICE 'Migration 002 indexes: 26 expected';
  RAISE NOTICE 'Note: data_quality_metrics.machine_id skipped (composite exists)';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Monitor query performance with EXPLAIN ANALYZE';
  RAISE NOTICE '2. Check pg_stat_user_indexes after 24h for usage stats';
  RAISE NOTICE '3. Consider vacuuming tables if needed: VACUUM ANALYZE';
  RAISE NOTICE '================================================';
END$$;
