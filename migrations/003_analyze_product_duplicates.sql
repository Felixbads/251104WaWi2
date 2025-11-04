-- 003_analyze_product_duplicates.sql
-- READ-ONLY Analysis script for product duplicates
-- Run this BEFORE creating the cleanup migration to understand the data
-- Safe to run on production (no modifications)

-- =====================================================
-- METADATA
-- =====================================================
SELECT '=== PRODUCT DUPLICATE ANALYSIS ===' as analysis_section;
SELECT 'Migration: 003' as migration_id;
SELECT 'Status: READ-ONLY (Safe on Production)' as safety_status;
SELECT NOW() as analysis_timestamp;

-- =====================================================
-- PHASE 1: OVERALL STATISTICS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 1: OVERALL PRODUCT STATISTICS';
  RAISE NOTICE '================================================';
END$$;

-- Total products count
SELECT
  '=== Total Products ===' as metric,
  COUNT(*) as total_products,
  COUNT(DISTINCT product_name) as unique_names,
  COUNT(*) - COUNT(DISTINCT product_name) as potential_duplicates,
  COUNT(DISTINCT vendon_id) as unique_vendon_ids,
  COUNT(*) FILTER (WHERE vendon_id IS NOT NULL) as products_with_vendon_id,
  COUNT(*) FILTER (WHERE vendon_id IS NULL) as products_without_vendon_id
FROM products;

-- Supplier distribution
SELECT
  '=== Products by Supplier ===' as metric,
  supplier_id,
  COUNT(*) as product_count,
  COUNT(DISTINCT product_name) as unique_names
FROM products
GROUP BY supplier_id
ORDER BY product_count DESC;

-- =====================================================
-- PHASE 2: DUPLICATE DETECTION (EXACT MATCH)
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 2: EXACT NAME DUPLICATES';
  RAISE NOTICE '================================================';
END$$;

-- Find duplicates by exact name match (case-insensitive)
WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY id) as product_ids,
    ARRAY_AGG(product_name ORDER BY id) as product_names,
    ARRAY_AGG(supplier_id ORDER BY id) as supplier_ids,
    ARRAY_AGG(vendon_id ORDER BY id) as vendon_ids,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) FILTER (WHERE id != MIN(id)) as delete_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
)
SELECT
  '=== Duplicate Summary ===' as report_section,
  COUNT(*) as duplicate_groups,
  SUM(duplicate_count) as total_duplicate_products,
  SUM(duplicate_count - 1) as products_to_delete,
  MAX(duplicate_count) as max_duplicates_per_group,
  AVG(duplicate_count)::numeric(10,2) as avg_duplicates_per_group
FROM duplicate_groups;

-- Top 20 duplicate groups
SELECT
  '=== Top 20 Duplicate Groups ===' as report_section;

WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY id) as product_ids,
    MIN(id) as keep_id
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
)
SELECT
  ROW_NUMBER() OVER (ORDER BY duplicate_count DESC) as rank,
  normalized_name,
  duplicate_count,
  product_ids,
  keep_id,
  duplicate_count - 1 as will_delete_count
FROM duplicate_groups
ORDER BY duplicate_count DESC, normalized_name
LIMIT 20;

-- =====================================================
-- PHASE 3: VENDON_ID DUPLICATES
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 3: VENDON_ID DUPLICATES';
  RAISE NOTICE '================================================';
END$$;

-- Find duplicates by vendon_id
SELECT
  '=== Vendon ID Duplicates ===' as report_section,
  vendon_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY id) as product_ids,
  ARRAY_AGG(product_name ORDER BY id) as product_names
FROM products
WHERE vendon_id IS NOT NULL
  AND vendon_id != ''
GROUP BY vendon_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, vendon_id
LIMIT 20;

-- =====================================================
-- PHASE 4: FOREIGN KEY IMPACT ANALYSIS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 4: FOREIGN KEY IMPACT ANALYSIS';
  RAISE NOTICE '================================================';
END$$;

-- Analyze FK references for products that will be deleted
WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    MIN(id) as keep_id,
    ARRAY_AGG(id) FILTER (WHERE id != MIN(id)) as delete_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
),
products_to_delete AS (
  SELECT UNNEST(delete_ids) as product_id
  FROM duplicate_groups
)
SELECT
  '=== FK References for Products to Delete ===' as report_section;

-- Count references in each FK table
SELECT '--- order_items ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN order_items oi ON oi.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- inventory_count_items ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN inventory_count_items ici ON ici.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- inventory_items ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN inventory_items ii ON ii.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- inventory_movements ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN inventory_movements im ON im.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- purchase_conditions ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN purchase_conditions pc ON pc.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- inventory_batches ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN inventory_batches ib ON ib.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- refill_batch_movements ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN refill_batch_movements rbm ON rbm.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- product_batches ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN product_batches pb ON pb.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

