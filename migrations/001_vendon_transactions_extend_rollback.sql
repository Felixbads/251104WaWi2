-- Rollback script for 001_vendon_transactions_extend.sql
-- This script removes the columns and constraints added by the migration

BEGIN;

-- Remove constraints first
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_payment_method;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transactions_machine_status;

-- Drop indexes
DROP INDEX IF EXISTS idx_transactions_machine_status;
DROP INDEX IF EXISTS idx_transactions_maintenance_flag;
DROP INDEX IF EXISTS idx_transactions_error_code;

-- Remove columns
ALTER TABLE transactions DROP COLUMN IF EXISTS maintenance_flag;
ALTER TABLE transactions DROP COLUMN IF EXISTS error_code;
ALTER TABLE transactions DROP COLUMN IF EXISTS machine_status;

-- Remove table comment
COMMENT ON TABLE transactions IS 'Transactions table (migration rolled back)';

COMMIT;

-- Log rollback completion
DO $$
BEGIN
  RAISE NOTICE 'Rollback of 001_vendon_transactions_extend completed successfully';
END$$;