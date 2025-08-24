-- SQL Health Checks for Vendon Sync Implementation
-- Based on the German implementation plan

-- =====================================
-- Coverage Analysis for New Fields
-- =====================================

-- Check coverage of temperature and humidity fields in recent transactions
SELECT 
  'Field Coverage Analysis' as check_type,
  COUNT(*) AS total_transactions,
  COUNT(temperature) AS transactions_with_temperature,
  COUNT(humidity) AS transactions_with_humidity,
  COUNT(machine_status) AS transactions_with_machine_status,
  COUNT(error_code) AS transactions_with_error_code,
  COUNT(maintenance_flag) AS transactions_with_maintenance_flag,
  
  -- Calculate coverage percentages
  ROUND(100.0 * COUNT(temperature)::numeric / NULLIF(COUNT(*), 0), 2) AS temperature_coverage_pct,
  ROUND(100.0 * COUNT(humidity)::numeric / NULLIF(COUNT(*), 0), 2) AS humidity_coverage_pct,
  ROUND(100.0 * COUNT(machine_status)::numeric / NULLIF(COUNT(*), 0), 2) AS machine_status_coverage_pct,
  ROUND(100.0 * COUNT(error_code)::numeric / NULLIF(COUNT(*), 0), 2) AS error_code_coverage_pct,
  ROUND(100.0 * COUNT(maintenance_flag)::numeric / NULLIF(COUNT(*), 0), 2) AS maintenance_flag_coverage_pct
FROM transactions
WHERE datetime >= NOW() - INTERVAL '30 days';

-- =====================================
-- Duplicate Detection
-- =====================================

-- Check for duplicate vendon_id entries (should be unique)
SELECT 
  'Duplicate Detection' as check_type,
  vendon_id, 
  COUNT(*) as duplicate_count,
  string_agg(id::text, ', ') as conflicting_ids
FROM transactions
GROUP BY vendon_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 10;

-- =====================================
-- Data Quality Checks
-- =====================================

-- Check for transactions with invalid or missing critical data
SELECT 
  'Data Quality Issues' as check_type,
  'Missing vendon_id' as issue_type,
  COUNT(*) as issue_count
FROM transactions
WHERE vendon_id IS NULL OR vendon_id = ''

UNION ALL

SELECT 
  'Data Quality Issues' as check_type,
  'Missing datetime' as issue_type,
  COUNT(*) as issue_count
FROM transactions
WHERE datetime IS NULL

UNION ALL

SELECT 
  'Data Quality Issues' as check_type,
  'Invalid price (negative or zero)' as issue_type,
  COUNT(*) as issue_count
FROM transactions
WHERE price <= 0

UNION ALL

SELECT 
  'Data Quality Issues' as check_type,
  'Future dated transactions' as issue_type,
  COUNT(*) as issue_count
FROM transactions
WHERE datetime > NOW() + INTERVAL '1 hour'

ORDER BY issue_count DESC;

-- =====================================
-- Machine Status Analysis
-- =====================================

-- Analyze machine status distribution
SELECT 
  'Machine Status Distribution' as check_type,
  machine_status,
  COUNT(*) as transaction_count,
  ROUND(100.0 * COUNT(*)::numeric / SUM(COUNT(*)) OVER(), 2) as percentage
FROM transactions
WHERE datetime >= NOW() - INTERVAL '7 days'
  AND machine_status IS NOT NULL
GROUP BY machine_status
ORDER BY transaction_count DESC;

-- =====================================
-- Error Code Analysis
-- =====================================

-- Analyze error codes in recent transactions
SELECT 
  'Error Code Analysis' as check_type,
  error_code,
  COUNT(*) as occurrence_count,
  MIN(datetime) as first_occurrence,
  MAX(datetime) as last_occurrence
FROM transactions
WHERE error_code IS NOT NULL
  AND datetime >= NOW() - INTERVAL '30 days'
GROUP BY error_code
ORDER BY occurrence_count DESC
LIMIT 20;

-- =====================================
-- Maintenance Flag Analysis
-- =====================================

-- Check maintenance flag patterns
SELECT 
  'Maintenance Flag Analysis' as check_type,
  maintenance_flag,
  COUNT(*) as transaction_count,
  COUNT(DISTINCT machine_id) as unique_machines,
  AVG(price) as avg_transaction_value
FROM transactions
WHERE datetime >= NOW() - INTERVAL '30 days'
GROUP BY maintenance_flag;

-- =====================================
-- Temperature and Humidity Ranges
-- =====================================

-- Check for reasonable temperature and humidity values
SELECT 
  'Environmental Data Validation' as check_type,
  'Temperature' as metric,
  MIN(temperature) as min_value,
  MAX(temperature) as max_value,
  AVG(temperature) as avg_value,
  COUNT(*) as samples_with_data
FROM transactions
WHERE temperature IS NOT NULL
  AND datetime >= NOW() - INTERVAL '30 days'

UNION ALL

SELECT 
  'Environmental Data Validation' as check_type,
  'Humidity' as metric,
  MIN(humidity) as min_value,
  MAX(humidity) as max_value,
  AVG(humidity) as avg_value,
  COUNT(*) as samples_with_data
FROM transactions
WHERE humidity IS NOT NULL
  AND datetime >= NOW() - INTERVAL '30 days';

-- =====================================
-- Sync Performance Metrics
-- =====================================

-- Check recent sync performance
SELECT 
  'Sync Performance' as check_type,
  DATE(synced_at) as sync_date,
  COUNT(*) as transactions_synced,
  COUNT(DISTINCT vendon_id) as unique_transactions,
  MIN(synced_at) as first_sync_of_day,
  MAX(synced_at) as last_sync_of_day
FROM transactions
WHERE synced_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(synced_at)
ORDER BY sync_date DESC;

-- =====================================
-- Missing Field Analysis by Date
-- =====================================

-- Track improvement in field coverage over time
SELECT 
  'Coverage Improvement Tracking' as check_type,
  DATE(datetime) as transaction_date,
  COUNT(*) as total_transactions,
  
  -- New field coverage
  ROUND(100.0 * COUNT(machine_status)::numeric / NULLIF(COUNT(*), 0), 1) AS machine_status_pct,
  ROUND(100.0 * COUNT(error_code)::numeric / NULLIF(COUNT(*), 0), 1) AS error_code_pct,
  ROUND(100.0 * COUNT(maintenance_flag)::numeric / NULLIF(COUNT(*), 0), 1) AS maintenance_flag_pct,
  
  -- Environmental field coverage
  ROUND(100.0 * COUNT(temperature)::numeric / NULLIF(COUNT(*), 0), 1) AS temperature_pct,
  ROUND(100.0 * COUNT(humidity)::numeric / NULLIF(COUNT(*), 0), 1) AS humidity_pct
  
FROM transactions
WHERE datetime >= NOW() - INTERVAL '14 days'
GROUP BY DATE(datetime)
ORDER BY transaction_date DESC
LIMIT 14;