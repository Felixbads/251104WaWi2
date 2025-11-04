-- 001_validate_product_id_data.sql
-- CRITICAL: Data Validation for transactions.product_id Type Conversion
-- This script MUST be run BEFORE attempting any type conversion!
--
-- Purpose: Identify data quality issues that would prevent TEXT → INTEGER conversion
-- Risk: READ-ONLY script, safe to run on production
-- Duration: ~2-5 minutes depending on transaction table size

-- =====================================================
-- PHASE 1: BASIC DATA ANALYSIS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'DATA VALIDATION: transactions.product_id';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Timestamp: %', NOW();
  RAISE NOTICE 'Purpose: Validate data before TEXT → INTEGER conversion';
  RAISE NOTICE '================================================';
END$$;

-- Check 1: Row Counts
SELECT
  '=== CHECK 1: ROW COUNTS ===' as check_section;

SELECT
  COUNT(*) as total_rows,
  COUNT(product_id) as rows_with_product_id,
  COUNT(*) - COUNT(product_id) as rows_with_null_product_id,
  ROUND(100.0 * COUNT(product_id) / NULLIF(COUNT(*), 0), 2) as percentage_filled
FROM transactions;

-- =====================================================
-- PHASE 2: DATA TYPE VALIDATION
-- =====================================================

-- Check 2: Non-Numeric Values
SELECT
  '=== CHECK 2: NON-NUMERIC VALUES ===' as check_section;

SELECT
  product_id,
  COUNT(*) as occurrence_count,
  'NON-NUMERIC' as issue_type
FROM transactions
WHERE product_id IS NOT NULL
  AND product_id !~ '^\d+$'  -- Regex: Not only digits
GROUP BY product_id
ORDER BY COUNT(*) DESC
LIMIT 20;

-- Count total non-numeric
SELECT
  COUNT(*) as total_non_numeric_rows,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM transactions WHERE product_id IS NOT NULL), 0), 2) as percentage
FROM transactions
WHERE product_id IS NOT NULL
  AND product_id !~ '^\d+$';

-- =====================================================
-- PHASE 3: REFERENTIAL INTEGRITY CHECK
-- =====================================================

-- Check 3: Orphaned Records (product_id not in products table)
SELECT
  '=== CHECK 3: ORPHANED RECORDS ===' as check_section;

WITH orphaned AS (
  SELECT
    t.product_id,
    COUNT(*) as transaction_count
  FROM transactions t
  WHERE t.product_id IS NOT NULL
    AND t.product_id ~ '^\d+$'  -- Only check numeric values
    AND NOT EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = t.product_id::integer
    )
  GROUP BY t.product_id
)
SELECT
  product_id,
  transaction_count,
  'ORPHANED - Product not found' as issue_type
FROM orphaned
ORDER BY transaction_count DESC
LIMIT 20;

-- Total orphaned count
SELECT
  COUNT(DISTINCT t.product_id) as unique_orphaned_product_ids,
  COUNT(*) as total_orphaned_rows,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM transactions WHERE product_id IS NOT NULL), 0), 2) as percentage
FROM transactions t
WHERE t.product_id IS NOT NULL
  AND t.product_id ~ '^\d+$'
  AND NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = t.product_id::integer
  );

-- =====================================================
-- PHASE 4: VALUE RANGE ANALYSIS
-- =====================================================

-- Check 4: Value Range
SELECT
  '=== CHECK 4: VALUE RANGE ANALYSIS ===' as check_section;

-- Transactions product_id range (numeric values only)
SELECT
  'transactions.product_id' as table_column,
  MIN(product_id::integer) as min_value,
  MAX(product_id::integer) as max_value,
  COUNT(DISTINCT product_id) as unique_values,
  AVG(product_id::integer) as avg_value
FROM transactions
WHERE product_id IS NOT NULL
  AND product_id ~ '^\d+$';

-- Products id range
SELECT
  'products.id' as table_column,
  MIN(id) as min_value,
  MAX(id) as max_value,
  COUNT(*) as unique_values,
  AVG(id) as avg_value
FROM products;

-- =====================================================
-- PHASE 5: DETAILED PROBLEM SUMMARY
-- =====================================================

SELECT
  '=== PROBLEM SUMMARY ===' as check_section;

WITH stats AS (
  SELECT
    COUNT(*) as total_transactions,
    COUNT(product_id) as non_null_product_ids,
    COUNT(*) FILTER (WHERE product_id !~ '^\d+$') as non_numeric_count,
    COUNT(*) FILTER (
      WHERE product_id ~ '^\d+$'
      AND NOT EXISTS (SELECT 1 FROM products WHERE id = product_id::integer)
    ) as orphaned_count,
    COUNT(*) FILTER (
      WHERE product_id IS NULL
    ) as null_count
  FROM transactions
  WHERE product_id IS NOT NULL OR product_id IS NULL
)
SELECT
  'Total Transactions' as metric,
  total_transactions as count,
  100.0 as percentage
FROM stats

UNION ALL

SELECT
  'Non-NULL product_ids' as metric,
  non_null_product_ids as count,
  ROUND(100.0 * non_null_product_ids / NULLIF(total_transactions, 0), 2) as percentage
FROM stats

UNION ALL

