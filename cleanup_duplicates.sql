-- Bereinigungsskript für Produktduplikate
-- 1. Temporäre Tabelle erstellen, um die eindeutigen Produkte zu identifizieren
CREATE TEMP TABLE unique_products AS
SELECT DISTINCT ON (product_name) *
FROM products;

-- 2. Die Inventory-Einträge aktualisieren, um auf die eindeutigen Produkte zu verweisen
UPDATE inventory_items ii
SET product_id = up.id
FROM unique_products up
JOIN products p ON ii.product_id = p.id
WHERE p.product_name = up.product_name
  AND ii.product_id != up.id;

-- 3. Duplikate aus der products-Tabelle löschen, aber nur die, die nicht mehr in inventory_items verwendet werden
DELETE FROM products p
WHERE p.id NOT IN (SELECT DISTINCT product_id FROM inventory_items)
  AND EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.product_name = p.product_name
    AND p2.id != p.id
  );

-- 4. Überprüfung: Anzahl der verbleibenden Produkte
SELECT COUNT(*) AS remaining_products FROM products;

-- 5. Überprüfung: Prüfen, ob noch Duplikate vorhanden sind
SELECT product_name, COUNT(*) AS count
FROM products
GROUP BY product_name
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;