-- 003_cleanup_product_duplicates.sql
-- Migration to clean up product duplicates and prevent future duplicates
--
-- ⚠️  CRITICAL WARNINGS:
-- 1. RUN 003_analyze_product_duplicates.sql FIRST to understand the data!
-- 2. CREATE FULL BACKUP before running this migration
-- 3. TEST ON STAGING environment first
-- 4. Run during OFF-PEAK hours
-- 5. This migration DELETES data - irreversible without backup!
--
-- Strategy: Simple Deduplication (recommended for < 100 duplicates)
-- If you have > 100 duplicates, consider batch processing approach

-- =====================================================
-- METADATA
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION 003: Product Duplicate Cleanup';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Started at: %', NOW();
  RAISE NOTICE 'Database: %', current_database();
  RAISE NOTICE '';
  RAISE WARNING '⚠️  This migration will DELETE duplicate products!';
  RAISE WARNING '⚠️  Ensure you have a backup before proceeding!';
  RAISE NOTICE '';
END$$;

-- =====================================================
-- PRE-FLIGHT CHECKS
-- =====================================================

DO $$
DECLARE
  duplicate_count INTEGER;
  total_products INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PRE-FLIGHT CHECKS';
  RAISE NOTICE '================================================';

  -- Count total products
  SELECT COUNT(*) INTO total_products FROM products;
  RAISE NOTICE 'Total products: %', total_products;

  -- Count duplicates
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT LOWER(TRIM(product_name)) as name
    FROM products
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) sub;

  RAISE NOTICE 'Duplicate groups found: %', duplicate_count;

  IF duplicate_count = 0 THEN
    RAISE NOTICE '✅ No duplicates found - migration not needed!';
    RAISE EXCEPTION 'No duplicates to clean up. Aborting migration.';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Proceeding with cleanup...';
  RAISE NOTICE '';
END$$;

-- =====================================================
-- PHASE 1: CREATE DEDUPLICATION MAPPING
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 1: Creating Deduplication Mapping';
  RAISE NOTICE '================================================';
END$$;

-- Create temporary table to store the deduplication mapping
CREATE TEMPORARY TABLE IF NOT EXISTS product_dedup_mapping (
  old_product_id INTEGER NOT NULL,
  keep_product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  action VARCHAR(10) NOT NULL, -- 'KEEP' or 'DELETE'
  fk_references_count INTEGER DEFAULT 0
);

-- Insert mapping: which products to keep, which to delete
WITH duplicate_groups AS (
  SELECT
    LOWER(TRIM(product_name)) as normalized_name,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) as all_product_ids
  FROM products
  GROUP BY LOWER(TRIM(product_name))
  HAVING COUNT(*) > 1
),
expanded_mapping AS (
  SELECT
    UNNEST(all_product_ids) as product_id,
    keep_id,
    normalized_name
  FROM duplicate_groups
)
INSERT INTO product_dedup_mapping (old_product_id, keep_product_id, product_name, action)
SELECT
  product_id as old_product_id,
  keep_id as keep_product_id,
  normalized_name as product_name,
  CASE
    WHEN product_id = keep_id THEN 'KEEP'
    ELSE 'DELETE'
  END as action
FROM expanded_mapping;

-- Log mapping summary
DO $$
DECLARE
  keep_count INTEGER;
  delete_count INTEGER;
  total_mapped INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE action = 'KEEP') INTO keep_count
  FROM product_dedup_mapping;

  SELECT COUNT(*) FILTER (WHERE action = 'DELETE') INTO delete_count
  FROM product_dedup_mapping;

  total_mapped := keep_count + delete_count;

  RAISE NOTICE 'Mapping created:';
  RAISE NOTICE '  - Total products in mapping: %', total_mapped;
  RAISE NOTICE '  - Products to KEEP: %', keep_count;
  RAISE NOTICE '  - Products to DELETE: %', delete_count;
  RAISE NOTICE '';
END$$;

