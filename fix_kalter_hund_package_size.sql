
-- Fix package size for Kalter Hund (Product #82)
-- Adjust the package_quantity value according to the actual package size
UPDATE products 
SET 
  package_quantity = 6,  -- Change this to the actual package size
  package_size = '6 Stück',  -- Or '6x150g' or whatever is appropriate
  updated_at = NOW()
WHERE id = 82 
  AND product_name LIKE '%Kalter Hund%';

-- Verify the update
SELECT id, product_name, package_size, package_quantity 
FROM products 
WHERE id = 82;
