-- 003_validate_cleanup.sql
-- Validation script for Migration 003: Product Duplicate Cleanup
-- Run this after the cleanup migration to verify success
-- Safe to run multiple times (READ-ONLY)

-- =====================================================
-- METADATA
-- =====================================================
SELECT '=== VALIDATION: MIGRATION 003 ===' as validation_section;
SELECT 'Migration: Product Duplicate Cleanup' as migration_name;
SELECT 'Status: READ-ONLY Validation' as safety_status;
SELECT NOW() as validation_timestamp;

-- =====================================================
-- VALIDATION 1: NO DUPLICATES REMAIN
-- =====================================================

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 1: Checking for Remaining Duplicates';
  RAISE NOTICE '================================================';

  -- Count duplicate groups
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT LOWER(TRIM(product_name)) as name
    FROM products
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) sub;

  IF duplicate_count = 0 THEN
    RAISE NOTICE '✅ PASS: No duplicate product names found';
  ELSE
    RAISE WARNING '❌ FAIL: Found % duplicate product name groups!', duplicate_count;
  END IF;

  RAISE NOTICE '';
END$$;

-- List any remaining duplicates (should be empty)
SELECT
  '=== Remaining Duplicates (should be empty) ===' as report_section;

SELECT
  LOWER(TRIM(product_name)) as normalized_name,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY id) as product_ids,
  ARRAY_AGG(product_name ORDER BY id) as product_names
FROM products
GROUP BY LOWER(TRIM(product_name))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- =====================================================
-- VALIDATION 2: UNIQUE CONSTRAINTS EXIST
-- =====================================================

DO $$
DECLARE
  constraint_count INTEGER := 0;
  has_name_constraint BOOLEAN := false;
  has_vendon_constraint BOOLEAN := false;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 2: Checking UNIQUE Constraints';
  RAISE NOTICE '================================================';

  -- Check for unique_product_name_normalized
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products'
      AND indexname = 'unique_product_name_normalized'
  ) INTO has_name_constraint;

  IF has_name_constraint THEN
    RAISE NOTICE '✅ PASS: UNIQUE constraint on product_name exists';
  ELSE
    RAISE WARNING '❌ FAIL: UNIQUE constraint on product_name missing!';
  END IF;

  -- Check for unique_vendon_id_not_null
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products'
      AND indexname = 'unique_vendon_id_not_null'
  ) INTO has_vendon_constraint;

  IF has_vendon_constraint THEN
    RAISE NOTICE '✅ PASS: UNIQUE constraint on vendon_id exists';
  ELSE
    RAISE WARNING '❌ FAIL: UNIQUE constraint on vendon_id missing!';
  END IF;

  RAISE NOTICE '';
END$$;

-- List all indexes on products table
SELECT
  '=== All Indexes on Products Table ===' as report_section;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'products'
  AND schemaname = 'public'
ORDER BY indexname;

-- =====================================================
-- VALIDATION 3: FK INTEGRITY
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 3: Checking FK Integrity';
  RAISE NOTICE '================================================';
END$$;

-- Check for orphaned records in each FK table
-- (These would indicate FK update failures)

SELECT '=== Orphaned FK References (should all be 0) ===' as report_section;

-- order_items
SELECT
  'order_items' as fk_table,
  COUNT(*) as orphaned_count
FROM order_items oi
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = oi.product_id
);

-- inventory_count_items
SELECT
  'inventory_count_items' as fk_table,
  COUNT(*) as orphaned_count
FROM inventory_count_items ici
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = ici.product_id
);

-- inventory_items
SELECT
  'inventory_items' as fk_table,
  COUNT(*) as orphaned_count
FROM inventory_items ii
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = ii.product_id
);

-- inventory_movements
SELECT
  'inventory_movements' as fk_table,
  COUNT(*) as orphaned_count
FROM inventory_movements im
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = im.product_id
);

-- purchase_conditions
SELECT
  'purchase_conditions' as fk_table,
  COUNT(*) as orphaned_count
FROM purchase_conditions pc
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = pc.product_id
);

-- inventory_batches
SELECT
  'inventory_batches' as fk_table,
  COUNT(*) as orphaned_count
FROM inventory_batches ib
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = ib.product_id
);

-- refill_batch_movements
SELECT
  'refill_batch_movements' as fk_table,
  COUNT(*) as orphaned_count
FROM refill_batch_movements rbm
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = rbm.product_id
);

-- product_batches
SELECT
  'product_batches' as fk_table,
  COUNT(*) as orphaned_count
FROM product_batches pb
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = pb.product_id
);

