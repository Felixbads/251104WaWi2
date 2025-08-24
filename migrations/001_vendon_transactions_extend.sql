-- 001_vendon_transactions_extend.sql
-- Migration script to add missing Vendon API fields to transactions table
-- Based on the German implementation plan for complete API coverage

BEGIN;

-- Add new columns (idempotent)
DO $$
BEGIN
  -- Check and add machine_status column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='transactions' AND column_name='machine_status') THEN
    ALTER TABLE transactions ADD COLUMN machine_status varchar(100);
    RAISE NOTICE 'Added machine_status column';
  ELSE
    RAISE NOTICE 'machine_status column already exists';
  END IF;

  -- Check and add error_code column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='transactions' AND column_name='error_code') THEN
    ALTER TABLE transactions ADD COLUMN error_code varchar(100);
    RAISE NOTICE 'Added error_code column';
  ELSE
    RAISE NOTICE 'error_code column already exists';
  END IF;

  -- Check and add maintenance_flag column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='transactions' AND column_name='maintenance_flag') THEN
    ALTER TABLE transactions ADD COLUMN maintenance_flag boolean DEFAULT false;
    RAISE NOTICE 'Added maintenance_flag column';
  ELSE
    RAISE NOTICE 'maintenance_flag column already exists';
  END IF;
END$$;

-- Add basic quality constraints (only if they don't break existing workflows)
-- Ensure critical fields are not null
DO $$
BEGIN
  -- Check if datetime column allows null values
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='transactions' AND column_name='datetime' AND is_nullable='YES') THEN
    ALTER TABLE transactions ALTER COLUMN datetime SET NOT NULL;
    RAISE NOTICE 'Set datetime column to NOT NULL';
  END IF;

  -- Check if vendon_id column allows null values
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='transactions' AND column_name='vendon_id' AND is_nullable='YES') THEN
    ALTER TABLE transactions ALTER COLUMN vendon_id SET NOT NULL;
    RAISE NOTICE 'Set vendon_id column to NOT NULL';
  END IF;
END$$;

-- Add soft enum checks for data quality (adjustable)
DO $$
BEGIN
  -- Check if payment method constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_transactions_payment_method'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_payment_method
      CHECK (payment_method IN ('cash','card','mobile','voucher','CASH','CASHLESS','CARD','MOBILE','VOUCHER'));
    RAISE NOTICE 'Added payment method constraint';
  ELSE
    RAISE NOTICE 'Payment method constraint already exists';
  END IF;

  -- Check if machine status constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_transactions_machine_status'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_machine_status
      CHECK (machine_status IN ('operational','maintenance','error','offline','unknown') OR machine_status IS NULL);
    RAISE NOTICE 'Added machine status constraint';
  ELSE
    RAISE NOTICE 'Machine status constraint already exists';
  END IF;
END$$;

-- Create indexes for better query performance on new fields
DO $$
BEGIN
  -- Index on machine_status for filtering
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_machine_status') THEN
    CREATE INDEX idx_transactions_machine_status ON transactions(machine_status) WHERE machine_status IS NOT NULL;
    RAISE NOTICE 'Created index on machine_status';
  END IF;

  -- Index on maintenance_flag for filtering
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_maintenance_flag') THEN
    CREATE INDEX idx_transactions_maintenance_flag ON transactions(maintenance_flag) WHERE maintenance_flag = true;
    RAISE NOTICE 'Created index on maintenance_flag';
  END IF;

  -- Index on error_code for debugging
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_error_code') THEN
    CREATE INDEX idx_transactions_error_code ON transactions(error_code) WHERE error_code IS NOT NULL;
    RAISE NOTICE 'Created index on error_code';
  END IF;
END$$;

-- Add comment to track migration
COMMENT ON TABLE transactions IS 'Transactions table extended with machine status fields (migration 001_vendon_transactions_extend)';

COMMIT;

-- Log successful completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 001_vendon_transactions_extend completed successfully';
END$$;