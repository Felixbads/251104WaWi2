
-- Find all products without package size information
SELECT 
  id, 
  product_name, 
  package_size, 
  package_quantity,
  category
FROM products 
WHERE (package_size IS NULL OR package_size = '' OR package_size = '0')
  AND (package_quantity IS NULL OR package_quantity <= 1)
ORDER BY product_name;
