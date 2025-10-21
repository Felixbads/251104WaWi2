
-- COMPREHENSIVE FIX: Alle Produkte ohne Gebinde-Informationen
-- Dieses Skript setzt sinnvolle Standard-Werte für alle betroffenen Produkte

BEGIN;

-- 1. Finde und zeige alle betroffenen Produkte
SELECT 
  id, 
  product_name, 
  package_size, 
  package_quantity,
  category
FROM products 
WHERE (package_size IS NULL OR package_size = '' OR package_size = '0')
  AND (package_quantity IS NULL OR package_quantity <= 1)
ORDER BY category, product_name;

-- 2. Setze Standard-Werte basierend auf typischen Kategorien
-- Getränke: Meist 6er oder 24er Gebinde
UPDATE products 
SET 
  package_quantity = CASE 
    WHEN product_name ILIKE '%kasten%' OR product_name ILIKE '%kiste%' THEN 24
    WHEN product_name ILIKE '%6er%' OR product_name ILIKE '%sixpack%' THEN 6
    WHEN product_name ILIKE '%12er%' THEN 12
    ELSE 6  -- Standard für Getränke
  END,
  package_size = CASE 
    WHEN product_name ILIKE '%kasten%' OR product_name ILIKE '%kiste%' THEN '24 Stück'
    WHEN product_name ILIKE '%6er%' OR product_name ILIKE '%sixpack%' THEN '6 Stück'
    WHEN product_name ILIKE '%12er%' THEN '12 Stück'
    ELSE '6 Stück'
  END,
  updated_at = NOW()
WHERE (package_size IS NULL OR package_size = '' OR package_size = '0')
  AND (package_quantity IS NULL OR package_quantity <= 1)
  AND (category ILIKE '%getränk%' OR category ILIKE '%drink%' OR product_name ILIKE '%cola%' OR product_name ILIKE '%fanta%' OR product_name ILIKE '%sprite%');

-- Snacks & Süßwaren: Meist 10er oder 12er Gebinde
UPDATE products 
SET 
  package_quantity = CASE 
    WHEN product_name ILIKE '%riegel%' OR product_name ILIKE '%bar%' THEN 12
    WHEN product_name ILIKE '%chips%' THEN 10
    ELSE 10
  END,
  package_size = CASE 
    WHEN product_name ILIKE '%riegel%' OR product_name ILIKE '%bar%' THEN '12 Stück'
    WHEN product_name ILIKE '%chips%' THEN '10 Stück'
    ELSE '10 Stück'
  END,
  updated_at = NOW()
WHERE (package_size IS NULL OR package_size = '' OR package_size = '0')
  AND (package_quantity IS NULL OR package_quantity <= 1)
  AND (category ILIKE '%snack%' OR category ILIKE '%süß%' OR product_name ILIKE '%schokolade%');

-- Alle anderen Produkte: Standard 1 (Einzelartikel)
UPDATE products 
SET 
  package_quantity = 1,
  package_size = '1 Stück',
  updated_at = NOW()
WHERE (package_size IS NULL OR package_size = '' OR package_size = '0')
  AND (package_quantity IS NULL OR package_quantity <= 1);

-- 3. Verifizierung: Zeige alle aktualisierten Produkte
SELECT 
  id, 
  product_name, 
  package_size, 
  package_quantity,
  category,
  updated_at
FROM products 
WHERE updated_at >= NOW() - INTERVAL '1 minute'
ORDER BY category, product_name;

COMMIT;

-- Statistik nach der Reparatur
SELECT 
  COUNT(*) FILTER (WHERE package_quantity > 1) as products_with_packages,
  COUNT(*) FILTER (WHERE package_quantity = 1) as individual_products,
  COUNT(*) as total_products
FROM products;