-- =====================================================
-- PHASE 2: UPDATE FOREIGN KEY REFERENCES
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 2: Updating Foreign Key References';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'This will update 9 FK tables to point to kept products...';
  RAISE NOTICE '';
END$$;

-- FK Table 1: order_items
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE order_items oi
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE oi.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ order_items: % rows updated', updated_count;
END$$;

-- FK Table 2: inventory_count_items
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE inventory_count_items ici
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE ici.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ inventory_count_items: % rows updated', updated_count;
END$$;

-- FK Table 3: inventory_items
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE inventory_items ii
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE ii.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ inventory_items: % rows updated', updated_count;
END$$;

-- FK Table 4: inventory_movements
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE inventory_movements im
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE im.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ inventory_movements: % rows updated', updated_count;
END$$;

-- FK Table 5: purchase_conditions
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE purchase_conditions pc
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE pc.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ purchase_conditions: % rows updated', updated_count;
END$$;

-- FK Table 6: inventory_batches
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE inventory_batches ib
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE ib.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ inventory_batches: % rows updated', updated_count;
END$$;

-- FK Table 7: refill_batch_movements
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE refill_batch_movements rbm
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE rbm.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ refill_batch_movements: % rows updated', updated_count;
END$$;

-- FK Table 8: product_batches
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE product_batches pb
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE pb.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ product_batches: % rows updated', updated_count;
END$$;

-- FK Table 9: product_movements
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE product_movements pm
  SET product_id = m.keep_product_id
  FROM product_dedup_mapping m
  WHERE pm.product_id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ product_movements: % rows updated', updated_count;
END$$;

RAISE NOTICE '';

-- =====================================================
-- PHASE 3: VERIFY FK UPDATES
-- =====================================================

DO $$
DECLARE
  remaining_refs INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 3: Verifying FK Updates';
  RAISE NOTICE '================================================';

  -- Check if any FK references still point to products marked for deletion
  SELECT COUNT(*)
  INTO remaining_refs
  FROM (
    SELECT oi.product_id
    FROM order_items oi
    JOIN product_dedup_mapping m ON m.old_product_id = oi.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT ici.product_id
    FROM inventory_count_items ici
    JOIN product_dedup_mapping m ON m.old_product_id = ici.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT ii.product_id
    FROM inventory_items ii
    JOIN product_dedup_mapping m ON m.old_product_id = ii.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT im.product_id
    FROM inventory_movements im
    JOIN product_dedup_mapping m ON m.old_product_id = im.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT pc.product_id
    FROM purchase_conditions pc
    JOIN product_dedup_mapping m ON m.old_product_id = pc.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT ib.product_id
    FROM inventory_batches ib
    JOIN product_dedup_mapping m ON m.old_product_id = ib.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT rbm.product_id
    FROM refill_batch_movements rbm
    JOIN product_dedup_mapping m ON m.old_product_id = rbm.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT pb.product_id
    FROM product_batches pb
    JOIN product_dedup_mapping m ON m.old_product_id = pb.product_id
    WHERE m.action = 'DELETE'

    UNION ALL

    SELECT pm.product_id
    FROM product_movements pm
    JOIN product_dedup_mapping m ON m.old_product_id = pm.product_id
    WHERE m.action = 'DELETE'
  ) sub;

  IF remaining_refs > 0 THEN
    RAISE WARNING '⚠️  Found % FK references still pointing to products marked for deletion!', remaining_refs;
    RAISE EXCEPTION 'FK update verification failed. Aborting migration. Check UPDATE statements.';
  ELSE
    RAISE NOTICE '✅ All FK references successfully updated!';
    RAISE NOTICE '';
  END IF;
END$$;

-- =====================================================
-- PHASE 4: DELETE DUPLICATE PRODUCTS
-- =====================================================