-- product_movements
SELECT
  'product_movements' as fk_table,
  COUNT(*) as orphaned_count
FROM product_movements pm
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = pm.product_id
);

-- Summary validation
DO $$
DECLARE
  total_orphaned INTEGER := 0;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM order_items oi WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = oi.product_id)) +
    (SELECT COUNT(*) FROM inventory_count_items ici WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ici.product_id)) +
    (SELECT COUNT(*) FROM inventory_items ii WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ii.product_id)) +
    (SELECT COUNT(*) FROM inventory_movements im WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = im.product_id)) +
    (SELECT COUNT(*) FROM purchase_conditions pc WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pc.product_id)) +
    (SELECT COUNT(*) FROM inventory_batches ib WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ib.product_id)) +
    (SELECT COUNT(*) FROM refill_batch_movements rbm WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = rbm.product_id)) +
    (SELECT COUNT(*) FROM product_batches pb WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pb.product_id)) +
    (SELECT COUNT(*) FROM product_movements pm WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pm.product_id))
  INTO total_orphaned;

  IF total_orphaned = 0 THEN
    RAISE NOTICE '✅ PASS: No orphaned FK references found';
  ELSE
    RAISE WARNING '❌ FAIL: Found % orphaned FK references!', total_orphaned;
  END IF;

  RAISE NOTICE '';
END$$;

-- =====================================================
-- VALIDATION 4: PRODUCT COUNT VERIFICATION
-- =====================================================

DO $$
DECLARE
  total_products INTEGER;
  unique_names INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 4: Product Count Verification';
  RAISE NOTICE '================================================';

  SELECT COUNT(*) INTO total_products FROM products;
  SELECT COUNT(DISTINCT LOWER(TRIM(product_name))) INTO unique_names FROM products;

  RAISE NOTICE 'Total products: %', total_products;
  RAISE NOTICE 'Unique product names: %', unique_names;

  IF total_products = unique_names THEN
    RAISE NOTICE '✅ PASS: Product count matches unique names (no duplicates)';
  ELSE
    RAISE WARNING '❌ FAIL: Product count (%) != unique names (%)!', total_products, unique_names;
  END IF;

  RAISE NOTICE '';
END$$;

-- =====================================================
-- VALIDATION 5: VENDON_ID UNIQUENESS
-- =====================================================

DO $$
DECLARE
  duplicate_vendon_ids INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 5: Vendon ID Uniqueness';
  RAISE NOTICE '================================================';

  SELECT COUNT(*)
  INTO duplicate_vendon_ids
  FROM (
    SELECT vendon_id
    FROM products
    WHERE vendon_id IS NOT NULL AND vendon_id != ''
    GROUP BY vendon_id
    HAVING COUNT(*) > 1
  ) sub;

  IF duplicate_vendon_ids = 0 THEN
    RAISE NOTICE '✅ PASS: No duplicate vendon_ids found';
  ELSE
    RAISE WARNING '❌ FAIL: Found % duplicate vendon_id groups!', duplicate_vendon_ids;
  END IF;

  RAISE NOTICE '';
END$$;

-- List any duplicate vendon_ids
SELECT
  '=== Duplicate Vendon IDs (should be empty) ===' as report_section;

SELECT
  vendon_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY id) as product_ids,
  ARRAY_AGG(product_name ORDER BY id) as product_names
FROM products
WHERE vendon_id IS NOT NULL AND vendon_id != ''
GROUP BY vendon_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- =====================================================
-- VALIDATION 6: DATA QUALITY CHECKS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 6: Data Quality Checks';
  RAISE NOTICE '================================================';
END$$;

-- Check for NULL or empty product names
SELECT
  '=== Products with NULL/Empty Names ===' as report_section;

SELECT
  COUNT(*) as null_or_empty_count,
  ARRAY_AGG(id) as product_ids
FROM products
WHERE product_name IS NULL
   OR TRIM(product_name) = '';

-- Check for products with suspicious names (very short, etc.)
SELECT
  '=== Products with Suspicious Names ===' as report_section;

SELECT
  id,
  product_name,
  LENGTH(product_name) as name_length
FROM products
WHERE LENGTH(TRIM(product_name)) < 2
ORDER BY LENGTH(product_name), id
LIMIT 20;

-- =====================================================
-- VALIDATION 7: FK REFERENCE DISTRIBUTION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'VALIDATION 7: FK Reference Distribution';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Checking if consolidated products have reasonable FK references...';
  RAISE NOTICE '';
END$$;

-- Show products with most FK references (these likely absorbed duplicate references)
SELECT
  '=== Top 20 Products by FK References ===' as report_section;

