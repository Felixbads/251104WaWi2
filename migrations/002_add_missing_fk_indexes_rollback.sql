-- 002_add_missing_fk_indexes_rollback.sql
-- Rollback script for migration 002_add_missing_fk_indexes
-- Use this if the migration causes issues or needs to be reverted
-- SAFE: Dropping indexes does not affect data, only query performance

BEGIN;

DO $$
BEGIN
  RAISE NOTICE 'Starting rollback for migration 002_add_missing_fk_indexes';
  RAISE NOTICE 'Timestamp: %', NOW();
  RAISE NOTICE 'WARNING: This will remove all performance-optimizing indexes.';
  RAISE NOTICE 'Query performance will return to pre-migration state.';
END$$;

COMMIT;

-- =====================================================
-- PHASE 1 ROLLBACK: Critical indexes
-- =====================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_transaction_gaps_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_recovery_jobs_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_sync_health_logs_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_events_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_machine_stocks_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_machine_daily_stats_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_created_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_eco_impacts_product_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_eco_choices_product_id;

DO $$
BEGIN
  RAISE NOTICE 'Phase 1 rollback completed: 10 indexes dropped';
END$$;

-- =====================================================
-- PHASE 2 ROLLBACK: High priority indexes
-- =====================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_refill_recommendations_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_product_batches_created_by;
DROP INDEX CONCURRENTLY IF EXISTS idx_inventory_counts_warehouse_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_inventory_count_batches_count_item_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_machine_warehouse_assignments_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_product_disposal_items_disposal_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_inventory_transfer_items_transfer_id;

DO $$
BEGIN
  RAISE NOTICE 'Phase 2 rollback completed: 7 indexes dropped';
END$$;

-- =====================================================
-- PHASE 3 ROLLBACK: Medium priority indexes
-- =====================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_order_items_product_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_order_executions_recurring_order_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_email_settings_template_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_email_log_template_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_refill_templates_machine_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_notification_recipients_user_id;

DO $$
BEGIN
  RAISE NOTICE 'Phase 3 rollback completed: 6 indexes dropped';
END$$;

-- =====================================================
-- PHASE 4 ROLLBACK: Low priority indexes
-- =====================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_navigation_issues_session_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_touch_target_metrics_session_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_scrollability_tests_session_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_navigation_fixes_issue_id;

DO $$
BEGIN
  RAISE NOTICE 'Phase 4 rollback completed: 4 indexes dropped';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'ROLLBACK COMPLETE';
  RAISE NOTICE 'Total indexes dropped: 27';
  RAISE NOTICE 'System returned to pre-migration state';
  RAISE NOTICE '================================================';
END$$;