DO $$
DECLARE
  delete_count INTEGER;
  products_before INTEGER;
  products_after INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 4: Deleting Duplicate Products';
  RAISE NOTICE '================================================';

  SELECT COUNT(*) INTO products_before FROM products;
  RAISE NOTICE 'Products before deletion: %', products_before;

  -- Delete duplicate products
  DELETE FROM products p
  USING product_dedup_mapping m
  WHERE p.id = m.old_product_id
    AND m.action = 'DELETE';

  GET DIAGNOSTICS delete_count = ROW_COUNT;

  SELECT COUNT(*) INTO products_after FROM products;

  RAISE NOTICE '✅ Deleted % duplicate products', delete_count;
  RAISE NOTICE 'Products after deletion: %', products_after;
  RAISE NOTICE 'Difference: %', products_before - products_after;
  RAISE NOTICE '';

  IF (products_before - products_after) != delete_count THEN
    RAISE WARNING '⚠️  Unexpected deletion count mismatch!';
  END IF;
END$$;

-- =====================================================
-- PHASE 5: ADD UNIQUE CONSTRAINT (PREVENTION!)
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 5: Adding UNIQUE Constraint (Prevention)';
  RAISE NOTICE '================================================';
END$$;

-- Option 1: UNIQUE on normalized product_name
-- This prevents any duplicate names (case-insensitive, trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS unique_product_name_normalized
  ON products (LOWER(TRIM(product_name)));

RAISE NOTICE '✅ Created UNIQUE index on normalized product_name';

-- Option 2: UNIQUE on vendon_id (where not null)
-- This prevents duplicate Vendon IDs
CREATE UNIQUE INDEX IF NOT EXISTS unique_vendon_id_not_null
  ON products (vendon_id)
  WHERE vendon_id IS NOT NULL AND vendon_id != '';

RAISE NOTICE '✅ Created UNIQUE index on vendon_id (where not null)';
RAISE NOTICE '';
RAISE NOTICE '⚠️  Future product insertions must have unique names!';
RAISE NOTICE '';

-- =====================================================
-- PHASE 6: POST-MIGRATION VALIDATION
-- =====================================================

DO $$
DECLARE
  remaining_duplicates INTEGER;
  total_products INTEGER;
  unique_names INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PHASE 6: Post-Migration Validation';
  RAISE NOTICE '================================================';

  -- Check for any remaining duplicates
  SELECT COUNT(*)
  INTO remaining_duplicates
  FROM (
    SELECT LOWER(TRIM(product_name)) as name
    FROM products
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) sub;

  SELECT COUNT(*) INTO total_products FROM products;
  SELECT COUNT(DISTINCT LOWER(TRIM(product_name))) INTO unique_names FROM products;

  RAISE NOTICE 'Total products: %', total_products;
  RAISE NOTICE 'Unique product names: %', unique_names;
  RAISE NOTICE 'Remaining duplicate groups: %', remaining_duplicates;
  RAISE NOTICE '';

  IF remaining_duplicates > 0 THEN
    RAISE WARNING '⚠️  Still found % duplicate groups after cleanup!', remaining_duplicates;
    RAISE WARNING 'This might indicate an issue with the migration. Investigate!';
  ELSE
    RAISE NOTICE '✅ SUCCESS: No duplicate products remain!';
  END IF;

  RAISE NOTICE '';
END$$;

-- =====================================================
-- CLEANUP TEMPORARY TABLES
-- =====================================================

DROP TABLE IF EXISTS product_dedup_mapping;

-- =====================================================
-- FINAL SUMMARY
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION 003: COMPLETED';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Completed at: %', NOW();
  RAISE NOTICE '';
  RAISE NOTICE '✅ Product duplicates have been cleaned up';
  RAISE NOTICE '✅ FK references have been updated';
  RAISE NOTICE '✅ UNIQUE constraints added to prevent future duplicates';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run 003_validate_cleanup.sql to verify results';
  RAISE NOTICE '  2. Test application functionality';
  RAISE NOTICE '  3. Monitor for any errors in production';
  RAISE NOTICE '  4. Update application code to handle UNIQUE constraint';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;