SELECT
  'NULL product_ids' as metric,
  null_count as count,
  ROUND(100.0 * null_count / NULLIF(total_transactions, 0), 2) as percentage
FROM stats

UNION ALL

SELECT
  '❌ NON-NUMERIC product_ids' as metric,
  non_numeric_count as count,
  ROUND(100.0 * non_numeric_count / NULLIF(total_transactions, 0), 2) as percentage
FROM stats

UNION ALL

SELECT
  '❌ ORPHANED product_ids' as metric,
  orphaned_count as count,
  ROUND(100.0 * orphaned_count / NULLIF(total_transactions, 0), 2) as percentage
FROM stats;

-- =====================================================
-- PHASE 6: SAMPLE PROBLEMATIC RECORDS
-- =====================================================

SELECT
  '=== SAMPLE PROBLEMATIC RECORDS ===' as check_section;

-- Sample of non-numeric values
(
  SELECT
    id,
    product_id,
    datetime,
    machine_id,
    'NON-NUMERIC' as issue_type
  FROM transactions
  WHERE product_id !~ '^\d+$'
  LIMIT 10
)
UNION ALL
(
  SELECT
    t.id,
    t.product_id,
    t.datetime,
    t.machine_id,
    'ORPHANED' as issue_type
  FROM transactions t
  WHERE t.product_id ~ '^\d+$'
    AND NOT EXISTS (SELECT 1 FROM products WHERE id = t.product_id::integer)
  LIMIT 10
);

-- =====================================================
-- PHASE 7: MIGRATION STRATEGY RECOMMENDATION
-- =====================================================

DO $$
DECLARE
  total_tx INTEGER;
  non_numeric INTEGER;
  orphaned INTEGER;
  null_count INTEGER;
  strategy TEXT;
BEGIN
  -- Get counts
  SELECT COUNT(*) INTO total_tx FROM transactions;

  SELECT COUNT(*) INTO non_numeric
  FROM transactions
  WHERE product_id IS NOT NULL AND product_id !~ '^\d+$';

  SELECT COUNT(*) INTO orphaned
  FROM transactions
  WHERE product_id IS NOT NULL
    AND product_id ~ '^\d+$'
    AND NOT EXISTS (SELECT 1 FROM products WHERE id = product_id::integer);

  SELECT COUNT(*) INTO null_count
  FROM transactions
  WHERE product_id IS NULL;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION STRATEGY RECOMMENDATION';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Total transactions: %', total_tx;
  RAISE NOTICE 'NULL product_ids: %', null_count;
  RAISE NOTICE 'Non-numeric product_ids: %', non_numeric;
  RAISE NOTICE 'Orphaned product_ids: %', orphaned;
  RAISE NOTICE '================================================';

  -- Determine strategy
  IF non_numeric = 0 AND orphaned = 0 THEN
    strategy := '✅ STRATEGY 1: Direct Conversion (BEST CASE)';
    RAISE NOTICE '%', strategy;
    RAISE NOTICE 'All data is valid. Safe to proceed with direct conversion.';
    RAISE NOTICE 'Next step: Run migrations/001_type_conversion_strategy1.sql';
  ELSIF non_numeric = 0 AND orphaned > 0 AND orphaned < 100 THEN
    strategy := '⚠️  STRATEGY 2: Clean Orphaned Records First';
    RAISE NOTICE '%', strategy;
    RAISE NOTICE 'Found % orphaned records (< 100).', orphaned;
    RAISE NOTICE 'Options:';
    RAISE NOTICE '  A) Set orphaned to NULL';
    RAISE NOTICE '  B) Create "Unknown Product" and reassign';
    RAISE NOTICE '  C) Delete orphaned transactions (if acceptable)';
    RAISE NOTICE 'Next step: Decide cleanup approach, then run migration';
  ELSIF non_numeric > 0 AND non_numeric < 100 THEN
    strategy := '⚠️  STRATEGY 3: Clean Non-Numeric Values First';
    RAISE NOTICE '%', strategy;
    RAISE NOTICE 'Found % non-numeric values (< 100).', non_numeric;
    RAISE NOTICE 'Must clean these before conversion.';
    RAISE NOTICE 'Next step: Review non-numeric values, decide cleanup';
  ELSIF (non_numeric + orphaned) > 100 THEN
    strategy := '❌ STRATEGY 4: Major Data Cleanup Required';
    RAISE NOTICE '%', strategy;
    RAISE NOTICE 'Significant data quality issues found.';
    RAISE NOTICE 'Non-numeric: %, Orphaned: %', non_numeric, orphaned;
    RAISE NOTICE 'Required steps:';
    RAISE NOTICE '  1. Investigate root cause of bad data';
    RAISE NOTICE '  2. Create backup: product_id_backup column';
    RAISE NOTICE '  3. Bulk cleanup script';
    RAISE NOTICE '  4. Validate cleaned data';
    RAISE NOTICE '  5. Then proceed with conversion';
    RAISE NOTICE '⚠️  DO NOT PROCEED without team review!';
  ELSE
    strategy := '⚠️  MIXED ISSUES - Custom Strategy Needed';
    RAISE NOTICE '%', strategy;
  END IF;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION COMPLETE';
  RAISE NOTICE 'Review results above before proceeding!';
  RAISE NOTICE '================================================';
END$$;