SELECT '--- product_movements ---' as fk_table;
SELECT
  p.product_id,
  pr.product_name,
  COUNT(*) as reference_count
FROM products_to_delete p
JOIN product_movements pm ON pm.product_id = p.product_id
JOIN products pr ON pr.id = p.product_id
GROUP BY p.product_id, pr.product_name
ORDER BY reference_count DESC
LIMIT 10;

-- Total FK references summary
WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    MIN(id) as keep_id,
    ARRAY_AGG(id) FILTER (WHERE id != MIN(id)) as delete_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
),
products_to_delete AS (
  SELECT UNNEST(delete_ids) as product_id
  FROM duplicate_groups
)
SELECT
  '=== Total FK References Summary ===' as report_section,
  (SELECT COUNT(*) FROM products_to_delete p JOIN order_items oi ON oi.product_id = p.product_id) as order_items_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN inventory_count_items ici ON ici.product_id = p.product_id) as inventory_count_items_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN inventory_items ii ON ii.product_id = p.product_id) as inventory_items_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN inventory_movements im ON im.product_id = p.product_id) as inventory_movements_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN purchase_conditions pc ON pc.product_id = p.product_id) as purchase_conditions_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN inventory_batches ib ON ib.product_id = p.product_id) as inventory_batches_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN refill_batch_movements rbm ON rbm.product_id = p.product_id) as refill_batch_movements_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN product_batches pb ON pb.product_id = p.product_id) as product_batches_refs,
  (SELECT COUNT(*) FROM products_to_delete p JOIN product_movements pm ON pm.product_id = p.product_id) as product_movements_refs;

-- =====================================================
-- PHASE 5: DATA QUALITY CHECKS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 5: DATA QUALITY CHECKS';
  RAISE NOTICE '================================================';
END$$;

-- Check for products with different suppliers but same name
SELECT
  '=== Same Name, Different Suppliers ===' as report_section;

WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    COUNT(DISTINCT supplier_id) as supplier_count,
    ARRAY_AGG(DISTINCT supplier_id) as suppliers,
    ARRAY_AGG(id ORDER BY id) as product_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
    AND COUNT(DISTINCT supplier_id) > 1
)
SELECT
  normalized_name,
  supplier_count,
  suppliers,
  product_ids
FROM duplicate_groups
ORDER BY supplier_count DESC, normalized_name
LIMIT 20;

-- Check for products with conflicting data (price, barcode, etc.)
SELECT
  '=== Duplicates with Different Prices ===' as report_section;

WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    COUNT(DISTINCT sales_price) as price_variations,
    ARRAY_AGG(DISTINCT sales_price ORDER BY sales_price) as prices,
    ARRAY_AGG(id ORDER BY id) as product_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
    AND COUNT(DISTINCT sales_price) > 1
)
SELECT
  normalized_name,
  price_variations,
  prices,
  product_ids
FROM duplicate_groups
ORDER BY price_variations DESC
LIMIT 20;

-- =====================================================
-- PHASE 6: NORMALIZATION ANALYSIS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 6: NORMALIZATION OPPORTUNITIES';
  RAISE NOTICE '================================================';
END$$;

-- Analyze potential "fuzzy" duplicates (different spacing, capitalization, etc.)
SELECT
  '=== Potential Fuzzy Duplicates ===' as report_section;

-- Products that might be duplicates with spacing/punctuation differences
WITH normalized_products AS (
  SELECT
    id,
    product_name,
    LOWER(TRIM(product_name)) as simple_norm,
    LOWER(REGEXP_REPLACE(TRIM(product_name), '\s+', ' ', 'g')) as space_norm,
    LOWER(REGEXP_REPLACE(TRIM(product_name), '[^a-zA-Z0-9]', '', 'g')) as alphanum_norm
  FROM products
)
SELECT
  alphanum_norm,
  COUNT(*) as variation_count,
  ARRAY_AGG(DISTINCT product_name) as variations,
  ARRAY_AGG(id ORDER BY id) as product_ids
FROM normalized_products
WHERE alphanum_norm != ''
GROUP BY alphanum_norm
HAVING COUNT(*) > 1
ORDER BY variation_count DESC
LIMIT 20;

-- =====================================================
-- PHASE 7: STRATEGY RECOMMENDATION
-- =====================================================

