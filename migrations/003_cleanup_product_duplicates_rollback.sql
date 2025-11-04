-- 003_cleanup_product_duplicates_rollback.sql
-- Rollback script for Migration 003: Product Duplicate Cleanup
--
-- ⚠️  IMPORTANT LIMITATIONS:
-- 1. This script can ONLY remove the UNIQUE constraints added by the migration
-- 2. This script CANNOT restore deleted duplicate products
-- 3. To restore deleted products, you MUST use your database backup
-- 4. Only run this if the migration caused issues and you need to revert constraints
--
-- WHEN TO USE THIS SCRIPT:
-- - If the UNIQUE constraints are causing application errors
-- - If you need to allow duplicates temporarily
-- - If you're reverting to pre-migration state completely (with backup restore)
--
-- WHEN NOT TO USE THIS SCRIPT:
-- - If migration completed successfully and application works fine
-- - If you just want to restore a few deleted products (use backup selectively)

-- =====================================================
-- METADATA
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'ROLLBACK MIGRATION 003: Product Duplicate Cleanup';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Started at: %', NOW();
  RAISE NOTICE 'Database: %', current_database();
  RAISE NOTICE '';
  RAISE WARNING '⚠️  This rollback removes UNIQUE constraints only!';
  RAISE WARNING '⚠️  Deleted products must be restored from backup!';
  RAISE NOTICE '';
END$$;

-- =====================================================
-- PRE-ROLLBACK CHECKS
-- =====================================================

DO $$
DECLARE
  constraint_count INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'PRE-ROLLBACK CHECKS';
  RAISE NOTICE '================================================';

  -- Check if constraints exist
  SELECT COUNT(*)
  INTO constraint_count
  FROM pg_indexes
  WHERE tablename = 'products'
    AND (
      indexname = 'unique_product_name_normalized' OR
      indexname = 'unique_vendon_id_not_null'
    );

  RAISE NOTICE 'UNIQUE constraints found: %', constraint_count;

  IF constraint_count = 0 THEN
    RAISE NOTICE '⚠️  No UNIQUE constraints found. Migration may not have run, or already rolled back.';
  ELSE
    RAISE NOTICE 'Proceeding with rollback...';
  END IF;

  RAISE NOTICE '';
END$$;

-- =====================================================
-- STEP 1: DROP UNIQUE CONSTRAINTS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'STEP 1: Removing UNIQUE Constraints';
  RAISE NOTICE '================================================';
END$$;

-- Drop UNIQUE index on normalized product_name
DROP INDEX IF EXISTS unique_product_name_normalized;
RAISE NOTICE '✅ Dropped UNIQUE index: unique_product_name_normalized';

-- Drop UNIQUE index on vendon_id
DROP INDEX IF EXISTS unique_vendon_id_not_null;
RAISE NOTICE '✅ Dropped UNIQUE index: unique_vendon_id_not_null';

RAISE NOTICE '';
RAISE NOTICE '⚠️  Duplicate products can now be inserted again!';
RAISE NOTICE '';

-- =====================================================
-- STEP 2: VALIDATION
-- =====================================================

DO $$
DECLARE
  remaining_constraints INTEGER;
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'STEP 2: Validation';
  RAISE NOTICE '================================================';

  -- Verify constraints are gone
  SELECT COUNT(*)
  INTO remaining_constraints
  FROM pg_indexes
  WHERE tablename = 'products'
    AND (
      indexname = 'unique_product_name_normalized' OR
      indexname = 'unique_vendon_id_not_null'
    );

  IF remaining_constraints > 0 THEN
    RAISE WARNING '⚠️  Still found % constraints after rollback!', remaining_constraints;
  ELSE
    RAISE NOTICE '✅ All UNIQUE constraints successfully removed';
  END IF;

  RAISE NOTICE '';
END$$;

-- =====================================================
-- STEP 3: RESTORE PRODUCTS FROM BACKUP (MANUAL)
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'STEP 3: Restore Deleted Products (MANUAL STEP)';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'To restore deleted duplicate products:';
  RAISE NOTICE '';
  RAISE NOTICE '1. Locate your backup file:';
  RAISE NOTICE '   backup_before_003_YYYYMMDD.sql';
  RAISE NOTICE '';
  RAISE NOTICE '2. OPTION A: Full database restore (DESTRUCTIVE!)';
  RAISE NOTICE '   WARNING: This will lose ALL changes since backup!';
  RAISE NOTICE '   pg_restore -d $DATABASE_URL backup_before_003_YYYYMMDD.sql';
  RAISE NOTICE '';
  RAISE NOTICE '3. OPTION B: Selective restore (RECOMMENDED)';
  RAISE NOTICE '   Extract only products table from backup:';
  RAISE NOTICE '   ';
  RAISE NOTICE '   a) Create temp table from backup:';
  RAISE NOTICE '      pg_restore -t products --data-only backup.sql | psql $DATABASE_URL';
  RAISE NOTICE '   ';
  RAISE NOTICE '   b) Or manually restore specific products:';
  RAISE NOTICE '      INSERT INTO products (id, product_name, ...) VALUES (...);';
  RAISE NOTICE '';
  RAISE NOTICE '4. After restore, verify:';
  RAISE NOTICE '   SELECT COUNT(*) FROM products;';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;

-- =====================================================
-- ROLLBACK SUMMARY
-- =====================================================

DO $$
DECLARE
  current_product_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_product_count FROM products;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'ROLLBACK COMPLETED';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Completed at: %', NOW();
  RAISE NOTICE '';
  RAISE NOTICE 'What was rolled back:';
  RAISE NOTICE '  ✅ UNIQUE constraint on product_name (dropped)';
  RAISE NOTICE '  ✅ UNIQUE constraint on vendon_id (dropped)';
  RAISE NOTICE '';
  RAISE NOTICE 'What was NOT rolled back:';
  RAISE NOTICE '  ❌ Deleted duplicate products (must restore from backup)';
  RAISE NOTICE '  ❌ FK reference updates (would be restored with backup)';
  RAISE NOTICE '';
  RAISE NOTICE 'Current state:';
  RAISE NOTICE '  - Products in database: %', current_product_count;
  RAISE NOTICE '  - Duplicates allowed: YES (constraints removed)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. If needed, restore products from backup (see STEP 3 above)';
  RAISE NOTICE '  2. Verify application functionality';
  RAISE NOTICE '  3. Decide: Keep duplicates or re-run migration?';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;

-- =====================================================
-- OPTIONAL: CHECK WHAT PRODUCTS ARE MISSING
-- =====================================================

-- Uncomment this section if you have the backup restored to a separate database
-- and want to compare what products are missing

/*
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'OPTIONAL: Compare with Backup';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'To compare current products with backup:';
  RAISE NOTICE '';
  RAISE NOTICE '1. Restore backup to temporary database:';
  RAISE NOTICE '   createdb temp_backup_db';
  RAISE NOTICE '   pg_restore -d temp_backup_db backup_before_003_YYYYMMDD.sql';
  RAISE NOTICE '';
  RAISE NOTICE '2. Find missing products:';
  RAISE NOTICE '   SELECT p_backup.id, p_backup.product_name';
  RAISE NOTICE '   FROM temp_backup_db.products p_backup';
  RAISE NOTICE '   LEFT JOIN products p_current ON p_current.id = p_backup.id';
  RAISE NOTICE '   WHERE p_current.id IS NULL;';
  RAISE NOTICE '';
  RAISE NOTICE '3. Restore missing products selectively if needed';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;
*/