WITH product_fk_counts AS (
  SELECT
    p.id,
    p.product_name,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) as order_items_count,
    (SELECT COUNT(*) FROM inventory_items ii WHERE ii.product_id = p.id) as inventory_items_count,
    (SELECT COUNT(*) FROM inventory_movements im WHERE im.product_id = p.id) as inventory_movements_count,
    (SELECT COUNT(*) FROM product_batches pb WHERE pb.product_id = p.id) as product_batches_count
  FROM products p
)
SELECT
  id,
  product_name,
  order_items_count,
  inventory_items_count,
  inventory_movements_count,
  product_batches_count,
  (order_items_count + inventory_items_count + inventory_movements_count + product_batches_count) as total_fk_refs
FROM product_fk_counts
WHERE (order_items_count + inventory_items_count + inventory_movements_count + product_batches_count) > 0
ORDER BY total_fk_refs DESC
LIMIT 20;

-- =====================================================
-- FINAL VALIDATION SUMMARY
-- =====================================================

DO $$
DECLARE
  duplicate_count INTEGER;
  has_name_constraint BOOLEAN;
  has_vendon_constraint BOOLEAN;
  orphaned_count INTEGER;
  total_products INTEGER;
  unique_names INTEGER;
  all_checks_passed BOOLEAN := true;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'FINAL VALIDATION SUMMARY';
  RAISE NOTICE '================================================';

  -- Check 1: No duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT LOWER(TRIM(product_name)) as name
    FROM products
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) sub;

  IF duplicate_count > 0 THEN
    all_checks_passed := false;
  END IF;

  -- Check 2: Constraints exist
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products' AND indexname = 'unique_product_name_normalized'
  ) INTO has_name_constraint;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products' AND indexname = 'unique_vendon_id_not_null'
  ) INTO has_vendon_constraint;

  IF NOT has_name_constraint OR NOT has_vendon_constraint THEN
    all_checks_passed := false;
  END IF;

  -- Check 3: No orphaned FKs
  SELECT
    (SELECT COUNT(*) FROM order_items oi WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = oi.product_id)) +
    (SELECT COUNT(*) FROM inventory_count_items ici WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ici.product_id)) +
    (SELECT COUNT(*) FROM inventory_items ii WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ii.product_id)) +
    (SELECT COUNT(*) FROM inventory_movements im WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = im.product_id)) +
    (SELECT COUNT(*) FROM purchase_conditions pc WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pc.product_id)) +
    (SELECT COUNT(*) FROM inventory_batches ib WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ib.product_id)) +
    (SELECT COUNT(*) FROM refill_batch_movements rbm WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = rbm.product_id)) +
    (SELECT COUNT(*) FROM product_batches pb WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pb.product_id)) +
    (SELECT COUNT(*) FROM product_movements pm WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pm.product_id))
  INTO orphaned_count;

  IF orphaned_count > 0 THEN
    all_checks_passed := false;
  END IF;

  -- Check 4: Product count matches unique names
  SELECT COUNT(*) INTO total_products FROM products;
  SELECT COUNT(DISTINCT LOWER(TRIM(product_name))) INTO unique_names FROM products;

  IF total_products != unique_names THEN
    all_checks_passed := false;
  END IF;

  -- Summary
  RAISE NOTICE 'Validation Results:';
  RAISE NOTICE '  - Duplicate groups: % (expected: 0)', duplicate_count;
  RAISE NOTICE '  - UNIQUE constraint on name: % (expected: true)', has_name_constraint;
  RAISE NOTICE '  - UNIQUE constraint on vendon_id: % (expected: true)', has_vendon_constraint;
  RAISE NOTICE '  - Orphaned FK references: % (expected: 0)', orphaned_count;
  RAISE NOTICE '  - Total products: %', total_products;
  RAISE NOTICE '  - Unique names: %', unique_names;
  RAISE NOTICE '';

  IF all_checks_passed THEN
    RAISE NOTICE '================================================';
    RAISE NOTICE '✅ ALL VALIDATIONS PASSED!';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Migration 003 completed successfully.';
    RAISE NOTICE 'Database is clean and ready for use.';
  ELSE
    RAISE NOTICE '================================================';
    RAISE WARNING '❌ SOME VALIDATIONS FAILED!';
    RAISE NOTICE '================================================';
    RAISE WARNING 'Please review the detailed validation output above.';
    RAISE WARNING 'You may need to:';
    RAISE WARNING '  1. Re-run the cleanup migration';
    RAISE WARNING '  2. Check for application errors';
    RAISE WARNING '  3. Contact database administrator';
  END IF;

  RAISE NOTICE '================================================';
END$$;