DO $$
DECLARE
  total_products INTEGER;
  duplicate_groups_count INTEGER;
  products_to_delete INTEGER;
  max_fk_refs INTEGER;
  recommended_strategy INTEGER;
  estimated_time_minutes INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 7: STRATEGY RECOMMENDATION';
  RAISE NOTICE '================================================';

  -- Get statistics
  SELECT COUNT(*) INTO total_products FROM products;

  SELECT COUNT(*), SUM(cnt - 1)
  INTO duplicate_groups_count, products_to_delete
  FROM (
    SELECT COUNT(*) as cnt
    FROM products
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) sub;

  -- Determine strategy
  IF products_to_delete IS NULL OR products_to_delete = 0 THEN
    RAISE NOTICE '✅ NO DUPLICATES FOUND - No action needed!';
    RAISE NOTICE 'Total products: %', total_products;
    RETURN;
  END IF;

  IF products_to_delete < 50 THEN
    recommended_strategy := 1;
    estimated_time_minutes := 10;
  ELSIF products_to_delete < 100 THEN
    recommended_strategy := 1;
    estimated_time_minutes := 20;
  ELSIF products_to_delete < 500 THEN
    recommended_strategy := 2;
    estimated_time_minutes := 60;
  ELSE
    recommended_strategy := 2;
    estimated_time_minutes := 120;
  END IF;

  RAISE NOTICE 'Total products: %', total_products;
  RAISE NOTICE 'Duplicate groups found: %', duplicate_groups_count;
  RAISE NOTICE 'Products to delete: %', products_to_delete;
  RAISE NOTICE '';
  RAISE NOTICE '📋 RECOMMENDED STRATEGY: %', recommended_strategy;
  RAISE NOTICE '';

  CASE recommended_strategy
    WHEN 1 THEN
      RAISE NOTICE 'Strategy 1: Simple Deduplication';
      RAISE NOTICE '  - Direct cleanup with FK updates';
      RAISE NOTICE '  - Single transaction';
      RAISE NOTICE '  - Low risk';
    WHEN 2 THEN
      RAISE NOTICE 'Strategy 2: Batch Processing';
      RAISE NOTICE '  - Process in batches of 50';
      RAISE NOTICE '  - Better progress tracking';
      RAISE NOTICE '  - Medium risk';
    WHEN 3 THEN
      RAISE NOTICE 'Strategy 3: With Product Merging';
      RAISE NOTICE '  - Merge different supplier data';
      RAISE NOTICE '  - Complex, use only if needed';
      RAISE NOTICE '  - High risk';
  END CASE;

  RAISE NOTICE '';
  RAISE NOTICE '⏱️  ESTIMATED TIME: % minutes', estimated_time_minutes;
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  CRITICAL NEXT STEPS:';
  RAISE NOTICE '  1. Create full backup';
  RAISE NOTICE '  2. Test on staging first';
  RAISE NOTICE '  3. Schedule during off-peak hours';
  RAISE NOTICE '  4. Monitor FK constraint violations';
  RAISE NOTICE '  5. Add UNIQUE constraint after cleanup!';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;

-- =====================================================
-- PHASE 8: SAMPLE CLEANUP PREVIEW
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 8: SAMPLE CLEANUP PREVIEW';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Showing what WOULD happen for first 5 duplicate groups:';
END$$;

-- Show what would happen for first 5 duplicate groups
WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    COUNT(*) as duplicate_count,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) as all_ids,
    ARRAY_AGG(id ORDER BY id) FILTER (WHERE id != MIN(id)) as delete_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
  LIMIT 5
)
SELECT
  '=== Preview: First 5 Duplicate Groups ===' as report_section,
  normalized_name,
  duplicate_count,
  keep_id as "KEEP_THIS_ID",
  delete_ids as "DELETE_THESE_IDS",
  duplicate_count - 1 as "WILL_DELETE_COUNT"
FROM duplicate_groups
ORDER BY duplicate_count DESC;

-- =====================================================
-- FINAL REPORT SUMMARY
-- =====================================================

SELECT '================================================' as final_separator;
SELECT '=== ANALYSIS COMPLETE ===' as status;
SELECT '================================================' as final_separator;
SELECT 'Review the output above to understand:' as instructions;
SELECT '  1. How many duplicates exist' as step1;
SELECT '  2. Which products are affected' as step2;
SELECT '  3. How many FK references need updating' as step3;
SELECT '  4. Recommended cleanup strategy' as step4;
SELECT '  5. Estimated migration time' as step5;
SELECT '' as blank_line;
SELECT 'Next steps:' as next_steps_header;
SELECT '  1. Review this analysis output' as next_step1;
SELECT '  2. Create full database backup' as next_step2;
SELECT '  3. Run cleanup migration on staging first' as next_step3;
SELECT '  4. Use recommended strategy for production' as next_step4;
SELECT '================================================' as final_separator2;
